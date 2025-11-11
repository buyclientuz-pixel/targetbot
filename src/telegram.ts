import { ensureProjectReport, refreshAllProjects } from "./api/projects";
import { loadProjectCards } from "./utils/projects";
import { sendTelegramMessage, editTelegramMessage, answerCallbackQuery } from "./utils/telegram";
import { appendLogEntry, readJsonFromR2 } from "./utils/r2";
import { ProjectReport } from "./types";
import { formatCurrency, formatNumber, formatPercent, formatFrequency, formatDateTime } from "./utils/format";
import { escapeHtml } from "./utils/html";

interface TelegramUser {
  id: number | string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  text?: string;
  chat: { id: number | string; type: string };
  from?: TelegramUser;
}

interface TelegramCallbackQuery {
  id: string;
  data?: string;
  from?: TelegramUser;
  message?: TelegramMessage;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

const parseCommand = (text: string): { command: string; args: string[] } | null => {
  if (!text.startsWith("/")) {
    return null;
  }
  const parts = text.trim().split(/\s+/);
  const command = parts[0].split("@")[0].toLowerCase();
  const args = parts.slice(1);
  return { command, args };
};

const getAdminIds = (env: Record<string, unknown>): string[] => {
  const ids: string[] = [];

  if (typeof env.ADMIN_IDS === "string" && env.ADMIN_IDS.trim()) {
    ids.push(
      ...env.ADMIN_IDS
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
  }

  if (typeof env.ADMIN_CHAT_ID === "string" && env.ADMIN_CHAT_ID.trim()) {
    ids.push(env.ADMIN_CHAT_ID.trim());
  }

  return Array.from(new Set(ids));
};

const START_MESSAGE =
  "👋 Привет! Этот бот показывает статистику по рекламе.\n\n" +
  "Доступные команды:\n" +
  "/help — список команд\n" +
  "/report — текущие показатели\n" +
  "/admin — панель администратора";

const HELP_MESSAGE =
  "📋 Команды:\n" +
  "/start — начать\n" +
  "/help — помощь\n" +
  "/report — отчёт\n" +
  "/admin — панель администратора";

const ADMIN_MENU_MESSAGE =
  "⚙️ Панель администратора\n\n" +
  "📊 Отчёты\n" +
  "🔁 Обновить все данные\n" +
  "🧾 Просмотр R2 логов\n" +
  "🚀 Проверить подключение Facebook";

const ADMIN_MENU_KEYBOARD = {
  inline_keyboard: [
    [{ text: "📊 Отчёты", callback_data: "admin:reports" }],
    [{ text: "🔁 Обновить все данные", callback_data: "admin:refresh_all" }],
    [{ text: "🧾 Просмотр R2 логов", callback_data: "admin:logs" }],
    [{ text: "🚀 Проверить подключение Facebook", callback_data: "admin:fb_status" }],
  ],
};

const REPORT_STALE_THRESHOLD_MS = 30 * 60 * 1000;

interface ReportProjectOption {
  id: string;
  name: string;
}

const parseProjectsConfig = (value: unknown): ReportProjectOption[] => {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => {
      const [idPart, ...nameParts] = entry.split(":");
      const id = idPart.trim();
      const name = nameParts.join(":").trim();
      if (!id) {
        return null;
      }
      return { id, name: name || id };
    })
    .filter((entry): entry is ReportProjectOption => Boolean(entry));
};

const hasReportStorage = (env: Record<string, unknown>): boolean =>
  Boolean(
    env.REPORTS_BUCKET || env.R2_BUCKET || env.BOT_BUCKET || env.STORAGE_BUCKET || env.LOGS_BUCKET,
  );

const getTimeZone = (env: Record<string, unknown>): string => {
  if (typeof env.DEFAULT_TZ === "string" && env.DEFAULT_TZ.trim()) {
    return env.DEFAULT_TZ.trim();
  }
  return "Asia/Tashkent";
};

const loadReportProjects = async (env: Record<string, unknown>): Promise<ReportProjectOption[]> => {
  const map = new Map<string, ReportProjectOption>();
  const add = (option: ReportProjectOption | null | undefined): void => {
    if (!option || !option.id) {
      return;
    }
    if (!map.has(option.id)) {
      map.set(option.id, option);
    } else if (!map.get(option.id)?.name && option.name) {
      map.set(option.id, option);
    }
  };

  parseProjectsConfig(env.PROJECTS).forEach(add);

  const indexed = await readJsonFromR2<ReportProjectOption[]>(env as any, "reports/projects.json");
  if (Array.isArray(indexed)) {
    indexed
      .map((item) => ({ id: item.id, name: item.name || item.id }))
      .forEach(add);
  }

  const cards = await loadProjectCards(env);
  if (Array.isArray(cards)) {
    cards
      .map((card) => ({ id: card.id, name: card.name || card.id }))
      .forEach(add);
  }

  return Array.from(map.values());
};

const buildProjectSelectionKeyboard = (projects: ReportProjectOption[]): Record<string, unknown> => ({
  inline_keyboard: projects.map((project) => [
    { text: project.name, callback_data: "report:" + project.id },
  ]),
});

const buildRefreshKeyboard = (projectId: string): Record<string, unknown> => ({
  inline_keyboard: [[{ text: "🔁 Обновить данные", callback_data: "refresh:" + projectId }]],
});

const readProjectReport = async (
  env: Record<string, unknown>,
  projectId: string,
): Promise<ProjectReport | null> => {
  return readJsonFromR2<ProjectReport>(env as any, "reports/" + projectId + ".json");
};

const isReportStale = (report: ProjectReport | null): boolean => {
  if (!report || !report.updated_at) {
    return true;
  }
  const updated = new Date(report.updated_at).getTime();
  if (!Number.isFinite(updated)) {
    return true;
  }
  return Date.now() - updated > REPORT_STALE_THRESHOLD_MS;
};

const formatReportMessage = (report: ProjectReport, timeZone: string, stale: boolean): string => {
  const summary = report.summary;
  const lines: string[] = [];

  lines.push("📊 <b>" + escapeHtml(report.project_name || report.project_id) + "</b>");

  if (report.period_label || report.period) {
    lines.push("📆 Период: " + escapeHtml((report.period_label || report.period || "").toString()));
  }

  lines.push("💰 Потрачено: " + escapeHtml(formatCurrency(summary?.spend ?? null, report.currency)));
  lines.push(
    "📲 Лиды: " +
      escapeHtml(formatNumber(summary?.leads ?? null)) +
      " | Клики: " +
      escapeHtml(formatNumber(summary?.clicks ?? null)),
  );
  lines.push(
    "👁️ Показы: " +
      escapeHtml(formatNumber(summary?.impressions ?? null)) +
      " | Частота: " +
      escapeHtml(formatFrequency(summary?.frequency ?? null)),
  );
  lines.push(
    "CPA: " +
      escapeHtml(formatCurrency(summary?.cpa ?? null, report.currency)) +
      " | CPC: " +
      escapeHtml(formatCurrency(summary?.cpc ?? null, report.currency)) +
      " | CTR: " +
      escapeHtml(formatPercent(summary?.ctr ?? null)),
  );

  if (report.billing && report.billing.days_to_pay !== null && report.billing.days_to_pay !== undefined) {
    lines.push(
      "💳 Дней до оплаты: " +
        escapeHtml(
          typeof report.billing.days_to_pay === "number"
            ? report.billing.days_to_pay.toString()
            : String(report.billing.days_to_pay || "—"),
        ),
    );
  }

  lines.push("");
  lines.push("⏱ Обновлено: " + escapeHtml(formatDateTime(report.updated_at, timeZone)));

  if (stale) {
    lines.push("⚠️ <b>Данные устарели!</b>");
  }

  return lines.join("\n");
};

const sendProjectReportMessage = async (
  env: Record<string, unknown>,
  chatId: string,
  projectId: string,
  options: { messageId?: number } = {},
): Promise<void> => {
  const replyMarkup = buildRefreshKeyboard(projectId);
  const timeZone = getTimeZone(env);

  if (!hasReportStorage(env)) {
    const text = "⚠️ Хранилище временно недоступно.";
    if (typeof options.messageId === "number") {
      await editTelegramMessage(env, chatId, options.messageId, text, { replyMarkup });
    } else {
      await reply(env, chatId, text, { replyMarkup });
    }
    return;
  }

  const report = await readProjectReport(env, projectId);
  if (!report) {
    const text = "⚠️ Не удалось получить отчёт. Попробуйте позже.";
    if (typeof options.messageId === "number") {
      await editTelegramMessage(env, chatId, options.messageId, text, { replyMarkup });
    } else {
      await reply(env, chatId, text, { replyMarkup });
    }
    return;
  }

  const message = formatReportMessage(report, timeZone, isReportStale(report));
  const telegramOptions = { parseMode: "HTML", replyMarkup, disablePreview: true };

  if (typeof options.messageId === "number") {
    await editTelegramMessage(env, chatId, options.messageId, message, telegramOptions);
  } else {
    await sendTelegramMessage(env, chatId, message, telegramOptions);
  }
};

const showProjectSelectionMessage = async (
  env: Record<string, unknown>,
  chatId: string,
  options: { messageId?: number } = {},
): Promise<void> => {
  const projects = await loadReportProjects(env);
  if (projects.length === 0) {
    const text = "Нет подключенных проектов";
    if (typeof options.messageId === "number") {
      await editTelegramMessage(env, chatId, options.messageId, text);
    } else {
      await reply(env, chatId, text);
    }
    return;
  }

  const keyboard = buildProjectSelectionKeyboard(projects);
  const text = "Выберите проект для отчёта:";

  if (typeof options.messageId === "number") {
    await editTelegramMessage(env, chatId, options.messageId, text, { replyMarkup: keyboard });
  } else {
    await sendTelegramMessage(env, chatId, text, { replyMarkup: keyboard });
  }
};

const formatSummary = (report: ProjectReport): string => {
  const summary = report.summary;
  return (
    "📊 " + report.project_name + "\n" +
    "Потрачено: " + formatCurrency(summary.spend, report.currency) + "\n" +
    "Лиды: " + formatNumber(summary.leads) + " | Клики: " + formatNumber(summary.clicks) + "\n" +
    "CTR: " + formatPercent(summary.ctr) + " | CPA: " + formatCurrency(summary.cpa, report.currency)
  );
};

const formatCampaignList = (report: ProjectReport, limit = 5): string => {
  const campaigns = report.campaigns.slice(0, limit);
  if (campaigns.length === 0) {
    return "Нет кампаний для отображения";
  }
  const lines = campaigns.map((campaign) =>
    "• " + campaign.name + " — " + formatCurrency(campaign.spend, report.currency) +
      " / Лиды: " + formatNumber(campaign.leads) +
      " / CTR: " + formatPercent(campaign.ctr),
  );
  return lines.join("\n");
};

const reply = async (
  env: Record<string, unknown>,
  chatId: string,
  text: string,
  options: { parseMode?: string; replyMarkup?: Record<string, unknown>; disablePreview?: boolean } = {},
): Promise<void> => {
  await sendTelegramMessage(env, chatId, text, options);
};

const handleReportCommand = async (
  env: Record<string, unknown>,
  chatId: string,
  args: string[],
): Promise<void> => {
  if (args.length === 0) {
    await showProjectSelectionMessage(env, chatId);
    return;
  }

  const projectId = args[0];
  await sendProjectReportMessage(env, chatId, projectId);
};

const handleProjectCommand = async (
  env: Record<string, unknown>,
  chatId: string,
  projectId: string,
): Promise<void> => {
  const report = await ensureProjectReport(env, projectId, { force: false });
  if (!report) {
    await reply(env, chatId, "Проект не найден");
    return;
  }
  const lines = [
    "📄 Детали проекта " + report.project_name,
    "Статус: " + (report.status || "—"),
    "Потрачено: " + formatCurrency(report.summary.spend, report.currency),
    "Лиды: " + formatNumber(report.summary.leads) +
      " / Клики: " + formatNumber(report.summary.clicks) +
      " / Показы: " + formatNumber(report.summary.impressions),
    "CPA: " + formatCurrency(report.summary.cpa, report.currency) +
      " / CPC: " + formatCurrency(report.summary.cpc, report.currency) +
      " / CTR: " + formatPercent(report.summary.ctr),
    "Портал: " + (env.WORKER_URL ? env.WORKER_URL + "/portal/" + projectId : "/portal/" + projectId),
  ];
  await reply(env, chatId, lines.join("\n"));
};

const handleCampaignsCommand = async (
  env: Record<string, unknown>,
  chatId: string,
  projectId: string,
): Promise<void> => {
  const report = await ensureProjectReport(env, projectId, { force: false });
  if (!report) {
    await reply(env, chatId, "Проект не найден");
    return;
  }
  const list = formatCampaignList(report, 10);
  await reply(env, chatId, "📋 Кампании:\n" + list);
};

const handleRefreshCommand = async (
  env: Record<string, unknown>,
  chatId: string,
  projectId: string,
): Promise<void> => {
  const report = await ensureProjectReport(env, projectId, { force: true });
  if (!report) {
    await reply(env, chatId, "Не удалось обновить отчёт");
    return;
  }
  await reply(env, chatId, "Данные обновлены\n" + formatSummary(report));
};

const handleAlertSettings = async (env: Record<string, unknown>, chatId: string): Promise<void> => {
  await reply(
    env,
    chatId,
    "Настройка алертов пока доступна из админ-панели. Используйте /alertsettings позже для обновления конфигурации.",
  );
};

const handleAdminCallback = async (
  env: Record<string, unknown>,
  callback: TelegramCallbackQuery,
  chatId: string,
): Promise<boolean> => {
  const data = callback.data || "";
  const [, action = ""] = data.split(":");

  if (!action) {
    return false;
  }

  try {
    switch (action) {
      case "reports":
        await sendTelegramMessage(env, chatId, "Откройте портал /admin для просмотра подробных отчётов.");
        await answerCallbackQuery(env, callback.id);
        return true;
      case "refresh_all": {
        const result = await refreshAllProjects(env);
        const count = Array.isArray(result?.refreshed) ? result.refreshed.length : 0;
        await sendTelegramMessage(
          env,
          chatId,
          "🔁 Обновление отчётов завершено. Обновлено проектов: " + count,
        );
        await answerCallbackQuery(env, callback.id, { text: "Обновление выполнено" });
        return true;
      }
      case "logs":
        await sendTelegramMessage(env, chatId, "Логи доступны в панели /admin в разделе Logs.");
        await answerCallbackQuery(env, callback.id);
        return true;
      case "fb_status":
        await sendTelegramMessage(
          env,
          chatId,
          "Статус подключения Facebook доступен в панели /admin → Facebook.",
        );
        await answerCallbackQuery(env, callback.id);
        return true;
      default:
        return false;
    }
  } catch (error) {
    await appendLogEntry(env as any, {
      level: "error",
      message: "Admin callback error: " + (error as Error).message,
      timestamp: new Date().toISOString(),
    });
    await sendTelegramMessage(env, chatId, "⚠️ Не удалось выполнить действие администратора. Попробуйте позже.");
    await answerCallbackQuery(env, callback.id, { text: "Ошибка выполнения", showAlert: true });
    return true;
  }
};

const handleCallbackQuery = async (
  env: Record<string, unknown>,
  callback: TelegramCallbackQuery,
): Promise<void> => {
  const data = callback.data || "";
  const message = callback.message;
  const chatId = message ? String(message.chat.id) : null;
  const messageId = message?.message_id;

  if (!chatId || typeof messageId !== "number") {
    await answerCallbackQuery(env, callback.id);
    return;
  }

  try {
    if (data === "report_menu") {
      await showProjectSelectionMessage(env, chatId, { messageId });
      await answerCallbackQuery(env, callback.id);
      return;
    }

    if (data.startsWith("report:")) {
      const projectId = data.split(":", 2)[1];
      if (projectId) {
        await sendProjectReportMessage(env, chatId, projectId, { messageId });
        await answerCallbackQuery(env, callback.id);
      } else {
        await answerCallbackQuery(env, callback.id, { text: "Проект не найден", showAlert: true });
      }
      return;
    }

    if (data.startsWith("refresh:")) {
      const projectId = data.split(":", 2)[1];
      if (projectId) {
        await sendProjectReportMessage(env, chatId, projectId, { messageId });
        await answerCallbackQuery(env, callback.id, { text: "Данные обновлены" });
      } else {
        await answerCallbackQuery(env, callback.id, { text: "Проект не найден", showAlert: true });
      }
      return;
    }

    if (data.startsWith("admin:")) {
      const handled = await handleAdminCallback(env, callback, chatId);
      if (!handled) {
        await answerCallbackQuery(env, callback.id, { text: "Команда недоступна", showAlert: true });
      }
      return;
    }

    await answerCallbackQuery(env, callback.id);
  } catch (error) {
    await appendLogEntry(env as any, {
      level: "error",
      message: "Telegram callback error: " + (error as Error).message,
      timestamp: new Date().toISOString(),
    });
    await answerCallbackQuery(env, callback.id, { text: "Произошла ошибка", showAlert: true });
  }
};

export const handleTelegramWebhook = async (
  request: Request,
  env: Record<string, unknown>,
): Promise<Response> => {
  let update: TelegramUpdate | null = null;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch (_error) {
    return new Response("bad request", { status: 400 });
  }

  if (update) {
    try {
      console.log("telegram update", JSON.stringify(update));
    } catch (_error) {
      console.log("telegram update received");
    }
  }

  if (update && update.callback_query) {
    await handleCallbackQuery(env, update.callback_query);
    return new Response("ok");
  }

  const message = update && update.message;
  if (!message || !message.text) {
    return new Response("ok");
  }

  const commandData = parseCommand(message.text);
  const chatId = String(message.chat.id);
  const adminIds = getAdminIds(env);

  if (!commandData) {
    return new Response("ok");
  }

  try {
    switch (commandData.command) {
      case "/start":
        await reply(env, chatId, START_MESSAGE);
        break;
      case "/help":
        await reply(env, chatId, HELP_MESSAGE);
        break;
      case "/admin":
        console.log("Admin check:", { chatId, ADMIN_IDS: adminIds });
        if (adminIds.includes(chatId)) {
          await reply(env, chatId, ADMIN_MENU_MESSAGE, { replyMarkup: ADMIN_MENU_KEYBOARD });
        } else {
          await reply(env, chatId, "⛔ У вас нет доступа к админ-панели.");
        }
        break;
      case "/report":
        await handleReportCommand(env, chatId, commandData.args);
        break;
      case "/project":
        if (!commandData.args[0]) {
          await reply(env, chatId, "Укажите ID проекта: /project <id>");
        } else {
          await handleProjectCommand(env, chatId, commandData.args[0]);
        }
        break;
      case "/campaigns":
        if (!commandData.args[0]) {
          await reply(env, chatId, "Укажите ID проекта: /campaigns <id>");
        } else {
          await handleCampaignsCommand(env, chatId, commandData.args[0]);
        }
        break;
      case "/refresh":
        if (!commandData.args[0]) {
          await reply(env, chatId, "Укажите ID проекта: /refresh <id>");
        } else {
          await handleRefreshCommand(env, chatId, commandData.args[0]);
        }
        break;
      case "/alertsettings":
        await handleAlertSettings(env, chatId);
        break;
      default:
        await reply(env, chatId, "Команда не поддерживается");
        break;
    }
  } catch (error) {
    await appendLogEntry(env as any, {
      level: "error",
      message: "Telegram handler error: " + (error as Error).message,
      timestamp: new Date().toISOString(),
    });
    await reply(env, chatId, "Произошла ошибка при обработке команды");
  }

  return new Response("ok");
};
