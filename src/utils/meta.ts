import { EnvBindings } from "./storage";
import { MetaAdAccount, MetaStatusResponse, MetaTokenRecord, MetaTokenStatus } from "../types";

const GRAPH_BASE = "https://graph.facebook.com";
const DEFAULT_GRAPH_VERSION = "v19.0";

const getGraphVersion = (env: Record<string, unknown>): string => {
  const version = (env.META_GRAPH_VERSION || env.FB_GRAPH_VERSION) as string | undefined;
  return version || DEFAULT_GRAPH_VERSION;
};

const buildGraphUrl = (env: Record<string, unknown>, path: string, params: Record<string, string> = {}) => {
  const version = getGraphVersion(env);
  const url = new URL(`${GRAPH_BASE}/${version}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
};

export const callGraph = async <T>(
  env: EnvBindings & Record<string, unknown>,
  path: string,
  params: Record<string, string> = {},
  init: RequestInit = {},
): Promise<T> => {
  const url = buildGraphUrl(env, path, params);
  const response = await fetch(url.toString(), init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Graph API error ${response.status}: ${text}`);
  }
  return (await response.json()) as T;
};

export const ensureTokenFreshness = (record: MetaTokenRecord | null): MetaTokenStatus => {
  if (!record || !record.accessToken) {
    return "missing";
  }
  if (record.expiresAt) {
    const expires = new Date(record.expiresAt).getTime();
    if (!Number.isFinite(expires) || expires <= Date.now()) {
      return "expired";
    }
  }
  return "valid";
};

interface MeResponse {
  id?: string;
  name?: string;
}

interface AdAccountsResponse {
  data?: Array<{
    id?: string;
    name?: string;
    currency?: string;
    account_status?: number;
    business?: { id?: string; name?: string } | null;
  }>;
}

const statusFromRecord = async (
  env: EnvBindings & Record<string, unknown>,
  record: MetaTokenRecord | null,
): Promise<MetaStatusResponse> => {
  const status = ensureTokenFreshness(record);
  if (!record || !record.accessToken) {
    return { ok: false, status, issues: ["Meta token is missing"] };
  }

  try {
    const profile = await callGraph<MeResponse>(env, "me", {
      access_token: record.accessToken,
      fields: "id,name",
    });

    return {
      ok: true,
      status,
      accountId: profile.id,
      accountName: profile.name,
      expiresAt: record.expiresAt,
      refreshedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      status: "expired",
      issues: [(error as Error).message],
    };
  }
};

export const resolveMetaStatus = async (
  env: EnvBindings & Record<string, unknown>,
  record: MetaTokenRecord | null,
): Promise<MetaStatusResponse> => {
  return statusFromRecord(env, record);
};

export const fetchAdAccounts = async (
  env: EnvBindings & Record<string, unknown>,
  record: MetaTokenRecord | null,
): Promise<MetaAdAccount[]> => {
  const status = ensureTokenFreshness(record);
  if (status === "missing") {
    throw new Error("Meta token is missing");
  }
  if (!record) {
    throw new Error("Meta token is unavailable");
  }
  const response = await callGraph<AdAccountsResponse>(env, "me/adaccounts", {
    access_token: record.accessToken,
    fields: "id,name,currency,account_status,business",
  });
  const accounts: MetaAdAccount[] = [];
  for (const item of response.data || []) {
    if (!item.id || !item.name) continue;
    accounts.push({
      id: item.id,
      name: item.name,
      currency: item.currency,
      status: typeof item.account_status === "number" ? String(item.account_status) : undefined,
      business: item.business ? { id: item.business.id, name: item.business.name } : null,
    });
  }
  return accounts;
};

export const exchangeToken = async (
  env: EnvBindings & Record<string, unknown>,
  code: string,
  redirectUri: string,
): Promise<MetaTokenRecord> => {
  const appId = env.FB_APP_ID as string | undefined;
  const secret = env.FB_APP_SECRET as string | undefined;
  if (!appId || !secret) {
    throw new Error("FB_APP_ID and FB_APP_SECRET must be configured");
  }
  const version = getGraphVersion(env);
  const url = new URL(`${GRAPH_BASE}/${version}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", secret);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);

  const response = await fetch(url.toString(), { method: "POST" });
  if (!response.ok) {
    throw new Error(`Failed to exchange code: ${await response.text()}`);
  }
  const body = (await response.json()) as {
    access_token: string;
    token_type?: string;
    expires_in?: number;
  };

  const expiresAt = body.expires_in
    ? new Date(Date.now() + body.expires_in * 1000).toISOString()
    : undefined;

  return {
    accessToken: body.access_token,
    status: "valid",
    expiresAt,
  };
};

export const refreshToken = async (
  env: EnvBindings & Record<string, unknown>,
  record: MetaTokenRecord,
): Promise<MetaTokenRecord> => {
  const appId = env.FB_APP_ID as string | undefined;
  const secret = env.FB_APP_SECRET as string | undefined;
  if (!appId || !secret) {
    throw new Error("FB_APP_ID and FB_APP_SECRET must be configured");
  }
  const version = getGraphVersion(env);
  const url = new URL(`${GRAPH_BASE}/${version}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", secret);
  url.searchParams.set("fb_exchange_token", record.accessToken);

  const response = await fetch(url.toString(), { method: "GET" });
  if (!response.ok) {
    throw new Error(`Failed to refresh token: ${await response.text()}`);
  }
  const body = (await response.json()) as {
    access_token: string;
    expires_in?: number;
  };
  const expiresAt = body.expires_in
    ? new Date(Date.now() + body.expires_in * 1000).toISOString()
    : undefined;
  return {
    accessToken: body.access_token,
    refreshToken: record.refreshToken,
    status: "valid",
    expiresAt,
  };
};
