import { createLead, type Lead } from "../domain/leads";
import { DataValidationError } from "../errors";

interface MetaWebhookPayload {
  object?: string;
  entry?: MetaWebhookEntry[];
}

interface MetaWebhookEntry {
  id?: string;
  time?: number;
  changes?: MetaWebhookChange[];
}

interface MetaWebhookChange {
  field?: string;
  value?: MetaWebhookValue;
}

interface MetaWebhookValue {
  leadgen_id?: string;
  lead_id?: string;
  project_id?: string;
  projectId?: string;
  created_time?: number | string;
  createdAt?: number | string;
  campaign_name?: string;
  campaign_id?: string;
  adset_name?: string;
  ad_name?: string;
  form_id?: string;
  page_id?: string;
  custom_disclaimer_responses?: unknown;
  field_data?: MetaFieldData[];
  custom_data?: Record<string, unknown> | null;
  custom_properties?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  message?: string | null;
  [key: string]: unknown;
}

interface MetaFieldData {
  name?: string;
  values?: Array<string | number | boolean>;
  value?: string | number | boolean | null;
}

export interface ParsedLeadEvent {
  projectId: string;
  lead: Lead;
  raw: MetaWebhookValue;
}

const ensureArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (value == null) {
    return [];
  }
  return [value as T];
};

const normaliseKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const coerceFieldValue = (field: MetaFieldData): string | null => {
  if (field.values && field.values.length > 0) {
    const raw = field.values[0];
    return raw == null ? null : String(raw);
  }
  if (field.value == null) {
    return null;
  }
  return String(field.value);
};

const buildFieldIndex = (value: MetaWebhookValue): Map<string, string> => {
  const index = new Map<string, string>();
  const fields = ensureArray<MetaFieldData>(value.field_data ?? []);
  for (const field of fields) {
    if (!field || typeof field !== "object") {
      continue;
    }
    const key = field.name ? normaliseKey(field.name) : null;
    if (!key) {
      continue;
    }
    const fieldValue = coerceFieldValue(field);
    if (fieldValue == null) {
      continue;
    }
    index.set(key, fieldValue.trim());
  }
  return index;
};

const pickFirst = (index: Map<string, string>, keys: string[]): string | null => {
  for (const key of keys) {
    const normalised = normaliseKey(key);
    if (index.has(normalised)) {
      return index.get(normalised) ?? null;
    }
  }
  return null;
};

const resolveProjectId = (value: MetaWebhookValue, index: Map<string, string>): string | null => {
  const direct = value.projectId ?? value.project_id;
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim();
  }

  const metaSources = [value.custom_properties, value.custom_data, value.metadata];
  for (const source of metaSources) {
    if (source && typeof source === "object") {
      const candidate = (source.projectId ?? source.project_id ?? source.project) as string | undefined;
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }

  const fromFields = pickFirst(index, ["project_id", "projectid", "project", "project_code"]);
  if (fromFields) {
    return fromFields;
  }

  return null;
};

const resolveTimestamp = (value: MetaWebhookValue): string | undefined => {
  const raw = value.createdAt ?? value.created_time;
  if (raw == null) {
    return undefined;
  }
  if (typeof raw === "number") {
    const millis = raw > 10_000_000_000 ? raw : raw * 1000;
    return new Date(millis).toISOString();
  }
  const trimmed = String(raw).trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^\d+$/.test(trimmed)) {
    const numeric = Number.parseInt(trimmed, 10);
    if (!Number.isNaN(numeric)) {
      const millis = trimmed.length > 12 ? numeric : numeric * 1000;
      return new Date(millis).toISOString();
    }
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return undefined;
};

const resolveName = (value: MetaWebhookValue, index: Map<string, string>): string | null => {
  const explicit = pickFirst(index, ["full_name", "name", "fio"]);
  if (explicit) {
    return explicit;
  }
  const firstName = pickFirst(index, ["first_name", "firstname", "first"]);
  const lastName = pickFirst(index, ["last_name", "lastname", "last"]);
  if (firstName || lastName) {
    return [firstName, lastName].filter(Boolean).join(" ");
  }
  if (typeof value.full_name === "string") {
    return value.full_name;
  }
  if (typeof value.name === "string") {
    return value.name;
  }
  return null;
};

