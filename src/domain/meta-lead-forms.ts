import { KV_KEYS } from "../config/kv";
import type { KvClient } from "../infra/kv";
import { DataValidationError } from "../errors";
import { assertIsoDate, assertNumber, assertString } from "./validation";

export interface MetaLeadFormRecord {
  id: string;
  accessToken?: string | null;
}

export interface MetaLeadFormCacheEntry {
  accountId: string;
  fetchedAt: string;
  ttlSeconds: number;
  forms: MetaLeadFormRecord[];
}

export const DEFAULT_LEAD_FORM_CACHE_TTL_SECONDS = 30 * 60;

const parseLeadFormRecord = (raw: unknown): MetaLeadFormRecord => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("Lead form record must be an object");
  }
  const record = raw as Record<string, unknown>;
  const id = assertString(record.id, "leadForm.id");
  return {
    id,
    accessToken: typeof record.accessToken === "string" ? record.accessToken : null,
  };
};

const serialiseLeadFormRecord = (record: MetaLeadFormRecord): Record<string, unknown> => ({
  id: record.id,
  accessToken: record.accessToken ?? null,
});

export const parseMetaLeadFormCacheEntry = (raw: unknown): MetaLeadFormCacheEntry => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("Lead form cache entry must be an object");
  }
  const record = raw as Record<string, unknown>;
  const formsRaw = Array.isArray(record.forms) ? (record.forms as unknown[]) : [];
  return {
    accountId: assertString(record.accountId, "leadFormCache.accountId"),
    fetchedAt: assertIsoDate(record.fetchedAt, "leadFormCache.fetchedAt"),
    ttlSeconds: assertNumber(record.ttlSeconds, "leadFormCache.ttlSeconds"),
    forms: formsRaw.map((entry) => parseLeadFormRecord(entry)),
  };
};

export const serialiseMetaLeadFormCacheEntry = (
  entry: MetaLeadFormCacheEntry,
): Record<string, unknown> => ({
  accountId: entry.accountId,
  fetchedAt: entry.fetchedAt,
  ttlSeconds: entry.ttlSeconds,
  forms: entry.forms.map((form) => serialiseLeadFormRecord(form)),
});

export const createMetaLeadFormCacheEntry = (
  accountId: string,
  forms: MetaLeadFormRecord[],
  ttlSeconds = DEFAULT_LEAD_FORM_CACHE_TTL_SECONDS,
): MetaLeadFormCacheEntry => {
  return parseMetaLeadFormCacheEntry({
    accountId,
    fetchedAt: new Date().toISOString(),
    ttlSeconds,
    forms: forms.map((form) => ({ id: form.id, accessToken: form.accessToken ?? null })),
  });
};

export const isMetaLeadFormCacheFresh = (entry: MetaLeadFormCacheEntry, now = Date.now()): boolean => {
  const fetchedAtMs = new Date(entry.fetchedAt).getTime();
  return fetchedAtMs + entry.ttlSeconds * 1000 > now;
};

export const getMetaLeadFormCache = async (
  kv: KvClient,
  accountId: string,
): Promise<MetaLeadFormCacheEntry | null> => {
  const key = KV_KEYS.metaLeadForms(accountId);
  const raw = await kv.getJson<Record<string, unknown>>(key);
  if (!raw) {
    return null;
  }
  return parseMetaLeadFormCacheEntry(raw);
};

export const saveMetaLeadFormCache = async (
  kv: KvClient,
  entry: MetaLeadFormCacheEntry,
): Promise<void> => {
  const key = KV_KEYS.metaLeadForms(entry.accountId);
  await kv.putJson(key, serialiseMetaLeadFormCacheEntry(entry), { expirationTtl: entry.ttlSeconds });
};

export const deleteMetaLeadFormCache = async (kv: KvClient, accountId: string): Promise<void> => {
  const key = KV_KEYS.metaLeadForms(accountId);
  await kv.delete(key);
};
