import { EnvBindings } from "./storage";
import { MetaAdAccount, MetaStatusResponse, MetaTokenRecord, MetaTokenStatus } from "../types";

const GRAPH_BASE = "https://graph.facebook.com";
const DEFAULT_GRAPH_VERSION = "v19.0";

const TOKEN_KEYS = ["META_ACCESS_TOKEN", "FB_ACCESS_TOKEN", "GRAPH_API_TOKEN", "META_TOKEN"] as const;
const TOKEN_EXPIRES_KEYS = [
  "META_ACCESS_TOKEN_EXPIRES",
  "META_TOKEN_EXPIRES_AT",
  "FB_ACCESS_TOKEN_EXPIRES",
  "META_TOKEN_EXPIRATION",
] as const;
const ACCOUNT_ID_KEYS = [
  "META_AD_ACCOUNTS",
  "META_AD_ACCOUNT_IDS",
  "META_ACCOUNT_IDS",
  "FB_AD_ACCOUNTS",
  "FB_AD_ACCOUNT_IDS",
  "AD_ACCOUNT_IDS",
] as const;
const BUSINESS_ID_KEYS = [
  "META_BUSINESS_IDS",
  "FB_BUSINESS_IDS",
  "META_BUSINESSES",
  "FB_BUSINESSES",
  "BUSINESS_IDS",
] as const;

const ACCOUNT_STATUS_MAP: Record<number, { label: string; severity: "success" | "warning" | "error" }> = {
  1: { label: "Активен", severity: "success" },
  2: { label: "Отключён", severity: "error" },
  3: { label: "Есть задолженность", severity: "warning" },
  4: { label: "Проверка риска", severity: "warning" },
  5: { label: "Ожидает оплату", severity: "warning" },
  6: { label: "Ожидает подтверждение", severity: "warning" },
  7: { label: "Льготный период", severity: "warning" },
  8: { label: "Ожидает закрытие", severity: "warning" },
  9: { label: "Закрыт", severity: "error" },
  100: { label: "Активный (агр.)", severity: "success" },
  101: { label: "Закрыт (агр.)", severity: "error" },
};

const toStringArray = (value: unknown): string[] => {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : String(item)))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return toStringArray(parsed);
      }
    } catch (error) {
      // fall through to delimiter-based parsing
    }
    return trimmed
      .split(/[,\n\r\t ]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [String(value).trim()].filter(Boolean);
};

const collectEnvList = (env: Record<string, unknown>, keys: readonly string[]): string[] => {
  const result: string[] = [];
  for (const key of keys) {
    const value = env[key];
    result.push(...toStringArray(value));
  }
  return Array.from(new Set(result.filter(Boolean)));
};

const describeAccountStatus = (
  status: unknown,
): { label?: string; code?: number; severity?: "success" | "warning" | "error" } => {
  if (status === null || status === undefined) {
    return {};
  }
  let code: number | undefined;
  if (typeof status === "number" && Number.isFinite(status)) {
    code = Math.trunc(status);
  } else if (typeof status === "string" && status.trim()) {
    const trimmed = status.trim();
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) {
      code = Math.trunc(numeric);
    } else {
      return { label: trimmed, severity: "warning" };
    }
  }

  if (code === undefined) {
    return {};
  }

  const mapping = ACCOUNT_STATUS_MAP[code];
  if (mapping) {
    return { label: mapping.label, code, severity: mapping.severity };
  }
  return { label: `Неизвестно (код ${code})`, code, severity: "warning" };
};

const toIsoDate = (value: unknown): string | undefined => {
  if (!value) {
    return undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) {
      return new Date(asNumber * (asNumber > 1_000_000_000 ? 1 : 1000)).toISOString();
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * (value > 1_000_000_000 ? 1 : 1000)).toISOString();
  }
  return undefined;
};

const resolveEnvToken = (env: Record<string, unknown>): MetaTokenRecord | null => {
  for (const key of TOKEN_KEYS) {
    const candidate = env[key];
    if (typeof candidate === "string" && candidate.trim()) {
      const expiresSource = TOKEN_EXPIRES_KEYS.map((expiresKey) => env[expiresKey]).find((value) => value !== undefined);
      return {
        accessToken: candidate.trim(),
        expiresAt: toIsoDate(expiresSource),
        status: "valid",
      };
    }
  }
  return null;
};

