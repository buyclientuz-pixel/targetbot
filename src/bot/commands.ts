import { BotContext } from "./types";
import { sendMainMenu } from "./menu";
import { appendQueryParameter, buildAuthState, resolveAuthUrl, resolveManageWebhookUrl } from "./environment";
import { startReportWorkflow } from "./reports";
import { escapeAttribute, escapeHtml } from "../utils/html";
import {
  summarizeProjects,
  sortProjectSummaries,
  extractProjectSettings,
  applyProjectSettingsPatch,
  applyProjectReportPreferencesPatch,
  DEFAULT_PROJECT_SETTINGS,
} from "../utils/projects";
import {
  appendCommandLog,
  clearLeadReminder,
  clearPendingBillingOperation,
  clearPendingMetaLink,
  clearPendingUserOperation,
  clearPendingPortalOperation,
  clearPendingCampaignSelection,
  clearPendingProjectEditOperation,
  listChatRegistrations,
  listMetaAccountLinks,
  listLeads,
  listPayments,
  listProjects,
  listTelegramGroupLinks,
  listUsers,
  loadMetaToken,
  loadPendingMetaLink,
  loadPendingBillingOperation,
  loadPendingPortalOperation,
  loadPendingCampaignSelection,
  loadPendingProjectEditOperation,
  saveChatRegistrations,
  saveMetaAccountLinks,
  savePendingMetaLink,
  savePendingBillingOperation,
  savePendingProjectEditOperation,
  deleteProjectCascade,
  saveProjects,
  saveLeads,
  saveTelegramGroupLinks,
  saveUsers,
  loadProject,
  loadPendingUserOperation,
  savePendingUserOperation,
  savePendingPortalOperation,
  savePendingCampaignSelection,
  loadPortalByProjectId,
  savePortalRecord,
  getReportAsset,
  MetaLinkFlow,
  PendingMetaLinkState,
  updateProjectRecord,
  clearPaymentReminder,
  loadProjectSettingsRecord,
  saveProjectSettingsRecord,
} from "../utils/storage";
import { createId } from "../utils/ids";
import { answerCallbackQuery, editTelegramMessage, sendTelegramMessage, sendTelegramDocument } from "../utils/telegram";
import {
  fetchAdAccounts,
  fetchCampaigns,
  resolveMetaStatus,
  updateCampaignStatuses,
  withMetaSettings,
} from "../utils/meta";
import { generateReport } from "../utils/reports";
import { KPI_LABELS, syncCampaignObjectives } from "../utils/kpi";
import { resolveChatLink } from "../utils/chat-links";
import { mergeMetaAccountLinks } from "../utils/meta-accounts";
import {
  ChatRegistrationRecord,
  LeadRecord,
  MetaAccountLinkRecord,
  MetaAdAccount,
  MetaCampaign,
  PortalMetricKey,
  PortalMode,
  ProjectPortalRecord,
  PaymentRecord,
  ProjectDeletionSummary,
  ProjectRecord,
  ProjectSummary,
  ProjectBillingState,
  ProjectSettings,
  ProjectReportFrequency,
  ProjectReportPreferences,
  ProjectSettingsRecord,
  ReportRoutingTarget,
  TelegramGroupLinkRecord,
  UserRecord,
  UserRole,
} from "../types";
import { calculateLeadAnalytics } from "../utils/analytics";
import { createSlaReport } from "../utils/sla";

const buildAbsoluteUrl = (value: string | null | undefined, path: string): string | null => {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    url.pathname = path;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch (error) {
    console.warn("Failed to build url", value, path, error);
    return null;
  }
};

const resolvePortalUrl = (env: BotContext["env"], portalId: string | null | undefined): string | null => {
  if (!portalId) {
    return null;
  }
  const path = `/portal/${encodeURIComponent(portalId)}`;
  const candidates: unknown[] = [
    env.PORTAL_BASE_URL,
    env.PUBLIC_WEB_URL,
    env.PUBLIC_BASE_URL,
    env.WORKER_BASE_URL,
    env.ADMIN_BASE_URL,
  ];

  const authDerivedBase = (() => {
    try {
      const authUrl = resolveAuthUrl(env);
      if (!authUrl) {
        return null;
      }
      const auth = new URL(authUrl);
      auth.pathname = auth.pathname.replace(/\/?auth\/facebook\/?$/i, "");
      auth.search = "";
      auth.hash = "";
      return auth.toString();
    } catch (error) {
      console.warn("Failed to derive portal base from auth url", error);
      return null;
    }
  })();

  if (authDerivedBase) {
    candidates.push(authDerivedBase);
  }

  const FALLBACK_PORTAL_BASE = "https://th-reports.buyclientuz.workers.dev";
  candidates.push(FALLBACK_PORTAL_BASE);

  for (const candidate of candidates) {
    const url = buildAbsoluteUrl(typeof candidate === "string" ? candidate : null, path);
    if (url) {
      return url;
    }
  }
  return null;
};

const resolveAdminProjectUrl = (env: BotContext["env"], projectId: string): string | null => {
  const path = `/admin/projects/${encodeURIComponent(projectId)}`;
  const candidates = [
    env.ADMIN_BASE_URL,
    env.PUBLIC_WEB_URL,
    env.PUBLIC_BASE_URL,
    env.WORKER_BASE_URL,
  ];
  for (const candidate of candidates) {
    const url = buildAbsoluteUrl(typeof candidate === "string" ? candidate : null, path);
    if (url) {
      return url;
    }
  }
  return null;
};

const HOME_MARKUP = {
  inline_keyboard: [[{ text: "⬅ Назад", callback_data: "cmd:menu" }]],
};

const DEFAULT_PORTAL_METRICS: PortalMetricKey[] = [
  "leads_total",
  "leads_new",
  "leads_done",
  "spend",
  "impressions",
  "clicks",
];

const PORTAL_METRIC_LABELS: Record<PortalMetricKey, string> = { ...KPI_LABELS };

const REPORT_PERIODS = [
  { key: "today", label: "Сегодня", datePreset: "today" },
  { key: "yesterday", label: "Вчера", datePreset: "yesterday" },
  { key: "7d", label: "Неделя", datePreset: "last_7d" },
  { key: "30d", label: "Месяц", datePreset: "last_30d" },
  { key: "lifetime", label: "Вся история", datePreset: "lifetime" },
] as const;

type ReportPeriodKey = (typeof REPORT_PERIODS)[number]["key"];

const resolveReportPeriod = (key: string): (typeof REPORT_PERIODS)[number] => {
  return REPORT_PERIODS.find((period) => period.key === key) ?? REPORT_PERIODS[0];
};

const resolveReportLink = (env: BotContext["env"], reportId: string): string => {
  const candidates = [env.PUBLIC_WEB_URL, env.PUBLIC_BASE_URL, env.WORKER_BASE_URL, env.ADMIN_BASE_URL];
  const resolved = candidates.find((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (resolved) {
    const normalized = resolved.endsWith("/") ? resolved.slice(0, -1) : resolved;
    return `${normalized}/api/reports/${reportId}/content`;
  }
  return `/api/reports/${reportId}/content`;
};

const buildSettingsMarkup = (env: BotContext["env"]) => {
  const webhookUrl = resolveManageWebhookUrl(env);
  const webhookButton = webhookUrl
    ? { text: "🔄 Обновить вебхуки", url: webhookUrl }
    : { text: "🔄 Обновить вебхуки", callback_data: "cmd:webhooks" };
  return {
    inline_keyboard: [
      [webhookButton, { text: "🧩 Проверить токен Meta", callback_data: "cmd:auth" }],
      [{ text: "⬅ Назад", callback_data: "cmd:menu" }],
    ],
  };
};

const COMMAND_ALIASES: Record<string, string> = {
  "/start": "menu",
  "/menu": "menu",
  "меню": "menu",
  "🏠 главное меню": "menu",
  "cmd:menu": "menu",
  "cmd:auth": "auth",
  "cmd:projects": "projects",
  "cmd:users": "users",
  "cmd:meta": "meta",
  "cmd:analytics": "analytics",
  "cmd:finance": "finance",
  "cmd:settings": "settings",
  "🔐 авторизация facebook": "auth",
  "📊 проекты": "projects",
  "👥 пользователи": "users",
  "🔗 meta-аккаунты": "meta",
  "📈 аналитика": "analytics",
  "💰 финансы": "finance",
  "⚙ настройки": "settings",
  "cmd:webhooks": "webhooks",
  "🔄 обновить вебхуки": "webhooks",
  "/reg": "register_chat",
  "reg": "register_chat",
  "рег": "register_chat",
  "регистрация": "register_chat",
  "/auto_report": "auto_report",
  "автоотчёт": "auto_report",
  "автоотчет": "auto_report",
  "cmd:auto_report": "auto_report",
  "/summary": "summary_report",
  "summary": "summary_report",
  "краткий отчёт": "summary_report",
  "cmd:summary": "summary_report",
};

const formatDateTime = (value?: string): string => {
  if (!value) {
    return "—";
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return escapeHtml(value);
  }
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
};

const formatDate = (value?: string): string => {
  if (!value) {
    return "—";
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return escapeHtml(value);
  }
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
};

const ensureChatId = (context: BotContext): string | null => {
  if (!context.chatId) {
    console.warn("telegram command invoked without chatId", context.update);
    return null;
  }
  return context.chatId;
};

const resolveOperatorId = (context: BotContext): string | null => {
  if (context.userId) {
    return context.userId;
  }
  if (context.chatId) {
    return context.chatId;
  }
  return null;
};

const sendMessage = async (
  context: BotContext,
  text: string,
  options: { replyMarkup?: unknown } = {},
): Promise<void> => {
  const chatId = ensureChatId(context);
  if (!chatId) {
    return;
  }
  const replyMarkup = options.replyMarkup ?? HOME_MARKUP;
  if (context.update.callback_query?.message && typeof context.messageId === "number") {
    await editTelegramMessage(context.env, {
      chatId,
      messageId: context.messageId,
      text,
      replyMarkup,
    });
    return;
  }
  await sendTelegramMessage(context.env, {
    chatId,
    threadId: context.threadId,
    text,
    replyMarkup,
  });
};

const sendPlainMessage = async (context: BotContext, text: string): Promise<void> => {
  const chatId = ensureChatId(context);
  if (!chatId) {
    return;
  }
  await sendTelegramMessage(context.env, {
    chatId,
    threadId: context.threadId,
    text,
  });
};

const AUTO_REPORT_TIME_OPTIONS = ["10:00", "13:00", "15:00", "20:00"] as const;

const ROUTE_TARGETS: ReportRoutingTarget[] = ["chat", "admin", "both", "none"];

const REPORT_ROUTE_LABEL: Record<ReportRoutingTarget, string> = {
  chat: "В чат",
  admin: "Админу",
  both: "В чат и админу",
  none: "Не отправлять",
};

const REPORT_ROUTE_SUMMARY: Record<ReportRoutingTarget, string> = {
  chat: "в чат",
  admin: "админу",
  both: "в чат и админу",
  none: "без отправки",
};

const ROUTE_CHANNEL_LABEL: Record<Exclude<ReportRoutingTarget, "both" | "none">, string> = {
  chat: "Отправлять в чат",
  admin: "Отправлять админу",
};

type RouteChannel = Exclude<ReportRoutingTarget, "both" | "none">;

const isRouteChannelEnabled = (target: ReportRoutingTarget, channel: RouteChannel): boolean => {
  if (target === "both") {
    return true;
  }
  if (target === "none") {
    return false;
  }
  return target === channel;
};

const toggleRouteChannel = (target: ReportRoutingTarget, channel: RouteChannel): ReportRoutingTarget => {
  const enabled = isRouteChannelEnabled(target, channel);
  if (enabled) {
    if (channel === "chat") {
      if (target === "both") {
        return "admin";
      }
      if (target === "chat") {
        return "none";
      }
      return target;
    }
    if (channel === "admin") {
      if (target === "both") {
        return "chat";
      }
      if (target === "admin") {
        return "none";
      }
      return target;
    }
  } else {
    if (channel === "chat") {
      if (target === "admin") {
        return "both";
      }
      if (target === "none") {
        return "chat";
      }
      return target === "both" ? target : "chat";
    }
    if (channel === "admin") {
      if (target === "chat") {
        return "both";
      }
      if (target === "none") {
        return "admin";
      }
      return target === "both" ? target : "admin";
    }
  }
  return target;
};

type AlertToggleKey = "payment" | "budget" | "meta" | "pause";

const ALERT_TOGGLE_CONFIG: Record<AlertToggleKey, { label: string; accessor: (settings: ProjectSettingsRecord) => boolean } & {
  setter: (settings: ProjectSettingsRecord, next: boolean) => void;
}> = {
  payment: {
    label: "Оплата",
    accessor: (settings) => settings.alerts.payment,
    setter: (settings, next) => {
      settings.alerts.payment = next;
    },
  },
  budget: {
    label: "Бюджет",
    accessor: (settings) => settings.alerts.budget,
    setter: (settings, next) => {
      settings.alerts.budget = next;
    },
  },
  meta: {
    label: "Meta API",
    accessor: (settings) => settings.alerts.metaApi,
    setter: (settings, next) => {
      settings.alerts.metaApi = next;
    },
  },
  pause: {
    label: "Пауза",
    accessor: (settings) => settings.alerts.pause,
    setter: (settings, next) => {
      settings.alerts.pause = next;
    },
  },
};

const chunkButtons = <T>(values: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
};

const ensureAdminUser = async (context: BotContext): Promise<void> => {
  const userId = context.userId;
  if (!userId) {
    return;
  }
  let users: UserRecord[] = [];
  try {
    users = await listUsers(context.env);
  } catch (error) {
    console.warn("Failed to list users while ensuring admin record", error);
  }
  const existingIndex = users.findIndex((user) => user.id === userId);
  if (existingIndex >= 0) {
    const existing = users[existingIndex];
    if (!existing.registeredAt) {
      const updated: UserRecord = {
        ...existing,
        registeredAt: existing.createdAt,
      };
      users[existingIndex] = updated;
      await saveUsers(context.env, users);
    }
    return;
  }
  const now = new Date().toISOString();
  const record: UserRecord = {
    id: userId,
    name: context.username,
    username: context.username,
    role: "owner",
    createdAt: now,
    registeredAt: now,
  };
  users.push(record);
  await saveUsers(context.env, users);
};

const handleRegisterChat = async (context: BotContext): Promise<void> => {
  const chatId = ensureChatId(context);
  if (!chatId) {
    return;
  }
  if (!context.chatType || context.chatType === "private") {
    await sendPlainMessage(
      context,
      "Команда /reg предназначена для групп, где бот отправляет отчёты. Добавьте TargetBot в чат-группу клиента и повторите команду там.",
    );
    return;
  }

  const [projects, registrations] = await Promise.all([
    listProjects(context.env),
    listChatRegistrations(context.env).catch(() => [] as ChatRegistrationRecord[]),
  ]);

  const project = projects.find((entry) => entry.telegramChatId === chatId) ?? null;
  const now = new Date().toISOString();
  const next = [...registrations];
  const existingIndex = next.findIndex((entry) => entry.chatId === chatId);
  let record: ChatRegistrationRecord;

  if (existingIndex >= 0) {
    const current = next[existingIndex];
    record = {
      ...current,
      chatTitle: context.chatTitle ?? current.chatTitle,
      chatType: context.chatType ?? current.chatType,
      username: context.username ?? current.username,
      linkedProjectId: project?.id ?? current.linkedProjectId,
      status: project ? "linked" : current.status ?? "pending",
      updatedAt: now,
    };
    next[existingIndex] = record;
  } else {
    record = {
      id: createId(),
      chatId,
      chatTitle: context.chatTitle,
      chatType: context.chatType,
      username: context.username,
      status: project ? "linked" : "pending",
      linkedProjectId: project?.id,
      createdAt: now,
      updatedAt: now,
    };
    next.push(record);
  }

  await saveChatRegistrations(context.env, next);

  try {
    const groups = await listTelegramGroupLinks(context.env).catch(() => [] as TelegramGroupLinkRecord[]);
    const updated = [...groups];
    const index = updated.findIndex((entry) => entry.chatId === chatId);
    const nowTimestamp = new Date().toISOString();
    const groupRecord: TelegramGroupLinkRecord = {
      chatId,
      title: context.chatTitle ?? record.chatTitle ?? null,
      members: null,
      registered: true,
      linkedProjectId: record.linkedProjectId ?? null,
      updatedAt: nowTimestamp,
    };
    if (index >= 0) {
      updated[index] = {
        ...updated[index],
        ...groupRecord,
      };
    } else {
      updated.push(groupRecord);
    }
    await saveTelegramGroupLinks(context.env, updated);
  } catch (error) {
    console.warn("Failed to update telegram group index", error);
  }

  const lines: Array<string | null> = [
    "🔐 Регистрация чат-группы",
    "",
    `ID: <code>${escapeHtml(chatId)}</code>`,
    context.chatTitle ? `Название: <b>${escapeHtml(context.chatTitle)}</b>` : null,
    `Запись: <code>${escapeHtml(record.id)}</code>`,
    "",
  ];

  if (project) {
    lines.push(
      `Чат уже подключён к проекту <b>${escapeHtml(project.name)}</b>.`,
      "TargetBot продолжит отправлять лиды и отчёты согласно настройкам проекта.",
    );
  } else {
    lines.push(
      "Чат сохранён в списке свободных групп.",
      "Назначьте его на проект в разделе «📊 Проекты» и подтвердите привязку через «➕ Новый проект».",
    );
  }

  lines.push(
    "",
    "Команды и меню в клиентских чатах отключены — после привязки бот будет отвечать только автоматическими отчётами.",
  );

  await sendPlainMessage(context, lines.filter(Boolean).join("\n"));
};

const handleAuth = async (context: BotContext): Promise<void> => {
  const record = await loadMetaToken(context.env);
  const statusInfo = await resolveMetaStatus(context.env, record);
  const status = statusInfo.status;
  const statusLabel =
    status === "valid"
      ? "✅ Токен активен"
      : status === "expired"
        ? "⚠️ Токен истёк"
        : "❌ Токен не подключён";

  const expires = statusInfo.expiresAt ? formatDateTime(statusInfo.expiresAt) : "—";
  let authUrl = resolveAuthUrl(context.env);
  const state = await buildAuthState(context);
  if (state) {
    authUrl = appendQueryParameter(authUrl, "state", state);
  }
  const canAutoUpdate = Boolean(context.update.callback_query?.message && typeof context.messageId === "number");
  const lines = [
    "<b>🔐 Авторизация Facebook</b>",
    "",
    `${statusLabel}`,
    `Действителен до: <b>${expires}</b>`,
    statusInfo.accountName ? `Аккаунт: <b>${escapeHtml(statusInfo.accountName)}</b>` : "",
    "",
    "Для подключения или обновления токена откройте веб-страницу авторизации.",
    `🌍 <a href="${escapeAttribute(authUrl)}">Открыть форму авторизации</a>`,
    "",
    canAutoUpdate
      ? "После успешного входа вернитесь в Telegram — сообщение обновится автоматически."
      : "После успешного входа вернитесь в бота, чтобы увидеть обновлённый статус.",
  ].filter(Boolean);

  if (status === "valid") {
    try {
      const accounts = await fetchAdAccounts(context.env, record, {
        includeSpend: true,
        datePreset: "today",
      });
      if (accounts.length) {
        const list = accounts
          .slice(0, 5)
          .map((account) => {
            const spendText = account.spendFormatted
              ? ` — расход ${escapeHtml(account.spendFormatted)}${account.spendPeriod ? ` (${escapeHtml(account.spendPeriod)})` : ""}`
              : "";
            return `• ${escapeHtml(account.name)}${account.currency ? ` (${escapeHtml(account.currency)})` : ""}${spendText}`;
          })
          .join("\n");
        lines.push("", "Подключённые рекламные аккаунты:", list);
        if (accounts.length > 5) {
          lines.push(`и ещё ${accounts.length - 5} аккаунтов…`);
        }
      }
    } catch (error) {
      console.warn("Failed to list Meta accounts", error);
    }
  }

  await sendMessage(context, lines.join("\n"));
};

const loadProjectSummaries = async (context: BotContext): Promise<ProjectSummary[]> => {
  return sortProjectSummaries(await summarizeProjects(context.env));
};

const loadProjectSummaryById = async (
  context: BotContext,
  projectId: string,
): Promise<ProjectSummary | null> => {
  const summaries = await summarizeProjects(context.env, { projectIds: [projectId] });
  return summaries.length ? summaries[0] : null;
};

const loadProjectPortalRecord = async (
  context: BotContext,
  projectId: string,
): Promise<ProjectPortalRecord | null> => {
  try {
    const record = await loadPortalByProjectId(context.env, projectId);
    if (!record) {
      return null;
    }
    return {
      ...record,
      metrics: record.metrics && record.metrics.length ? record.metrics : [...DEFAULT_PORTAL_METRICS],
    };
  } catch (error) {
    console.warn("Failed to load portal record", projectId, error);
    return null;
  }
};

const updateProjectReportPreferences = async (
  context: BotContext,
  projectId: string,
  patch: Partial<ProjectReportPreferences>,
): Promise<void> => {
  if (!patch.campaignIds && !patch.metrics) {
    return;
  }
  const summary = await loadProjectSummaryById(context, projectId);
  if (!summary) {
    return;
  }
  const updatedSettings = applyProjectReportPreferencesPatch(summary.settings ?? {}, patch);
  await updateProjectRecord(context.env, projectId, { settings: updatedSettings });
};

const truncateLabel = (label: string, max = 40): string => {
  if (label.length <= max) {
    return label;
  }
  return `${label.slice(0, max - 1)}…`;
};

const buildProjectListMarkup = (
  summaries: ProjectSummary[],
  metaIndex: Map<string, MetaAccountLinkRecord>,
) => {
  const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];
  summaries.forEach((project, index) => {
    const account = project.metaAccountId
      ? metaIndex.get(project.metaAccountId) || metaIndex.get(project.adAccountId ?? "")
      : undefined;
    const spendValue = account?.spentToday ?? undefined;
    const spendLabel =
      account && spendValue !== undefined && spendValue !== null
        ? formatCurrencyValue(spendValue, account.currency ?? undefined)
        : null;
    const suffix = spendLabel ? ` [${spendLabel}]` : "";
    keyboard.push([
      {
        text: `${index + 1}️⃣ ${truncateLabel(project.name)}${suffix}`,
        callback_data: `proj:view:${project.id}`,
      },
    ]);
  });
  keyboard.push([{ text: "➕ Новый проект", callback_data: "proj:new" }]);
  keyboard.push([{ text: "⬅ Назад", callback_data: "cmd:menu" }]);
  return { inline_keyboard: keyboard };
};

const resolveProjectChatUrl = (summary: ProjectSummary): string | undefined => {
  return resolveChatLink(summary.telegramLink, summary.telegramChatId ?? summary.chatId ?? undefined);
};

const normalizeTimeSelection = (times: string[]): string[] => {
  const unique = new Set(times.map((time) => time.trim()));
  const ordered: string[] = [...AUTO_REPORT_TIME_OPTIONS];
  const rest = Array.from(unique).filter((time) => !ordered.includes(time));
  return [
    ...ordered.filter((time) => unique.has(time)),
    ...rest.sort((a, b) => a.localeCompare(b, "ru-RU")),
  ];
};

const buildAutoReportLines = (
  summary: ProjectSummary,
  settings: ProjectSettingsRecord,
  status?: string,
): string[] => {
  const auto = settings.autoReport;
  const alerts = settings.alerts;
  const lines: string[] = [`⏰ Авто-отчёты — <b>${escapeHtml(summary.name)}</b>`];
  if (status) {
    lines.splice(1, 0, status);
  }
  lines.push("", `Статус: ${auto.enabled ? "[✔ Включены]" : "[✖ Выключены]"}`);
  const selectedTimes = normalizeTimeSelection(auto.times);
  lines.push(
    "",
    "🕒 Время отправки:",
    AUTO_REPORT_TIME_OPTIONS.map((time) => `${auto.times.includes(time) ? "[✔]" : "[ ]"} ${time}`).join("   "),
  );
  const additionalTimes = selectedTimes.filter((time) => !AUTO_REPORT_TIME_OPTIONS.includes(time as typeof AUTO_REPORT_TIME_OPTIONS[number]));
  if (additionalTimes.length) {
    lines.push(`Дополнительно: ${additionalTimes.map((time) => `[✔] ${time}`).join(", ")}`);
  }
  lines.push(
    "",
    `📅 Понедельник: ${auto.mondayDoubleReport ? "[✔] Сегодня + неделя" : "[ ] Сегодня + неделя"}`,
  );
  lines.push("", "📡 Маршрут отчётов:");
  (Object.keys(ROUTE_CHANNEL_LABEL) as RouteChannel[]).forEach((channel) => {
    const enabled = isRouteChannelEnabled(auto.sendTarget, channel);
    lines.push(`${enabled ? "[✔]" : "[ ]"} ${ROUTE_CHANNEL_LABEL[channel]}`);
  });
  lines.push("", "📢 Алерты:");
  (Object.keys(ALERT_TOGGLE_CONFIG) as AlertToggleKey[]).forEach((key) => {
    const config = ALERT_TOGGLE_CONFIG[key];
    lines.push(`${config.accessor(settings) ? "[✔]" : "[ ]"} ${config.label}`);
  });
  lines.push("", "📡 Маршрут алертов:");
  lines.push(
    ROUTE_TARGETS.map((target) => `${alerts.target === target ? "•" : "○"} ${REPORT_ROUTE_LABEL[target]}`).join(
      "   ",
    ),
  );
  if (auto.lastSentDaily) {
    lines.push("", `Последний автоотчёт: ${escapeHtml(formatDateTime(auto.lastSentDaily))}`);
  }
  lines.push(
    "",
    "Используйте кнопки ниже, чтобы настроить расписание, маршруты доставки и алерты.",
  );
  return lines;
};

const buildAutoReportMarkup = (projectId: string, settings: ProjectSettingsRecord) => {
  const auto = settings.autoReport;
  const timeButtons = AUTO_REPORT_TIME_OPTIONS.map((time) => ({
    text: `${auto.times.includes(time) ? "✅" : "☑️"} ${time}`,
    callback_data: `auto_time_toggle:${projectId}:${time}`,
  }));
  const timeRows = chunkButtons(timeButtons, 2);
  const alertButtons = (Object.keys(ALERT_TOGGLE_CONFIG) as AlertToggleKey[]).map((key) => {
    const config = ALERT_TOGGLE_CONFIG[key];
    return {
      text: `${config.accessor(settings) ? "✅" : "☑️"} ${config.label}`,
      callback_data: `alert_toggle_${key}:${projectId}`,
    };
  });
  const alertRows = chunkButtons(alertButtons, 2);
  const reportRouteRow = (Object.keys(ROUTE_CHANNEL_LABEL) as RouteChannel[]).map((channel) => ({
    text: `${isRouteChannelEnabled(auto.sendTarget, channel) ? "✅" : "☑️"} ${ROUTE_CHANNEL_LABEL[channel]}`,
    callback_data: `auto_send_target:${projectId}:${channel}`,
  }));
  const alertRouteRow = ROUTE_TARGETS.map((target) => ({
    text: `${settings.alerts.target === target ? "•" : "○"} ${REPORT_ROUTE_LABEL[target]}`,
    callback_data: `alert_route:${projectId}:${target}`,
  }));
  return {
    inline_keyboard: [
      [
        {
          text: auto.enabled ? "✖ Выключить автоотчёты" : "✅ Включить автоотчёты",
          callback_data: `auto_toggle:${projectId}`,
        },
      ],
      ...timeRows,
      [
        {
          text: auto.mondayDoubleReport
            ? "✅ Понедельник: сегодня + неделя"
            : "☑️ Понедельник: сегодня + неделя",
          callback_data: `auto_monday_toggle:${projectId}`,
        },
      ],
      reportRouteRow,
      ...alertRows,
      alertRouteRow,
      [{ text: "🔄 Отправить отчёт сейчас", callback_data: `auto_send_now:${projectId}` }],
      [{ text: "⬅ Назад", callback_data: `proj:view:${projectId}` }],
    ],
  };
};

const handleAutoReportMenu = async (
  context: BotContext,
  projectId: string,
  options: { status?: string; settings?: ProjectSettingsRecord } = {},
): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  const settings = options.settings ?? (await loadProjectSettingsRecord(context.env, projectId));
  const lines = buildAutoReportLines(summary, settings, options.status);
  await sendMessage(context, lines.join("\n"), { replyMarkup: buildAutoReportMarkup(projectId, settings) });
};

