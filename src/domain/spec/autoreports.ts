import { KV_KEYS } from "../../config/kv";
import type { KvClient } from "../../infra/kv";
import { DataValidationError } from "../../errors";
import { assertBoolean, assertEnum, assertOptionalNumber, assertOptionalString, assertString } from "../validation";

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

export interface AutoreportPaymentAlertSettings {
  enabled: boolean;
  sendToChat: boolean;
  sendToAdmin: boolean;
  lastAccountStatus: number | null;
  lastAlertAt: string | null;
}

export interface AutoreportsRecord {
  enabled: boolean;
  time: string;
  mode: AutoreportMode;
  sendToChat: boolean;
  sendToAdmin: boolean;
  paymentAlerts: AutoreportPaymentAlertSettings;
}

const DEFAULT_PAYMENT_ALERTS: AutoreportPaymentAlertSettings = {
  enabled: false,
  sendToChat: true,
  sendToAdmin: true,
  lastAccountStatus: null,
  lastAlertAt: null,
};

const parsePaymentAlerts = (raw: unknown): AutoreportPaymentAlertSettings => {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_PAYMENT_ALERTS };
  }
  const record = raw as Record<string, unknown>;
  return {
    enabled: assertBoolean(record.enabled ?? record["enabled"] ?? DEFAULT_PAYMENT_ALERTS.enabled, "autoreports.paymentAlerts.enabled"),
    sendToChat: assertBoolean(
      record.sendToChat ?? record["send_to_chat"] ?? DEFAULT_PAYMENT_ALERTS.sendToChat,
      "autoreports.paymentAlerts.send_to_chat",
    ),
    sendToAdmin: assertBoolean(
      record.sendToAdmin ?? record["send_to_admin"] ?? DEFAULT_PAYMENT_ALERTS.sendToAdmin,
      "autoreports.paymentAlerts.send_to_admin",
    ),
    lastAccountStatus: assertOptionalNumber(
      record.lastAccountStatus ?? record["last_account_status"] ?? DEFAULT_PAYMENT_ALERTS.lastAccountStatus,
      "autoreports.paymentAlerts.last_account_status",
    ),
    lastAlertAt: assertOptionalString(
      record.lastAlertAt ?? record["last_alert_at"] ?? DEFAULT_PAYMENT_ALERTS.lastAlertAt,
      "autoreports.paymentAlerts.last_alert_at",
    ),
  };
};

export const createDefaultAutoreportsRecord = (): AutoreportsRecord => ({
  enabled: false,
  time: "10:00",
  mode: "yesterday_plus_week",
  sendToChat: true,
  sendToAdmin: false,
  paymentAlerts: { ...DEFAULT_PAYMENT_ALERTS },
});

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
  const paymentAlertsRaw = record.paymentAlerts ?? record["payment_alerts"];
  return {
    enabled: assertBoolean(record.enabled ?? record["enabled"], "autoreports.enabled"),
    time: assertString(record.time ?? record["time"], "autoreports.time"),
    mode: assertEnum(record.mode ?? record["mode"], "autoreports.mode", AUTOREPORT_MODES),
    sendToChat: chatField.present ? Boolean(chatField.value) : legacyRoute.chat,
    sendToAdmin: adminField.present ? Boolean(adminField.value) : legacyRoute.admin,
    paymentAlerts: parsePaymentAlerts(paymentAlertsRaw),
  };
};

export const serialiseAutoreportsRecord = (record: AutoreportsRecord): Record<string, unknown> => ({
  enabled: record.enabled,
  time: record.time,
  mode: record.mode,
  send_to_chat: record.sendToChat,
  send_to_admin: record.sendToAdmin,
  payment_alerts: {
    enabled: record.paymentAlerts.enabled,
    send_to_chat: record.paymentAlerts.sendToChat,
    send_to_admin: record.paymentAlerts.sendToAdmin,
    last_account_status: record.paymentAlerts.lastAccountStatus,
    last_alert_at: record.paymentAlerts.lastAlertAt,
  },
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
