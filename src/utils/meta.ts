import { EnvBindings, listSettings } from "./storage";
import {
  MetaAdAccount,
  MetaCampaign,
  MetaOAuthStatePayload,
  MetaStatusResponse,
  MetaTokenRecord,
  MetaTokenStatus,
  MetaLeadDetails,
  JsonObject,
} from "../types";

const GRAPH_BASE = "https://graph.facebook.com";
const DEFAULT_GRAPH_VERSION = "v19.0";

const graphVersion = (env: Record<string, unknown>): string => {
  const raw = (env as { META_GRAPH_VERSION?: unknown }).META_GRAPH_VERSION;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  return DEFAULT_GRAPH_VERSION;
};

const TOKEN_KEYS = [
  "META_ACCESS_TOKEN",
  "FB_ACCESS_TOKEN",
  "FB_LONG_TOKEN",
  "META_LONG_TOKEN",
  "FACEBOOK_LONG_TOKEN",
  "GRAPH_API_TOKEN",
  "META_TOKEN",
] as const;
const TOKEN_EXPIRES_KEYS = [
  "META_ACCESS_TOKEN_EXPIRES",
  "META_TOKEN_EXPIRES_AT",
  "FB_ACCESS_TOKEN_EXPIRES",
  "FB_LONG_TOKEN_EXPIRES",
  "META_LONG_TOKEN_EXPIRES",
  "FACEBOOK_LONG_TOKEN_EXPIRES",
  "META_TOKEN_EXPIRATION",
] as const;
const APP_ID_KEYS = [
  "FB_APP_ID",
  "META_APP_ID",
  "FACEBOOK_APP_ID",
  "FB_CLIENT_ID",
  "META_CLIENT_ID",
] as const;
const APP_SECRET_KEYS = [
  "FB_APP_SECRET",
  "META_APP_SECRET",
  "FACEBOOK_APP_SECRET",
  "FB_CLIENT_SECRET",
  "META_CLIENT_SECRET",
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
const WEBHOOK_VERIFY_TOKEN_KEYS = [
  "META_WEBHOOK_VERIFY_TOKEN",
  "META_VERIFY_TOKEN",
  "FACEBOOK_WEBHOOK_VERIFY_TOKEN",
  "FB_WEBHOOK_VERIFY_TOKEN",
  "FB_VERIFY_TOKEN",
] as const;

const encodeBase64 = (value: string): string => {
  if (typeof btoa === "function") {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(value);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }
  const bufferCtor = (globalThis as { Buffer?: { from: (input: string, encoding: string) => { toString: (encoding: string) => string } } }).Buffer;
  if (bufferCtor) {
    return bufferCtor.from(value, "utf-8").toString("base64");
  }
  throw new Error("No base64 encoder available");
};

const decodeBase64 = (value: string): string => {
  if (typeof atob === "function") {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoder = new TextDecoder();
    return decoder.decode(bytes);
  }
  const bufferCtor = (globalThis as { Buffer?: { from: (input: string, encoding: string) => { toString: (encoding: string) => string } } }).Buffer;
  if (bufferCtor) {
    return bufferCtor.from(value, "base64").toString("utf-8");
  }
  throw new Error("No base64 decoder available");
};

const toBase64Url = (value: string): string => value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");

const fromBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  if (padding === 0) {
    return normalized;
  }
  return normalized.padEnd(normalized.length + (4 - padding), "=");
};

export const encodeMetaOAuthState = (payload: MetaOAuthStatePayload | null | undefined): string => {
  if (!payload) {
    return "";
  }
  try {
    const json = JSON.stringify(payload);
    return toBase64Url(encodeBase64(json));
  } catch (error) {
    console.warn("Failed to encode Meta OAuth state", error);
    return "";
  }
};

export const decodeMetaOAuthState = (value: string | null | undefined): MetaOAuthStatePayload | null => {
  if (!value) {
    return null;
  }
  try {
    const json = decodeBase64(fromBase64Url(value));
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const state = parsed as MetaOAuthStatePayload;
    if (state.botUsername && state.botUsername.startsWith("@")) {
      state.botUsername = state.botUsername.slice(1);
    }
    return state;
  } catch (error) {
    console.warn("Failed to decode Meta OAuth state", error);
    return null;
  }
};