const effectiveToken = (
  env: EnvBindings & Record<string, unknown>,
  record: MetaTokenRecord | null,
): MetaTokenRecord | null => {
  if (record?.accessToken) {
    return record;
  }
  return resolveEnvToken(env);
};

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
  return statusFromRecord(env, effectiveToken(env, record));
};

export const fetchAdAccounts = async (
  env: EnvBindings & Record<string, unknown>,
  record: MetaTokenRecord | null,
): Promise<MetaAdAccount[]> => {
  const tokenRecord = effectiveToken(env, record);
  const status = ensureTokenFreshness(tokenRecord);
  if (status === "missing" || !tokenRecord?.accessToken) {
    throw new Error("Meta token is missing");
  }

  const accounts: MetaAdAccount[] = [];
  const seen = new Set<string>();
  const addAccount = (account: MetaAdAccount | null | undefined) => {
    if (!account || !account.id) return;
    if (seen.has(account.id)) return;
    seen.add(account.id);
    accounts.push(account);
  };

  const params = {
    access_token: tokenRecord.accessToken,
    fields: "id,name,currency,account_status,business",
  };

  const safeCall = async <T>(path: string, callParams: Record<string, string>) => {
    try {
      return await callGraph<T>(env, path, { ...callParams });
    } catch (error) {
      console.warn(`Graph API request failed for ${path}`, (error as Error).message);
      return null;
    }
  };

  const meResponse = await safeCall<AdAccountsResponse>("me/adaccounts", params);
  for (const item of meResponse?.data || []) {
    const id = item.id || (item as { account_id?: string }).account_id;
    if (!id || !item.name) continue;
    const statusInfo = describeAccountStatus(item.account_status);
    addAccount({
      id,
      name: item.name,
      currency: item.currency,
      status: statusInfo.label,
      statusCode: statusInfo.code,
      statusSeverity: statusInfo.severity,
      business: item.business ? { id: item.business.id, name: item.business.name } : null,
    });
  }

  const configuredAccountIds = collectEnvList(env, ACCOUNT_ID_KEYS);
  const businessIds = collectEnvList(env, BUSINESS_ID_KEYS);

  const fetchAccountById = async (accountId: string) => {
    const normalized = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    const account = await safeCall<{ id?: string; name?: string; currency?: string; account_status?: number }>(
      normalized,
      params,
    );
    if (account?.id && account.name) {
      const statusInfo = describeAccountStatus(account.account_status);
      addAccount({
        id: account.id,
        name: account.name,
        currency: account.currency,
        status: statusInfo.label,
        statusCode: statusInfo.code,
        statusSeverity: statusInfo.severity,
      });
    }
  };

  await Promise.all(configuredAccountIds.map(fetchAccountById));

  interface BusinessAccountsResponse {
    data?: Array<{
      id?: string;
      account_id?: string;
      name?: string;
      currency?: string;
      account_status?: number;
      business?: { id?: string; name?: string } | null;
    }>;
  }

  const fetchBusinessAccounts = async (businessId: string, edge: string) => {
    const response = await safeCall<BusinessAccountsResponse>(`${businessId}/${edge}`, params);
    for (const item of response?.data || []) {
      const id = item.id || item.account_id;
      if (!id || !item.name) continue;
      const statusInfo = describeAccountStatus(item.account_status);
      addAccount({
        id,
        name: item.name,
        currency: item.currency,
        status: statusInfo.label,
        statusCode: statusInfo.code,
        statusSeverity: statusInfo.severity,
        business: item.business ? { id: item.business.id, name: item.business.name } : { id: businessId, name: undefined },
      });
    }
  };

  await Promise.all(
    businessIds.flatMap((businessId) => [
      fetchBusinessAccounts(businessId, "owned_ad_accounts"),
      fetchBusinessAccounts(businessId, "client_ad_accounts"),
    ]),
  );

  accounts.sort((a, b) => a.name.localeCompare(b.name));
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
