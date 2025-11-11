import { jsonResponse, unauthorized, htmlResponse } from "../utils/http";
import {
  checkAndRefreshFacebookToken,
  getFacebookTokenStatus,
  storeMetaAuthRecord,
} from "../fb/auth";
import { WorkerEnv } from "../types";
import { appendLogEntry } from "../utils/r2";
import { notifyTelegramAdmins } from "../utils/telegram";
import { formatDateTime } from "../utils/format";

const extractAdminKey = (request: Request): string | null => {
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      return token;
    }
  }
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  return key && key.trim() ? key.trim() : null;
};

const ensureAdminAuth = (request: Request, env: WorkerEnv): Response | null => {
  const configuredKey = typeof env.ADMIN_KEY === "string" ? env.ADMIN_KEY : "";
  if (!configuredKey) {
    return null;
  }
  const provided = extractAdminKey(request);
  if (provided === configuredKey) {
    return null;
  }
  return unauthorized("Invalid admin key");
};

export const handleFacebookStatusApi = async (
  request: Request,
  env: WorkerEnv,
): Promise<Response> => {
  const authError = ensureAdminAuth(request, env);
  if (authError) {
    return authError;
  }

  const status = await getFacebookTokenStatus(env);
  return jsonResponse(status);
};

export const handleFacebookRefreshApi = async (
  request: Request,
  env: WorkerEnv,
): Promise<Response> => {
  const authError = ensureAdminAuth(request, env);
  if (authError) {
    return authError;
  }

  const result = await checkAndRefreshFacebookToken(env, { force: true, notify: true });
  return jsonResponse(result);
};

const buildRedirectBase = (request: Request, env: WorkerEnv): string => {
  const configured = typeof env.WORKER_URL === "string" ? env.WORKER_URL.trim() : "";
  const base = configured || new URL(request.url).origin;
  return base.endsWith("/") ? base.slice(0, -1) : base;
};

const resolveGraphVersion = (env: WorkerEnv): string => {
  const version = typeof env.FB_GRAPH_VERSION === "string" ? env.FB_GRAPH_VERSION.trim() : "";
  return version || "v18.0";
};

const renderAuthPage = (title: string, message: string, options: {
  details?: string;
  status?: "success" | "warning" | "error";
  links?: Array<{ href: string; label: string }>;
  redirect?: string;
} = {}): string => {
  const tone = options.status || "success";
  const accent = tone === "success" ? "#00b87c" : tone === "warning" ? "#fbbf24" : "#f87171";
  const links = (options.links || [])
    .map((link) =>
      `<a class="action" href="${link.href}" rel="noopener noreferrer" target="_blank">${link.label}</a>`,
    )
    .join("");
  const redirectMeta = options.redirect ? `<meta http-equiv="refresh" content="2;url=${options.redirect}" />` : "";
  const redirectNotice = options.redirect
    ?
        `<p class="redirect">Через пару секунд откроется Telegram. Если этого не произошло, <a href="${options.redirect}" rel="noopener noreferrer" target="_blank">нажмите сюда</a>.</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${redirectMeta}
    <title>${title}</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        background: #0f172a;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
        color: #e2e8f0;
        padding: 32px;
      }
      .card {
        width: min(520px, 100%);
        border-radius: 20px;
        padding: 28px;
        background: rgba(15, 23, 42, 0.85);
        box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.65);
        backdrop-filter: blur(18px);
      }
      h1 {
        margin: 0 0 16px;
        font-size: 26px;
        color: ${accent};
      }
      p {
        margin: 0 0 12px;
        line-height: 1.6;
      }
      .details {
        margin-top: 8px;
        padding: 12px 14px;
        border-radius: 12px;
        background: rgba(148, 163, 184, 0.1);
        font-size: 15px;
      }
      .actions {
        margin-top: 18px;
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      .action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px 18px;
        border-radius: 999px;
        font-weight: 600;
        font-size: 15px;
        text-decoration: none;
        color: #0f172a;
        background: ${accent};
      }
      .redirect {
        margin-top: 16px;
        color: #94a3b8;
      }
      .redirect a {
        color: ${accent};
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>${title}</h1>
      <p>${message}</p>
      ${options.details ? `<p class="details">${options.details}</p>` : ""}
      ${redirectNotice}
      ${links ? `<div class="actions">${links}</div>` : ""}
    </main>
  </body>
</html>`;
};

const resolveAdminUrl = (env: WorkerEnv): string | null => {
  const base = typeof env.WORKER_URL === "string" ? env.WORKER_URL.trim() : "";
  if (!base) {
    return null;
  }
  const sanitized = base.replace(/\/$/, "");
  const key = typeof env.ADMIN_KEY === "string" && env.ADMIN_KEY.trim() ? env.ADMIN_KEY.trim() : "";
  const search = key ? `?key=${encodeURIComponent(key) : ""}`;
  return sanitized + `/admin${search}`;
};

