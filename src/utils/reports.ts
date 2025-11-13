import {
  AutoReportDataset,
  AutoReportProjectEntry,
  JsonValue,
  MetaAdAccount,
  PortalMetricKey,
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
} from "./storage";
import { summarizeProjects, sortProjectSummaries, extractProjectReportPreferences } from "./projects";
import { createId } from "./ids";
import { fetchAdAccounts, fetchCampaigns, withMetaSettings } from "./meta";
import { syncCampaignObjectives, getCampaignKPIs, applyKpiSelection } from "./kpi";

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

const collectProjectObjectiveMetrics = async (
  env: EnvBindings,
  summaries: ProjectSummary[],
): Promise<Map<string, PortalMetricKey[]>> => {
  const entries = await Promise.all(
    summaries.map(async (summary) => {
      try {
        const [objectives, campaignKpis] = await Promise.all([
          listCampaignObjectivesForProject(env, summary.id),
          listProjectCampaignKpis(env, summary.id).catch(() => ({} as Record<string, PortalMetricKey[]>)),
        ]);
        const metrics = new Set<PortalMetricKey>();
        Object.entries(objectives).forEach(([campaignId, objective]) => {
          const normalized = typeof objective === "string" && objective.trim() ? objective : null;
          const selection = applyKpiSelection({
            objective: normalized,
            projectManual: summary.manualKpi,
            campaignManual: campaignKpis[campaignId],
          });
          selection.forEach((metric) => metrics.add(metric));
        });
        if (!metrics.size) {
          const fallback = applyKpiSelection({ objective: null, projectManual: summary.manualKpi });
          fallback.forEach((metric) => metrics.add(metric));
        }
        return [summary.id, Array.from(metrics)] as const;
      } catch (error) {
        console.warn("Failed to resolve campaign objectives for report", summary.id, error);
        const fallback = applyKpiSelection({ objective: null, projectManual: summary.manualKpi });
        return [summary.id, fallback] as const;
      }
    }),
  );
  return new Map(entries);
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
  objectiveMetrics: Map<string, PortalMetricKey[]>,
  portals: Map<string, PortalLinkEntry>,
  periodLabel: string,
  generatedAt: string,
  filters: { datePreset?: string; since?: string; until?: string },
): AutoReportDataset => {
  const projects: AutoReportProjectEntry[] = summaries.map((summary) => {
    const account = summary.adAccountId ? accounts.get(summary.adAccountId) : undefined;
    const override = overrides.get(summary.id);
    const storedMetrics = objectiveMetrics.get(summary.id) ?? [];
    const derivedMetrics = storedMetrics.length
      ? storedMetrics
      : applyKpiSelection({ objective: null, projectManual: summary.manualKpi });
    const metrics = derivedMetrics.length ? derivedMetrics : getCampaignKPIs("LEAD_GENERATION");
    const portal = portals.get(summary.id);
    const spendAmount =
      override?.spend ??
      (typeof account?.spend === "number" && Number.isFinite(account.spend) ? account.spend : null);
    const spendCurrency = override?.currency ?? account?.spendCurrency ?? account?.currency ?? null;
    const spendPeriod = override?.period ?? account?.spendPeriod ?? filters.datePreset ?? null;
    const spendLabel = override?.label ?? formatSpend(account) ?? "—";

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
    projects,
  };
};

const buildPlainText = (
  title: string,
  period: string,
  rows: {
    name: string;
    leads: { total: number; new: number; done: number };
    billing: string;
    spend?: string;
  }[],
): string => {
  const lines: string[] = [];
  lines.push(`${title}`);
  lines.push(`Период: ${period}`);
  lines.push("");
  if (!rows.length) {
    lines.push("Нет проектов для отчёта.");
  } else {
    for (const row of rows) {
      lines.push(`• ${row.name}`);
      lines.push(`  Лиды: ${row.leads.total} (новые ${row.leads.new}, завершено ${row.leads.done})`);
      lines.push(`  Биллинг: ${row.billing}`);
      lines.push(`  Расход: ${row.spend ?? "—"}`);
      lines.push("");
    }
  }
  return lines.join("\n");
};

export const generateReport = async (
  env: EnvBindings & Record<string, unknown>,
  options: GenerateReportOptions = {},
): Promise<GenerateReportResult> => {
  const filters = resolveFilters(options);
  const summaries = sortProjectSummaries(await summarizeProjects(env, { projectIds: options.projectIds }));
  const accounts = await accountSpendMap(env, options.includeMeta !== false, filters);
  const overrides = await collectPreferredCampaignSpend(env, summaries, filters);
  const objectiveMetrics = await collectProjectObjectiveMetrics(env, summaries);
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
    objectiveMetrics,
    portalLookup,
    periodLabel,
    generatedAtIso,
    filters,
  );
  const objectiveKpiRecord = Object.fromEntries(
    dataset.projects.map((project) => [project.projectId, project.metrics]),
  ) as Record<string, PortalMetricKey[]>;

  const displayRows = dataset.projects.map((project) => ({
    name: project.projectName,
    leads: project.leads,
    billing: project.billing.label,
    spend: project.spend.label === "—" ? undefined : project.spend.label,
  }));

  const defaultTitle = options.type === "detailed" ? "Автоотчёт по проектам" : "Сводка по проектам";
  const title = options.title || `${defaultTitle} (${periodLabel})`;
  const format = options.format || "text";
  const plain = buildPlainText(title, periodLabel, displayRows);

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

