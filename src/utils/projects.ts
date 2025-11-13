import {
  JsonObject,
  ProjectSettings,
  ProjectReportFrequency,
  ProjectReportPreferences,
  PortalMetricKey,
  LeadRecord,
  PaymentRecord,
  ProjectBillingSummary,
  ProjectLeadStats,
  ProjectSummary,
} from "../types";
import { EnvBindings, listLeads, listPayments, listProjects } from "./storage";
import { KPI_LABELS } from "./kpi";

export interface SummarizeProjectsOptions {
  projectIds?: string[];
}

const ensureObject = (value: unknown): JsonObject => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as JsonObject) };
  }
  return {};
};

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  reportFrequency: "daily",
  quietWeekends: false,
  silentReports: false,
  leadAlerts: true,
};

const DEFAULT_REPORT_METRICS: PortalMetricKey[] = [
  "leads_total",
  "leads_new",
  "leads_done",
  "spend",
  "impressions",
  "clicks",
];

const AVAILABLE_REPORT_METRICS = new Set<PortalMetricKey>(
  Object.keys(KPI_LABELS) as PortalMetricKey[],
);

export const DEFAULT_REPORT_PREFERENCES: ProjectReportPreferences = {
  campaignIds: [],
  metrics: [...DEFAULT_REPORT_METRICS],
};

const sanitizeMetrics = (values: unknown): PortalMetricKey[] => {
  if (!Array.isArray(values)) {
    return [...DEFAULT_REPORT_METRICS];
  }
  const normalized = values
    .map((value) => String(value).trim())
    .filter((value): value is PortalMetricKey => AVAILABLE_REPORT_METRICS.has(value as PortalMetricKey));
  return normalized.length ? normalized : [...DEFAULT_REPORT_METRICS];
};

const sanitizeCampaignIds = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  const unique = new Set<string>();
  values.forEach((value) => {
    const id = String(value).trim();
    if (id) {
      unique.add(id);
    }
  });
  return Array.from(unique);
};

export const extractProjectSettings = (raw: unknown): ProjectSettings => {
  const settings = ensureObject(raw);
  const reports = ensureObject(settings["reports"]);
  const auto = ensureObject(reports["auto"]);
  const alerts = ensureObject(settings["alerts"]);
  const frequency = (auto["frequency"] as ProjectReportFrequency) === "weekly" ? "weekly" : "daily";
  return {
    reportFrequency: frequency,
    quietWeekends: auto["quietWeekends"] === true,
    silentReports: auto["silent"] === true,
    leadAlerts: alerts["leads"] !== false,
  } satisfies ProjectSettings;
};

export const applyProjectSettingsPatch = (
  current: unknown,
  patch: Partial<ProjectSettings>,
): JsonObject => {
  const settings = ensureObject(current);
  const reports = ensureObject(settings["reports"]);
  const auto = ensureObject(reports["auto"]);
  const alerts = ensureObject(settings["alerts"]);

  if (patch.reportFrequency) {
    auto["frequency"] = patch.reportFrequency;
  }
  if (patch.quietWeekends !== undefined) {
    auto["quietWeekends"] = patch.quietWeekends;
  }
  if (patch.silentReports !== undefined) {
    auto["silent"] = patch.silentReports;
  }
  if (patch.leadAlerts !== undefined) {
    alerts["leads"] = patch.leadAlerts;
  }

  reports["auto"] = auto;
  settings["reports"] = reports;
  settings["alerts"] = alerts;

  return settings;
};

export const extractProjectReportPreferences = (raw: unknown): ProjectReportPreferences => {
  const settings = ensureObject(raw);
  const reports = ensureObject(settings["reports"]);
  const preferences = ensureObject(reports["preferences"]);

  const campaignSource = Array.isArray(reports["defaultCampaignIds"])
    ? reports["defaultCampaignIds"]
    : Array.isArray(preferences["campaignIds"])
      ? preferences["campaignIds"]
      : [];

  const metricsSource = Array.isArray(reports["metrics"])
    ? reports["metrics"]
    : Array.isArray(preferences["metrics"])
      ? preferences["metrics"]
      : Array.isArray((reports as { defaultMetrics?: unknown[] }).defaultMetrics)
        ? (reports as { defaultMetrics?: unknown[] }).defaultMetrics
        : undefined;

  return {
    campaignIds: sanitizeCampaignIds(campaignSource),
    metrics: sanitizeMetrics(metricsSource),
  } satisfies ProjectReportPreferences;
};

export const applyProjectReportPreferencesPatch = (
  current: unknown,
  patch: Partial<ProjectReportPreferences>,
): JsonObject => {
  if (!patch.campaignIds && !patch.metrics) {
    return ensureObject(current);
  }
  const settings = ensureObject(current);
  const reports = ensureObject(settings["reports"]);
  const preferences = ensureObject(reports["preferences"]);

  if (patch.campaignIds) {
    const campaigns = sanitizeCampaignIds(patch.campaignIds);
    reports["defaultCampaignIds"] = campaigns;
    if (campaigns.length) {
      preferences["campaignIds"] = campaigns;
    } else {
      delete preferences["campaignIds"];
    }
  }

  if (patch.metrics) {
    const metrics = sanitizeMetrics(patch.metrics);
    reports["metrics"] = metrics;
    preferences["metrics"] = metrics;
  }

  if (Object.keys(preferences).length) {
    reports["preferences"] = preferences;
  } else {
    delete reports["preferences"];
  }

  settings["reports"] = reports;
  return settings;
};

