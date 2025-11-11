import { badRequest, jsonResponse, unauthorized, serverError } from "../utils/http";
import { WorkerEnv, MetaAuthStatus, MetaAccountInfo, MetaTokenStatus } from "../types";
import { loadMetaStatus, STATUS_CACHE_KEY, clearMetaStatusCache } from "./meta";
import { getFacebookTokenStatus } from "../fb/auth";
import { readJsonFromR2, appendLogEntry } from "../utils/r2";

interface TelegramResponse {
  ok: boolean;
  description?: string;
  result?: unknown;
  [key: string]: unknown;
}

const maskToken = (token: string): string => {
  if (token.length <= 6) {
    return `${token.slice(0, 2)}****`;
  }
  const head = token.slice(0, 5);
  const tail = token.slice(-4);
  return head + `****${tail}`;
};

const ensureAuthorized = (request: Request, env: WorkerEnv, token: string): Response | null => {
  const adminKey = typeof env.ADMIN_KEY === "string" ? env.ADMIN_KEY : null;
  const header = request.headers.get("authorization");

  if (header) {
    if (!adminKey) {
      return unauthorized("Admin key is not configured");
    }
    if (header !== `Bearer ${adminKey}`) {
      return unauthorized("Invalid authorization header");
    }
    return null;
  }

  const botToken = typeof env.BOT_TOKEN === "string" ? env.BOT_TOKEN : null;
  if (token && botToken && token === botToken) {
    return null;
  }

  return unauthorized("Unauthorized. Provide ADMIN_KEY or valid bot token.");
};

const ensureMetaManageAuthorized = (
  request: Request,
  env: WorkerEnv,
  providedToken: string
): Response | null => {
  const adminKey = typeof env.ADMIN_KEY === "string" ? env.ADMIN_KEY.trim() : "";
  const header = request.headers.get("authorization");

  if (header) {
    if (!adminKey) {
      return unauthorized("Admin key is not configured");
    }
    if (header !== `Bearer ${adminKey}`) {
      return unauthorized("Invalid admin key");
    }
    return null;
  }

  const manageToken = typeof env.META_MANAGE_TOKEN === "string" ? env.META_MANAGE_TOKEN.trim() : "";
  if (!manageToken) {
    return unauthorized("Manage token is not configured");
  }

  if (!providedToken || providedToken.trim() !== manageToken) {
    return unauthorized("Invalid manage token");
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
  data: Record<string, unknown> | null = null
): Promise<TelegramResponse> => {
  const url = `https://api.telegram.org/bot${token}/${method}`;
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

export const getTelegramWebhookStatus = async (
  env: WorkerEnv,
  tokenOverride?: string
): Promise<{ ok: boolean; token?: string; webhook?: unknown; error?: string }> => {
  const knownTokens = collectKnownTokens(env);
  const token = tokenOverride && tokenOverride.trim() ? tokenOverride.trim() : knownTokens[0];

  if (!token) {
    return { ok: false, error: "Bot token is not configured" };
  }

  if (!knownTokens.includes(token)) {
    return { ok: false, token: maskToken(token), error: "Provided token is not allowed" };
  }

  try {
    const info = await telegramFetch(token, "getWebhookInfo");
    return { ok: true, token: maskToken(token), webhook: info.result ?? info };
  } catch (error) {
    return {
      ok: false,
      token: maskToken(token),
      error: (error as Error).message || "Telegram API request failed",
    };
  }
};

export const handleManageTelegramWebhook = async (
  request: Request,
  env: WorkerEnv
): Promise<Response> => {
  if (request.method !== "GET") {
    return badRequest("Method not allowed");
  }

  const url = new URL(request.url);
  const action = (url.searchParams.get("action") || "status").toLowerCase();
  const token = url.searchParams.get("token") || "";
  const requestedUrl = url.searchParams.get("url") || "";
  const dropFlag = url.searchParams.get("drop") === "1";

  const authFailure = ensureAuthorized(request, env, token);
  if (authFailure) {
    return authFailure;
  }

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
          {
            ok: false,
            token: maskToken(token),
            error: dropResult.description || "Failed to delete webhook",
          },
          { status: 502 }
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
          {
            ok: false,
            token: maskToken(token),
            error: setResult.description || "Failed to set webhook",
          },
          { status: 502 }
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
    return jsonResponse(
      {
        ok: false,
        token: maskToken(token),
        error: message,
      },
      { status: 500 }
    );
  }
};

const loadCachedMetaStatus = async (
  env: WorkerEnv
): Promise<
  (MetaAuthStatus & { updated_at?: string; accounts?: MetaAccountInfo[]; cached?: boolean }) | null
> => {
  const cached = await readJsonFromR2<
    MetaAuthStatus & { updated_at?: string; accounts?: MetaAccountInfo[] }
  >(env, STATUS_CACHE_KEY);
  if (!cached) {
    return null;
  }
  return { ...cached, cached: true };
};

export const handleManageMeta = async (request: Request, env: WorkerEnv): Promise<Response> => {
  if (request.method !== "GET") {
    return badRequest("Method not allowed");
  }

  const url = new URL(request.url);
  const tokenParam = (url.searchParams.get("token") || "").trim();
  const action = (url.searchParams.get("action") || "status").toLowerCase();
  const refreshParam = url.searchParams.get("refresh");

  const authError = ensureMetaManageAuthorized(request, env, tokenParam);
  if (authError) {
    return authError;
  }

  if (action === "clear") {
    const cleared = await clearMetaStatusCache(env);
    await appendLogEntry(env, {
      level: "info",
      message: "Meta status cache cleared via /manage/meta",
      timestamp: new Date().toISOString(),
    });
    return jsonResponse({ ok: cleared, cleared });
  }

  const forceRefresh = action === "refresh" || refreshParam === "1";
  let status:
    | (MetaAuthStatus & {
        updated_at?: string | null;
        accounts?: MetaAccountInfo[];
        cached?: boolean;
      })
    | null = null;
  let errorMessage: string | null = null;

  try {
    status = await loadMetaStatus(env, { useCache: !forceRefresh });
  } catch (error) {
    errorMessage = (error as Error).message || "Unknown error";
    const fallback = await loadCachedMetaStatus(env);
    if (fallback) {
      status = fallback;
    } else {
      await appendLogEntry(env, {
        level: "error",
        message: `Meta manage status failed: ${errorMessage}`,
        timestamp: new Date().toISOString(),
      });
      return serverError({ ok: false, error: errorMessage });
    }
  }

  let tokenStatus: MetaTokenStatus;
  try {
    tokenStatus = await getFacebookTokenStatus(env);
  } catch (error) {
    tokenStatus = {
      ok: false,
      status: "invalid",
      valid: false,
      issues: [(error as Error).message || "Meta token check failed"],
      expires_at: null,
      expires_in_hours: null,
      should_refresh: null,
      token_snippet: null,
      account_id: null,
      account_name: null,
      refreshed_at: null,
    };
  }
  const payload = {
    ok: Boolean(status?.ok),
    cached: Boolean(status?.cached),
    refreshed: forceRefresh && !status?.cached,
    updated_at: status?.updated_at || null,
    status,
    token: tokenStatus as MetaTokenStatus,
    message: errorMessage || undefined,
  };

  if (forceRefresh && !payload.cached) {
    await appendLogEntry(env, {
      level: "info",
      message: "Meta status refreshed via /manage/meta",
      timestamp: new Date().toISOString(),
    });
  }

  return jsonResponse(payload);
};
