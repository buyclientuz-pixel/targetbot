import { BotContext } from "./types";
import { sendMainMenu } from "./menu";
import { startReportWorkflow } from "./reports";
import { escapeAttribute, escapeHtml } from "../utils/html";
import { summarizeProjects, sortProjectSummaries } from "../utils/projects";
import {
  appendCommandLog,
  clearLeadReminder,
  clearPendingBillingOperation,
  clearPendingMetaLink,
  clearPendingUserOperation,
  listChatRegistrations,
  listMetaAccountLinks,
  listLeads,
  listPayments,
  listProjects,
  listSettings,
  listTelegramGroupLinks,
  listUsers,
  loadMetaToken,
  loadPendingMetaLink,
  loadPendingBillingOperation,
  saveChatRegistrations,
  saveMetaAccountLinks,
  savePendingMetaLink,
  savePendingBillingOperation,
  saveProjects,
  saveLeads,
  saveTelegramGroupLinks,
  saveUsers,
  loadProject,
  loadPendingUserOperation,
  savePendingUserOperation,
  MetaLinkFlow,
  PendingMetaLinkState,
  updateProjectRecord,
  clearPaymentReminder,
} from "../utils/storage";
import { createId } from "../utils/ids";
import { answerCallbackQuery, editTelegramMessage, sendTelegramMessage } from "../utils/telegram";
import { encodeMetaOAuthState, fetchAdAccounts, resolveMetaStatus } from "../utils/meta";
import {
  ChatRegistrationRecord,
  LeadRecord,
  MetaAccountLinkRecord,
  MetaAdAccount,
  PaymentRecord,
  ProjectRecord,
  ProjectSummary,
  ProjectBillingState,
  TelegramGroupLinkRecord,
  UserRecord,
  UserRole,
} from "../types";
import { calculateLeadAnalytics } from "../utils/analytics";

const AUTH_URL_FALLBACK = "https://th-reports.buyclientuz.workers.dev/auth/facebook";

const resolveAuthUrl = (env: BotContext["env"]): string => {
  const candidates = [
    env.AUTH_FACEBOOK_URL,
    env.META_AUTH_URL,
    env.FB_AUTH_URL,
    env.PUBLIC_WEB_URL ? `${env.PUBLIC_WEB_URL}/auth/facebook` : null,
    env.PUBLIC_BASE_URL ? `${env.PUBLIC_BASE_URL}/auth/facebook` : null,
    env.WORKER_BASE_URL ? `${env.WORKER_BASE_URL}/auth/facebook` : null,
  ];
  const resolved = candidates.find((value): value is string => typeof value === "string" && value.trim().length > 0);
  return resolved ? resolved : AUTH_URL_FALLBACK;
};

const BOT_USERNAME_ENV_KEYS = [
  "BOT_USERNAME",
  "BOT_HANDLE",
  "BOT_USER",
  "TELEGRAM_BOT_USERNAME",
  "TELEGRAM_BOT_HANDLE",
];

const BOT_DEEPLINK_ENV_KEYS = [
  "BOT_DEEPLINK",
  "BOT_URL",
  "BOT_LINK",
  "TELEGRAM_BOT_URL",
  "TELEGRAM_BOT_LINK",
  "TELEGRAM_DEEPLINK",
];

const BOT_USERNAME_SETTING_KEYS = [
  "bot.username",
  "bot.telegram.username",
  "bot.telegram.handle",
];

const BOT_DEEPLINK_SETTING_KEYS = [
  "bot.link",
  "bot.telegram.link",
  "bot.telegram.url",
  "bot.telegram.deeplink",
];

