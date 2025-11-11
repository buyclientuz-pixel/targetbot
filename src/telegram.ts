import { ensureProjectReport, refreshAllProjects } from "./api/projects";
import { loadProjectCards } from "./utils/projects";
import { sendTelegramMessage, editTelegramMessage, answerCallbackQuery } from "./utils/telegram";
import { appendLogEntry, readJsonFromR2, listR2Keys, countFallbackEntries } from "./utils/r2";
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

const DEFAULT_ADMIN_ID = "7623982602";

let adminIdsLogEmitted = false;

const getAdminIds = (env: Record<string, unknown>): string[] => {
  const ids: string[] = [];
  const rawAdminIds = typeof env.ADMIN_IDS === "string" ? env.ADMIN_IDS : "";

  if (!adminIdsLogEmitted) {
    if (rawAdminIds) {
      console.log("Loaded ADMIN_IDS:", rawAdminIds);
    } else {
      console.warn("⚠️ ADMIN_IDS missing in environment variables.");
    }
  }

  if (rawAdminIds.trim()) {
    ids.push(
      ...rawAdminIds
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
  }

  if (typeof env.ADMIN_CHAT_ID === "string" && env.ADMIN_CHAT_ID.trim()) {
    ids.push(env.ADMIN_CHAT_ID.trim());
  }

  const uniqueIds = Array.from(new Set(ids.map((value) => value.trim()).filter(Boolean)));

  if (!uniqueIds.includes(DEFAULT_ADMIN_ID)) {
    uniqueIds.push(DEFAULT_ADMIN_ID);
  }

  if (!adminIdsLogEmitted) {
    console.log("Resolved ADMIN_IDS list:", uniqueIds.join(", ") || "<empty>");
    adminIdsLogEmitted = true;
  }

  return uniqueIds;
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
  "Выберите раздел, чтобы открыть быстрые действия:";

const ADMIN_MENU_KEYBOARD = {
  inline_keyboard: [
    [{ text: "👤 Авторизация Facebook", callback_data: "admin:fb_auth" }],
    [{ text: "📁 Проекты", callback_data: "admin:projects" }],
    [{ text: "💳 Оплаты", callback_data: "admin:billing" }],
    [{ text: "⚙️ Тех.панель", callback_data: "admin:tech" }],
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
      const [idPart, namePart] = entry.split(":");
      const id = idPart?.trim();
      const name = namePart?.trim();
      if (!id || !name) {
        return null;
      }
      return { id, name };
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

let projectSourcesLogEmitted = false;

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

  const envProjects = parseProjectsConfig(env.PROJECTS);
  envProjects.forEach(add);

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

  const projects = Array.from(map.values());

  if (!projectSourcesLogEmitted) {
    console.log("Loaded projects from ENV:", envProjects.map((project) => project.id).join(", ") || "<empty>");
    console.log("Resolved project list:", projects.map((project) => project.id + ":" + project.name).join(", ") || "<empty>");
    if (projects.length === 0) {
      console.warn("⚠️ No projects found in ENV or R2.");
    }
    projectSourcesLogEmitted = true;
  }

  return projects;
};

const buildProjectSelectionKeyboard = (projects: ReportProjectOption[]): Record<string, unknown> => ({
  inline_keyboard: projects.map((project) => [
    { text: project.name, callback_data: "report:" + project.id },
  ]),
});

const buildRefreshKeyboard = (projectId: string): Record<string, unknown> => ({
  inline_keyboard: [[{ text: "🔁 Обновить данные", callback_data: "refresh:" + projectId }]],
});

const adminStatusIcon = (status?: string | null): string => {
  const normalized = (status || "").toLowerCase();
  if (normalized.startsWith("active")) {
    return "🟢";
  }
  if (normalized.startsWith("pend") || normalized.includes("review")) {
    return "🟡";
  }
  if (!normalized) {
    return "⚪️";
  }
  if (normalized.includes("pause") || normalized.includes("stop")) {
    return "⚪️";
  }
  return "⚪️";
};

const buildOAuthUrl = (env: Record<string, unknown>): string | null => {
  const appId = typeof env.FB_APP_ID === "string" ? env.FB_APP_ID.trim() : "";
  const base = typeof env.WORKER_URL === "string" ? env.WORKER_URL.trim() : "";
  if (!appId || !base) {
    return null;
  }
  const redirectBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const redirectUri = redirectBase + "/auth/facebook/callback";
  const url = new URL("https://www.facebook.com/v18.0/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "ads_management,business_management");
  return url.toString();
};

const sendAdminFacebookAuth = async (env: Record<string, unknown>, chatId: string): Promise<void> => {
  const url = buildOAuthUrl(env);
  if (!url) {
    await sendTelegramMessage(
      env,
      chatId,
      "⚠️ Укажите WORKER_URL и FB_APP_ID, чтобы сформировать ссылку авторизации Facebook.",
    );
    return;
  }
  const redirectBase = typeof env.WORKER_URL === "string" ? env.WORKER_URL.trim() : "";
  const message =
    "👤 Авторизация Facebook\n\n" +
    "1. Откройте ссылку: " + url +
    "\n2. Подтвердите доступ к рекламе и бизнесу." +
    (redirectBase
      ? "\n3. После редиректа убедитесь, что страница " + redirectBase.replace(/\/$/, "") +
        "/auth/facebook/callback сообщает об успешном входе."
      : "");
  await sendTelegramMessage(env, chatId, message, { disablePreview: true });
};

const sendAdminProjectsOverview = async (env: Record<string, unknown>, chatId: string): Promise<void> => {
  const projects = await loadProjectCards(env);
  if (projects.length === 0) {
    await sendTelegramMessage(env, chatId, "⚠️ Список проектов пуст. Добавьте проекты через панель /admin.");
    return;
  }
  const lines: string[] = ["📁 Проекты", ""];
  for (const project of projects) {
    const icon = adminStatusIcon(project.status);
    const portal = resolvePortalLink(env, project.id, project.portal_url);
    const payment = project.billing?.next_payment || project.billing?.next_payment_date || "—";
    lines.push(
      icon + " " + project.name +
        "\n  Статус: " + (project.status || "—") +
        "\n  Оплата: " + payment +
        "\n  Портал: " + portal,
    );
  }
  await sendTelegramMessage(env, chatId, lines.join("\n\n"), { disablePreview: true });
};

const sendAdminBillingOverview = async (env: Record<string, unknown>, chatId: string): Promise<void> => {
  const projects = await loadProjectCards(env);
  if (projects.length === 0) {
    await sendTelegramMessage(env, chatId, "⚠️ Нет проектов для отображения оплат.");
    return;
  }
  const lines: string[] = ["💳 Оплаты", ""];
  for (const project of projects) {
    const billing = project.billing || {};
    const amount = billing.amount !== undefined && billing.amount !== null
      ? formatCurrency(billing.amount, billing.currency || project.currency || "USD")
      : "—";
    const nextPayment = billing.next_payment || billing.next_payment_date || "—";
    const status = billing.status || "неизвестно";
    lines.push(
      project.name +
        "\n  Следующая оплата: " + nextPayment +
        "\n  Сумма: " + amount +
        "\n  Статус: " + status,
    );
  }
  await sendTelegramMessage(env, chatId, lines.join("\n\n"));
};

const resolvePortalLink = (
  env: Record<string, unknown>,
  projectId: string,
  preferred?: string | null,
): string => {
  if (preferred && preferred.trim()) {
    return preferred;
  }
  const base = typeof env.WORKER_URL === "string" ? env.WORKER_URL.trim() : "";
  if (!base) {
    return "/portal/" + projectId;
  }
  const normalized = base.endsWith("/") ? base.slice(0, -1) : base;
  return normalized + "/portal/" + projectId;
};

const countDistinct = (keys: string[], prefix: string): number => {
  const set = new Set<string>();
  for (const key of keys) {
    if (!key.startsWith(prefix) || !key.endsWith(".json")) {
      continue;
    }
    const trimmed = key.slice(prefix.length).replace(/\.json$/, "");
    if (!trimmed || trimmed.includes("/")) {
      continue;
    }
    if (trimmed === "index" || trimmed === "projects") {
      continue;
    }
    set.add(trimmed);
  }
  return set.size;
};

const sendAdminTechOverview = async (env: Record<string, unknown>, chatId: string): Promise<void> => {
  const [reportKeys, projectKeys, billingKeys, alertKeys, fallbackCount] = await Promise.all([
    listR2Keys(env as any, "reports/"),
    listR2Keys(env as any, "projects/"),
    listR2Keys(env as any, "billing/"),
    listR2Keys(env as any, "alerts/"),
    countFallbackEntries(env as any),
  ]);

  const lines: string[] = [
    "⚙️ Тех.панель",
    "",
    "R2:",
    "• Отчёты: " + countDistinct(reportKeys, "reports/"),
    "• Проекты: " + countDistinct(projectKeys, "projects/"),
    "• Оплаты: " + countDistinct(billingKeys, "billing/"),
    "• Алерты: " + countDistinct(alertKeys, "alerts/"),
  ];

  if (fallbackCount !== null && fallbackCount !== undefined) {
    lines.push("• Fallback KV: " + fallbackCount);
  }

  const workerUrl = typeof env.WORKER_URL === "string" ? env.WORKER_URL.trim() : "";
  const webhookBase = workerUrl ? (workerUrl.endsWith("/") ? workerUrl.slice(0, -1) : workerUrl) : "";
  if (webhookBase) {
    lines.push("", "Вебхук: " + webhookBase + "/manage/telegram/webhook?action=status&token=<token>");
  }

  lines.push(
    "",
    "Для обновления отчётов используйте кнопку \"🔁 Обновить данные\" или команду /refresh <id>.",
  );

  await sendTelegramMessage(env, chatId, lines.join("\n"), { disablePreview: true });
};

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
    const text = "⚠️ Нет подключённых проектов. Проверьте настройки.";
    console.warn("⚠️ Нет подключённых проектов. Проверьте значение PROJECTS и R2 индекс.");
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
      case "fb_auth":
        await sendAdminFacebookAuth(env, chatId);
        await answerCallbackQuery(env, callback.id, { text: "Ссылка отправлена" });
        return true;
      case "projects":
        await sendAdminProjectsOverview(env, chatId);
        await answerCallbackQuery(env, callback.id, { text: "Проекты" });
        return true;
      case "billing":
        await sendAdminBillingOverview(env, chatId);
        await answerCallbackQuery(env, callback.id, { text: "Оплаты" });
        return true;
      case "tech":
        await sendAdminTechOverview(env, chatId);
        await answerCallbackQuery(env, callback.id, { text: "Тех.панель" });
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
