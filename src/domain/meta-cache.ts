import { KV_KEYS } from "../config/kv";
import type { KvClient } from "../infra/kv";
import { DataValidationError } from "../errors";
import { assertIsoDate, assertNumber, assertString } from "./validation";

export interface MetaCachePeriod {
  from: string;
  to: string;
}

export interface MetaCacheEntry<T = unknown> {
  projectId: string;
  scope: string;
  fetchedAt: string;
  ttlSeconds: number;
  period: MetaCachePeriod;
  payload: T;
}

const parseMetaCachePeriod = (raw: unknown): MetaCachePeriod => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("Meta cache period must be an object");
  }
  const record = raw as Record<string, unknown>;
  return {
    from: assertIsoDate(record.from, "metaCache.period.from"),
    to: assertIsoDate(record.to, "metaCache.period.to"),
  };
};

export const parseMetaCacheEntry = <T = unknown>(raw: unknown): MetaCacheEntry<T> => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("Meta cache entry must be an object");
  }
  const record = raw as Record<string, unknown>;
  return {
    projectId: assertString(record.projectId, "metaCache.projectId"),
    scope: assertString(record.scope, "metaCache.scope"),
    fetchedAt: assertIsoDate(record.fetchedAt, "metaCache.fetchedAt"),
    ttlSeconds: assertNumber(record.ttlSeconds, "metaCache.ttlSeconds"),
    period: parseMetaCachePeriod(record.period),
    payload: record.payload as T,
  };
};

export const serialiseMetaCacheEntry = <T = unknown>(entry: MetaCacheEntry<T>): Record<string, unknown> => ({
  projectId: entry.projectId,
  scope: entry.scope,
  fetchedAt: entry.fetchedAt,
  ttlSeconds: entry.ttlSeconds,
  period: entry.period,
  payload: entry.payload,
});

export const createMetaCacheEntry = <T = unknown>(
  projectId: string,
  scope: string,
  period: MetaCachePeriod,
  payload: T,
  ttlSeconds: number,
): MetaCacheEntry<T> => {
  const now = new Date().toISOString();
  return parseMetaCacheEntry({
    projectId,
    scope,
    fetchedAt: now,
    ttlSeconds,
    period,
    payload,
  });
};

export const isMetaCacheEntryFresh = (entry: MetaCacheEntry<unknown>, now = Date.now()): boolean => {
  const fetchedAtMs = new Date(entry.fetchedAt).getTime();
  return fetchedAtMs + entry.ttlSeconds * 1000 > now;
};

export const getMetaCache = async <T = unknown>(
  kv: KvClient,
  projectId: string,
  scope: string,
): Promise<MetaCacheEntry<T> | null> => {
  const key = KV_KEYS.metaCache(projectId, scope);
  const raw = await kv.getJson<Record<string, unknown>>(key);
  if (!raw) {
    return null;
  }
  return parseMetaCacheEntry<T>(raw);
};

export const saveMetaCache = async <T = unknown>(
  kv: KvClient,
  entry: MetaCacheEntry<T>,
): Promise<void> => {
  const key = KV_KEYS.metaCache(entry.projectId, entry.scope);
  await kv.putJson(key, serialiseMetaCacheEntry(entry), {
    expirationTtl: entry.ttlSeconds,
  });
};

export const deleteMetaCacheScope = async (
  kv: KvClient,
  projectId: string,
  scope: string,
): Promise<void> => {
  const key = KV_KEYS.metaCache(projectId, scope);
  await kv.delete(key);
};
