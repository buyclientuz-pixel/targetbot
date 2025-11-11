import { badRequest, jsonResponse, unauthorized } from "../utils/http";
import { WorkerEnv } from "../types";

interface TelegramResponse {
  ok: boolean;
  description?: string;
  result?: unknown;
  [key: string]: unknown;
}

const maskToken = (token: string): string => {
  if (token.length <= 6) {
    return token.slice(0, 2) + "****";
  }
  const head = token.slice(0, 5);
  const tail = token.slice(-4);
  return head + "****" + tail;
};

const ensureAuthorized = (request: Request, env: WorkerEnv): Response | null => {
  const adminKey = typeof env.ADMIN_KEY === "string" ? env.ADMIN_KEY : null;
  if (!adminKey) {
    return unauthorized("Admin key is not configured");
  }
  const header = request.headers.get("authorization") || "";
  if (header !== "Bearer " + adminKey) {
    return unauthorized("Invalid authorization header");
  }
  return null;
};

const collectKnownTokens = (env: WorkerEnv): string[] => {
  const tokens: string[] = [];
  if (typeof env.BOT_TOKEN === "string" && env.BOT_TOKEN) {
    tokens.push(env.BOT_TOKEN);
  }
  if (typeof env.TELEGRAM_BOT_TOKEN === "string" && env.TELEGRAM_BOT_TOKEN) {
    tokens.push(env.TELEGRAM_BOT_TOKEN);
  }
  if (typeof env.TG_API_TOKEN === "string" && env.TG_API_TOKEN) {
    tokens.push(env.TG_API_TOKEN);
  }
  return tokens;
};

const telegramFetch = async (
  token: string,
  method: string,
  data: Record<string, unknown> | null = null,
): Promise<TelegramResponse> => {
  const url = "https://api.telegram.org/bot" + token + "/" + method;
  const hasPayload = data !== null && Object.keys(data).length > 0;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: hasPayload ? JSON.stringify(data) : undefined,
  });
  const text = await response.text();
  let parsed: TelegramResponse;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error("Telegram API returned non-JSON response");
  }
  if (!response.ok) {
    const description = parsed.description || "Telegram API request failed";
    throw new Error(description);
  }
  return parsed;
};

const buildUsageResponse = (): Response => {
  return jsonResponse({
    ok: false,
    error: "Invalid action",
    usage: {
      status: "/manage/telegram/webhook?action=status&token=<BOT_TOKEN>",
      drop: "/manage/telegram/webhook?action=drop&token=<BOT_TOKEN>",
      refresh:
        "/manage/telegram/webhook?action=refresh&token=<BOT_TOKEN>&url=https://example.com/telegram/<bot_id>&drop=1",
    },
  });
};

export const handleManageTelegramWebhook = async (
  request: Request,
  env: WorkerEnv,
): Promise<Response> => {
  if (request.method !== "GET") {
    return badRequest("Method not allowed");
  }

  const authFailure = ensureAuthorized(request, env);
  if (authFailure) {
    return authFailure;
  }

  const url = new URL(request.url);
  const action = (url.searchParams.get("action") || "status").toLowerCase();
  const token = url.searchParams.get("token") || "";
  const requestedUrl = url.searchParams.get("url") || "";
  const dropFlag = url.searchParams.get("drop") === "1";

  if (!token) {
    return badRequest("Missing token parameter");
  }

  const knownTokens = collectKnownTokens(env);
  if (!knownTokens.includes(token)) {
    return unauthorized("Provided token is not allowed");
  }

  try {
    if (action === "status") {
      const statusData = await telegramFetch(token, "getWebhookInfo");
      return jsonResponse({
        ok: true,
        token: maskToken(token),
        webhook: statusData.result ?? statusData,
      });
    }

    if (action === "drop") {
      const dropResult = await telegramFetch(token, "deleteWebhook");
      if (!dropResult.ok) {
        return jsonResponse(
          { ok: false, token: maskToken(token), error: dropResult.description || "Failed to delete webhook" },
          { status: 502 },
        );
      }
      return jsonResponse({ ok: true, message: "Webhook deleted", token: maskToken(token) });
    }

    if (action === "refresh") {
      if (!requestedUrl) {
        return badRequest("Missing url parameter");
      }
      if (dropFlag) {
        await telegramFetch(token, "deleteWebhook");
      }
      const setResult = await telegramFetch(token, "setWebhook", { url: requestedUrl });
      if (!setResult.ok) {
        return jsonResponse(
          { ok: false, token: maskToken(token), error: setResult.description || "Failed to set webhook" },
          { status: 502 },
        );
      }
      const info = await telegramFetch(token, "getWebhookInfo");
      return jsonResponse({
        ok: true,
        message: "Webhook updated",
        token: maskToken(token),
        webhook: info.result ?? info,
      });
    }

    return buildUsageResponse();
  } catch (error) {
    const message = (error as Error).message || "Unknown error";
    return jsonResponse({
      ok: false,
      token: maskToken(token),
      error: message,
    }, { status: 500 });
  }
};
