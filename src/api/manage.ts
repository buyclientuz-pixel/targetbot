import { jsonResponse } from "../utils/http";
import { TelegramEnv } from "../utils/telegram";

const ensureEnv = (env: unknown): TelegramEnv & Record<string, unknown> => {
  if (!env || typeof env !== "object") {
    throw new Error("Env bindings are not configured");
  }
  return env as TelegramEnv & Record<string, unknown>;
};

const resolveWebhookUrl = (env: Record<string, unknown>): string | null => {
  const value = env.TELEGRAM_WEBHOOK_URL || env.BOT_WEBHOOK_URL || env.WEBHOOK_URL;
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
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
  const webhookUrl = resolveWebhookUrl(bindings);
  if (!webhookUrl) {
    return jsonResponse({ ok: false, error: "Webhook URL is not configured" }, { status: 400 });
  }
  const url = new URL(request.url);
  const shouldDrop = url.searchParams.get("drop") === "1" || url.searchParams.get("drop") === "true";
  try {
    if (shouldDrop) {
      await revokeWebhook(token);
    }
    const response = await setWebhook(token, webhookUrl);
    if (!response.ok) {
      const text = await response.text();
      return jsonResponse({ ok: false, error: "Failed to set webhook", details: text }, { status: 502 });
    }
    const data = await response.json();
    return jsonResponse({ ok: true, data });
  } catch (error) {
    return jsonResponse({ ok: false, error: (error as Error).message }, { status: 500 });
  }
};
