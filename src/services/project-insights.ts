import { createMetaCacheEntry, getMetaCache, isMetaCacheEntryFresh, saveMetaCache } from "../domain/meta-cache";
import type { MetaCacheEntry, MetaCachePeriod } from "../domain/meta-cache";
import { getMetaToken } from "../domain/meta-tokens";
import { ensureProjectSettings, type ProjectSettings } from "../domain/project-settings";
import { getProject, type Project } from "../domain/projects";
import { type MetaSummaryPayload } from "../domain/meta-summary";
import type { KvClient } from "../infra/kv";
import {
  fetchMetaInsights,
  fetchMetaInsightsRaw,
  fetchMetaCampaignStatuses,
  resolveDatePreset,
  summariseMetaInsights,
  countLeadsFromActions,
} from "./meta-api";
import { DataValidationError } from "../errors";
import type { MetaInsightsRawResponse } from "./meta-api";

type SummaryInsightsEntry = MetaCacheEntry<Awaited<ReturnType<typeof fetchMetaInsights>>>;

type CampaignInsightsEntry = MetaCacheEntry<MetaInsightsRawResponse>;

interface CampaignStatusPayload {
  campaigns: CampaignStatus[];
}

type CampaignStatusEntry = MetaCacheEntry<CampaignStatusPayload>;

const CACHE_TTL_SECONDS = 60;
const CAMPAIGN_STATUS_TTL_SECONDS = 300;

const toIsoDate = (date: Date): string => date.toISOString().split("T")[0] ?? date.toISOString();

const startOfDay = (date: Date): Date => {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
};

const endOfDay = (date: Date): Date => {
  const copy = new Date(date);
  copy.setUTCHours(23, 59, 59, 999);
  return copy;
};

const addDays = (date: Date, days: number): Date => {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
};

export interface PeriodRange {
  key: string;
  from: Date;
  to: Date;
  period: MetaCachePeriod;
}

export const resolvePeriodRange = (periodKey: string): PeriodRange => {
  const now = new Date();
  const today = startOfDay(now);
  switch (periodKey) {
    case "today": {
      const from = today;
      const to = endOfDay(today);
      return { key: periodKey, from, to, period: { from: toIsoDate(from), to: toIsoDate(from) } };
    }
    case "yesterday": {
      const from = startOfDay(addDays(today, -1));
      const to = endOfDay(from);
      return { key: periodKey, from, to, period: { from: toIsoDate(from), to: toIsoDate(from) } };
    }
    case "week": {
      const from = startOfDay(addDays(today, -6));
      const to = endOfDay(today);
      return { key: periodKey, from, to, period: { from: toIsoDate(from), to: toIsoDate(today) } };
    }
    case "month": {
      const from = startOfDay(addDays(today, -29));
      const to = endOfDay(today);
      return { key: periodKey, from, to, period: { from: toIsoDate(from), to: toIsoDate(today) } };
    }
    case "max": {
      const from = startOfDay(new Date(0));
      const to = endOfDay(today);
      return { key: periodKey, from, to, period: { from: toIsoDate(from), to: toIsoDate(today) } };
    }
    default:
      return resolvePeriodRange("today");
  }
};

const resolveFacebookUserId = (settings: ProjectSettings, provided?: string | null): string => {
  if (provided && provided.trim().length > 0) {
    return provided;
  }
  const value = settings.meta.facebookUserId;
  if (!value) {
    throw new DataValidationError("Project meta.facebookUserId is not configured");
  }
  return value;
};

const ensureInsightsEntry = async (
  kv: KvClient,
  projectId: string,
  scope: string,
  periodKey: string,
  project: Project,
  accessToken: string,
): Promise<SummaryInsightsEntry> => {
  const cached = await getMetaCache<Awaited<ReturnType<typeof fetchMetaInsights>>>(kv, projectId, scope);
  if (cached && isMetaCacheEntryFresh(cached)) {
    return cached;
  }
  const result = await fetchMetaInsights({
    accountId: project.adsAccountId!,
    accessToken,
    period: resolveDatePreset(periodKey),
  });
  const range = resolvePeriodRange(periodKey);
  const entry = createMetaCacheEntry(projectId, scope, range.period, result, CACHE_TTL_SECONDS);
  await saveMetaCache(kv, entry);
  return entry;
};

