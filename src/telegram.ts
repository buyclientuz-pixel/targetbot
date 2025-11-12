import { ensureProjectReport, refreshAllProjects } from "./api/projects";
import { clearMetaStatusCache, loadMetaStatus } from "./api/meta";
import { checkAndRefreshFacebookToken, getFacebookTokenStatus } from "./fb/auth";
import {
  loadProjectCards,
  readProjectConfig,
  writeProjectConfig,
  writeBillingInfo,
  writeAlertsConfig,
  resolvePortalUrl,
  listProjectsWithoutAccount,
  findProjectCard,
  findProjectForAccount,
  hasProjectChat,
} from "./utils/projects";
import {
  sendTelegramMessage,
  editTelegramMessage,
  answerCallbackQuery,
  resolveAdminIds,
} from "./utils/telegram";
import {
  appendLogEntry,
  readJsonFromR2,
  listR2Keys,
  countFallbackEntries,
  deleteFromR2,
  deletePrefixFromR2,
  clearFallbackEntries,
  readCronStatus,
} from "./utils/r2";
import {
  ProjectReport,
  ProjectCard,
  BillingInfo,
  ProjectAlertsConfig,
  WorkerEnv,
  MetaAccountInfo,
  MetaTokenStatus,
  ProjectConfigRecord,
} from "./types";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatFrequency,
  formatDateTime,
  formatDate,
  metaAccountStatusIcon,
} from "./utils/format";
import { escapeHtml } from "./utils/html";
import { readAdminSession, writeAdminSession, clearAdminSession } from "./utils/session";
import type { AdminSessionState } from "./utils/session";
import { getTelegramWebhookStatus } from "./api/manage";
import { resolveAccountSpend, buildChatLabel } from "./utils/accounts";

interface TelegramUser {
  id: number | string;
  username?: string;
}

interface TelegramChat {
  id: number | string;
  type: string;
  title?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  text?: string;
  chat: TelegramChat;
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

const START_MESSAGE = `👋 Привет! Этот бот показывает статистику по рекламе.

Доступные команды:
/help — список команд
/report — текущие показатели
/admin — панель администратора`;

const HELP_MESSAGE = `📋 Команды:
/start — начать
/help — помощь
/report — отчёт
/admin — панель администратора`;

const ADMIN_MENU_MESSAGE = "⚙️ Панель администратора";

const TECH_PANEL_KEYBOARD = {
  inline_keyboard: [
    [{ text: "🧹 Очистить Meta-кэш", callback_data: "admin:tech_action:meta_cache" }],
    [
      { text: "🧺 Очистить cache/", callback_data: "admin:tech_action:clear_prefix" },
      { text: "📝 Другой префикс", callback_data: "admin:tech_prompt:clear_prefix" },
    ],
    [{ text: "🗑️ Очистить отчёт", callback_data: "admin:tech_prompt:clear_report" }],
    [{ text: "🚨 Очистить fallback", callback_data: "admin:tech_action:clear_fallbacks" }],
    [
      { text: "📡 Проверить вебхук", callback_data: "admin:tech_action:webhook" },
      { text: "🔑 Свой токен", callback_data: "admin:tech_prompt:webhook" },
    ],
    [{ text: "⬅️ Главное меню", callback_data: "admin:menu" }],
  ],
};

const REPORT_STALE_THRESHOLD_MS = 30 * 60 * 1000;

type AdminSessionKind =
  | "billing_amount"
  | "billing_date"
  | "alerts_cpa"
  | "alerts_spend"
  | "alerts_moderation"
  | "tech_clear_report"
  | "tech_clear_prefix"
  | "tech_webhook_token"
  | "link_account_chat"
  | "link_account_confirm";

type AdminSession = AdminSessionState & { kind: AdminSessionKind; projectId: string };

const buildSession = (
  kind: AdminSessionKind,
  projectId: string,
  messageId?: number,
  data?: Record<string, unknown>
): AdminSession => ({
  kind,
  projectId,
  messageId,
  createdAt: new Date().toISOString(),
  data,
});

const storeAdminSession = async (
  env: Record<string, unknown>,
  chatId: string,
  session: AdminSession
): Promise<void> => {
  await writeAdminSession(env as any, chatId, session);
};

const promptAdminInput = async (
  env: Record<string, unknown>,
  chatId: string,
  text: string
): Promise<void> => {
  await sendTelegramMessage(env, chatId, text, {
    replyMarkup: { force_reply: true },
  });
};

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
    env.REPORTS_BUCKET || env.R2_BUCKET || env.BOT_BUCKET || env.STORAGE_BUCKET || env.LOGS_BUCKET
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
    indexed.map((item) => ({ id: item.id, name: item.name || item.id })).forEach(add);
  }

  const cards = await loadProjectCards(env);
  if (Array.isArray(cards)) {
    cards.map((card) => ({ id: card.id, name: card.name || card.id })).forEach(add);
  }

  const projects = Array.from(map.values());

  if (!projectSourcesLogEmitted) {
    console.log(
      "Loaded projects from ENV:",
      envProjects.map((project) => project.id).join(", ") || "<empty>"
    );
    console.log(
      "Resolved project list:",
      projects.map((project) => `${project.id}:${project.name}`).join(", ") || "<empty>"
    );
    if (projects.length === 0) {
      console.warn("⚠️ No projects found in ENV or R2.");
    }
    projectSourcesLogEmitted = true;
  }

  return projects;
};

interface AdminMessageContext {
  messageId?: number;
}

type AdminToggleField = "alerts_enabled" | "silent_weekends";

const deliverAdminMessage = async (
  env: Record<string, unknown>,
  chatId: string,
  text: string,
  options: {
    parseMode?: string;
    replyMarkup?: Record<string, unknown>;
    disablePreview?: boolean;
  } = {},
  context: AdminMessageContext = {}
): Promise<void> => {
  if (typeof context.messageId === "number") {
    await editTelegramMessage(env, chatId, context.messageId, text, options);
  } else {
    await sendTelegramMessage(env, chatId, text, options);
  }
};

const buildFacebookStatusLine = (status: MetaTokenStatus | null, timeZone: string): string => {
  if (!status) {
    return "Статус Facebook: ⚪️ неизвестно. Настройте подключение через кнопку ниже.";
  }

  const expiresAt = status.expires_at ? formatDateTime(status.expires_at, timeZone) : null;
  const accountLabel = status.account_name || status.account_id || null;

  if (status.status === "missing") {
    return "Статус Facebook: ⚠️ не подключен. Авторизуйтесь через кнопку ниже.";
  }

  if (status.status === "expired") {
    return "Статус Facebook: ⚠️ токен истёк. Пройдите авторизацию заново.";
  }

  if (!status.ok || status.status === "invalid") {
    const issues = status.issues && status.issues.length ? `: ${status.issues.join("; ")}` : ".";
    return `Статус Facebook: 🚨 требуется внимание${issues}`;
  }

  const icon = status.should_refresh ? "🟡" : "🟢";
  const parts: string[] = [];
  const accountSuffix = accountLabel ? ` — ${accountLabel}` : "";
  parts.push(`${icon} Facebook подключён${accountSuffix}`);
  if (expiresAt) {
    parts.push(`действителен до ${expiresAt}`);
  }
  if (status.should_refresh) {
    parts.push("нужно обновить в ближайшее время");
  }
  return parts.join(", ");
};

const countProjectCampaigns = async (
  env: Record<string, unknown>,
  projects: ProjectCard[]
): Promise<number> => {
  let total = 0;
  for (const project of projects) {
    const summaryCount = project.summary?.active_campaigns;
    if (typeof summaryCount === "number" && Number.isFinite(summaryCount)) {
      total += summaryCount;
      continue;
    }
    try {
      const report = await readJsonFromR2<ProjectReport>(env as any, `reports/${project.id}.json`);
      if (report && Array.isArray(report.campaigns)) {
        total += report.campaigns.length;
      }
    } catch (_error) {
      // ignore campaign count errors
    }
  }
  return total;
};

const loadMetaAccounts = async (env: Record<string, unknown>): Promise<MetaAccountInfo[]> => {
  try {
    const status = await loadMetaStatus(env as WorkerEnv, { useCache: true });
    if (status && Array.isArray(status.accounts)) {
      return status.accounts;
    }
  } catch (error) {
    console.warn("Failed to load Meta accounts", { error: (error as Error).message });
  }
  return [];
};

const sendAdminMenu = async (
  env: Record<string, unknown>,
  chatId: string,
  context: AdminMessageContext = {}
): Promise<void> => {
  let tokenStatus: MetaTokenStatus | null = null;
  try {
    tokenStatus = await getFacebookTokenStatus(env as WorkerEnv);
  } catch (error) {
    console.warn("Failed to load Facebook token status", { error: (error as Error).message });
  }

  const projects = await loadProjectCards(env);
  const accounts = await loadMetaAccounts(env);
  const totalCampaigns = await countProjectCampaigns(env, projects);
  const activeProjects = projects.filter((project) => {
    const status = (project.status || "").toLowerCase();
    return status.includes("active") || status.includes("running");
  }).length;
  const timeZone = getTimeZone(env);

  const statusLine = buildFacebookStatusLine(tokenStatus, timeZone);
  const campaignsText = Number.isFinite(totalCampaigns) ? String(totalCampaigns) : "нет данных";
  const projectSummary = projects.length
    ? `Проекты: ${projects.length}${activeProjects ? ` (активных: ${activeProjects})` : ""} | Кампании: ${campaignsText}`
    : "Проекты: нет данных. Добавьте проекты через панель.";
  const linkedAccounts = accounts.filter((account) => {
    const project = findProjectForAccount(projects, account.id);
    return project && hasProjectChat(project);
  }).length;
  const availableChats = listProjectsWithoutAccount(projects).length;
  const accountSummary = accounts.length
    ? `Рекламные аккаунты: ${linkedAccounts} из ${accounts.length} подключены${availableChats ? ` | свободно: ${availableChats}` : ""}`
    : "Рекламные аккаунты: нет данных.";

  const messageParts = [ADMIN_MENU_MESSAGE, "", statusLine, projectSummary, accountSummary];
  const message = messageParts
    .filter((line) => line !== null && line !== undefined)
    .join("\n")
    .trim();

  const replyMarkup = buildAdminMenuKeyboard(env, {
    connected: Boolean(tokenStatus && tokenStatus.ok && tokenStatus.status === "ok"),
  });
  await deliverAdminMessage(env, chatId, message, { replyMarkup }, context);
};

