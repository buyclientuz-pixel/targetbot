import { getMetaToken } from "../domain/meta-tokens";
import { createLead, saveLead, type Lead } from "../domain/leads";
import type { KvClient } from "../infra/kv";
import type { R2Client } from "../infra/r2";
import { getProject, type Project } from "../domain/projects";
import { ensureProjectSettings, type ProjectSettings } from "../domain/project-settings";
import {
  fetchMetaLeads,
  isMetaRateLimitError,
  type MetaLeadFormDescriptor,
  type MetaLeadRecord,
} from "./meta-api";
import { markProjectLeadsSynced, mergeProjectLeadsList } from "./project-leads-list";
import { getLeadRetentionDays } from "../domain/config";
import { DataValidationError } from "../errors";
import { getProjectLeadsList } from "../domain/spec/project-leads";
import {
  DEFAULT_LEAD_FORM_CACHE_TTL_SECONDS,
  createMetaLeadFormCacheEntry,
  getMetaLeadFormCache,
  isMetaLeadFormCacheFresh,
  saveMetaLeadFormCache,
} from "../domain/meta-lead-forms";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const LEAD_SYNC_LIMIT = 400;
const LEAD_FORM_CACHE_TTL_SECONDS = DEFAULT_LEAD_FORM_CACHE_TTL_SECONDS;
const shouldKeepRecord = (record: MetaLeadRecord, cutoffTime: number): boolean => {
  if (!record.created_time) {
    return true;
  }
  const createdTime = Date.parse(record.created_time);
  if (!Number.isFinite(createdTime)) {
    return true;
  }
  return createdTime >= cutoffTime;
};

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

const requireFacebookUserId = (settings: ProjectSettings, provided?: string | null): string => {
  if (provided && provided.trim().length > 0) {
    return provided;
  }
  if (!settings.meta.facebookUserId) {
    throw new DataValidationError("Проекту не назначен Meta-аккаунт для лидов");
  }
  return settings.meta.facebookUserId;
};

const ensureProjectLeadSyncOptions = async (
  kv: KvClient,
  projectId: string,
  options?: Partial<ProjectLeadSyncOptions>,
): Promise<ProjectLeadSyncOptions> => {
  const project = options?.project ?? (await getProject(kv, projectId));
  if (!project.adsAccountId) {
    throw new DataValidationError("У проекта нет подключённого рекламного аккаунта Meta");
  }
  const settings = options?.settings ?? (await ensureProjectSettings(kv, projectId));
  const facebookUserId = requireFacebookUserId(settings, options?.facebookUserId);
  return { project, settings, facebookUserId };
};

export const syncProjectLeadsFromMeta = async (
  kv: KvClient,
  r2: R2Client,
  projectId: string,
  options: ProjectLeadSyncOptions,
): Promise<ProjectLeadSyncResult> => {
  if (!options.project.adsAccountId) {
    return { fetched: 0, stored: 0 };
  }
  const accountId = options.project.adsAccountId;
  const token = await getMetaToken(kv, options.facebookUserId);
  const retentionDays = await getLeadRetentionDays(kv, 30);
  const cutoffTime = Date.now() - retentionDays * DAY_IN_MS;
  const since = new Date(cutoffTime);
  let summary: Awaited<ReturnType<typeof getProjectLeadsList>> = null;
  try {
    summary = await getProjectLeadsList(r2, projectId);
  } catch (error) {
    console.warn(`[portal-sync] Failed to read lead summary for ${projectId}: ${(error as Error).message}`);
  }
  const hasStoredLeads = Boolean(summary && summary.leads.length > 0);
  const cacheEntry = await getMetaLeadFormCache(kv, accountId);
  let cachedForms = cacheEntry?.forms ?? [];
  let cacheFresh = cacheEntry ? isMetaLeadFormCacheFresh(cacheEntry) : false;
  const persistForms = async (forms: MetaLeadFormDescriptor[]): Promise<void> => {
    cachedForms = forms;
    cacheFresh = true;
    const entry = createMetaLeadFormCacheEntry(accountId, forms, LEAD_FORM_CACHE_TTL_SECONDS);
    await saveMetaLeadFormCache(kv, entry);
  };
  const fetchWithCache = async (sinceFilter?: Date): Promise<MetaLeadRecord[]> => {
    const useCachedForms = cacheFresh && cachedForms.length > 0;
    const attemptRefresh = !useCachedForms;
    const baseOptions = {
      accountId,
      accessToken: token.accessToken,
      limit: LEAD_SYNC_LIMIT,
      since: sinceFilter,
    };
    try {
      return await fetchMetaLeads({
        ...baseOptions,
        forms: useCachedForms ? cachedForms : undefined,
        onFormsRefreshed: attemptRefresh ? persistForms : undefined,
      });
    } catch (error) {
      if (!(attemptRefresh && isMetaRateLimitError(error) && cachedForms.length > 0)) {
        throw error;
      }
      console.warn(
        `[portal-sync] Rate limit while refreshing lead forms for ${projectId}: ${(error as Error).message}`,
      );
      return fetchMetaLeads({
        ...baseOptions,
        forms: cachedForms,
      });
    }
  };
  let rawLeads = await fetchWithCache(since);
  if (rawLeads.length === 0 && !hasStoredLeads) {
    rawLeads = await fetchWithCache();
  }
  const filteredLeads = rawLeads.filter((record) => shouldKeepRecord(record, cutoffTime));
  if (filteredLeads.length === 0) {
    await markProjectLeadsSynced(r2, projectId);
    return { fetched: 0, stored: 0 };
  }
  const created: Lead[] = [];
  for (const raw of filteredLeads) {
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
  return { fetched: filteredLeads.length, stored: created.length };
};

export const refreshProjectLeads = async (
  kv: KvClient,
  r2: R2Client,
  projectId: string,
  options?: Partial<ProjectLeadSyncOptions>,
): Promise<ProjectLeadSyncResult> => {
  const resolved = await ensureProjectLeadSyncOptions(kv, projectId, options);
  return syncProjectLeadsFromMeta(kv, r2, projectId, resolved);
};