const normalizeTimeInput = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hours = Math.min(23, Math.max(0, Number(match[1])));
  const minutes = Math.min(59, Math.max(0, Number(match[2])));
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
};

const mutateProjectSettings = async (
  context: BotContext,
  projectId: string,
  mutator: (draft: ProjectSettingsRecord) => string | undefined,
): Promise<void> => {
  const current = await loadProjectSettingsRecord(context.env, projectId);
  const draft = JSON.parse(JSON.stringify(current)) as ProjectSettingsRecord;
  const status = mutator(draft);
  draft.autoReport.times = normalizeTimeSelection(draft.autoReport.times);
  draft.autoReport.alertsTarget = draft.alerts.target;
  const saved = await saveProjectSettingsRecord(context.env, projectId, draft);
  await handleAutoReportMenu(context, projectId, { status, settings: saved });
};

const buildProjectActionsMarkup = (summary: ProjectSummary) => {
  const chatUrl = resolveProjectChatUrl(summary);
  return {
    inline_keyboard: [
      [
        { text: "✏️ Изменить данные", callback_data: `proj:edit:${summary.id}` },
        chatUrl
          ? { text: "📲 Чат-группа", url: chatUrl }
          : { text: "📲 Чат-группа", callback_data: `proj:chat:${summary.id}` },
      ],
      [
        { text: "💬 Лиды", callback_data: `proj:leads:${summary.id}` },
        { text: "📈 Отчёт по рекламе", callback_data: `proj:report:${summary.id}` },
      ],
      [
        { text: "👀 Рекламные кампании", callback_data: `proj:campaigns:${summary.id}` },
        { text: "📤 Экспорт данных", callback_data: `proj:export:${summary.id}` },
      ],
      [
        { text: "🧩 Портал", callback_data: `proj:portal:${summary.id}` },
        { text: "💳 Оплата", callback_data: `proj:billing:${summary.id}` },
      ],
      [
        { text: "⏰ Авто-отчёты", callback_data: `auto_menu:${summary.id}` },
        { text: "🎛 KPI кампаний", callback_data: `report:kpi_open:${summary.id}` },
      ],
      [
        { text: "⚙ Настройки", callback_data: `proj:settings:${summary.id}` },
        { text: "❌ Удалить", callback_data: `proj:delete:${summary.id}` },
      ],
      [
        { text: "⬅ К списку", callback_data: "cmd:projects" },
        { text: "🏠 Меню", callback_data: "cmd:menu" },
      ],
    ],
  };
};

const handleAutoReportToggle = async (context: BotContext, projectId: string): Promise<void> => {
  await mutateProjectSettings(context, projectId, (draft) => {
    draft.autoReport.enabled = !draft.autoReport.enabled;
    if (draft.autoReport.enabled && draft.autoReport.times.length === 0) {
      draft.autoReport.times = [AUTO_REPORT_TIME_OPTIONS[0]];
    }
    return draft.autoReport.enabled ? "✅ Автоотчёты включены" : "⏸ Автоотчёты выключены";
  });
};

const handleAutoReportTimeToggle = async (
  context: BotContext,
  projectId: string,
  timeValue: string | undefined,
): Promise<void> => {
  const normalized = normalizeTimeInput(timeValue);
  if (!normalized) {
    await handleAutoReportMenu(context, projectId, { status: "❌ Неверный формат времени" });
    return;
  }
  await mutateProjectSettings(context, projectId, (draft) => {
    const current = new Set(draft.autoReport.times);
    const existed = current.has(normalized);
    if (existed) {
      current.delete(normalized);
    } else {
      current.add(normalized);
    }
    draft.autoReport.times = Array.from(current);
    if (!draft.autoReport.times.length && draft.autoReport.enabled) {
      draft.autoReport.enabled = false;
      return "⏸ Автоотчёты выключены: расписание пустое";
    }
    return existed ? `⏰ ${normalized} удалено` : `✅ ${normalized} добавлено`;
  });
};

const handleAutoReportSendTarget = async (
  context: BotContext,
  projectId: string,
  target: string | undefined,
): Promise<void> => {
  if (!target) {
    await handleAutoReportMenu(context, projectId, { status: "❌ Недопустимый маршрут" });
    return;
  }
  if (target === "both" || target === "none") {
    if (!ROUTE_TARGETS.includes(target as ReportRoutingTarget)) {
      await handleAutoReportMenu(context, projectId, { status: "❌ Недопустимый маршрут" });
      return;
    }
    await mutateProjectSettings(context, projectId, (draft) => {
      draft.autoReport.sendTarget = target as ReportRoutingTarget;
      return `📡 Отчёты → ${REPORT_ROUTE_LABEL[draft.autoReport.sendTarget]}`;
    });
    return;
  }
  if (!(target in ROUTE_CHANNEL_LABEL)) {
    await handleAutoReportMenu(context, projectId, { status: "❌ Недопустимый маршрут" });
    return;
  }
  const channel = target as RouteChannel;
  await mutateProjectSettings(context, projectId, (draft) => {
    const nextTarget = toggleRouteChannel(draft.autoReport.sendTarget, channel);
    draft.autoReport.sendTarget = nextTarget;
    const enabled = isRouteChannelEnabled(nextTarget, channel);
    return enabled
      ? `📡 ${ROUTE_CHANNEL_LABEL[channel]} — включено`
      : `📡 ${ROUTE_CHANNEL_LABEL[channel]} — отключено`;
  });
};

const handleAutoReportMondayToggle = async (context: BotContext, projectId: string): Promise<void> => {
  await mutateProjectSettings(context, projectId, (draft) => {
    draft.autoReport.mondayDoubleReport = !draft.autoReport.mondayDoubleReport;
    return draft.autoReport.mondayDoubleReport
      ? "📅 По понедельникам: сегодня + неделя"
      : "📅 По понедельникам: только сегодня";
  });
};

const handleAlertToggle = async (
  context: BotContext,
  projectId: string,
  key: AlertToggleKey,
): Promise<void> => {
  const config = ALERT_TOGGLE_CONFIG[key];
  if (!config) {
    await handleAutoReportMenu(context, projectId, { status: "❌ Опция не найдена" });
    return;
  }
  await mutateProjectSettings(context, projectId, (draft) => {
    const current = config.accessor(draft);
    config.setter(draft, !current);
    return `${config.label}: ${!current ? "включено" : "выключено"}`;
  });
};

const handleAlertRoute = async (
  context: BotContext,
  projectId: string,
  target: string | undefined,
): Promise<void> => {
  if (!target || !ROUTE_TARGETS.includes(target as ReportRoutingTarget)) {
    await handleAutoReportMenu(context, projectId, { status: "❌ Недопустимый маршрут алертов" });
    return;
  }
  await mutateProjectSettings(context, projectId, (draft) => {
    draft.alerts.target = target as ReportRoutingTarget;
    draft.autoReport.alertsTarget = draft.alerts.target;
    return `📢 Алерты → ${REPORT_ROUTE_LABEL[draft.alerts.target]}`;
  });
};

const handleAutoReportSendNow = async (context: BotContext, projectId: string): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  const settings = await loadProjectSettingsRecord(context.env, projectId);
  if ((settings.autoReport.sendTarget === "chat" || settings.autoReport.sendTarget === "both") && !summary.telegramChatId) {
    await handleAutoReportMenu(context, projectId, {
      status: "❌ Чат проекта не подключён. Добавьте группу через «📲 Чат-группа».",
    });
    return;
  }
  try {
    const result = await generateReport(context.env, {
      type: "summary",
      projectIds: [projectId],
      includeMeta: true,
      channel: "telegram",
      triggeredBy: context.username,
      command: "auto_report_manual",
      datePreset: "today",
    });
    const reportId = result.record.id;
    const nowIso = new Date().toISOString();
    const adminRoute = settings.autoReport.sendTarget === "admin" || settings.autoReport.sendTarget === "both";
    const chatRoute = settings.autoReport.sendTarget === "chat" || settings.autoReport.sendTarget === "both";
    const asset = await getReportAsset(context.env, reportId).catch(() => null);
    if (adminRoute && context.chatId) {
      await sendTelegramMessage(context.env, {
        chatId: context.chatId,
        threadId: context.threadId,
        text: `${result.html}\n\nID отчёта: <code>${escapeHtml(reportId)}</code>`,
        replyMarkup: {
          inline_keyboard: [[{ text: "⬇️ Скачать", callback_data: `report:download:${reportId}` }]],
        },
      });
      if (asset) {
        await sendTelegramDocument(context.env, {
          chatId: context.chatId,
          threadId: context.threadId,
          data: asset.body,
          fileName: `report_${reportId}.html`,
          contentType: asset.contentType || "text/html; charset=utf-8",
          caption: `Отчёт ${escapeHtml(summary.name)}`,
        });
      }
    }
    if (chatRoute && summary.telegramChatId) {
      const clientChatId = summary.telegramChatId.toString();
      await sendTelegramMessage(context.env, {
        chatId: clientChatId,
        text: `${result.html}\n\nОтправлено автоматически (${REPORT_ROUTE_SUMMARY[settings.autoReport.sendTarget]})`,
      });
      if (asset) {
        await sendTelegramDocument(context.env, {
          chatId: clientChatId,
          data: asset.body,
          fileName: `report_${reportId}.html`,
          contentType: asset.contentType || "text/html; charset=utf-8",
          caption: `Отчёт ${escapeHtml(summary.name)}`,
        });
      }
    }
    await mutateProjectSettings(context, projectId, (draft) => {
      draft.autoReport.lastSentDaily = nowIso;
      const sentDate = new Date(nowIso);
      if (sentDate.getUTCDay() === 1) {
        draft.autoReport.lastSentMonday = nowIso;
      }
      return "✅ Отчёт отправлен";
    });
  } catch (error) {
    console.error("Failed to send auto report", projectId, error);
    await handleAutoReportMenu(context, projectId, { status: "❌ Не удалось сформировать отчёт" });
  }
};

const buildProjectBackMarkup = (projectId: string) => ({
  inline_keyboard: [
    [
      { text: "⬅ К карточке", callback_data: `proj:view:${projectId}` },
      { text: "📊 Все проекты", callback_data: "cmd:projects" },
    ],
    [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
  ],
});

const USER_ROLE_SEQUENCE: UserRole[] = ["owner", "manager", "client"];

const USER_ROLE_LABEL: Record<UserRole, string> = {
  owner: "Владелец",
  manager: "Менеджер",
  client: "Клиент",
};

const USER_ROLE_ICON: Record<UserRole, string> = {
  owner: "👑",
  manager: "👔",
  client: "🙋",
};

const USER_ROLE_ORDER: Record<UserRole, number> = {
  owner: 0,
  manager: 1,
  client: 2,
};

const describeUserRole = (role: UserRole): string => `${USER_ROLE_ICON[role]} ${USER_ROLE_LABEL[role]}`;

const formatUserTitle = (user: UserRecord): string => {
  if (user.username && user.username.trim()) {
    return `@${user.username.trim()}`;
  }
  if (user.name && user.name.trim()) {
    return user.name.trim();
  }
  return user.id;
};

const sortUsers = (users: UserRecord[]): UserRecord[] => {
  return [...users].sort((a, b) => {
    const roleOrder = USER_ROLE_ORDER[a.role] - USER_ROLE_ORDER[b.role];
    if (roleOrder !== 0) {
      return roleOrder;
    }
    const nameA = formatUserTitle(a).toLowerCase();
    const nameB = formatUserTitle(b).toLowerCase();
    if (nameA !== nameB) {
      return nameA.localeCompare(nameB, "ru-RU");
    }
    return Date.parse(a.createdAt) - Date.parse(b.createdAt);
  });
};

const buildUserRoleButtons = (
  callbackBuilder: (role: UserRole) => string,
  currentRole?: UserRole,
) => {
  const buttons = USER_ROLE_SEQUENCE.map((role) => ({
    text: `${currentRole === role ? "✅" : USER_ROLE_ICON[role]} ${USER_ROLE_LABEL[role]}`,
    callback_data: callbackBuilder(role),
  }));
  return [buttons.slice(0, 2), [buttons[2]]];
};

const buildUserListMarkup = (users: UserRecord[]) => {
  const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];
  sortUsers(users).forEach((user) => {
    const label = `${USER_ROLE_ICON[user.role]} ${formatUserTitle(user)}`;
    keyboard.push([{ text: label, callback_data: `user:view:${user.id}` }]);
  });
  keyboard.push([{ text: "➕ Добавить пользователя", callback_data: "user:add" }]);
  keyboard.push([{ text: "🏠 Меню", callback_data: "cmd:menu" }]);
  return { inline_keyboard: keyboard };
};

const buildUserActionsMarkup = (user: UserRecord) => {
  const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];
  buildUserRoleButtons((role) => `user:role:${user.id}:${role}`, user.role).forEach((row) => keyboard.push(row));
  keyboard.push([{ text: "🗑 Удалить", callback_data: `user:delete:${user.id}` }]);
  keyboard.push([{ text: "👥 К списку", callback_data: "cmd:users" }]);
  keyboard.push([{ text: "🏠 Меню", callback_data: "cmd:menu" }]);
  return { inline_keyboard: keyboard };
};

