import { BotContext } from "./types";
import { encodeMetaOAuthState } from "../utils/meta";
import { listSettings } from "../utils/storage";

const AUTH_URL_FALLBACK = "https://th-reports.buyclientuz.workers.dev/auth/facebook";

const AUTH_URL_CANDIDATES: Array<(env: BotContext["env"]) => string | null> = [
  (env) => (typeof env.AUTH_FACEBOOK_URL === "string" ? env.AUTH_FACEBOOK_URL : null),
  (env) => (typeof env.META_AUTH_URL === "string" ? env.META_AUTH_URL : null),
  (env) => (typeof env.FB_AUTH_URL === "string" ? env.FB_AUTH_URL : null),
  (env) =>
    typeof env.PUBLIC_WEB_URL === "string" && env.PUBLIC_WEB_URL.trim()
      ? `${env.PUBLIC_WEB_URL.replace(/\/$/, "")}/auth/facebook`
      : null,
  (env) =>
    typeof env.PUBLIC_BASE_URL === "string" && env.PUBLIC_BASE_URL.trim()
      ? `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/auth/facebook`
      : null,
  (env) =>
    typeof env.WORKER_BASE_URL === "string" && env.WORKER_BASE_URL.trim()
      ? `${env.WORKER_BASE_URL.replace(/\/$/, "")}/auth/facebook`
      : null,
];

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

const BOT_USERNAME_SETTING_KEYS = ["bot.username", "bot.telegram.username", "bot.telegram.handle"];

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
  if (domainMatch?.[1]) {
    return normalizeUsername(domainMatch[1]);
  }
  const tmeMatch = trimmed.match(/t\.me\/(?:joinchat\/)?([^/?]+)/i);
  if (tmeMatch?.[1]) {
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

export const resolveAuthUrl = (env: BotContext["env"]): string => {
  for (const candidate of AUTH_URL_CANDIDATES) {
    const value = candidate(env);
    if (value && value.trim()) {
      return value;
    }
  }
  return AUTH_URL_FALLBACK;
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

export const appendQueryParameter = (base: string, key: string, value: string): string => {
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

export const buildAuthState = async (context: BotContext): Promise<string | null> => {
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

export const resolveManageWebhookUrl = (env: BotContext["env"]): string | null => {
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
