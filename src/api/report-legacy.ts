import {
  EnvBindings,
  listProjects,
  loadMetaToken,
} from "../utils/storage";
import { withMetaSettings, fetchCampaigns } from "../utils/meta";
import { syncProjectLeads, getProjectLeads } from "../utils/leads";
import {
  LeadRecord,
  MetaCampaign,
  ProjectRecord,
} from "../types";

interface PeriodRange {
  key: string;
  cacheKey: string;
  datePreset?: string;
  since?: string;
  until?: string;
}

interface LegacyLeadEntry {
  name: string;
  phone: string | null;
  type: "contact" | "message";
  date: string;
  ad_name: string;
}

interface LegacyCampaignEntry {
  name: string;
  status: string;
  objective: string;
  result: string;
  spend: number;
  impressions: number;
  clicks: number;
}

interface LegacyInsightsEntry {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number;
  total_leads: number;
  new_leads: number;
  conversations: number;
}

interface LegacyReportPayload {
  project: string;
  period: string;
  insights: LegacyInsightsEntry;
  leads: LegacyLeadEntry[];
  campaigns: LegacyCampaignEntry[];
}

interface LeadBuildResult {
  list: LegacyLeadEntry[];
  totalLeads: number;
  newLeads: number;
}

const LEGACY_REPORT_PREFIX = "kv_reports:";
const LEGACY_LEADS_PREFIX = "kv_leads:";
const LEGACY_CAMPAIGNS_PREFIX = "kv_campaigns:";

const rawJsonResponse = (payload: unknown, init: ResponseInit = {}): Response => {
  const headers = new Headers(init.headers || {});
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(payload, null, 0), { ...init, headers });
};

const formatDay = (value: Date): string => {
  const copy = new Date(value.getTime());
  copy.setUTCHours(0, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
};

const startOfDay = (value: Date): number => {
  const copy = new Date(value.getTime());
  copy.setUTCHours(0, 0, 0, 0);
  return copy.getTime();
};

const endOfDay = (value: Date): number => {
  const copy = new Date(value.getTime());
  copy.setUTCHours(23, 59, 59, 999);
  return copy.getTime();
};

const resolvePeriodRange = (input: string | undefined, now: Date): PeriodRange => {
  const raw = (input ?? "yesterday").trim().toLowerCase();

  const buildCustom = (since: Date, until: Date): PeriodRange => {
    const sinceDay = formatDay(since);
    const untilDay = formatDay(until);
    const cacheKey = `custom:${sinceDay}:${untilDay}`;
    return {
      key: "custom",
      cacheKey,
      since: sinceDay,
      until: untilDay,
    };
  };

  if (/^\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [sinceRaw, untilRaw] = raw.split(":");
    const since = new Date(`${sinceRaw}T00:00:00.000Z`);
    const until = new Date(`${untilRaw}T23:59:59.999Z`);
    if (!Number.isNaN(since.getTime()) && !Number.isNaN(until.getTime())) {
      return buildCustom(since, until);
    }
  }

  switch (raw) {
    case "today": {
      const since = new Date(now.getTime());
      const until = new Date(now.getTime());
      return {
        key: "today",
        cacheKey: "today",
        datePreset: "today",
        since: formatDay(since),
        until: formatDay(until),
      };
    }
    case "week": {
      const since = new Date(now.getTime());
      since.setUTCDate(since.getUTCDate() - 6);
      return {
        key: "week",
        cacheKey: "week",
        datePreset: "last_7d",
        since: formatDay(since),
        until: formatDay(now),
      };
    }
    case "month": {
      const since = new Date(now.getTime());
      since.setUTCDate(since.getUTCDate() - 29);
      return {
        key: "month",
        cacheKey: "month",
        datePreset: "last_30d",
        since: formatDay(since),
        until: formatDay(now),
      };
    }
    case "max": {
      return {
        key: "max",
        cacheKey: "max",
        datePreset: "maximum",
      };
    }
    case "yesterday":
    default: {
      const since = new Date(now.getTime());
      since.setUTCDate(since.getUTCDate() - 1);
      return {
        key: "yesterday",
        cacheKey: "yesterday",
        datePreset: "yesterday",
        since: formatDay(since),
        until: formatDay(since),
      };
    }
  }
};

const findProject = async (env: EnvBindings, slug: string): Promise<ProjectRecord | null> => {
  const projects = await listProjects(env).catch(() => [] as ProjectRecord[]);
  if (!projects.length) {
    return null;
  }
  const normalized = slug.trim().toLowerCase();
  return (
    projects.find((project) => project.id === slug)
    || projects.find((project) => project.portalSlug === slug)
    || projects.find((project) => project.portalSlug?.toLowerCase() === normalized)
    || projects.find((project) => project.name?.toLowerCase?.() === normalized)
    || null
  );
};

const legacyReportCacheKey = (projectKey: string, periodKey: string): string => {
  return `${LEGACY_REPORT_PREFIX}${projectKey}:${periodKey}`;
};

const legacyLeadsCacheKey = (projectKey: string, periodKey: string): string => {
  return `${LEGACY_LEADS_PREFIX}${projectKey}:${periodKey}`;
};

const legacyCampaignsCacheKey = (projectKey: string, periodKey: string): string => {
  return `${LEGACY_CAMPAIGNS_PREFIX}${projectKey}:${periodKey}`;
};

const parseLeadType = (lead: LeadRecord): "contact" | "message" => {
  if (lead.phone && lead.phone.trim().length > 0) {
    return "contact";
  }
  return "message";
};

const normalizeLead = (lead: LeadRecord): LegacyLeadEntry => {
  return {
    name: lead.name,
    phone: lead.phone ?? null,
    type: parseLeadType(lead),
    date: lead.createdAt,
    ad_name: lead.adName ?? lead.campaignShortName ?? lead.campaignName ?? "",
  };
};

const buildLeadList = (leads: LeadRecord[]): LeadBuildResult => {
  const sorted = leads
    .slice()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const list = sorted.map(normalizeLead);
  const newLeads = sorted.filter((lead) => lead.status !== "done").length;
  return {
    list,
    totalLeads: sorted.length,
    newLeads,
  };
};

const toNumber = (value: number | undefined | null): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return 0;
};