export const loadProjectSummary = async (
  kv: KvClient,
  projectId: string,
  periodKey: string,
  options?: { project?: Project; settings?: ProjectSettings; facebookUserId?: string | null },
): Promise<{ entry: MetaCacheEntry<MetaSummaryPayload>; project: Project; settings: ProjectSettings }> => {
  const project = options?.project ?? (await getProject(kv, projectId));
  const settings = options?.settings ?? (await ensureProjectSettings(kv, projectId));

  if (!project.adsAccountId) {
    throw new DataValidationError("Project is missing adsAccountId for Meta insights");
  }

  const summaryScope = `summary:${periodKey}`;
  const cachedSummary = await getMetaCache<MetaSummaryPayload>(kv, projectId, summaryScope);
  if (cachedSummary && isMetaCacheEntryFresh(cachedSummary)) {
    return { entry: cachedSummary, project, settings };
  }

  const facebookUserId = resolveFacebookUserId(settings, options?.facebookUserId);

  const token = await getMetaToken(kv, facebookUserId);

  const requestedInsights = await ensureInsightsEntry(
    kv,
    projectId,
    `insights:${periodKey}`,
    periodKey,
    project,
    token.accessToken,
  );
  const lifetimeInsights = await ensureInsightsEntry(
    kv,
    projectId,
    "insights:max",
    "max",
    project,
    token.accessToken,
  );
  const todayInsights =
    periodKey === "today"
      ? requestedInsights
      : await ensureInsightsEntry(kv, projectId, "insights:today", "today", project, token.accessToken);

  const metrics = {
    spend: requestedInsights.payload.summary.spend,
    impressions: requestedInsights.payload.summary.impressions,
    clicks: requestedInsights.payload.summary.clicks,
    leads: requestedInsights.payload.summary.leads,
    leadsToday: todayInsights.payload.summary.leads,
    leadsTotal: lifetimeInsights.payload.summary.leads,
    cpa:
      requestedInsights.payload.summary.leads > 0
        ? requestedInsights.payload.summary.spend / requestedInsights.payload.summary.leads
        : null,
    spendToday: todayInsights.payload.summary.spend,
    cpaToday:
      todayInsights.payload.summary.leads > 0
        ? todayInsights.payload.summary.spend / todayInsights.payload.summary.leads
        : null,
  } satisfies MetaSummaryPayload["metrics"];

  const periodRange = resolvePeriodRange(periodKey);
  const summaryEntry = createMetaCacheEntry<MetaSummaryPayload>(
    projectId,
    summaryScope,
    periodRange.period,
    {
      periodKey,
      metrics,
      source: requestedInsights.payload.raw,
    },
    CACHE_TTL_SECONDS,
  );
  await saveMetaCache(kv, summaryEntry);
  return { entry: summaryEntry, project, settings };
};

export const loadProjectCampaigns = async (
  kv: KvClient,
  projectId: string,
  periodKey: string,
  options?: { project?: Project; settings?: ProjectSettings; facebookUserId?: string | null },
): Promise<{ entry: CampaignInsightsEntry; project: Project; settings: ProjectSettings }> => {
  const project = options?.project ?? (await getProject(kv, projectId));
  const settings = options?.settings ?? (await ensureProjectSettings(kv, projectId));

  if (!project.adsAccountId) {
    throw new DataValidationError("Project is missing adsAccountId for Meta insights");
  }

  const scope = `campaigns:${periodKey}`;
  const cached = await getMetaCache<MetaInsightsRawResponse>(kv, projectId, scope);
  if (cached && isMetaCacheEntryFresh(cached)) {
    return { entry: cached, project, settings };
  }

  const facebookUserId = resolveFacebookUserId(settings, options?.facebookUserId);

  const token = await getMetaToken(kv, facebookUserId);
  const raw = await fetchMetaInsightsRaw({
    accountId: project.adsAccountId,
    accessToken: token.accessToken,
    period: resolveDatePreset(periodKey),
    level: "campaign",
    fields: ["campaign_id", "campaign_name", "spend", "impressions", "clicks", "actions"].join(","),
  });
  const periodRange = resolvePeriodRange(periodKey);
  const entry = createMetaCacheEntry(projectId, scope, periodRange.period, raw, CACHE_TTL_SECONDS);
  await saveMetaCache(kv, entry);
  return { entry, project, settings };
};