const META_APP_SETTING_KEYS = [
  "meta.appId",
  "meta.app.id",
  "meta.oauth.appId",
  "system.meta.appId",
] as const;

const META_SECRET_SETTING_KEYS = [
  "meta.appSecret",
  "meta.app.secret",
  "meta.oauth.appSecret",
  "meta.oauth.secret",
  "system.meta.appSecret",
] as const;

const META_TOKEN_SETTING_KEYS = [
  "meta.token",
  "meta.accessToken",
  "meta.longToken",
  "meta.oauth.token",
  "meta.oauth.accessToken",
  "meta.oauth.longToken",
  "system.meta.token",
  "system.meta.longToken",
] as const;

const META_TOKEN_EXPIRES_SETTING_KEYS = [
  "meta.token.expiresAt",
  "meta.token.expires",
  "meta.token.longExpires",
  "meta.longToken.expiresAt",
  "meta.oauth.expiresAt",
  "meta.oauth.expiration",
  "meta.oauth.longExpires",
  "system.meta.tokenExpires",
] as const;
const META_WEBHOOK_VERIFY_SETTING_KEYS = [
  "meta.webhook.verifyToken",
  "meta.webhook.token",
  "meta.verifyToken",
  "system.meta.verifyToken",
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

export interface FetchAdAccountsOptions {
  includeSpend?: boolean;
  includeCampaigns?: boolean;
  campaignsLimit?: number;
  datePreset?: string;
  since?: string;
  until?: string;
}

export interface FetchCampaignsOptions {
  limit?: number;
  datePreset?: string;
  since?: string;
  until?: string;
}

export type CampaignStatusValue = "ACTIVE" | "PAUSED";

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

const resolveEnvString = (env: Record<string, unknown>, keys: readonly string[]): string | undefined => {
  for (const key of keys) {
    const value = env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

export const resolveMetaAppId = (env: Record<string, unknown>): string | undefined => {
  return resolveEnvString(env, APP_ID_KEYS);
};

export const resolveMetaAppSecret = (env: Record<string, unknown>): string | undefined => {
  return resolveEnvString(env, APP_SECRET_KEYS);
};

export const resolveMetaWebhookVerifyToken = (env: Record<string, unknown>): string | undefined => {
  return resolveEnvString(env, WEBHOOK_VERIFY_TOKEN_KEYS);
};

const extractSettingString = (
  value: unknown,
  nestedKeys: readonly string[] = ["value", "id", "appId", "secret", "url"],
): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of nestedKeys) {
    if (key in record) {
      const nested = extractSettingString(record[key], nestedKeys);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
};

const findSettingOverride = (
  settings: Array<{ key: string; value: unknown }>,
  keys: readonly string[],
  nestedKeys?: readonly string[],
): string | undefined => {
  for (const key of keys) {
    const entry = settings.find((item) => item.key === key);
    if (!entry) {
      continue;
    }
    const extracted = extractSettingString(entry.value, nestedKeys);
    if (extracted) {
      return extracted;
    }
  }
  return undefined;
};

export const withMetaSettings = async (
  env: EnvBindings & Record<string, unknown>,
): Promise<EnvBindings & Record<string, unknown>> => {
  if (!env.DB || !env.R2) {
    return env;
  }

  try {
    const settings = await listSettings(env);
    const overrides: Record<string, unknown> = {};

    if (!resolveMetaAppId(env)) {
      const appId = findSettingOverride(settings, META_APP_SETTING_KEYS, ["appId", "id", "value"]);
      if (appId) {
        overrides.META_APP_ID = appId;
      }
    }

    if (!resolveMetaAppSecret(env)) {
      const secret = findSettingOverride(settings, META_SECRET_SETTING_KEYS, ["secret", "value"]);
      if (secret) {
        overrides.META_APP_SECRET = secret;
      }
    }

    if (!resolveEnvToken(env)) {
      const token = findSettingOverride(settings, META_TOKEN_SETTING_KEYS, ["accessToken", "token", "value"]);
      if (token) {
        overrides.META_ACCESS_TOKEN = token;
        const expiresAt = findSettingOverride(
          settings,
          META_TOKEN_EXPIRES_SETTING_KEYS,
          ["expiresAt", "expires", "value"],
        );
        if (expiresAt) {
          overrides.META_ACCESS_TOKEN_EXPIRES = expiresAt;
        }
      }
    }

    if (!resolveMetaWebhookVerifyToken(env)) {
      const verifyToken = findSettingOverride(
        settings,
        META_WEBHOOK_VERIFY_SETTING_KEYS,
        ["verifyToken", "token", "value"],
      );
      if (verifyToken) {
        overrides.META_WEBHOOK_VERIFY_TOKEN = verifyToken;
      }
    }

    if (Object.keys(overrides).length > 0) {
      return Object.assign({}, env, overrides);
    }
  } catch (error) {
    console.warn("Failed to resolve Meta credentials from settings", error);
  }

  return env;
};

export const ensureMetaAppCredentials = (
  env: Record<string, unknown>,
): { appId: string; secret: string } => {
  const appId = resolveMetaAppId(env);
  const secret = resolveMetaAppSecret(env);
  if (!appId || !secret) {
    const idKeys = APP_ID_KEYS.join(", ");
    const secretKeys = APP_SECRET_KEYS.join(", ");
    throw new Error(
      `Meta app credentials are not configured (expected one of ${idKeys} and ${secretKeys})`,
    );
  }
  return { appId, secret };
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

const parseNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const numeric = Number(value.trim());
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
  }
  return undefined;
};

const formatCurrencyValue = (amount: number | undefined, currency?: string): string | undefined => {
  if (amount === undefined || Number.isNaN(amount)) {
    return undefined;
  }
  if (!currency) {
    return amount.toFixed(2);
  }
  try {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(amount);
  } catch (error) {
    return `${amount.toFixed(2)} ${currency}`.trim();
  }
};

const resolveInsightsWindow = (options: {
  datePreset?: string;
  since?: string;
  until?: string;
}): Record<string, string> => {
  const params: Record<string, string> = {};
  if (options.since || options.until) {
    const since = (options.since || options.until || "").toString() || new Date().toISOString().slice(0, 10);
    const until = (options.until || options.since || "").toString() || since;
    params.time_range = JSON.stringify({ since, until });
  } else if (options.datePreset && options.datePreset.trim()) {
    params.date_preset = options.datePreset.trim();
  } else {
    params.date_preset = "today";
  }
  return params;
};

const resolvePeriodLabel = (options: { datePreset?: string; since?: string; until?: string }): string => {
  if (options.datePreset && options.datePreset.trim()) {
    return options.datePreset.trim();
  }
  if (options.since || options.until) {
    const since = (options.since || options.until || "").toString();
    const until = (options.until || options.since || "").toString();
    if (since && until && since !== until) {
      return `${since} → ${until}`;
    }
    return since || until || "custom";
  }
  return "today";
};

const safeGraphCall = async <T>(
  env: EnvBindings & Record<string, unknown>,
  path: string,
  params: Record<string, string>,
): Promise<T | null> => {
  try {
    return await callGraph<T>(env, path, params);
  } catch (error) {
    console.warn(`Graph API request failed for ${path}`, (error as Error).message);
    return null;
  }
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

interface AccountInsightsResponse {
  data?: Array<{
    account_id?: string;
    spend?: string;
    account_currency?: string;
    impressions?: string;
    clicks?: string;
    date_start?: string;
    date_stop?: string;
  }>;
}

interface CampaignsResponse {
  data?: Array<{
    id?: string;
    name?: string;
    status?: string;
    effective_status?: string;
    objective?: string;
    updated_time?: string;
    daily_budget?: string | number | null;
  }>;
}

interface CampaignInsightsResponse {
  data?: Array<{
    campaign_id?: string;
    campaign_name?: string;
    spend?: string;
    impressions?: string;
    clicks?: string;
    reach?: string;
    inline_link_clicks?: string;
    unique_clicks?: string;
    unique_actions?: Array<{ action_type?: string; value?: string }>;
    actions?: Array<{ action_type?: string; value?: string }>;
    action_values?: Array<{ action_type?: string; value?: string }>;
    account_currency?: string;
    date_start?: string;
    date_stop?: string;
  }>;
}

interface LeadDetailsResponse {
  id?: string;
  created_time?: string;
  ad_id?: string;
  form_id?: string;
  campaign_id?: string;
  field_data?: Array<{
    name?: string;
    values?: Array<string | number | boolean | null>;
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
  options: FetchAdAccountsOptions = {},
): Promise<MetaAdAccount[]> => {
  const tokenRecord = effectiveToken(env, record);
  const status = ensureTokenFreshness(tokenRecord);
  if (status === "missing" || !tokenRecord?.accessToken) {
    throw new Error("Meta token is missing");
  }

  const accounts: MetaAdAccount[] = [];
  const seen = new Set<string>();
  const addAccount = (account: MetaAdAccount | null | undefined) => {
    if (!account?.id || seen.has(account.id)) {
      return;
    }
    seen.add(account.id);
    accounts.push(account);
  };

  const baseParams = {
    access_token: tokenRecord.accessToken,
    fields: "id,name,currency,account_status,business",
  };

  const meResponse = await safeGraphCall<AdAccountsResponse>(env, "me/adaccounts", baseParams);
  for (const item of meResponse?.data || []) {
    const id = item.id || (item as { account_id?: string }).account_id;
    if (!id || !item.name) {
      continue;
    }
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
    const account = await safeGraphCall<{
      id?: string;
      name?: string;
      currency?: string;
      account_status?: number;
    }>(env, normalized, baseParams);
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
    const response = await safeGraphCall<BusinessAccountsResponse>(env, `${businessId}/${edge}`, baseParams);
    for (const item of response?.data || []) {
      const id = item.id || item.account_id;
      if (!id || !item.name) {
        continue;
      }
      const statusInfo = describeAccountStatus(item.account_status);
      addAccount({
        id,
        name: item.name,
        currency: item.currency,
        status: statusInfo.label,
        statusCode: statusInfo.code,
        statusSeverity: statusInfo.severity,
        business: item.business
          ? { id: item.business.id, name: item.business.name }
          : { id: businessId, name: undefined },
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

  const { includeSpend, includeCampaigns, campaignsLimit, datePreset, since, until } = options;
  const insightWindow = resolveInsightsWindow({ datePreset, since, until });
  const periodLabel = resolvePeriodLabel({ datePreset, since, until });

  if (includeSpend) {
    await Promise.all(
      accounts.map(async (account) => {
        const insights = await safeGraphCall<AccountInsightsResponse>(
          env,
          `${account.id}/insights`,
          {
            access_token: tokenRecord.accessToken,
            fields: "spend,account_currency,impressions,clicks,date_start,date_stop",
            level: "account",
            time_increment: "all_days",
            ...insightWindow,
          },
        );
        const row = insights?.data?.[0];
        if (!row) {
          return;
        }
        const spend = parseNumber(row.spend);
        const impressions = parseNumber(row.impressions);
        const clicks = parseNumber(row.clicks);
        const currency = row.account_currency || account.currency;
        account.spend = spend;
        account.spendCurrency = currency || account.currency;
        account.spendPeriod = periodLabel;
        account.spendFormatted = formatCurrencyValue(spend, currency || account.currency);
        if (impressions !== undefined) {
          account.impressions = impressions;
        }
        if (clicks !== undefined) {
          account.clicks = clicks;
        }
      }),
    );
  }

  if (includeCampaigns) {
    await Promise.all(
      accounts.map(async (account) => {
        try {
          const campaigns = await fetchCampaigns(env, tokenRecord, account.id, {
            limit: campaignsLimit,
            datePreset,
            since,
            until,
          });
          account.campaigns = campaigns;
          if (!includeSpend && account.spend === undefined) {
            const totalSpend = campaigns.reduce((sum, campaign) => sum + (campaign.spend ?? 0), 0);
            if (totalSpend > 0) {
              account.spend = totalSpend;
              const campaignCurrency = campaigns.find((campaign) => campaign.spendCurrency)?.spendCurrency;
              account.spendCurrency = campaignCurrency || account.currency;
              account.spendFormatted = formatCurrencyValue(account.spend, account.spendCurrency);
              account.spendPeriod = campaigns[0]?.spendPeriod || periodLabel;
            }
          }
        } catch (error) {
          console.warn(`Failed to fetch campaigns for ${account.id}`, (error as Error).message);
        }
      }),
    );
  }

  return accounts;
};

export const fetchCampaigns = async (
  env: EnvBindings & Record<string, unknown>,
  record: MetaTokenRecord | null,
  accountId: string,
  options: FetchCampaignsOptions = {},
): Promise<MetaCampaign[]> => {
  const tokenRecord = effectiveToken(env, record);
  const status = ensureTokenFreshness(tokenRecord);
  if (status === "missing" || !tokenRecord?.accessToken) {
    throw new Error("Meta token is missing");
  }

  const normalizedAccount = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const campaignsResponse = await safeGraphCall<CampaignsResponse>(
    env,
    `${normalizedAccount}/campaigns`,
    {
      access_token: tokenRecord.accessToken,
      fields: "id,name,status,effective_status,objective,updated_time,daily_budget",
      limit: String(options.limit ?? 25),
    },
  );

  const campaigns: MetaCampaign[] = [];
  const campaignMap = new Map<string, MetaCampaign>();

  for (const item of campaignsResponse?.data || []) {
    if (!item.id || !item.name) {
      continue;
    }
    const dailyBudgetRaw = parseNumber(item.daily_budget ?? undefined);
    const dailyBudget = dailyBudgetRaw !== undefined ? dailyBudgetRaw / 100 : undefined;
    const campaign: MetaCampaign = {
      id: item.id,
      accountId: normalizedAccount,
      name: item.name,
      status: item.status || undefined,
      effectiveStatus: item.effective_status || undefined,
      objective: item.objective || undefined,
      updatedTime: item.updated_time || undefined,
      dailyBudget,
    };
    campaigns.push(campaign);
    campaignMap.set(item.id, campaign);
  }

  const insightWindow = resolveInsightsWindow({
    datePreset: options.datePreset,
    since: options.since,
    until: options.until,
  });
  const periodLabel = resolvePeriodLabel({
    datePreset: options.datePreset,
    since: options.since,
    until: options.until,
  });

  const insightsResponse = await safeGraphCall<CampaignInsightsResponse>(
    env,
    `${normalizedAccount}/insights`,
    {
      access_token: tokenRecord.accessToken,
      fields:
        "campaign_id,campaign_name,spend,impressions,clicks,reach,inline_link_clicks,unique_clicks,actions,action_values,account_currency,date_start,date_stop",
      level: "campaign",
      time_increment: "all_days",
      ...insightWindow,
    },
  );

  const toActionMap = (
    items: Array<{ action_type?: string; value?: string }> | undefined,
  ): Map<string, number> => {
    const map = new Map<string, number>();
    if (!items) {
      return map;
    }
    for (const entry of items) {
      if (!entry?.action_type) {
        continue;
      }
      const numeric = parseNumber(entry.value);
      if (numeric !== undefined) {
        map.set(entry.action_type, numeric);
      }
    }
    return map;
  };

  const sumActions = (map: Map<string, number>, keys: string[]): number => {
    let total = 0;
    for (const key of keys) {
      const value = map.get(key);
      if (value !== undefined) {
        total += value;
      }
    }
    return total;
  };

  for (const row of insightsResponse?.data || []) {
    const campaignId = row.campaign_id;
    if (!campaignId) {
      continue;
    }
    const campaign = campaignMap.get(campaignId);
    if (!campaign) {
      const fallback: MetaCampaign = {
        id: campaignId,
        accountId: normalizedAccount,
        name: row.campaign_name || campaignId,
      };
      campaigns.push(fallback);
      campaignMap.set(campaignId, fallback);
    }
    const target = campaignMap.get(campaignId);
    if (!target) {
      continue;
    }
    const spend = parseNumber(row.spend);
    const impressions = parseNumber(row.impressions);
    const clicks = parseNumber(row.clicks);
    const reach = parseNumber(row.reach);
    const actionMap = toActionMap(row.actions);
    const valueMap = toActionMap(row.action_values);

    const leads = sumActions(actionMap, ["lead", "leadgen.other", "onsite_conversion.lead", "leadgen" ]);
    const conversations = sumActions(actionMap, [
      "onsite_conversion.messaging_conversation_started_7d",
      "messaging_conversation_started_7d",
    ]);
    const purchases = sumActions(actionMap, ["purchase", "offsite_conversion.fb_pixel_purchase"]);
    const installs = sumActions(actionMap, ["app_install", "mobile_app_install"]);
    const engagements = sumActions(actionMap, ["post_engagement", "onsite_conversion.post_save"]);
    const thruplays = sumActions(actionMap, ["thruplay", "video_play"]);
    const conversions = sumActions(actionMap, [
      "offsite_conversion",
      "offsite_conversion.purchase",
      "onsite_conversion.lead",
    ]);
    const revenue = sumActions(valueMap, [
      "purchase",
      "offsite_conversion.fb_pixel_purchase",
      "onsite_conversion.purchase",
    ]);

    target.spend = spend;
    target.spendCurrency = row.account_currency || target.spendCurrency;
    target.spendPeriod = periodLabel;
    target.spendFormatted = formatCurrencyValue(spend, target.spendCurrency);
    if (impressions !== undefined) {
      target.impressions = impressions;
    }
    if (clicks !== undefined) {
      target.clicks = clicks;
    }
    if (reach !== undefined) {
      target.reach = reach;
    }
    if (leads) {
      target.leads = leads;
    }
    if (conversations) {
      target.conversations = conversations;
    }
    if (purchases) {
      target.purchases = purchases;
    }
    if (installs) {
      target.installs = installs;
    }
    if (engagements) {
      target.engagements = engagements;
    }
    if (thruplays) {
      target.thruplays = thruplays;
    }
    if (conversions) {
      target.conversions = conversions;
    }
    if (revenue) {
      target.roasValue = revenue;
      target.revenueCurrency = row.account_currency || target.revenueCurrency;
    }

    if (impressions && impressions > 0 && clicks !== undefined) {
      target.ctr = clicks > 0 ? (clicks / impressions) * 100 : 0;
    }
    if (clicks && clicks > 0 && spend !== undefined) {
      target.cpc = spend ? spend / clicks : 0;
    }
    if (impressions && impressions > 0 && spend !== undefined) {
      target.cpm = spend ? (spend / impressions) * 1000 : 0;
    }
    if (leads && leads > 0 && spend !== undefined) {
      target.cpl = spend ? spend / leads : 0;
    }
    if (purchases && purchases > 0 && spend !== undefined) {
      target.cpa = spend ? spend / purchases : 0;
    }
    if (revenue && spend && spend > 0) {
      target.roas = revenue / spend;
    }
    if (thruplays && thruplays > 0 && spend !== undefined) {
      target.cpv = spend ? spend / thruplays : 0;
    }
    if (installs && installs > 0 && spend !== undefined) {
      target.cpi = spend ? spend / installs : 0;
    }
    if (engagements && engagements > 0 && spend !== undefined) {
      target.cpe = spend ? spend / engagements : 0;
    }
  }

  campaigns.sort((a, b) => {
    const spendDiff = (b.spend ?? 0) - (a.spend ?? 0);
    if (spendDiff !== 0) {
      return spendDiff;
    }
    return a.name.localeCompare(b.name);
  });

  return campaigns;
};

export const updateCampaignStatus = async (
  env: EnvBindings & Record<string, unknown>,
  record: MetaTokenRecord | null,
  campaignId: string,
  status: CampaignStatusValue,
): Promise<boolean> => {
  const tokenRecord = effectiveToken(env, record);
  const freshness = ensureTokenFreshness(tokenRecord);
  if (freshness === "missing" || !tokenRecord?.accessToken) {
    throw new Error("Meta token is missing");
  }
  const version = graphVersion(env);
  const url = new URL(`${GRAPH_BASE}/${version}/${campaignId}`);
  const params = new URLSearchParams();
  params.set("access_token", tokenRecord.accessToken);
  params.set("status", status);
  const response = await fetch(url.toString(), {
    method: "POST",
    body: params,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update campaign ${campaignId}: ${text}`);
  }
  const json = (await response.json()) as { success?: boolean };
  return Boolean(json?.success);
};

export const updateCampaignStatuses = async (
  env: EnvBindings & Record<string, unknown>,
  record: MetaTokenRecord | null,
  campaignIds: string[],
  status: CampaignStatusValue,
): Promise<{ updated: string[]; failed: { id: string; error: string }[] }> => {
  const results: { updated: string[]; failed: { id: string; error: string }[] } = { updated: [], failed: [] };
  for (const id of campaignIds) {
    try {
      await updateCampaignStatus(env, record, id, status);
      results.updated.push(id);
    } catch (error) {
      results.failed.push({ id, error: (error as Error).message });
    }
  }
  return results;
};

export const fetchLeadDetails = async (
  env: EnvBindings & Record<string, unknown>,
  record: MetaTokenRecord | null,
  leadId: string,
): Promise<MetaLeadDetails | null> => {
  const tokenRecord = effectiveToken(env, record);
  const status = ensureTokenFreshness(tokenRecord);
  if (status === "missing" || !tokenRecord?.accessToken) {
    return null;
  }

  const response = await safeGraphCall<LeadDetailsResponse>(env, leadId, {
    access_token: tokenRecord.accessToken,
    fields: "id,created_time,ad_id,form_id,campaign_id,field_data",
  });

  if (!response?.id) {
    return null;
  }

  const answersRaw: Record<string, unknown> = {};
  const normalizedMap = new Map<string, string[]>();

  if (Array.isArray(response.field_data)) {
    for (const field of response.field_data) {
      if (!field || typeof field !== "object") {
        continue;
      }
      const name = typeof field.name === "string" ? field.name.trim() : field.name !== undefined ? String(field.name).trim() : "";
      if (!name) {
        continue;
      }
      const values = Array.isArray(field.values)
        ? field.values
            .map((value) => {
              if (value === null || value === undefined) {
                return undefined;
              }
              if (typeof value === "string") {
                const trimmed = value.trim();
                return trimmed || undefined;
              }
              if (typeof value === "number" || typeof value === "boolean") {
                return String(value);
              }
              return undefined;
            })
            .filter((item): item is string => Boolean(item && item.trim()))
            .map((item) => item.trim())
        : [];
      if (!values.length) {
        continue;
      }
      answersRaw[name] = values;
      normalizedMap.set(name.toLowerCase(), values);
    }
  }

  const takeValue = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const values = normalizedMap.get(key.toLowerCase());
      if (values && values.length > 0) {
        return values[0];
      }
    }
    return undefined;
  };

  let fullName = takeValue("full_name", "name");
  const firstName = takeValue("first_name", "firstname");
  const lastName = takeValue("last_name", "lastname");
  if (!fullName && (firstName || lastName)) {
    fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || undefined;
  }

  const phone = takeValue("phone_number", "phone", "phone number");
  const email = takeValue("email", "email_address");

  const createdAt = toIsoDate(response.created_time) ?? new Date().toISOString();

  const details: MetaLeadDetails = {
    id: response.id,
    createdAt,
    fullName: fullName || undefined,
    phone,
    email,
    formId: response.form_id ? String(response.form_id) : undefined,
    adId: response.ad_id ? String(response.ad_id) : undefined,
    campaignId: response.campaign_id ? String(response.campaign_id) : undefined,
    answers: answersRaw as JsonObject,
  };

  return details;
};

export const exchangeToken = async (
  env: EnvBindings & Record<string, unknown>,
  code: string,
  redirectUri: string,
): Promise<MetaTokenRecord> => {
  const metaEnv = await withMetaSettings(env);
  const { appId, secret } = ensureMetaAppCredentials(metaEnv);
  const version = getGraphVersion(metaEnv);
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
  const metaEnv = await withMetaSettings(env);
  const { appId, secret } = ensureMetaAppCredentials(metaEnv);
  const version = getGraphVersion(metaEnv);
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
