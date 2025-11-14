import {
  AutoReportDataset,
  AutoReportProjectEntry,
  CampaignReportBlock,
  JsonValue,
  KPISet,
  MetaAdAccount,
  MetaCampaign,
  PortalMetricKey,
  ProjectReport,
  ProjectSummary,
  ReportRecord,
  ReportType,
  ReportTotals,
} from "../types";
import {
  EnvBindings,
  appendReportRecord,
  loadMetaToken,
  saveReportAsset,
  listCampaignObjectivesForProject,
  listProjectCampaignKpis,
  listPortals,
  listProjects,
} from "./storage";
import { summarizeProjects, sortProjectSummaries, extractProjectReportPreferences } from "./projects";
import { createId } from "./ids";
import { fetchAdAccounts, fetchCampaigns, withMetaSettings } from "./meta";
import { syncCampaignObjectives, getCampaignKPIs, applyKpiSelection, getKPIsForCampaign } from "./kpi";
import { syncProjectLeads } from "./leads";
import { compareCampaigns, normalizeCampaign, normalizeCampaigns } from "./campaigns";

const GLOBAL_PROJECT_ID = "__multi__";
const PORTAL_BASE_KEYS = [
  "PORTAL_BASE_URL",
  "PUBLIC_WEB_URL",
  "PUBLIC_BASE_URL",
  "WORKER_BASE_URL",
  "ADMIN_BASE_URL",
];
const DEFAULT_PORTAL_BASE = "https://th-reports.buyclientuz.workers.dev";

type PortalLinkEntry = { portalId: string | null; portalUrl: string | null };

export type ProjectMetricContextEntry = {
  objectives: Record<string, string | null>;
  manual: Record<string, PortalMetricKey[]>;
};

interface DateRange {
  start: string;
  end: string;
}

const takeEnvString = (env: Record<string, unknown>, key: string): string | null => {
  const raw = env[key];
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  return null;
};