const resolvePhone = (value: MetaWebhookValue, index: Map<string, string>): string | null => {
  const phone =
    pickFirst(index, [
      "phone_number",
      "phone",
      "phone_number_full",
      "phone_number_with_country_code",
      "mobile_phone",
      "contact_phone",
    ]) ?? (typeof value.phone === "string" ? value.phone : null);

  if (!phone) {
    return null;
  }

  const trimmed = phone.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("+")) {
    return trimmed;
  }
  if (/^\d+$/.test(trimmed)) {
    return trimmed.startsWith("998") ? `+${trimmed}` : trimmed;
  }
  return trimmed;
};

const resolveMessage = (value: MetaWebhookValue, index: Map<string, string>): string | null => {
  const direct =
    pickFirst(index, ["message", "сообщение", "comment", "text", "feedback", "notes"]) ??
    (typeof value.message === "string" ? value.message : null);
  if (!direct) {
    return null;
  }
  const normalised = direct.trim();
  return normalised.length > 0 ? normalised : null;
};

const resolveCampaign = (value: MetaWebhookValue, index: Map<string, string>): string | null => {
  const fromValue = value.campaign_name ?? value.campaign;
  if (typeof fromValue === "string" && fromValue.trim()) {
    return fromValue.trim();
  }
  return pickFirst(index, ["campaign", "campaign_name"]);
};

const resolveAdset = (value: MetaWebhookValue, index: Map<string, string>): string | null => {
  const fromValue = value.adset_name ?? value.adset;
  if (typeof fromValue === "string" && fromValue.trim()) {
    return fromValue.trim();
  }
  return pickFirst(index, ["adset", "adset_name"]);
};

const resolveAd = (value: MetaWebhookValue, index: Map<string, string>): string | null => {
  const fromValue = value.ad_name ?? value.ad;
  if (typeof fromValue === "string" && fromValue.trim()) {
    return fromValue.trim();
  }
  return pickFirst(index, ["ad", "ad_name", "creative"]);
};

const resolveLeadId = (value: MetaWebhookValue): string => {
  const candidate = value.leadgen_id ?? value.lead_id ?? value.id;
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }
  throw new DataValidationError("Lead payload is missing lead identifier");
};

export const parseMetaWebhookPayload = (payload: unknown): ParsedLeadEvent[] => {
  if (!payload || typeof payload !== "object") {
    throw new DataValidationError("Meta webhook payload must be an object");
  }

  const record = payload as MetaWebhookPayload;
  const entries = ensureArray<MetaWebhookEntry>(record.entry ?? []);

  const events: ParsedLeadEvent[] = [];

  for (const entry of entries) {
    const changes = ensureArray<MetaWebhookChange>(entry?.changes ?? []);
    for (const change of changes) {
      if (!change || typeof change !== "object") {
        continue;
      }
      if (change.field && change.field !== "leadgen") {
        continue;
      }
      const value = change.value;
      if (!value || typeof value !== "object") {
        continue;
      }

      const fieldIndex = buildFieldIndex(value);
      const projectId = resolveProjectId(value, fieldIndex);
      if (!projectId) {
        throw new DataValidationError("Unable to resolve projectId from Meta webhook payload");
      }

      const leadId = resolveLeadId(value);
      const createdAt = resolveTimestamp(value);
      const name = resolveName(value, fieldIndex);
      const phone = resolvePhone(value, fieldIndex);
      const message = resolveMessage(value, fieldIndex);
      const campaign = resolveCampaign(value, fieldIndex);
      const adset = resolveAdset(value, fieldIndex);
      const ad = resolveAd(value, fieldIndex);

      const lead = createLead({
        id: leadId,
        projectId,
        name,
        phone,
        message,
        campaign,
        campaignId: typeof value.campaign_id === "string" ? value.campaign_id : undefined,
        adset,
        ad,
        formId: typeof value.form_id === "string" ? value.form_id : undefined,
        createdAt,
        metaRaw: value,
      });

      events.push({
        projectId,
        lead,
        raw: value,
      });
    }
  }

  return events;
};
