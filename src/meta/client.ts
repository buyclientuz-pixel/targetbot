import type { Env } from "../core/types";
import { logError, logEvent } from "../core/logger";

const GRAPH_BASE = "https://graph.facebook.com/v19.0";

export async function graphRequest<T>(
  env: Env,
  path: string,
  params: Record<string, string>,
  token: string,
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, "")}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set("access_token", token);
  const response = await fetch(url.toString(), {
    method: "GET",
  });
  if (!response.ok) {
    const text = await response.text();
    await logError(env, new Error(`Graph API error ${response.status}`), text);
    throw new Error(`Graph API request failed: ${response.status}`);
  }
  await logEvent(env, "meta.graph.request", { path: url.pathname, params });
  return (await response.json()) as T;
}

export async function exchangeToken(env: Env, code: string, redirectUri: string, appId: string, secret: string) {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", secret);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);
  const response = await fetch(url.toString());
  if (!response.ok) {
    const text = await response.text();
    await logError(env, new Error(`Token exchange failed ${response.status}`), text);
    throw new Error(`Failed to exchange token: ${response.status}`);
  }
  return response.json<{ access_token: string; token_type: string; expires_in: number }>();
}

export async function refreshLongLivedToken(env: Env, token: string, appId: string, secret: string) {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", secret);
  url.searchParams.set("fb_exchange_token", token);
  const response = await fetch(url.toString());
  if (!response.ok) {
    const text = await response.text();
    await logError(env, new Error(`Token refresh failed ${response.status}`), text);
    throw new Error(`Failed to refresh token: ${response.status}`);
  }
  return response.json<{ access_token: string; token_type: string; expires_in: number }>();
}