const buildPortalUrl = (base: string | null, slug: string): string | null => {
  if (!base) {
    return null;
  }
  try {
    const normalized = base.includes("://") ? base : `https://${base}`;
    const url = new URL(normalized);
    url.pathname = `/portal/${encodeURIComponent(slug)}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch (error) {
    console.warn("Failed to build portal url", base, slug, error);
    return null;
  }
};

const resolvePortalLink = (
  env: EnvBindings & Record<string, unknown>,
  projectId: string,
  portalId?: string | null,
): PortalLinkEntry => {
  const slug = portalId && portalId.trim() ? portalId.trim() : projectId;
  const candidates: (string | null)[] = PORTAL_BASE_KEYS.map((key) => takeEnvString(env, key));
  candidates.push(DEFAULT_PORTAL_BASE);
  for (const candidate of candidates) {
    const url = buildPortalUrl(candidate, slug);
    if (url) {
      return { portalId: portalId ?? null, portalUrl: url };
    }
  }
  return { portalId: portalId ?? null, portalUrl: null };
};

const pad2 = (value: number): string => value.toString().padStart(2, "0");

const toDateOnly = (value: Date): string => {
  return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
};

const resolveDateRange = (
  filters: { datePreset?: string; since?: string; until?: string },
  generatedAtIso: string,
): DateRange => {
  const safeParse = (raw?: string | null): Date | null => {
    if (!raw) {
      return null;
    }
    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) {
      return null;
    }
    return new Date(parsed);
  };

  const since = safeParse(filters.since ?? null);
  const until = safeParse(filters.until ?? null);
  if (since && until) {
    return { start: toDateOnly(since), end: toDateOnly(until) };
  }

  const generatedAt = safeParse(generatedAtIso) ?? new Date();
  const preset = (filters.datePreset ?? "today").toLowerCase();
  const makeDate = (date: Date): Date => {
    const copy = new Date(date.getTime());
    copy.setUTCHours(0, 0, 0, 0);
    return copy;
  };

  const start = makeDate(generatedAt);
  const end = makeDate(generatedAt);

  switch (preset) {
    case "yesterday": {
      start.setUTCDate(start.getUTCDate() - 1);
      end.setUTCDate(end.getUTCDate() - 1);
      break;
    }
    case "last_7d": {
      start.setUTCDate(start.getUTCDate() - 6);
      break;
    }
    case "last_30d": {
      start.setUTCDate(start.getUTCDate() - 29);
      break;
    }
    case "lifetime": {
      start.setUTCFullYear(2015, 0, 1);
      break;
    }
    default:
      break;
  }

  return { start: toDateOnly(start), end: toDateOnly(end) };
};

export interface GenerateReportOptions {
  type?: ReportType;
  title?: string;
  projectIds?: string[];
  format?: ReportRecord["format"];
  datePreset?: string;
  since?: string;
  until?: string;
  includeMeta?: boolean;
  channel?: ReportRecord["channel"];
  triggeredBy?: string;
  command?: string;
}

export interface GenerateReportResult {
  record: ReportRecord;
  text: string;
  dataset: AutoReportDataset;
}

const resolveFilters = (options: GenerateReportOptions) => {
  const filters = {
    datePreset: options.datePreset,
    since: options.since,
    until: options.until,
  };
  if (!filters.datePreset && !filters.since && !filters.until) {
    filters.datePreset = "today";
  }
  return filters;
};

const describePeriod = (filters: { datePreset?: string; since?: string; until?: string }): string => {
  if (filters.datePreset && filters.datePreset.trim()) {
    return filters.datePreset.trim();
  }
  const since = filters.since?.trim();
  const until = filters.until?.trim();
  if (since && until && since !== until) {
    return `${since} → ${until}`;
  }
  if (since || until) {
    return since || until || "custom";
  }
  return "today";
};

const accountSpendMap = async (
  env: EnvBindings & Record<string, unknown>,
  includeMeta: boolean,
  filters: { datePreset?: string; since?: string; until?: string },
): Promise<Map<string, MetaAdAccount>> => {
  if (!includeMeta) {
    return new Map();
  }
  try {
    const token = await loadMetaToken(env);
    if (!token || token.status !== "valid") {
      return new Map();
    }
    const accounts = await fetchAdAccounts(env, token, {
      includeSpend: true,
      includeCampaigns: false,
      datePreset: filters.datePreset,
      since: filters.since,
      until: filters.until,
    });
    const map = new Map<string, MetaAdAccount>();
    for (const account of accounts) {
      map.set(account.id, account);
    }
    return map;
  } catch (error) {
    console.warn("Failed to collect Meta spend for report", error);
    return new Map();
  }
};

const formatSpend = (account: MetaAdAccount | undefined): string | undefined => {
  if (!account) {
    return undefined;
  }
  if (account.spendFormatted) {
    return account.spendPeriod ? `${account.spendFormatted} · ${account.spendPeriod}` : account.spendFormatted;
  }
  if (account.spend !== undefined) {
    const amount = account.spend.toFixed(2);
    return account.spendCurrency ? `${amount} ${account.spendCurrency}` : amount;
  }
  return undefined;
};

const formatCurrencyAmount = (amount: number | undefined, currency?: string): string => {
  if (amount === undefined || !Number.isFinite(amount) || amount === 0) {
    return "—";
  }
  const safeCurrency = currency && /^[A-Z]{3}$/.test(currency) ? currency : "USD";
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: safeCurrency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    console.warn("Failed to format currency amount", safeCurrency, error);
    return `${amount.toFixed(2)} ${safeCurrency}`;
  }
};

interface CampaignSpendOverride {
  label: string;
  spend?: number;
  currency?: string;
  period?: string;
}

const collectPreferredCampaignSpend = async (
  env: EnvBindings & Record<string, unknown>,
  summaries: ProjectSummary[],
  filters: { datePreset?: string; since?: string; until?: string },
): Promise<Map<string, CampaignSpendOverride>> => {
  const requests = summaries
    .map((summary) => {
      const preferences = extractProjectReportPreferences(summary.settings);
      if (!preferences.campaignIds.length || !summary.adAccountId) {
        return null;
      }
      return {
        projectId: summary.id,
        accountId: summary.adAccountId,
        campaignIds: preferences.campaignIds,
      };
    })
    .filter((value): value is { projectId: string; accountId: string; campaignIds: string[] } => Boolean(value));

  if (!requests.length) {
    return new Map();
  }

  const token = await loadMetaToken(env);
  if (!token) {
    return new Map();
  }
  const metaEnv = await withMetaSettings(env);
  const overrides = new Map<string, CampaignSpendOverride>();

  await Promise.all(
    requests.map(async ({ projectId, accountId, campaignIds }) => {
      try {
        const campaigns = await fetchCampaigns(metaEnv, token, accountId, {
          limit: Math.max(campaignIds.length, 25),
          datePreset: filters.datePreset,
          since: filters.since,
          until: filters.until,
        });
        await syncCampaignObjectives(env, projectId, campaigns);
        if (!campaigns.length) {
          overrides.set(projectId, { label: "—" });
          return;
        }
        const selectedIds = new Set(campaignIds);
        const selected = campaigns.filter((campaign) => selectedIds.has(campaign.id));
        if (!selected.length) {
          overrides.set(projectId, { label: "—" });
          return;
        }
        const spend = selected.reduce((total, campaign) => total + (campaign.spend ?? 0), 0);
        const currency =
          selected.find((campaign) => campaign.spendCurrency)?.spendCurrency ||
          campaigns.find((campaign) => campaign.spendCurrency)?.spendCurrency;
        const period =
          selected.find((campaign) => campaign.spendPeriod)?.spendPeriod ||
          campaigns.find((campaign) => campaign.spendPeriod)?.spendPeriod ||
          filters.datePreset;
        const formatted = formatCurrencyAmount(spend, currency);
        const label = formatted === "—" ? "—" : period ? `${formatted} · ${period}` : formatted;
        overrides.set(projectId, { label, spend, currency, period });
      } catch (error) {
        console.warn("Failed to collect campaign spend", projectId, error);
      }
    }),
  );

  return overrides;
};

export const collectProjectMetricContext = async (
  env: EnvBindings,
  summaries: ProjectSummary[],
): Promise<Map<string, ProjectMetricContextEntry>> => {
  const entries = await Promise.all(
    summaries.map(async (summary) => {
      try {
        const [objectives, campaignKpis] = await Promise.all([
          listCampaignObjectivesForProject(env, summary.id).catch(() => ({}) as Record<string, string | null>),
          listProjectCampaignKpis(env, summary.id).catch(() => ({} as Record<string, PortalMetricKey[]>)),
        ]);
        return [
          summary.id,
          {
            objectives,
            manual: campaignKpis,
          },
        ] as const;
      } catch (error) {
        console.warn("Failed to load campaign context", summary.id, error);
        return [summary.id, { objectives: {}, manual: {} }] as const;
      }
    }),
  );
  return new Map(entries);
};

export const collectProjectCampaigns = async (
  env: EnvBindings & Record<string, unknown>,
  summaries: ProjectSummary[],
  filters: { datePreset?: string; since?: string; until?: string },
): Promise<Map<string, MetaCampaign[]>> => {
  const result = new Map<string, MetaCampaign[]>();
  const token = await loadMetaToken(env);
  if (!token) {
    return result;
  }
  const metaEnv = await withMetaSettings(env);
  await Promise.all(
    summaries.map(async (summary) => {
      if (!summary.adAccountId) {
        result.set(summary.id, []);
        return;
      }
      try {
        const campaigns = await fetchCampaigns(metaEnv, token, summary.adAccountId, {
          limit: 50,
          datePreset: filters.datePreset,
          since: filters.since,
          until: filters.until,
        });
        await syncCampaignObjectives(env, summary.id, campaigns);
        result.set(summary.id, campaigns);
      } catch (error) {
        console.warn("Failed to load campaigns for report", summary.id, error);
        result.set(summary.id, []);
      }
    }),
  );
  return result;
};

const selectProjectCampaigns = (
  campaigns: MetaCampaign[],
  preferences: { campaignIds: string[] },
): MetaCampaign[] => {
  if (!campaigns.length) {
    return [];
  }
  const sorted = campaigns.slice().sort(compareCampaigns);
  if (preferences.campaignIds.length) {
    const ids = new Set(preferences.campaignIds);
    const manual = sorted.filter((campaign) => ids.has(campaign.id));
    if (manual.length) {
      return manual;
    }
  }
  return sorted.slice(0, 10);
};

const sumNumbers = (a: number | undefined, b: number | undefined): number => {
  const first = Number.isFinite(a) ? (a as number) : 0;
  const second = Number.isFinite(b) ? (b as number) : 0;
  return first + second;
};

const aggregateCampaigns = (campaigns: MetaCampaign[]): KPISet => {
  return campaigns.reduce<KPISet>((acc, campaign) => {
    acc.spend = sumNumbers(acc.spend, campaign.spend);
    acc.impressions = sumNumbers(acc.impressions, campaign.impressions);
    acc.clicks = sumNumbers(acc.clicks, campaign.clicks);
    acc.reach = sumNumbers(acc.reach, campaign.reach);
    acc.leads = sumNumbers(acc.leads, campaign.leads);
    acc.messages = sumNumbers(acc.messages, campaign.conversations);
    acc.conversations = sumNumbers(acc.conversations, campaign.conversations);
    acc.purchases = sumNumbers(acc.purchases, campaign.purchases);
    acc.conversions = sumNumbers(acc.conversions, campaign.conversions);
    acc.engagements = sumNumbers(acc.engagements, campaign.engagements);
    acc.thruplays = sumNumbers(acc.thruplays, campaign.thruplays);
    acc.installs = sumNumbers(acc.installs, campaign.installs);
    acc.revenue = sumNumbers(acc.revenue, campaign.roasValue);
    return acc;
  }, {} as KPISet);
};

const assignMetricValue = (target: KPISet, key: PortalMetricKey, value: number | undefined): void => {
  if (value === undefined || Number.isNaN(value)) {
    return;
  }
  (target as Record<string, number>)[key] = value;
  if (key === "messages" && target.conversations === undefined) {
    target.conversations = value;
  }
  if (key === "conversations" && target.messages === undefined) {
    target.messages = value;
  }
};

const buildDerivedMetrics = (source: KPISet, totals: KPISet, leadsFallback: number): KPISet => {
  const result: KPISet = {};
  const spend = source.spend ?? 0;
  const impressions = source.impressions ?? 0;
  const clicks = source.clicks ?? 0;
  const leads = source.leads ?? leadsFallback;
  const purchases = source.purchases ?? 0;
  const revenue = source.revenue ?? 0;
  const reach = source.reach ?? 0;
  const conversations = source.conversations ?? source.messages ?? 0;
  const engagements = source.engagements ?? 0;
  const thruplays = source.thruplays ?? 0;
  const installs = source.installs ?? 0;

  if (leads > 0 && spend > 0) {
    result.cpl = spend / leads;
  }
  if (purchases > 0 && spend > 0) {
    result.cpa = spend / purchases;
    result.cpurchase = spend / purchases;
  } else if (leads > 0 && spend > 0 && result.cpa === undefined) {
    result.cpa = spend / leads;
  }
  if (impressions > 0 && clicks > 0) {
    result.ctr = (clicks / impressions) * 100;
  }
  if (clicks > 0 && spend > 0) {
    result.cpc = spend / clicks;
  }
  if (impressions > 0 && spend > 0) {
    result.cpm = (spend / impressions) * 1000;
  }
  if (revenue > 0 && spend > 0) {
    result.roas = revenue / spend;
  }
  if (reach > 0 && impressions > 0) {
    result.freq = impressions / reach;
  }
  if (engagements > 0 && spend > 0) {
    result.cpe = spend / engagements;
  }
  if (thruplays > 0 && spend > 0) {
    result.cpv = spend / thruplays;
  }
  if (installs > 0 && spend > 0) {
    result.cpi = spend / installs;
  }
  if (conversations > 0) {
    result.messages = conversations;
    result.conversations = conversations;
  }
  return result;
};

const mergeKpiSets = (target: KPISet, source: KPISet): KPISet => {
  const next: KPISet = { ...target };
  Object.entries(source).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    const numeric = value as number;
    if (Number.isNaN(numeric)) {
      return;
    }
    const current = (next as Record<string, number | undefined>)[key];
    (next as Record<string, number>)[key] = (current ?? 0) + numeric;
  });
  return next;
};

const buildCampaignKpiSet = (
  campaign: MetaCampaign,
  selection: PortalMetricKey[],
): KPISet => {
  const kpis: KPISet = {};
  selection.forEach((metric) => {
    switch (metric) {
      case "leads":
        assignMetricValue(kpis, metric, campaign.leads);
        break;
      case "spend":
        assignMetricValue(kpis, metric, campaign.spend);
        break;
      case "impressions":
        assignMetricValue(kpis, metric, campaign.impressions);
        break;
      case "clicks":
        assignMetricValue(kpis, metric, campaign.clicks);
        break;
      case "reach":
        assignMetricValue(kpis, metric, campaign.reach);
        break;
      case "messages":
      case "conversations":
        assignMetricValue(kpis, metric, campaign.conversations);
        break;
      case "purchases":
        assignMetricValue(kpis, metric, campaign.purchases);
        break;
      case "conversions":
        assignMetricValue(kpis, metric, campaign.conversions);
        break;
      case "engagements":
        assignMetricValue(kpis, metric, campaign.engagements);
        break;
      case "thruplays":
        assignMetricValue(kpis, metric, campaign.thruplays);
        break;
      case "installs":
        assignMetricValue(kpis, metric, campaign.installs);
        break;
      case "ctr":
        assignMetricValue(kpis, metric, campaign.ctr);
        break;
      case "cpc":
        assignMetricValue(kpis, metric, campaign.cpc);
        break;
      case "cpm":
        assignMetricValue(kpis, metric, campaign.cpm);
        break;
      case "cpl":
        assignMetricValue(kpis, metric, campaign.cpl);
        break;
      case "cpa":
        assignMetricValue(kpis, metric, campaign.cpa);
        break;
      case "roas":
        assignMetricValue(kpis, metric, campaign.roas);
        break;
      case "cpe":
        assignMetricValue(kpis, metric, campaign.cpe);
        break;
      case "cpv":
        assignMetricValue(kpis, metric, campaign.cpv);
        break;
      case "cpi":
        assignMetricValue(kpis, metric, campaign.cpi);
        break;
      case "freq": {
        const freq =
          campaign.reach && campaign.reach > 0 && campaign.impressions && campaign.impressions > 0
            ? campaign.impressions / campaign.reach
            : undefined;
        assignMetricValue(kpis, metric, freq);
        break;
      }
      case "cpurchase":
        assignMetricValue(kpis, metric, campaign.cpa);
        break;
      default:
        break;
    }
  });
  return kpis;
};

const buildProjectKpiSet = (
  summary: ProjectSummary,
  aggregated: KPISet,
  derived: KPISet,
): KPISet => {
  const kpis: KPISet = { ...aggregated, ...derived };
  if (summary.leadStats) {
    kpis.leads_total = summary.leadStats.total;
    kpis.leads_new = summary.leadStats.new;
    kpis.leads_done = summary.leadStats.done;
  }
  if ((aggregated.messages ?? aggregated.conversations) && kpis.messages === undefined) {
    kpis.messages = aggregated.messages ?? aggregated.conversations;
  }
  if ((aggregated.conversations ?? aggregated.messages) && kpis.conversations === undefined) {
    kpis.conversations = aggregated.conversations ?? aggregated.messages;
  }
  return kpis;
};

export const buildProjectReportEntry = (
  summary: ProjectSummary,
  campaigns: MetaCampaign[],
  context: ProjectMetricContextEntry | undefined,
  preferences: { campaignIds: string[]; metrics: PortalMetricKey[] },
  dateRange: DateRange,
): { report: ProjectReport; metrics: PortalMetricKey[]; campaignBlocks: CampaignReportBlock[] } => {
  const manualMap = context?.manual ?? {};
  const objectiveMap = context?.objectives ?? {};
  const decorated = campaigns.map((campaign) => ({
    ...campaign,
    manualKpi: manualMap[campaign.id] ?? campaign.manualKpi,
    objective: campaign.objective ?? objectiveMap[campaign.id] ?? campaign.objective ?? null,
  }));

  const selected = selectProjectCampaigns(decorated, preferences);
  const override = preferences.metrics.length ? preferences.metrics : undefined;

  const campaignBlocks: CampaignReportBlock[] = selected.map((campaign) => {
    const selection = getKPIsForCampaign(summary, campaign, override);
    if (!selection.length) {
      selection.push(...getCampaignKPIs(campaign.objective ?? null));
    }
    const kpis = buildCampaignKpiSet(campaign, selection);
    if (campaign.spend !== undefined && kpis.spend === undefined) {
      assignMetricValue(kpis, "spend", campaign.spend);
    }
    if (campaign.leads !== undefined && kpis.leads === undefined) {
      assignMetricValue(kpis, "leads", campaign.leads);
    }
    if (campaign.cpa !== undefined && kpis.cpa === undefined) {
      assignMetricValue(kpis, "cpa", campaign.cpa);
    }
    if (campaign.cpl !== undefined && kpis.cpl === undefined) {
      assignMetricValue(kpis, "cpl", campaign.cpl);
    }
    const normalized = normalizeCampaign(campaign);
    return {
      id: normalized.id,
      name: normalized.name,
      shortName: normalized.shortName,
      status: normalized.status,
      effectiveStatus: normalized.effectiveStatus,
      objective: normalized.objective,
      resultLabel: normalized.resultLabel,
      resultValue: normalized.resultValue,
      resultMetric: normalized.resultMetric,
      objectiveLabel: normalized.objectiveLabel,
      primaryMetricLabel: normalized.primaryMetricLabel,
      primaryMetricValue: normalized.primaryMetricValue,
      spend: campaign.spend,
      impressions: campaign.impressions,
      clicks: campaign.clicks,
      kpis,
    };
  });

  const aggregated = aggregateCampaigns(selected);
  const derived = buildDerivedMetrics(aggregated, aggregated, summary.leadStats?.total ?? 0);
  const projectKpis = buildProjectKpiSet(summary, aggregated, derived);

  const report: ProjectReport = {
    date_start: dateRange.start,
    date_end: dateRange.end,
    kpis: projectKpis,
    campaigns: campaignBlocks,
  };

  const metricSet = new Set<PortalMetricKey>();
  campaignBlocks.forEach((block) => {
    Object.keys(block.kpis).forEach((key) => metricSet.add(key as PortalMetricKey));
  });
  if (override?.length) {
    override.forEach((metric) => metricSet.add(metric));
  }
  if (!metricSet.size && summary.manualKpi?.length) {
    summary.manualKpi.forEach((metric) => metricSet.add(metric));
  }
  if (!metricSet.size) {
    getCampaignKPIs("LEAD_GENERATION").forEach((metric) => metricSet.add(metric));
  }

  return { report, metrics: Array.from(metricSet), campaignBlocks };
};

const billingLabel = (summary: ProjectSummary): string => {
  const billing = summary.billing;
  if (!billing || billing.status === "missing") {
    return "не настроена";
  }
  const statusMap: Record<string, string> = {
    active: "активен",
    pending: "ожидает",
    overdue: "просрочен",
    cancelled: "отменён",
  };
  const base = statusMap[billing.status] ?? billing.status;
  const amount = billing.amountFormatted
    ? billing.amountFormatted
    : billing.amount !== undefined
      ? `${billing.amount.toFixed(2)} ${billing.currency || "USD"}`
      : undefined;
  const period = billing.periodLabel;
  const pieces = [base];
  if (amount) {
    pieces.push(amount);
  }
  if (period) {
    pieces.push(period);
  }
  if (billing.overdue) {
    pieces.push("⚠️ требуются действия");
  }
  return pieces.join(" · ");
};

export const buildAutoReportDataset = (
  summaries: ProjectSummary[],
  accounts: Map<string, MetaAdAccount>,
  overrides: Map<string, CampaignSpendOverride>,
  contextMap: Map<string, ProjectMetricContextEntry>,
  campaignMap: Map<string, MetaCampaign[]>,
  portals: Map<string, PortalLinkEntry>,
  periodLabel: string,
  generatedAt: string,
  filters: { datePreset?: string; since?: string; until?: string },
): AutoReportDataset => {
  const dateRange = resolveDateRange(filters, generatedAt);
  let datasetKpis: KPISet = {};

  const projects: AutoReportProjectEntry[] = summaries.map((summary) => {
    const account = summary.adAccountId ? accounts.get(summary.adAccountId) : undefined;
    const override = overrides.get(summary.id);
    const portal = portals.get(summary.id);
    const preferences = extractProjectReportPreferences(summary.settings);
    const campaigns = campaignMap.get(summary.id) ?? [];
    const context = contextMap.get(summary.id);
    const { report, metrics } = buildProjectReportEntry(summary, campaigns, context, preferences, dateRange);

    datasetKpis = mergeKpiSets(datasetKpis, report.kpis);

    const spendAmount =
      override?.spend ?? report.kpis.spend ??
      (typeof account?.spend === "number" && Number.isFinite(account.spend) ? account.spend : null);
    const spendCurrency =
      override?.currency ??
      campaigns.find((campaign) => campaign.spendCurrency)?.spendCurrency ??
      account?.spendCurrency ??
      account?.currency ??
      null;
    const spendPeriod = override?.period ?? account?.spendPeriod ?? filters.datePreset ?? null;
    const spendLabel = override?.label ?? formatSpend(account) ?? (spendAmount !== null ? formatCurrencyAmount(spendAmount, spendCurrency ?? undefined) : "—");

    return {
      projectId: summary.id,
      projectName: summary.name,
      chatId: summary.chatId,
      chatTitle: summary.telegramTitle ?? null,
      chatLink: summary.telegramLink ?? null,
      portalId: portal?.portalId ?? null,
      portalUrl: portal?.portalUrl ?? null,
      metaAccountId: summary.metaAccountId,
      metaAccountName: summary.metaAccountName,
      adAccountId: summary.adAccountId ?? null,
      leads: summary.leadStats,
      billing: {
        status: summary.billing?.status ?? "missing",
        label: billingLabel(summary),
        nextPaymentDate: summary.nextPaymentDate ?? null,
        tariff: Number.isFinite(summary.tariff) ? summary.tariff : null,
      },
      spend: {
        label: spendLabel,
        amount: spendAmount,
        currency: spendCurrency,
        period: spendPeriod,
      },
      metrics,
      report,
    };
  });

  const totals: ReportTotals = projects.reduce<ReportTotals>(
    (acc, project) => {
      acc.projects += 1;
      acc.leadsTotal += project.leads.total;
      acc.leadsNew += project.leads.new;
      acc.leadsDone += project.leads.done;
      return acc;
    },
    { projects: 0, leadsTotal: 0, leadsNew: 0, leadsDone: 0 },
  );

  return {
    periodLabel,
    generatedAt,
    totals,
    kpis: datasetKpis,
    projects,
  };
};

const RU_WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

const formatRuDateLabel = (date: Date): string =>
  `${pad2(date.getUTCDate())}.${pad2(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;

const formatWeekdayLabel = (date: Date): string => RU_WEEKDAYS[date.getUTCDay()] ?? "";

const formatIntegerValue = (value: number | undefined | null): string => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "0";
  }
  const rounded = Math.round(value);
  return rounded.toString();
};

const formatCurrencyValue = (value: number | undefined | null, currency?: string | null): string => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "—";
  }
  const amount = Number(value);
  const digits = amount.toFixed(2);
  const suffix = currency && currency !== "USD" && /^[A-Z]{3}$/.test(currency) ? ` ${currency}` : "$";
  return `${digits}${suffix}`;
};

