import { jsonResponse } from "../utils/http";
import { readJsonFromR2, writeJsonToR2, deleteFromR2 } from "../utils/r2";
import { MetaAuthStatus, MetaAccountInfo } from "../types";
import { callGraph } from "../fb/client";
import { fetchAdAccounts } from "../fb/accounts";

export const STATUS_CACHE_KEY = "cache/fb_status.json";
const STATUS_TTL_MS = 30 * 60 * 1000;

const isFresh = (isoDate: string | null | undefined): boolean => {
  if (!isoDate) {
    return false;
  }
  const parsed = new Date(isoDate).getTime();
  if (!Number.isFinite(parsed)) {
    return false;
  }
  return Date.now() - parsed <= STATUS_TTL_MS;
};

export const loadMetaStatus = async (
  env: unknown,
  options: { useCache?: boolean } = {}
): Promise<
  MetaAuthStatus & { updated_at?: string; accounts?: MetaAccountInfo[]; cached?: boolean }
> => {
  const useCache = options.useCache !== false;
  if (useCache) {
    const cached = await readJsonFromR2<
      MetaAuthStatus & { updated_at?: string; accounts?: MetaAccountInfo[] }
    >(env as any, STATUS_CACHE_KEY);
    if (cached && isFresh(cached.updated_at || cached.last_refresh)) {
      return { ...cached, cached: true };
    }
  }

  const [profile, accounts] = await Promise.all([
    callGraph(env as any, "me", { fields: "id,name" }),
    fetchAdAccounts(env),
  ]);

  const now = new Date().toISOString();
  const issues: string[] = [];
  for (const account of accounts) {
    const status = String(account.status || "").toLowerCase();
    if (status && !status.includes("active")) {
      issues.push(`Account ${account.id} status ${account.status}`);
    }
    if (Array.isArray(account.issues) && account.issues.length) {
      issues.push(...account.issues.map((issue) => `Account ${account.id}: ${issue}`));
    }
  }

  const payload: MetaAuthStatus & {
    updated_at: string;
    accounts: MetaAccountInfo[];
    cached: boolean;
  } = {
    ok: true,
    status: "ok",
    account_name: profile && profile.name ? String(profile.name) : undefined,
    account_id: profile && profile.id ? String(profile.id) : undefined,
    last_refresh: now,
    updated_at: now,
    refreshed_at: now,
    issues,
    accounts,
    cached: false,
  };

  await writeJsonToR2(env as any, STATUS_CACHE_KEY, payload);
  return payload;
};

export const handleMetaStatus = async (env: unknown): Promise<Response> => {
  try {
    const status = await loadMetaStatus(env);
    return jsonResponse(status);
  } catch (error) {
    const payload: MetaAuthStatus = {
      ok: false,
      issues: [(error as Error).message],
    };
    return jsonResponse(payload, { status: 503 });
  }
};

export const clearMetaStatusCache = async (env: unknown): Promise<boolean> => {
  const deleted = await deleteFromR2(env as any, STATUS_CACHE_KEY);
  return deleted;
};