const USER_CREATION_ROLE_MARKUP = {
  inline_keyboard: [
    ...buildUserRoleButtons((role) => `user:create-role:${role}`),
    [{ text: "❌ Отменить", callback_data: "user:cancel" }],
    [{ text: "👥 К списку", callback_data: "cmd:users" }],
  ],
};

const USER_CANCEL_MARKUP = {
  inline_keyboard: [
    [{ text: "❌ Отменить", callback_data: "user:cancel" }],
    [{ text: "👥 К списку", callback_data: "cmd:users" }],
  ],
};

const formatCurrencyValue = (amount: number | undefined, currency?: string): string | null => {
  if (amount === undefined) {
    return null;
  }
  const safeCurrency = currency && /^[A-Z]{3}$/.test(currency) ? currency : currency || "USD";
  try {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency: safeCurrency }).format(amount);
  } catch (error) {
    console.warn("Failed to format currency", safeCurrency, error);
    return `${amount.toFixed(2)} ${safeCurrency}`;
  }
};

export const handleAutoReportCallback = async (context: BotContext, data: string): Promise<boolean> => {
  if (!data.startsWith("auto_") && !data.startsWith("alert_")) {
    return false;
  }
  await ensureAdminUser(context);
  const [prefix, ...rest] = data.split(":");
  if (prefix === "auto_menu") {
    const projectId = rest[0];
    if (!projectId) {
      return false;
    }
    await handleAutoReportMenu(context, projectId);
    await logProjectAction(context, prefix, projectId);
    return true;
  }
  if (prefix === "auto_toggle") {
    const projectId = rest[0];
    if (!projectId) {
      return false;
    }
    await handleAutoReportToggle(context, projectId);
    await logProjectAction(context, prefix, projectId);
    return true;
  }
  if (prefix === "auto_time_toggle") {
    const projectId = rest[0];
    const timeValue = rest.slice(1).join(":");
    if (!projectId || !timeValue) {
      return false;
    }
    await handleAutoReportTimeToggle(context, projectId, timeValue);
    await logProjectAction(context, prefix, projectId, timeValue);
    return true;
  }
  if (prefix === "auto_send_target") {
    const [projectId, target] = rest;
    if (!projectId) {
      return false;
    }
    await handleAutoReportSendTarget(context, projectId, target);
    await logProjectAction(context, prefix, projectId, target);
    return true;
  }
  if (prefix === "auto_monday_toggle") {
    const projectId = rest[0];
    if (!projectId) {
      return false;
    }
    await handleAutoReportMondayToggle(context, projectId);
    await logProjectAction(context, prefix, projectId);
    return true;
  }
  if (prefix === "auto_send_now") {
    const projectId = rest[0];
    if (!projectId) {
      return false;
    }
    await handleAutoReportSendNow(context, projectId);
    await logProjectAction(context, prefix, projectId);
    return true;
  }
  if (prefix.startsWith("alert_toggle_")) {
    const projectId = rest[0];
    const key = prefix.replace("alert_toggle_", "") as AlertToggleKey;
    if (!projectId || !(key in ALERT_TOGGLE_CONFIG)) {
      return false;
    }
    await handleAlertToggle(context, projectId, key);
    await logProjectAction(context, prefix, projectId);
    return true;
  }
  if (prefix === "alert_route") {
    const [projectId, target] = rest;
    if (!projectId) {
      return false;
    }
    await handleAlertRoute(context, projectId, target);
    await logProjectAction(context, prefix, projectId, target);
    return true;
  }
  return false;
};

const formatMetaSpendLabel = (amount?: number | null, currency?: string | null): string | null => {
  if (amount === null || amount === undefined) {
    return null;
  }
  const formatted = formatCurrencyValue(amount, currency ?? undefined);
  return formatted ?? `${amount.toFixed(2)} ${currency ?? "USD"}`;
};

const buildMetaAccountsMarkup = (accounts: MetaAccountLinkRecord[]) => {
  const sorted = accounts
    .slice()
    .sort((a, b) => a.accountName.localeCompare(b.accountName, "ru-RU", { sensitivity: "base" }));
  const rows = sorted.map((account) => {
    const spendLabel = formatMetaSpendLabel(account.spentToday, account.currency);
    const title = account.isLinked
      ? `✅ ${account.accountName}${spendLabel ? ` | ${spendLabel}` : ""}`
      : `➕ ${account.accountName}`;
    const callbackData =
      account.isLinked && account.linkedProjectId
        ? `meta:project:${account.linkedProjectId}`
        : `meta:account:${account.accountId}`;
    return [{ text: title, callback_data: callbackData }];
  });
  rows.push([{ text: "🏠 Меню", callback_data: "cmd:menu" }]);
  return { inline_keyboard: rows };
};

const buildLinkGroupMarkup = (groups: TelegramGroupLinkRecord[], flow: MetaLinkFlow) => {
  const rows: Array<Array<{ text: string; callback_data: string }>> = groups.map((group) => {
    const label = group.title ? `👥 ${group.title}` : `👥 ${group.chatId}`;
    const callback = flow === "meta" ? `meta:group:${group.chatId}` : `proj:new:chat:${group.chatId}`;
    return [{ text: label, callback_data: callback }];
  });
  const cancelCallback = flow === "meta" ? "meta:cancel" : "proj:new:cancel";
  const backCallback = flow === "meta" ? "cmd:meta" : "cmd:projects";
  const backLabel = flow === "meta" ? "⬅ Meta-аккаунты" : "⬅ К проектам";
  rows.push([{ text: "❌ Отменить", callback_data: cancelCallback }]);
  rows.push([{ text: backLabel, callback_data: backCallback }]);
  rows.push([{ text: "🏠 Меню", callback_data: "cmd:menu" }]);
  return { inline_keyboard: rows };
};

const buildLinkConfirmMarkup = (flow: MetaLinkFlow) => {
  const confirmCallback = flow === "meta" ? "meta:confirm" : "proj:new:confirm";
  const cancelCallback = flow === "meta" ? "meta:cancel" : "proj:new:cancel";
  const backRow =
    flow === "meta"
      ? [{ text: "⬅ Meta-аккаунты", callback_data: "cmd:meta" }]
      : [{ text: "📊 Проекты", callback_data: "cmd:projects" }];
  return {
    inline_keyboard: [
      [
        { text: "✅ Подтвердить", callback_data: confirmCallback },
        { text: "❌ Отменить", callback_data: cancelCallback },
      ],
      backRow,
      [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
    ],
  };
};

const buildProjectNewMetaMarkup = (accounts: MetaAccountLinkRecord[]) => {
  const rows: Array<Array<{ text: string; callback_data: string }>> = accounts.map((account) => {
    const spendLabel = formatMetaSpendLabel(account.spentToday, account.currency);
    const label = `➕ ${account.accountName}${spendLabel ? ` | ${spendLabel}` : ""}`;
    return [{ text: label, callback_data: `proj:new:meta:${account.accountId}` }];
  });
  rows.push([{ text: "❌ Отменить", callback_data: "proj:new:cancel" }]);
  rows.push([{ text: "🔗 Meta-аккаунты", callback_data: "cmd:meta" }]);
  rows.push([{ text: "🏠 Меню", callback_data: "cmd:menu" }]);
  return { inline_keyboard: rows };
};

const buildLinkCompleteMarkup = (flow: MetaLinkFlow, projectId: string) => {
  const backLabel = flow === "meta" ? "🔗 Meta-аккаунты" : "📊 Проекты";
  const backCallback = flow === "meta" ? "cmd:meta" : "cmd:projects";
  return {
    inline_keyboard: [
      [{ text: "Перейти в проект", callback_data: `proj:view:${projectId}` }],
      [{ text: backLabel, callback_data: backCallback }],
      [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
    ],
  };
};

const ensureTelegramGroupIndex = async (context: BotContext): Promise<TelegramGroupLinkRecord[]> => {
  let groups: TelegramGroupLinkRecord[] = [];
  try {
    groups = await listTelegramGroupLinks(context.env);
  } catch (error) {
    console.warn("Failed to read telegram group index", error);
  }
  if (groups.length) {
    return groups;
  }

  try {
    const registrations = await listChatRegistrations(context.env);
    if (registrations.length) {
      const now = new Date().toISOString();
      groups = registrations.map<TelegramGroupLinkRecord>((entry) => ({
        chatId: entry.chatId,
        title: entry.chatTitle ?? null,
        members: null,
        registered: true,
        linkedProjectId: entry.linkedProjectId ?? null,
        updatedAt: now,
      }));
      await saveTelegramGroupLinks(context.env, groups);
    }
  } catch (error) {
    console.warn("Failed to rebuild telegram group index", error);
  }

  return groups;
};

const formatShortDate = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(parsed));
};

type ProjectAccountStatus = "missing" | "expired" | "valid" | "error";

interface ProjectAccountInfo {
  status: ProjectAccountStatus;
  account: MetaAdAccount | null;
  error?: string;
}

const fetchProjectAccountInfo = async (
  context: BotContext,
  project: ProjectSummary,
  options: {
    includeCampaigns?: boolean;
    campaignsLimit?: number;
    datePreset?: string;
    since?: string;
    until?: string;
  } = {},
): Promise<ProjectAccountInfo> => {
  if (!project.adAccountId) {
    return { status: "missing", account: null };
  }
  const record = await loadMetaToken(context.env);
  const statusInfo = await resolveMetaStatus(context.env, record);
  if (statusInfo.status !== "valid") {
    return { status: statusInfo.status, account: null };
  }
  try {
    const accounts = await fetchAdAccounts(context.env, record, {
      includeSpend: true,
      includeCampaigns: options.includeCampaigns,
      campaignsLimit: options.includeCampaigns ? options.campaignsLimit ?? 5 : undefined,
      datePreset: options.datePreset ?? "today",
      since: options.since,
      until: options.until,
    });
    const normalized = project.adAccountId.startsWith("act_")
      ? project.adAccountId
      : `act_${project.adAccountId}`;
    const account =
      accounts.find((item) => item.id === project.adAccountId || item.id === normalized) ?? null;
    return { status: "valid", account };
  } catch (error) {
    console.error("Failed to fetch project account", project.id, error);
    return { status: "error", account: null, error: (error as Error).message };
  }
};

const describeBillingStatus = (summary: ProjectSummary): string => {
  const billing = summary.billing;
  if (billing.status === "missing") {
    return "💳 Оплата: не настроена";
  }
  const statusMap: Record<string, string> = {
    active: "активен",
    pending: "ожидает",
    overdue: "просрочен",
    cancelled: "отменён",
  };
  const prefix = billing.overdue ? "⚠️" : billing.active ? "✅" : "💳";
  const label = statusMap[billing.status] ?? billing.status;
  const amount = billing.amountFormatted ?? formatCurrencyValue(billing.amount, billing.currency);
  const parts = [`${prefix} Оплата: ${escapeHtml(label)}`];
  if (amount) {
    parts.push(`— ${escapeHtml(amount)}`);
  }
  if (billing.periodLabel) {
    parts.push(`(${escapeHtml(billing.periodLabel)})`);
  }
  return parts.join(" ");
};

const describePaymentSchedule = (summary: ProjectSummary): string => {
  const billing = summary.billing;
  const paidAt = formatShortDate(billing.paidAt ?? null);
  const dueDate = formatShortDate(billing.periodEnd ?? billing.periodStart ?? null);
  if (paidAt) {
    return `📅 Оплата произведена: ${escapeHtml(paidAt)}`;
  }
  if (dueDate) {
    return `📅 Оплата: ${escapeHtml(dueDate)}`;
  }
  return "📅 Оплата: дата не указана";
};

interface ProjectViewOptions {
  prefix?: string;
}

const handleProjectView = async (
  context: BotContext,
  projectId: string,
  options: ProjectViewOptions = {},
): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  const accountInfo = await fetchProjectAccountInfo(context, summary);
  const account = accountInfo.account;
  const spendLabel = account?.spendFormatted ?? formatCurrencyValue(account?.spend, account?.spendCurrency);
  const cpaValue =
    account?.spend !== undefined && summary.leadStats.done > 0
      ? account.spend / summary.leadStats.done
      : null;
  const cpaLabel = cpaValue !== null ? formatCurrencyValue(cpaValue, account?.spendCurrency || account?.currency) : null;
  const metaLine = (() => {
    if (!summary.adAccountId) {
      return "🧩 Meta: не подключено";
    }
    if (account) {
      return `🧩 Meta: подключено — ${escapeHtml(account.name)} (${escapeHtml(account.id)})`;
    }
    if (accountInfo.status === "expired") {
      return "🧩 Meta: токен истёк, обновите авторизацию.";
    }
    if (accountInfo.status === "missing") {
      return "🧩 Meta: токен не найден, выполните авторизацию Facebook.";
    }
    if (accountInfo.status === "error") {
      return `🧩 Meta: не удалось загрузить данные (${escapeHtml(accountInfo.error || "ошибка")}).`;
    }
    return `🧩 Meta: ID <code>${escapeHtml(summary.adAccountId)}</code> — данные недоступны.`;
  })();
  const lines: string[] = [];
  if (options.prefix) {
    lines.push(options.prefix, "");
  }
  lines.push(`🏗 Проект: <b>${escapeHtml(summary.name)}</b>`);
  lines.push(metaLine);
  lines.push(
    `📈 CPA (сегодня): ${cpaLabel ? escapeHtml(cpaLabel) : "—"} | Затраты: ${
      spendLabel ? escapeHtml(spendLabel) : "—"
    }`,
  );
  lines.push(
    `💬 Лиды: ${summary.leadStats.total} (новые ${summary.leadStats.new}, завершено ${summary.leadStats.done})`,
  );
  lines.push(describeBillingStatus(summary));
  lines.push(describePaymentSchedule(summary));
  try {
    const settings = await loadProjectSettingsRecord(context.env, summary.id);
    const auto = settings.autoReport;
    const timesLabel = auto.times.length ? auto.times.join(", ") : "нет времени";
    const autoLabel = auto.enabled
      ? `${timesLabel} (вкл)`
      : "выключены";
    lines.push(`⏰ Автоотчёты: ${escapeHtml(autoLabel)}`);
    const alertFlags = [settings.alerts.payment, settings.alerts.budget, settings.alerts.metaApi, settings.alerts.pause].filter(
      Boolean,
    ).length;
    const alertsLabel = alertFlags
      ? `включены (${REPORT_ROUTE_SUMMARY[settings.alerts.target]})`
      : "отключены";
    lines.push(`📡 Алерты: ${escapeHtml(alertsLabel)}`);
  } catch (error) {
    console.warn("Failed to load project settings for view", summary.id, error);
  }
  const chatUrl = resolveProjectChatUrl(summary);
  const chatLabel = summary.telegramTitle ?? (summary.telegramChatId ? `ID ${summary.telegramChatId}` : null);
  const chatLine = chatUrl
    ? `📲 Чат-группа: <a href="${escapeAttribute(chatUrl)}">Перейти</a>`
    : chatLabel
      ? `📲 Чат-группа: ${escapeHtml(chatLabel)}`
      : "📲 Чат-группа: не подключена";
  if (summary.telegramChatId && chatLabel !== `ID ${summary.telegramChatId}`) {
    lines.push(`${chatLine} (ID: <code>${escapeHtml(summary.telegramChatId)}</code>)`);
  } else {
    lines.push(chatLine);
  }
  const portalRecord = await loadProjectPortalRecord(context, summary.id);
  const portalUrl = resolvePortalUrl(context.env, portalRecord?.portalId);
  if (portalUrl) {
    lines.push(`🧩 Портал: <a href="${escapeAttribute(portalUrl)}">Открыть клиентский портал</a>`);
  }
  const adminUrl = resolveAdminProjectUrl(context.env, summary.id);
  if (adminUrl) {
    lines.push(`🔗 Браузер: <a href="${escapeAttribute(adminUrl)}">Открыть проект</a>`);
  }
  if (accountInfo.status !== "valid" && summary.adAccountId) {
    lines.push(
      "",
      "⚠️ Подключите или обновите токен Meta, чтобы видеть расходы и кампании прямо в боте.",
    );
  }
  lines.push("", "Выберите действие на кнопках ниже.");
  await sendMessage(context, lines.join("\n"), { replyMarkup: buildProjectActionsMarkup(summary) });
};

const handleProjectChat = async (context: BotContext, projectId: string): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  const chatUrl = resolveProjectChatUrl(summary);
  const chatTitle = summary.telegramTitle ?? summary.name;
  const lines = [`📲 Чат-группа — <b>${escapeHtml(chatTitle)}</b>`, ""];
  if (chatTitle !== summary.name) {
    lines.push(`Проект: <b>${escapeHtml(summary.name)}</b>`);
  }
  if (chatUrl) {
    lines.push(`Ссылка: <a href="${escapeAttribute(chatUrl)}">перейти в чат</a>.`);
  }
  if (summary.telegramChatId) {
    lines.push(`ID: <code>${escapeHtml(summary.telegramChatId)}</code>`);
  }
  if (summary.telegramThreadId !== undefined) {
    lines.push(`Thread ID: <code>${escapeHtml(summary.telegramThreadId.toString())}</code>`);
  }
  if (!chatUrl && !summary.telegramChatId) {
    lines.push("Чат не подключён. Добавьте бота в группу, выполните /reg и обновите карточку через кнопку «📲 Чат-группа».");
  }
  lines.push(
    "",
    "После изменения чата повторно выполните /reg в нужной группе и подтвердите обновление через кнопку «📲 Чат-группа».",
  );
  const replyMarkup = {
    inline_keyboard: [
      ...(chatUrl ? [[{ text: "➡️ Перейти в чат", url: chatUrl }]] : []),
      [
        { text: "⬅ К карточке", callback_data: `proj:view:${projectId}` },
        { text: "📊 Все проекты", callback_data: "cmd:projects" },
      ],
      [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
    ],
  };
  await sendMessage(context, lines.join("\n"), { replyMarkup });
};

const formatLeadPreview = (lead: LeadRecord): string => {
  const statusIcon = lead.status === "done" ? "✅" : "🆕";
  const created = formatDateTime(lead.createdAt);
  const phone = lead.phone ? `, ${escapeHtml(lead.phone)}` : "";
  return `${statusIcon} ${escapeHtml(lead.name)}${phone} — ${escapeHtml(lead.source)} · ${escapeHtml(created)}`;
};

const computeLeadStatsForPeriod = (
  leads: LeadRecord[],
  period: ReportPeriodKey,
): { total: number; new: number; done: number } => {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = new Date();
  const startOfUtcDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const todayStart = startOfUtcDay(now);
  let since: number | null = null;
  let until: number | null = null;
  if (period === "today") {
    since = todayStart;
    until = todayStart + dayMs;
  } else if (period === "yesterday") {
    since = todayStart - dayMs;
    until = todayStart;
  } else if (period === "7d") {
    since = todayStart - 6 * dayMs;
    until = todayStart + dayMs;
  } else if (period === "30d") {
    since = todayStart - 29 * dayMs;
    until = todayStart + dayMs;
  }
  const filtered = leads.filter((lead) => {
    const created = Date.parse(lead.createdAt);
    if (Number.isNaN(created)) {
      return false;
    }
    if (since !== null && created < since) {
      return false;
    }
    if (until !== null && created >= until) {
      return false;
    }
    return true;
  });
  const total = filtered.length;
  const newCount = filtered.filter((lead) => lead.status !== "done").length;
  const doneCount = filtered.filter((lead) => lead.status === "done").length;
  return { total, new: newCount, done: doneCount };
};

const toggleLeadStatus = async (
  env: BotContext["env"],
  projectId: string,
  leadId: string,
): Promise<LeadRecord | null> => {
  const leads = await listLeads(env, projectId).catch(() => [] as LeadRecord[]);
  const index = leads.findIndex((lead) => lead.id === leadId);
  if (index < 0) {
    return null;
  }
  const current = leads[index];
  const nextStatus: LeadRecord["status"] = current.status === "done" ? "new" : "done";
  const updated: LeadRecord = { ...current, status: nextStatus };
  leads[index] = updated;
  await saveLeads(env, projectId, leads);
  if (nextStatus === "done") {
    await clearLeadReminder(env, leadId).catch((error) => {
      console.warn("Failed to clear lead reminder", projectId, leadId, error);
    });
  }
  return updated;
};

const handleProjectLeadToggle = async (
  context: BotContext,
  projectId: string,
  leadId: string,
): Promise<void> => {
  const updated = await toggleLeadStatus(context.env, projectId, leadId);
  if (!updated) {
    await sendMessage(context, "❌ Лид не найден. Обновите список заявок.", {
      replyMarkup: { inline_keyboard: [[{ text: "⬅ К проекту", callback_data: `proj:view:${projectId}` }]] },
    });
    return;
  }
  await handleProjectLeads(context, projectId);
};