const formatPercentValue = (value: number | undefined | null): string => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "—";
  }
  return `${value.toFixed(2)}%`;
};

const buildCampaignReportName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) {
    return "—";
  }
  if (trimmed.length <= 20) {
    return trimmed;
  }
  const firstSpace = trimmed.indexOf(" ");
  if (firstSpace > 0 && firstSpace <= 20) {
    return `${trimmed.slice(0, firstSpace)}[...]`;
  }
  return `${trimmed.slice(0, 20)}[...]`;
};

const campaignStatusIcon = (status?: string, effectiveStatus?: string): string => {
  const normalized = (effectiveStatus || status || "").toUpperCase();
  if (normalized === "ACTIVE") {
    return "✅";
  }
  if (normalized === "PAUSED" || normalized === "INACTIVE") {
    return "⏸️";
  }
  return "•";
};

const resolveCampaignCpa = (campaign: CampaignReportBlock): number | undefined => {
  if (campaign.kpis.cpa !== undefined) {
    return campaign.kpis.cpa;
  }
  if (campaign.kpis.cpl !== undefined) {
    return campaign.kpis.cpl;
  }
  const spend = campaign.kpis.spend ?? campaign.spend;
  const resultCount =
    campaign.primaryMetricValue ?? campaign.resultValue ?? campaign.kpis.leads;
  if (!Number.isFinite(spend) || !Number.isFinite(resultCount) || !resultCount) {
    return undefined;
  }
  return (spend as number) / (resultCount as number);
};

