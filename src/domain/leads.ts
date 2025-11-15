import { R2_KEYS } from "../config/r2";
import type { R2Client } from "../infra/r2";
import { DataValidationError } from "../errors";

export type LeadStatus = "NEW" | "IN_PROGRESS" | "DONE";

export interface Lead {
  id: string;
  projectId: string;
  name: string;
  phone: string | null;
  source: string;
  campaign: string | null;
  adset: string | null;
  ad: string | null;
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
  source?: string | null | undefined;
  campaign?: string | null | undefined;
  adset?: string | null | undefined;
  ad?: string | null | undefined;
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
  return {
    id: requireString(input.id, "id"),
    projectId: requireString(input.projectId, "projectId"),
    name: normaliseString(input.name, "Без имени"),
    phone: normaliseOptionalString(input.phone),
    source: normaliseString(input.source ?? "facebook", "facebook"),
    campaign: normaliseOptionalString(input.campaign),
    adset: normaliseOptionalString(input.adset),
    ad: normaliseOptionalString(input.ad),
    createdAt,
    status: "NEW",
    lastStatusUpdate: createdAt,
    metaRaw: input.metaRaw ?? null,
  };
};

export const saveLead = async (r2: R2Client, lead: Lead): Promise<void> => {
  const key = R2_KEYS.lead(lead.projectId, lead.id);
  await r2.putJson(key, lead);
};

export const getLead = async (r2: R2Client, projectId: string, leadId: string): Promise<Lead | null> => {
  const key = R2_KEYS.lead(projectId, leadId);
  return r2.getJson<Lead>(key);
};
