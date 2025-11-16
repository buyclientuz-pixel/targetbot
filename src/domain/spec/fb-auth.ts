import { KV_KEYS } from "../../config/kv";
import type { KvClient } from "../../infra/kv";
import { DataValidationError, EntityNotFoundError } from "../../errors";
import { assertIsoDate, assertNumber, assertString } from "../validation";

export interface FbAdAccount {
  id: string;
  name: string;
  currency: string;
  status: number;
}

export interface FbAuthRecord {
  userId: number;
  accessToken: string;
  expiresAt: string;
  adAccounts: FbAdAccount[];
}

const pickField = (record: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
  }
  return undefined;
};

const parseAdAccount = (raw: unknown, index: number): FbAdAccount => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError(`fb_auth.ad_accounts[${index}] must be an object`);
  }
  const record = raw as Record<string, unknown>;
  const statusRaw = record.account_status ?? record["account_status"] ?? record["status"] ?? 0;
  return {
    id: assertString(record.id ?? record["id"], `fb_auth.ad_accounts[${index}].id`),
    name: assertString(record.name ?? record["name"], `fb_auth.ad_accounts[${index}].name`),
    currency: assertString(record.currency ?? record["currency"], `fb_auth.ad_accounts[${index}].currency`),
    status: assertNumber(statusRaw, `fb_auth.ad_accounts[${index}].status`),
  };
};

export const parseFbAuthRecord = (raw: unknown): FbAuthRecord => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("fb_auth record must be an object");
  }
  const record = raw as Record<string, unknown>;
  const adAccountsRaw =
    record.ad_accounts ??
    record["ad_accounts"] ??
    record.accounts ??
    record["accounts"] ??
    record.adAccounts ??
    record["adAccounts"];
  if (!Array.isArray(adAccountsRaw)) {
    throw new DataValidationError("fb_auth.ad_accounts must be an array");
  }

  return {
    userId: assertNumber(
      pickField(record, ["user_id", "userId", "userID", "userid"]),
      "fb_auth.user_id",
    ),
    accessToken: assertString(
      pickField(record, ["access_token", "accessToken", "longToken", "long_token", "token"]),
      "fb_auth.access_token",
    ),
    expiresAt: assertIsoDate(
      pickField(record, ["expires_at", "expiresAt", "expiry", "expiresAtUtc"]),
      "fb_auth.expires_at",
    ),
    adAccounts: adAccountsRaw.map((entry, index) => parseAdAccount(entry, index)),
  };
};

export const serialiseFbAuthRecord = (record: FbAuthRecord): Record<string, unknown> => {
  const accounts = record.adAccounts.map((account) => ({
    id: account.id,
    name: account.name,
    currency: account.currency,
    account_status: account.status,
  }));
  return {
    user_id: record.userId,
    userId: record.userId,
    access_token: record.accessToken,
    accessToken: record.accessToken,
    longToken: record.accessToken,
    long_token: record.accessToken,
    expires_at: record.expiresAt,
    expiresAt: record.expiresAt,
    ad_accounts: accounts,
    accounts,
  };
};

export const getFbAuthRecord = async (
  kv: KvClient,
  userId: number | string,
): Promise<FbAuthRecord | null> => {
  const keys = [KV_KEYS.facebookAuth(userId), KV_KEYS.fbAuth(userId)];
  for (const key of keys) {
    const raw = await kv.getJson<Record<string, unknown>>(key);
    if (raw) {
      return parseFbAuthRecord(raw);
    }
  }
  return null;
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
  const serialised = serialiseFbAuthRecord(record);
  await Promise.all([
    kv.putJson(KV_KEYS.fbAuth(record.userId), serialised),
    kv.putJson(KV_KEYS.facebookAuth(record.userId), serialised),
  ]);
};

export const deleteFbAuthRecord = async (kv: KvClient, userId: number | string): Promise<void> => {
  await Promise.all([
    kv.delete(KV_KEYS.fbAuth(userId)),
    kv.delete(KV_KEYS.facebookAuth(userId)),
  ]);
};