const formatCampaignMetric = (label: string | undefined, value: number | undefined): string => {
  if (!label) {
    return `результаты: ${formatIntegerValue(value ?? 0)}`;
  }
  return `${formatIntegerValue(value ?? 0)} ${label.toLowerCase()}`;
};

const buildCampaignLines = (project: AutoReportProjectEntry, currency: string | null): string[] => {
  const lines: string[] = ["Активные кампании:"];
  if (!project.report.campaigns.length) {
    lines.push("• данных нет");
    return lines;
  }
  project.report.campaigns.slice(0, 5).forEach((campaign) => {
    const icon = campaignStatusIcon(campaign.status, campaign.effectiveStatus);
    const name = buildCampaignReportName(campaign.name);
    const metric = formatCampaignMetric(
      campaign.primaryMetricLabel ?? campaign.resultLabel,
      campaign.primaryMetricValue ?? campaign.resultValue ?? campaign.kpis.leads,
    );
    const cpaValue = resolveCampaignCpa(campaign);
    lines.push(`${icon} ${name} — ${metric}, CPA ${formatCurrencyValue(cpaValue, currency)}`);
  });
  return lines;
};

const buildProjectBlock = (project: AutoReportProjectEntry, currency: string | null): string[] => {
  const lines: string[] = [];
  const client = project.chatTitle || project.chatLink || project.projectName;
  lines.push(`• ${client}`);
  const leadsValue = project.report.kpis.leads ?? project.leads.total ?? 0;
  lines.push(`Лиды: ${formatIntegerValue(leadsValue)}`);
  lines.push(`CPA: ${formatCurrencyValue(project.report.kpis.cpa, currency)}`);
  const spendSource = project.report.kpis.spend ?? project.spend.amount ?? 0;
  lines.push(`Расход: ${formatCurrencyValue(spendSource, currency)}`);
  lines.push(`CTR: ${formatPercentValue(project.report.kpis.ctr)}`);
  lines.push(`CPC: ${formatCurrencyValue(project.report.kpis.cpc, currency)}`);
  lines.push("");
  lines.push(...buildCampaignLines(project, currency));
  return lines;
};