const sendAdminProjectsOverview = async (
  env: Record<string, unknown>,
  chatId: string,
  context: AdminMessageContext = {}
): Promise<void> => {
  const projects = await loadProjectCards(env);
  if (!projects.length) {
    await deliverAdminMessage(
      env,
      chatId,
      "⚠️ Список проектов пуст. Добавьте проекты через веб-панель или API.",
      {
        replyMarkup: {
          inline_keyboard: [[{ text: "⬅️ Главное меню", callback_data: "admin:menu" }]],
        },
      },
      context
    );
    return;
  }

  const timeZone =
    typeof env.DEFAULT_TZ === "string" && env.DEFAULT_TZ.trim()
      ? env.DEFAULT_TZ.trim()
      : "Asia/Tashkent";
  const limit = Math.min(projects.length, 25);
  const cards: string[] = [];
  const inline_keyboard: Array<Array<Record<string, unknown>>> = [];

  for (let index = 0; index < limit; index += 1) {
    const project = projects[index];
    const icon = adminStatusIcon(project.status);
    const summary = project.summary || null;
    const currency = project.currency || project.billing?.currency || "USD";
    const spendText = formatCurrency(summary?.spend ?? null, currency);
    const leadsText = formatNumber(summary?.leads ?? null);
    const clicksText = formatNumber(summary?.clicks ?? null);
    const ctrText = formatPercent(summary?.ctr ?? null);
    const summaryExtras = summary as Record<string, unknown> | null;
    const rawLastActive =
      summaryExtras && "last_active" in summaryExtras ? summaryExtras.last_active : undefined;
    let lastActivityIso: string | null = null;
    if (typeof rawLastActive === "string") {
      lastActivityIso = rawLastActive;
    } else if (typeof rawLastActive === "number") {
      lastActivityIso = String(rawLastActive);
    } else if (rawLastActive instanceof Date) {
      lastActivityIso = rawLastActive.toISOString();
    }
    if (!lastActivityIso) {
      lastActivityIso = project.updated_at || project.last_sync || null;
    }
    const lastActivity = formatDate(lastActivityIso, timeZone);

    const cardLines = [
      `${icon} <b>${escapeHtml(project.name)}</b>`,
      `💰 Потрачено: ${escapeHtml(spendText)}`,
      `📈 Лиды: ${escapeHtml(leadsText)} | Клики: ${escapeHtml(clicksText)} | CTR: ${escapeHtml(ctrText)}`,
      `📆 Последняя активность: ${escapeHtml(lastActivity)}`,
    ];
    cards.push(cardLines.join("\n"));

    const portalUrl =
      resolvePortalUrl(env, project.id, project.portal_url || undefined) || `/portal/${project.id}`;
    const chatLink =
      project.chat_link ||
      (project.chat_username ? `https://t.me/${project.chat_username.replace(/^@/, "")}` : null);

    const buttonRow: Array<Record<string, unknown>> = [
      { text: "⚙️ Управление", callback_data: `admin:project:${project.id}` },
      { text: "📊 Отчёт", url: portalUrl },
    ];

    if (chatLink) {
      buttonRow.push({ text: "✉️ Чат проекта", url: chatLink });
    } else {
      buttonRow.push({ text: "✉️ Чат проекта", callback_data: `admin:project:${project.id}` });
    }

    inline_keyboard.push(buttonRow);
  }

  if (projects.length > limit) {
    cards.push(
      `Показаны первые ${String(limit)} проектов из ${String(projects.length)}. Остальные доступны в веб-панели.`
    );
  }

  inline_keyboard.push([{ text: "⬅️ Главное меню", callback_data: "admin:menu" }]);

  const header = [
    "📁 Управление проектами",
    "",
    "Просматривайте ключевые показатели и переходите в портал или чат из карточек ниже.",
    "",
  ];

  const message = header.concat(cards).join("\n\n").trim();

  await deliverAdminMessage(
    env,
    chatId,
    message,
    {
      replyMarkup: { inline_keyboard },
      parseMode: "HTML",
      disablePreview: true,
    },
    context
  );
};

const sendAdminAccountsOverview = async (
  env: Record<string, unknown>,
  chatId: string,
  context: AdminMessageContext = {}
): Promise<void> => {
  const projects = await loadProjectCards(env);
  const accounts = await loadMetaAccounts(env);
  if (!accounts.length) {
    await deliverAdminMessage(
      env,
      chatId,
      "⚠️ Аккаунты Facebook не найдены. Проверьте подключение и обновите статус.",
      {
        replyMarkup: {
          inline_keyboard: [[{ text: "⬅️ Главное меню", callback_data: "admin:menu" }]],
        },
      },
      context
    );
    return;
  }

  const cards: string[] = [];
  const inline_keyboard: Array<Array<Record<string, unknown>>> = [];

  for (const account of accounts) {
    const project = findProjectForAccount(projects, account.id);
    const hasChat = project ? hasProjectChat(project) : false;
    const spendInfo = await resolveAccountSpend(env, project);
    const chatLabel = hasChat ? buildChatLabel(project) : null;
    const statusIcon = metaAccountStatusIcon(account.status);
    const spendBadge =
      spendInfo && spendInfo.value !== null
        ? formatCurrency(spendInfo.value, spendInfo.currency)
        : "—";
    const accountLineParts = [
      `${statusIcon} <b>${escapeHtml(account.name)}</b>`,
      chatLabel
        ? `Чат: ${escapeHtml(chatLabel)}`
        : "Чат: <i>не подключён</i>",
      `Расход: ${escapeHtml(spendBadge)}`,
      account.status ? `Статус: ${escapeHtml(account.status)}` : null,
    ].filter(Boolean);
    cards.push(accountLineParts.join("\n"));

    const buttonLabel = chatLabel
      ? `[ ${account.name} | ${chatLabel} ]`
      : `[ ${account.name} | ➕ выбрать чат ]`;
    inline_keyboard.push([
      {
        text: buttonLabel,
        callback_data: project && hasChat ? `admin:project:${project.id}` : `admin:account_link:${account.id}`,
      },
    ]);
  }

  inline_keyboard.push([{ text: "⬅️ Главное меню", callback_data: "admin:menu" }]);

  const header = [
    "👥 Аккаунты",
    "",
    "Нажмите на кампанию, чтобы открыть карточку или подключить чат.",
    "",
  ];

  const message = header.concat(cards).join("\n\n").trim();

  await deliverAdminMessage(
    env,
    chatId,
    message,
    {
      replyMarkup: { inline_keyboard },
      parseMode: "HTML",
      disablePreview: true,
    },
    context
  );
};

const sendAdminAccountChatSelection = async (
  env: Record<string, unknown>,
  chatId: string,
  accountId: string,
  accountName: string,
  context: AdminMessageContext = {}
): Promise<void> => {
  const projects = await loadProjectCards(env);
  const available = listProjectsWithoutAccount(projects);

  if (!available.length) {
    await deliverAdminMessage(
      env,
      chatId,
      "⚠️ Свободных чат-групп не найдено. Добавьте проект и чат через веб-панель и попробуйте снова.",
      {
        replyMarkup: {
          inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "admin:accounts" }]],
        },
      },
      context
    );
    return;
  }

  const buttons = available.map((project) => [
    {
      text: project.name,
      callback_data: `admin:account_choose:${accountId}:${project.id}`,
    },
  ]);

  buttons.push([{ text: "⬅️ Назад", callback_data: "admin:accounts" }]);

  const message = `Подключение <b>${escapeHtml(accountName)}</b> к чату. Выберите чат-группу клиента:`;

  await deliverAdminMessage(
    env,
    chatId,
    message,
    {
      replyMarkup: { inline_keyboard: buttons },
      parseMode: "HTML",
    },
    context
  );
};

const sendAdminAccountConfirmation = async (
  env: Record<string, unknown>,
  chatId: string,
  accountId: string,
  accountName: string,
  project: ProjectCard,
  context: AdminMessageContext = {}
): Promise<void> => {
  const message = `Подвязать <b>${escapeHtml(accountName)}</b> к проекту <b>${escapeHtml(project.name)}</b>?`;

  const inline_keyboard = [
    [
      { text: "🔄 Изменить чат", callback_data: `admin:account_choose:${accountId}` },
      { text: "✅ Подвязать", callback_data: `admin:account_confirm:${accountId}:${project.id}` },
    ],
    [{ text: "⬅️ Отмена", callback_data: "admin:accounts" }],
  ];

  await deliverAdminMessage(
    env,
    chatId,
    message,
    { replyMarkup: { inline_keyboard }, parseMode: "HTML" },
    context
  );
};

const linkAccountToProject = async (
  env: Record<string, unknown>,
  accountId: string,
  accountName: string,
  project: ProjectCard
): Promise<boolean> => {
  const patch = {
    account_id: accountId,
    account_name: accountName,
  };
  const record = await writeProjectConfig(env, project.id, patch);
  if (!record) {
    return false;
  }
  await appendLogEntry(env as any, {
    level: "info",
    message: `Telegram admin linked account ${accountId} to project ${project.id}`,
    timestamp: new Date().toISOString(),
  });
  return true;
};

const formatAdminProjectDetail = (project: ProjectCard, timeZone: string): string => {
  const lines: string[] = [];
  const icon = adminStatusIcon(project.status);
  lines.push(`${icon} <b>${escapeHtml(project.name)}</b>`);
  lines.push(`ID: <code>${escapeHtml(project.id)}</code>`);

  if (project.status) {
    lines.push(`Статус: ${escapeHtml(project.status)}`);
  }

  if (project.account_name) {
    lines.push(`Аккаунт: ${escapeHtml(project.account_name)}`);
  }

  if (project.manager) {
    lines.push(`Менеджер: ${escapeHtml(project.manager)}`);
  }

  const billing = project.billing || {};
  if (billing.amount !== undefined || billing.next_payment || billing.next_payment_date) {
    const amountText = formatCurrency(
      billing.amount ?? null,
      billing.currency || project.currency || "USD"
    );
    const nextPayment = billing.next_payment || billing.next_payment_date || "—";
    lines.push(
      `💳 Оплата: ${escapeHtml(amountText)} | Следующая дата: ${escapeHtml(String(nextPayment))}`
    );
  }

  const alertsEnabled = project.alerts_enabled !== false;
  const silentEnabled = Boolean(project.silent_weekends);
  lines.push(`Алерты: ${alertsEnabled ? "включены" : "выключены"}`);
  lines.push(`Тихие выходные: ${silentEnabled ? "включены" : "выключены"}`);

  if (project.summary) {
    lines.push("", "📊 Текущие показатели:");
    lines.push(
      `• Потрачено: ${escapeHtml(formatCurrency(project.summary.spend, project.currency || "USD"))}`
    );
    lines.push(
      `• Лиды: ${escapeHtml(String(project.summary.leads ?? "—"))} | Клики: ${escapeHtml(String(project.summary.clicks ?? "—"))}`
    );
    lines.push(
      `• CTR: ${escapeHtml(String(project.summary.ctr ?? "—"))} | CPA: ${escapeHtml(formatCurrency(project.summary.cpa, project.currency || "USD"))}`
    );
  } else {
    lines.push("", "Нет свежего отчёта для отображения.");
  }

  const updatedAt = project.updated_at || project.last_sync || null;
  if (updatedAt) {
    lines.push("", `⏱ Обновлено: ${escapeHtml(formatDateTime(updatedAt, timeZone))}`);
  }

  return lines.join("\n");
};

