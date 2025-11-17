import { R2_KEYS } from "../config/r2";
import type { R2Client } from "../infra/r2";
import { DataValidationError } from "../errors";

export type LeadStatus = "NEW" | "IN_PROGRESS" | "DONE";

export interface Lead {
  id: string;
  projectId: string;
  name: string;
  phone: string | null;
  message: string | null;
  contact: string;
  source: string;
  campaign: string | null;
  campaignId: string | null;
  adset: string | null;
  ad: string | null;
  formId: string | null;
  createdAt: string;
  status: LeadStatus;
  lastStatusUpdate: string;
  metaRaw: unknown;
}

export interface CreateLeadInput {
  id: string;
  projectId: string;
  name: string | null | undefined;
  phone: string | null | undefined;
  message?: string | null | undefined;
  contact?: string | null | undefined;
  source?: string | null | undefined;
  campaign?: string | null | undefined;
  campaignId?: string | null | undefined;
  adset?: string | null | undefined;
  ad?: string | null | undefined;
  formId?: string | null | undefined;
  createdAt?: string | null | undefined;
  metaRaw?: unknown;
}

const normaliseString = (value: string | null | undefined, fallback = ""): string => {
  if (value == null) {
    return fallback;
  }
  const trimmed = `${value}`.trim();
  return trimmed.length === 0 ? fallback : trimmed;
};

const requireString = (value: string | null | undefined, field: string): string => {
  const normalised = normaliseString(value);
  if (!normalised) {
    throw new DataValidationError(`${field} is required for lead`);
  }
  return normalised;
};

const normaliseOptionalString = (value: string | null | undefined): string | null => {
  if (value == null) {
    return null;
  }
  const trimmed = `${value}`.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const ensureIsoTimestamp = (value: string | null | undefined): string => {
  if (!value) {
    return new Date().toISOString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new DataValidationError(`Invalid timestamp '${value}' for lead`);
  }
  return date.toISOString();
};

export const createLead = (input: CreateLeadInput): Lead => {
  const createdAt = ensureIsoTimestamp(input.createdAt);
  const phone = normaliseOptionalString(input.phone);
  const message = normaliseOptionalString(input.message);
  const defaultContact = phone ?? (message ? "Сообщение" : "—");
  const contact = normaliseString(input.contact ?? defaultContact, defaultContact);
  return {
    id: requireString(input.id, "id"),
    projectId: requireString(input.projectId, "projectId"),
    name: normaliseString(input.name, "Без имени"),
    phone,
    message,
    contact,
    source: normaliseString(input.source ?? "facebook", "facebook"),
    campaign: normaliseOptionalString(input.campaign),
    campaignId: normaliseOptionalString(input.campaignId),
    adset: normaliseOptionalString(input.adset),
    ad: normaliseOptionalString(input.ad),
    formId: normaliseOptionalString(input.formId),
    createdAt,
    status: "NEW",
    lastStatusUpdate: createdAt,
    metaRaw: input.metaRaw ?? null,
  };
};

const PROJECT_LEAD_PREFIX = "project-leads";
const LEGACY_LEAD_PREFIX = "leads";

const buildProjectLeadPrefix = (projectId: string): string => `${PROJECT_LEAD_PREFIX}/${projectId}/`;
const buildLegacyLeadPrefix = (projectId: string): string => `${LEGACY_LEAD_PREFIX}/${projectId}/`;

const deleteQuietly = async (r2: R2Client, key: string): Promise<void> => {
  try {
    await r2.delete(key);
  } catch {
    // ignore missing keys
  }
};

const migrateLegacyLead = async (
  r2: R2Client,
  projectId: string,
  leadId: string,
  raw: unknown,
): Promise<Lead | null> => {
  try {
    const lead = parseStoredLead(raw, projectId);
    await r2.putJson(R2_KEYS.projectLead(projectId, leadId), lead);
    await deleteQuietly(r2, R2_KEYS.lead(projectId, leadId));
    return lead;
  } catch {
    return null;
  }
};

export const saveLead = async (r2: R2Client, lead: Lead): Promise<void> => {
  const key = R2_KEYS.projectLead(lead.projectId, lead.id);
  const storedPayload: Record<string, unknown> = {
    ...lead,
    status: lead.status.toLowerCase(),
  };
  await r2.putJson(key, storedPayload);
  await deleteQuietly(r2, R2_KEYS.lead(lead.projectId, lead.id));
  await deleteQuietly(r2, R2_KEYS.legacyProjectLead(lead.projectId, lead.id));
};

export const deleteLead = async (
  r2: R2Client,
  projectId: string,
  leadId: string,
): Promise<void> => {
  await deleteQuietly(r2, R2_KEYS.projectLead(projectId, leadId));
  await deleteQuietly(r2, R2_KEYS.legacyProjectLead(projectId, leadId));
  await deleteQuietly(r2, R2_KEYS.lead(projectId, leadId));
};

export const getLead = async (r2: R2Client, projectId: string, leadId: string): Promise<Lead | null> => {
  const keys = [
    R2_KEYS.projectLead(projectId, leadId),
    R2_KEYS.legacyProjectLead(projectId, leadId),
    R2_KEYS.lead(projectId, leadId),
  ];
  for (const key of keys) {
    const payload = await r2.getJson<Lead>(key);
    if (payload) {
      if (key === R2_KEYS.projectLead(projectId, leadId)) {
        return payload;
      }
      return migrateLegacyLead(r2, projectId, leadId, payload);
    }
  }
  return null;
};

const parseLeadStatus = (value: unknown): LeadStatus => {
  if (typeof value === "string" && value.trim().length > 0) {
    const normalised = value.trim().toUpperCase();
    if (normalised === "NEW" || normalised === "IN_PROGRESS" || normalised === "DONE") {
      return normalised;
    }
  }
  return "NEW";
};

const pickRecordValue = <T>(record: Record<string, unknown>, keys: string[]): T | null => {
  for (const key of keys) {
    if (key in record && record[key] != null) {
      return record[key] as T;
    }
  }
  return null;
};

export const parseStoredLead = (raw: unknown, projectIdHint?: string): Lead => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("Stored lead payload must be an object");
  }
  const record = raw as Record<string, unknown>;
  const createdAt = ensureIsoTimestamp(
    (pickRecordValue<string>(record, ["createdAt", "created_at"]) ?? undefined) as string | undefined,
  );
  const lastStatusUpdateValue =
    pickRecordValue<string>(record, ["lastStatusUpdate", "last_status_update"]) ?? createdAt;
  const lastStatusUpdate = ensureIsoTimestamp(lastStatusUpdateValue);
  const projectIdValue =
    pickRecordValue<string>(record, ["projectId", "project_id"]) ?? projectIdHint ?? null;
  const phone = normaliseOptionalString(
    (pickRecordValue<string>(record, ["phone", "phone_number"]) ?? undefined) as string | undefined,
  );
  const message = normaliseOptionalString(
    (pickRecordValue<string>(record, ["message", "message_text"]) ?? undefined) as string | undefined,
  );
  const contactValue = pickRecordValue<string>(record, ["contact"]);
  const defaultContact = phone ?? (message ? "Сообщение" : "—");
  return {
    id: requireString(record.id as string | null | undefined, "lead.id"),
    projectId: requireString(projectIdValue, "lead.projectId"),
    name: normaliseString(record.name as string | null | undefined, "Без имени"),
    phone,
    message,
    contact: normaliseString(contactValue ?? defaultContact, defaultContact),
    source: normaliseString((record.source as string | null | undefined) ?? "facebook", "facebook"),
    campaign: normaliseOptionalString(
      (pickRecordValue<string>(record, ["campaign", "campaign_name"]) ?? undefined) as string | undefined,
    ),
    campaignId: normaliseOptionalString(
      (pickRecordValue<string>(record, ["campaignId", "campaign_id"]) ?? undefined) as string | undefined,
    ),
    adset: normaliseOptionalString(
      (pickRecordValue<string>(record, ["adset", "adset_name"]) ?? undefined) as string | undefined,
    ),
    ad: normaliseOptionalString(
      (pickRecordValue<string>(record, ["ad", "ad_name", "creative"]) ?? undefined) as string | undefined,
    ),
    formId: normaliseOptionalString(
      (pickRecordValue<string>(record, ["formId", "form_id", "leadgen_form_id"]) ?? undefined) as string | undefined,
    ),
    createdAt,
    status: parseLeadStatus(pickRecordValue(record, ["status"]) ?? undefined),
    lastStatusUpdate,
    metaRaw: pickRecordValue<Record<string, unknown>>(record, ["metaRaw", "meta_raw"]) ?? null,
  };
};