const buildDatasetText = (dataset: AutoReportDataset, filters: { datePreset?: string }): string => {
  if (!dataset.projects.length) {
    return "Нет подключенных проектов. Добавьте проект через Meta-аккаунты.";
  }

  const preset = (filters.datePreset ?? "today").toLowerCase();
  const reference = dataset.projects[0]?.report;
  const startDate = reference ? new Date(`${reference.date_start}T00:00:00Z`) : new Date(dataset.generatedAt);
  const endDate = reference ? new Date(`${reference.date_end}T00:00:00Z`) : new Date(dataset.generatedAt);
  const sameDay = startDate.getUTCFullYear() === endDate.getUTCFullYear()
    && startDate.getUTCMonth() === endDate.getUTCMonth()
    && startDate.getUTCDate() === endDate.getUTCDate();

  const lines: string[] = [];

  if (sameDay) {
    const dateLabel = formatRuDateLabel(endDate);
    const weekday = formatWeekdayLabel(endDate);
    lines.push(`⏰ Отчёт за ${dateLabel}${weekday ? ` [${weekday}]` : ""}`);
  } else {
    const startLabel = `${formatRuDateLabel(startDate)} [${formatWeekdayLabel(startDate)}]`;
    const endLabel = `${formatRuDateLabel(endDate)} [${formatWeekdayLabel(endDate)}]`;
    if (preset === "last_7d") {
      lines.push("📅 Отчёт за неделю");
    } else {
      lines.push("📅 Отчёт за период");
    }
    lines.push(`Период: ${startLabel} → ${endLabel}`);
  }

  lines.push("");
  dataset.projects.forEach((project, index) => {
    const currency = project.spend.currency ?? "USD";
    if (index > 0) {
      lines.push("");
    }
    lines.push(...buildProjectBlock(project, currency));
  });

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
};

