import { KV_KEYS } from "../../config/kv";
import type { KvClient } from "../../infra/kv";
import { DataValidationError } from "../../errors";
import { assertBoolean, assertEnum, assertNumber } from "../validation";

export const ALERT_CHANNELS = ["chat", "admin", "both"] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

export interface AlertTypesConfig {
  leadInQueue: boolean;
  pause24h: boolean;
  paymentReminder: boolean;
}

export interface AlertsRecord {
  enabled: boolean;
  channel: AlertChannel;
  types: AlertTypesConfig;
  leadQueueThresholdHours: number;
  pauseThresholdHours: number;
  paymentReminderDays: number[];
}

const parseTypes = (raw: unknown): AlertTypesConfig => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("alerts.types must be an object");
  }
  const record = raw as Record<string, unknown>;
  return {
    leadInQueue: assertBoolean(record.lead_in_queue ?? record["lead_in_queue"], "alerts.types.lead_in_queue"),
    pause24h: assertBoolean(record.pause_24h ?? record["pause_24h"], "alerts.types.pause_24h"),
    paymentReminder: assertBoolean(
      record.payment_reminder ?? record["payment_reminder"],
      "alerts.types.payment_reminder",
    ),
  };
};

const parseNumberArray = (raw: unknown, field: string): number[] => {
  if (!Array.isArray(raw)) {
    throw new DataValidationError(`${field} must be an array`);
  }
  return raw.map((value, index) => assertNumber(value, `${field}[${index}]`));
};

export const parseAlertsRecord = (raw: unknown): AlertsRecord => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("alerts payload must be an object");
  }
  const record = raw as Record<string, unknown>;
  return {
    enabled: assertBoolean(record.enabled ?? record["enabled"], "alerts.enabled"),
    channel: assertEnum(record.channel ?? record["channel"], "alerts.channel", ALERT_CHANNELS),
    types: parseTypes(record.types ?? record["types"]),
    leadQueueThresholdHours: assertNumber(
      record.lead_queue_threshold_hours ?? record["lead_queue_threshold_hours"],
      "alerts.lead_queue_threshold_hours",
    ),
    pauseThresholdHours: assertNumber(
      record.pause_threshold_hours ?? record["pause_threshold_hours"],
      "alerts.pause_threshold_hours",
    ),
    paymentReminderDays: parseNumberArray(
      record.payment_reminder_days ?? record["payment_reminder_days"],
      "alerts.payment_reminder_days",
    ),
  };
};

export const serialiseAlertsRecord = (record: AlertsRecord): Record<string, unknown> => ({
  enabled: record.enabled,
  channel: record.channel,
  types: {
    lead_in_queue: record.types.leadInQueue,
    pause_24h: record.types.pause24h,
    payment_reminder: record.types.paymentReminder,
  },
  lead_queue_threshold_hours: record.leadQueueThresholdHours,
  pause_threshold_hours: record.pauseThresholdHours,
  payment_reminder_days: [...record.paymentReminderDays],
});

export const getAlertsRecord = async (
  kv: KvClient,
  projectId: string,
): Promise<AlertsRecord | null> => {
  const raw = await kv.getJson<Record<string, unknown>>(KV_KEYS.alerts(projectId));
  return raw ? parseAlertsRecord(raw) : null;
};

export const putAlertsRecord = async (
  kv: KvClient,
  projectId: string,
  record: AlertsRecord,
): Promise<void> => {
  await kv.putJson(KV_KEYS.alerts(projectId), serialiseAlertsRecord(record));
};