const resolveBotUrl = (env: WorkerEnv): string | null => {
  const runtime = env as Record<string, unknown>;
  const directKeys = ["BOT_URL", "BOT_LINK", "TELEGRAM_BOT_URL"];
  for (const key of directKeys) {
    const value = typeof runtime[key] === "string" ? (runtime[key] as string).trim() : "";
    if (value) {
      return value;
    }
  }

  const usernameKeys = ["BOT_USERNAME", "TELEGRAM_BOT_USERNAME", "TG_BOT_USERNAME"];
  for (const key of usernameKeys) {
    const raw = typeof runtime[key] === "string" ? (runtime[key] as string).trim() : "";
    if (raw) {
      const handle = raw.startsWith("@") ? raw.slice(1) : raw;
      return `https://t.me/${handle}`;
    }
  }

  return null;
};

export const handleFacebookLogin = async (request: Request, env: WorkerEnv): Promise<Response> => {
  const appId = typeof env.FB_APP_ID === "string" ? env.FB_APP_ID.trim() : "";
  if (!appId) {
    const html = renderAuthPage(
      "Авторизация Facebook",
      "⚠️ Не указан идентификатор приложения Facebook (FB_APP_ID). Добавьте его в переменные окружения Cloudflare.",
      { status: "error" },
    );
    return htmlResponse(html, { status: 500 });
  }

  const graphVersion = resolveGraphVersion(env);
  const redirectBase = buildRedirectBase(request, env);
  const redirectUri = `${redirectBase}/auth/facebook/callback`;
  const scope = new URL(request.url).searchParams.get("scope") || "ads_management,business_management";
  const state = new URL(request.url).searchParams.get("state");

  const authUrl = new URL(`https://www.facebook.com/${graphVersion}/dialog/oauth`);
  authUrl.searchParams.set("client_id", appId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scope);
  if (state) {
    authUrl.searchParams.set("state", state);
  }

  return new Response(null, {
    status: 302,
    headers: { Location: authUrl.toString() },
  });
};

