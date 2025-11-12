import { jsonResponse } from "../utils/http";
import { TelegramEnv } from "../utils/telegram";
import { EnvBindings, listSettings, saveSettings } from "../utils/storage";

type ManageEnv = TelegramEnv & Partial<EnvBindings> & Record<string, unknown>;

const SETTINGS_WEBHOOK_KEYS = [
  "bot.webhookUrl",
  "bot.webhook.url",
  "bot.telegram.webhookUrl",
  "system.webhookUrl",
  "system.telegram.webhookUrl",
  "telegram.webhook.url",
] as const;

const DEFAULT_SETTING_KEY = "bot.webhookUrl";

const ensureEnv = (env: unknown): ManageEnv => {
  if (!env || typeof env !== "object") {
    throw new Error("Env bindings are not configured");
  }
  return env as ManageEnv;
};

const normalizeDirectWebhook = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    url.hash = "";
    return url.toString();
  } catch (error) {
    console.warn("Invalid webhook URL", value, error);
    return null;
  }
};

const buildWebhookFromBase = (value: unknown, fallbackPath = "/bot/webhook"): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (!url.pathname || url.pathname === "/") {
      url.pathname = fallbackPath;
    }
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch (error) {
    console.warn("Invalid webhook base", value, error);
    return null;
  }
};

const resolveWebhookFromSettings = async (env: ManageEnv): Promise<{ url: string; source: string } | null> => {
  if (!env.DB || !env.R2) {
    return null;
  }
  try {
    const settings = await listSettings({ DB: env.DB, R2: env.R2 });
    for (const key of SETTINGS_WEBHOOK_KEYS) {
      const entry = settings.find((item) => item.key === key);
      if (!entry) {
        continue;
      }
      if (typeof entry.value === "string") {
        const direct = normalizeDirectWebhook(entry.value);
        if (direct) {
          return { url: direct, source: `settings:${key}` };
        }
        const base = buildWebhookFromBase(entry.value);
        if (base) {
          return { url: base, source: `settings:${key}` };
        }
      }
      if (entry.value && typeof entry.value === "object") {
        const objectValue = entry.value as Record<string, unknown>;
        const candidates = [objectValue.url, objectValue.webhook, objectValue.value];
        for (const candidate of candidates) {
          const direct = normalizeDirectWebhook(candidate);
          if (direct) {
            return { url: direct, source: `settings:${key}` };
          }
          const base = buildWebhookFromBase(candidate as string | undefined);
          if (base) {
            return { url: base, source: `settings:${key}` };
          }
        }
      }
    }
  } catch (error) {
    console.warn("Failed to read webhook settings", error);
  }
  return null;
};

const resolveWebhookFromEnv = (env: ManageEnv): { url: string; source: string } | null => {
  const directCandidates = [
    env.TELEGRAM_WEBHOOK_URL,
    env.BOT_WEBHOOK_URL,
    env.WEBHOOK_URL,
    env.PUBLIC_TELEGRAM_WEBHOOK,
    env.PUBLIC_WEBHOOK_URL,
    env.PUBLIC_URL,
    env.APP_WEBHOOK_URL,
  ];
  for (const candidate of directCandidates) {
    const direct = normalizeDirectWebhook(candidate);
    if (direct) {
      return { url: direct, source: "env" };
    }
  }

  const baseCandidates = [
    env.TELEGRAM_WEBHOOK_BASE,
    env.BOT_WEBHOOK_BASE,
    env.PUBLIC_WEB_URL,
    env.PUBLIC_BASE_URL,
    env.PUBLIC_WORKER_URL,
    env.WORKER_PUBLIC_URL,
    env.WORKER_BASE_URL,
    env.MANAGE_BASE_URL,
    env.PUBLIC_URL,
    env.APP_BASE_URL,
  ];

  for (const candidate of baseCandidates) {
    const url = buildWebhookFromBase(candidate);
    if (url) {
      return { url, source: "env-base" };
    }
  }

  return null;
};

const resolveWebhookTarget = async (
  request: Request,
  env: ManageEnv,
): Promise<{ url: string; source: string } | null> => {
  const envResolved = resolveWebhookFromEnv(env);
  if (envResolved) {
    return envResolved;
  }

  const settingResolved = await resolveWebhookFromSettings(env);
  if (settingResolved) {
    return settingResolved;
  }

  try {
    const url = new URL(request.url);
    url.pathname = "/bot/webhook";
    url.search = "";
    url.hash = "";
    return { url: url.toString(), source: "request" };
  } catch (error) {
    console.warn("Failed to derive webhook URL from request", error);
  }

  return null;
};

const persistWebhookSetting = async (env: ManageEnv, url: string, source: string): Promise<void> => {
  if (!env.DB || !env.R2) {
    return;
  }
  try {
    const settings = await listSettings({ DB: env.DB, R2: env.R2 });
    const now = new Date().toISOString();
    const existingIndex = settings.findIndex((entry) => entry.key === DEFAULT_SETTING_KEY);
    const next = [...settings];
    if (existingIndex >= 0) {
      next[existingIndex] = {
        ...next[existingIndex],
        value: url,
        updatedAt: now,
      };
    } else {
      next.push({
        key: DEFAULT_SETTING_KEY,
        value: url,
        scope: "bot",
        updatedAt: now,
      });
    }
    await saveSettings({ DB: env.DB, R2: env.R2 }, next);
    if (source !== "env") {
      Object.assign(env, { TELEGRAM_WEBHOOK_URL: url });
    }
  } catch (error) {
    console.warn("Failed to persist webhook setting", error);
  }
};

const revokeWebhook = async (token: string): Promise<void> => {
  const url = new URL(`https://api.telegram.org/bot${token}/deleteWebhook`);
  await fetch(url.toString(), { method: "POST" });
};

const setWebhook = async (token: string, webhookUrl: string): Promise<Response> => {
  const url = new URL(`https://api.telegram.org/bot${token}/setWebhook`);
  url.searchParams.set("url", webhookUrl);
  return fetch(url.toString(), { method: "POST" });
};

export const handleTelegramWebhookRefresh = async (request: Request, env: unknown): Promise<Response> => {
  const bindings = ensureEnv(env);
  const token = (bindings.BOT_TOKEN || bindings.TELEGRAM_BOT_TOKEN || bindings.TG_API_TOKEN) as string | undefined;
  if (!token) {
    return jsonResponse({ ok: false, error: "Telegram token is missing" }, { status: 400 });
  }

  const resolved = await resolveWebhookTarget(request, bindings);
  if (!resolved) {
    return jsonResponse({ ok: false, error: "Webhook URL is not configured" }, { status: 400 });
  }

  if (resolved.source !== "env") {
    await persistWebhookSetting(bindings, resolved.url, resolved.source);
  } else {
    Object.assign(bindings, { TELEGRAM_WEBHOOK_URL: resolved.url });
  }

  const url = new URL(request.url);
  const shouldDrop = url.searchParams.get("drop") === "1" || url.searchParams.get("drop") === "true";
  try {
    if (shouldDrop) {
      await revokeWebhook(token);
    }
    const response = await setWebhook(token, resolved.url);
    if (!response.ok) {
      const text = await response.text();
      return jsonResponse(
        {
          ok: false,
          error: "Failed to set webhook",
          details: { response: text, source: resolved.source },
        },
        { status: 502 },
      );
    }
    const data = await response.json();
    return jsonResponse({ ok: true, data: { ...data, webhookUrl: resolved.url, source: resolved.source } });
  } catch (error) {
    return jsonResponse({ ok: false, error: (error as Error).message }, { status: 500 });
  }
};