const summarizeLeads = (leads: LeadRecord[]): ProjectLeadStats => {
  let latestTimestamp = 0;
  let newCount = 0;
  let doneCount = 0;

  for (const lead of leads) {
    const created = Date.parse(lead.createdAt);
    if (!Number.isNaN(created) && created > latestTimestamp) {
      latestTimestamp = created;
    }

    if (lead.status === "done") {
      doneCount += 1;
    } else {
      newCount += 1;
    }
  }

  return {
    total: leads.length,
    new: newCount,
    done: doneCount,
    latestAt: latestTimestamp ? new Date(latestTimestamp).toISOString() : undefined,
  };
};

const formatCurrency = (amount: number | undefined, currency: string | undefined): string | undefined => {
  if (amount === undefined) {
    return undefined;
  }
  const safeCurrency = currency && /^[A-Z]{3}$/.test(currency) ? currency : "USD";
  try {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency: safeCurrency }).format(amount);
  } catch (error) {
    console.warn("Failed to format currency", safeCurrency, error);
    return `${amount.toFixed(2)} ${safeCurrency}`;
  }
};

const formatDateRange = (start?: string, end?: string): string | undefined => {
  const formatDate = (value?: string) => {
    if (!value) {
      return undefined;
    }
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      return undefined;
    }
    return new Intl.DateTimeFormat("ru-RU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(parsed));
  };

  const startLabel = formatDate(start);
  const endLabel = formatDate(end);
  if (startLabel && endLabel) {
    return `${startLabel} — ${endLabel}`;
  }
  return startLabel ?? endLabel ?? undefined;
};

const detectBillingStatus = (payment: PaymentRecord | undefined): ProjectBillingSummary => {
  if (!payment) {
    return {
      status: "missing",
      active: false,
      overdue: false,
    };
  }

  const now = Date.now();
  const periodEndTime = payment.periodEnd ? Date.parse(payment.periodEnd) : Number.NaN;
  const isPeriodPast = Number.isFinite(periodEndTime) ? periodEndTime < now : false;
  const overdue = payment.status === "overdue" || (payment.status !== "active" && isPeriodPast);
  const active = !overdue && (payment.status === "active" || payment.status === "pending");

  return {
    status: payment.status,
    active,
    overdue,
    amount: payment.amount,
    currency: payment.currency,
    amountFormatted: formatCurrency(payment.amount, payment.currency),
    periodStart: payment.periodStart,
    periodEnd: payment.periodEnd,
    periodLabel: formatDateRange(payment.periodStart, payment.periodEnd),
    paidAt: payment.paidAt ?? null,
    updatedAt: payment.updatedAt,
    notes: payment.notes,
  };
};

const latestPayment = (payments: PaymentRecord[]): PaymentRecord | undefined => {
  if (!payments.length) {
    return undefined;
  }
  return [...payments].sort((a, b) => {
    const aTime = Date.parse(a.periodEnd || a.updatedAt || a.createdAt);
    const bTime = Date.parse(b.periodEnd || b.updatedAt || b.createdAt);
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) {
      return 0;
    }
    if (Number.isNaN(aTime)) {
      return 1;
    }
    if (Number.isNaN(bTime)) {
      return -1;
    }
    return bTime - aTime;
  })[0];
};

const summarizeBilling = (payments: PaymentRecord[]): ProjectBillingSummary => {
  return detectBillingStatus(latestPayment(payments));
};

export const summarizeProjects = async (
  env: EnvBindings,
  options: SummarizeProjectsOptions = {},
): Promise<ProjectSummary[]> => {
  const [projects, payments] = await Promise.all([
    listProjects(env),
    listPayments(env).catch(() => [] as PaymentRecord[]),
  ]);
  const ids = options.projectIds?.length ? new Set(options.projectIds) : null;
  const targetProjects = ids ? projects.filter((project) => ids.has(project.id)) : projects;

  const paymentsByProject = new Map<string, PaymentRecord[]>();
  for (const payment of payments) {
    if (!paymentsByProject.has(payment.projectId)) {
      paymentsByProject.set(payment.projectId, []);
    }
    paymentsByProject.get(payment.projectId)!.push(payment);
  }

  const summaries = await Promise.all(
    targetProjects.map(async (project) => {
      const leads = await listLeads(env, project.id).catch(() => [] as LeadRecord[]);
      const billing = summarizeBilling(paymentsByProject.get(project.id) ?? []);
      return {
        ...project,
        leadStats: summarizeLeads(leads),
        billing,
      } satisfies ProjectSummary;
    }),
  );

  return summaries;
};

export const sortProjectSummaries = (summaries: ProjectSummary[]): ProjectSummary[] => {
  return [...summaries].sort((a, b) => {
    if (b.leadStats.new !== a.leadStats.new) {
      return b.leadStats.new - a.leadStats.new;
    }

    const bLatest = b.leadStats.latestAt ? Date.parse(b.leadStats.latestAt) : 0;
    const aLatest = a.leadStats.latestAt ? Date.parse(a.leadStats.latestAt) : 0;
    if (bLatest !== aLatest) {
      return bLatest - aLatest;
    }

    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
};

export const projectLeadStats = {
  summarizeLeads,
};

export const projectBilling = {
  summarize: summarizeBilling,
};
