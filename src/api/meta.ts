import { htmlResponse, jsonResponse } from "../utils/http";
import { escapeAttribute, escapeHtml } from "../utils/html";
import {
  exchangeToken,
  fetchAdAccounts,
  fetchCampaigns,
  refreshToken,
  resolveMetaAppId,
  resolveMetaStatus,
  withMetaSettings,
} from "../utils/meta";
import { EnvBindings, loadMetaToken, saveMetaToken } from "../utils/storage";
import { ApiError, ApiSuccess, MetaAdAccount, MetaCampaign, MetaStatusResponse } from "../types";

const ensureEnv = (env: unknown): EnvBindings & Record<string, unknown> => {
  if (!env || typeof env !== "object" || !("DB" in env) || !("R2" in env)) {
    throw new Error("Env bindings are not configured");
  }
  return env as EnvBindings & Record<string, unknown>;
};

const buildRedirectUri = (request: Request): string => {
  const url = new URL(request.url);
  url.pathname = "/api/meta/oauth/callback";
  url.search = "";
  return url.toString();
};

const prefersJson = (request: Request, url: URL): boolean => {
  const accept = request.headers.get("accept");
  if (accept && accept.toLowerCase().includes("application/json")) {
    return true;
  }
  const format = url.searchParams.get("format") || url.searchParams.get("response");
  if (format && format.toLowerCase() === "json") {
    return true;
  }
  return false;
};

export const handleMetaStatus = async (
  request: Request,
  env: unknown,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const token = await loadMetaToken(bindings);
    const metaEnv = await withMetaSettings(bindings);
    const status = await resolveMetaStatus(metaEnv, token);
    const payload: ApiSuccess<MetaStatusResponse> = { ok: true, data: status };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 500 });
  }
};

export const handleMetaAdAccounts = async (
  request: Request,
  env: unknown,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const token = await loadMetaToken(bindings);
    const metaEnv = await withMetaSettings(bindings);
    const url = new URL(request.url);
    const includeSpend = url.searchParams.get("includeSpend") === "true";
    const includeCampaigns = url.searchParams.get("includeCampaigns") === "true";
    const campaignLimitParam = url.searchParams.get("campaignLimit");
    const campaignLimit = campaignLimitParam ? Number(campaignLimitParam) : undefined;
    const datePreset = url.searchParams.get("datePreset") || undefined;
    const since = url.searchParams.get("since") || undefined;
    const until = url.searchParams.get("until") || undefined;
    const accounts = await fetchAdAccounts(metaEnv, token, {
      includeSpend,
      includeCampaigns,
      campaignsLimit: Number.isFinite(campaignLimit ?? NaN) ? campaignLimit : undefined,
      datePreset,
      since,
      until,
    });
    const payload: ApiSuccess<MetaAdAccount[]> = { ok: true, data: accounts };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = {
      ok: false,
      error: (error as Error).message,
    };
    return jsonResponse(payload, { status: 400 });
  }
};

export const handleMetaCampaigns = async (
  request: Request,
  env: unknown,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const token = await loadMetaToken(bindings);
    const metaEnv = await withMetaSettings(bindings);
    const url = new URL(request.url);
    const accountId = url.searchParams.get("accountId");
    if (!accountId) {
      throw new Error("accountId is required");
    }
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    const datePreset = url.searchParams.get("datePreset") || undefined;
    const since = url.searchParams.get("since") || undefined;
    const until = url.searchParams.get("until") || undefined;
    const campaigns = await fetchCampaigns(metaEnv, token, accountId, {
      limit: Number.isFinite(limit ?? NaN) ? limit : undefined,
      datePreset,
      since,
      until,
    });
    const payload: ApiSuccess<MetaCampaign[]> = { ok: true, data: campaigns };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 400 });
  }
};

const renderMetaRedirectPage = (target: string): Response => {
  const escapedLink = escapeAttribute(target);
  const scriptTarget = JSON.stringify(target);
  const html = `<!doctype html>
    <html lang="ru">
      <head>
        <meta charset="utf-8" />
        <title>Переадресация на Facebook</title>
        <meta http-equiv="refresh" content="0;url=${escapedLink}" />
        <style>
          body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; padding: 48px; text-align: center; color: #102a43; }
          a { color: #1f75fe; text-decoration: none; font-weight: 600; }
          .card { max-width: 520px; margin: 0 auto; padding: 32px; border-radius: 16px; box-shadow: 0 8px 30px #0f1f3d12; }
        </style>
      </head>
      <body>
        <section class="card">
          <h1>Перенаправляем в Facebook</h1>
          <p>Если страница не открылась автоматически, нажмите <a href="${escapedLink}">перейти</a>.</p>
        </section>
        <script>window.location.replace(${scriptTarget});</script>
      </body>
    </html>`;
  return htmlResponse(html, {
    status: 302,
    headers: { Location: target },
  });
};