const takeEnvString = (env: BotContext["env"], keys: string[]): string | null => {
  const record = env as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const normalizeUsername = (raw?: string | null): string | undefined => {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
};

const ensureHttpLink = (value?: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^(https?:\/\/|tg:\/\/)/i.test(trimmed)) {
    return trimmed;
  }
  if (/^t\.me\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  if (trimmed.startsWith("@")) {
    return `https://t.me/${trimmed.slice(1)}`;
  }
  return `https://${trimmed}`;
};

const deriveUsernameFromLink = (link?: string | null): string | undefined => {
  if (!link) {
    return undefined;
  }
  const trimmed = link.trim();
  if (!trimmed) {
    return undefined;
  }
  const domainMatch = trimmed.match(/domain=([^&]+)/i);
  if (domainMatch && domainMatch[1]) {
    return normalizeUsername(domainMatch[1]);
  }
  const tmeMatch = trimmed.match(/t\.me\/(?:joinchat\/)?([^/?]+)/i);
  if (tmeMatch && tmeMatch[1]) {
    return normalizeUsername(tmeMatch[1]);
  }
  if (trimmed.startsWith("@")) {
    return normalizeUsername(trimmed);
  }
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const segment = url.pathname.replace(/^\/+/, "").split("/")[0];
    return normalizeUsername(segment || undefined);
  } catch (error) {
    console.warn("Failed to derive username from link", link, error);
  }
  return undefined;
};

const extractSettingString = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (value && typeof value === "object" && "value" in (value as Record<string, unknown>)) {
    const nested = (value as Record<string, unknown>).value;
    if (typeof nested === "string" && nested.trim()) {
      return nested.trim();
    }
  }
  return undefined;
};

const pickSettingString = (settings: Awaited<ReturnType<typeof listSettings>>, keys: string[]): string | undefined => {
  for (const key of keys) {
    const entry = settings.find((item) => item.key === key);
    if (entry) {
      const value = extractSettingString(entry.value);
      if (value) {
        return value;
      }
    }
  }
  return undefined;
};

const resolveBotIdentity = async (
  context: BotContext,
): Promise<{ username?: string; link?: string }> => {
  let username = normalizeUsername(takeEnvString(context.env, BOT_USERNAME_ENV_KEYS));
  let link = ensureHttpLink(takeEnvString(context.env, BOT_DEEPLINK_ENV_KEYS));

  if (!username) {
    username = deriveUsernameFromLink(link);
  }
  if (!link && username) {
    link = `https://t.me/${username}`;
  }

  if (!username || !link) {
    try {
      const settings = await listSettings(context.env);
      if (!username) {
        username = normalizeUsername(pickSettingString(settings, BOT_USERNAME_SETTING_KEYS)) || username;
      }
      if (!link) {
        const rawLink = pickSettingString(settings, BOT_DEEPLINK_SETTING_KEYS);
        link = ensureHttpLink(rawLink) ?? link;
      }
      if (!username) {
        username = deriveUsernameFromLink(link);
      }
      if (!link && username) {
        link = `https://t.me/${username}`;
      }
    } catch (error) {
      console.warn("Failed to resolve bot identity from settings", error);
    }
  }

  return { username, link };
};

const appendQueryParameter = (base: string, key: string, value: string): string => {
  if (!value) {
    return base;
  }
  try {
    const url = new URL(base);
    url.searchParams.set(key, value);
    return url.toString();
  } catch (error) {
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
};

const buildAuthState = async (context: BotContext): Promise<string | null> => {
  const origin = context.chatId ? "telegram" : "external";
  const identity = await resolveBotIdentity(context);
  const payload = {
    origin,
    chatId: context.chatId,
    messageId: typeof context.messageId === "number" ? context.messageId : undefined,
    userId: context.userId,
    botUsername: identity.username,
    botDeeplink: identity.link,
    timestamp: Date.now(),
  } as const;
  const encoded = encodeMetaOAuthState(payload);
  return encoded || null;
};

const buildManageWebhookUrl = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  let base: URL;
  try {
    base = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch (error) {
    console.warn("Invalid manage webhook base", trimmed, error);
    return null;
  }
  base.pathname = "/manage/telegram/webhook";
  base.search = "";
  base.searchParams.set("action", "refresh");
  base.searchParams.set("drop", "1");
  return base.toString();
};

const resolveManageWebhookUrl = (env: BotContext["env"]): string | null => {
  const candidates = [
    env.MANAGE_WEBHOOK_URL,
    env.MANAGE_BASE_URL,
    env.PUBLIC_WORKER_URL,
    env.WORKER_PUBLIC_URL,
    env.PUBLIC_BASE_URL,
    env.PUBLIC_WEB_URL,
    env.WORKER_BASE_URL,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      const resolved = buildManageWebhookUrl(candidate);
      if (resolved) {
        return resolved;
      }
    }
  }

  const fallback = buildManageWebhookUrl(AUTH_URL_FALLBACK);
  return fallback;
};

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