const buildAdminProjectDetailKeyboard = (
  env: Record<string, unknown>,
  project: ProjectCard
): Record<string, unknown> => {
  const rows: Array<Array<Record<string, unknown>>> = [];
  const alertsEnabled = project.alerts_enabled !== false;
  const silentEnabled = Boolean(project.silent_weekends);

  rows.push([
    {
      text: alertsEnabled ? "🔕 Выключить алерты" : "🔔 Включить алерты",
      callback_data: `admin:toggle_alerts:${project.id}`,
    },
    {
      text: silentEnabled ? "🔔 Вернуть уведомления" : "😴 Тихие выходные",
      callback_data: `admin:toggle_silent:${project.id}`,
    },
  ]);

  rows.push([
    { text: "💳 Настроить оплату", callback_data: `admin:billing_menu:${project.id}` },
    { text: "🔔 Настроить алерты", callback_data: `admin:alerts_menu:${project.id}` },
  ]);

  rows.push([{ text: "🔄 Обновить отчёт", callback_data: `admin:refresh_project:${project.id}` }]);

  const portal =
    resolvePortalUrl(env, project.id, project.portal_url || undefined) || `/portal/${project.id}`;
  if (portal) {
    rows.push([{ text: "🌐 Открыть портал", url: portal }]);
  }
  const chatLink = project.chat_link
    ? project.chat_link
    : project.chat_username
      ? `https://t.me/${project.chat_username.replace(/^@/, "")}`
      : null;
  if (chatLink) {
    rows.push([{ text: "💬 Чат проекта", url: chatLink }]);
  }

  rows.push([
    { text: "⬅️ К списку", callback_data: "admin:projects" },
    { text: "🏠 Меню", callback_data: "admin:menu" },
  ]);

  return { inline_keyboard: rows };
};

const sendAdminProjectDetail = async (
  env: Record<string, unknown>,
  chatId: string,
  projectId: string,
  context: AdminMessageContext = {}
): Promise<boolean> => {
  const projects = await loadProjectCards(env);
  const project = projects.find((card) => card.id === projectId);
  if (!project) {
    await deliverAdminMessage(
      env,
      chatId,
      "⚠️ Проект не найден. Обновите список и попробуйте снова.",
      {
        replyMarkup: {
          inline_keyboard: [[{ text: "⬅️ К списку", callback_data: "admin:projects" }]],
        },
      },
      context
    );
    return false;
  }

  const message = formatAdminProjectDetail(project, getTimeZone(env));
  const keyboard = buildAdminProjectDetailKeyboard(env, project);

  await deliverAdminMessage(
    env,
    chatId,
    message,
    { parseMode: "HTML", replyMarkup: keyboard, disablePreview: true },
    context
  );
  return true;
};

const toggleProjectField = async (
  env: Record<string, unknown>,
  projectId: string,
  field: AdminToggleField
): Promise<boolean> => {
  const current = await readProjectConfig(env, projectId);
  const previous =
    current && typeof (current as any)[field] === "boolean"
      ? Boolean((current as any)[field])
      : false;
  const nextValue = !previous;
  const patch: Record<string, unknown> = {};
  (patch as any)[field] = nextValue;
  const record = await writeProjectConfig(env, projectId, patch as any);
  if (!record) {
    throw new Error("Не удалось обновить конфигурацию проекта");
  }
  await appendLogEntry(env as any, {
    level: "info",
    message: `Telegram admin toggled ${field} for ${projectId} => ${String(nextValue)}`,
    timestamp: new Date().toISOString(),
  });
  return nextValue;
};

const buildProjectSelectionKeyboard = (
  projects: ReportProjectOption[]
): Record<string, unknown> => ({
  inline_keyboard: projects.map((project) => [
    { text: project.name, callback_data: `report:${project.id}` },
  ]),
});

const buildRefreshKeyboard = (projectId: string): Record<string, unknown> => ({
  inline_keyboard: [[{ text: "🔁 Обновить данные", callback_data: `refresh:${projectId}` }]],
});

const adminStatusIcon = (status?: string | null): string => {
  const normalized = (status || "").toLowerCase();
  if (!normalized) {
    return "⚪️";
  }
  if (normalized.startsWith("active") || normalized.includes("running")) {
    return "🟢";
  }
  if (
    normalized.includes("pend") ||
    normalized.includes("review") ||
    normalized.includes("moderation")
  ) {
    return "🟡";
  }
  if (
    normalized.includes("pause") ||
    normalized.includes("stop") ||
    normalized.includes("inactive") ||
    normalized.includes("disable") ||
    normalized.includes("off")
  ) {
    return "⚫️";
  }
  return "⚪️";
};

type AccountStatusBucket = "active" | "pending" | "disabled" | "other";

const resolveAccountStatusIndicator = (
  status?: string | null
): { icon: string; bucket: AccountStatusBucket } => {
  const normalized = (status || "").toLowerCase();
  if (!normalized) {
    return { icon: "⚪️", bucket: "other" };
  }
  if (normalized.includes("active")) {
    return { icon: "🟢", bucket: "active" };
  }
  if (
    normalized.includes("pend") ||
    normalized.includes("review") ||
    normalized.includes("moderation") ||
    normalized.includes("processing")
  ) {
    return { icon: "🟡", bucket: "pending" };
  }
  if (
    normalized.includes("disable") ||
    normalized.includes("suspend") ||
    normalized.includes("block") ||
    normalized.includes("close") ||
    normalized.includes("inactive")
  ) {
    return { icon: "⚫️", bucket: "disabled" };
  }
  return { icon: "⚪️", bucket: "other" };
};

