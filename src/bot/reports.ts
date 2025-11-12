import { BotContext } from "./types";
import { escapeAttribute, escapeHtml } from "../utils/html";
import {
  ReportSessionRecord,
  deleteReportSession,
  loadReportSession,
  saveReportSession,
} from "../utils/storage";
import { createId } from "../utils/ids";
import { sendTelegramMessage, editTelegramMessage, answerCallbackQuery } from "../utils/telegram";
import { generateReport } from "../utils/reports";
import { summarizeProjects, sortProjectSummaries } from "../utils/projects";

const REPORT_SESSION_TTL_MS = 30 * 60 * 1000;

const ensureChatId = (context: BotContext): string | null => {
  if (!context.chatId) {
    console.warn("Report command invoked without chatId", context.update);
    return null;
  }
  return context.chatId;
};

const buildSelectionMessage = (session: ReportSessionRecord) => {
  const header = session.type === "auto" ? "📥 Автоотчёт" : "📝 Краткий отчёт";
  const period = session.filters?.datePreset
    ? session.filters.datePreset
    : session.filters?.since || session.filters?.until || "today";
  const lines: string[] = [];
  lines.push(`<b>${escapeHtml(header)}</b>`);
  lines.push(`Период: <b>${escapeHtml(period)}</b>`);
  lines.push("");
  lines.push("Выберите проекты, которые войдут в отчёт:");
  lines.push("");
  if (!session.projects.length) {
    lines.push("Проекты не найдены — создайте их в веб-панели.");
  } else {
    for (const project of session.projects) {
      const selected = session.projectIds.includes(project.id);
      const prefix = selected ? "✅" : "☑️";
      lines.push(`${prefix} ${escapeHtml(project.name)}`);
    }
  }
  lines.push("");
  lines.push("Кнопка «📥 Сформировать отчёт» создаст запись в разделе Reports и пришлёт сводку в чат.");

  const projectButtons = session.projects.map((project) => ({
    text: `${session.projectIds.includes(project.id) ? "✅" : "☑️"} ${truncateLabel(project.name)}`,
    callback_data: `report:toggle:${session.id}:${project.id}`,
  }));

  const keyboard: { text: string; callback_data?: string; url?: string }[][] = [];
  projectButtons.forEach((button) => {
    keyboard.push([button]);
  });
  if (session.projects.length) {
    keyboard.push([
      { text: "✅ Все", callback_data: `report:select:${session.id}:all` },
      { text: "🚫 Очистить", callback_data: `report:select:${session.id}:none` },
    ]);
  }
  keyboard.push([
    { text: "📥 Сформировать отчёт", callback_data: `report:confirm:${session.id}` },
    { text: "❌ Отмена", callback_data: `report:cancel:${session.id}` },
  ]);
  keyboard.push([{ text: "⬅ В меню", callback_data: "cmd:menu" }]);

  return {
    text: lines.join("\n"),
    replyMarkup: { inline_keyboard: keyboard },
  };
};

const truncateLabel = (label: string, max = 24): string => {
  if (label.length <= max) {
    return label;
  }
  return `${label.slice(0, max - 1)}…`;
};

interface ReportWorkflowOptions {
  projectId?: string;
}

const createSession = async (
  context: BotContext,
  mode: "auto" | "summary",
  options: ReportWorkflowOptions = {},
): Promise<ReportSessionRecord | null> => {
  const chatId = ensureChatId(context);
  if (!chatId) {
    return null;
  }
  const summaries = sortProjectSummaries(await summarizeProjects(context.env));
  if (!summaries.length) {
    await sendTelegramMessage(context.env, {
      chatId,
      threadId: context.threadId,
      text: "Отчёт пока не из чего формировать: добавьте проекты и лиды в веб-панели.",
    });
    return null;
  }
  const now = Date.now();
  const selectedProjectId =
    options.projectId && summaries.some((summary) => summary.id === options.projectId)
      ? options.projectId
      : undefined;

  const session: ReportSessionRecord = {
    id: createId(10),
    chatId,
    userId: context.userId,
    username: context.username,
    type: mode,
    command: mode === "auto" ? "auto_report" : "summary",
    projectIds: selectedProjectId ? [selectedProjectId] : summaries.map((summary) => summary.id),
    projects: summaries.map((summary) => ({ id: summary.id, name: summary.name })),
    filters: { datePreset: "today" },
    title: mode === "auto" ? "Автоотчёт по проектам" : "Сводка по проектам",
    format: mode === "auto" ? "pdf" : "html",
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + REPORT_SESSION_TTL_MS).toISOString(),
  };
  await saveReportSession(context.env, session);
  return session;
};

export const startReportWorkflow = async (
  context: BotContext,
  mode: "auto" | "summary",
  options: ReportWorkflowOptions = {},
): Promise<void> => {
  const session = await createSession(context, mode, options);
  if (!session) {
    return;
  }
  const chatId = session.chatId;
  const { text, replyMarkup } = buildSelectionMessage(session);
  await sendTelegramMessage(context.env, {
    chatId,
    threadId: context.threadId,
    text,
    replyMarkup,
  });
};

const resolveCallback = (data: string): { action: string; sessionId: string; argument?: string } | null => {
  if (!data.startsWith("report:")) {
    return null;
  }
  const parts = data.split(":");
  const [, action, sessionId, argument] = parts;
  if (!action || !sessionId) {
    return null;
  }
  return { action, sessionId, argument };
};

const editSelectionMessage = async (
  context: BotContext,
  session: ReportSessionRecord,
  options: { status?: string },
): Promise<void> => {
  const message = context.update.callback_query?.message;
  if (!message) {
    return;
  }
  const chatId = ensureChatId(context);
  if (!chatId) {
    return;
  }
  const { text, replyMarkup } = buildSelectionMessage(session);
  const statusLine = options.status ? `${text}\n\n<i>${escapeHtml(options.status)}</i>` : text;
  await editTelegramMessage(context.env, {
    chatId,
    messageId: message.message_id,
    text: statusLine,
    replyMarkup,
  });
};

