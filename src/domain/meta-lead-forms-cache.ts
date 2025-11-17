import { KV_KEYS } from "../config/kv";
import type { KvClient } from "../infra/kv";
import { DataValidationError } from "../errors";
import { assertIsoDate, assertOptionalString, assertString } from "./validation";

export interface CachedMetaLeadForm {
  id: string;
  accessToken?: string | null;
}

export interface MetaLeadFormsCacheRecord {
  projectId: string;
  accountId: string;
  forms: CachedMetaLeadForm[];
  fetchedAt: string;
}

export const META_LEAD_FORMS_CACHE_TTL_SECONDS = 30 * 60; // 30 minutes

const parseCachedForm = (raw: unknown, index: number): CachedMetaLeadForm => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError(`metaLeadForms.forms[${index}] must be an object`);
  }
  const record = raw as Record<string, unknown>;
  return {
    id: assertString(record.id ?? record["id"], `metaLeadForms.forms[${index}].id`),
    accessToken: assertOptionalString(
      record.accessToken ?? record["accessToken"] ?? record["access_token"],
      `metaLeadForms.forms[${index}].accessToken`,
    ),
  };
};

const parseMetaLeadFormsCacheRecord = (raw: unknown): MetaLeadFormsCacheRecord => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("metaLeadForms cache entry must be an object");
  }
  const record = raw as Record<string, unknown>;
  const formsRaw = record.forms ?? record["forms"];
  if (!Array.isArray(formsRaw)) {
    throw new DataValidationError("metaLeadForms.forms must be an array");
  }
  return {
    projectId: assertString(record.projectId ?? record["project_id"], "metaLeadForms.projectId"),
    accountId: assertString(record.accountId ?? record["account_id"], "metaLeadForms.accountId"),
    fetchedAt: assertIsoDate(record.fetchedAt ?? record["fetched_at"], "metaLeadForms.fetchedAt"),
    forms: formsRaw.map((entry, index) => parseCachedForm(entry, index)),
  };
};

const serialiseCacheRecord = (entry: MetaLeadFormsCacheRecord): Record<string, unknown> => ({
  projectId: entry.projectId,
  accountId: entry.accountId,
  fetchedAt: entry.fetchedAt,
  forms: entry.forms.map((form) => ({
    id: form.id,
    accessToken: form.accessToken ?? null,
  })),
});

export const getCachedMetaLeadForms = async (
  kv: KvClient,
  projectId: string,
  accountId: string,
): Promise<MetaLeadFormsCacheRecord | null> => {
  const key = KV_KEYS.metaLeadForms(projectId, accountId);
  const raw = await kv.getJson<Record<string, unknown>>(key);
  if (!raw) {
    return null;
  }
  return parseMetaLeadFormsCacheRecord(raw);
};

export const saveMetaLeadFormsCache = async (
  kv: KvClient,
  entry: MetaLeadFormsCacheRecord,
): Promise<void> => {
  const key = KV_KEYS.metaLeadForms(entry.projectId, entry.accountId);
  await kv.putJson(key, serialiseCacheRecord(entry), {
    expirationTtl: META_LEAD_FORMS_CACHE_TTL_SECONDS,
  });
};