const buildOAuthUrl = (env: Record<string, unknown>): string | null => {
  const appId = typeof env.FB_APP_ID === "string" ? env.FB_APP_ID.trim() : "";
  const base = typeof env.WORKER_URL === "string" ? env.WORKER_URL.trim() : "";
  if (!appId || !base) {
    return null;
  }
  const redirectBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const redirectUri = `${redirectBase}/auth/facebook/callback`;
  const url = new URL("https://www.facebook.com/v18.0/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "ads_management,business_management");
  return url.toString();
};

const resolveAdminWebUrl = (env: Record<string, unknown>): string | null => {
  const baseRaw = typeof env.WORKER_URL === "string" ? env.WORKER_URL.trim() : "";
  const base = baseRaw ? baseRaw.replace(/\/$/, "") : "https://th-reports.buyclientuz.workers.dev";
  const keyRaw = typeof env.ADMIN_KEY === "string" ? env.ADMIN_KEY.trim() : "";
  const key = keyRaw || "!Lyas123";
  if (!base) {
    return null;
  }
  return `${base}/admin?key=${encodeURIComponent(key)}`;
};

const buildAdminMenuKeyboard = (
  env: Record<string, unknown>,
  options: { connected?: boolean } = {}
): Record<string, unknown> => {
  const inline_keyboard: Array<Array<Record<string, unknown>>> = [];
  const oauthUrl = buildOAuthUrl(env);
  const adminUrl = resolveAdminWebUrl(env);
  const fbLabel = options.connected ? "🔄 Обновить FB" : "🔗 Авторизация Facebook";
  const fbButton = oauthUrl
    ? { text: fbLabel, url: oauthUrl }
    : { text: fbLabel, callback_data: "admin:fb_auth" };

  inline_keyboard.push([
    fbButton,
    adminUrl
      ? { text: "🌐 Веб-админка", url: adminUrl }
      : { text: "🌐 Веб-админка", callback_data: "admin:menu" },
    { text: "📁 Проекты", callback_data: "admin:projects" },
  ]);

  inline_keyboard.push([
    { text: "👥 Аккаунты", callback_data: "admin:accounts" },
    { text: "💳 Оплаты", callback_data: "admin:billing" },
    { text: "⚙️ Тех.панель", callback_data: "admin:tech" },
  ]);

  return { inline_keyboard };
};

const sendAdminFacebookAuth = async (
  env: Record<string, unknown>,
  chatId: string
): Promise<void> => {
  const url = buildOAuthUrl(env);
  if (!url) {
    await sendTelegramMessage(
      env,
      chatId,
      "⚠️ Укажите WORKER_URL и FB_APP_ID, чтобы сформировать ссылку авторизации Facebook."
    );
    return;
  }
  const redirectBase = typeof env.WORKER_URL === "string" ? env.WORKER_URL.trim() : "";
  const message = `👤 Авторизация Facebook

1. Откройте ссылку: ${url}
2. Подтвердите доступ к рекламе и бизнесу.${
    redirectBase
      ? `
3. После редиректа убедитесь, что страница ${redirectBase.replace(/\/$/, "")}/auth/facebook/callback сообщает об успешном входе.`
      : ""
  }`;
  await sendTelegramMessage(env, chatId, message, { disablePreview: true });
};

const sendAdminFacebookStatus = async (
  env: Record<string, unknown>,
  chatId: string
): Promise<void> => {
  const timeZone =
    typeof env.DEFAULT_TZ === "string" && env.DEFAULT_TZ.trim()
      ? env.DEFAULT_TZ.trim()
      : "Asia/Tashkent";

  try {
    const result = await checkAndRefreshFacebookToken(env as WorkerEnv, { notify: false });
    type MetaStatusPayload = Awaited<ReturnType<typeof loadMetaStatus>>;
    let metaStatus: MetaStatusPayload | null = null;
    let metaStatusError: string | null = null;

    try {
      metaStatus = await loadMetaStatus(env as WorkerEnv, { useCache: true });
    } catch (error) {
      metaStatusError = (error as Error).message || "Не удалось загрузить статус Meta.";
    }

    const status = result.status;
    const refresh = result.refresh;

    if (status.status === "missing") {
      await sendTelegramMessage(
        env,
        chatId,
        "⚠️ Токен не настроен. Пройдите авторизацию через кнопку «Авторизация Facebook»."
      );
      return;
    }

    if (status.status === "expired") {
      await sendTelegramMessage(env, chatId, "⚠️ Токен истёк, требуется повторная авторизация.");
      return;
    }

    if (!status.ok || status.status === "invalid" || status.valid === false) {
      const issues = status.issues && status.issues.length ? `: ${status.issues.join("; ")}` : ".";
      await sendTelegramMessage(env, chatId, `🚨 Ошибка при обращении к Facebook API${issues}`);
      return;
    }

    let expiresAtText: string | null = null;
    if (status.expires_at) {
      expiresAtText = formatDateTime(status.expires_at, timeZone);
    } else if (typeof status.expires_in_hours === "number") {
      const approximateExpiry = new Date(
        Date.now() + status.expires_in_hours * 60 * 60 * 1000
      ).toISOString();
      expiresAtText = formatDateTime(approximateExpiry, timeZone);
    }

    const lines = [
      expiresAtText
        ? `🟢 Facebook-токен активен (действителен до ${expiresAtText})`
        : "🟢 Facebook-токен активен.",
    ];

    if (refresh && typeof refresh === "object") {
      if (refresh.ok) {
        lines.push("🔄 Токен проверен и актуализирован.");
      } else if (refresh.message) {
        lines.push(`⚠️ Не удалось обновить токен: ${refresh.message}`);
      }
    }

    const detailLines: string[] = [];

    if (metaStatus) {
      if (metaStatus.updated_at) {
        detailLines.push(`⏱ Обновлено: ${formatDateTime(metaStatus.updated_at, timeZone)}`);
      }

      const accounts: MetaAccountInfo[] = Array.isArray(metaStatus.accounts)
        ? metaStatus.accounts
        : [];
      if (accounts.length > 0) {
        let activeCount = 0;
        let pendingCount = 0;
        let disabledCount = 0;
        const maxVisible = 5;
        const accountLines: string[] = [];

        accounts.forEach((account) => {
          const indicator = resolveAccountStatusIndicator(account.status);
          if (indicator.bucket === "active") {
            activeCount += 1;
          } else if (indicator.bucket === "pending") {
            pendingCount += 1;
          } else if (indicator.bucket === "disabled") {
            disabledCount += 1;
          }
        });

        detailLines.push(
          `📘 Аккаунты Facebook: ${accounts.length} (🟢 ${String(activeCount)} • 🟡 ${String(pendingCount)} • ⚫️ ${String(disabledCount)})`
        );

        accounts.slice(0, maxVisible).forEach((account) => {
          const indicator = resolveAccountStatusIndicator(account.status);
          const name = account.name || account.id;
          const statusLabel = account.status ? account.status : "статус неизвестен";
          accountLines.push(`${indicator.icon} ${name} — ${statusLabel}`);

          const detailParts: string[] = [];
          if (account.balance !== undefined && account.balance !== null) {
            detailParts.push(
              `Баланс: ${formatCurrency(account.balance, account.currency || "USD")}`
            );
          }
          if (account.spend_cap !== undefined && account.spend_cap !== null) {
            detailParts.push(
              `Лимит: ${formatCurrency(account.spend_cap, account.currency || "USD")}`
            );
          }
          if (account.payment_method) {
            detailParts.push(`Карта: ${account.payment_method}`);
          }
          if (account.last_update) {
            detailParts.push(`Обновлено: ${formatDateTime(account.last_update, timeZone)}`);
          }
          if (detailParts.length) {
            accountLines.push(`   ${detailParts.join(" • ")}`);
          }
          if (Array.isArray(account.issues) && account.issues.length) {
            accountLines.push(`   ⚠️ ${account.issues.join("; ")}`);
          }
        });

        detailLines.push(...accountLines);

        if (accounts.length > maxVisible) {
          detailLines.push(
            `… и ещё ${accounts.length - maxVisible} аккаунтов смотрите в веб-панели.`
          );
        }
      } else {
        detailLines.push("⚠️ Не удалось получить список рекламных аккаунтов.");
      }

      if (metaStatus.cached) {
        detailLines.push("ℹ️ Используются кешированные данные Meta.");
      }
    } else if (metaStatusError) {
      detailLines.push(`⚠️ Не удалось загрузить статус Meta: ${metaStatusError}`);
    }

    if (detailLines.length) {
      lines.push("", ...detailLines);
    }

    await sendTelegramMessage(env, chatId, lines.join("\n"));
  } catch (error) {
    const details = error instanceof Error && error.message ? `: ${error.message}` : ".";
    await sendTelegramMessage(env, chatId, `🚨 Ошибка при обращении к Facebook API${details}`);
  }
};

const sendAdminBillingOverview = async (
  env: Record<string, unknown>,
  chatId: string
): Promise<void> => {
  const projects = await loadProjectCards(env);
  if (projects.length === 0) {
    await sendTelegramMessage(env, chatId, "⚠️ Нет проектов для отображения оплат.");
    return;
  }
  const lines: string[] = ["💳 Оплаты", ""];
  for (const project of projects) {
    const billing = project.billing || {};
    const amount =
      billing.amount !== undefined && billing.amount !== null
        ? formatCurrency(billing.amount, billing.currency || project.currency || "USD")
        : "—";
    const nextPayment = billing.next_payment || billing.next_payment_date || "—";
    const status = billing.status || "неизвестно";
    lines.push(
      `${project.name}
  Следующая оплата: ${nextPayment}
  Сумма: ${amount}
  Статус: ${status}`
    );
  }
  await sendTelegramMessage(env, chatId, lines.join("\n\n"));
};

const buildBillingActionsKeyboard = (projectId: string): Record<string, unknown> => ({
  inline_keyboard: [
    [{ text: "💵 Оплатил сегодня", callback_data: `admin:billing_paid:${projectId}` }],
    [
      { text: "💰 Изменить сумму", callback_data: `admin:billing_amount:${projectId}` },
      { text: "📆 Изменить дату", callback_data: `admin:billing_date:${projectId}` },
    ],
    [
      { text: "✅ Оплачено", callback_data: `admin:billing_status:${projectId}:paid` },
      { text: "⚠️ Требуется оплата", callback_data: `admin:billing_status:${projectId}:due` },
    ],
    [
      { text: "⛔ Просрочено", callback_data: `admin:billing_status:${projectId}:overdue` },
      { text: "🚫 Неактивен", callback_data: `admin:billing_status:${projectId}:inactive` },
    ],
    [{ text: "⬅️ К проекту", callback_data: `admin:project:${projectId}` }],
  ],
});

const sendAdminBillingActions = async (
  env: Record<string, unknown>,
  chatId: string,
  projectId: string
): Promise<void> => {
  const projects = await loadProjectCards(env);
  const project = projects.find((card) => card.id === projectId);
  if (!project) {
    await sendTelegramMessage(env, chatId, "⚠️ Проект не найден. Обновите список проектов.");
    return;
  }

  const billing = project.billing || {};
  const amount =
    billing.amount !== undefined && billing.amount !== null
      ? formatCurrency(billing.amount, billing.currency || project.currency || "USD")
      : "—";
  const nextPayment = billing.next_payment_date || billing.next_payment || "—";
  const lastPayment = billing.last_payment || "—";
  const status = billing.status || "неизвестно";

  const lines: string[] = [
    `💳 Управление оплатой — ${project.name}`,
    `Сумма: ${amount}`,
    `Следующая оплата: ${nextPayment}`,
    `Последняя оплата: ${lastPayment}`,
    `Статус: ${status}`,
  ];

  await sendTelegramMessage(env, chatId, lines.join("\n"), {
    replyMarkup: buildBillingActionsKeyboard(projectId),
  });
};

const buildAlertsActionsKeyboard = (projectId: string): Record<string, unknown> => ({
  inline_keyboard: [
    [{ text: "🎯 Порог CPA", callback_data: `admin:alerts_cpa:${projectId}` }],
    [{ text: "💸 Лимит расходов", callback_data: `admin:alerts_spend:${projectId}` }],
    [{ text: "⏱ Модерация (часы)", callback_data: `admin:alerts_moderation:${projectId}` }],
    [{ text: "⬅️ К проекту", callback_data: `admin:project:${projectId}` }],
  ],
});

const sendAdminAlertsActions = async (
  env: Record<string, unknown>,
  chatId: string,
  projectId: string
): Promise<void> => {
  const projects = await loadProjectCards(env);
  const project = projects.find((card) => card.id === projectId);
  if (!project) {
    await sendTelegramMessage(env, chatId, "⚠️ Проект не найден. Обновите список проектов.");
    return;
  }

  const alerts: ProjectAlertsConfig = project.alerts || {};
  const cpa =
    alerts.cpa_threshold !== undefined && alerts.cpa_threshold !== null
      ? alerts.cpa_threshold
      : "—";
  const spend =
    alerts.spend_limit !== undefined && alerts.spend_limit !== null ? alerts.spend_limit : "—";
  const moderation =
    alerts.moderation_hours !== undefined && alerts.moderation_hours !== null
      ? alerts.moderation_hours
      : "—";

  const lines: string[] = [
    `🔔 Настройка алертов — ${project.name}`,
    `CPA порог: ${cpa}`,
    `Лимит расходов: ${spend}`,
    `Модерация, часов: ${moderation}`,
  ];

  await sendTelegramMessage(env, chatId, lines.join("\n"), {
    replyMarkup: buildAlertsActionsKeyboard(projectId),
  });
};

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

const parseDateInput = (text: string): string | null => {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return trimmed;
  }
  const dotMatch = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dotMatch) {
    return `${dotMatch[3]}-${dotMatch[2]}-${dotMatch[1]}`;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return toIsoDate(parsed);
};

const parseNumberInput = (text: string): number | null => {
  const normalized = text.replace(/[^0-9,.-]+/g, "").replace(/,/g, ".");
  if (!normalized.trim()) {
    return null;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return null;
  }
  return value;
};

const nextBillingDate = (billingDay: number, from: Date = new Date()): string => {
  const day = Math.max(1, Math.min(28, Math.floor(billingDay)));
  const current = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), day));
  if (from.getUTCDate() >= day) {
    current.setUTCMonth(current.getUTCMonth() + 1);
  }
  return toIsoDate(current);
};

const updateBillingRecord = async (
  env: Record<string, unknown>,
  projectId: string,
  patch: BillingInfo,
  message: string
): Promise<BillingInfo | null> => {
  const record = await writeBillingInfo(env, projectId, patch);
  if (record) {
    await appendLogEntry(env as any, {
      level: "info",
      message: `Telegram admin billing update for ${projectId}: ${message}`,
      timestamp: new Date().toISOString(),
    });
  }
  return record;
};