const formatResult = (campaign: MetaCampaign): string => {
  if (campaign.primaryMetricLabel && campaign.primaryMetricValue !== undefined) {
    return `${campaign.primaryMetricLabel}: ${Math.round(toNumber(campaign.primaryMetricValue))}`;
  }
  if (campaign.resultLabel && campaign.resultValue !== undefined) {
    return `${campaign.resultLabel}: ${Math.round(toNumber(campaign.resultValue))}`;
  }
  if (campaign.leads !== undefined) {
    return `Лиды: ${Math.round(toNumber(campaign.leads))}`;
  }
  if (campaign.conversations !== undefined) {
    return `Диалоги: ${Math.round(toNumber(campaign.conversations))}`;
  }
  return "Результат: —";
};

const buildCampaignList = (campaigns: MetaCampaign[]): LegacyCampaignEntry[] => {
  return campaigns.map((campaign) => ({
    name: campaign.name,
    status: campaign.effectiveStatus || campaign.status || "unknown",
    objective: campaign.objectiveLabel || campaign.objective || "—",
    result: formatResult(campaign),
    spend: toNumber(campaign.spend),
    impressions: Math.round(toNumber(campaign.impressions)),
    clicks: Math.round(toNumber(campaign.clicks)),
  }));
};

const buildInsightsFromCampaigns = (
  campaigns: MetaCampaign[],
  stats: { total: number; new: number },
): LegacyInsightsEntry => {
  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  let leads = 0;
  let conversations = 0;

  campaigns.forEach((campaign) => {
    spend += toNumber(campaign.spend);
    impressions += toNumber(campaign.impressions);
    clicks += toNumber(campaign.clicks);
    leads += toNumber(campaign.leads);
    conversations += toNumber(campaign.conversations);
  });

  const cpl = leads > 0 ? spend / leads : 0;

  return {
    spend,
    impressions,
    clicks,
    leads,
    cpl,
    total_leads: stats.total,
    new_leads: stats.new,
    conversations,
  };
};

const filterLeadsByPeriod = (
  leads: LeadRecord[],
  period: PeriodRange,
): LeadRecord[] => {
  if (!period.since && !period.until) {
    return leads;
  }
  const since = period.since ? startOfDay(new Date(`${period.since}T00:00:00.000Z`)) : null;
  const until = period.until ? endOfDay(new Date(`${period.until}T23:59:59.999Z`)) : null;
  return leads.filter((lead) => {
    const created = Date.parse(lead.createdAt);
    if (Number.isNaN(created)) {
      return true;
    }
    if (since !== null && created < since) {
      return false;
    }
    if (until !== null && created > until) {
      return false;
    }
    return true;
  });
};

