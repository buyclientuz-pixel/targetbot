import { KV_KEYS } from "../../config/kv";
import type { KvClient } from "../../infra/kv";
import { DataValidationError } from "../../errors";
import { assertBoolean, assertEnum, assertString } from "../validation";

export const AUTOREPORT_MODES = [
  "today",
  "yesterday",
  "week",
  "month",
  "all",
  "max",
  "yesterday_plus_week",
] as const;
export type AutoreportMode = (typeof AUTOREPORT_MODES)[number];

export interface AutoreportsRecord {
  enabled: boolean;
  time: string;
  mode: AutoreportMode;
  sendToChat: boolean;
  sendToAdmin: boolean;
}

export const parseAutoreportsRecord = (raw: unknown): AutoreportsRecord => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("autoreports payload must be an object");
  }
  const record = raw as Record<string, unknown>;
  const legacyRoute = (() => {
    const value = record.send_to ?? record["send_to"];
    const stringValue = typeof value === "string" ? value : null;
    switch (stringValue) {
      case "admin":
        return { chat: false, admin: true };
      case "both":
        return { chat: true, admin: true };
      case "chat":
      default:
        return { chat: true, admin: false };
    }
  })();
  const pickBoolean = (
    keys: string[],
    field: string,
  ): { present: boolean; value: boolean | null } => {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        return { present: true, value: assertBoolean(record[key], field) };
      }
    }
    return { present: false, value: null };
  };
  const chatField = pickBoolean(["send_to_chat", "sendToChat"], "autoreports.send_to_chat");
  const adminField = pickBoolean(["send_to_admin", "sendToAdmin"], "autoreports.send_to_admin");
  return {
    enabled: assertBoolean(record.enabled ?? record["enabled"], "autoreports.enabled"),
    time: assertString(record.time ?? record["time"], "autoreports.time"),
    mode: assertEnum(record.mode ?? record["mode"], "autoreports.mode", AUTOREPORT_MODES),
    sendToChat: chatField.present ? Boolean(chatField.value) : legacyRoute.chat,
    sendToAdmin: adminField.present ? Boolean(adminField.value) : legacyRoute.admin,
  };
};

export const serialiseAutoreportsRecord = (record: AutoreportsRecord): Record<string, unknown> => ({
  enabled: record.enabled,
  time: record.time,
  mode: record.mode,
  send_to_chat: record.sendToChat,
  send_to_admin: record.sendToAdmin,
});

export const getAutoreportsRecord = async (
  kv: KvClient,
  projectId: string,
): Promise<AutoreportsRecord | null> => {
  const raw = await kv.getJson<Record<string, unknown>>(KV_KEYS.autoreports(projectId));
  return raw ? parseAutoreportsRecord(raw) : null;
};

export const putAutoreportsRecord = async (
  kv: KvClient,
  projectId: string,
  record: AutoreportsRecord,
): Promise<void> => {
  await kv.putJson(KV_KEYS.autoreports(projectId), serialiseAutoreportsRecord(record));
};
