import { createMetaCacheEntry, getMetaCache, isMetaCacheEntryFresh, saveMetaCache } from "../domain/meta-cache";
import type { MetaCacheEntry, MetaCachePeriod } from "../domain/meta-cache";
import { getMetaToken } from "../domain/meta-tokens";
import { ensureProjectSettings, type ProjectSettings } from "../domain/project-settings";
import { getProject, type Project } from "../domain/projects";
import { requireProjectRecord, type ProjectRecord } from "../domain/spec/project";
import { type MetaSummaryPayload } from "../domain/meta-summary";
import type { MetaInsightsSummary } from "./meta-api";
import { putMetaCampaignsDocument, type MetaCampaignsDocument } from "../domain/spec/meta-campaigns";
import type { KpiType } from "../domain/spec/project";
import type { KvClient } from "../infra/kv";
import type { R2Client } from "../infra/r2";
import {
  fetchMetaInsights,
  fetchMetaInsightsRaw,
  fetchMetaCampaignStatuses,
  resolveDatePreset,
  summariseMetaInsights,
} from "./meta-api";
import { formatDateOnly } from "./period-range";
import { DataValidationError } from "../errors";
import type { MetaInsightsPeriod, MetaInsightsRawResponse } from "./meta-api";

type SummaryInsightsEntry = MetaCacheEntry<Awaited<ReturnType<typeof fetchMetaInsights>>>;

type CampaignInsightsEntry = MetaCacheEntry<MetaInsightsRawResponse>;

interface CampaignStatusPayload {
  campaigns: CampaignStatus[];
}

type CampaignStatusEntry = MetaCacheEntry<CampaignStatusPayload>;

const CACHE_TTL_SECONDS = 600;
const CAMPAIGN_STATUS_TTL_SECONDS = 300;

const toIsoDate = (date: Date): string => date.toISOString().split("T")[0] ?? date.toISOString();

const startOfDay = (date: Date): Date => {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
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

const normaliseTimeZone = (timeZone?: string | null): string | null => {
  if (!timeZone) {
    return null;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return null;
  }
};

const zonedPartsFormatter = (timeZone: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const extractZonedParts = (date: Date, timeZone: string): Record<string, number> => {
  const formatter = zonedPartsFormatter(timeZone);
  const parts = formatter.formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value] as const));
  const numeric = (type: Intl.DateTimeFormatPartTypes): number => Number.parseInt(map.get(type) ?? "0", 10);
  return {
    year: numeric("year"),
    month: numeric("month"),
    day: numeric("day"),
    hour: numeric("hour"),
    minute: numeric("minute"),
    second: numeric("second"),
  };
};

const resolveZoneOffset = (date: Date, timeZone: string) => {
  const parts = extractZonedParts(date, timeZone);
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0);
  const offsetMs = localAsUtc - date.getTime();
  return { parts, offsetMs };
};

const formatZonedDate = (date: Date, timeZone: string | null): string => {
  if (!timeZone) {
    return toIsoDate(date);
  }
  const parts = extractZonedParts(date, timeZone);
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
};

const startOfDayWithZone = (date: Date, timeZone: string | null): Date => {
  if (!timeZone) {
    return startOfDay(date);
  }
  const { parts, offsetMs } = resolveZoneOffset(date, timeZone);
  const utcTime = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0) - offsetMs;
  return new Date(utcTime);
};

const buildPeriodRange = (
  key: string,
  from: Date,
  to: Date,
  timeZone: string | null,
): PeriodRange => ({
  key,
  from,
  to,
  period: { from: formatZonedDate(from, timeZone), to: formatZonedDate(to, timeZone) },
});

export const resolvePeriodRange = (
  periodKey: string,
  timeZone?: string | null,
  options?: { now?: Date },
): PeriodRange => {
  const normalised = periodKey === "max" ? "all" : periodKey;
  const tz = normaliseTimeZone(timeZone);
  const now = options?.now ?? new Date();
  const todayStart = startOfDayWithZone(now, tz);
  switch (normalised) {
    case "today": {
      const to = startOfDayWithZone(addDays(todayStart, 1), tz);
      return buildPeriodRange(normalised, todayStart, to, tz);
    }
    case "yesterday": {
      const from = startOfDayWithZone(addDays(todayStart, -1), tz);
      const to = startOfDayWithZone(todayStart, tz);
      return buildPeriodRange(normalised, from, to, tz);
    }
    case "previous": {
      const from = startOfDayWithZone(addDays(todayStart, -2), tz);
      const to = startOfDayWithZone(addDays(todayStart, -1), tz);
      return buildPeriodRange(normalised, from, to, tz);
    }
    case "week": {
      const from = startOfDayWithZone(addDays(todayStart, -6), tz);
      const to = startOfDayWithZone(addDays(todayStart, 1), tz);
      return buildPeriodRange(normalised, from, to, tz);
    }
    case "month": {
      const from = startOfDayWithZone(addDays(todayStart, -29), tz);
      const to = startOfDayWithZone(addDays(todayStart, 1), tz);
      return buildPeriodRange(normalised, from, to, tz);
    }
    case "all": {
      const from = startOfDayWithZone(new Date(0), tz);
      const to = startOfDayWithZone(addDays(todayStart, 1), tz);
      return buildPeriodRange(normalised, from, to, tz);
    }
    default:
      return resolvePeriodRange("today", tz);
  }
};