const finalizeSelectionMessage = async (
  context: BotContext,
  text: string,
): Promise<void> => {
  const message = context.update.callback_query?.message;
  const chatId = ensureChatId(context);
  if (!message || !chatId) {
    return;
  }
  await editTelegramMessage(context.env, {
    chatId,
    messageId: message.message_id,
    text,
    replyMarkup: { inline_keyboard: [[{ text: "⬅ В меню", callback_data: "cmd:menu" }]] },
  });
};

type GenerateReportResultType = Awaited<ReturnType<typeof generateReport>>;

const sendReportSummary = async (
  context: BotContext,
  result: GenerateReportResultType,
): Promise<void> => {
  const chatId = ensureChatId(context);
  if (!chatId) {
    return;
  }
  const record = result.record;
  const webUrl =
    context.env.PUBLIC_WEB_URL ||
    context.env.PUBLIC_BASE_URL ||
    context.env.WORKER_BASE_URL ||
    context.env.ADMIN_BASE_URL;
  const footer: string[] = [];
  footer.push(`ID отчёта: <code>${escapeHtml(record.id)}</code>`);
  if (webUrl) {
    footer.push(
      `Откройте <a href="${escapeAttribute(`${webUrl}/admin`)}">веб-панель</a> для скачивания и экспорта.`,
    );
  } else {
    footer.push("Скачать отчёт можно в веб-панели TargetBot.");
  }
  const text = `${result.html}\n\n${footer.join("\n")}`;
  await sendTelegramMessage(context.env, {
    chatId,
    threadId: context.threadId,
    text,
  });
};

export const isReportCallbackData = (data: string | undefined): boolean => {
  return !!data && data.startsWith("report:");
};

export const handleReportCallback = async (context: BotContext, data: string): Promise<boolean> => {
  const parsed = resolveCallback(data);
  if (!parsed) {
    return false;
  }
  const session = await loadReportSession(context.env, parsed.sessionId);
  if (!session) {
    if (context.update.callback_query?.id) {
      await answerCallbackQuery(context.env, context.update.callback_query.id, "Сессия истекла. Запустите команду заново.");
    }
    await finalizeSelectionMessage(context, "Сессия отчёта истекла. Запустите команду заново.");
    return true;
  }
  if (parsed.action === "toggle" && parsed.argument) {
    const exists = session.projectIds.includes(parsed.argument);
    session.projectIds = exists
      ? session.projectIds.filter((id) => id !== parsed.argument)
      : [...session.projectIds, parsed.argument];
    session.updatedAt = new Date().toISOString();
    await saveReportSession(context.env, session);
    await editSelectionMessage(context, session, { status: exists ? "Проект исключён из отчёта." : "Проект добавлен." });
    if (context.update.callback_query?.id) {
      await answerCallbackQuery(context.env, context.update.callback_query.id, exists ? "Исключено" : "Добавлено");
    }
    return true;
  }
  if (parsed.action === "select") {
    if (parsed.argument === "all") {
      session.projectIds = session.projects.map((project) => project.id);
    } else if (parsed.argument === "none") {
      session.projectIds = [];
    }
    session.updatedAt = new Date().toISOString();
    await saveReportSession(context.env, session);
    await editSelectionMessage(context, session, {
      status: parsed.argument === "all" ? "Выбраны все проекты." : "Все проекты сняты. Выберите нужные вручную.",
    });
    if (context.update.callback_query?.id) {
      await answerCallbackQuery(context.env, context.update.callback_query.id, "Обновлено");
    }
    return true;
  }
  if (parsed.action === "cancel") {
    await deleteReportSession(context.env, session.id);
    await finalizeSelectionMessage(context, "Операция отменена. Используйте команду заново при необходимости.");
    if (context.update.callback_query?.id) {
      await answerCallbackQuery(context.env, context.update.callback_query.id, "Отменено");
    }
    return true;
  }
  if (parsed.action === "confirm") {
    if (!session.projectIds.length) {
      if (context.update.callback_query?.id) {
        await answerCallbackQuery(context.env, context.update.callback_query.id, "Выберите хотя бы один проект");
      }
      return true;
    }
    const message = context.update.callback_query?.message;
    const chatId = ensureChatId(context);
    if (message && chatId) {
      await editTelegramMessage(context.env, {
        chatId,
        messageId: message.message_id,
        text: "⏳ Формируем отчёт…",
        replyMarkup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: `report:cancel:${session.id}` }]] },
      });
    }
    try {
      const result = await generateReport(context.env, {
        type: session.type === "auto" ? "detailed" : "summary",
        projectIds: session.projectIds,
        format: session.format === "pdf" ? "pdf" : "html",
        channel: "telegram",
        triggeredBy: context.userId,
        command: session.command,
      });
      await sendReportSummary(context, result);
      await finalizeSelectionMessage(context, "✅ Отчёт сформирован и отправлен в чат.");
      await deleteReportSession(context.env, session.id);
      if (context.update.callback_query?.id) {
        await answerCallbackQuery(context.env, context.update.callback_query.id, "Отчёт готов");
      }
    } catch (error) {
      console.error("Failed to generate report", error);
      await finalizeSelectionMessage(context, "Не удалось сформировать отчёт. Попробуйте позже.");
      if (context.update.callback_query?.id) {
        await answerCallbackQuery(context.env, context.update.callback_query.id, "Ошибка при формировании отчёта");
      }
    }
    return true;
  }
  return false;
};