const handleProjectLeads = async (context: BotContext, projectId: string): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  const leads = await listLeads(context.env, summary.id).catch(() => [] as LeadRecord[]);
  const sorted = leads.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const preview = sorted.slice(0, 5);
  const lines: string[] = [];
  lines.push(`💬 Лиды — <b>${escapeHtml(summary.name)}</b>`);
  lines.push(
    `Всего: ${summary.leadStats.total} · Новые: ${summary.leadStats.new} · Завершено: ${summary.leadStats.done}`,
  );
  lines.push("\nПоследние заявки:");
  if (preview.length) {
    for (const lead of preview) {
      lines.push(formatLeadPreview(lead));
    }
    if (sorted.length > preview.length) {
      lines.push(`… и ещё ${sorted.length - preview.length} записей`);
    }
  } else {
    lines.push("Пока нет заявок. Лиды из Facebook и других каналов появятся здесь автоматически.");
  }
  const portalRecord = await loadProjectPortalRecord(context, summary.id);
  const portalUrl = resolvePortalUrl(context.env, portalRecord?.portalId);
  if (portalUrl) {
    lines.push(
      "",
      `🧩 Полный список доступен в клиентском портале: <a href="${escapeAttribute(portalUrl)}">открыть</a>.`,
    );
  }
  lines.push(
    "",
    "Используйте кнопки ниже, чтобы отметить заявку обработанной или вернуть её в работу.",
  );
  const keyboard = preview.map((lead) => {
    const name = lead.name.length > 18 ? `${lead.name.slice(0, 18)}…` : lead.name;
    const icon = lead.status === "done" ? "↩️" : "✅";
    return [
      {
        text: `${icon} ${name}`,
        callback_data: `proj:lead-toggle:${projectId}:${lead.id}`,
      },
    ];
  });
  keyboard.push([{ text: "📤 Экспорт лидов", callback_data: `proj:export:${projectId}` }]);
  keyboard.push([{ text: "⬅ К проекту", callback_data: `proj:view:${projectId}` }]);
  await sendMessage(context, lines.join("\n"), {
    replyMarkup: { inline_keyboard: keyboard },
  });
};

const handleProjectReport = async (
  context: BotContext,
  projectId: string,
  periodKey: ReportPeriodKey = "today",
): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  const currentSettings = (summary.settings as Record<string, unknown>) ?? {};
  const reportSettings = (currentSettings.reports as Record<string, unknown>) ?? {};
  const lastSentAt = typeof reportSettings.lastSentAt === "string" ? reportSettings.lastSentAt : undefined;
  const period = resolveReportPeriod(periodKey);
  const accountInfo = await fetchProjectAccountInfo(context, summary, { datePreset: period.datePreset });
  const account = accountInfo.account;
  const spendLabel = account?.spendFormatted ?? formatCurrencyValue(account?.spend, account?.spendCurrency);
  const leads = await listLeads(context.env, summary.id).catch(() => [] as LeadRecord[]);
  const leadStats = computeLeadStatsForPeriod(leads, period.key as ReportPeriodKey);
  const lines = [
    `📈 Отчёт по рекламе — <b>${escapeHtml(summary.name)}</b>`,
    `Период: <b>${escapeHtml(period.label)}</b>`,
    "",
    `Лиды: ${leadStats.total} (новые ${leadStats.new}, закрыто ${leadStats.done})`,
    account
      ? `Расход: ${spendLabel ? escapeHtml(spendLabel) : "—"}`
      : accountInfo.status === "valid"
        ? "Расход недоступен: кабинет не найден среди активных аккаунтов."
        : "Расходы недоступны: требуется действующий токен Meta.",
    "",
    "Выберите период или отправьте отчёт клиенту.",
  ];
  const buttons = REPORT_PERIODS.map((periodOption) => ({
    text: `${periodOption.key === period.key ? "✅" : "☑️"} ${periodOption.label}`,
    callback_data: `proj:report-period:${projectId}:${periodOption.key}`,
  }));
  const periodRows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    periodRows.push(buttons.slice(i, i + 2));
  }
  if (lastSentAt) {
    lines.push("", `Последняя отправка: ${escapeHtml(formatDateTime(lastSentAt))}`);
  }
  periodRows.push([{ text: "📨 В чат клиента", callback_data: `proj:report-send:${projectId}:${period.key}` }]);
  periodRows.push([{ text: "⬅ К проекту", callback_data: `proj:view:${projectId}` }]);
  await sendMessage(context, lines.join("\n"), { replyMarkup: { inline_keyboard: periodRows } });
};

const handleProjectReportSend = async (
  context: BotContext,
  projectId: string,
  periodKey: ReportPeriodKey,
): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  if (!summary.telegramChatId) {
    await sendMessage(context, "К проекту не привязан чат клиента. Подключите группу в разделе «📲 Чат-группа».", {
      replyMarkup: buildProjectBackMarkup(projectId),
    });
    return;
  }
  const period = resolveReportPeriod(periodKey);
  const report = await generateReport(context.env, {
    type: "summary",
    projectIds: [projectId],
    datePreset: period.datePreset,
    includeMeta: true,
    channel: "telegram",
    triggeredBy: context.username,
    command: "project_report",
  });
  const asset = await getReportAsset(context.env, report.record.id);
  const chatId = summary.telegramChatId.toString();
  const message = `${report.html}\n\nПериод: <b>${escapeHtml(period.label)}</b>`;
  await sendTelegramMessage(context.env, {
    chatId,
    text: message,
  });
  if (asset) {
    const fileName = `${summary.name.replace(/[^\w]+/g, "_")}_${period.key}.html`;
    await sendTelegramDocument(context.env, {
      chatId,
      data: asset.body,
      fileName,
      contentType: asset.contentType || "text/html; charset=utf-8",
      caption: `Отчёт по проекту ${escapeHtml(summary.name)} — ${escapeHtml(period.label)}`,
    });
  }
  const nowIso = new Date().toISOString();
  const currentSettings = (summary.settings as Record<string, unknown>) ?? {};
  const reportsSettings = (currentSettings.reports as Record<string, unknown>) ?? {};
  const updatedSettings = {
    ...currentSettings,
    reports: {
      ...reportsSettings,
      lastSentAt: nowIso,
    },
  } as typeof summary.settings;
  await updateProjectRecord(context.env, projectId, { settings: updatedSettings });
  if (context.update.callback_query?.id) {
    await answerCallbackQuery(context.env, context.update.callback_query.id, "Отправлено");
  }
  await handleProjectReport(context, projectId, period.key as ReportPeriodKey);
};

const campaignStatusIcon = (campaign: MetaCampaign): string => {
  const status = (campaign.effectiveStatus || campaign.status || "").toUpperCase();
  if (status.includes("ACTIVE")) {
    return "🟢";
  }
  if (status.includes("PAUSED") || status.includes("DISABLE")) {
    return "⏸";
  }
  if (status.includes("ARCHIVE")) {
    return "📦";
  }
  return "⚙️";
};

const handleProjectCampaigns = async (context: BotContext, projectId: string): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  if (!summary.adAccountId) {
    await sendMessage(context, "Рекламный кабинет не подключён. Привяжите Meta-аккаунт, чтобы управлять кампаниями.", {
      replyMarkup: buildProjectBackMarkup(projectId),
    });
    return;
  }
  const accountInfo = await fetchProjectAccountInfo(context, summary, {
    includeCampaigns: true,
    campaignsLimit: 50,
  });
  const account = accountInfo.account;
  if (!account || !account.campaigns?.length) {
    const message =
      accountInfo.status === "valid"
        ? "Кампании не найдены за выбранный период."
        : "Не удалось загрузить кампании. Обновите авторизацию Meta.";
    await sendMessage(context, message, { replyMarkup: buildProjectBackMarkup(projectId) });
    return;
  }
  const operatorId = resolveOperatorId(context);
  let pending = operatorId ? await loadPendingCampaignSelection(context.env, operatorId) : null;
  if (!pending || pending.projectId !== projectId) {
    pending = { projectId, campaignIds: [], updatedAt: new Date().toISOString() };
    if (operatorId) {
      await savePendingCampaignSelection(context.env, operatorId, pending);
    }
  }
  const campaigns = account.campaigns
    .slice()
    .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))
    .slice(0, 20);
  await syncCampaignObjectives(context.env, projectId, campaigns).catch((error) =>
    console.warn("Failed to sync campaign objectives", projectId, error),
  );
  const rows = campaigns.map((campaign) => [{
    text: `${pending?.campaignIds.includes(campaign.id) ? "✅" : campaignStatusIcon(campaign)} ${truncateCampaignLabel(campaign.name)}`,
    callback_data: `proj:campaign-toggle:${projectId}:${campaign.id}`,
  }]);
  rows.push([{ text: "⚙️ Выбрать действие", callback_data: `proj:campaign-actions:${projectId}` }]);
  rows.push([{ text: "⬅ К проекту", callback_data: `proj:view:${projectId}` }]);
  const lines = [
    `👀 Рекламные кампании — <b>${escapeHtml(summary.name)}</b>`,
    `Выбрано: ${pending?.campaignIds.length ?? 0}`,
    "",
    "Отметьте кампании и нажмите «Выбрать действие», чтобы управлять статусами или сохранить выбор по умолчанию.",
  ];
  await sendMessage(context, lines.join("\n"), { replyMarkup: { inline_keyboard: rows } });
};

const handleProjectCampaignToggle = async (
  context: BotContext,
  projectId: string,
  campaignId: string,
): Promise<void> => {
  const operatorId = resolveOperatorId(context);
  if (!operatorId) {
    await sendMessage(context, "Не удалось определить оператора. Попробуйте снова.");
    return;
  }
  const pending = (await loadPendingCampaignSelection(context.env, operatorId)) ?? {
    projectId,
    campaignIds: [],
    updatedAt: new Date().toISOString(),
  };
  if (pending.projectId !== projectId) {
    pending.projectId = projectId;
    pending.campaignIds = [];
  }
  const exists = pending.campaignIds.includes(campaignId);
  pending.campaignIds = exists
    ? pending.campaignIds.filter((id) => id !== campaignId)
    : [...pending.campaignIds, campaignId];
  await savePendingCampaignSelection(context.env, operatorId, pending);
  if (context.update.callback_query?.id) {
    await answerCallbackQuery(context.env, context.update.callback_query.id, exists ? "Исключено" : "Выбрано");
  }
  await handleProjectCampaigns(context, projectId);
};

const handleProjectCampaignActions = async (context: BotContext, projectId: string): Promise<void> => {
  const operatorId = resolveOperatorId(context);
  if (!operatorId) {
    await sendMessage(context, "Не удалось определить оператора. Попробуйте снова.");
    return;
  }
  const pending = await loadPendingCampaignSelection(context.env, operatorId);
  const selected = pending && pending.projectId === projectId ? pending.campaignIds.length : 0;
  const lines = [
    "⚙️ Действия с кампаниями",
    "",
    selected
      ? `Выбрано кампаний: <b>${selected}</b>. Выберите действие.`
      : "Кампании не выбраны. Отметьте кампании в списке и повторите.",
  ];
  const keyboard = [
    [{ text: "⏸ Массовое отключение", callback_data: `proj:campaign-action:${projectId}:disable` }],
    [{ text: "▶️ Массовое включение", callback_data: `proj:campaign-action:${projectId}:enable` }],
    [{ text: "⭐️ Сохранить для отчётов", callback_data: `proj:campaign-action:${projectId}:save` }],
    [{ text: "📊 Отчёт по выбранным", callback_data: `proj:campaign-action:${projectId}:report` }],
    [{ text: "⬅ Назад", callback_data: `proj:campaigns:${projectId}` }],
  ];
  await sendMessage(context, lines.join("\n"), { replyMarkup: { inline_keyboard: keyboard } });
};

const handleProjectCampaignAction = async (
  context: BotContext,
  projectId: string,
  action: string,
): Promise<void> => {
  const operatorId = resolveOperatorId(context);
  if (!operatorId) {
    await sendMessage(context, "Не удалось определить оператора. Попробуйте снова.");
    return;
  }
  const pending = await loadPendingCampaignSelection(context.env, operatorId);
  const selection = pending && pending.projectId === projectId ? pending.campaignIds : [];
  if (!selection.length && action !== "report") {
    await sendMessage(context, "Выберите кампании в списке, чтобы применить действие.", {
      replyMarkup: buildProjectBackMarkup(projectId),
    });
    return;
  }
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  if (!summary.adAccountId) {
    await sendMessage(context, "Рекламный кабинет не подключён. Привяжите Meta-аккаунт.", {
      replyMarkup: buildProjectBackMarkup(projectId),
    });
    return;
  }
  const metaEnv = await withMetaSettings(context.env);
  const token = await loadMetaToken(context.env);
  if (action === "disable" || action === "enable") {
    const status = action === "disable" ? "PAUSED" : "ACTIVE";
    const result = await updateCampaignStatuses(metaEnv, token, selection, status);
    const lines = [
      status === "PAUSED"
        ? "⏸ Кампании переведены в статус «Пауза»."
        : "▶️ Кампании активированы.",
      `Обновлено: ${result.updated.length}.`,
    ];
    if (result.failed.length) {
      lines.push(`Ошибок: ${result.failed.length}.`, "Проверьте права доступа в Meta Business Manager.");
    }
    await sendMessage(context, lines.join("\n"), { replyMarkup: buildProjectBackMarkup(projectId) });
    return;
  }
  if (action === "save") {
    await updateProjectReportPreferences(context, projectId, { campaignIds: selection });
    const portalRecord = await ensurePortalRecord(context, projectId);
    const updatedPortal: ProjectPortalRecord = {
      ...portalRecord,
      mode: "manual",
      campaignIds: selection,
      updatedAt: new Date().toISOString(),
    };
    await savePortalRecord(context.env, updatedPortal);
    await sendMessage(context, "Список кампаний сохранён для отчётов и клиентского портала.", {
      replyMarkup: buildProjectBackMarkup(projectId),
    });
    return;
  }
  if (action === "report") {
    const accountInfo = await fetchProjectAccountInfo(context, summary, {
      includeCampaigns: true,
      campaignsLimit: 50,
    });
    const campaigns = accountInfo.account?.campaigns ?? [];
    const selectedCampaigns = selection.length
      ? campaigns.filter((campaign) => selection.includes(campaign.id))
      : campaigns.slice(0, 10);
    if (!selectedCampaigns.length) {
      await sendMessage(context, "Кампании не найдены. Обновите список и попробуйте снова.", {
        replyMarkup: buildProjectBackMarkup(projectId),
      });
      return;
    }
    const lines = [
      `📊 Отчёт по выбранным кампаниям — <b>${escapeHtml(summary.name)}</b>`,
      "",
    ];
    selectedCampaigns.forEach((campaign, index) => {
      const spend = campaign.spendFormatted ?? formatCurrencyValue(campaign.spend, campaign.spendCurrency) ?? "—";
      const impressions = campaign.impressions !== undefined ? campaign.impressions.toLocaleString("ru-RU") : "—";
      const clicks = campaign.clicks !== undefined ? campaign.clicks.toLocaleString("ru-RU") : "—";
      lines.push(
        `${index + 1}. ${escapeHtml(campaign.name)} — ${escapeHtml(spend)} · Показы: ${escapeHtml(impressions)} · Клики: ${escapeHtml(clicks)}`,
      );
    });
    await sendMessage(context, lines.join("\n"), { replyMarkup: buildProjectBackMarkup(projectId) });
    return;
  }
  await sendMessage(context, "Неизвестное действие. Выберите вариант из списка.", {
    replyMarkup: buildProjectBackMarkup(projectId),
  });
};

const handleProjectExport = async (context: BotContext, projectId: string): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  await startReportWorkflow(context, "auto", { projectId });
};

const handleProjectPortal = async (context: BotContext, projectId: string): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  const portalRecord = await loadProjectPortalRecord(context, projectId);
  if (!portalRecord) {
    const lines = [
      `🧩 Портал проекта — <b>${escapeHtml(summary.name)}</b>`,
      "",
      "Портал ещё не создан. После создания здесь появится ссылка для клиентов и инструменты управления отображением данных.",
    ];
    const keyboard = {
      inline_keyboard: [
        [{ text: "✨ Создать портал", callback_data: `proj:portal-create:${projectId}` }],
        [{ text: "⬅ К проекту", callback_data: `proj:view:${projectId}` }],
      ],
    };
    await sendMessage(context, lines.join("\n"), { replyMarkup: keyboard });
    return;
  }

  const portalUrl = resolvePortalUrl(context.env, portalRecord.portalId);
  const metricsList = portalRecord.metrics.map((key) => PORTAL_METRIC_LABELS[key] ?? key).join(", ");
  const campaignInfo =
    portalRecord.mode === "manual"
      ? portalRecord.campaignIds.length
        ? `${portalRecord.campaignIds.length} кампаний выбрано`
        : "Ручной режим: выберите кампании"
      : "Авто: активные кампании Meta";
  const lines = [`🧩 Портал проекта — <b>${escapeHtml(summary.name)}</b>`, ""];
  if (portalUrl) {
    lines.push(`Ссылка: <a href="${escapeAttribute(portalUrl)}">${escapeHtml(portalUrl)}</a>`);
  } else {
    lines.push("Ссылка ещё не сгенерирована. Используйте кнопку «Перегенерировать ссылку»." );
  }
  lines.push(
    `Режим: <b>${portalRecord.mode === "manual" ? "ручной" : "автоматический"}</b> · Метрики: <b>${escapeHtml(metricsList)}</b>`,
  );
  lines.push(`Кампании: <b>${escapeHtml(campaignInfo)}</b>`);
  if (portalRecord.lastSharedAt) {
    lines.push(`Последняя отправка клиенту: ${escapeHtml(formatDateTime(portalRecord.lastSharedAt))}`);
  }
  lines.push(
    "",
    "Используйте кнопки ниже, чтобы отправить портал клиенту, выбрать показатели и управлять списком кампаний.",
  );

  const keyboard: { text: string; callback_data?: string; url?: string }[][] = [];
  if (portalUrl) {
    keyboard.push([{ text: "🔗 Открыть портал", url: portalUrl }]);
  }
  keyboard.push([{ text: "📨 Отправить в чат", callback_data: `proj:portal-share:${projectId}` }]);
  keyboard.push([
    { text: `${portalRecord.mode === "auto" ? "✅" : "⚪️"} Авто`, callback_data: `proj:portal-mode:${projectId}:auto` },
    { text: `${portalRecord.mode === "manual" ? "✅" : "⚪️"} Ручной`, callback_data: `proj:portal-mode:${projectId}:manual` },
  ]);
  keyboard.push([{ text: "📊 Метрики", callback_data: `proj:portal-metrics:${projectId}` }]);
  keyboard.push([{ text: "🎯 Кампании", callback_data: `proj:portal-campaigns:${projectId}` }]);
  keyboard.push([{ text: "🔁 Перегенерировать ссылку", callback_data: `proj:portal-regenerate:${projectId}` }]);
  keyboard.push([{ text: "⬅ К проекту", callback_data: `proj:view:${projectId}` }]);

  await sendMessage(context, lines.join("\n"), { replyMarkup: { inline_keyboard: keyboard } });
};

const createPortalRecord = async (context: BotContext, projectId: string): Promise<ProjectPortalRecord> => {
  const now = new Date().toISOString();
  const record: ProjectPortalRecord = {
    portalId: createId(16),
    projectId,
    mode: "auto",
    campaignIds: [],
    metrics: [...DEFAULT_PORTAL_METRICS],
    createdAt: now,
    updatedAt: now,
    lastRegeneratedAt: now,
    lastSharedAt: null,
    lastReportId: null,
  };
  await savePortalRecord(context.env, record);
  return record;
};

const ensurePortalRecord = async (context: BotContext, projectId: string): Promise<ProjectPortalRecord> => {
  const existing = await loadProjectPortalRecord(context, projectId);
  if (existing) {
    return existing;
  }
  return createPortalRecord(context, projectId);
};

const handleProjectPortalCreate = async (context: BotContext, projectId: string): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  const record = await ensurePortalRecord(context, projectId);
  await updateProjectReportPreferences(context, projectId, {
    campaignIds: record.campaignIds,
    metrics: record.metrics,
  });
  if (context.update.callback_query?.id) {
    await answerCallbackQuery(context.env, context.update.callback_query.id, "Портал создан");
  }
  await handleProjectPortal(context, summary.id);
};

const handleProjectPortalRegenerate = async (context: BotContext, projectId: string): Promise<void> => {
  const portalRecord = await ensurePortalRecord(context, projectId);
  const now = new Date().toISOString();
  const updated: ProjectPortalRecord = {
    ...portalRecord,
    portalId: createId(16),
    updatedAt: now,
    lastRegeneratedAt: now,
  };
  await savePortalRecord(context.env, updated);
  await updateProjectReportPreferences(context, projectId, {
    campaignIds: updated.campaignIds,
    metrics: updated.metrics,
  });
  if (context.update.callback_query?.id) {
    await answerCallbackQuery(context.env, context.update.callback_query.id, "Ссылка обновлена");
  }
  await handleProjectPortal(context, projectId);
};

