import { KV_KEYS } from "../../config/kv";
import type { KvClient } from "../../infra/kv";
import { DataValidationError } from "../../errors";
import { assertString } from "../validation";

export interface UserSettingsRecord {
  language: string;
  timezone: string;
}

const parseUserSettingsRecord = (raw: unknown): UserSettingsRecord => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("user settings payload must be an object");
  }
  const record = raw as Record<string, unknown>;
  return {
    language: assertString(record.language ?? record["language"], "user.language"),
    timezone: assertString(record.timezone ?? record["timezone"], "user.timezone"),
  };
};

const serialiseUserSettingsRecord = (record: UserSettingsRecord): Record<string, unknown> => ({
  language: record.language,
  timezone: record.timezone,
});

export const getUserSettingsRecord = async (
  kv: KvClient,
  userId: number,
  defaults?: Partial<UserSettingsRecord>,
): Promise<UserSettingsRecord> => {
  const raw = await kv.getJson<Record<string, unknown>>(KV_KEYS.user(userId));
  if (!raw) {
    return {
      language: defaults?.language ?? "ru",
      timezone: defaults?.timezone ?? "Asia/Tashkent",
    };
  }
  const parsed = parseUserSettingsRecord(raw);
  return {
    language: parsed.language ?? defaults?.language ?? "ru",
    timezone: parsed.timezone ?? defaults?.timezone ?? "Asia/Tashkent",
  };
};

export const putUserSettingsRecord = async (
  kv: KvClient,
  userId: number,
  record: UserSettingsRecord,
): Promise<void> => {
  await kv.putJson(KV_KEYS.user(userId), serialiseUserSettingsRecord(record));
};

export const updateUserSettingsRecord = async (
  kv: KvClient,
  userId: number,
  patch: Partial<UserSettingsRecord>,
  defaults?: Partial<UserSettingsRecord>,
): Promise<UserSettingsRecord> => {
  const current = await getUserSettingsRecord(kv, userId, defaults);
  const next: UserSettingsRecord = {
    language: patch.language ?? current.language,
    timezone: patch.timezone ?? current.timezone,
  };
  await putUserSettingsRecord(kv, userId, next);
  return next;
};
