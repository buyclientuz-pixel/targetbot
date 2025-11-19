import { DataValidationError } from "../errors";
import { ensureProjectSettings } from "../domain/project-settings";
import type { KvClient } from "../infra/kv";
import { requireProjectRecord } from "../domain/spec/project";
import { getMetaToken } from "../domain/meta-tokens";
import {
  getCachedMetaLeadForms,
  saveMetaLeadFormsCache,
  type MetaLeadFormsCacheRecord,
} from "../domain/meta-lead-forms-cache";
import type { Lead } from "../domain/leads";
import { fetchMetaLeads, type LeadGenFormDescriptor } from "./meta-api";
import { buildLeadFromMeta } from "./project-leads-sync";

export interface FetchLiveProjectLeadsOptions {
  since?: Date | null;
  accessTokenOverride?: string | null;
}

const requireFacebookUserId = (settings: Awaited<ReturnType<typeof ensureProjectSettings>>): string => {
  const facebookUserId = settings.meta.facebookUserId;
  if (facebookUserId && facebookUserId.trim().length > 0) {
    return facebookUserId;
  }
  throw new DataValidationError("Проекту не назначен Meta-аккаунт для лидов");
};

const loadCachedForms = async (
  kv: KvClient,
  projectId: string,
  accountId: string,
): Promise<{
  cachedForms: LeadGenFormDescriptor[];
  useCachedOnly: boolean;
}> => {
  let cachedLeadForms: MetaLeadFormsCacheRecord | null = null;
  try {
    cachedLeadForms = await getCachedMetaLeadForms(kv, projectId, accountId);
  } catch (error) {
    console.warn(
      `[portal-leads] Failed to read cached Meta lead forms for ${projectId}: ${(error as Error).message}`,
    );
  }
  const cachedForms: LeadGenFormDescriptor[] = (cachedLeadForms?.forms ?? []).map((form) => ({
    id: form.id,
    accessToken: form.accessToken ?? undefined,
  }));
  return { cachedForms, useCachedOnly: Boolean(cachedLeadForms && cachedForms.length > 0) };
};

const persistFormsCache = async (
  kv: KvClient,
  projectId: string,
  accountId: string,
  forms: LeadGenFormDescriptor[],
): Promise<void> => {
  if (forms.length === 0) {
    return;
  }
  const cacheEntry: MetaLeadFormsCacheRecord = {
    projectId,
    accountId,
    fetchedAt: new Date().toISOString(),
    forms: forms.map((form) => ({ id: form.id, accessToken: form.accessToken ?? null })),
  };
  try {
    await saveMetaLeadFormsCache(kv, cacheEntry);
  } catch (error) {
    console.warn(`[portal-leads] Failed to cache Meta lead forms for ${projectId}: ${(error as Error).message}`);
  }
};

const resolveLeadAccessToken = async (
  kv: KvClient,
  projectId: string,
  overrideToken?: string | null,
): Promise<{ token: string }> => {
  const trimmed = overrideToken?.trim();
  if (trimmed) {
    return { token: trimmed };
  }
  const settings = await ensureProjectSettings(kv, projectId);
  const facebookUserId = requireFacebookUserId(settings);
  const token = await getMetaToken(kv, facebookUserId);
  return { token: token.accessToken };
};

export const fetchLiveProjectLeads = async (
  kv: KvClient,
  projectId: string,
  options: FetchLiveProjectLeadsOptions = {},
): Promise<Lead[]> => {
  const projectRecord = await requireProjectRecord(kv, projectId);
  if (!projectRecord.adAccountId) {
    throw new DataValidationError("У проекта нет подключённого рекламного аккаунта Meta");
  }
  const { token } = await resolveLeadAccessToken(kv, projectId, options.accessTokenOverride);
  const { cachedForms, useCachedOnly } = await loadCachedForms(kv, projectId, projectRecord.adAccountId);
  const leadFetchOptions = {
    accountId: projectRecord.adAccountId,
    accessToken: token,
    since: options.since ?? undefined,
    cachedForms,
    useCachedFormsOnly: useCachedOnly,
    onFormsEnumerated: (forms: LeadGenFormDescriptor[]) => persistFormsCache(kv, projectId, projectRecord.adAccountId!, forms),
  } satisfies Parameters<typeof fetchMetaLeads>[0];
  let rawLeads = await fetchMetaLeads(leadFetchOptions);
  if (useCachedOnly && rawLeads.length === 0) {
    rawLeads = await fetchMetaLeads({ ...leadFetchOptions, useCachedFormsOnly: false });
  }
  const leads: Lead[] = [];
  for (const raw of rawLeads) {
    try {
      const lead = buildLeadFromMeta(raw, projectId);
      if (lead) {
        leads.push(lead);
      }
    } catch (error) {
      console.warn(`[portal-leads] Unable to parse Meta lead ${raw.id}: ${(error as Error).message}`);
    }
  }
  return leads;
};