const updateAlertsRecord = async (
  env: Record<string, unknown>,
  projectId: string,
  patch: ProjectAlertsConfig,
  message: string
): Promise<ProjectAlertsConfig | null> => {
  const record = await writeAlertsConfig(env, projectId, patch);
  if (record) {
    await appendLogEntry(env as any, {
      level: "info",
      message: `Telegram admin alerts update for ${projectId}: ${message}`,
      timestamp: new Date().toISOString(),
    });
  }
  return record;
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

const sendAdminTechOverview = async (
  env: Record<string, unknown>,
  chatId: string,
  context: AdminMessageContext = {}
): Promise<void> => {
  const [reportKeys, projectKeys, billingKeys, alertKeys, fallbackCount, cronStatus] =
    await Promise.all([
      listR2Keys(env as any, "reports/"),
      listR2Keys(env as any, "projects/"),
      listR2Keys(env as any, "billing/"),
      listR2Keys(env as any, "alerts/"),
      countFallbackEntries(env as any),
      readCronStatus(env as any).catch(() => ({})),
    ]);

  const lines: string[] = [
    "⚙️ Тех.панель",
    "",
    "R2:",
    `• Отчёты: ${countDistinct(reportKeys, "reports/")}`,
    `• Проекты: ${countDistinct(projectKeys, "projects/")}`,
    `• Оплаты: ${countDistinct(billingKeys, "billing/")}`,
    `• Алерты: ${countDistinct(alertKeys, "alerts/")}`,
  ];

  if (fallbackCount !== null && fallbackCount !== undefined) {
    lines.push(`• Fallback KV: ${fallbackCount}`);
  }

  const cronEntries = cronStatus && typeof cronStatus === "object" ? Object.values(cronStatus) : [];
  if (cronEntries.length > 0) {
    lines.push("", "⏱ Крон-задачи:");
    for (const entry of cronEntries.sort((a, b) => a.job.localeCompare(b.job))) {
      const icon = entry.ok ? "🟢" : "🔴";
      const label =
        entry.job === "meta-token"
          ? "Meta токен"
          : entry.job === "projects-refresh"
            ? "Обновление отчётов"
            : entry.job;
      const runAt =
        entry.last_run && entry.last_run !== "1970-01-01T00:00:00.000Z"
          ? formatDateTime(entry.last_run)
          : "—";
      const lastSuccess =
        entry.last_success && entry.last_success !== "1970-01-01T00:00:00.000Z"
          ? formatDateTime(entry.last_success)
          : null;
      const suffix = lastSuccess ? ` (успех: ${lastSuccess})` : "";
      const message = entry.message ? ` — ${entry.message}` : "";
      const failure =
        entry.failure_count && entry.failure_count > 0 ? ` [${entry.failure_count}× ошибок]` : "";
      lines.push(`• ${icon} ${label}: ${runAt}${suffix}${failure}${message}`);
    }
  }

  const workerUrl = typeof env.WORKER_URL === "string" ? env.WORKER_URL.trim() : "";
  const webhookBase = workerUrl
    ? workerUrl.endsWith("/")
      ? workerUrl.slice(0, -1)
      : workerUrl
    : "";
  if (webhookBase) {
    lines.push("", `Вебхук: ${webhookBase}/manage/telegram/webhook?action=status&token=<token>`);
  }

  lines.push(
    "",
    "Кнопки ниже помогут очистить кэши, удалить отчёты или проверить вебхук без входа в панель."
  );

  await deliverAdminMessage(
    env,
    chatId,
    lines.join("\n"),
    { disablePreview: true, replyMarkup: TECH_PANEL_KEYBOARD },
    context
  );
};

interface TechActionResponse {
  toast: string;
  message?: string;
  alert?: boolean;
}

const runTechAction = async (
  env: Record<string, unknown>,
  action: string,
  extra?: string
): Promise<TechActionResponse> => {
  const timestamp = new Date().toISOString();

  switch (action) {
    case "meta_cache": {
      const cleared = await clearMetaStatusCache(env as any);
      const toast = cleared ? "Meta-кэш очищен" : "Кэш уже пуст";
      const message = cleared
        ? "🧹 Кэш статуса Facebook очищен."
        : "ℹ️ Кэш статуса Facebook уже пуст.";
      await appendLogEntry(env as any, {
        level: "info",
        message: `Telegram admin cleared Meta status cache (result: ${toast})`,
        timestamp,
      });
      return { toast, message };
    }
    case "clear_prefix": {
      const prefix = extra && extra.trim() ? extra.trim() : "cache/";
      const removed = await deletePrefixFromR2(env as any, prefix);
      const message = `🧺 Удалено объектов: ${removed}
Префикс: ${prefix.replace(/\s+/g, " ")}`;
      await appendLogEntry(env as any, {
        level: "info",
        message: `Telegram admin cleared prefix ${prefix} => ${removed}`,
        timestamp,
      });
      return { toast: `Удалено: ${removed}`, message };
    }
    case "clear_fallbacks": {
      const removed = await clearFallbackEntries(env as any);
      if (removed === null) {
        return {
          toast: "Fallback не настроен",
          message: "⚠️ Fallback KV не сконфигурирован",
          alert: true,
        };
      }
      await appendLogEntry(env as any, {
        level: "info",
        message: `Telegram admin cleared fallback entries => ${removed}`,
        timestamp,
      });
      return { toast: `Удалено: ${removed}`, message: `🚨 Fallback очищен: ${removed}` };
    }
    case "clear_report": {
      const projectId = extra && extra.trim();
      if (!projectId) {
        return { toast: "Укажите проект", alert: true };
      }
      const key = `reports/${projectId}.json`;
      const deleted = await deleteFromR2(env as any, key);
      await appendLogEntry(env as any, {
        level: deleted ? "info" : "warn",
        message: `Telegram admin cleared report cache for ${projectId} => ${deleted}`,
        timestamp,
      });
      return deleted
        ? {
            toast: "Отчёт удалён",
            message: `🗑️ Кэш отчёта проекта ${projectId} удалён из R2.`,
          }
        : {
            toast: "Отчёт не найден",
            message: `⚠️ Файл отчёта проекта ${projectId} не найден в R2.`,
            alert: true,
          };
    }
    case "webhook": {
      const status = await getTelegramWebhookStatus(
        env as any,
        extra && extra.trim() ? extra.trim() : undefined
      );
      const token = status.token || "—";
      const lines: string[] = ["📡 Статус вебхука", `Токен: ${token}`];
      if (status.webhook && typeof status.webhook === "object") {
        const webhookInfo = status.webhook as Record<string, unknown>;
        const url = typeof webhookInfo.url === "string" && webhookInfo.url ? webhookInfo.url : "—";
        if (url) {
          lines.push(`URL: ${url}`);
        }
        if (typeof webhookInfo.pending_update_count === "number") {
          lines.push(`В очереди: ${webhookInfo.pending_update_count}`);
        }
      } else if (status.webhook) {
        lines.push(`Ответ: ${String(status.webhook)}`);
      }
      if (!status.ok) {
        const error = status.error || "Неизвестная ошибка";
        lines.push(`Ошибка: ${error}`);
        await appendLogEntry(env as any, {
          level: "warn",
          message: `Telegram admin webhook status error => ${error}`,
          timestamp,
        });
        return {
          toast: error.length > 190 ? `${error.slice(0, 190)}…` : error,
          message: lines.join("\n"),
          alert: true,
        };
      }
      await appendLogEntry(env as any, {
        level: "info",
        message: "Telegram admin checked webhook status",
        timestamp,
      });
      return { toast: "Вебхук OK", message: lines.join("\n") };
    }
    default:
      return { toast: "Неизвестное действие", alert: true };
  }
};

const readProjectReport = async (
  env: Record<string, unknown>,
  projectId: string
): Promise<ProjectReport | null> => {
  return readJsonFromR2<ProjectReport>(env as any, `reports/${projectId}.json`);
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

  lines.push(`📊 <b>${escapeHtml(report.project_name || report.project_id)}</b>`);

  if (report.period_label || report.period) {
    lines.push(`📆 Период: ${escapeHtml((report.period_label || report.period || "").toString())}`);
  }

  lines.push(
    `💰 Потрачено: ${escapeHtml(formatCurrency(summary?.spend ?? null, report.currency))}`
  );
  lines.push(
    `📲 Лиды: ${escapeHtml(formatNumber(summary?.leads ?? null))} | Клики: ${escapeHtml(formatNumber(summary?.clicks ?? null))}`
  );
  lines.push(
    `👁️ Показы: ${escapeHtml(formatNumber(summary?.impressions ?? null))} | Частота: ${escapeHtml(formatFrequency(summary?.frequency ?? null))}`
  );
  lines.push(
    `CPA: ${escapeHtml(formatCurrency(summary?.cpa ?? null, report.currency))} | CPC: ${escapeHtml(formatCurrency(summary?.cpc ?? null, report.currency))} | CTR: ${escapeHtml(formatPercent(summary?.ctr ?? null))}`
  );

  if (
    report.billing &&
    report.billing.days_to_pay !== null &&
    report.billing.days_to_pay !== undefined
  ) {
    lines.push(
      `💳 Дней до оплаты: ${escapeHtml(
        typeof report.billing.days_to_pay === "number"
          ? report.billing.days_to_pay.toString()
          : String(report.billing.days_to_pay || "—")
      )}`
    );
  }

  lines.push("");
  lines.push(`⏱ Обновлено: ${escapeHtml(formatDateTime(report.updated_at, timeZone))}`);

  if (stale) {
    lines.push("⚠️ <b>Данные устарели!</b>");
  }

  return lines.join("\n");
};

const sendProjectReportMessage = async (
  env: Record<string, unknown>,
  chatId: string,
  projectId: string,
  options: { messageId?: number } = {}
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
  options: { messageId?: number } = {}
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
  return `📊 ${report.project_name}
Потрачено: ${formatCurrency(summary.spend, report.currency)}
Лиды: ${formatNumber(summary.leads)} | Клики: ${formatNumber(summary.clicks)}
CTR: \${formatPercent(summary.ctr)} | CPA: \${formatCurrency(summary.cpa, report.currency)}`;
};

const formatCampaignList = (report: ProjectReport, limit = 5): string => {
  const campaigns = report.campaigns.slice(0, limit);
  if (campaigns.length === 0) {
    return "Нет кампаний для отображения";
  }
  const lines = campaigns.map(
    (campaign) =>
      `• ${campaign.name} — ${formatCurrency(campaign.spend, report.currency)} / Лиды: ${formatNumber(campaign.leads)} / CTR: ${formatPercent(campaign.ctr)}`
  );
  return lines.join("\n");
};

const formatTelegramActor = (user?: TelegramUser): string => {
  if (!user) {
    return "unknown";
  }
  if (user.username && user.username.trim()) {
    return `@${user.username.trim()} (${String(user.id)})`;
  }
  return String(user.id);
};

const isGroupChat = (chat: TelegramChat | null | undefined): boolean => {
  if (!chat) {
    return false;
  }
  const type = (chat.type || "").toLowerCase();
  return type === "group" || type === "supergroup";
};

const normalizeChatUsername = (username?: string | null): string | null => {
  if (!username) {
    return null;
  }
  const trimmed = username.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
};

const buildChatLinkFromUsername = (username: string | null): string | null => {
  if (!username) {
    return null;
  }
  const handle = username.replace(/^@/, "");
  if (!handle) {
    return null;
  }
  return `https://t.me/${handle}`;
};

const slugifyProjectName = (value: string): string => {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
};

const sanitizeChatIdForSlug = (chatId: string): string => {
  const digits = chatId.replace(/[^0-9]/g, "");
  if (digits) {
    return digits;
  }
  const hash = chatId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return Math.abs(hash).toString(36);
};

const generateChatProjectId = (
  projects: ProjectCard[],
  chatId: string,
  displayName: string
): string => {
  const used = new Set(projects.map((project) => project.id));
  const fallback = `tg-${sanitizeChatIdForSlug(chatId)}`;
  const baseSlug = slugifyProjectName(displayName) || fallback;
  let candidate = baseSlug;
  let attempt = 2;
  while (used.has(candidate)) {
    candidate = `${baseSlug}-${attempt}`;
    attempt += 1;
  }
  return candidate;
};

const findProjectByChatId = (projects: ProjectCard[], chatId: string): ProjectCard | null => {
  const normalized = chatId.trim();
  if (!normalized) {
    return null;
  }
  return (
    projects.find((project) => {
      if (project.chat_id === null || project.chat_id === undefined) {
        return false;
      }
      return String(project.chat_id).trim() === normalized;
    }) || null
  );
};

const registerChatGroup = async (
  env: Record<string, unknown>,
  chat: TelegramChat,
  actor?: TelegramUser
): Promise<{
  project: ProjectCard;
  created: boolean;
  updatedName: boolean;
  updatedUsername: boolean;
  updatedLink: boolean;
}> => {
  const chatId = String(chat.id);
  const projects = await loadProjectCards(env);
  const existing = findProjectByChatId(projects, chatId);
  const username = normalizeChatUsername(chat.username);
  const chatLink = buildChatLinkFromUsername(username);
  const title = typeof chat.title === "string" && chat.title.trim() ? chat.title.trim() : null;
  const fallbackName = username || `Чат ${chatId.replace(/^-/, "")}`;
  const displayName = title || fallbackName;

  const patch: Partial<ProjectConfigRecord> = {
    chat_id: chatId,
  };

  let updatedName = false;
  if (!existing) {
    patch.name = displayName;
    updatedName = Boolean(displayName);
  } else if (displayName && displayName !== existing.name) {
    const existingName = existing.name ? existing.name.trim() : "";
    const fallbackNames = new Set<string>([
      existing.id,
      fallbackName,
      existing.chat_username || "",
      existing.chat_link || "",
      `ID: ${chatId}`,
    ]);
    if (!existingName || fallbackNames.has(existingName)) {
      patch.name = displayName;
      updatedName = true;
    }
  }

  let updatedUsername = false;
  if (username && (!existing || username !== existing.chat_username)) {
    patch.chat_username = username;
    updatedUsername = true;
  }

  let updatedLink = false;
  if (chatLink && (!existing || chatLink !== existing.chat_link)) {
    patch.chat_link = chatLink;
    updatedLink = true;
  }

  const projectId = existing ? existing.id : generateChatProjectId(projects, chatId, displayName);
  const record = await writeProjectConfig(env, projectId, patch);
  if (!record) {
    throw new Error("Failed to persist chat registration");
  }

  await appendLogEntry(env as any, {
    level: "info",
    message: `Telegram chat ${chatId} registered${existing ? "" : " (new)"} by ${formatTelegramActor(actor)}`,
    timestamp: new Date().toISOString(),
  });

  const project =
    (await findProjectCard(env, projectId)) ||
    ({
      id: projectId,
      name: record.name || projectId,
      chat_id: chatId,
      chat_link: chatLink || null,
      chat_username: username || null,
    } as ProjectCard);

  return {
    project,
    created: !existing,
    updatedName,
    updatedUsername,
    updatedLink,
  };
};

const handleRegisterCommand = async (
  env: Record<string, unknown>,
  message: TelegramMessage
): Promise<void> => {
  const chat = message.chat;
  const chatId = String(chat.id);

  if (!isGroupChat(chat)) {
    await reply(env, chatId, "ℹ️ Команду /reg нужно отправлять в групповом чате, где добавлен бот.");
    return;
  }

  try {
    const result = await registerChatGroup(env, chat, message.from);
    const { project, created, updatedName, updatedUsername, updatedLink } = result;
    const chatLabel = buildChatLabel(project);
    const changes: string[] = [];
    if (!created && (updatedName || updatedUsername || updatedLink)) {
      if (updatedName) {
        changes.push("обновлено название");
      }
      if (updatedUsername || updatedLink) {
        changes.push("обновлены контакты чата");
      }
    }

    const header = created ? "✅ Чат зарегистрирован." : "ℹ️ Чат уже был зарегистрирован.";
    const detailLines = [
      header,
      `ID проекта: <code>${escapeHtml(project.id)}</code>`,
      `Название: <b>${escapeHtml(project.name || project.id)}</b>`,
      chatLabel ? `Чат: ${escapeHtml(chatLabel)}` : null,
      changes.length ? `Обновлено: ${changes.join(", ")}.` : null,
      "Теперь привяжите рекламный аккаунт через /admin → Аккаунты.",
    ].filter(Boolean);

    await reply(env, chatId, detailLines.join("\n"), { parseMode: "HTML", disablePreview: true });
  } catch (error) {
    await appendLogEntry(env as any, {
      level: "error",
      message: `Chat registration failed for ${chatId}: ${(error as Error).message}`,
      timestamp: new Date().toISOString(),
    });
    await reply(
      env,
      chatId,
      "⚠️ Не удалось сохранить регистрацию чата. Проверьте права доступа и повторите попытку позже."
    );
  }
};

const reply = async (
  env: Record<string, unknown>,
  chatId: string,
  text: string,
  options: {
    parseMode?: string;
    replyMarkup?: Record<string, unknown>;
    disablePreview?: boolean;
  } = {}
): Promise<void> => {
  await sendTelegramMessage(env, chatId, text, options);
};

const handleReportCommand = async (
  env: Record<string, unknown>,
  chatId: string,
  args: string[]
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
  projectId: string
): Promise<void> => {
  const report = await ensureProjectReport(env, projectId, { force: false });
  if (!report) {
    await reply(env, chatId, "Проект не найден");
    return;
  }
  const base = typeof env.WORKER_URL === "string" ? env.WORKER_URL.trim() : "";
  const normalizedBase = base ? base.replace(/\/$/, "") : "";
  const portalLink = normalizedBase
    ? `${normalizedBase}/portal/${projectId}`
    : `/portal/${projectId}`;
  const lines = [
    `📄 Детали проекта ${report.project_name}`,
    `Статус: ${report.status || "—"}`,
    `Потрачено: ${formatCurrency(report.summary.spend, report.currency)}`,
    `Лиды: ${formatNumber(report.summary.leads)} / Клики: ${formatNumber(report.summary.clicks)} / Показы: ${formatNumber(report.summary.impressions)}`,
    `CPA: ${formatCurrency(report.summary.cpa, report.currency)} / CPC: ${formatCurrency(report.summary.cpc, report.currency)} / CTR: ${formatPercent(report.summary.ctr)}`,
    `Портал: ${portalLink}`,
  ];
  await reply(env, chatId, lines.join("\n"));
};

const handleCampaignsCommand = async (
  env: Record<string, unknown>,
  chatId: string,
  projectId: string
): Promise<void> => {
  const report = await ensureProjectReport(env, projectId, { force: false });
  if (!report) {
    await reply(env, chatId, "Проект не найден");
    return;
  }
  const list = formatCampaignList(report, 10);
  await reply(
    env,
    chatId,
    `📋 Кампании:
${list}`
  );
};

const handleRefreshCommand = async (
  env: Record<string, unknown>,
  chatId: string,
  projectId: string
): Promise<void> => {
  const report = await ensureProjectReport(env, projectId, { force: true });
  if (!report) {
    await reply(env, chatId, "Не удалось обновить отчёт");
    return;
  }
  await reply(
    env,
    chatId,
    `Данные обновлены
${formatSummary(report)}`
  );
};

const handleAlertSettings = async (env: Record<string, unknown>, chatId: string): Promise<void> => {
  await reply(
    env,
    chatId,
    "Настройка алертов пока доступна из админ-панели. Используйте /alertsettings позже для обновления конфигурации."
  );
};

const handleAdminCallback = async (
  env: Record<string, unknown>,
  callback: TelegramCallbackQuery,
  chatId: string,
  messageId: number
): Promise<boolean> => {
  const data = callback.data || "";
  const parts = data.split(":");
  const action = parts[1] || "";
  const args = parts.slice(2);
  const arg = args[0] || "";
  const extra = args[1] || "";

  if (!action) {
    return false;
  }

  try {
    switch (action) {
      case "fb_auth":
        await sendAdminFacebookAuth(env, chatId);
        await answerCallbackQuery(env, callback.id, { text: "Ссылка отправлена" });
        return true;
      case "fb_status":
        await sendAdminFacebookStatus(env, chatId);
        await answerCallbackQuery(env, callback.id, { text: "Статус обновлён" });
        return true;
      case "projects":
        await sendAdminProjectsOverview(env, chatId, { messageId });
        await answerCallbackQuery(env, callback.id, { text: "Проекты" });
        return true;
      case "accounts":
        await sendAdminAccountsOverview(env, chatId, { messageId });
        await answerCallbackQuery(env, callback.id, { text: "Аккаунты" });
        return true;
      case "account_link": {
        if (!arg) {
          await answerCallbackQuery(env, callback.id, {
            text: "Аккаунт не найден",
            showAlert: true,
          });
          return true;
        }
        const accounts = await loadMetaAccounts(env);
        const account = accounts.find((item) => item.id === arg);
        const accountName = account?.name || arg;
        await storeAdminSession(
          env,
          chatId,
          buildSession("link_account_chat", arg, messageId, { accountName })
        );
        await sendAdminAccountChatSelection(env, chatId, arg, accountName, { messageId });
        await answerCallbackQuery(env, callback.id, { text: "Выберите чат" });
        return true;
      }
      case "account_choose": {
        if (!arg) {
          await answerCallbackQuery(env, callback.id, {
            text: "Аккаунт не найден",
            showAlert: true,
          });
          return true;
        }
        const accountId = arg;
        const projectId = extra || "";
        const session = (await readAdminSession(env as any, chatId)) as AdminSession | null;
        let accountName = accountId;
        if (session && session.kind.startsWith("link_account") && session.projectId === accountId) {
          accountName = (session.data?.accountName as string) || accountName;
        } else {
          const accounts = await loadMetaAccounts(env);
          const account = accounts.find((item) => item.id === accountId);
          accountName = account?.name || accountName;
        }

        if (!projectId) {
          await storeAdminSession(
            env,
            chatId,
            buildSession("link_account_chat", accountId, messageId, { accountName })
          );
          await sendAdminAccountChatSelection(env, chatId, accountId, accountName, { messageId });
          await answerCallbackQuery(env, callback.id, { text: "Выберите чат" });
          return true;
        }

        const projects = await loadProjectCards(env);
        const project = projects.find((item) => item.id === projectId);
        if (!project) {
          await answerCallbackQuery(env, callback.id, {
            text: "Проект не найден",
            showAlert: true,
          });
          return true;
        }

        await storeAdminSession(
          env,
          chatId,
          buildSession("link_account_confirm", accountId, messageId, { accountName, projectId })
        );
        await sendAdminAccountConfirmation(env, chatId, accountId, accountName, project, {
          messageId,
        });
        await answerCallbackQuery(env, callback.id, { text: "Подтвердите подвязку" });
        return true;
      }
      case "account_confirm": {
        if (!arg || !extra) {
          await answerCallbackQuery(env, callback.id, {
            text: "Недостаточно данных",
            showAlert: true,
          });
          return true;
        }
        const accountId = arg;
        const projectId = extra;
        const projects = await loadProjectCards(env);
        const project = projects.find((item) => item.id === projectId);
        if (!project) {
          await answerCallbackQuery(env, callback.id, {
            text: "Проект не найден",
            showAlert: true,
          });
          return true;
        }
        const session = (await readAdminSession(env as any, chatId)) as AdminSession | null;
        const accountName =
          (session && session.kind.startsWith("link_account") && session.projectId === accountId
            ? (session.data?.accountName as string)
            : null) || accountId;
        const success = await linkAccountToProject(env, accountId, accountName, project);
        if (!success) {
          await answerCallbackQuery(env, callback.id, {
            text: "Не удалось подвязать",
            showAlert: true,
          });
          return true;
        }
        await clearAdminSession(env as any, chatId);
        await sendAdminProjectDetail(env, chatId, project.id, { messageId });
        await answerCallbackQuery(env, callback.id, { text: "Аккаунт подключён" });
        return true;
      }
      case "menu":
        await sendAdminMenu(env, chatId, { messageId });
        await answerCallbackQuery(env, callback.id, { text: "Главное меню" });
        return true;
      case "project":
        if (!arg) {
          await answerCallbackQuery(env, callback.id, {
            text: "Проект не найден",
            showAlert: true,
          });
          return true;
        }
        await sendAdminProjectDetail(env, chatId, arg, { messageId });
        await answerCallbackQuery(env, callback.id, { text: "Проект открыт" });
        return true;
      case "toggle_alerts": {
        if (!arg) {
          await answerCallbackQuery(env, callback.id, {
            text: "Проект не найден",
            showAlert: true,
          });
          return true;
        }
        const enabled = await toggleProjectField(env, arg, "alerts_enabled");
        await sendAdminProjectDetail(env, chatId, arg, { messageId });
        await answerCallbackQuery(env, callback.id, {
          text: enabled ? "Алерты включены" : "Алерты выключены",
        });
        return true;
      }
      case "toggle_silent": {
        if (!arg) {
          await answerCallbackQuery(env, callback.id, {
            text: "Проект не найден",
            showAlert: true,
          });
          return true;
        }
        const enabled = await toggleProjectField(env, arg, "silent_weekends");
        await sendAdminProjectDetail(env, chatId, arg, { messageId });
        await answerCallbackQuery(env, callback.id, {
          text: enabled ? "Тихие выходные включены" : "Уведомления вернулись",
        });
        return true;
      }
      case "refresh_project": {
        if (!arg) {
          await answerCallbackQuery(env, callback.id, {
            text: "Проект не найден",
            showAlert: true,
          });
          return true;
        }
        const report = await ensureProjectReport(env, arg, { force: true });
        await appendLogEntry(env as any, {
          level: "info",
          message: `Telegram admin refreshed project ${arg}${report ? "" : " (без отчёта)"}`,
          timestamp: new Date().toISOString(),
        });
        await sendAdminProjectDetail(env, chatId, arg, { messageId });
        await answerCallbackQuery(env, callback.id, { text: "Отчёт обновлён" });
        return true;
      }
      case "billing_menu": {
        if (!arg) {
          await answerCallbackQuery(env, callback.id, {
            text: "Проект не найден",
            showAlert: true,
          });
          return true;
        }
        await sendAdminBillingActions(env, chatId, arg);
        await answerCallbackQuery(env, callback.id, { text: "Оплата" });
        return true;
      }
      case "billing_amount": {
        if (!arg) {
          await answerCallbackQuery(env, callback.id, {
            text: "Проект не найден",
            showAlert: true,
          });
          return true;
        }
        await storeAdminSession(env, chatId, buildSession("billing_amount", arg, messageId));
        await promptAdminInput(env, chatId, `Введите сумму оплаты для ${arg}. Пример: 1200000`);
        await answerCallbackQuery(env, callback.id, { text: "Введите сумму" });
        return true;
      }
      case "billing_date": {
        if (!arg) {
          await answerCallbackQuery(env, callback.id, {
            text: "Проект не найден",
            showAlert: true,
          });
          return true;
        }
        await storeAdminSession(env, chatId, buildSession("billing_date", arg, messageId));
        await promptAdminInput(
          env,
          chatId,
          `Введите дату следующей оплаты для ${arg} (формат YYYY-MM-DD или DD.MM.YYYY)`
        );
        await answerCallbackQuery(env, callback.id, { text: "Введите дату" });
        return true;
      }
      case "billing_paid": {
        if (!arg) {
          await answerCallbackQuery(env, callback.id, {
            text: "Проект не найден",
            showAlert: true,
          });
          return true;
        }
        const today = new Date();
        const cards = await loadProjectCards(env);
        const project = cards.find((card) => card.id === arg);
        const patch: BillingInfo = {
          last_payment: toIsoDate(today),
          status: "paid",
        };
        if (project?.billing_day) {
          const nextDate = nextBillingDate(Number(project.billing_day), today);
          patch.next_payment = nextDate;
          patch.next_payment_date = nextDate;
        }
        const updated = await updateBillingRecord(env, arg, patch, "marked as paid today");
        if (!updated) {
          await answerCallbackQuery(env, callback.id, {
            text: "Ошибка обновления",
            showAlert: true,
          });
          return true;
        }
        await sendAdminProjectDetail(env, chatId, arg, { messageId });
        await answerCallbackQuery(env, callback.id, { text: "Оплата отмечена" });
        return true;
      }
      case "billing_status": {
        if (!arg || !extra) {
          await answerCallbackQuery(env, callback.id, {
            text: "Недостаточно данных",
            showAlert: true,
          });
          return true;
        }
        const updated = await updateBillingRecord(
          env,
          arg,
          { status: extra as BillingInfo["status"] },
          `status => ${extra}`
        );
        if (!updated) {
          await answerCallbackQuery(env, callback.id, {
            text: "Ошибка обновления",
            showAlert: true,
          });
          return true;
        }
        await sendAdminProjectDetail(env, chatId, arg, { messageId });
        await answerCallbackQuery(env, callback.id, { text: "Статус обновлён" });
        return true;
      }
      case "billing":
        await sendAdminBillingOverview(env, chatId);
        await answerCallbackQuery(env, callback.id, { text: "Оплаты" });
        return true;
      case "alerts_menu": {
        if (!arg) {
          await answerCallbackQuery(env, callback.id, {
            text: "Проект не найден",
            showAlert: true,
          });
          return true;
        }
        await sendAdminAlertsActions(env, chatId, arg);
        await answerCallbackQuery(env, callback.id, { text: "Алерты" });
        return true;
      }
      case "alerts_cpa": {
        if (!arg) {
          await answerCallbackQuery(env, callback.id, {
            text: "Проект не найден",
            showAlert: true,
          });
          return true;
        }
        await storeAdminSession(env, chatId, buildSession("alerts_cpa", arg, messageId));
        await promptAdminInput(env, chatId, `Введите порог CPA для ${arg} (число)`);
        await answerCallbackQuery(env, callback.id, { text: "Введите значение" });
        return true;
      }
      case "alerts_spend": {
        if (!arg) {
          await answerCallbackQuery(env, callback.id, {
            text: "Проект не найден",
            showAlert: true,
          });
          return true;
        }
        await storeAdminSession(env, chatId, buildSession("alerts_spend", arg, messageId));
        await promptAdminInput(env, chatId, `Введите лимит расходов для ${arg} (число)`);
        await answerCallbackQuery(env, callback.id, { text: "Введите значение" });
        return true;
      }
      case "alerts_moderation": {
        if (!arg) {
          await answerCallbackQuery(env, callback.id, {
            text: "Проект не найден",
            showAlert: true,
          });
          return true;
        }
        await storeAdminSession(env, chatId, buildSession("alerts_moderation", arg, messageId));
        await promptAdminInput(env, chatId, `Введите порог модерации (часы) для ${arg}`);
        await answerCallbackQuery(env, callback.id, { text: "Введите значение" });
        return true;
      }
      case "tech":
        await sendAdminTechOverview(env, chatId, { messageId });
        await answerCallbackQuery(env, callback.id, { text: "Тех.панель" });
        return true;
      case "tech_action": {
        if (!arg) {
          await answerCallbackQuery(env, callback.id, {
            text: "Неизвестная команда",
            showAlert: true,
          });
          return true;
        }
        const result = await runTechAction(env, arg, extra);
        await sendAdminTechOverview(env, chatId, { messageId });
        const toast = result.toast && result.toast.length > 0 ? result.toast : "Готово";
        await answerCallbackQuery(env, callback.id, {
          text: toast.length > 200 ? toast.slice(0, 200) : toast,
          showAlert: Boolean(result.alert),
        });
        if (result.message) {
          await sendTelegramMessage(env, chatId, result.message, { disablePreview: true });
        }
        return true;
      }
      case "tech_prompt": {
        if (!arg) {
          await answerCallbackQuery(env, callback.id, {
            text: "Команда недоступна",
            showAlert: true,
          });
          return true;
        }
        if (arg === "clear_report") {
          await storeAdminSession(
            env,
            chatId,
            buildSession("tech_clear_report", "__tech__", messageId)
          );
          await promptAdminInput(env, chatId, "Введите ID проекта для удаления отчёта из R2");
          await answerCallbackQuery(env, callback.id, { text: "Введите ID" });
          return true;
        }
        if (arg === "clear_prefix") {
          await storeAdminSession(
            env,
            chatId,
            buildSession("tech_clear_prefix", "__tech__", messageId)
          );
          await promptAdminInput(env, chatId, "Укажите префикс (по умолчанию cache/)");
          await answerCallbackQuery(env, callback.id, { text: "Введите префикс" });
          return true;
        }
        if (arg === "webhook") {
          await storeAdminSession(
            env,
            chatId,
            buildSession("tech_webhook_token", "__tech__", messageId)
          );
          await promptAdminInput(env, chatId, "Укажите токен бота (оставьте пустым для основного)");
          await answerCallbackQuery(env, callback.id, { text: "Введите токен" });
          return true;
        }
        await answerCallbackQuery(env, callback.id, {
          text: "Команда недоступна",
          showAlert: true,
        });
        return true;
      }
      case "refresh_all": {
        const result = await refreshAllProjects(env);
        const count = Array.isArray(result?.refreshed) ? result.refreshed.length : 0;
        await sendTelegramMessage(
          env,
          chatId,
          `🔁 Обновление отчётов завершено. Обновлено проектов: ${count}`
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
      message: `Admin callback error: ${(error as Error).message}`,
      timestamp: new Date().toISOString(),
    });
    await sendTelegramMessage(
      env,
      chatId,
      "⚠️ Не удалось выполнить действие администратора. Попробуйте позже."
    );
    await answerCallbackQuery(env, callback.id, { text: "Ошибка выполнения", showAlert: true });
    return true;
  }
};

const handleCallbackQuery = async (
  env: Record<string, unknown>,
  callback: TelegramCallbackQuery
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
      const handled = await handleAdminCallback(env, callback, chatId, messageId);
      if (!handled) {
        await answerCallbackQuery(env, callback.id, {
          text: "Команда недоступна",
          showAlert: true,
        });
      }
      return;
    }

    await answerCallbackQuery(env, callback.id);
  } catch (error) {
    await appendLogEntry(env as any, {
      level: "error",
      message: `Telegram callback error: ${(error as Error).message}`,
      timestamp: new Date().toISOString(),
    });
    await answerCallbackQuery(env, callback.id, { text: "Произошла ошибка", showAlert: true });
  }
};

