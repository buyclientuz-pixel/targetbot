import { appendLogEntry } from "../utils/r2";
import { notifyTelegramAdmins } from "../utils/telegram";
import { WorkerEnv, MetaTokenStatus } from "../types";

interface MetaAuthRecord {
  access_token: string;
  issued_at?: number;
  expires_at?: number;
  refreshed_at?: string;
  account_id?: string | null;
  account_name?: string | null;
  token_type?: string | null;
}

interface MetaNamespaceEnv {
  DB?: KVNamespace;
  SESSION_NAMESPACE?: KVNamespace;
  FALLBACK_KV?: KVNamespace;
  LOGS_NAMESPACE?: KVNamespace;
}

const META_AUTH_KEY = "meta:auth";
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const resolveMetaNamespace = (env: MetaNamespaceEnv): KVNamespace | null => {
  return env.DB || env.SESSION_NAMESPACE || env.FALLBACK_KV || env.LOGS_NAMESPACE || null;
};

const maskToken = (token: string): string => {
  if (token.length <= 8) {
    return token;
  }
  const start = token.slice(0, 5);
  const end = token.slice(-2);
  return start + "****" + end;
};

const readMetaAuth = async (env: MetaNamespaceEnv): Promise<MetaAuthRecord | null> => {
  const namespace = resolveMetaNamespace(env);
  if (!namespace) {
    return null;
  }

  try {
    const raw = await namespace.get(META_AUTH_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as MetaAuthRecord;
    if (!parsed || typeof parsed !== "object" || typeof parsed.access_token !== "string") {
      return null;
    }
    return parsed;
  } catch (_error) {
    return null;
  }
};

const writeMetaAuth = async (env: MetaNamespaceEnv, record: MetaAuthRecord): Promise<void> => {
  const namespace = resolveMetaNamespace(env);
  if (!namespace) {
    return;
  }

  try {
    await namespace.put(META_AUTH_KEY, JSON.stringify(record));
  } catch (_error) {
    // ignore write failures
  }
};

const deleteMetaAuth = async (env: MetaNamespaceEnv): Promise<void> => {
  const namespace = resolveMetaNamespace(env);
  if (!namespace) {
    return;
  }

  try {
    await namespace.delete(META_AUTH_KEY);
  } catch (_error) {
    // ignore delete failures
  }
};

const buildGraphUrl = (path: string, params: Record<string, string>): string => {
  const url = new URL("https://graph.facebook.com/" + path.replace(/^\/+/, ""));
  for (const key of Object.keys(params)) {
    url.searchParams.set(key, params[key]);
  }
  return url.toString();
};

const sendFacebookErrorLog = async (env: WorkerEnv, message: string): Promise<void> => {
  const now = new Date();
  const dateKey = "facebook_errors/" + now.toISOString().slice(0, 10);
  await appendLogEntry(env, { level: "error", message, timestamp: now.toISOString() }, dateKey);
};

export const getFacebookTokenStatus = async (env: WorkerEnv): Promise<MetaTokenStatus> => {
  const record = await readMetaAuth(env);
  if (!record) {
    return { ok: false, status: "missing", valid: false, issues: ["Meta access token is not configured."] };
  }

  const token = record.access_token;
  const appId = typeof env.FB_APP_ID === "string" ? env.FB_APP_ID : "";
  const appSecret = typeof env.FB_APP_SECRET === "string" ? env.FB_APP_SECRET : "";

  if (!appId || !appSecret) {
    return {
      ok: false,
      status: "invalid",
      valid: false,
      issues: ["Facebook app credentials are not configured."],
      token_snippet: maskToken(token),
      account_id: record.account_id || null,
      account_name: record.account_name || null,
      refreshed_at: record.refreshed_at || null,
      expires_at: record.expires_at ? new Date(record.expires_at).toISOString() : null,
    };
  }

  const debugUrl = buildGraphUrl("debug_token", {
    input_token: token,
    access_token: appId + "|" + appSecret,
  });

  let debugResponse: any = null;
  try {
    const response = await fetch(debugUrl);
    if (!response.ok) {
      const text = await response.text();
      throw new Error("Debug token request failed: " + text);
    }
    debugResponse = await response.json();
  } catch (error) {
    const message = (error as Error).message || "Unknown error";
    await sendFacebookErrorLog(env, "Token debug failed: " + message);
    return {
      ok: false,
      status: "invalid",
      valid: false,
      issues: [message],
      token_snippet: maskToken(token),
      account_id: record.account_id || null,
      account_name: record.account_name || null,
      refreshed_at: record.refreshed_at || null,
      expires_at: record.expires_at ? new Date(record.expires_at).toISOString() : null,
    };
  }

  const data = debugResponse && debugResponse.data ? debugResponse.data : null;
  if (!data) {
    return {
      ok: false,
      status: "invalid",
      valid: false,
      issues: ["Debug token response missing data."],
      token_snippet: maskToken(token),
      account_id: record.account_id || null,
      account_name: record.account_name || null,
      refreshed_at: record.refreshed_at || null,
      expires_at: record.expires_at ? new Date(record.expires_at).toISOString() : null,
    };
  }

  const expiresAtSeconds = typeof data.expires_at === "number" ? data.expires_at : null;
  const expiresAtIso = expiresAtSeconds ? new Date(expiresAtSeconds * 1000).toISOString() : null;
  const expiresInHours = expiresAtSeconds
    ? Math.floor((expiresAtSeconds * 1000 - Date.now()) / (60 * 60 * 1000))
    : null;
  const shouldRefresh = expiresAtSeconds
    ? expiresAtSeconds * 1000 - Date.now() <= TWENTY_FOUR_HOURS_MS
    : false;
  const expired = expiresAtSeconds ? Date.now() >= expiresAtSeconds * 1000 : false;

  const valid = Boolean(data.is_valid) && !expired;

  const issues: string[] = [];
  if (!valid) {
    issues.push("Meta access token is invalid or expired.");
  }

  if (expired) {
    issues.push("Meta access token expired at " + (expiresAtIso || "unknown"));
  }

  return {
    ok: valid,
    status: expired ? "expired" : valid ? "ok" : "invalid",
    valid,
    issues,
    expires_at: expiresAtIso,
    expires_in_hours: expiresInHours,
    should_refresh: shouldRefresh,
    token_snippet: maskToken(token),
    account_id: data.profile_id ? String(data.profile_id) : record.account_id || null,
    account_name: record.account_name || null,
    refreshed_at: record.refreshed_at || null,
  };
};

interface RefreshResult {
  ok: boolean;
  refreshed: boolean;
  message: string;
  expires_at?: string | null;
  expires_in_hours?: number | null;
  token_snippet?: string | null;
}

const performTokenRefresh = async (env: WorkerEnv, record: MetaAuthRecord): Promise<RefreshResult> => {
  const appId = typeof env.FB_APP_ID === "string" ? env.FB_APP_ID : "";
  const appSecret = typeof env.FB_APP_SECRET === "string" ? env.FB_APP_SECRET : "";
  if (!appId || !appSecret) {
    return {
      ok: false,
      refreshed: false,
      message: "Facebook app credentials are not configured.",
      token_snippet: maskToken(record.access_token),
    };
  }

  const refreshUrl = buildGraphUrl("oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: record.access_token,
  });

  try {
    const response = await fetch(refreshUrl);
    if (!response.ok) {
      const text = await response.text();
      throw new Error("Token refresh failed: " + text);
    }
    const payload = await response.json();
    const newToken = typeof payload.access_token === "string" ? payload.access_token : null;
    if (!newToken) {
      throw new Error("Token refresh response missing access_token");
    }
    const expiresInSeconds = typeof payload.expires_in === "number" ? payload.expires_in : null;
    const refreshedAt = new Date().toISOString();
    const newRecord: MetaAuthRecord = {
      access_token: newToken,
      issued_at: Date.now(),
      expires_at: expiresInSeconds ? Date.now() + expiresInSeconds * 1000 : undefined,
      refreshed_at: refreshedAt,
      account_id: record.account_id || null,
      account_name: record.account_name || null,
      token_type: typeof payload.token_type === "string" ? payload.token_type : record.token_type || null,
    };
    await writeMetaAuth(env, newRecord);
    const expiresIso = newRecord.expires_at ? new Date(newRecord.expires_at).toISOString() : null;
    return {
      ok: true,
      refreshed: true,
      message: "Facebook token refreshed successfully.",
      expires_at: expiresIso,
      expires_in_hours: newRecord.expires_at
        ? Math.floor((newRecord.expires_at - Date.now()) / (60 * 60 * 1000))
        : null,
      token_snippet: maskToken(newToken),
    };
  } catch (error) {
    const message = (error as Error).message || "Unknown error";
    await sendFacebookErrorLog(env, message);
    return { ok: false, refreshed: false, message, token_snippet: maskToken(record.access_token) };
  }
};

