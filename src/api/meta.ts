import { jsonResponse } from "../utils/http";
import { exchangeToken, fetchAdAccounts, refreshToken, resolveMetaStatus } from "../utils/meta";
import { EnvBindings, loadMetaToken, saveMetaToken } from "../utils/storage";
import { ApiError, ApiSuccess, MetaAdAccount, MetaStatusResponse } from "../types";

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

export const handleMetaStatus = async (
  request: Request,
  env: unknown,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const token = await loadMetaToken(bindings);
    const status = await resolveMetaStatus(bindings, token);
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
    const accounts = await fetchAdAccounts(bindings, token);
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

export const handleMetaOAuthStart = async (
  request: Request,
  env: unknown,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const appId = bindings.FB_APP_ID as string | undefined;
    if (!appId) {
      throw new Error("FB_APP_ID is not configured");
    }
    const redirectUri = buildRedirectUri(request);
    const version = (bindings.META_GRAPH_VERSION || bindings.FB_GRAPH_VERSION || "v19.0") as string;
    const oauthUrl = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
    oauthUrl.searchParams.set("client_id", appId);
    oauthUrl.searchParams.set("redirect_uri", redirectUri);
    oauthUrl.searchParams.set("scope", "ads_read,leads_retrieval");

    return Response.redirect(oauthUrl.toString(), 302);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 400 });
  }
};

export const handleMetaOAuthCallback = async (
  request: Request,
  env: unknown,
): Promise<Response> => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return jsonResponse({ ok: false, error: "Missing code" }, { status: 400 });
  }

  try {
    const bindings = ensureEnv(env);
    const redirectUri = buildRedirectUri(request);
    const token = await exchangeToken(bindings, code, redirectUri);
    await saveMetaToken(bindings, token);
    const status = await resolveMetaStatus(bindings, token);
    const payload: ApiSuccess<MetaStatusResponse> = { ok: true, data: status };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 500 });
  }
};

export const handleMetaRefresh = async (
  request: Request,
  env: unknown,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const current = await loadMetaToken(bindings);
    if (!current) {
      throw new Error("Meta token is missing");
    }
    const refreshed = await refreshToken(bindings, current);
    await saveMetaToken(bindings, refreshed);
    const status = await resolveMetaStatus(bindings, refreshed);
    const payload: ApiSuccess<MetaStatusResponse> = { ok: true, data: status };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 400 });
  }
};