const renderMetaErrorPage = (message: string): Response => {
  const safeMessage = escapeHtml(message || "Неизвестная ошибка");
  const html = `<!doctype html>
    <html lang="ru">
      <head>
        <meta charset="utf-8" />
        <title>Ошибка авторизации Facebook</title>
        <style>
          body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; padding: 48px; background: #fff5f5; color: #610316; }
          .card { max-width: 520px; margin: 0 auto; padding: 32px; border-radius: 16px; background: #fff; box-shadow: 0 8px 30px #61031610; }
        </style>
      </head>
      <body>
        <section class="card">
          <h1>Не удалось открыть Facebook OAuth</h1>
          <p>${safeMessage}</p>
          <p>Проверьте настройки приложения Meta и попробуйте ещё раз.</p>
          <p><a href="/admin">Вернуться в панель</a></p>
        </section>
      </body>
    </html>`;
  return htmlResponse(html, { status: 400 });
};

export const handleMetaOAuthStart = async (
  request: Request,
  env: unknown,
): Promise<Response> => {
  const url = new URL(request.url);
  const wantsJson = prefersJson(request, url);
  try {
    const bindings = ensureEnv(env);
    const metaEnv = await withMetaSettings(bindings);
    const appId = resolveMetaAppId(metaEnv);
    if (!appId) {
      throw new Error(
        "Meta app ID is not configured (expected one of FB_APP_ID, META_APP_ID, FACEBOOK_APP_ID, FB_CLIENT_ID, META_CLIENT_ID)",
      );
    }
    const redirectUri = buildRedirectUri(request);
    const version = (metaEnv.META_GRAPH_VERSION || metaEnv.FB_GRAPH_VERSION || "v19.0") as string;
    const oauthUrl = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
    oauthUrl.searchParams.set("client_id", appId);
    oauthUrl.searchParams.set("redirect_uri", redirectUri);
    oauthUrl.searchParams.set("scope", "ads_read,leads_retrieval");

    if (wantsJson) {
      return jsonResponse({ ok: true, data: { url: oauthUrl.toString() } });
    }
    return renderMetaRedirectPage(oauthUrl.toString());
  } catch (error) {
    const message = (error as Error).message;
    if (wantsJson) {
      const payload: ApiError = { ok: false, error: message };
      return jsonResponse(payload, { status: 400 });
    }
    return renderMetaErrorPage(message);
  }
};

export const handleMetaOAuthCallback = async (
  request: Request,
  env: unknown,
): Promise<Response> => {
  const url = new URL(request.url);
  const wantsJson = prefersJson(request, url);
  const code = url.searchParams.get("code");
  if (!code) {
    if (wantsJson) {
      return jsonResponse({ ok: false, error: "Missing code" }, { status: 400 });
    }
    const redirect = new URL("/admin", url);
    redirect.searchParams.set("meta", "error");
    redirect.searchParams.set("metaMessage", "Meta не вернула код авторизации");
    return Response.redirect(redirect.toString(), 302);
  }

  try {
    const bindings = ensureEnv(env);
    const metaEnv = await withMetaSettings(bindings);
    const redirectUri = buildRedirectUri(request);
    const token = await exchangeToken(metaEnv, code, redirectUri);
    await saveMetaToken(bindings, token);
    const [status, accounts] = await Promise.all([
      resolveMetaStatus(metaEnv, token),
      fetchAdAccounts(metaEnv, token).catch(() => [] as MetaAdAccount[]),
    ]);
    if (wantsJson) {
      const payload: ApiSuccess<MetaStatusResponse> = {
        ok: true,
        data: { ...status, accounts },
      };
      return jsonResponse(payload);
    }
    const redirect = new URL("/admin", url);
    redirect.searchParams.set("meta", "success");
    if (status.expiresAt) {
      redirect.searchParams.set("metaExpires", status.expiresAt);
    }
    const accountNames = accounts.map((account) => account.name).filter(Boolean);
    redirect.searchParams.set("metaAccountTotal", String(accountNames.length));
    accountNames.slice(0, 5).forEach((name) => redirect.searchParams.append("metaAccount", name));
    return Response.redirect(redirect.toString(), 302);
  } catch (error) {
    const message = (error as Error).message;
    if (wantsJson) {
      const payload: ApiError = { ok: false, error: message };
      return jsonResponse(payload, { status: 500 });
    }
    const redirect = new URL("/admin", url);
    redirect.searchParams.set("meta", "error");
    if (message) {
      redirect.searchParams.set("metaMessage", message.slice(0, 200));
    }
    return Response.redirect(redirect.toString(), 302);
  }
};

export const handleMetaRefresh = async (
  request: Request,
  env: unknown,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const metaEnv = await withMetaSettings(bindings);
    const current = await loadMetaToken(bindings);
    if (!current) {
      throw new Error("Meta token is missing");
    }
    const refreshed = await refreshToken(metaEnv, current);
    await saveMetaToken(bindings, refreshed);
    const status = await resolveMetaStatus(metaEnv, refreshed);
    const payload: ApiSuccess<MetaStatusResponse> = { ok: true, data: status };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 400 });
  }
};
