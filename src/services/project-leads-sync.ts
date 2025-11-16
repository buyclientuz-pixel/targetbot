import { getMetaToken } from "../domain/meta-tokens";
import { createLead, saveLead, type Lead } from "../domain/leads";
import type { KvClient } from "../infra/kv";
import type { R2Client } from "../infra/r2";
import type { Project } from "../domain/projects";
import type { ProjectSettings } from "../domain/project-settings";
import { fetchMetaLeads, type MetaLeadRecord } from "./meta-api";
import { mergeProjectLeadsList } from "./project-leads-list";
import { getLeadRetentionDays } from "../domain/config";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const LEAD_SYNC_LIMIT = 400;

const normaliseFieldName = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase();
};

const extractFieldValue = (record: MetaLeadRecord, keys: string[]): string | null => {
  const fields = Array.isArray(record.field_data) ? record.field_data : [];
  for (const key of keys) {
    const entry = fields.find((field) => normaliseFieldName(field.name) === key);
    if (!entry) {
      continue;
    }
    const values = Array.isArray(entry.values) ? entry.values : [];
    for (const raw of values) {
      if (typeof raw === "string" && raw.trim()) {
        return raw.trim();
      }
      if (raw && typeof raw === "object" && "value" in raw) {
        const value = (raw as Record<string, unknown>).value;
        if (typeof value === "string" && value.trim()) {
          return value.trim();
        }
      }
    }
  }
  return null;
};

const buildLeadFromMeta = (record: MetaLeadRecord, projectId: string): Lead => {
  const name =
    extractFieldValue(record, ["full_name", "name", "first_name"]) ??
    extractFieldValue(record, ["last_name"]) ??
    record.campaign_name ??
    null;
  const phone = extractFieldValue(record, ["phone_number", "phone", "phone_number_full"]);
  return createLead({
    id: record.id,
    projectId,
    name,
    phone,
    campaign: typeof record.campaign_name === "string" ? record.campaign_name : null,
    adset: typeof record.adset_name === "string" ? record.adset_name : null,
    ad: typeof record.ad_name === "string" ? record.ad_name : null,
    createdAt: record.created_time,
    metaRaw: record,
  });
};

export interface ProjectLeadSyncOptions {
  project: Project;
  settings: ProjectSettings;
  facebookUserId: string;
}

export interface ProjectLeadSyncResult {
  fetched: number;
  stored: number;
}

export const syncProjectLeadsFromMeta = async (
  kv: KvClient,
  r2: R2Client,
  projectId: string,
  options: ProjectLeadSyncOptions,
): Promise<ProjectLeadSyncResult> => {
  if (!options.project.adsAccountId) {
    return { fetched: 0, stored: 0 };
  }
  const token = await getMetaToken(kv, options.facebookUserId);
  const retentionDays = await getLeadRetentionDays(kv, 30);
  const since = new Date(Date.now() - retentionDays * DAY_IN_MS);
  const rawLeads = await fetchMetaLeads({
    accountId: options.project.adsAccountId,
    accessToken: token.accessToken,
    limit: LEAD_SYNC_LIMIT,
    since,
  });
  if (rawLeads.length === 0) {
    return { fetched: 0, stored: 0 };
  }
  const created: Lead[] = [];
  for (const raw of rawLeads) {
    try {
      created.push(buildLeadFromMeta(raw, projectId));
    } catch (error) {
      console.warn(`[portal-sync] Unable to parse Meta lead ${raw.id}: ${(error as Error).message}`);
    }
  }
  if (created.length > 0) {
    for (const lead of created) {
      try {
        await saveLead(r2, lead);
      } catch (error) {
        console.warn(`[portal-sync] Failed to persist lead ${lead.id}: ${(error as Error).message}`);
      }
    }
    await mergeProjectLeadsList(r2, projectId, created);
  }
  return { fetched: rawLeads.length, stored: created.length };
};