export const handleFacebookCallback = async (
  request: Request,
  env: WorkerEnv,
): Promise<Response> => {
  const url = new URL(request.url);
  const errorReason = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  if (errorReason) {
    const message =
      `⚠️ Авторизация Facebook отклонена: ${errorReason}${(errorDescription ? ` — ${errorDescription : ""}`)}`;
    await appendLogEntry(env, {
      level: "warn",
      message,
      timestamp: new Date().toISOString(),
    });
    const html = renderAuthPage("Авторизация отменена", message, { status: "warning" });
    return htmlResponse(html, { status: 400 });
  }

  const code = url.searchParams.get("code");
  if (!code) {
    const html = renderAuthPage(
      "Ошибка авторизации",
      "⚠️ Не удалось получить код авторизации Facebook. Попробуйте начать процесс заново.",
      { status: "error" },
    );
    return htmlResponse(html, { status: 400 });
  }

  const appId = typeof env.FB_APP_ID === "string" ? env.FB_APP_ID.trim() : "";
  const appSecret = typeof env.FB_APP_SECRET === "string" ? env.FB_APP_SECRET.trim() : "";
  if (!appId || !appSecret) {
    const html = renderAuthPage(
      "Ошибка конфигурации",
      "⚠️ Отсутствуют переменные FB_APP_ID и/или FB_APP_SECRET. Добавьте их в Cloudflare Workers → Variables.",
      { status: "error" },
    );
    return htmlResponse(html, { status: 500 });
  }

  const redirectBase = buildRedirectBase(request, env);
  const redirectUri = `${redirectBase}/auth/facebook/callback`;
  const graphVersion = resolveGraphVersion(env);
  const tokenUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  tokenUrl.searchParams.set("code", code);

  let tokenPayload: any = null;
  try {
    const response = await fetch(tokenUrl.toString(), { method: "GET" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Token exchange failed: ${text}`);
    }
    tokenPayload = await response.json();
  } catch (error) {
    const message = (error as Error).message || "Неизвестная ошибка обмена токена.";
    await appendLogEntry(env, {
      level: "error",
      message: `Facebook OAuth exchange error: ${message}`,
      timestamp: new Date().toISOString(),
    });
    await notifyTelegramAdmins(env, `🚨 Ошибка обмена Meta токена: ${message}`);
    const html = renderAuthPage(
      "Ошибка авторизации",
      `🚨 Не удалось получить токен доступа. Сообщение: ${message}`,
      { status: "error" },
    );
    return htmlResponse(html, { status: 500 });
  }

  const accessToken = typeof tokenPayload?.access_token === "string" ? tokenPayload.access_token : null;
  if (!accessToken) {
    const html = renderAuthPage(
      "Ошибка авторизации",
      "🚨 Facebook не вернул access_token. Попробуйте авторизоваться ещё раз.",
      { status: "error" },
    );
    return htmlResponse(html, { status: 500 });
  }

  const expiresIn = typeof tokenPayload?.expires_in === "number" ? tokenPayload.expires_in : null;
  const tokenType = typeof tokenPayload?.token_type === "string" ? tokenPayload.token_type : null;

  const issuedAt = Date.now();
  const refreshedAtIso = new Date(issuedAt).toISOString();
  let accountId: string | null = null;
  let accountName: string | null = null;

  try {
    const profileUrl = new URL(`https://graph.facebook.com/${graphVersion}/me`);
    profileUrl.searchParams.set("fields", "id,name");
    profileUrl.searchParams.set("access_token", accessToken);
    const response = await fetch(profileUrl.toString());
    if (response.ok) {
      const data = await response.json();
      if (data && typeof data === "object") {
        if (typeof data.id === "string") {
          accountId = data.id;
        }
        if (typeof data.name === "string") {
          accountName = data.name;
        }
      }
    }
  } catch (_error) {
    // silently ignore profile errors
  }

  await storeMetaAuthRecord(env, {
    access_token: accessToken,
    issued_at: issuedAt,
    refreshed_at: refreshedAtIso,
    expires_at: expiresIn ? issuedAt + expiresIn * 1000 : undefined,
    account_id: accountId,
    account_name: accountName,
    token_type: tokenType,
  });

  await appendLogEntry(env, {
    level: "info",
    message:
      `Meta OAuth callback completed. Account: ${(accountName || accountId || "unknown")}, expires in ${(expiresIn ? `${Math.round(expiresIn / 60)} мин.` : "unknown")}`,
    timestamp: new Date().toISOString(),
  });

  const refreshResult = await checkAndRefreshFacebookToken(env, { notify: true });
  const status = refreshResult.status;
  const adminUrl = resolveAdminUrl(env);
  const tz =
    typeof env.DEFAULT_TZ === "string" && env.DEFAULT_TZ.trim() ? env.DEFAULT_TZ.trim() : "Asia/Tashkent";
  const formatDate = (iso: string | null | undefined): string | null => {
    if (!iso) {
      return null;
    }
    try {
      return new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: tz,
      }).format(new Date(iso));
    } catch (_error) {
      return iso;
    }
  };

  let heading = "Авторизация Facebook завершена";
  let message = "✅ Токен успешно сохранён. Вернитесь в Telegram, чтобы продолжить работу.";
  let details = "";
  let statusTone: "success" | "warning" | "error" = "success";

  if (status.status === "expired") {
    heading = "Токен истёк";
    message = "⚠️ Полученный токен уже отмечен как истекший. Попробуйте пройти авторизацию заново.";
    statusTone = "warning";
  } else if (!status.ok) {
    heading = "Ошибка проверки токена";
    message = "🚨 Токен сохранён, но проверка Facebook вернула ошибку.";
    const issues = status.issues && status.issues.length ? status.issues.join("\n") : "Уточните детали в админ-панели.";
    details = issues;
    statusTone = "error";
  } else {
    const expiresAt = status.expires_at || refreshResult.refresh?.expires_at || null;
    const formattedExpiry = formatDate(expiresAt);
    const parts: string[] = [];
    if (accountName) {
      parts.push(`👤 Аккаунт: ${accountName}${(accountId ? ` (${accountId})` : "")}`);
    }
    if (formattedExpiry) {
      parts.push(`⏱ Действителен до: ${formattedExpiry}`);
    }
    if (status.should_refresh) {
      parts.push("⚠️ Рекомендуется продлить токен в ближайшее время.");
      statusTone = "warning";
    }
    details = parts.join("<br />");
  }

  const botUrl = resolveBotUrl(env);
  const linkTargets: Array<{ href: string; label: string }> = [];
  if (botUrl) {
    linkTargets.push({ href: botUrl, label: "Открыть бота" });
  }
  if (adminUrl) {
    linkTargets.push({ href: adminUrl, label: "Открыть админ-панель" });
  }

  if (status.status === "ok") {
    const expiresAt = status.expires_at || refreshResult.refresh?.expires_at || null;
    const expiresText = expiresAt ? formatDateTime(expiresAt, tz) : null;
    const lines = ["✅ Facebook подключён." ];
    if (accountName || accountId) {
      lines.push(`Аккаунт: ${(accountName || accountId)}`);
    }
    if (expiresText) {
      lines.push(`Действителен до: ${expiresText}`);
    }
    if (status.should_refresh) {
      lines.push("⚠️ Обновите токен в ближайшие 24 часа.");
    }
    lines.push("Откройте /admin для управления проектами.");
    await notifyTelegramAdmins(env, lines.join("\n"));
  }

  const html = renderAuthPage(heading, message, {
    details,
    status: statusTone,
    links: linkTargets.length ? linkTargets : undefined,
    redirect: botUrl || undefined,
  });

  return htmlResponse(html);
};
