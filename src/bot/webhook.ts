import type { RouteHandler } from "../core/types";
import { requireAdmin } from "../core/auth";
import { fail, ok } from "../core/utils";

const API_BASE = "https://api.telegram.org";

async function getWebhookInfo(token: string) {
  const response = await fetch(`${API_BASE}/bot${token}/getWebhookInfo`);
  if (!response.ok) {
    throw new Error(`Failed to get webhook info: ${response.status}`);
  }
  return response.json();
}

async function setWebhook(token: string, url: string) {
  const response = await fetch(`${API_BASE}/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) {
    throw new Error(`Failed to set webhook: ${response.status}`);
  }
  return response.json();
}

async function deleteWebhook(token: string) {
  const response = await fetch(`${API_BASE}/bot${token}/deleteWebhook`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Failed to delete webhook: ${response.status}`);
  }
  return response.json();
}

export const manageWebhookHandler: RouteHandler = async (context) => {
  const authError = requireAdmin(context);
  if (authError) return authError;
  const url = new URL(context.request.url);
  const action = url.searchParams.get("action") ?? "status";
  const token = url.searchParams.get("token") ?? context.env.TELEGRAM_TOKEN;
  if (!token) return fail("Telegram token is not configured", 400);
  const botId = token.split(":")[0];
  const webhookUrl = url.searchParams.get("url") ?? `${context.env.WORKER_PUBLIC_URL ?? new URL(context.request.url).origin}/telegram/${botId}`;
  try {
    switch (action) {
      case "status":
        return ok({ status: "status", result: await getWebhookInfo(token) });
      case "drop":
        return ok({ status: "dropped", result: await deleteWebhook(token) });
      case "refresh":
        if (url.searchParams.get("drop") === "1") {
          await deleteWebhook(token);
        }
        return ok({ status: "refreshed", result: await setWebhook(token, webhookUrl) });
      default:
        return fail("Unsupported action", 400);
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), 500);
  }
};
