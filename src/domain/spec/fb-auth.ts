import { KV_KEYS } from "../../config/kv";
import type { KvClient } from "../../infra/kv";
import { DataValidationError, EntityNotFoundError } from "../../errors";
import { assertIsoDate, assertNumber, assertString } from "../validation";

export interface FbAdAccount {
  id: string;
  name: string;
  currency: string;
}

export interface FbAuthRecord {
  userId: number;
  accessToken: string;
  expiresAt: string;
  adAccounts: FbAdAccount[];
}

const parseAdAccount = (raw: unknown, index: number): FbAdAccount => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError(`fb_auth.ad_accounts[${index}] must be an object`);
  }
  const record = raw as Record<string, unknown>;
  return {
    id: assertString(record.id ?? record["id"], `fb_auth.ad_accounts[${index}].id`),
    name: assertString(record.name ?? record["name"], `fb_auth.ad_accounts[${index}].name`),
    currency: assertString(
      record.currency ?? record["currency"],
      `fb_auth.ad_accounts[${index}].currency`,
    ),
  };
};

export const parseFbAuthRecord = (raw: unknown): FbAuthRecord => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("fb_auth record must be an object");
  }
  const record = raw as Record<string, unknown>;
  const adAccountsRaw = record.ad_accounts ?? record["ad_accounts"];
  if (!Array.isArray(adAccountsRaw)) {
    throw new DataValidationError("fb_auth.ad_accounts must be an array");
  }

  return {
    userId: assertNumber(record.user_id ?? record["user_id"], "fb_auth.user_id"),
    accessToken: assertString(record.access_token ?? record["access_token"], "fb_auth.access_token"),
    expiresAt: assertIsoDate(record.expires_at ?? record["expires_at"], "fb_auth.expires_at"),
    adAccounts: adAccountsRaw.map((entry, index) => parseAdAccount(entry, index)),
  };
};

export const serialiseFbAuthRecord = (record: FbAuthRecord): Record<string, unknown> => ({
  user_id: record.userId,
  access_token: record.accessToken,
  expires_at: record.expiresAt,
  ad_accounts: record.adAccounts.map((account) => ({
    id: account.id,
    name: account.name,
    currency: account.currency,
  })),
});

export const getFbAuthRecord = async (
  kv: KvClient,
  userId: number | string,
): Promise<FbAuthRecord | null> => {
  const raw = await kv.getJson<Record<string, unknown>>(KV_KEYS.fbAuth(userId));
  return raw ? parseFbAuthRecord(raw) : null;
};

export const requireFbAuthRecord = async (
  kv: KvClient,
  userId: number | string,
): Promise<FbAuthRecord> => {
  const record = await getFbAuthRecord(kv, userId);
  if (!record) {
    throw new EntityNotFoundError("fb_auth", String(userId));
  }
  return record;
};

export const putFbAuthRecord = async (kv: KvClient, record: FbAuthRecord): Promise<void> => {
  await kv.putJson(KV_KEYS.fbAuth(record.userId), serialiseFbAuthRecord(record));
};

export const deleteFbAuthRecord = async (kv: KvClient, userId: number | string): Promise<void> => {
  await kv.delete(KV_KEYS.fbAuth(userId));
};