const compareByCreatedAtDesc = (a: Lead, b: Lead): number => {
  if (a.createdAt === b.createdAt) {
    return 0;
  }
  return a.createdAt > b.createdAt ? -1 : 1;
};

const collectLeadsFromPrefix = async (
  r2: R2Client,
  projectId: string,
  prefix: string,
  preferExisting: boolean,
  bucket: Map<string, Lead>,
): Promise<void> => {
  let cursor: string | undefined;
  do {
    const { objects, cursor: nextCursor } = await r2.list(prefix, { cursor, limit: 1000 });
    for (const object of objects) {
      if (object.key.endsWith("/list.json")) {
        continue;
      }
      const data = await r2.getJson<unknown>(object.key);
      if (!data) {
        continue;
      }
      try {
        const lead = parseStoredLead(data, projectId);
        if (bucket.has(lead.id) && !preferExisting) {
          continue;
        }
        bucket.set(lead.id, lead);
      } catch {
        await deleteQuietly(r2, object.key);
      }
    }
    cursor = nextCursor;
  } while (cursor);
};

export const listLeads = async (r2: R2Client, projectId: string): Promise<Lead[]> => {
  const bucket = new Map<string, Lead>();
  await collectLeadsFromPrefix(r2, projectId, buildProjectLeadPrefix(projectId), true, bucket);
  await collectLeadsFromPrefix(r2, projectId, buildLegacyLeadPrefix(projectId), false, bucket);
  return Array.from(bucket.values()).sort(compareByCreatedAtDesc);
};

export const filterLeadsByDateRange = (leads: Lead[], from: Date, to: Date): Lead[] => {
  const fromTime = from.getTime();
  const toTime = to.getTime();
  return leads.filter((lead) => {
    const createdAt = new Date(lead.createdAt).getTime();
    if (Number.isNaN(createdAt)) {
      return false;
    }
    return createdAt >= fromTime && createdAt <= toTime;
  });
};
