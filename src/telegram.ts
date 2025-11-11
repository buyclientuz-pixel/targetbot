import { ensureProjectReport } from "./api/projects";
import { loadProjectCards } from "./utils/projects";
import { sendTelegramMessage } from "./utils/telegram";
import { appendLogEntry } from "./utils/r2";
import { ProjectReport } from "./types";
import { formatCurrency, formatNumber, formatPercent } from "./utils/format";

interface TelegramMessage {
  message_id: number;
  text?: string;
  chat: { id: number | string; type: string };
  from?: { id: number | string; username?: string };
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
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
  const values = new Set<string>();

  if (typeof env.ADMIN_IDS === "string" && env.ADMIN_IDS.trim()) {
    env.ADMIN_IDS
      .split(/[,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((value) => values.add(value));
  }

  if (typeof env.ADMIN_CHAT_ID === "string" && env.ADMIN_CHAT_ID.trim()) {
    values.add(env.ADMIN_CHAT_ID.trim());
  }

  return Array.from(values);
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
  "🔐 Админ-панель:\n" +
  "• Проверить статус Facebook\n" +
  "• Обновить отчёт\n" +
  "• Просмотреть логи";

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

const reply = async (env: Record<string, unknown>, chatId: string, text: string): Promise<void> => {
  await sendTelegramMessage(env, chatId, text);
};

const handleReportCommand = async (
  env: Record<string, unknown>,
  chatId: string,
  args: string[],
): Promise<void> => {
  if (args.length === 0) {
    const projects = await loadProjectCards(env);
    if (projects.length === 0) {
      await reply(env, chatId, "Нет подключенных проектов");
      return;
    }
    const summaries: string[] = [];
    for (const project of projects.slice(0, 5)) {
      const report = await ensureProjectReport(env, project.id, { force: false });
      if (report) {
        summaries.push(formatSummary(report));
      }
    }
    await reply(env, chatId, summaries.join("\n\n"));
    return;
  }

  const projectId = args[0];
  const report = await ensureProjectReport(env, projectId, { force: false });
  if (!report) {
    await reply(env, chatId, "Отчёт по проекту не найден");
    return;
  }
  await reply(env, chatId, formatSummary(report));
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
        if (adminIds.includes(chatId)) {
          await reply(env, chatId, ADMIN_MENU_MESSAGE);
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