const handleAdminSessionInput = async (
  env: Record<string, unknown>,
  chatId: string,
  text: string
): Promise<boolean> => {
  const session = (await readAdminSession(env as any, chatId)) as AdminSession | null;
  if (!session) {
    return false;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    await sendTelegramMessage(env, chatId, "Введите значение или /cancel для отмены.");
    return true;
  }

  if (trimmed.toLowerCase() === "/cancel") {
    await clearAdminSession(env as any, chatId);
    await sendTelegramMessage(env, chatId, "Действие отменено.");
    return true;
  }

  const projects = await loadProjectCards(env);
  const project = projects.find((card) => card.id === session.projectId);
  const currency = project?.billing?.currency || project?.currency || "USD";

  try {
    switch (session.kind) {
      case "billing_amount": {
        const value = parseNumberInput(trimmed);
        if (value === null) {
          await sendTelegramMessage(env, chatId, "Введите числовое значение для суммы.");
          return true;
        }
        const updated = await updateBillingRecord(
          env,
          session.projectId,
          { amount: value },
          `amount => ${value}`
        );
        if (!updated) {
          await sendTelegramMessage(env, chatId, "⚠️ Не удалось обновить сумму. Попробуйте позже.");
          return true;
        }
        await clearAdminSession(env as any, chatId);
        await sendTelegramMessage(
          env,
          chatId,
          `✅ Сумма обновлена: ${formatCurrency(value, currency)}`
        );
        if (session.messageId !== undefined) {
          await sendAdminProjectDetail(env, chatId, session.projectId, {
            messageId: session.messageId,
          });
        }
        return true;
      }
      case "billing_date": {
        const nextDate = parseDateInput(trimmed);
        if (!nextDate) {
          await sendTelegramMessage(
            env,
            chatId,
            "Введите дату в формате YYYY-MM-DD или DD.MM.YYYY."
          );
          return true;
        }
        const updated = await updateBillingRecord(
          env,
          session.projectId,
          { next_payment: nextDate, next_payment_date: nextDate },
          `next_payment => ${nextDate}`
        );
        if (!updated) {
          await sendTelegramMessage(env, chatId, "⚠️ Не удалось обновить дату оплаты.");
          return true;
        }
        await clearAdminSession(env as any, chatId);
        await sendTelegramMessage(env, chatId, `✅ Дата следующей оплаты: ${nextDate}`);
        if (session.messageId !== undefined) {
          await sendAdminProjectDetail(env, chatId, session.projectId, {
            messageId: session.messageId,
          });
        }
        return true;
      }
      case "alerts_cpa": {
        const value = parseNumberInput(trimmed);
        if (value === null) {
          await sendTelegramMessage(env, chatId, "Введите числовой порог CPA.");
          return true;
        }
        const updated = await updateAlertsRecord(
          env,
          session.projectId,
          { cpa_threshold: value },
          `cpa => ${value}`
        );
        if (!updated) {
          await sendTelegramMessage(env, chatId, "⚠️ Не удалось обновить порог CPA.");
          return true;
        }
        await clearAdminSession(env as any, chatId);
        await sendTelegramMessage(env, chatId, `✅ Порог CPA обновлён: ${value}`);
        if (session.messageId !== undefined) {
          await sendAdminProjectDetail(env, chatId, session.projectId, {
            messageId: session.messageId,
          });
        }
        return true;
      }
      case "alerts_spend": {
        const value = parseNumberInput(trimmed);
        if (value === null) {
          await sendTelegramMessage(env, chatId, "Введите числовой лимит расходов.");
          return true;
        }
        const updated = await updateAlertsRecord(
          env,
          session.projectId,
          { spend_limit: value },
          `spend => ${value}`
        );
        if (!updated) {
          await sendTelegramMessage(env, chatId, "⚠️ Не удалось обновить лимит расходов.");
          return true;
        }
        await clearAdminSession(env as any, chatId);
        await sendTelegramMessage(env, chatId, `✅ Лимит расходов обновлён: ${value}`);
        if (session.messageId !== undefined) {
          await sendAdminProjectDetail(env, chatId, session.projectId, {
            messageId: session.messageId,
          });
        }
        return true;
      }
      case "alerts_moderation": {
        const value = parseNumberInput(trimmed);
        if (value === null) {
          await sendTelegramMessage(env, chatId, "Введите количество часов для модерации.");
          return true;
        }
        const updated = await updateAlertsRecord(
          env,
          session.projectId,
          { moderation_hours: value },
          `moderation => ${value}`
        );
        if (!updated) {
          await sendTelegramMessage(env, chatId, "⚠️ Не удалось обновить параметр модерации.");
          return true;
        }
        await clearAdminSession(env as any, chatId);
        await sendTelegramMessage(env, chatId, `✅ Порог модерации обновлён: ${value} ч.`);
        if (session.messageId !== undefined) {
          await sendAdminProjectDetail(env, chatId, session.projectId, {
            messageId: session.messageId,
          });
        }
        return true;
      }
      case "tech_clear_report": {
        const result = await runTechAction(env, "clear_report", trimmed);
        await clearAdminSession(env as any, chatId);
        await sendTelegramMessage(env, chatId, result.message || result.toast || "Готово", {
          disablePreview: true,
        });
        if (session.messageId !== undefined) {
          await sendAdminTechOverview(env, chatId, { messageId: session.messageId });
        }
        return true;
      }
      case "tech_clear_prefix": {
        const prefix = trimmed || "cache/";
        const result = await runTechAction(env, "clear_prefix", prefix);
        await clearAdminSession(env as any, chatId);
        await sendTelegramMessage(env, chatId, result.message || result.toast || "Готово", {
          disablePreview: true,
        });
        if (session.messageId !== undefined) {
          await sendAdminTechOverview(env, chatId, { messageId: session.messageId });
        }
        return true;
      }
      case "tech_webhook_token": {
        const token = trimmed;
        const result = await runTechAction(env, "webhook", token);
        await clearAdminSession(env as any, chatId);
        await sendTelegramMessage(env, chatId, result.message || result.toast || "Готово", {
          disablePreview: true,
        });
        if (session.messageId !== undefined) {
          await sendAdminTechOverview(env, chatId, { messageId: session.messageId });
        }
        return true;
      }
      default:
        return false;
    }
  } catch (error) {
    await appendLogEntry(env as any, {
      level: "error",
      message: `Admin session input failed: ${(error as Error).message}`,
      timestamp: new Date().toISOString(),
    });
    await sendTelegramMessage(env, chatId, "⚠️ Ошибка обработки ввода. Попробуйте позже.");
    await clearAdminSession(env as any, chatId);
    return true;
  }
};

export const handleTelegramWebhook = async (
  request: Request,
  env: Record<string, unknown>
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

  const chatId = String(message.chat.id);
  const adminIds = resolveAdminIds(env);

  if (adminIds.includes(chatId)) {
    const sessionHandled = await handleAdminSessionInput(env, chatId, message.text);
    if (sessionHandled) {
      return new Response("ok");
    }
  }

  const commandData = parseCommand(message.text);

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
          await sendAdminMenu(env, chatId);
        } else {
          await reply(env, chatId, "⛔ У вас нет доступа к админ-панели.");
        }
        break;
      case "/reg":
        await handleRegisterCommand(env, message);
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
      message: `Telegram handler error: ${(error as Error).message}`,
      timestamp: new Date().toISOString(),
    });
    await reply(env, chatId, "Произошла ошибка при обработке команды");
  }

  return new Response("ok");
};
