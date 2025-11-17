import { getMetaToken } from "../domain/meta-tokens";
import { createLead, deleteLead, listLeads, saveLead, type Lead } from "../domain/leads";
import type { KvClient } from "../infra/kv";
import type { R2Client } from "../infra/r2";
import { getProject, putProject, type Project } from "../domain/projects";
import { ensureProjectSettings, type ProjectSettings } from "../domain/project-settings";
import { fetchMetaLeads, type LeadGenFormDescriptor, type MetaLeadRecord } from "./meta-api";
import { markProjectLeadsSynced, mergeProjectLeadsList, rewriteProjectLeadsList } from "./project-leads-list";
import { getLeadRetentionDays } from "../domain/config";
import { DataValidationError } from "../errors";
import { requireProjectRecord, type ProjectRecord } from "../domain/spec/project";
import {
  getCachedMetaLeadForms,
  saveMetaLeadFormsCache,
  type MetaLeadFormsCacheRecord,
} from "../domain/meta-lead-forms-cache";
import {
  getProjectLeadSyncState,
  saveProjectLeadSyncState,
  type ProjectLeadSyncState,
} from "../domain/project-lead-sync-state";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const LEAD_SYNC_LIMIT = 400;
const LEAD_SYNC_LOOKBACK_MS = 15 * 60 * 1000;

const pruneExpiredProjectLeads = async (
  r2: R2Client,
  projectId: string,
  retentionDays: number,
): Promise<void> => {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    return;
  }
  const cutoff = Date.now() - retentionDays * DAY_IN_MS;
  const leads = await listLeads(r2, projectId);
  if (leads.length === 0) {
    return;
  }
  const expired = leads.filter((lead) => {
    const createdAt = Date.parse(lead.createdAt);
    return Number.isFinite(createdAt) && createdAt < cutoff;
  });
  if (expired.length === 0) {
    return;
  }
  for (const lead of expired) {
    await deleteLead(r2, projectId, lead.id);
  }
  const expiredIds = new Set(expired.map((lead) => lead.id));
  const remaining = leads.filter((lead) => !expiredIds.has(lead.id));
  await rewriteProjectLeadsList(r2, projectId, remaining);
};

const normaliseFieldName = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .normalize("NFKD")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04FF]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

const buildLeadFromMeta = (record: MetaLeadRecord, projectId: string): Lead | null => {
  const name =
    extractFieldValue(record, ["full_name", "name", "first_name"]) ??
    extractFieldValue(record, ["last_name"]) ??
    record.campaign_name ??
    null;
  const phone = extractFieldValue(record, ["phone_number", "phone", "phone_number_full"]);
  const email = extractFieldValue(record, ["email", "email_address", "emailaddress", "contact_email"]);
  const message =
    extractFieldValue(record, ["message", "сообщение", "comment", "text", "feedback", "notes"]) ?? null;
  return createLead({
    id: record.id,
    projectId,
    name,
    phone,
    contact: phone ?? email ?? (message ? "сообщение" : undefined),
    message,
    campaign: typeof record.campaign_name === "string" ? record.campaign_name : null,
    campaignId: typeof record.campaign_id === "string" ? record.campaign_id : null,
    adset: typeof record.adset_name === "string" ? record.adset_name : null,
    ad: typeof record.ad_name === "string" ? record.ad_name : null,
    formId: typeof record.form_id === "string" ? record.form_id : null,
    createdAt: record.created_time,
    metaRaw: record,
  });
};

const resolveLeadSyncSince = (
  retentionDays: number,
  state: ProjectLeadSyncState | null,
): Date => {
  const retentionSinceMs = Date.now() - Math.max(retentionDays, 1) * DAY_IN_MS;
  if (!state?.lastLeadCreatedAt) {
    return new Date(retentionSinceMs);
  }
  const lastLeadTime = Date.parse(state.lastLeadCreatedAt);
  if (!Number.isFinite(lastLeadTime)) {
    return new Date(retentionSinceMs);
  }
  const buffered = Math.max(lastLeadTime - LEAD_SYNC_LOOKBACK_MS, retentionSinceMs);
  const clamped = Math.min(buffered, Date.now());
  return new Date(clamped);
};

const pickLatestLeadTimestamp = (current: string | null, leads: Lead[]): string | null => {
  let latest = current ?? null;
  for (const lead of leads) {
    if (!lead.createdAt) {
      continue;
    }
    if (!latest || lead.createdAt > latest) {
      latest = lead.createdAt;
    }
  }
  return latest;
};

const persistLeadSyncState = async (
  kv: KvClient,
  projectId: string,
  previous: ProjectLeadSyncState | null,
  storedLeads: Lead[],
): Promise<void> => {
  const nextState: ProjectLeadSyncState = {
    projectId,
    lastLeadCreatedAt: pickLatestLeadTimestamp(previous?.lastLeadCreatedAt ?? null, storedLeads),
    lastSyncAt: new Date().toISOString(),
  };
  try {
    await saveProjectLeadSyncState(kv, nextState);
  } catch (error) {
    console.warn(
      `[portal-sync] Failed to persist lead sync state for ${projectId}: ${(error as Error).message}`,
    );
  }
};