const handleProjectPortalMode = async (
  context: BotContext,
  projectId: string,
  mode: PortalMode,
): Promise<void> => {
  if (mode !== "auto" && mode !== "manual") {
    await sendMessage(context, "Неизвестный режим портала. Доступны авто и ручной.");
    return;
  }
  const portalRecord = await ensurePortalRecord(context, projectId);
  const wasMode = portalRecord.mode;
  const now = new Date().toISOString();
  const updated: ProjectPortalRecord = {
    ...portalRecord,
    mode,
    updatedAt: now,
  };
  await savePortalRecord(context.env, updated);
  await updateProjectReportPreferences(context, projectId, {
    campaignIds: updated.campaignIds,
    metrics: updated.metrics,
  });
  if (context.update.callback_query?.id) {
    const label = mode === "auto" ? "Авто" : "Ручной";
    const text = wasMode === mode ? undefined : `Режим: ${label}`;
    await answerCallbackQuery(context.env, context.update.callback_query.id, text);
  }
  await handleProjectPortal(context, projectId);
};

const renderPortalMetricsMessage = (record: ProjectPortalRecord) => {
  const lines = [
    "📊 Метрики портала",
    "",
    "Выберите показатели, которые будут отображаться в клиентском портале.",
  ];
  const keyboard = DEFAULT_PORTAL_METRICS.map((metric) => [{
    text: `${record.metrics.includes(metric) ? "✅" : "☑️"} ${PORTAL_METRIC_LABELS[metric]}`,
    callback_data: `proj:portal-metric-toggle:${record.projectId}:${metric}`,
  }]);
  keyboard.push([{ text: "⬅ Назад", callback_data: `proj:portal:${record.projectId}` }]);
  return { text: lines.join("\n"), replyMarkup: { inline_keyboard: keyboard } };
};

const handleProjectPortalMetrics = async (context: BotContext, projectId: string): Promise<void> => {
  const record = await ensurePortalRecord(context, projectId);
  const { text, replyMarkup } = renderPortalMetricsMessage(record);
  await sendMessage(context, text, { replyMarkup });
};

const handleProjectPortalMetricToggle = async (
  context: BotContext,
  projectId: string,
  metric: PortalMetricKey,
): Promise<void> => {
  if (!DEFAULT_PORTAL_METRICS.includes(metric)) {
    await sendMessage(context, "Неизвестная метрика. Используйте кнопки на экране.");
    return;
  }
  const record = await ensurePortalRecord(context, projectId);
  const hasMetric = record.metrics.includes(metric);
  let nextMetrics = hasMetric
    ? record.metrics.filter((item) => item !== metric)
    : [...record.metrics, metric];
  if (!nextMetrics.length) {
    if (context.update.callback_query?.id) {
      await answerCallbackQuery(context.env, context.update.callback_query.id, "Оставьте хотя бы одну метрику");
    }
    await handleProjectPortalMetrics(context, projectId);
    return;
  }
  const updated: ProjectPortalRecord = {
    ...record,
    metrics: nextMetrics,
    updatedAt: new Date().toISOString(),
  };
  await savePortalRecord(context.env, updated);
  await updateProjectReportPreferences(context, projectId, { metrics: updated.metrics });
  if (context.update.callback_query?.id) {
    await answerCallbackQuery(context.env, context.update.callback_query.id, hasMetric ? "Скрыто" : "Добавлено");
  }
  const { text, replyMarkup } = renderPortalMetricsMessage(updated);
  const chatId = ensureChatId(context);
  if (chatId && context.update.callback_query?.message) {
    await editTelegramMessage(context.env, {
      chatId,
      messageId: context.update.callback_query.message.message_id,
      text,
      replyMarkup,
    });
  }
};

const truncateCampaignLabel = (label: string, max = 40): string => {
  if (label.length <= max) {
    return label;
  }
  return `${label.slice(0, max - 1)}…`;
};

const handleProjectPortalCampaigns = async (context: BotContext, projectId: string): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  const portalRecord = await ensurePortalRecord(context, projectId);
  if (!summary.adAccountId) {
    await sendMessage(context, "Рекламный кабинет не подключён. Привяжите Meta-аккаунт, чтобы выбирать кампании.", {
      replyMarkup: buildProjectBackMarkup(projectId),
    });
    return;
  }
  const token = await loadMetaToken(context.env);
  const metaEnv = await withMetaSettings(context.env);
  let campaigns: MetaCampaign[] = [];
  try {
    campaigns = await fetchCampaigns(metaEnv, token, summary.adAccountId, { limit: 50, datePreset: "today" });
    await syncCampaignObjectives(context.env, summary.id, campaigns);
  } catch (error) {
    console.warn("Failed to fetch campaigns for portal", projectId, error);
  }
  if (!campaigns.length) {
    await sendMessage(context, "Кампании не найдены. Проверьте активность в рекламном кабинете.", {
      replyMarkup: buildProjectBackMarkup(projectId),
    });
    return;
  }
  const sorted = campaigns
    .slice()
    .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))
    .slice(0, 25);
  const rows = sorted.map((campaign) => [{
    text: `${portalRecord.campaignIds.includes(campaign.id) ? "✅" : "☑️"} ${truncateCampaignLabel(campaign.name)}`,
    callback_data: `proj:portal-campaign-toggle:${projectId}:${campaign.id}`,
  }]);
  if (portalRecord.campaignIds.length) {
    rows.push([{ text: "🧹 Очистить выбор", callback_data: `proj:portal-campaign-clear:${projectId}` }]);
  }
  rows.push([{ text: "⬅ Назад", callback_data: `proj:portal:${projectId}` }]);
  const lines = [
    "🎯 Кампании портала",
    "",
    portalRecord.mode === "manual"
      ? "Выберите кампании, которые будут отображаться в клиентском портале."
      : "Автоматический режим использует активные кампании. Включите ручной режим, чтобы зафиксировать список.",
    "",
    `Выбрано: ${portalRecord.campaignIds.length}`,
  ];
  await sendMessage(context, lines.join("\n"), { replyMarkup: { inline_keyboard: rows } });
};

const handleProjectPortalCampaignToggle = async (
  context: BotContext,
  projectId: string,
  campaignId: string,
): Promise<void> => {
  const record = await ensurePortalRecord(context, projectId);
  const exists = record.campaignIds.includes(campaignId);
  const nextCampaigns = exists
    ? record.campaignIds.filter((id) => id !== campaignId)
    : [...record.campaignIds, campaignId];
  const nextMode: PortalMode = record.mode === "manual" || !exists ? "manual" : record.mode;
  const updated: ProjectPortalRecord = {
    ...record,
    campaignIds: nextCampaigns,
    mode: nextMode,
    updatedAt: new Date().toISOString(),
  };
  await savePortalRecord(context.env, updated);
  await updateProjectReportPreferences(context, projectId, { campaignIds: updated.campaignIds });
  if (context.update.callback_query?.id) {
    await answerCallbackQuery(context.env, context.update.callback_query.id, exists ? "Удалено" : "Добавлено");
  }
  await handleProjectPortalCampaigns(context, projectId);
};

const handleProjectPortalCampaignClear = async (context: BotContext, projectId: string): Promise<void> => {
  const record = await ensurePortalRecord(context, projectId);
  if (!record.campaignIds.length) {
    await handleProjectPortalCampaigns(context, projectId);
    return;
  }
  const updated: ProjectPortalRecord = {
    ...record,
    campaignIds: [],
    updatedAt: new Date().toISOString(),
  };
  await savePortalRecord(context.env, updated);
  await updateProjectReportPreferences(context, projectId, { campaignIds: updated.campaignIds });
  if (context.update.callback_query?.id) {
    await answerCallbackQuery(context.env, context.update.callback_query.id, "Список очищен");
  }
  await handleProjectPortalCampaigns(context, projectId);
};

const handleProjectPortalShare = async (context: BotContext, projectId: string): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  if (!summary.telegramChatId) {
    await sendMessage(context, "К проекту не привязан чат. Подключите Telegram-группу, чтобы отправлять портал клиентам.", {
      replyMarkup: buildProjectBackMarkup(projectId),
    });
    return;
  }
  const portalRecord = await ensurePortalRecord(context, projectId);
  const portalUrl = resolvePortalUrl(context.env, portalRecord.portalId);
  if (!portalUrl) {
    await sendMessage(context, "Ссылка портала не настроена. Укажите PUBLIC_WEB_URL или PORTAL_BASE_URL.", {
      replyMarkup: buildProjectBackMarkup(projectId),
    });
    return;
  }
  const report = await generateReport(context.env, {
    type: "summary",
    projectIds: [projectId],
    datePreset: "today",
    includeMeta: true,
    channel: "telegram",
    triggeredBy: context.username,
    command: "portal_share",
  });
  const asset = await getReportAsset(context.env, report.record.id);
  const chatId = summary.telegramChatId.toString();
  const replyMarkup = {
    inline_keyboard: [[{ text: "Открыть портал", url: portalUrl }]],
  };
  await sendTelegramMessage(context.env, {
    chatId,
    text: `${report.html}\n\n🔗 <a href="${escapeAttribute(portalUrl)}">Открыть портал</a>`,
    replyMarkup,
  });
  if (asset) {
    const fileName = `${summary.name.replace(/[^\w]+/g, "_")}_today.html`;
    await sendTelegramDocument(context.env, {
      chatId,
      data: asset.body,
      fileName,
      contentType: asset.contentType || "text/html; charset=utf-8",
      caption: `Отчёт по проекту ${escapeHtml(summary.name)} за сегодня`,
    });
  }
  const now = new Date().toISOString();
  const updatedRecord: ProjectPortalRecord = {
    ...portalRecord,
    lastSharedAt: now,
    lastReportId: report.record.id,
    updatedAt: now,
  };
  await savePortalRecord(context.env, updatedRecord);
  if (context.update.callback_query?.id) {
    await answerCallbackQuery(context.env, context.update.callback_query.id, "Отправлено");
  }
  await handleProjectPortal(context, projectId);
};

const BILLING_STATUS_LABELS: Record<ProjectBillingState, string> = {
  active: "🟢 Активен",
  pending: "🕒 Ожидает",
  overdue: "⚠️ Просрочен",
  blocked: "⛔️ Блокирован",
};

const handleProjectBilling = async (context: BotContext, projectId: string): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  const billing = summary.billing;
  const payments = await listPayments(context.env).catch(() => [] as PaymentRecord[]);
  const projectPayments = payments
    .filter((payment) => payment.projectId === summary.id)
    .sort((a, b) => Date.parse(b.periodStart) - Date.parse(a.periodStart))
    .slice(0, 5);
  const lines: string[] = [];
  lines.push(`💳 Оплата — <b>${escapeHtml(summary.name)}</b>`);
  lines.push(describeBillingStatus(summary));
  lines.push(describePaymentSchedule(summary));
  if (billing.notes) {
    lines.push("Заметка:");
    lines.push(escapeHtml(billing.notes));
  }
  if (projectPayments.length) {
    lines.push("", "Последние платежи:");
    projectPayments.forEach((payment) => {
      const paid = payment.paidAt ? ` · Оплачен ${formatDate(payment.paidAt)}` : "";
      lines.push(
        `${payment.status === "active" ? "✅" : payment.status === "overdue" ? "⚠️" : "💳"} ${
          escapeHtml(payment.amount.toFixed(2))
        } ${escapeHtml(payment.currency)} · ${escapeHtml(formatDate(payment.periodStart))} — ${escapeHtml(
          formatDate(payment.periodEnd),
        )}${paid}`,
      );
    });
    if (payments.filter((payment) => payment.projectId === summary.id).length > projectPayments.length) {
      lines.push("… остальные платежи доступны в выгрузке отчёта.");
    }
  } else {
    lines.push("", "Платежи ещё не зафиксированы. Добавьте оплату кнопками ниже, чтобы активировать биллинг.");
  }
  lines.push("", "Настройте дату следующего платежа и тариф прямо отсюда — кнопки ниже.");
  const replyMarkup = {
    inline_keyboard: [
      [{ text: "📅 +30 дней", callback_data: `proj:billing-next:${projectId}:30` }],
      [
        { text: "350$", callback_data: `proj:billing-tariff-preset:${projectId}:350` },
        { text: "500$", callback_data: `proj:billing-tariff-preset:${projectId}:500` },
      ],
      [{ text: "📅 Указать дату оплаты", callback_data: `proj:billing-next:${projectId}:custom` }],
      [{ text: "📝 Ввести дату вручную", callback_data: `proj:billing-next:${projectId}:manual` }],
      [{ text: "⬅ Назад", callback_data: `proj:view:${projectId}` }],
    ],
  };
  await sendMessage(context, lines.join("\n"), { replyMarkup });
};

const VALID_BILLING_STATUSES: ProjectBillingState[] = ["active", "pending", "overdue", "blocked"];

const handleProjectBillingStatus = async (
  context: BotContext,
  projectId: string,
  status: ProjectBillingState,
): Promise<void> => {
  if (!VALID_BILLING_STATUSES.includes(status)) {
    await sendMessage(context, "❌ Неизвестный статус оплаты. Выберите вариант из списка.");
    return;
  }
  const updated = await updateProjectRecord(context.env, projectId, { billingStatus: status });
  if (!updated) {
    await sendMessage(context, "❌ Проект не найден. Обновите список проектов.");
    return;
  }
  await clearPaymentReminder(context.env, projectId).catch((error) => {
    console.warn("Failed to clear payment reminder from bot", projectId, error);
  });
  await sendMessage(
    context,
    `✅ Статус биллинга обновлён: ${escapeHtml(updated.name)} — ${BILLING_STATUS_LABELS[status]}.`,
  );
  await handleProjectBilling(context, projectId);
};

const computeNextPaymentDate = (preset: string): string | null => {
  if (preset === "clear") {
    return null;
  }
  if (preset === "today") {
    return new Date().toISOString();
  }
  if (preset === "yesterday") {
    return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  }
  const days = Number(preset);
  if (!Number.isFinite(days) || days <= 0) {
    return null;
  }
  const ms = days * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
};

const parseNextPaymentInput = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = Date.parse(`${trimmed}T00:00:00Z`);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  const dotMatch = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dotMatch) {
    const [, day, month, year] = dotMatch;
    const isoCandidate = `${year}-${month}-${day}`;
    const parsed = Date.parse(`${isoCandidate}T00:00:00Z`);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString();
};

const parseTariffInput = (value: string): number | null => {
  const normalized = value.replace(/[,\s]+/g, (match) => (match.includes(",") ? "." : ""));
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return Number(amount.toFixed(2));
};

const handleProjectBillingNext = async (
  context: BotContext,
  projectId: string,
  preset: string,
): Promise<void> => {
  const adminId = context.userId;
  if (preset === "custom") {
    const keyboard = {
      inline_keyboard: [
        [
          { text: "Сегодня", callback_data: `proj:billing-next:${projectId}:today` },
          { text: "Вчера", callback_data: `proj:billing-next:${projectId}:yesterday` },
        ],
        [{ text: "📝 Ввести дату", callback_data: `proj:billing-next:${projectId}:manual` }],
        [{ text: "⬅ Назад", callback_data: `proj:billing:${projectId}` }],
      ],
    };
    await sendMessage(context, "Выберите дату следующего платежа:", { replyMarkup: keyboard });
    return;
  }
  if (preset === "manual") {
    if (!adminId) {
      await sendMessage(context, "❌ Пользователь не найден. Повторите команду из админского чата.");
      return;
    }
    await savePendingBillingOperation(context.env, adminId, {
      action: "set-next-payment",
      projectId,
    });
    await sendMessage(
      context,
      "📅 Отправьте дату следующего платежа в формате YYYY-MM-DD или DD.MM.YYYY.",
      {
        replyMarkup: {
          inline_keyboard: [[{ text: "⬅ К оплате", callback_data: `proj:billing:${projectId}` }]],
        },
      },
    );
    return;
  }
  const nextPaymentDate = computeNextPaymentDate(preset);
  const updated = await updateProjectRecord(context.env, projectId, {
    nextPaymentDate,
  });
  if (!updated) {
    await sendMessage(context, "❌ Проект не найден. Обновите список проектов.");
    return;
  }
  await clearPaymentReminder(context.env, projectId).catch((error) => {
    console.warn("Failed to clear payment reminder from bot", projectId, error);
  });
  if (adminId) {
    await clearPendingBillingOperation(context.env, adminId).catch(() => undefined);
  }
  const label = nextPaymentDate ? formatDate(nextPaymentDate) : "не запланирована";
  await sendMessage(context, `✅ Следующая оплата: ${escapeHtml(label)}.`);
  await handleProjectBilling(context, projectId);
};

const handleProjectBillingTariff = async (context: BotContext, projectId: string): Promise<void> => {
  const adminId = context.userId;
  if (!adminId) {
    await sendMessage(context, "❌ Пользователь не определён. Отправьте команду из приватного чата.");
    return;
  }
  await savePendingBillingOperation(context.env, adminId, {
    action: "set-tariff",
    projectId,
  });
  await sendMessage(
    context,
    "💵 Введите новый тариф в валюте проекта (число).",
    {
      replyMarkup: {
        inline_keyboard: [[{ text: "⬅ К оплате", callback_data: `proj:billing:${projectId}` }]],
      },
    },
  );
};

const handleProjectBillingTariffPreset = async (
  context: BotContext,
  projectId: string,
  rawAmount: string,
): Promise<void> => {
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    await sendMessage(context, "❌ Не удалось распознать сумму. Выберите другой вариант.");
    return;
  }
  const updated = await updateProjectRecord(context.env, projectId, { tariff: Number(amount.toFixed(2)) });
  if (!updated) {
    await sendMessage(context, "❌ Проект не найден. Обновите список проектов.");
    return;
  }
  if (context.update.callback_query?.id) {
    await answerCallbackQuery(context.env, context.update.callback_query.id, `Тариф: ${amount}`);
  }
  await handleProjectBilling(context, projectId);
};

export const handlePendingBillingInput = async (context: BotContext): Promise<boolean> => {
  if (context.update.callback_query) {
    return false;
  }
  const adminId = context.userId;
  if (!adminId) {
    return false;
  }
  const pending = await loadPendingBillingOperation(context.env, adminId);
  if (!pending) {
    return false;
  }
  const text = context.text?.trim();
  if (!text) {
    await sendMessage(context, "ℹ️ Введите значение текстом.");
    return true;
  }
  if (pending.action === "set-next-payment") {
    const iso = parseNextPaymentInput(text);
    if (!iso) {
      await sendMessage(context, "❌ Не удалось распознать дату. Используйте формат YYYY-MM-DD или DD.MM.YYYY.");
      return true;
    }
    const updated = await updateProjectRecord(context.env, pending.projectId, { nextPaymentDate: iso });
    if (!updated) {
      await sendMessage(context, "❌ Проект не найден. Обновите список проектов.");
      return true;
    }
    await clearPendingBillingOperation(context.env, adminId);
    await sendMessage(context, `✅ Следующая оплата сохранена: ${escapeHtml(formatDate(iso))}.`);
    await handleProjectBilling(context, pending.projectId);
    return true;
  }
  if (pending.action === "set-tariff") {
    const amount = parseTariffInput(text);
    if (amount === null) {
      await sendMessage(context, "❌ Не удалось распознать сумму. Пример: 350 или 1200.50.");
      return true;
    }
    const updated = await updateProjectRecord(context.env, pending.projectId, { tariff: amount });
    if (!updated) {
      await sendMessage(context, "❌ Проект не найден. Обновите список проектов.");
      return true;
    }
    await clearPendingBillingOperation(context.env, adminId);
    await sendMessage(context, `✅ Тариф обновлён: ${amount.toFixed(2)}.`);
    await handleProjectBilling(context, pending.projectId);
    return true;
  }
  return false;
};