export interface CampaignRow {
  id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpa: number | null;
}

export const mapCampaignRows = (raw: MetaInsightsRawResponse): CampaignRow[] => {
  return (raw.data ?? []).map((item) => {
    const record = item as Record<string, unknown>;
    const id = typeof record.campaign_id === "string" ? record.campaign_id : "unknown";
    const name = typeof record.campaign_name === "string" ? record.campaign_name : "Без названия";
    const summary = summariseMetaInsights({ data: [record] });
    const spend = summary.spend;
    const impressions = summary.impressions;
    const clicks = summary.clicks;
    const leads = countLeadsFromActions(record.actions);
    const cpa = leads > 0 ? spend / leads : null;
    return { id, name, spend, impressions, clicks, leads, cpa };
  });
};

const parseBudget = (value: unknown): number | null => {
  if (value == null) {
    return null;
  }
  const numeric = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
  if (Number.isNaN(numeric)) {
    return null;
  }
  return numeric / 100;
};

const parseIsoDate = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
};

export interface CampaignStatus {
  id: string;
  name: string;
  status: string | null;
  effectiveStatus: string | null;
  dailyBudget: number | null;
  budgetRemaining: number | null;
  updatedTime: string | null;
}

const mapCampaignStatus = (record: Record<string, unknown>): CampaignStatus => {
  const id = typeof record.id === "string" ? record.id : String(record.id ?? "unknown");
  const name = typeof record.name === "string" && record.name.trim().length > 0 ? record.name : "Без названия";
  const status = typeof record.status === "string" ? record.status : null;
  const effectiveStatus = typeof record.effective_status === "string" ? record.effective_status : status;
  const dailyBudget = parseBudget(record.daily_budget);
  const budgetRemaining = parseBudget(record.budget_remaining ?? record.lifetime_budget);
  const updatedTime = parseIsoDate(record.updated_time);

  return { id, name, status, effectiveStatus, dailyBudget, budgetRemaining, updatedTime };
};

export interface PortalSummaryResponse {
  project: Project;
  settings: ProjectSettings;
  entry: MetaCacheEntry<MetaSummaryPayload>;
}

export interface PortalCampaignsResponse {
  project: Project;
  settings: ProjectSettings;
  entry: CampaignInsightsEntry;
}

export interface CampaignStatusResponse {
  project: Project;
  settings: ProjectSettings;
  entry: CampaignStatusEntry;
}

export const loadProjectCampaignStatuses = async (
  kv: KvClient,
  projectId: string,
  options?: { project?: Project; settings?: ProjectSettings; facebookUserId?: string | null },
): Promise<CampaignStatusResponse> => {
  const project = options?.project ?? (await getProject(kv, projectId));
  const settings = options?.settings ?? (await ensureProjectSettings(kv, projectId));

  if (!project.adsAccountId) {
    throw new DataValidationError("Project is missing adsAccountId for Meta insights");
  }

  const scope = "campaign-status";
  const cached = await getMetaCache<CampaignStatusPayload>(kv, projectId, scope);
  if (cached && isMetaCacheEntryFresh(cached)) {
    return { entry: cached, project, settings };
  }

  const facebookUserId = resolveFacebookUserId(settings, options?.facebookUserId);

  const token = await getMetaToken(kv, facebookUserId);
  const rawCampaigns = await fetchMetaCampaignStatuses(project.adsAccountId, token.accessToken);
  const campaigns = rawCampaigns.map((record) => mapCampaignStatus(record));

  const todayIso = toIsoDate(new Date());
  const entry = createMetaCacheEntry<CampaignStatusPayload>(
    projectId,
    scope,
    { from: todayIso, to: todayIso },
    { campaigns },
    CAMPAIGN_STATUS_TTL_SECONDS,
  );
  await saveMetaCache(kv, entry);
  return { entry, project, settings };
};