export const resolveDatePresetForProject = (
  project: { settings: { timezone?: string | null } },
  preset: string,
  options?: { now?: Date },
): { fromUtc: Date; toUtc: Date; label: string; period: PeriodRange["period"] } => {
  const timezone = project.settings.timezone ?? null;
  const range = resolvePeriodRange(preset, timezone, options);
  return { fromUtc: range.from, toUtc: range.to, label: preset, period: range.period };
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

const resolveCustomMetaPeriod = (periodRange: PeriodRange): MetaInsightsPeriod => ({
  preset: "time_range",
  from: periodRange.period.from,
  to: periodRange.period.to,
});

const resolveInsightsKpiValue = (summary: MetaInsightsSummary, kpiType: KpiType): number => {
  switch (kpiType) {
    case "MESSAGE":
      return summary.messages;
    case "CLICK":
      return summary.clicks;
    case "VIEW":
      return summary.impressions;
    case "PURCHASE":
      return summary.leads;
    case "LEAD":
    default:
      return summary.leads;
  }
};

const buildScopedCacheKey = (
  base: string,
  periodKey: string,
  periodRange: PeriodRange,
  options?: { forceScoped?: boolean },
): string => {
  if (options?.forceScoped || periodKey === "custom") {
    return `${base}:${periodRange.period.from}:${periodRange.period.to}`;
  }
  return base;
};

const ensureInsightsEntry = async (
  kv: KvClient,
  projectId: string,
  scope: string,
  periodKey: string,
  project: Project,
  accessToken: string,
  timeZone?: string | null,
  periodRange?: PeriodRange,
): Promise<SummaryInsightsEntry> => {
  const resolvedRange = periodRange ?? resolvePeriodRange(periodKey, timeZone);
  const cached = await getMetaCache<Awaited<ReturnType<typeof fetchMetaInsights>>>(kv, projectId, scope);
  if (cached && isMetaCacheEntryFresh(cached)) {
    return cached;
  }
  const result = await fetchMetaInsights({
    accountId: project.adsAccountId!,
    accessToken,
    period: periodRange ? resolveCustomMetaPeriod(resolvedRange) : resolveDatePreset(periodKey),
  });
  const entry = createMetaCacheEntry(projectId, scope, resolvedRange.period, result, CACHE_TTL_SECONDS);
  await saveMetaCache(kv, entry);
  return entry;
};

export const loadProjectSummary = async (
  kv: KvClient,
  projectId: string,
  periodKey: string,
  options?: {
    project?: Project;
    settings?: ProjectSettings;
    facebookUserId?: string | null;
    periodRange?: PeriodRange;
    forceCacheScope?: boolean;
    projectRecord?: ProjectRecord;
  },
): Promise<{ entry: MetaCacheEntry<MetaSummaryPayload>; project: Project; settings: ProjectSettings }> => {
  const project = options?.project ?? (await getProject(kv, projectId));
  const settings = options?.settings ?? (await ensureProjectSettings(kv, projectId));
  const projectRecord = options?.projectRecord ?? (await requireProjectRecord(kv, projectId));

  if (!project.adsAccountId) {
    throw new DataValidationError("Project is missing adsAccountId for Meta insights");
  }

  const periodRange = options?.periodRange ?? resolvePeriodRange(periodKey, settings.timezone);
  const shouldScope = Boolean(options?.forceCacheScope || periodRange.key === "custom");
  const summaryScope = buildScopedCacheKey(`summary:${periodKey}`, periodKey, periodRange, { forceScoped: shouldScope });
  const cachedSummary = await getMetaCache<MetaSummaryPayload>(kv, projectId, summaryScope);
  if (cachedSummary && isMetaCacheEntryFresh(cachedSummary)) {
    return { entry: cachedSummary, project, settings };
  }

  const facebookUserId = resolveFacebookUserId(settings, options?.facebookUserId);

  const token = await getMetaToken(kv, facebookUserId);

  const requestedInsightsScope = buildScopedCacheKey(`insights:${periodKey}`, periodKey, periodRange, {
    forceScoped: shouldScope,
  });
  const requestedInsights = await ensureInsightsEntry(
    kv,
    projectId,
    requestedInsightsScope,
    periodKey,
    project,
    token.accessToken,
    settings.timezone,
    periodRange,
  );
  const lifetimeInsights = await ensureInsightsEntry(
    kv,
    projectId,
    "insights:all",
    "all",
    project,
    token.accessToken,
    settings.timezone,
  );
  const todayInsights =
    periodKey === "today"
      ? requestedInsights
      : await ensureInsightsEntry(
          kv,
          projectId,
          "insights:today",
          "today",
          project,
          token.accessToken,
          settings.timezone,
        );

  const periodKpiValue = resolveInsightsKpiValue(requestedInsights.payload.summary, projectRecord.settings.kpi.type);
  const todayKpiValue = resolveInsightsKpiValue(todayInsights.payload.summary, projectRecord.settings.kpi.type);

  const metrics = {
    spend: requestedInsights.payload.summary.spend,
    impressions: requestedInsights.payload.summary.impressions,
    clicks: requestedInsights.payload.summary.clicks,
    leads: requestedInsights.payload.summary.leads,
    messages: requestedInsights.payload.summary.messages,
    purchases: requestedInsights.payload.summary.purchases,
    addToCart: requestedInsights.payload.summary.addToCart,
    calls: requestedInsights.payload.summary.calls,
    registrations: requestedInsights.payload.summary.registrations,
    engagement: requestedInsights.payload.summary.engagement,
    leadsToday: todayInsights.payload.summary.leads,
    messagesToday: todayInsights.payload.summary.messages,
    leadsTotal: lifetimeInsights.payload.summary.leads,
    cpa: periodKpiValue > 0 ? requestedInsights.payload.summary.spend / periodKpiValue : null,
    spendToday: todayInsights.payload.summary.spend,
    cpaToday: todayKpiValue > 0 ? todayInsights.payload.summary.spend / todayKpiValue : null,
  } satisfies MetaSummaryPayload["metrics"];

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
  options?: {
    project?: Project;
    settings?: ProjectSettings;
    facebookUserId?: string | null;
    periodRange?: PeriodRange;
    forceCacheScope?: boolean;
  },
): Promise<{ entry: CampaignInsightsEntry; project: Project; settings: ProjectSettings }> => {
  const project = options?.project ?? (await getProject(kv, projectId));
  const settings = options?.settings ?? (await ensureProjectSettings(kv, projectId));

  if (!project.adsAccountId) {
    throw new DataValidationError("Project is missing adsAccountId for Meta insights");
  }

  const customPeriodRange = options?.periodRange ?? null;
  const periodRange = customPeriodRange ?? resolvePeriodRange(periodKey, settings.timezone);
  const scope = buildScopedCacheKey(`campaigns:${periodKey}`, periodKey, periodRange, {
    forceScoped: Boolean(options?.forceCacheScope || periodRange.key === "custom"),
  });
  const cached = await getMetaCache<MetaInsightsRawResponse>(kv, projectId, scope);
  if (cached && isMetaCacheEntryFresh(cached)) {
    return { entry: cached, project, settings };
  }

  const facebookUserId = resolveFacebookUserId(settings, options?.facebookUserId);

  const token = await getMetaToken(kv, facebookUserId);
  const metaPeriod = customPeriodRange ? resolveCustomMetaPeriod(periodRange) : resolveDatePreset(periodKey);

  const raw = await fetchMetaInsightsRaw({
    accountId: project.adsAccountId,
    accessToken: token.accessToken,
    period: metaPeriod,
    level: "campaign",
    fields: ["campaign_id", "campaign_name", "objective", "spend", "impressions", "clicks", "actions"].join(","),
  });
  const entry = createMetaCacheEntry(projectId, scope, periodRange.period, raw, CACHE_TTL_SECONDS);
  await saveMetaCache(kv, entry);
  return { entry, project, settings };
};

export interface CampaignRow {
  id: string;
  name: string;
  objective: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  messages: number;
  purchases: number;
  addToCart: number;
  calls: number;
  registrations: number;
  engagement: number;
  cpa: number | null;
}

export const mapCampaignRows = (raw: MetaInsightsRawResponse): CampaignRow[] => {
  return (raw.data ?? []).map((item) => {
    const record = item as Record<string, unknown>;
    const id = typeof record.campaign_id === "string" ? record.campaign_id : "unknown";
    const name = typeof record.campaign_name === "string" ? record.campaign_name : "Без названия";
    const objective = typeof record.objective === "string" ? record.objective : null;
    const summary = summariseMetaInsights({ data: [record] });
    const spend = summary.spend;
    const impressions = summary.impressions;
    const clicks = summary.clicks;
    const leads = summary.leads;
    const messages = summary.messages;
    const purchases = summary.purchases;
    const addToCart = summary.addToCart;
    const calls = summary.calls;
    const registrations = summary.registrations;
    const engagement = summary.engagement;
    const cpa = leads > 0 ? spend / leads : null;
    return {
      id,
      name,
      objective,
      spend,
      impressions,
      clicks,
      leads,
      messages,
      purchases,
      addToCart,
      calls,
      registrations,
      engagement,
      cpa,
    } satisfies CampaignRow;
  });
};

const determineKpiType = (objective: string | null, fallback: KpiType): KpiType => {
  if (!objective) {
    return fallback;
  }
  const upper = objective.toUpperCase();
  if (upper.includes("LEAD")) {
    return "LEAD";
  }
  if (upper.includes("MESSAGE")) {
    return "MESSAGE";
  }
  if (upper.includes("CLICK") || upper.includes("TRAFFIC")) {
    return "CLICK";
  }
  if (upper.includes("VIEW") || upper.includes("AWARENESS") || upper.includes("REACH")) {
    return "VIEW";
  }
  if (upper.includes("PURCHASE") || upper.includes("SALES") || upper.includes("CONVERSION")) {
    return "PURCHASE";
  }
  return fallback;
};

export const syncProjectCampaignDocument = async (
  kv: KvClient,
  r2: R2Client,
  projectId: string,
  periodKey: string,
  options?: {
    project?: Project;
    settings?: ProjectSettings;
    projectRecord?: ProjectRecord;
    facebookUserId?: string | null;
    periodRange?: PeriodRange;
  },
): Promise<MetaCampaignsDocument> => {
  const { entry, project, settings } = await loadProjectCampaigns(kv, projectId, periodKey, options);
  const projectRecord = options?.projectRecord ?? (await requireProjectRecord(kv, projectId));
  const kpiConfig = projectRecord.settings.kpi;
  const rows = mapCampaignRows(entry.payload);
  const campaigns = rows.map((row) => ({
    id: row.id,
    name: row.name,
    objective: row.objective ?? kpiConfig.label,
    kpiType:
      kpiConfig.mode === "manual" ? kpiConfig.type : determineKpiType(row.objective, kpiConfig.type),
    spend: row.spend,
    impressions: row.impressions,
    clicks: row.clicks,
    leads: row.leads,
    messages: row.messages,
  }));
  const summary = campaigns.reduce(
    (acc, campaign) => ({
      spend: acc.spend + (campaign.spend ?? 0),
      impressions: acc.impressions + (campaign.impressions ?? 0),
      clicks: acc.clicks + (campaign.clicks ?? 0),
      leads: acc.leads + (campaign.leads ?? 0),
      messages: acc.messages + (campaign.messages ?? 0),
    }),
    { spend: 0, impressions: 0, clicks: 0, leads: 0, messages: 0 },
  );
  const document: MetaCampaignsDocument = {
    period: entry.period,
    periodKey,
    summary,
    campaigns,
  };
  await putMetaCampaignsDocument(r2, projectId, document);
  return document;
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
  configuredStatus: string | null;
  objective: string | null;
  dailyBudget: number | null;
  budgetRemaining: number | null;
  updatedTime: string | null;
}

const mapCampaignStatus = (record: Record<string, unknown>): CampaignStatus => {
  const id = typeof record.id === "string" ? record.id : String(record.id ?? "unknown");
  const name = typeof record.name === "string" && record.name.trim().length > 0 ? record.name : "Без названия";
  const status = typeof record.status === "string" ? record.status : null;
  const effectiveStatus = typeof record.effective_status === "string" ? record.effective_status : status;
  const configuredStatus = typeof record.configured_status === "string" ? record.configured_status : status;
  const objective = typeof record.objective === "string" ? record.objective : null;
  const dailyBudget = parseBudget(record.daily_budget);
  const budgetRemaining = parseBudget(record.budget_remaining ?? record.lifetime_budget);
  const updatedTime = parseIsoDate(record.updated_time);

  return { id, name, status, effectiveStatus, configuredStatus, objective, dailyBudget, budgetRemaining, updatedTime };
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