export interface ProjectLeadSyncOptions {
  project: Project;
  settings: ProjectSettings;
  facebookUserId: string;
  projectRecord: ProjectRecord;
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
  const projectRecord = options?.projectRecord ?? (await requireProjectRecord(kv, projectId));
  let project = options?.project ?? (await getProject(kv, projectId));
  const resolvedAccountId = project.adsAccountId ?? projectRecord.adAccountId ?? null;
  if (!resolvedAccountId) {
    throw new DataValidationError("У проекта нет подключённого рекламного аккаунта Meta");
  }
  if (project.adsAccountId !== resolvedAccountId) {
    project = { ...project, adsAccountId: resolvedAccountId };
    try {
      await putProject(kv, project);
    } catch (error) {
      console.warn(
        `[portal-sync] Failed to backfill project account id for ${projectId}: ${(error as Error).message}`,
      );
    }
  }
  const settings = options?.settings ?? (await ensureProjectSettings(kv, projectId));
  const facebookUserId = requireFacebookUserId(settings, options?.facebookUserId);
  return { project, settings, facebookUserId, projectRecord };
};

export const syncProjectLeadsFromMeta = async (
  kv: KvClient,
  r2: R2Client,
  projectId: string,
  options: ProjectLeadSyncOptions,
): Promise<ProjectLeadSyncResult> => {
  const accountId = options.project.adsAccountId ?? options.projectRecord.adAccountId;
  if (!accountId) {
    return { fetched: 0, stored: 0 };
  }
  let cachedLeadForms: MetaLeadFormsCacheRecord | null = null;
  try {
    cachedLeadForms = await getCachedMetaLeadForms(kv, projectId, accountId);
  } catch (error) {
    console.warn(
      `[portal-sync] Failed to read cached Meta lead forms for project ${projectId}: ${(error as Error).message}`,
    );
  }
  const cachedForms: LeadGenFormDescriptor[] = (cachedLeadForms?.forms ?? []).map((form) => ({
    id: form.id,
    accessToken: form.accessToken ?? undefined,
  }));
  const useCachedFormsOnly = Boolean(cachedLeadForms && cachedForms.length > 0);
  const token = await getMetaToken(kv, options.facebookUserId);
  const retentionDays = await getLeadRetentionDays(kv, 30);
  let leadSyncState: ProjectLeadSyncState | null = null;
  try {
    leadSyncState = await getProjectLeadSyncState(kv, projectId);
  } catch (error) {
    console.warn(
      `[portal-sync] Failed to read lead sync state for ${projectId}: ${(error as Error).message}`,
    );
  }
  const since = resolveLeadSyncSince(retentionDays, leadSyncState);
  const leadFetchOptions = {
    accountId,
    accessToken: token.accessToken,
    limit: LEAD_SYNC_LIMIT,
    since,
    cachedForms,
    useCachedFormsOnly,
    onFormsEnumerated: async (forms) => {
      const cacheEntry: MetaLeadFormsCacheRecord = {
        projectId,
        accountId,
        fetchedAt: new Date().toISOString(),
        forms: forms.map((form) => ({ id: form.id, accessToken: form.accessToken ?? null })),
      };
      try {
        await saveMetaLeadFormsCache(kv, cacheEntry);
      } catch (error) {
        console.warn(
          `[portal-sync] Failed to cache Meta lead forms for project ${projectId}: ${(error as Error).message}`,
        );
      }
    },
  } satisfies Parameters<typeof fetchMetaLeads>[0];
  let rawLeads = await fetchMetaLeads(leadFetchOptions);
  if (useCachedFormsOnly && rawLeads.length === 0) {
    console.warn(
      `[portal-sync] Cached Meta lead forms for project ${projectId} produced no leads, retrying with enumeration`,
    );
    rawLeads = await fetchMetaLeads({ ...leadFetchOptions, useCachedFormsOnly: false });
  }
  const prune = async () => {
    try {
      await pruneExpiredProjectLeads(r2, projectId, retentionDays);
    } catch (error) {
      console.warn(`[portal-sync] Failed to prune expired leads for ${projectId}: ${(error as Error).message}`);
    }
  };
  if (rawLeads.length === 0) {
    await markProjectLeadsSynced(r2, projectId);
    await prune();
    await persistLeadSyncState(kv, projectId, leadSyncState, []);
    return { fetched: 0, stored: 0 };
  }
  const storedLeads: Lead[] = [];
  for (const raw of rawLeads) {
    let lead: Lead | null = null;
    try {
      lead = buildLeadFromMeta(raw, projectId);
    } catch (error) {
      console.warn(`[portal-sync] Unable to parse Meta lead ${raw.id}: ${(error as Error).message}`);
      continue;
    }
    if (!lead) {
      continue;
    }
    try {
      const persisted = await saveLead(r2, lead);
      if (persisted) {
        storedLeads.push(lead);
      }
    } catch (error) {
      console.warn(`[portal-sync] Failed to persist lead ${lead.id}: ${(error as Error).message}`);
    }
  }
  if (storedLeads.length > 0) {
    await mergeProjectLeadsList(r2, projectId, storedLeads);
  }
  await prune();
  await persistLeadSyncState(kv, projectId, leadSyncState, storedLeads);
  return { fetched: rawLeads.length, stored: storedLeads.length };
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