export const handlePendingProjectEditInput = async (context: BotContext): Promise<boolean> => {
  if (context.update.callback_query) {
    return false;
  }
  const adminId = context.userId;
  if (!adminId) {
    return false;
  }
  const pending = await loadPendingProjectEditOperation(context.env, adminId);
  if (!pending) {
    return false;
  }
  const text = context.text?.trim();
  if (!text) {
    await sendMessage(context, "ℹ️ Отправьте новое название текстом (до 80 символов).", {
      replyMarkup: { inline_keyboard: [[{ text: "↩️ Отмена", callback_data: `proj:edit-cancel:${pending.projectId}` }]] },
    });
    return true;
  }
  if (pending.action === "rename") {
    if (text.length < 3) {
      await sendMessage(context, "❌ Название должно содержать не менее 3 символов.", {
        replyMarkup: { inline_keyboard: [[{ text: "↩️ Отмена", callback_data: `proj:edit-cancel:${pending.projectId}` }]] },
      });
      return true;
    }
    if (text.length > 80) {
      await sendMessage(context, "❌ Максимальная длина названия — 80 символов.", {
        replyMarkup: { inline_keyboard: [[{ text: "↩️ Отмена", callback_data: `proj:edit-cancel:${pending.projectId}` }]] },
      });
      return true;
    }
    const summary = await ensureProjectSummary(context, pending.projectId);
    if (!summary) {
      await clearPendingProjectEditOperation(context.env, adminId).catch(() => undefined);
      return true;
    }
    if (text === summary.name) {
      await sendMessage(
        context,
        "ℹ️ Новое название совпадает с текущим. Введите другое значение или отмените действие.",
        {
          replyMarkup: {
            inline_keyboard: [[{ text: "↩️ Отмена", callback_data: `proj:edit-cancel:${pending.projectId}` }]],
          },
        },
      );
      return true;
    }
    const updated = await updateProjectRecord(context.env, pending.projectId, { name: text });
    if (!updated) {
      await sendMessage(context, "❌ Проект не найден. Обновите список проектов.");
      await clearPendingProjectEditOperation(context.env, adminId).catch(() => undefined);
      return true;
    }
    await clearPendingProjectEditOperation(context.env, adminId);
    await handleProjectView(context, pending.projectId, {
      prefix: `✅ Название обновлено: <b>${escapeHtml(text)}</b>`,
    });
    return true;
  }
  return false;
};

const buildProjectEditMarkup = (summary: ProjectSummary) => {
  const chatUrl = resolveProjectChatUrl(summary);
  return {
    inline_keyboard: [
      [{ text: "✏️ Переименовать", callback_data: `proj:edit-name:${summary.id}` }],
      [
        chatUrl
          ? { text: "📲 Открыть чат", url: chatUrl }
          : { text: "📲 Чат-группа", callback_data: `proj:chat:${summary.id}` },
        { text: "📈 Отчёты", callback_data: `proj:report:${summary.id}` },
      ],
      [
        { text: "⚙ Настройки", callback_data: `proj:settings:${summary.id}` },
        { text: "⬅ К проекту", callback_data: `proj:view:${summary.id}` },
      ],
      [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
    ],
  };
};

const handleProjectEdit = async (context: BotContext, projectId: string): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  const lines = [
    `✏️ Управление проектом — <b>${escapeHtml(summary.name)}</b>`,
    "",
    summary.metaAccountName
      ? `🧩 Meta: ${escapeHtml(summary.metaAccountName)} (${escapeHtml(summary.adAccountId ?? "—")})`
      : "🧩 Meta: не подключено",
  ];
  if (summary.telegramTitle || summary.telegramChatId) {
    const chatLabel = summary.telegramTitle ?? `ID ${summary.telegramChatId}`;
    lines.push(`📲 Чат: ${escapeHtml(chatLabel)}`);
  } else {
    lines.push("📲 Чат: не подключён");
  }
  lines.push("", "Выберите действие для обновления данных проекта.");
  await sendMessage(context, lines.join("\n"), { replyMarkup: buildProjectEditMarkup(summary) });
};

const handleProjectEditNamePrompt = async (context: BotContext, projectId: string): Promise<void> => {
  const adminId = context.userId;
  if (!adminId) {
    await sendMessage(context, "❌ Не удалось определить администратора. Повторите команду в приватном чате.");
    return;
  }
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  await savePendingProjectEditOperation(context.env, adminId, { action: "rename", projectId });
  const lines = [
    `✏️ Новое название — <b>${escapeHtml(summary.name)}</b>`,
    "",
    "Отправьте новое название текстом (до 80 символов).",
  ];
  await sendMessage(context, lines.join("\n"), {
    replyMarkup: {
      inline_keyboard: [[{ text: "↩️ Отмена", callback_data: `proj:edit-cancel:${projectId}` }]],
    },
  });
};

const handleProjectEditCancel = async (context: BotContext, projectId: string): Promise<void> => {
  const adminId = context.userId;
  if (adminId) {
    await clearPendingProjectEditOperation(context.env, adminId).catch(() => undefined);
  }
  await handleProjectEdit(context, projectId);
};

const formatProjectSettingsLines = (
  summary: ProjectSummary,
  settings: ProjectSettings,
): string[] => {
  const frequencyLabel =
    settings.reportFrequency === "weekly"
      ? "📅 Автоотчёт: еженедельно (понедельник за прошлую неделю)"
      : "📅 Автоотчёт: ежедневно";
  const quietLabel = settings.quietWeekends
    ? "🛌 Тихие выходные: включены"
    : "🛌 Тихие выходные: выключены";
  const silentLabel = settings.silentReports
    ? "🤫 Тихая отправка: включена"
    : "🤫 Тихая отправка: выключена";
  const alertsLabel = settings.leadAlerts
    ? "🚨 Аллерты по лидам: включены"
    : "🚨 Аллерты по лидам: отключены";
  return [
    `⚙ Настройки проекта — <b>${escapeHtml(summary.name)}</b>`,
    "",
    frequencyLabel,
    quietLabel,
    silentLabel,
    alertsLabel,
    "",
    "Переключайте опции кнопками ниже.",
  ];
};

const buildProjectSettingsMarkup = (projectId: string, settings: ProjectSettings) => ({
  inline_keyboard: [
    [
      {
        text: `${settings.reportFrequency === "daily" ? "✅" : "☑️"} Ежедневно`,
        callback_data: `proj:settings-frequency:${projectId}:daily`,
      },
      {
        text: `${settings.reportFrequency === "weekly" ? "✅" : "☑️"} Еженедельно`,
        callback_data: `proj:settings-frequency:${projectId}:weekly`,
      },
    ],
    [
      {
        text: `${settings.quietWeekends ? "✅" : "❌"} Тихие выходные`,
        callback_data: `proj:settings-quiet:${projectId}:${settings.quietWeekends ? "off" : "on"}`,
      },
      {
        text: `${settings.silentReports ? "✅" : "❌"} Тихая отправка`,
        callback_data: `proj:settings-silent:${projectId}:${settings.silentReports ? "off" : "on"}`,
      },
    ],
    [
      {
        text: `${settings.leadAlerts ? "✅" : "❌"} Аллерты по лидам`,
        callback_data: `proj:settings-alerts:${projectId}:${settings.leadAlerts ? "off" : "on"}`,
      },
    ],
    [{ text: "⬅ К проекту", callback_data: `proj:view:${projectId}` }],
    [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
  ],
});

const handleProjectSettings = async (context: BotContext, projectId: string): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  const settings = {
    ...DEFAULT_PROJECT_SETTINGS,
    ...extractProjectSettings(summary.settings ?? {}),
  } satisfies ProjectSettings;
  const lines = formatProjectSettingsLines(summary, settings);
  await sendMessage(context, lines.join("\n"), {
    replyMarkup: buildProjectSettingsMarkup(projectId, settings),
  });
};

const handleProjectSettingsUpdate = async (
  context: BotContext,
  projectId: string,
  patch: Partial<ProjectSettings>,
  confirmation?: string,
): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  const updatedSettings = applyProjectSettingsPatch(summary.settings ?? {}, patch);
  await updateProjectRecord(context.env, projectId, { settings: updatedSettings });
  if (context.update.callback_query?.id) {
    await answerCallbackQuery(context.env, context.update.callback_query.id, confirmation ?? "Готово");
  }
  await handleProjectSettings(context, projectId);
};

const handleProjectSettingsFrequency = async (
  context: BotContext,
  projectId: string,
  frequency: string,
): Promise<void> => {
  const safeFrequency: ProjectReportFrequency = frequency === "weekly" ? "weekly" : "daily";
  await handleProjectSettingsUpdate(context, projectId, { reportFrequency: safeFrequency },
    safeFrequency === "weekly" ? "Еженедельный отчёт" : "Ежедневный отчёт",
  );
};

const handleProjectSettingsQuiet = async (
  context: BotContext,
  projectId: string,
  nextState: string,
): Promise<void> => {
  const enabled = nextState === "on";
  await handleProjectSettingsUpdate(context, projectId, { quietWeekends: enabled }, enabled ? "Тихие выходные включены" : "Тихие выходные выключены");
};

const handleProjectSettingsSilent = async (
  context: BotContext,
  projectId: string,
  nextState: string,
): Promise<void> => {
  const enabled = nextState === "on";
  await handleProjectSettingsUpdate(context, projectId, { silentReports: enabled },
    enabled ? "Тихая отправка включена" : "Тихая отправка выключена",
  );
};

const handleProjectSettingsAlerts = async (
  context: BotContext,
  projectId: string,
  nextState: string,
): Promise<void> => {
  const enabled = nextState === "on";
  await handleProjectSettingsUpdate(context, projectId, { leadAlerts: enabled },
    enabled ? "Аллерты включены" : "Аллерты отключены",
  );
};

const buildProjectDeleteMarkup = (projectId: string) => ({
  inline_keyboard: [
    [
      { text: "❌ Подтвердить удаление", callback_data: `proj:delete-confirm:${projectId}` },
      { text: "↩️ Отмена", callback_data: `proj:view:${projectId}` },
    ],
    [
      { text: "📊 Все проекты", callback_data: "cmd:projects" },
      { text: "🏠 Меню", callback_data: "cmd:menu" },
    ],
  ],
});

const handleProjectDelete = async (context: BotContext, projectId: string): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  const adminUrl = resolveAdminProjectUrl(context.env, summary.id);
  const lines = [
    `❌ Удаление проекта — <b>${escapeHtml(summary.name)}</b>`,
    "",
    "После подтверждения бот удалит лиды, отчёты, напоминания и отвяжет Meta-аккаунт с Telegram-группой.",
    "Действие необратимо.",
  ];
  if (adminUrl) {
    lines.push("", `🔗 Браузер: <a href="${escapeAttribute(adminUrl)}">Открыть проект</a>`);
  }
  lines.push(
    "",
    "Нажмите «❌ Подтвердить удаление», чтобы завершить действие, или «↩️ Отмена», чтобы вернуться в карточку.",
  );
  await sendMessage(context, lines.join("\n"), { replyMarkup: buildProjectDeleteMarkup(projectId) });
};

const formatProjectDeletionSummary = (summary: ProjectDeletionSummary): string[] => {
  const lines: string[] = [`✅ Проект удалён — <b>${escapeHtml(summary.project.name)}</b>`, ""];
  const accountName = summary.metaAccount?.accountName ?? summary.project.metaAccountName;
  if (accountName) {
    lines.push(`🧩 Meta-аккаунт освобождён: <b>${escapeHtml(accountName)}</b>.`);
  }
  const groupTitle = summary.telegramGroup?.title ?? summary.project.telegramTitle;
  const groupId = summary.telegramGroup?.chatId ?? summary.project.telegramChatId ?? summary.project.chatId;
  if (groupTitle || groupId) {
    const label = groupTitle ? escapeHtml(groupTitle) : `ID ${escapeHtml(groupId ?? "—")}`;
    lines.push(`👥 Группа отвязана: ${label}.`);
  }
  if (summary.removedLeads > 0) {
    lines.push(`💬 Лиды очищены: ${summary.removedLeads}.`);
  }
  if (summary.removedPayments > 0) {
    lines.push(`💳 Удалено платежей: ${summary.removedPayments}.`);
  }
  if (summary.removedReports > 0) {
    lines.push(`📈 Архив отчётов очищен: ${summary.removedReports}.`);
  }
  if (summary.updatedSchedules > 0) {
    lines.push(`⏰ Расписания обновлены: ${summary.updatedSchedules}.`);
  }
  if (summary.clearedLeadReminders > 0 || summary.clearedPaymentReminders > 0) {
    const parts: string[] = [];
    if (summary.clearedLeadReminders > 0) {
      parts.push(`лиды — ${summary.clearedLeadReminders}`);
    }
    if (summary.clearedPaymentReminders > 0) {
      parts.push(`оплаты — ${summary.clearedPaymentReminders}`);
    }
    lines.push(`🔔 Напоминания сняты (${parts.join(", ")}).`);
  }
  lines.push(
    "",
    "Meta-аккаунт и группа доступны для нового проекта; обновите список Meta или запустите мастер «➕ Новый проект».",
  );
  return lines;
};

