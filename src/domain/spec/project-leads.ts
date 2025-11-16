import { R2_KEYS } from "../../config/r2";
import type { R2Client } from "../../infra/r2";
import { DataValidationError, EntityNotFoundError } from "../../errors";
import { assertEnum, assertIsoDate, assertNumber, assertOptionalString, assertString } from "../validation";

export const LEAD_STATUSES = ["new", "processing", "done", "trash"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface LeadListStats {
  total: number;
  today: number;
}

export interface ProjectLeadSummary {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
  source: string;
  campaignName: string;
  status: LeadStatus;
  type: string | null;
}

export interface ProjectLeadsListRecord {
  stats: LeadListStats;
  leads: ProjectLeadSummary[];
}

export interface LeadDetailRecord extends ProjectLeadSummary {
  adset?: string | null;
  ad?: string | null;
  metaRaw?: Record<string, unknown> | null;
}

const parseStats = (raw: unknown): LeadListStats => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("project-leads.stats must be an object");
  }
  const record = raw as Record<string, unknown>;
  return {
    total: assertNumber(record.total ?? record["total"], "project-leads.stats.total"),
    today: assertNumber(record.today ?? record["today"], "project-leads.stats.today"),
  };
};

const parseLeadSummary = (raw: unknown, index: number): ProjectLeadSummary => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError(`project-leads.leads[${index}] must be an object`);
  }
  const record = raw as Record<string, unknown>;
  return {
    id: assertString(record.id ?? record["id"], `project-leads.leads[${index}].id`),
    name: assertString(record.name ?? record["name"], `project-leads.leads[${index}].name`),
    phone: assertString(record.phone ?? record["phone"], `project-leads.leads[${index}].phone`, { allowEmpty: true }),
    createdAt: assertIsoDate(
      record.created_at ?? record["created_at"],
      `project-leads.leads[${index}].created_at`,
    ),
    source: assertString(record.source ?? record["source"], `project-leads.leads[${index}].source`),
    campaignName: assertString(
      record.campaign_name ?? record["campaign_name"],
      `project-leads.leads[${index}].campaign_name`,
    ),
    status: assertEnum(record.status ?? record["status"], `project-leads.leads[${index}].status`, LEAD_STATUSES),
    type: assertOptionalString(record.type ?? record["type"], `project-leads.leads[${index}].type`),
  };
};

export const parseProjectLeadsListRecord = (raw: unknown): ProjectLeadsListRecord => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("project-leads list payload must be an object");
  }
  const record = raw as Record<string, unknown>;
  const leads = record.leads ?? record["leads"];
  if (!Array.isArray(leads)) {
    throw new DataValidationError("project-leads.leads must be an array");
  }
  return {
    stats: parseStats(record.stats ?? record["stats"]),
    leads: leads.map((entry, index) => parseLeadSummary(entry, index)),
  };
};

export const parseLeadDetailRecord = (raw: unknown): LeadDetailRecord => {
  const summary = parseLeadSummary(raw, 0);
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("lead detail must be an object");
  }
  const record = raw as Record<string, unknown>;
  const metaRawValue = record.meta_raw ?? record["meta_raw"];
  if (metaRawValue != null && typeof metaRawValue !== "object") {
    throw new DataValidationError("project-lead.meta_raw must be an object if provided");
  }
  return {
    ...summary,
    adset: assertOptionalString(record.adset ?? record["adset"], "project-lead.adset"),
    ad: assertOptionalString(record.ad ?? record["ad"], "project-lead.ad"),
    metaRaw: (metaRawValue as Record<string, unknown>) ?? null,
  };
};

export const getProjectLeadsList = async (
  r2: R2Client,
  projectId: string,
): Promise<ProjectLeadsListRecord | null> => {
  const raw = await r2.getJson<Record<string, unknown>>(R2_KEYS.projectLeadsList(projectId));
  return raw ? parseProjectLeadsListRecord(raw) : null;
};

export const putProjectLeadsList = async (
  r2: R2Client,
  projectId: string,
  record: ProjectLeadsListRecord,
): Promise<void> => {
  await r2.putJson(R2_KEYS.projectLeadsList(projectId), {
    stats: {
      total: record.stats.total,
      today: record.stats.today,
    },
    leads: record.leads.map((lead) => ({
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      created_at: lead.createdAt,
      source: lead.source,
      campaign_name: lead.campaignName,
      status: lead.status,
      type: lead.type,
    })),
  });
};

export const getLeadDetailRecord = async (
  r2: R2Client,
  projectId: string,
  leadId: string,
): Promise<LeadDetailRecord> => {
  const raw = await r2.getJson<Record<string, unknown>>(R2_KEYS.projectLead(projectId, leadId));
  if (!raw) {
    throw new EntityNotFoundError("project lead", `${projectId}/${leadId}`);
  }
  return parseLeadDetailRecord(raw);
};

export const putLeadDetailRecord = async (
  r2: R2Client,
  projectId: string,
  lead: LeadDetailRecord,
): Promise<void> => {
  await r2.putJson(R2_KEYS.projectLead(projectId, lead.id), {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    created_at: lead.createdAt,
    source: lead.source,
    campaign_name: lead.campaignName,
    status: lead.status,
    type: lead.type,
    adset: lead.adset ?? null,
    ad: lead.ad ?? null,
    meta_raw: lead.metaRaw ?? null,
    project_id: projectId,
  });
};