const fetchCampaignsFromMeta = async (
  env: EnvBindings & Record<string, unknown>,
  project: ProjectRecord,
  period: PeriodRange,
): Promise<MetaCampaign[]> => {
  const accountId = project.adAccountId || project.metaAccountId;
  if (!accountId) {
    return [];
  }
  const metaEnv = await withMetaSettings(env);
  const tokenRecord = await loadMetaToken(metaEnv);
  if (!tokenRecord?.accessToken) {
    return [];
  }
  try {
    const campaigns = await fetchCampaigns(metaEnv, tokenRecord, accountId, {
      limit: 50,
      datePreset: period.datePreset,
      since: period.since,
      until: period.until,
    });
    return campaigns;
  } catch (error) {
    console.warn("legacy-report:campaigns", project.id, (error as Error).message);
    return [];
  }
};

const fetchLeadsFromMeta = async (
  env: EnvBindings & Record<string, unknown>,
  project: ProjectRecord,
): Promise<void> => {
  await syncProjectLeads(env, project.id).catch((error) => {
    console.warn("legacy-report:sync-leads", project.id, (error as Error).message);
  });
};

const loadLeadRecords = async (
  env: EnvBindings,
  project: ProjectRecord,
): Promise<LeadRecord[]> => {
  return getProjectLeads(env, project.id).catch(() => [] as LeadRecord[]);
};

const readCache = async <T>(env: EnvBindings, key: string): Promise<T | null> => {
  const stored = await env.DB.get(key);
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored) as T;
  } catch (error) {
    console.warn("legacy-report:cache:parse", key, (error as Error).message);
    return null;
  }
};

const writeCache = async (env: EnvBindings, key: string, value: unknown): Promise<void> => {
  try {
    await env.DB.put(key, JSON.stringify(value, null, 0));
  } catch (error) {
    console.warn("legacy-report:cache:write", key, (error as Error).message);
  }
};

const buildLegacyReport = async (
  env: EnvBindings & Record<string, unknown>,
  project: ProjectRecord,
  period: PeriodRange,
): Promise<LegacyReportPayload> => {
  await fetchLeadsFromMeta(env, project);
  const allLeads = await loadLeadRecords(env, project);
  const leadsInPeriod = filterLeadsByPeriod(allLeads, period);
  const leadResult = buildLeadList(leadsInPeriod);
  const campaigns = await fetchCampaignsFromMeta(env, project, period);
  const insights = buildInsightsFromCampaigns(campaigns, {
    total: allLeads.length,
    new: leadResult.newLeads,
  });
  const projectKey = project.portalSlug?.trim() || project.id;
  return {
    project: projectKey,
    period: period.cacheKey,
    insights,
    leads: leadResult.list,
    campaigns: buildCampaignList(campaigns),
  };
};

export const handleLegacyReportRequest = async (
  env: EnvBindings & Record<string, unknown>,
  projectSlug: string,
  periodInput: string | undefined,
): Promise<Response> => {
  if (!projectSlug || !projectSlug.trim()) {
    return rawJsonResponse({ error: "project parameter is required" }, { status: 400 });
  }
  const project = await findProject(env, projectSlug);
  if (!project) {
    return rawJsonResponse({ error: "project not found" }, { status: 404 });
  }

  const now = new Date();
  const period = resolvePeriodRange(periodInput, now);
  const projectKey = project.portalSlug?.trim() || project.id;
  const reportCacheKey = legacyReportCacheKey(projectKey, period.cacheKey);

  const cached = await readCache<LegacyReportPayload>(env, reportCacheKey);
  if (cached) {
    return rawJsonResponse(cached);
  }

  const report = await buildLegacyReport(env, project, period);

  await Promise.all([
    writeCache(env, reportCacheKey, report),
    writeCache(env, legacyLeadsCacheKey(projectKey, period.cacheKey), report.leads),
    writeCache(env, legacyCampaignsCacheKey(projectKey, period.cacheKey), report.campaigns),
  ]);

  return rawJsonResponse(report);
};

export type { LegacyReportPayload, LegacyInsightsEntry, LegacyLeadEntry, LegacyCampaignEntry };
export { buildInsightsFromCampaigns as buildInsights, buildLeadList as buildLeads, buildCampaignList as buildCampaigns };