const handleProjectDeleteConfirm = async (context: BotContext, projectId: string): Promise<void> => {
  const result = await deleteProjectCascade(context.env, projectId);
  if (!result) {
    await sendMessage(context, "❌ Проект не найден. Список уже обновлён или проект был удалён ранее.", {
      replyMarkup: {
        inline_keyboard: [
          [{ text: "📊 Список проектов", callback_data: "cmd:projects" }],
          [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
        ],
      },
    });
    return;
  }

  if (result.telegramGroup?.chatId) {
    const noticeLines = [
      `⚠️ Проект «${result.project.name}» отключён администратором.`,
      "Meta-аккаунт и уведомления для этого чата остановлены.",
    ];
    await sendTelegramMessage(context.env, {
      chatId: result.telegramGroup.chatId,
      text: noticeLines.join("\n"),
    }).catch((error) => {
      console.warn("Failed to notify chat about project deletion", result.telegramGroup?.chatId, error);
    });
  }

  const lines = formatProjectDeletionSummary(result);
  const replyMarkup = {
    inline_keyboard: [
      [{ text: "📊 Список проектов", callback_data: "cmd:projects" }],
      [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
    ],
  };
  await sendMessage(context, lines.join("\n"), { replyMarkup });
};

const handleProjectDeleteCancel = async (context: BotContext, projectId: string): Promise<void> => {
  await handleProjectView(context, projectId);
};

const handleProjectNew = async (context: BotContext): Promise<void> => {
  const userId = context.userId;
  if (!userId) {
    await sendMessage(context, "❌ Не удалось определить администратора. Повторите команду.");
    return;
  }

  const [accounts, groups] = await Promise.all([
    listMetaAccountLinks(context.env),
    ensureTelegramGroupIndex(context),
  ]);

  const availableAccounts = accounts.filter((account) => !account.isLinked);
  const availableGroups = groups.filter((group) => group.registered && !group.linkedProjectId);

  await savePendingMetaLink(context.env, userId, { flow: "project" });

  const lines = [
    "➕ Новый проект",
    "",
    "Шаг 1. Выберите рекламный аккаунт Meta, который хотите привязать.",
  ];

  if (!availableGroups.length) {
    lines.push(
      "",
      "Доступных Telegram-групп пока нет. Выполните команду /reg в нужном чате и вернитесь к мастеру.",
    );
  }

  if (!availableAccounts.length) {
    lines.push(
      "",
      "Свободные рекламные аккаунты не найдены. Добавьте их в разделе «🔗 Meta-аккаунты» или отвяжите неиспользуемые проекты.",
    );
    await sendMessage(context, lines.join("\n"), {
      replyMarkup: {
        inline_keyboard: [
          [{ text: "🔗 Meta-аккаунты", callback_data: "cmd:meta" }],
          [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
        ],
      },
    });
    return;
  }

  await sendMessage(context, lines.join("\n"), {
    replyMarkup: buildProjectNewMetaMarkup(availableAccounts),
  });
};

const handleProjectNewMetaSelection = async (context: BotContext, accountId: string): Promise<void> => {
  const userId = context.userId;
  if (!userId) {
    await sendMessage(context, "❌ Не удалось определить администратора. Повторите команду.");
    return;
  }

  await savePendingMetaLink(context.env, userId, { flow: "project" });
  await handleMetaAccountSelection(context, accountId);
};

const handleProjectNewGroupSelection = async (context: BotContext, chatId: string): Promise<void> => {
  await handleMetaGroupSelection(context, chatId);
};

const handleProjectNewConfirm = async (context: BotContext): Promise<void> => {
  await handleMetaLinkConfirm(context);
};

const handleProjectNewCancel = async (context: BotContext): Promise<void> => {
  if (context.userId) {
    try {
      await clearPendingMetaLink(context.env, context.userId);
    } catch (error) {
      console.warn("Failed to clear pending project link", error);
    }
  }

  await sendMessage(context, "❌ Создание проекта отменено.", {
    replyMarkup: {
      inline_keyboard: [
        [{ text: "📊 Проекты", callback_data: "cmd:projects" }],
        [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
      ],
    },
  });
};

const formatProjectLines = (summaries: ProjectSummary[]): string[] => {
  if (!summaries.length) {
    return [
      "📊 Проекты",
      "",
      "Пока нет активных проектов.",
      "Нажмите «➕ Новый проект», чтобы создать его и привязать чат.",
    ];
  }
  return ["📊 Ваши проекты:", ""];
};

const handleProjects = async (context: BotContext): Promise<void> => {
  const summaries = await loadProjectSummaries(context);
  let accounts: MetaAccountLinkRecord[] = [];
  try {
    accounts = await listMetaAccountLinks(context.env);
  } catch (error) {
    console.warn("Failed to load meta accounts for project list", error);
  }
  const metaIndex = new Map<string, MetaAccountLinkRecord>();
  for (const account of accounts) {
    metaIndex.set(account.accountId, account);
  }
  const lines = formatProjectLines(summaries);
  await sendMessage(context, lines.join("\n"), {
    replyMarkup: buildProjectListMarkup(summaries, metaIndex),
  });
};

const ensureProjectSummary = async (
  context: BotContext,
  projectId: string,
): Promise<ProjectSummary | null> => {
  const summary = await loadProjectSummaryById(context, projectId);
  if (summary) {
    return summary;
  }
  await sendMessage(
    context,
    [
      "📊 Проект не найден",
      "",
      `ID: <code>${escapeHtml(projectId)}</code>`,
      "Откройте раздел «📊 Проекты» и обновите список.",
    ].join("\n"),
  );
  return null;
};

const buildUserOverviewLines = (users: UserRecord[]): string[] => {
  const sorted = sortUsers(users);
  const totalsByRole = USER_ROLE_SEQUENCE.map((role) => ({
    role,
    count: sorted.filter((user) => user.role === role).length,
  }));

  const lines: string[] = ["👥 Пользователи", ""];
  if (!sorted.length) {
    lines.push("Пока нет зарегистрированных пользователей.");
    lines.push("Добавьте первого участника кнопкой ниже.");
    return lines;
  }

  lines.push(`Всего: <b>${sorted.length}</b>`);
  totalsByRole.forEach((entry) => {
    lines.push(`${USER_ROLE_ICON[entry.role]} ${USER_ROLE_LABEL[entry.role]}: ${entry.count}`);
  });
  lines.push(
    "",
    "Выберите пользователя, чтобы изменить роль или удалить его. Кнопка ниже добавит нового участника.",
  );
  return lines;
};

const handleUsers = async (context: BotContext): Promise<void> => {
  const users = await listUsers(context.env);
  const sorted = sortUsers(users);
  const lines = buildUserOverviewLines(sorted);
  await sendMessage(context, lines.join("\n"), {
    replyMarkup: buildUserListMarkup(sorted),
  });
};

const buildUserDeleteMarkup = (userId: string) => ({
  inline_keyboard: [
    [
      { text: "✅ Удалить", callback_data: `user:delete-confirm:${userId}` },
      { text: "⬅ Назад", callback_data: `user:view:${userId}` },
    ],
    [{ text: "👥 К списку", callback_data: "cmd:users" }],
    [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
  ],
});

interface UserCandidate {
  id: string;
  username?: string | null;
  name?: string | null;
}

const extractUserCandidate = (context: BotContext): UserCandidate | null => {
  const message = context.update.message ?? context.update.edited_message;
  if (!message) {
    return null;
  }

  const contact = (message as { contact?: { user_id?: number; first_name?: string; last_name?: string } }).contact;
  if (contact?.user_id) {
    const nameParts = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
    return {
      id: contact.user_id.toString(),
      name: nameParts || null,
    };
  }

  const forward = (message as { forward_from?: { id?: number; username?: string; first_name?: string; last_name?: string } })
    .forward_from;
  if (forward?.id) {
    const nameParts = [forward.first_name, forward.last_name].filter(Boolean).join(" ");
    return {
      id: forward.id.toString(),
      username: forward.username ?? null,
      name: nameParts || null,
    };
  }

  const text = message.text?.trim();
  if (text) {
    const idMatch = text.match(/\d{4,}/);
    if (!idMatch) {
      return null;
    }
    const usernameMatch = text.match(/@([a-zA-Z0-9_]{4,})/);
    const cleanedName = text.replace(/@([a-zA-Z0-9_]{4,})/g, "").replace(/\d{4,}/g, "").trim();
    return {
      id: idMatch[0],
      username: usernameMatch ? usernameMatch[1] : null,
      name: cleanedName || null,
    };
  }

  return null;
};

const renderUserCard = async (
  context: BotContext,
  user: UserRecord,
  options: { prefix?: string } = {},
): Promise<void> => {
  const lines: string[] = [];
  if (options.prefix) {
    lines.push(options.prefix, "");
  }
  lines.push(`👤 ${escapeHtml(formatUserTitle(user))}`);
  lines.push(`ID: <code>${escapeHtml(user.id)}</code>`);
  if (user.username) {
    lines.push(`Username: @${escapeHtml(user.username)}`);
  }
  if (user.name && (!user.username || user.name !== user.username)) {
    lines.push(`Имя: ${escapeHtml(user.name)}`);
  }
  lines.push(`Роль: ${escapeHtml(describeUserRole(user.role))}`);
  if (user.registeredAt) {
    lines.push(`Зарегистрирован: ${formatDateTime(user.registeredAt)}`);
  }
  lines.push(
    "",
    "Используйте кнопки ниже, чтобы обновить роль или удалить пользователя.",
  );
  await sendMessage(context, lines.join("\n"), { replyMarkup: buildUserActionsMarkup(user) });
};

const handleUserView = async (context: BotContext, userId: string): Promise<void> => {
  const users = await listUsers(context.env);
  const user = users.find((entry) => entry.id === userId);
  if (!user) {
    await sendMessage(
      context,
      [
        "👥 Пользователь не найден",
        "",
        `ID: <code>${escapeHtml(userId)}</code>`,
        "Обновите список и попробуйте снова.",
      ].join("\n"),
      { replyMarkup: { inline_keyboard: [[{ text: "👥 К списку", callback_data: "cmd:users" }]] } },
    );
    return;
  }
  await renderUserCard(context, user);
};

const handleUserAdd = async (context: BotContext): Promise<void> => {
  if (!context.userId) {
    await sendMessage(context, "❌ Не удалось определить администратора. Повторите команду.");
    return;
  }
  await savePendingUserOperation(context.env, context.userId, { action: "create" });
  const lines = [
    "👥 Добавление пользователя",
    "",
    "Отправьте отдельным сообщением Telegram ID пользователя, его контакт или пересланное сообщение.",
    "После получения данных выберите роль из списка.",
  ];
  await sendMessage(context, lines.join("\n"), { replyMarkup: USER_CANCEL_MARKUP });
};

const handleUserCancel = async (context: BotContext): Promise<void> => {
  if (context.userId) {
    await clearPendingUserOperation(context.env, context.userId).catch((error) =>
      console.warn("Failed to clear pending user operation", error),
    );
  }
  const users = await listUsers(context.env);
  const sorted = sortUsers(users);
  const lines = ["❌ Операция отменена.", "", ...buildUserOverviewLines(sorted)];
  await sendMessage(context, lines.join("\n"), { replyMarkup: buildUserListMarkup(sorted) });
};

const handleUserRoleChange = async (
  context: BotContext,
  userId: string,
  role: UserRole,
): Promise<void> => {
  const users = await listUsers(context.env);
  const index = users.findIndex((entry) => entry.id === userId);
  if (index < 0) {
    await sendMessage(context, "👥 Пользователь не найден. Обновите список.", {
      replyMarkup: { inline_keyboard: [[{ text: "👥 К списку", callback_data: "cmd:users" }]] },
    });
    return;
  }

  const current = users[index];
  if (current.role === role) {
    await renderUserCard(context, current, { prefix: "ℹ️ Роль уже назначена." });
    return;
  }

  const updated: UserRecord = {
    ...current,
    role,
    registeredAt: current.registeredAt ?? current.createdAt,
  };
  users[index] = updated;
  await saveUsers(context.env, users);
  await renderUserCard(context, updated, { prefix: "✅ Роль обновлена." });
};

const handleUserDeletePrompt = async (context: BotContext, userId: string): Promise<void> => {
  const users = await listUsers(context.env);
  const user = users.find((entry) => entry.id === userId);
  if (!user) {
    await sendMessage(context, "👥 Пользователь не найден. Обновите список.", {
      replyMarkup: { inline_keyboard: [[{ text: "👥 К списку", callback_data: "cmd:users" }]] },
    });
    return;
  }
  const lines = [
    "🗑 Удаление пользователя",
    "",
    `ID: <code>${escapeHtml(user.id)}</code>`,
    `Имя: ${escapeHtml(formatUserTitle(user))}`,
    "",
    "Удаление приведёт к потере доступа к проектам и отчётам. Подтвердите действие.",
  ];
  await sendMessage(context, lines.join("\n"), { replyMarkup: buildUserDeleteMarkup(user.id) });
};

const handleUserDeleteConfirm = async (context: BotContext, userId: string): Promise<void> => {
  const users = await listUsers(context.env);
  const index = users.findIndex((entry) => entry.id === userId);
  if (index < 0) {
    await sendMessage(context, "👥 Пользователь уже удалён.", {
      replyMarkup: { inline_keyboard: [[{ text: "👥 К списку", callback_data: "cmd:users" }]] },
    });
    return;
  }
  const removed = users.splice(index, 1)[0];
  await saveUsers(context.env, users);
  const sorted = sortUsers(users);
  const lines = [
    "🗑 Пользователь удалён",
    "",
    `ID: <code>${escapeHtml(removed.id)}</code>`,
    removed.username ? `Username: @${escapeHtml(removed.username)}` : null,
    removed.name ? `Имя: ${escapeHtml(removed.name)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  await sendMessage(context, lines, { replyMarkup: buildUserListMarkup(sorted) });
};

const handleUserCreateRole = async (context: BotContext, role: UserRole): Promise<void> => {
  if (!context.userId) {
    await sendMessage(context, "❌ Не удалось определить администратора. Повторите команду.");
    return;
  }
  const pending = await loadPendingUserOperation(context.env, context.userId);
  if (!pending || pending.action !== "create-role" || !pending.targetUserId) {
    await sendMessage(context, "❌ Запрос не найден. Начните добавление пользователя заново.");
    return;
  }

  const users = await listUsers(context.env);
  if (users.some((entry) => entry.id === pending.targetUserId)) {
    await clearPendingUserOperation(context.env, context.userId);
    await sendMessage(context, "ℹ️ Пользователь уже существует. Обновите список.", {
      replyMarkup: buildUserListMarkup(sortUsers(users)),
    });
    return;
  }

  const now = new Date().toISOString();
  const record: UserRecord = {
    id: pending.targetUserId,
    username: pending.username ?? undefined,
    name: pending.name ?? undefined,
    role,
    createdAt: now,
    registeredAt: now,
  };

  users.push(record);
  await saveUsers(context.env, users);
  await clearPendingUserOperation(context.env, context.userId);
  await renderUserCard(context, record, { prefix: "✅ Пользователь добавлен." });
};

export const handlePendingUserInput = async (context: BotContext): Promise<boolean> => {
  const adminId = context.userId;
  if (!adminId || context.update.callback_query) {
    return false;
  }
  const pending = await loadPendingUserOperation(context.env, adminId);
  if (!pending) {
    return false;
  }
  if (pending.action === "create-role") {
    await sendMessage(context, "ℹ️ Выберите роль с помощью кнопок ниже.", {
      replyMarkup: USER_CREATION_ROLE_MARKUP,
    });
    return true;
  }

  const candidate = extractUserCandidate(context);
  if (!candidate) {
    await sendMessage(
      context,
      "❌ Не удалось определить Telegram ID. Отправьте цифровой ID, контакт или пересланное сообщение пользователя.",
      { replyMarkup: USER_CANCEL_MARKUP },
    );
    return true;
  }

  const users = await listUsers(context.env);
  const existing = users.find((entry) => entry.id === candidate.id);
  if (existing) {
    await clearPendingUserOperation(context.env, adminId);
    await renderUserCard(context, existing, { prefix: "ℹ️ Пользователь уже зарегистрирован." });
    return true;
  }

  await savePendingUserOperation(context.env, adminId, {
    action: "create-role",
    targetUserId: candidate.id,
    username: candidate.username ?? null,
    name: candidate.name ?? null,
  });

  const summaryLines = [
    "👥 Новый пользователь",
    "",
    `ID: <code>${escapeHtml(candidate.id)}</code>`,
    candidate.username ? `Username: @${escapeHtml(candidate.username)}` : null,
    candidate.name ? `Имя: ${escapeHtml(candidate.name)}` : null,
    "",
    "Выберите роль для нового пользователя.",
  ]
    .filter(Boolean)
    .join("\n");

  await sendMessage(context, summaryLines, { replyMarkup: USER_CREATION_ROLE_MARKUP });
  return true;
};

const handleMetaAccounts = async (context: BotContext): Promise<void> => {
  const record = await loadMetaToken(context.env);
  const status = record?.status ?? "missing";
  const lines = ["🔗 Meta-аккаунты", ""];

  lines.push(
    status === "valid"
      ? "✅ Подключение к Meta активно."
      : status === "expired"
        ? "⚠️ Токен истёк. Обновите подключение через раздел Авторизация Facebook."
        : "❌ Токен не найден. Авторизуйтесь, чтобы получить список кабинетов.",
  );

  let fetchedAccounts: MetaAdAccount[] | null = null;
  let fetchError: string | null = null;

  if (status === "valid" && record) {
    try {
      fetchedAccounts = await fetchAdAccounts(context.env, record, {
        includeSpend: true,
        includeCampaigns: false,
        campaignsLimit: 0,
        datePreset: "today",
      });
    } catch (error) {
      console.error("Failed to load Meta accounts", error);
      fetchError = "Не удалось получить список аккаунтов. Попробуйте обновить токен.";
    }
  }

  let storedAccounts: MetaAccountLinkRecord[] = [];
  try {
    storedAccounts = await listMetaAccountLinks(context.env);
  } catch (error) {
    console.warn("Failed to read Meta account index", error);
  }

  const { records, changed } = mergeMetaAccountLinks(storedAccounts, fetchedAccounts);
  if (changed) {
    await saveMetaAccountLinks(context.env, records);
  }

  const linkedCount = records.filter((account) => account.isLinked).length;
  const availableCount = records.length - linkedCount;

  if (fetchError) {
    lines.push("", `⚠️ ${escapeHtml(fetchError)}`);
  }

  if (records.length) {
    lines.push(
      "",
      `Аккаунтов: <b>${records.length}</b> · Привязано: ${linkedCount} · Свободно: ${availableCount}.`,
      "",
      "Выберите рекламный аккаунт, чтобы привязать его к чат-группе.",
    );
  } else {
    lines.push(
      "",
      "Список рекламных аккаунтов пока пуст. Подключите Meta Business и обновите права доступа.",
    );
  }

  if (status !== "valid") {
    lines.push(
      "",
      "Подключите или обновите токен Meta, чтобы получать расходы и кампании автоматически.",
    );
  }


  const replyMarkup = records.length
    ? buildMetaAccountsMarkup(records)
    : {
        inline_keyboard: [
          [{ text: "🔄 Обновить", callback_data: "cmd:meta" }],
          [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
        ],
      };

  await sendMessage(context, lines.join("\n"), { replyMarkup });
};

const handleMetaAccountSelection = async (context: BotContext, accountId: string): Promise<void> => {
  const userId = context.userId;
  if (!userId) {
    await sendMessage(context, "❌ Не удалось определить администратора. Повторите команду.");
    return;
  }

  const previous = await loadPendingMetaLink(context.env, userId);

  const accounts = await listMetaAccountLinks(context.env);
  const account = accounts.find((entry) => entry.accountId === accountId);
  if (!account) {
    await sendMessage(context, "❌ Рекламный аккаунт не найден. Обновите список Meta-аккаунтов.");
    return;
  }
  if (account.isLinked) {
    await sendMessage(context, "❌ Этот рекламный аккаунт уже подключён к другому проекту.");
    return;
  }

  const flow: MetaLinkFlow = previous?.flow ?? "meta";

  await savePendingMetaLink(context.env, userId, { flow, metaAccountId: accountId });

  const groups = await ensureTelegramGroupIndex(context);
  const availableGroups = groups.filter((group) => group.registered && !group.linkedProjectId);

  const lines = [
    "🔗 Подключение Meta-аккаунта",
    "",
    `Выбран рекламный аккаунт: <b>${escapeHtml(account.accountName)}</b>`,
    "Теперь выберите Telegram-группу, к которой хотите его привязать.",
  ];

  if (!availableGroups.length) {
    lines.push(
      "",
      "Нет доступных групп. Зарегистрируйте чат командой /reg и убедитесь, что он не привязан к проекту.",
    );
    await sendMessage(context, lines.join("\n"), {
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: flow === "meta" ? "🔗 Meta-аккаунты" : "📊 Проекты",
              callback_data: flow === "meta" ? "cmd:meta" : "cmd:projects",
            },
          ],
          [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
        ],
      },
    });
    return;
  }

  lines.push("", "Список доступных Telegram-групп:");
  await sendMessage(context, lines.join("\n"), { replyMarkup: buildLinkGroupMarkup(availableGroups, flow) });
};

const handleMetaGroupSelection = async (context: BotContext, chatId: string): Promise<void> => {
  const userId = context.userId;
  if (!userId) {
    await sendMessage(context, "❌ Не удалось определить администратора. Повторите команду.");
    return;
  }

  const pending = await loadPendingMetaLink(context.env, userId);
  if (!pending?.metaAccountId) {
    await sendMessage(context, "❌ Процесс привязки не найден. Начните заново.");
    return;
  }

  const flow: MetaLinkFlow = pending.flow ?? "meta";

  const [accounts, groups] = await Promise.all([
    listMetaAccountLinks(context.env),
    ensureTelegramGroupIndex(context),
  ]);

  const account = accounts.find((entry) => entry.accountId === pending.metaAccountId);
  if (!account) {
    await clearPendingMetaLink(context.env, userId);
    await sendMessage(context, "❌ Рекламный аккаунт не найден. Начните процесс заново.");
    return;
  }
  if (account.isLinked) {
    await sendMessage(context, "❌ Этот рекламный аккаунт уже подключён к другому проекту.");
    return;
  }

  const group = groups.find((entry) => entry.chatId === chatId);
  if (!group || !group.registered) {
    await sendMessage(context, "❌ Группа не найдена. Убедитесь, что команда /reg выполнена в нужном чате.");
    return;
  }
  if (group.linkedProjectId) {
    await sendMessage(context, "❌ Эта группа уже используется в другом проекте.");
    return;
  }

  await savePendingMetaLink(context.env, userId, {
    flow,
    metaAccountId: pending.metaAccountId,
    telegramChatId: chatId,
  });

  const groupLabel = group.title ? group.title : group.chatId;
  const lines = [
    "📌 Готово.",
    "",
    `Привязать аккаунт <b>${escapeHtml(account.accountName)}</b> к группе <b>${escapeHtml(groupLabel)}</b>?`,
  ];

  await sendMessage(context, lines.join("\n"), { replyMarkup: buildLinkConfirmMarkup(flow) });
};

const finalizeProjectLink = async (
  context: BotContext,
  userId: string,
  pending: PendingMetaLinkState,
  account: MetaAccountLinkRecord,
  group: TelegramGroupLinkRecord,
  projects: ProjectRecord[],
  accounts: MetaAccountLinkRecord[],
  groups: TelegramGroupLinkRecord[],
): Promise<void> => {
  const now = new Date().toISOString();
  const projectId = `p_${createId(10)}`;
  const projectRecord: ProjectRecord = {
    id: projectId,
    name: account.accountName,
    metaAccountId: account.accountId,
    metaAccountName: account.accountName,
    chatId: group.chatId,
    billingStatus: "pending",
    nextPaymentDate: now,
    tariff: 0,
    createdAt: now,
    updatedAt: now,
    settings: {},
    userId,
    telegramChatId: group.chatId,
    telegramLink: undefined,
    telegramTitle: group.title ?? undefined,
    adAccountId: account.accountId,
  };

  const nextProjects = [...projects, projectRecord];
  const nextAccounts = accounts.map((entry) =>
    entry.accountId === account.accountId
      ? { ...entry, isLinked: true, linkedProjectId: projectId, updatedAt: now }
      : entry,
  );
  const nextGroups = groups.map((entry) =>
    entry.chatId === group.chatId
      ? { ...entry, linkedProjectId: projectId, registered: true, updatedAt: now }
      : entry,
  );

  await Promise.all([
    saveProjects(context.env, nextProjects),
    saveMetaAccountLinks(context.env, nextAccounts),
    saveTelegramGroupLinks(context.env, nextGroups),
  ]);

  await clearPendingMetaLink(context.env, userId);

  await sendTelegramMessage(context.env, {
    chatId: group.chatId,
    text: "🎉 Ваш рекламный аккаунт успешно подключён!",
  });

  const flow: MetaLinkFlow = pending.flow ?? "meta";
  const lines = [
    "Проект создан!",
    `RA: <b>${escapeHtml(account.accountName)}</b>`,
    `Группа: <b>${escapeHtml(group.title ?? group.chatId)}</b>`,
  ];

  await sendMessage(context, lines.join("\n"), {
    replyMarkup: buildLinkCompleteMarkup(flow, projectId),
  });
};

const handleMetaLinkCancel = async (context: BotContext): Promise<void> => {
  let flow: MetaLinkFlow = "meta";
  if (context.userId) {
    try {
      const pending = await loadPendingMetaLink(context.env, context.userId);
      if (pending?.flow) {
        flow = pending.flow;
      }
      await clearPendingMetaLink(context.env, context.userId);
    } catch (error) {
      console.warn("Failed to clear pending meta link", error);
    }
  }

  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: flow === "meta" ? "🔗 Meta-аккаунты" : "📊 Проекты",
          callback_data: flow === "meta" ? "cmd:meta" : "cmd:projects",
        },
      ],
      [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
    ],
  };

  const message = flow === "meta" ? "❌ Привязка отменена." : "❌ Создание проекта отменено.";
  await sendMessage(context, message, { replyMarkup });
};

const handleMetaLinkConfirm = async (context: BotContext): Promise<void> => {
  const userId = context.userId;
  if (!userId) {
    await sendMessage(context, "❌ Не удалось определить администратора. Повторите команду.");
    return;
  }

  const pending = await loadPendingMetaLink(context.env, userId);
  if (!pending?.metaAccountId || !pending.telegramChatId) {
    await sendMessage(context, "❌ Процесс привязки не найден. Начните заново.");
    return;
  }

  const [accounts, groups, projects] = await Promise.all([
    listMetaAccountLinks(context.env),
    ensureTelegramGroupIndex(context),
    listProjects(context.env),
  ]);

  const account = accounts.find((entry) => entry.accountId === pending.metaAccountId);
  if (!account) {
    await clearPendingMetaLink(context.env, userId);
    await sendMessage(context, "❌ Рекламный аккаунт не найден. Обновите список Meta-аккаунтов.");
    return;
  }
  if (account.isLinked) {
    await sendMessage(context, "❌ Этот рекламный аккаунт уже подключён к другому проекту.");
    return;
  }

  const group = groups.find((entry) => entry.chatId === pending.telegramChatId);
  if (!group || !group.registered) {
    await sendMessage(context, "❌ Группа не найдена. Убедитесь, что команда /reg выполнена в нужном чате.");
    return;
  }
  if (group.linkedProjectId) {
    await sendMessage(context, "❌ Эта группа уже используется в другом проекте.");
    return;
  }

  await finalizeProjectLink(context, userId, pending, account, group, projects, accounts, groups);
};

const handleMetaProjectView = async (context: BotContext, projectId: string): Promise<void> => {
  const project = await loadProject(context.env, projectId);
  if (!project) {
    await sendMessage(context, "❌ Проект не найден. Обновите список Meta-аккаунтов.");
    return;
  }
  await handleProjectView(context, projectId);
};

const buildAnalyticsMarkup = () => ({
  inline_keyboard: [
    [{ text: "📈 По проектам", callback_data: "analytics:projects" }],
    [{ text: "📥 Экспорт", callback_data: "analytics:export" }],
    [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
  ],
});

const describeLeadCounters = (value: number): string => value.toString();

const handleAnalytics = async (context: BotContext): Promise<void> => {
  const analytics = await calculateLeadAnalytics(context.env);
  const lines: string[] = ["📈 Аналитика", ""];
  lines.push(`Сегодня: <b>${describeLeadCounters(analytics.totals.today)}</b>`);
  lines.push(`Неделя: <b>${describeLeadCounters(analytics.totals.week)}</b>`);
  lines.push(`Месяц: <b>${describeLeadCounters(analytics.totals.month)}</b>`);
  lines.push(`Всего: <b>${describeLeadCounters(analytics.totals.total)}</b>`);
  if (analytics.lastLeadAt) {
    lines.push("", `Последний лид: ${formatDateTime(analytics.lastLeadAt)}`);
  }
  lines.push(
    "",
    "Нажмите «📈 По проектам», чтобы увидеть разбивку по каждому проекту, или «📥 Экспорт», чтобы выбрать тип отчёта (сводка, авто, финансы или SLA).",
  );
  await sendMessage(context, lines.join("\n"), { replyMarkup: buildAnalyticsMarkup() });
};

const handleAnalyticsProjects = async (context: BotContext): Promise<void> => {
  const analytics = await calculateLeadAnalytics(context.env);
  const lines: string[] = ["📈 Лиды по проектам", ""];
  if (!analytics.projects.length) {
    lines.push("Лиды ещё не поступали. Как только появятся новые заявки, статистика обновится автоматически.");
  } else {
    analytics.projects.forEach((project, index) => {
      lines.push(
        `${index + 1}. ${escapeHtml(project.projectName)} — сегодня: ${project.today}, неделя: ${project.week}, месяц: ${project.month}, всего: ${project.total}`,
      );
    });
  }
  lines.push(
    "",
    "Используйте кнопки ниже, чтобы вернуться к общей аналитике или сразу выгрузить отчёт.",
  );
  const replyMarkup = {
    inline_keyboard: [
      [{ text: "⬅ К аналитике", callback_data: "cmd:analytics" }],
      [{ text: "📥 Экспорт", callback_data: "analytics:export" }],
      [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
    ],
  };
  await sendMessage(context, lines.join("\n"), { replyMarkup });
};

const buildAnalyticsExportMarkup = () => ({
  inline_keyboard: [
    [
      { text: "📝 Сводка", callback_data: "analytics:export:summary" },
      { text: "📥 Автоотчёт", callback_data: "analytics:export:auto" },
    ],
    [
      { text: "💰 Финансы", callback_data: "analytics:export:finance" },
      { text: "⏱ SLA-экспорт", callback_data: "analytics:export:sla" },
    ],
    [{ text: "⬅ К аналитике", callback_data: "cmd:analytics" }],
    [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
  ],
});

const sendAnalyticsExportMenu = async (context: BotContext): Promise<void> => {
  const lines = [
    "📥 Экспорт аналитики",
    "",
    "Выберите нужный тип отчёта:",
    "• <b>Сводка</b> — короткий HTML по всем проектам.",
    "• <b>Автоотчёт</b> — расширенный отчёт с детализацией.",
    "• <b>Финансы</b> — состояние оплат и тарифов.",
    "• <b>SLA-экспорт</b> — CSV со всеми просроченными лидами.",
  ];
  await sendMessage(context, lines.join("\n"), { replyMarkup: buildAnalyticsExportMarkup() });
};

const handleAnalyticsExportSla = async (context: BotContext): Promise<void> => {
  const result = await createSlaReport(context.env, {
    triggeredBy: context.userId,
    channel: "telegram",
  });
  const link = resolveReportLink(context.env, result.record.id);
  const lines = [
    result.text,
    "",
    `Скачать CSV: <a href="${escapeAttribute(link)}">${escapeHtml(link)}</a>`,
    `ID отчёта: <code>${escapeHtml(result.record.id)}</code>`,
  ];
  const replyMarkup = {
    inline_keyboard: [
      [{ text: "⬅ К аналитике", callback_data: "cmd:analytics" }],
      [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
    ],
  };
  await sendMessage(context, lines.join("\n"), { replyMarkup });
};

const handleAnalyticsExport = async (context: BotContext): Promise<void> => {
  await sendAnalyticsExportMenu(context);
};

const handleFinance = async (context: BotContext): Promise<void> => {
  const [payments, summaries] = await Promise.all([
    listPayments(context.env),
    summarizeProjects(context.env),
  ]);
  const total = payments.length;
  const byStatus = payments.reduce(
    (acc, payment) => {
      acc[payment.status] = (acc[payment.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const lines = ["💰 Финансы", ""];
  if (total) {
    lines.push(`Всего оплат: <b>${total}</b>`);
    lines.push(`Активные: ${byStatus.active ?? 0}`);
    lines.push(`Ожидают оплаты: ${byStatus.pending ?? 0}`);
    lines.push(`Просроченные: ${byStatus.overdue ?? 0}`);
  } else {
    lines.push("Платёжные записи пока не добавлены.");
  }

  if (summaries.length) {
    lines.push("", "📊 Статус по проектам:");
    for (const project of sortProjectSummaries(summaries)) {
      const billing = project.billing;
      let statusText: string;
      if (billing.status === "missing") {
        statusText = "не настроена";
      } else {
        const statusMap: Record<string, string> = {
          active: "активен",
          pending: "ожидает",
          overdue: "просрочен",
          cancelled: "отменён",
        };
        const amount = billing.amountFormatted
          ? billing.amountFormatted
          : billing.amount !== undefined
            ? `${billing.amount.toFixed(2)} ${billing.currency || "USD"}`
            : undefined;
        const suffix = amount ? ` · ${amount}` : "";
        statusText = `${statusMap[billing.status] ?? billing.status}${suffix}`;
      }
      const indicator = billing.overdue ? "⚠️" : billing.active ? "✅" : "💳";
      lines.push(`${indicator} ${escapeHtml(project.name)} — ${escapeHtml(statusText)}`);
    }
  }

  lines.push(
    "",
    "Откройте карточку проекта → «💰 Оплата», чтобы зафиксировать платёж или обновить тариф.",
  );

  const replyMarkup = {
    inline_keyboard: [
      [{ text: "📊 Проекты", callback_data: "cmd:projects" }],
      [{ text: "📈 Аналитика", callback_data: "cmd:analytics" }],
      [{ text: "📥 Экспорт", callback_data: "analytics:export" }],
      [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
    ],
  };

  await sendMessage(context, lines.join("\n"), { replyMarkup });
};

const handleSettings = async (context: BotContext): Promise<void> => {
  const lines = [
    "⚙ Настройки",
    "",
    "Используйте кнопки ниже, чтобы переподключить вебхуки Telegram и проверить авторизацию Meta.",
    "🔄 Обновить вебхуки — выполните после изменения адреса воркера или токена.",
    "🧩 Проверить токен Meta — доступно в разделе «Авторизация Facebook».",
    "⏰ Планировщик автоотчётов и уведомления доступны из карточек проектов и меню бота.",
  ];

  await sendMessage(context, lines.join("\n"), { replyMarkup: buildSettingsMarkup(context.env) });
};

const handleWebhookRefresh = async (context: BotContext): Promise<void> => {
  const chatId = ensureChatId(context);
  if (!chatId) {
    return;
  }

  const endpoint = resolveManageWebhookUrl(context.env);
  if (!endpoint) {
    await sendMessage(
      context,
      [
        "🔄 Обновление вебхуков",
        "",
        "❌ Не удалось определить адрес воркера для обновления вебхуков.",
        "Укажите переменную окружения PUBLIC_BASE_URL или MANAGE_WEBHOOK_URL.",
      ].join("\n"),
      { replyMarkup: buildSettingsMarkup(context.env) },
    );
    return;
  }

  let responseText = "";
  try {
    const response = await fetch(endpoint, { method: "GET" });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      payload = await response.text();
    }

    const isJson = typeof payload === "object" && payload !== null;
    const ok = isJson && typeof (payload as { ok?: unknown }).ok === "boolean" ? (payload as { ok: boolean }).ok : response.ok;

    if (ok) {
      const description =
        isJson && typeof (payload as { data?: { description?: unknown } }).data?.description === "string"
          ? (payload as { data?: { description?: string } }).data?.description
          : null;
      responseText = [
        "✅ Вебхуки успешно переподключены.",
        description ? `Ответ Telegram: ${escapeHtml(description)}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    } else {
      const errorMessage =
        isJson && typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error?: string }).error
          : response.statusText || "Неизвестная ошибка";
      const details =
        isJson && typeof (payload as { details?: unknown }).details === "string"
          ? (payload as { details?: string }).details
          : null;
      responseText = [
        `❌ Не удалось обновить вебхуки: ${escapeHtml(errorMessage)}.`,
        details ? `Детали: ${escapeHtml(details)}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    }
  } catch (error) {
    responseText = `❌ Ошибка сети: ${escapeHtml((error as Error).message)}`;
  }

  const lines = [
    "🔄 Обновление вебхуков",
    `URL: <code>${escapeHtml(endpoint)}</code>`,
    "",
    responseText || "Ответ не получен.",
  ];

  await sendMessage(context, lines.join("\n"), { replyMarkup: buildSettingsMarkup(context.env) });
};

const handleAutoReport = async (context: BotContext): Promise<void> => {
  await startReportWorkflow(context, "auto");
};

const handleSummaryReport = async (context: BotContext): Promise<void> => {
  await startReportWorkflow(context, "summary");
};

const COMMAND_HANDLERS: Record<string, (context: BotContext) => Promise<void>> = {
  menu: sendMainMenu,
  auth: handleAuth,
  projects: handleProjects,
  users: handleUsers,
  meta: handleMetaAccounts,
  analytics: handleAnalytics,
  finance: handleFinance,
  settings: handleSettings,
  webhooks: handleWebhookRefresh,
  auto_report: handleAutoReport,
  summary_report: handleSummaryReport,
  register_chat: handleRegisterChat,
};

export const resolveCommand = (text: string | undefined): string | null => {
  if (!text) {
    return null;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("cmd:")) {
    return trimmed.slice(4);
  }
  const normalized = trimmed.toLowerCase();
  return COMMAND_ALIASES[normalized] ?? null;
};

const logCommand = async (
  context: BotContext,
  command: string,
  payload?: string,
): Promise<void> => {
  try {
    await appendCommandLog(context.env, {
      id: createId(),
      userId: context.userId,
      chatId: context.chatId,
      command,
      payload,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("failed to log telegram command", error);
  }
};

const logProjectAction = async (
  context: BotContext,
  action: string,
  projectId?: string,
  detail?: string,
): Promise<void> => {
  const payload = detail
    ? projectId
      ? `${projectId}:${detail}`
      : detail
    : projectId;
  await logCommand(context, `project:${action}`, payload);
};

export const runCommand = async (command: string, context: BotContext): Promise<boolean> => {
  const handler = COMMAND_HANDLERS[command];
  if (!handler) {
    return false;
  }
  await ensureAdminUser(context);
  await handler(context);
  await logCommand(context, command, context.text);
  if (context.update.callback_query?.id) {
    await answerCallbackQuery(context.env, context.update.callback_query.id);
  }
  return true;
};

export const handleAnalyticsCallback = async (context: BotContext, data: string): Promise<boolean> => {
  if (!data.startsWith("analytics:")) {
    return false;
  }
  await ensureAdminUser(context);
  const parts = data.split(":");
  const action = parts[1];
  const subaction = parts[2];
  switch (action) {
    case "projects":
      await handleAnalyticsProjects(context);
      return true;
    case "export":
      if (!subaction) {
        await handleAnalyticsExport(context);
        return true;
      }
      if (subaction === "summary") {
        await startReportWorkflow(context, "summary");
        return true;
      }
      if (subaction === "auto") {
        await startReportWorkflow(context, "auto");
        return true;
      }
      if (subaction === "finance") {
        await startReportWorkflow(context, "finance");
        return true;
      }
      if (subaction === "sla") {
        await handleAnalyticsExportSla(context);
        return true;
      }
      return false;
    default:
      return false;
  }
};

export const handleUserCallback = async (context: BotContext, data: string): Promise<boolean> => {
  if (!data.startsWith("user:")) {
    return false;
  }
  await ensureAdminUser(context);
  const [, action, ...rest] = data.split(":");
  switch (action) {
    case "add":
      await handleUserAdd(context);
      return true;
    case "view": {
      const userId = rest.join(":");
      if (!userId) {
        await sendMessage(context, "Не указан пользователь. Обновите список.", {
          replyMarkup: { inline_keyboard: [[{ text: "👥 К списку", callback_data: "cmd:users" }]] },
        });
        return true;
      }
      await handleUserView(context, userId);
      return true;
    }
    case "role": {
      const [userId, roleValue] = rest;
      if (!userId || !roleValue) {
        await sendMessage(context, "Не удалось определить пользователя или роль.");
        return true;
      }
      if (!USER_ROLE_SEQUENCE.includes(roleValue as UserRole)) {
        await sendMessage(context, "Неизвестная роль. Доступны: владелец, менеджер, клиент.");
        return true;
      }
      await handleUserRoleChange(context, userId, roleValue as UserRole);
      return true;
    }
    case "delete": {
      const userId = rest.join(":");
      if (!userId) {
        await sendMessage(context, "Пользователь не найден. Обновите список.");
        return true;
      }
      await handleUserDeletePrompt(context, userId);
      return true;
    }
    case "delete-confirm": {
      const userId = rest.join(":");
      if (!userId) {
        await sendMessage(context, "Пользователь не найден. Обновите список.");
        return true;
      }
      await handleUserDeleteConfirm(context, userId);
      return true;
    }
    case "cancel":
      await handleUserCancel(context);
      return true;
    case "create-role": {
      const roleValue = rest.join(":");
      if (!USER_ROLE_SEQUENCE.includes(roleValue as UserRole)) {
        await sendMessage(context, "Выберите роль с помощью кнопок ниже.", {
          replyMarkup: USER_CREATION_ROLE_MARKUP,
        });
        return true;
      }
      await handleUserCreateRole(context, roleValue as UserRole);
      return true;
    }
    default:
      return false;
  }
};

export const handleProjectCallback = async (context: BotContext, data: string): Promise<boolean> => {
  if (!data.startsWith("proj:")) {
    return false;
  }
  await ensureAdminUser(context);
  const [, action, ...rest] = data.split(":");
  if (!action) {
    return false;
  }
  const ensureId = async (): Promise<boolean> => {
    await sendMessage(
      context,
      "Не удалось определить проект. Откройте список проектов и попробуйте снова.",
    );
    return true;
  };
  switch (action) {
    case "view":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectView(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
    case "chat":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectChat(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
    case "leads":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectLeads(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
    case "report":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectReport(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
    case "report-period": {
      const [projectId, periodKey] = rest;
      if (!projectId || !periodKey) {
        return ensureId();
      }
      await handleProjectReport(context, projectId, periodKey as ReportPeriodKey);
      await logProjectAction(context, action, projectId, periodKey);
      return true;
    }
    case "report-send": {
      const [projectId, periodKey] = rest;
      if (!projectId || !periodKey) {
        return ensureId();
      }
      await handleProjectReportSend(context, projectId, periodKey as ReportPeriodKey);
      await logProjectAction(context, action, projectId, periodKey);
      return true;
    }
    case "campaigns":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectCampaigns(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
    case "campaign-toggle": {
      const [projectId, campaignId] = rest;
      if (!projectId || !campaignId) {
        return ensureId();
      }
      await handleProjectCampaignToggle(context, projectId, campaignId);
      await logProjectAction(context, action, projectId, campaignId);
      return true;
    }
    case "campaign-actions":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectCampaignActions(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
    case "campaign-action": {
      const [projectId, campaignAction] = rest;
      if (!projectId || !campaignAction) {
        return ensureId();
      }
      await handleProjectCampaignAction(context, projectId, campaignAction);
      await logProjectAction(context, action, projectId, campaignAction);
      return true;
    }
    case "export":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectExport(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
    case "portal":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectPortal(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
    case "portal-create":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectPortalCreate(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
    case "portal-regenerate":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectPortalRegenerate(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
    case "portal-share":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectPortalShare(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
    case "portal-mode": {
      const [projectId, mode] = rest;
      if (!projectId || !mode) {
        return ensureId();
      }
      await handleProjectPortalMode(context, projectId, mode as PortalMode);
      await logProjectAction(context, action, projectId, mode);
      return true;
    }
    case "portal-metrics":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectPortalMetrics(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
    case "portal-metric-toggle": {
      const [projectId, metric] = rest;
      if (!projectId || !metric) {
        return ensureId();
      }
      await handleProjectPortalMetricToggle(context, projectId, metric as PortalMetricKey);
      await logProjectAction(context, action, projectId, metric);
      return true;
    }
    case "portal-campaigns":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectPortalCampaigns(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
    case "portal-campaign-toggle": {
      const [projectId, campaignId] = rest;
      if (!projectId || !campaignId) {
        return ensureId();
      }
      await handleProjectPortalCampaignToggle(context, projectId, campaignId);
      await logProjectAction(context, action, projectId, campaignId);
      return true;
    }
    case "portal-campaign-clear":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectPortalCampaignClear(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
    case "billing":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectBilling(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
    case "billing-tariff-preset": {
      const [projectId, amount] = rest;
      if (!projectId || !amount) {
        return ensureId();
      }
      await handleProjectBillingTariffPreset(context, projectId, amount);
      await logProjectAction(context, action, projectId, amount);
      return true;
    }
    case "billing-status": {
      const [projectId, statusValue] = rest;
      if (!projectId || !statusValue) {
        return ensureId();
      }
      await handleProjectBillingStatus(context, projectId, statusValue as ProjectBillingState);
      await logProjectAction(context, action, projectId, statusValue);
      return true;
    }
    case "billing-next": {
      const [projectId, preset] = rest;
      if (!projectId || !preset) {
        return ensureId();
      }
      await handleProjectBillingNext(context, projectId, preset);
      await logProjectAction(context, action, projectId, preset);
      return true;
    }
    case "billing-tariff": {
      const projectId = rest[0];
      if (!projectId) {
        return ensureId();
      }
      await handleProjectBillingTariff(context, projectId);
      await logProjectAction(context, action, projectId);
      return true;
    }
    case "edit":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectEdit(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
    case "edit-name":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectEditNamePrompt(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
    case "edit-cancel":
      if (!rest[0]) {
        return ensureId();
      }
      if (context.update.callback_query?.id) {
        await answerCallbackQuery(context.env, context.update.callback_query.id, "Отменено");
      }
      await handleProjectEditCancel(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
    case "settings":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectSettings(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
    case "settings-frequency": {
      const [projectId, frequency] = rest;
      if (!projectId || !frequency) {
        return ensureId();
      }
      await handleProjectSettingsFrequency(context, projectId, frequency);
      await logProjectAction(context, action, projectId, frequency);
      return true;
    }
    case "settings-quiet": {
      const [projectId, nextState] = rest;
      if (!projectId || !nextState) {
        return ensureId();
      }
      await handleProjectSettingsQuiet(context, projectId, nextState);
      await logProjectAction(context, action, projectId, nextState);
      return true;
    }
    case "settings-silent": {
      const [projectId, nextState] = rest;
      if (!projectId || !nextState) {
        return ensureId();
      }
      await handleProjectSettingsSilent(context, projectId, nextState);
      await logProjectAction(context, action, projectId, nextState);
      return true;
    }
    case "settings-alerts": {
      const [projectId, nextState] = rest;
      if (!projectId || !nextState) {
        return ensureId();
      }
      await handleProjectSettingsAlerts(context, projectId, nextState);
      await logProjectAction(context, action, projectId, nextState);
      return true;
    }
    case "lead-toggle": {
      const [projectId, leadId] = rest;
      if (!projectId || !leadId) {
        return ensureId();
      }
      await handleProjectLeadToggle(context, projectId, leadId);
      await logProjectAction(context, action, projectId, leadId);
      return true;
    }
    case "delete":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectDelete(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
    case "delete-confirm":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectDeleteConfirm(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
    case "delete-cancel":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectDeleteCancel(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
    case "new":
      if (!rest.length) {
        await handleProjectNew(context);
        await logProjectAction(context, action);
        return true;
      }
      const [step, ...args] = rest;
      switch (step) {
        case "meta": {
          const accountId = args.join(":");
          if (!accountId) {
            await sendMessage(context, "❌ Рекламный аккаунт не найден. Обновите список проектов.");
            return true;
          }
          await handleProjectNewMetaSelection(context, accountId);
          return true;
        }
        case "chat": {
          const chatId = args.join(":");
          if (!chatId) {
            await sendMessage(context, "❌ Группа не найдена. Запустите мастер заново.");
            return true;
          }
          await handleProjectNewGroupSelection(context, chatId);
          return true;
        }
        case "confirm":
          await handleProjectNewConfirm(context);
          return true;
        case "cancel":
          await handleProjectNewCancel(context);
          return true;
        default:
          await sendMessage(
            context,
            "❌ Неизвестный шаг мастера проекта. Запустите создание заново из списка проектов.",
          );
          return true;
      }
    default:
      return false;
  }
};

export const handleMetaCallback = async (context: BotContext, data: string): Promise<boolean> => {
  if (!data.startsWith("meta:")) {
    return false;
  }
  await ensureAdminUser(context);
  const [, action, ...rest] = data.split(":");
  switch (action) {
    case "account": {
      const accountId = rest.join(":");
      if (!accountId) {
        await sendMessage(context, "❌ Рекламный аккаунт не найден. Обновите список Meta-аккаунтов.");
        return true;
      }
      await handleMetaAccountSelection(context, accountId);
      return true;
    }
    case "group": {
      const chatId = rest.join(":");
      if (!chatId) {
        await sendMessage(context, "❌ Группа не найдена. Начните привязку заново.");
        return true;
      }
      await handleMetaGroupSelection(context, chatId);
      return true;
    }
    case "confirm":
      await handleMetaLinkConfirm(context);
      return true;
    case "cancel":
      await handleMetaLinkCancel(context);
      return true;
    case "project": {
      const projectId = rest.join(":");
      if (!projectId) {
        await sendMessage(context, "❌ Проект не найден. Обновите список Meta-аккаунтов.");
        return true;
      }
      await handleMetaProjectView(context, projectId);
      return true;
    }
    default:
      return false;
  }
};