export const composeReportText = (
  dataset: AutoReportDataset,
  filters: { datePreset?: string },
): string => buildDatasetText(dataset, filters);

export const generateReport = async (
  env: EnvBindings & Record<string, unknown>,
  options: GenerateReportOptions = {},
): Promise<GenerateReportResult> => {
  const filters = resolveFilters(options);
  const explicitIds = Array.isArray(options.projectIds) ? options.projectIds : null;
  const targetIds = explicitIds && explicitIds.length
    ? Array.from(new Set(explicitIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim())))
    : (await listProjects(env).catch(() => []))
        .map((project) => project.id)
        .filter((id) => typeof id === "string" && id);
  await Promise.all(
    targetIds.map((projectId) =>
      syncProjectLeads(env, projectId).catch((error) => {
        console.warn("Failed to sync leads before report", projectId, (error as Error).message);
      }),
    ),
  );
  const summaries = sortProjectSummaries(await summarizeProjects(env, { projectIds: options.projectIds }));
  const accounts = await accountSpendMap(env, options.includeMeta !== false, filters);
  const overrides = await collectPreferredCampaignSpend(env, summaries, filters);
  const contextMap = await collectProjectMetricContext(env, summaries);
  const campaignMap = await collectProjectCampaigns(env, summaries, filters);
  const portalRecords = await listPortals(env);
  const portalLookup = new Map<string, PortalLinkEntry>();
  for (const record of portalRecords) {
    portalLookup.set(record.projectId, resolvePortalLink(env, record.projectId, record.portalId));
  }
  for (const summary of summaries) {
    if (!portalLookup.has(summary.id)) {
      portalLookup.set(summary.id, resolvePortalLink(env, summary.id));
    }
  }
  const generatedAt = new Date();
  const generatedAtIso = generatedAt.toISOString();
  const periodLabel = describePeriod(filters);
  const dataset = buildAutoReportDataset(
    summaries,
    accounts,
    overrides,
    contextMap,
    campaignMap,
    portalLookup,
    periodLabel,
    generatedAtIso,
    filters,
  );
  const objectiveKpiRecord = Object.fromEntries(
    dataset.projects.map((project) => [project.projectId, project.metrics]),
  ) as Record<string, PortalMetricKey[]>;

  const defaultTitle = options.type === "detailed" ? "Автоотчёт по проектам" : "Сводка по проектам";
  const title = options.title || `${defaultTitle} (${periodLabel})`;
  const format = options.format || "text";
  const plain = composeReportText(dataset, filters);

  const projectIds = summaries.map((summary) => summary.id);
  const id = createId();
  const record: ReportRecord = {
    id,
    projectId: projectIds.length === 1 ? projectIds[0] : GLOBAL_PROJECT_ID,
    type: options.type || "summary",
    title,
    format,
    url: `/api/reports/${id}/content`,
    generatedAt: generatedAtIso,
    createdAt: generatedAtIso,
    updatedAt: generatedAtIso,
    projectIds,
    filters,
    summary: plain,
    channel: options.channel,
    generatedBy: options.triggeredBy,
    metadata: {
      periodLabel,
      command: options.command,
      includeMeta: options.includeMeta !== false,
      objectiveKpis: objectiveKpiRecord,
      autoReport: dataset as unknown as JsonValue,
    },
  };

  await appendReportRecord(env, record);

  const assetContent = plain;
  const contentType = "text/plain; charset=utf-8";
  await saveReportAsset(env, record.id, assetContent, contentType);

  return { record, text: plain, dataset };
};

