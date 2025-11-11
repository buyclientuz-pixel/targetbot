import { jsonResponse } from "../utils/http";
import { readJsonFromR2, writeJsonToR2 } from "../utils/r2";
import { MetaAuthStatus } from "../types";
import { callGraph } from "../fb/client";

const STATUS_CACHE_KEY = "cache/fb_status.json";
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

export const loadMetaStatus = async (env: unknown, options: { useCache?: boolean } = {}): Promise<
  MetaAuthStatus & { updated_at?: string }
> => {
  const useCache = options.useCache !== false;
  if (useCache) {
    const cached = await readJsonFromR2<MetaAuthStatus & { updated_at?: string }>(env as any, STATUS_CACHE_KEY);
    if (cached && isFresh(cached.updated_at || cached.last_refresh)) {
      return cached;
    }
  }

  const profile = await callGraph(env as any, "me", { fields: "id,name" });
  const accounts = await callGraph(env as any, "me/adaccounts", {
    fields: "id,name,account_status,balance,currency",
    limit: "50",
  });

  const now = new Date().toISOString();
  const payload: MetaAuthStatus & { updated_at: string } = {
    ok: true,
    account_name: profile && profile.name ? String(profile.name) : undefined,
    last_refresh: now,
    updated_at: now,
    issues: [],
  };

  if (accounts && Array.isArray(accounts.data)) {
    const blocked = accounts.data.filter((item: any) => {
      const status = String(item.account_status || "");
      return !status.includes("ACTIVE");
    });
    if (blocked.length > 0) {
      payload.issues = blocked.map((item: any) =>
        "Account " + item.id + " status " + item.account_status,
      );
    }
  }

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
