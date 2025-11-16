import { KV_KEYS } from "../../config/kv";
import type { KvClient } from "../../infra/kv";
import { DataValidationError, EntityNotFoundError } from "../../errors";
import {
  assertEnum,
  assertNumber,
  assertOptionalNumber,
  assertOptionalString,
  assertString,
} from "../validation";

export const KPI_MODES = ["auto", "manual"] as const;
export type KpiMode = (typeof KPI_MODES)[number];

export const KPI_TYPES = ["LEAD", "MESSAGE", "CLICK", "VIEW", "PURCHASE"] as const;
export type KpiType = (typeof KPI_TYPES)[number];

export interface ProjectKpiSettings {
  mode: KpiMode;
  type: KpiType;
  label: string;
}

export interface ProjectSettings {
  currency: string;
  timezone: string;
  kpi: ProjectKpiSettings;
}

export interface ProjectRecord {
  id: string;
  name: string;
  ownerId: number;
  adAccountId: string | null;
  chatId: number | null;
  portalUrl: string;
  settings: ProjectSettings;
}

const pickField = <T>(record: Record<string, unknown>, keys: readonly string[]): T | undefined => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key] as T;
    }
  }
  return undefined;
};

const parseSettings = (raw: unknown): ProjectSettings => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("project.settings must be an object");
  }
  const record = raw as Record<string, unknown>;
  const kpiRaw = record.kpi ?? record["kpi"];
  if (!kpiRaw || typeof kpiRaw !== "object") {
    throw new DataValidationError("project.settings.kpi must be an object");
  }
  const kpiRecord = kpiRaw as Record<string, unknown>;
  return {
    currency: assertString(record.currency ?? record["currency"], "project.settings.currency"),
    timezone: assertString(record.timezone ?? record["timezone"], "project.settings.timezone"),
    kpi: {
      mode: assertEnum(kpiRecord.mode ?? kpiRecord["mode"], "project.settings.kpi.mode", KPI_MODES),
      type: assertEnum(kpiRecord.type ?? kpiRecord["type"], "project.settings.kpi.type", KPI_TYPES),
      label: assertString(kpiRecord.label ?? kpiRecord["label"], "project.settings.kpi.label"),
    },
  };
};

export const parseProjectRecord = (raw: unknown): ProjectRecord => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("project record must be an object");
  }
  const record = raw as Record<string, unknown>;
  const ownerRaw =
    pickField(record, ["owner_id", "ownerId", "ownerID", "ownerTelegramId", "ownerTelegramID", "owner"] as const);
  const adAccountRaw = pickField(record, ["ad_account_id", "adAccountId", "adsAccountId", "adAccountID"] as const);
  const chatRaw = pickField(record, ["chat_id", "chatId", "chatID"] as const);
  const portalRaw = pickField(record, ["portal_url", "portalUrl", "portalURL"] as const);
  return {
    id: assertString(record.id ?? record["id"], "project.id"),
    name: assertString(record.name ?? record["name"], "project.name"),
    ownerId: assertNumber(ownerRaw, "project.owner_id"),
    adAccountId: assertOptionalString(adAccountRaw, "project.ad_account_id"),
    chatId: assertOptionalNumber(chatRaw, "project.chat_id"),
    portalUrl: assertString(portalRaw ?? record.portal_url ?? record["portal_url"], "project.portal_url", {
      allowEmpty: true,
    }),
    settings: parseSettings(record.settings ?? record["settings"]),
  };
};

export const serialiseProjectRecord = (record: ProjectRecord): Record<string, unknown> => ({
  id: record.id,
  name: record.name,
  owner_id: record.ownerId,
  ownerId: record.ownerId,
  ownerTelegramId: record.ownerId,
  adsAccountId: record.adAccountId,
  adAccountId: record.adAccountId,
  ad_account_id: record.adAccountId,
  chat_id: record.chatId,
  chatId: record.chatId,
  portal_url: record.portalUrl,
  portalUrl: record.portalUrl,
  settings: {
    currency: record.settings.currency,
    timezone: record.settings.timezone,
    kpi: {
      mode: record.settings.kpi.mode,
      type: record.settings.kpi.type,
      label: record.settings.kpi.label,
    },
  },
});

export const getProjectRecord = async (
  kv: KvClient,
  projectId: string,
): Promise<ProjectRecord | null> => {
  const raw = await kv.getJson<Record<string, unknown>>(KV_KEYS.project(projectId));
  return raw ? parseProjectRecord(raw) : null;
};

export const requireProjectRecord = async (
  kv: KvClient,
  projectId: string,
): Promise<ProjectRecord> => {
  const record = await getProjectRecord(kv, projectId);
  if (!record) {
    throw new EntityNotFoundError("project", projectId);
  }
  return record;
};

export const putProjectRecord = async (
  kv: KvClient,
  record: ProjectRecord,
): Promise<void> => {
  await kv.putJson(KV_KEYS.project(record.id), serialiseProjectRecord(record));
};

export const deleteProjectRecord = async (kv: KvClient, projectId: string): Promise<void> => {
  await kv.delete(KV_KEYS.project(projectId));
};