export const checkAndRefreshFacebookToken = async (
  env: WorkerEnv,
  options: { force?: boolean; notify?: boolean } = {},
): Promise<{ status: MetaTokenStatus; refresh?: RefreshResult | null }> => {
  const notify = options.notify !== false;
  const forceRefresh = options.force === true;

  const status = await getFacebookTokenStatus(env);

  if (status.status === "missing") {
    if (notify) {
      await notifyTelegramAdmins(env, "⚠️ Meta токен не настроен. Авторизуйтесь в Facebook кабинете.");
    }
    return { status, refresh: null };
  }

  if (status.status === "invalid" && status.issues.length > 0) {
    const message = "⚠️ Ошибка Meta токена: " + status.issues.join("; ");
    await notifyTelegramAdmins(env, message);
    return { status, refresh: null };
  }

  if (status.status === "expired") {
    await deleteMetaAuth(env);
    const message = "🚨 Meta токен истёк " + (status.expires_at || "ранее");
    await notifyTelegramAdmins(env, message);
    await sendFacebookErrorLog(env, message);
    return { status, refresh: null };
  }

  const shouldRefresh = forceRefresh || Boolean(status.should_refresh);
  if (!shouldRefresh) {
    return { status, refresh: null };
  }

  const record = await readMetaAuth(env);
  if (!record) {
    return { status, refresh: null };
  }

  const refreshResult = await performTokenRefresh(env, record);

  if (refreshResult.ok) {
    const message =
      "✅ Meta токен обновлён." + (refreshResult.expires_at ? " Новый срок: " + refreshResult.expires_at : "");
    if (notify) {
      await notifyTelegramAdmins(env, message);
    }
    await appendLogEntry(env, {
      level: "info",
      message,
      timestamp: new Date().toISOString(),
    });
    return { status: await getFacebookTokenStatus(env), refresh: refreshResult };
  }

  const errorMessage = "🚨 Ошибка обновления Meta токена: " + refreshResult.message;
  await notifyTelegramAdmins(env, errorMessage);
  await sendFacebookErrorLog(env, errorMessage);
  return { status, refresh: refreshResult };
};

export const forceRefreshFacebookToken = async (
  env: WorkerEnv,
): Promise<{ status: MetaTokenStatus; refresh?: RefreshResult | null }> => {
  return checkAndRefreshFacebookToken(env, { force: true, notify: true });
};

export const readStoredMetaAuth = async (env: WorkerEnv): Promise<MetaAuthRecord | null> => {
  return readMetaAuth(env);
};
