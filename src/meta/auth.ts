import type { RouteHandler } from "../core/types";
import { fail, ok } from "../core/utils";
import { exchangeToken, refreshLongLivedToken } from "./client";
import { saveMetaToken, getMetaToken } from "../core/db";
import { uuid } from "../core/utils";

const OAUTH_DIALOG = "https://www.facebook.com/v19.0/dialog/oauth";

export const facebookAuthHandler: RouteHandler = async ({ env }) => {
  if (!env.FACEBOOK_APP_ID || !env.FACEBOOK_REDIRECT_URL) {
    return fail("Facebook application is not configured", 400);
  }
  const state = uuid();
  await env.KV_META.put(`oauth:state:${state}`, JSON.stringify({ createdAt: Date.now() }), { expirationTtl: 600 });
  const url = new URL(OAUTH_DIALOG);
  url.searchParams.set("client_id", env.FACEBOOK_APP_ID);
  url.searchParams.set("redirect_uri", env.FACEBOOK_REDIRECT_URL);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "ads_read ads_management");
  return Response.redirect(url.toString(), 302);
};

export const facebookCallbackHandler: RouteHandler = async ({ env, request }) => {
  if (!env.FACEBOOK_APP_ID || !env.FACEBOOK_APP_SECRET || !env.FACEBOOK_REDIRECT_URL) {
    return fail("Facebook application is not configured", 400);
  }
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return fail("Missing code or state", 400);
  }
  const stateKey = `oauth:state:${state}`;
  const stateRecord = await env.KV_META.get(stateKey);
  if (!stateRecord) {
    return fail("Invalid or expired state", 400);
  }
  await env.KV_META.delete(stateKey);
  const tokenResponse = await exchangeToken(env, code, env.FACEBOOK_REDIRECT_URL, env.FACEBOOK_APP_ID, env.FACEBOOK_APP_SECRET);
  const longLived = await refreshLongLivedToken(env, tokenResponse.access_token, env.FACEBOOK_APP_ID, env.FACEBOOK_APP_SECRET);
  const token = await saveMetaToken(env, {
    accessToken: longLived.access_token,
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + longLived.expires_in * 1000).toISOString(),
  });
  const redirectUrl = new URL(env.WORKER_PUBLIC_URL ?? "https://example.com/admin");
  redirectUrl.pathname = "/admin";
  redirectUrl.searchParams.set("key", env.ADMIN_KEY ?? "");
  redirectUrl.searchParams.set("meta", "connected");
  return Response.redirect(redirectUrl.toString(), 302);
};

export const metaRefreshHandler: RouteHandler = async ({ env }) => {
  if (!env.FACEBOOK_APP_ID || !env.FACEBOOK_APP_SECRET) {
    return fail("Facebook application is not configured", 400);
  }
  const existing = await getMetaToken(env);
  if (!existing) {
    return fail("Meta token not found", 404);
  }
  const refreshed = await refreshLongLivedToken(env, existing.accessToken, env.FACEBOOK_APP_ID, env.FACEBOOK_APP_SECRET);
  const token = await saveMetaToken(env, {
    ...existing,
    accessToken: refreshed.access_token,
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
  });
  return ok({ token });
};
