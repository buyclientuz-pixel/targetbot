import { BotContext } from "./types";
import { sendMainMenu } from "./menu";
import { startReportWorkflow } from "./reports";
import { escapeAttribute, escapeHtml } from "../utils/html";
import { summarizeProjects, sortProjectSummaries } from "../utils/projects";
import {
  appendCommandLog,
  clearPendingMetaLink,
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
  saveChatRegistrations,
  saveMetaAccountLinks,
  savePendingMetaLink,
  saveProjects,
  saveTelegramGroupLinks,
  saveUsers,
  loadProject,
} from "../utils/storage";
import { createId } from "../utils/ids";
import { answerCallbackQuery, editTelegramMessage, sendTelegramMessage } from "../utils/telegram";
import { encodeMetaOAuthState, fetchAdAccounts, resolveMetaStatus } from "../utils/meta";
import {
  ChatRegistrationRecord,
  LeadRecord,
  MetaAccountLinkRecord,
  MetaAdAccount,
  ProjectRecord,
  ProjectSummary,
  TelegramGroupLinkRecord,
  UserRecord,
} from "../types";

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

const resolveNewProjectUrl = (env: BotContext["env"]): string | null => {
  const path = "/admin/projects/new";
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

const NEW_PROJECT_MARKUP = {
  inline_keyboard: [
    [{ text: "📊 Все проекты", callback_data: "cmd:projects" }],
    [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
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

const buildMetaGroupMarkup = (groups: TelegramGroupLinkRecord[]) => {
  const rows = groups.map((group) => {
    const label = group.title ? `👥 ${group.title}` : `👥 ${group.chatId}`;
    return [{ text: label, callback_data: `meta:group:${group.chatId}` }];
  });
  rows.push([{ text: "❌ Отменить", callback_data: "meta:cancel" }]);
  rows.push([{ text: "⬅ Meta-аккаунты", callback_data: "cmd:meta" }]);
  return { inline_keyboard: rows };
};

const META_CONFIRM_MARKUP = {
  inline_keyboard: [
    [
      { text: "✅ Подтвердить", callback_data: "meta:confirm" },
      { text: "❌ Отменить", callback_data: "meta:cancel" },
    ],
    [{ text: "⬅ Meta-аккаунты", callback_data: "cmd:meta" }],
  ],
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
    "Нажмите кнопку ✔ в портале, чтобы менять статусы без перезагрузки, или используйте раздел Проекты в веб-панели.",
  );
  await sendMessage(context, lines.join("\n"), { replyMarkup: buildProjectBackMarkup(projectId) });
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

const handleProjectBilling = async (context: BotContext, projectId: string): Promise<void> => {
  const summary = await ensureProjectSummary(context, projectId);
  if (!summary) {
    return;
  }
  const billing = summary.billing;
  const lines: string[] = [];
  lines.push(`💳 Оплата — <b>${escapeHtml(summary.name)}</b>`);
  lines.push(describeBillingStatus(summary));
  lines.push(describePaymentSchedule(summary));
  if (billing.notes) {
    lines.push("Заметка:");
    lines.push(escapeHtml(billing.notes));
  }
  lines.push(
    "",
    "Управляйте оплатами в разделе 💰 Финансы веб-панели. Там же можно зафиксировать платёж и обновить тариф.",
  );
  await sendMessage(context, lines.join("\n"), { replyMarkup: buildProjectBackMarkup(projectId) });
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
  const newProjectUrl = resolveNewProjectUrl(context.env);
  const lines = [
    "➕ Новый проект",
    "",
    newProjectUrl
      ? `Создайте проект в веб-панели: <a href="${escapeAttribute(newProjectUrl)}">перейти к форме</a>.`
      : "Создайте проект через веб-панель TargetBot (/admin → Проекты).",
    "После создания привяжите чат и рекламный кабинет, чтобы бот показывал статистику и лиды.",
  ];
  await sendMessage(context, lines.join("\n"), { replyMarkup: NEW_PROJECT_MARKUP });
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
    "➕ Новый проект — откройте веб-панель TargetBot или выполните /project_new (в разработке)",
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

const handleUsers = async (context: BotContext): Promise<void> => {
  const users = await listUsers(context.env);
  const total = users.length;
  const roles = users.reduce(
    (acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const lines = [
    "👥 Пользователи",
    "",
    total
      ? `Всего пользователей: <b>${total}</b>`
      : "Пока нет зарегистрированных пользователей.",
    total ? `Владельцы: ${roles.owner ?? 0}` : "",
    total ? `Менеджеры: ${roles.manager ?? 0}` : "",
    total ? `Клиенты: ${roles.client ?? 0}` : "",
    "",
    "Перейдите в веб-панель /admin/users для создания и управления ролями.",
  ].filter(Boolean);

  await sendMessage(context, lines.join("\n"));
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

  await savePendingMetaLink(context.env, userId, { metaAccountId: accountId });

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
          [{ text: "🔗 Meta-аккаунты", callback_data: "cmd:meta" }],
          [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
        ],
      },
    });
    return;
  }

  lines.push("", "Список доступных Telegram-групп:");
  await sendMessage(context, lines.join("\n"), { replyMarkup: buildMetaGroupMarkup(availableGroups) });
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
    metaAccountId: pending.metaAccountId,
    telegramChatId: chatId,
  });

  const groupLabel = group.title ? group.title : group.chatId;
  const lines = [
    "📌 Готово.",
    "",
    `Привязать аккаунт <b>${escapeHtml(account.accountName)}</b> к группе <b>${escapeHtml(groupLabel)}</b>?`,
  ];

  await sendMessage(context, lines.join("\n"), { replyMarkup: META_CONFIRM_MARKUP });
};

const handleMetaLinkCancel = async (context: BotContext): Promise<void> => {
  if (context.userId) {
    try {
      await clearPendingMetaLink(context.env, context.userId);
    } catch (error) {
      console.warn("Failed to clear pending meta link", error);
    }
  }

  await sendMessage(context, "❌ Привязка отменена.", {
    replyMarkup: {
      inline_keyboard: [
        [{ text: "🔗 Meta-аккаунты", callback_data: "cmd:meta" }],
        [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
      ],
    },
  });
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

  const lines = [
    "Проект создан!",
    `RA: <b>${escapeHtml(account.accountName)}</b>`,
    `Группа: <b>${escapeHtml(group.title ?? group.chatId)}</b>`,
  ];

  await sendMessage(context, lines.join("\n"), {
    replyMarkup: {
      inline_keyboard: [
        [{ text: "Перейти в проект", callback_data: `proj:view:${projectId}` }],
        [{ text: "🔗 Meta-аккаунты", callback_data: "cmd:meta" }],
        [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
      ],
    },
  });
};

const handleMetaProjectView = async (context: BotContext, projectId: string): Promise<void> => {
  const project = await loadProject(context.env, projectId);
  if (!project) {
    await sendMessage(context, "❌ Проект не найден. Обновите список Meta-аккаунтов.");
    return;
  }
  await handleProjectView(context, projectId);
};

const handleAnalytics = async (context: BotContext): Promise<void> => {
  const summaries = sortProjectSummaries(await summarizeProjects(context.env));
  const lines: string[] = ["📈 Аналитика", ""];
  if (summaries.length) {
    for (const project of summaries) {
      const cpa = project.leadStats.done
        ? (project.leadStats.total / project.leadStats.done).toFixed(1)
        : "—";
      lines.push(`📊 ${escapeHtml(project.name)} — лидов: ${project.leadStats.total}, закрыто: ${project.leadStats.done}, CPA: ${cpa}`);
    }
  } else {
    lines.push("Нет данных для аналитики. Добавьте проекты и лиды, чтобы сформировать отчёт.");
  }
  lines.push("", "Фильтры по периодам и экспорт появятся в следующих итерациях веб-панели.");
  lines.push("", "Команды /summary и /auto_report сформируют отчёты прямо в этом чате.");

  await sendMessage(context, lines.join("\n"));
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

  lines.push("", "Используйте веб-панель для детализации оплат и обновления статусов.");

  await sendMessage(context, lines.join("\n"));
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
): Promise<void> => {
  await logCommand(context, `project:${action}`, projectId);
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

export const handleProjectCallback = async (context: BotContext, data: string): Promise<boolean> => {
  if (!data.startsWith("proj:")) {
    return false;
  }
  await ensureAdminUser(context);
  const [, action, ...rest] = data.split(":");
  if (!action) {
    return false;
  }
  const projectId = rest.length ? rest.join(":") : undefined;
  const ensureId = async (): Promise<boolean> => {
    await sendMessage(
      context,
      "Не удалось определить проект. Откройте список проектов и попробуйте снова.",
    );
    return true;
  };
  switch (action) {
    case "view":
      if (!projectId) {
        return ensureId();
      }
      await handleProjectView(context, projectId);
      await logProjectAction(context, action, projectId);
      return true;
    case "chat":
      if (!projectId) {
        return ensureId();
      }
      await handleProjectChat(context, projectId);
      await logProjectAction(context, action, projectId);
      return true;
    case "leads":
      if (!projectId) {
        return ensureId();
      }
      await handleProjectLeads(context, projectId);
      await logProjectAction(context, action, projectId);
      return true;
    case "report":
      if (!projectId) {
        return ensureId();
      }
      await handleProjectReport(context, projectId);
      await logProjectAction(context, action, projectId);
      return true;
    case "campaigns":
      if (!projectId) {
        return ensureId();
      }
      await handleProjectCampaigns(context, projectId);
      await logProjectAction(context, action, projectId);
      return true;
    case "export":
      if (!projectId) {
        return ensureId();
      }
      await handleProjectExport(context, projectId);
      await logProjectAction(context, action, projectId);
      return true;
    case "portal":
      if (!projectId) {
        return ensureId();
      }
      await handleProjectPortal(context, projectId);
      await logProjectAction(context, action, projectId);
      return true;
    case "billing":
      if (!projectId) {
        return ensureId();
      }
      await handleProjectBilling(context, projectId);
      await logProjectAction(context, action, projectId);
      return true;
    case "settings":
      if (!projectId) {
        return ensureId();
      }
      await handleProjectSettings(context, projectId);
      await logProjectAction(context, action, projectId);
      return true;
    case "delete":
      if (!projectId) {
        return ensureId();
      }
      await handleProjectDelete(context, projectId);
      await logProjectAction(context, action, projectId);
      return true;
    case "new":
      await handleProjectNew(context);
      await logProjectAction(context, action);
      return true;
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
