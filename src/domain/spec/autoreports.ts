import { KV_KEYS } from "../../config/kv";
import type { KvClient } from "../../infra/kv";
import { DataValidationError } from "../../errors";
import { assertBoolean, assertEnum, assertString } from "../validation";

export const AUTOREPORT_SEND_TO = ["chat", "admin", "both"] as const;
export type AutoreportSendTo = (typeof AUTOREPORT_SEND_TO)[number];

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
  sendTo: AutoreportSendTo;
}

export const parseAutoreportsRecord = (raw: unknown): AutoreportsRecord => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("autoreports payload must be an object");
  }
  const record = raw as Record<string, unknown>;
  return {
    enabled: assertBoolean(record.enabled ?? record["enabled"], "autoreports.enabled"),
    time: assertString(record.time ?? record["time"], "autoreports.time"),
    mode: assertEnum(record.mode ?? record["mode"], "autoreports.mode", AUTOREPORT_MODES),
    sendTo: assertEnum(record.send_to ?? record["send_to"], "autoreports.send_to", AUTOREPORT_SEND_TO),
  };
};

export const serialiseAutoreportsRecord = (record: AutoreportsRecord): Record<string, unknown> => ({
  enabled: record.enabled,
  time: record.time,
  mode: record.mode,
  send_to: record.sendTo,
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