const resolvePortalUrl = (env: BotContext["env"], projectId: string): string | null => {
  const path = `/portal/${encodeURIComponent(projectId)}`;
  const candidates = [
    env.PORTAL_BASE_URL,
    env.PUBLIC_WEB_URL,
    env.PUBLIC_BASE_URL,
    env.WORKER_BASE_URL,
    env.ADMIN_BASE_URL,
  ];
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

const SETTINGS_MARKUP = {
  inline_keyboard: [
    [{ text: "🔄 Обновить вебхуки", callback_data: "cmd:webhooks" }],
    [{ text: "🧩 Проверить токен Meta", callback_data: "cmd:auth" }],
    [{ text: "⬅ Назад", callback_data: "cmd:menu" }],
  ],
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
      "Назначьте его на проект через веб-панель (/admin → Проекты), чтобы включить отчёты и уведомления.",
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

const truncateLabel = (label: string, max = 40): string => {
  if (label.length <= max) {
    return label;
  }
  return `${label.slice(0, max - 1)}…`;
};

const buildProjectListMarkup = (summaries: ProjectSummary[]) => {
  const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];
  summaries.forEach((project, index) => {
    keyboard.push([
      {
        text: `${index + 1}️⃣ ${truncateLabel(project.name)}`,
        callback_data: `proj:view:${project.id}`,
      },
    ]);
  });
  keyboard.push([{ text: "➕ Новый проект", callback_data: "proj:new" }]);
  keyboard.push([{ text: "⬅ Назад", callback_data: "cmd:menu" }]);
  return { inline_keyboard: keyboard };
};

const buildProjectActionsMarkup = (projectId: string) => ({
  inline_keyboard: [
    [
      { text: "✏️ Изменить данные", callback_data: `proj:edit:${projectId}` },
      { text: "📲 Чат-группа", callback_data: `proj:chat:${projectId}` },
    ],
    [
      { text: "💬 Лиды", callback_data: `proj:leads:${projectId}` },
      { text: "📈 Отчёт по рекламе", callback_data: `proj:report:${projectId}` },
    ],
    [
      { text: "👀 Рекламные кампании", callback_data: `proj:campaigns:${projectId}` },
      { text: "📤 Экспорт данных", callback_data: `proj:export:${projectId}` },
    ],
    [
      { text: "🧩 Портал", callback_data: `proj:portal:${projectId}` },
      { text: "💳 Оплата", callback_data: `proj:billing:${projectId}` },
    ],
    [
      { text: "⚙ Настройки", callback_data: `proj:settings:${projectId}` },
      { text: "❌ Удалить", callback_data: `proj:delete:${projectId}` },
    ],
    [{ text: "⬅ К списку", callback_data: "cmd:projects" }],
    [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
  ],
});

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

const formatMetaSpendLabel = (amount?: number | null, currency?: string | null): string | null => {
  if (amount === null || amount === undefined) {
    return null;
  }
  const formatted = formatCurrencyValue(amount, currency ?? undefined);
  return formatted ?? `${amount.toFixed(2)} ${currency ?? "USD"}`;
};

const mergeMetaAccountLinks = (
  stored: MetaAccountLinkRecord[],
  fetched: MetaAdAccount[] | null,
): { records: MetaAccountLinkRecord[]; changed: boolean } => {
  const storedMap = new Map(stored.map((item) => [item.accountId, item]));
  const fetchedMap = new Map((fetched ?? []).map((item) => [item.id, item]));
  const ids = new Set<string>([...storedMap.keys(), ...fetchedMap.keys()]);
  const now = new Date().toISOString();
  let changed = false;
  const records: MetaAccountLinkRecord[] = [];

  for (const id of Array.from(ids)) {
    const storedRecord = storedMap.get(id);
    const fetchedRecord = fetchedMap.get(id);
    const accountName = fetchedRecord?.name?.trim() || storedRecord?.accountName || id;
    const currency = fetchedRecord?.currency ?? storedRecord?.currency ?? null;
    const spentToday =
      fetchedRecord && fetchedRecord.spend !== undefined
        ? fetchedRecord.spend ?? 0
        : storedRecord?.spentToday ?? null;
    const isLinked = storedRecord?.isLinked ?? false;
    const linkedProjectId = storedRecord?.linkedProjectId ?? null;
    let updatedAt = storedRecord?.updatedAt;

    if (!storedRecord) {
      updatedAt = fetchedRecord ? now : undefined;
      changed = true;
    } else if (
      storedRecord.accountName !== accountName ||
      storedRecord.currency !== currency ||
      (storedRecord.spentToday ?? null) !== (spentToday ?? null)
    ) {
      updatedAt = fetchedRecord ? now : storedRecord.updatedAt;
      changed = true;
    }

    records.push({
      accountId: id,
      accountName,
      currency,
      spentToday,
      isLinked,
      linkedProjectId,
      updatedAt,
    });
  }

  records.sort((a, b) => a.accountName.localeCompare(b.accountName, "ru-RU", { sensitivity: "base" }));

  return { records, changed };
};

const buildMetaAccountsMarkup = (accounts: MetaAccountLinkRecord[]) => {
  const rows = accounts.map((account) => {
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
  options: { includeCampaigns?: boolean } = {},
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
      campaignsLimit: options.includeCampaigns ? 5 : undefined,
      datePreset: "today",
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

const handleProjectView = async (context: BotContext, projectId: string): Promise<void> => {
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
  const chatLine = summary.telegramLink
    ? `📲 Чат-группа: <a href="${escapeAttribute(summary.telegramLink)}">Перейти</a>`
    : summary.telegramChatId
      ? `📲 Чат: <code>${escapeHtml(summary.telegramChatId)}</code> (ссылка не указана)`
      : "📲 Чат-группа: не подключена";
  lines.push(chatLine);
  const portalUrl = resolvePortalUrl(context.env, summary.id);
  if (portalUrl) {
    lines.push(`🧩 Портал: <a href="${escapeAttribute(portalUrl)}">Открыть клиентский портал</a>`);
  }
  const adminUrl = resolveAdminProjectUrl(context.env, summary.id);
  if (adminUrl) {
    lines.push(`✏️ Управление: <a href="${escapeAttribute(adminUrl)}">открыть в веб-панели</a>.`);
  } else {
    lines.push("✏️ Управляйте карточкой проекта через веб-панель TargetBot.");
  }
  if (accountInfo.status !== "valid" && summary.adAccountId) {
    lines.push(
      "",
      "⚠️ Подключите или обновите токен Meta, чтобы видеть расходы и кампании прямо в боте.",
    );
  }
  lines.push("", "Выберите действие на кнопках ниже.");
  await sendMessage(context, lines.join("\n"), { replyMarkup: buildProjectActionsMarkup(projectId) });
};

const handleProjectChat = async (context: BotContext, projectId: string): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  const lines = [`📲 Чат-группа — <b>${escapeHtml(summary.name)}</b>`, ""];
  if (summary.telegramLink) {
    lines.push(`Ссылка: <a href="${escapeAttribute(summary.telegramLink)}">перейти в чат</a>.`);
  }
  if (summary.telegramChatId) {
    lines.push(`ID: <code>${escapeHtml(summary.telegramChatId)}</code>`);
  }
  if (summary.telegramThreadId !== undefined) {
    lines.push(`Thread ID: <code>${escapeHtml(summary.telegramThreadId.toString())}</code>`);
  }
  if (!summary.telegramLink && !summary.telegramChatId) {
    lines.push("Чат не подключён. Добавьте бота в группу и обновите карточку проекта в веб-панели.");
  }
  lines.push(
    "",
    "После изменения чата откройте веб-панель TargetBot → карточка проекта, чтобы сохранить новые параметры.",
  );
  await sendMessage(context, lines.join("\n"), { replyMarkup: buildProjectBackMarkup(projectId) });
};

const formatLeadPreview = (lead: LeadRecord): string => {
  const statusIcon = lead.status === "done" ? "✅" : "🆕";
  const created = formatDateTime(lead.createdAt);
  const phone = lead.phone ? `, ${escapeHtml(lead.phone)}` : "";
  return `${statusIcon} ${escapeHtml(lead.name)}${phone} — ${escapeHtml(lead.source)} · ${escapeHtml(created)}`;
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
  const portalUrl = resolvePortalUrl(context.env, summary.id);
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

const handleProjectReport = async (context: BotContext, projectId: string): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  const accountInfo = await fetchProjectAccountInfo(context, summary);
  const account = accountInfo.account;
  const spendLabel = account?.spendFormatted ?? formatCurrencyValue(account?.spend, account?.spendCurrency);
  const lines = [
    `📈 Отчёт по рекламе — <b>${escapeHtml(summary.name)}</b>`,
    "",
    `Лиды: ${summary.leadStats.total} · Новые: ${summary.leadStats.new} · Закрыто: ${summary.leadStats.done}`,
    account
      ? `Расход за сегодня: ${spendLabel ? escapeHtml(spendLabel) : "—"}`
      : accountInfo.status === "valid"
        ? "Расход недоступен: кабинет не найден среди активных аккаунтов."
        : "Расходы недоступны: требуется действующий токен Meta.",
    "",
    "Используйте команду /summary для быстрой сводки или /auto_report для PDF-отчёта.",
    "Кнопка «📤 Экспорт данных» запустит форму выбора проектов прямо в этом чате.",
  ];
  await sendMessage(context, lines.join("\n"), { replyMarkup: buildProjectBackMarkup(projectId) });
};

const handleProjectCampaigns = async (context: BotContext, projectId: string): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  const accountInfo = await fetchProjectAccountInfo(context, summary, { includeCampaigns: true });
  const account = accountInfo.account;
  const lines: string[] = [];
  lines.push(`👀 Рекламные кампании — <b>${escapeHtml(summary.name)}</b>`);
  if (!summary.adAccountId) {
    lines.push("Рекламный кабинет не подключён. Добавьте его в веб-панели, чтобы видеть кампании.");
  } else if (!account) {
    if (accountInfo.status === "expired") {
      lines.push("Токен Meta истёк. Обновите авторизацию Facebook, чтобы получить список кампаний.");
    } else if (accountInfo.status === "missing") {
      lines.push("Токен Meta отсутствует. Выполните авторизацию в разделе «Авторизация Facebook».");
    } else if (accountInfo.status === "error") {
      lines.push(`Не удалось получить кампании: ${escapeHtml(accountInfo.error || "ошибка")}.`);
    } else {
      lines.push(
        `Кабинет <code>${escapeHtml(summary.adAccountId)}</code> не найден среди доступных. Проверьте права доступа в Meta Business Manager.`,
      );
    }
  } else if (account.campaigns?.length) {
    const spendLabel = account.spendFormatted ?? formatCurrencyValue(account.spend, account.spendCurrency);
    if (spendLabel) {
      lines.push(`Расход за период: ${escapeHtml(spendLabel)}`);
    }
    lines.push("", "Топ кампаний:");
    account.campaigns.slice(0, 5).forEach((campaign, index) => {
      const spend = campaign.spendFormatted ?? formatCurrencyValue(campaign.spend, campaign.spendCurrency);
      const metrics = spend ? ` — ${escapeHtml(spend)}` : "";
      lines.push(`${index + 1}. ${escapeHtml(campaign.name)}${metrics}`);
    });
    if (account.campaigns.length > 5) {
      lines.push(`… и ещё ${account.campaigns.length - 5} кампаний`);
    }
  } else {
    lines.push("Активные кампании не найдены за выбранный период.");
  }
  lines.push(
    "",
    "Детальная аналитика доступна в веб-панели и в разделе «📈 Аналитика» главного меню.",
  );
  await sendMessage(context, lines.join("\n"), { replyMarkup: buildProjectBackMarkup(projectId) });
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
  const portalUrl = resolvePortalUrl(context.env, summary.id);
  const lines = [`🧩 Портал проекта — <b>${escapeHtml(summary.name)}</b>`, ""];
  if (portalUrl) {
    lines.push(`Ссылка: <a href="${escapeAttribute(portalUrl)}">${escapeHtml(portalUrl)}</a>`);
    lines.push("Портал отображает лиды, статусы и оплату в реальном времени.");
  } else {
    lines.push(
      "URL портала не определён. Укажите PUBLIC_WEB_URL или PORTAL_BASE_URL в конфигурации воркера, чтобы делиться ссылкой.",
    );
  }
  lines.push(
    "",
    "В портале клиенты могут менять статусы лидов, просматривать расходы и скачивать отчёты.",
  );
  await sendMessage(context, lines.join("\n"), { replyMarkup: buildProjectBackMarkup(projectId) });
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
  lines.push(
    "",
    "Обновите статус оплаты, дату следующего платежа и тариф прямо отсюда — кнопки ниже.",
  );
  const statusButtons = (Object.keys(BILLING_STATUS_LABELS) as ProjectBillingState[]).map((status) => ({
    text: `${status === billing.status ? "✅" : "⚪️"} ${BILLING_STATUS_LABELS[status]}`,
    callback_data: `proj:billing-status:${projectId}:${status}`,
  }));
  const nextButtons = [
    [
      { text: "+7 дней", callback_data: `proj:billing-next:${projectId}:7` },
      { text: "+14 дней", callback_data: `proj:billing-next:${projectId}:14` },
    ],
    [
      { text: "+30 дней", callback_data: `proj:billing-next:${projectId}:30` },
      { text: "Очистить", callback_data: `proj:billing-next:${projectId}:clear` },
    ],
    [{ text: "📅 Указать дату", callback_data: `proj:billing-next:${projectId}:custom` }],
  ];
  const replyMarkup = {
    inline_keyboard: [
      statusButtons.slice(0, 2),
      statusButtons.slice(2, 4),
      ...nextButtons,
      [{ text: "💵 Обновить тариф", callback_data: `proj:billing-tariff:${projectId}` }],
      [{ text: "⬅ К проекту", callback_data: `proj:view:${projectId}` }],
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

const handleProjectSettings = async (context: BotContext, projectId: string): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  const adminUrl = resolveAdminProjectUrl(context.env, summary.id);
  const lines = [
    `⚙ Настройки проекта — <b>${escapeHtml(summary.name)}</b>`,
    "",
    "Карточка проекта синхронизируется с веб-панелью TargetBot.",
    "Измените название, владельца, подключенный кабинет и чат из веб-панели — бот обновит данные автоматически.",
  ];
  if (adminUrl) {
    lines.push("", `Открыть настройки: <a href="${escapeAttribute(adminUrl)}">перейти в веб-панель</a>.`);
  }
  lines.push(
    "",
    "Для глобальных параметров уведомлений используйте раздел ⚙ Настройки в главном меню.",
  );
  await sendMessage(context, lines.join("\n"), { replyMarkup: buildProjectBackMarkup(projectId) });
};

const handleProjectDelete = async (context: BotContext, projectId: string): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  const adminUrl = resolveAdminProjectUrl(context.env, summary.id);
  const lines = [
    `❌ Удаление проекта — <b>${escapeHtml(summary.name)}</b>`,
    "",
    "Удаление выполняется из веб-панели. После подтверждения TargetBot удалит архив лидов и оплат из R2.",
    "Перед удалением убедитесь, что отчёты и оплаты выгружены для клиента.",
  ];
  if (adminUrl) {
    lines.push("", `Открыть карточку для удаления: <a href="${escapeAttribute(adminUrl)}">перейти</a>.`);
  }
  await sendMessage(context, lines.join("\n"), { replyMarkup: buildProjectBackMarkup(projectId) });
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
      "Используйте веб-панель, чтобы создать первый проект и привязать чат.",
    ];
  }
  const items = summaries.map((project, index) => {
    const numberEmoji = `${index + 1}️⃣`;
    const chatLine = project.telegramLink
      ? `📲 <a href="${escapeAttribute(project.telegramLink)}">Чат-группа</a>`
      : "📲 Чат не подключён";
    const adAccountLine = project.adAccountId
      ? `🧩 Meta: <code>${escapeHtml(project.adAccountId)}</code>`
      : "🧩 Meta: не подключено";
    const stats = project.leadStats;
    const statsLine = `💬 Лиды: ${stats.total} (новые ${stats.new}, завершено ${stats.done})`;
    const billing = project.billing;
    const billingLine = (() => {
      if (billing.status === "missing") {
        return "💳 Оплата: не настроена";
      }
      const statusMap: Record<string, string> = {
        active: "Активен",
        pending: "Ожидает оплаты",
        overdue: "Просрочен",
        cancelled: "Отменён",
      };
      const label = statusMap[billing.status] ?? billing.status;
      const amount = billing.amountFormatted
        ? billing.amountFormatted
        : billing.amount !== undefined
          ? `${billing.amount.toFixed(2)} ${billing.currency || "USD"}`
          : null;
      const period = billing.periodLabel ? ` · ${billing.periodLabel}` : "";
      const prefix = billing.overdue ? "⚠️" : "💳";
      return `${prefix} Оплата: ${escapeHtml(label)}${amount ? ` — ${escapeHtml(amount)}` : ""}${escapeHtml(period)}`;
    })();
    return [
      `${numberEmoji} <b>${escapeHtml(project.name)}</b>`,
      chatLine,
      adAccountLine,
      statsLine,
      billingLine,
    ].join("\n");
  });

  return [
    "📊 Проекты",
    "",
    ...items,
    "",
    "➕ Новый проект — нажмите кнопку ниже, чтобы пройти мастер привязки прямо в боте.",
  ];
};

const handleProjects = async (context: BotContext): Promise<void> => {
  const summaries = await loadProjectSummaries(context);
  const lines = formatProjectLines(summaries);
  await sendMessage(context, lines.join("\n"), {
    replyMarkup: buildProjectListMarkup(summaries),
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
      "Проверьте список проектов в веб-панели и повторите попытку.",
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

  lines.push("", "Список синхронизируется с веб-панелью /admin → Meta Accounts.");

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
    nextPaymentDate: null,
    tariff: 0,
    createdAt: now,
    updatedAt: now,
    settings: {},
    userId,
    telegramChatId: group.chatId,
    telegramLink: group.title ?? undefined,
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
    "Нажмите «📈 По проектам», чтобы увидеть разбивку по каждому проекту, или «📥 Экспорт», чтобы собрать отчёт.",
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

const handleAnalyticsExport = async (context: BotContext): Promise<void> => {
  await startReportWorkflow(context, "summary");
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
    "Используйте кнопки ниже для управления сервисными настройками.",
    "🔄 Обновить вебхуки — выполните после изменения URL воркера или токена.",
    "🧩 Проверить токен Meta — доступно в разделе Авторизация Facebook.",
    "⏰ Время автоотчёта и формат уведомлений настраиваются в веб-панели.",
  ];

  await sendMessage(context, lines.join("\n"), { replyMarkup: SETTINGS_MARKUP });
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
      { replyMarkup: SETTINGS_MARKUP },
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

  await sendMessage(context, lines.join("\n"), { replyMarkup: SETTINGS_MARKUP });
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
  const [, action] = data.split(":");
  switch (action) {
    case "projects":
      await handleAnalyticsProjects(context);
      return true;
    case "export":
      await handleAnalyticsExport(context);
      return true;
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
    case "campaigns":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectCampaigns(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
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
    case "billing":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectBilling(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
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
    case "settings":
      if (!rest[0]) {
        return ensureId();
      }
      await handleProjectSettings(context, rest[0]);
      await logProjectAction(context, action, rest[0]);
      return true;
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
