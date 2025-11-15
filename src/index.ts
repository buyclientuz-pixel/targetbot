import {
  handleMetaAdAccounts,
  handleMetaCampaigns,
  handleMetaOAuthCallback,
  handleMetaOAuthStart,
  handleMetaRefresh,
  handleMetaStatus,
} from "./api/meta";
import {
  handleProjectDelete,
  handleProjectGet,
  handleProjectUpdate,
  handleProjectsCreate,
  handleProjectsList,
} from "./api/projects";
import {
  handleLeadCreate,
  handleLeadUpdateStatus,
  handleLeadsList,
} from "./api/leads";
import {
  handlePaymentDelete,
  handlePaymentsCreate,
  handlePaymentsList,
  handlePaymentUpdate,
} from "./api/payments";
import {
  handleUserDelete,
  handleUserUpdate,
  handleUsersCreate,
  handleUsersList,
} from "./api/users";
import {
  handleReportContent,
  handleReportDelete,
  handleReportGet,
  handleReportsCreate,
  handleReportsGenerate,
  handleReportsList,
} from "./api/reports";
import {
  handleReportSchedulesCreate,
  handleReportSchedulesDelete,
  handleReportSchedulesList,
  handleReportSchedulesUpdate,
} from "./api/report-schedules";
import {
  handleSettingGet,
  handleSettingsList,
  handleSettingsUpsert,
} from "./api/settings";
import { handleCommandLogsList } from "./api/logs";
import { handleTelegramWebhookRefresh } from "./api/manage";
import { handleLegacyReportRequest } from "./api/report-legacy";
import { AdminFlashMessage, renderAdminDashboard } from "./admin/index";
import { renderUsersPage } from "./admin/users";
import { renderProjectForm } from "./admin/project-form";
import { renderPaymentsPage } from "./admin/payments";
import { renderSettingsPage } from "./admin/settings";
import { renderPortal } from "./views/portal";
import { htmlResponse, jsonResponse } from "./utils/http";
import { normalizeCampaigns } from "./utils/campaigns";
import {
  EnvBindings,
  listCommandLogs,
  listPayments,
  listProjects,
  listReports,
  listSettings,
  listUsers,
  loadMetaToken,
  loadProject,
  loadPortalById,
  loadPortalByProjectId,
  migrateProjectsStructure,
  readPortalReportCache,
  writePortalReportCache,
  readPortalSnapshotCache,
  writePortalSnapshotCache,
} from "./utils/storage";
import { fetchAdAccounts, fetchCampaigns, resolveMetaStatus, withMetaSettings } from "./utils/meta";
import {
  projectBilling,
  summarizeProjects,
  sortProjectSummaries,
  isProjectAutoDisabled,
  extractProjectReportPreferences,
} from "./utils/projects";
import {
  LeadRecord,
  MetaCampaign,
  NormalizedCampaign,
  PortalMetricEntry,
  PortalMetricKey,
  PortalPagination,
  PortalSnapshotPayload,
  PortalStatusCounts,
  ProjectBillingSummary,
  ProjectPortalRecord,
  ProjectRecord,
  ProjectSummary,
  PortalLeadView,
  PortalComputationResult,
  PortalSnapshotDataSource,
  PortalSnapshotCacheDescriptor,
} from "./types";
import { collectProjectMetricContext, buildProjectReportEntry } from "./utils/reports";
import { handleTelegramUpdate } from "./bot/router";
import { handleMetaWebhook } from "./api/meta-webhook";
import { runReminderSweep } from "./utils/reminders";
import { runReportSchedules } from "./utils/report-scheduler";
import { runAutoReportEngine } from "./utils/auto-report-engine";
import { TelegramEnv } from "./utils/telegram";
import { runRegressionChecks } from "./utils/qa";
import { KPI_LABELS, syncCampaignObjectives } from "./utils/kpi";
import { syncProjectLeads, getProjectLeads } from "./utils/leads";

const ensureEnv = (env: unknown): EnvBindings & Record<string, unknown> => {
  if (!env || typeof env !== "object" || !("DB" in env) || !("R2" in env)) {
    throw new Error("Env bindings are not configured");
  }
  return env as EnvBindings & Record<string, unknown>;
};

const notFound = () => new Response("Not found", { status: 404 });

const withCors = (response: Response): Response => {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-headers", "content-type");
  headers.set("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  return new Response(response.body, { ...response, headers });
};

const PORTAL_PAGE_SIZE = 10;
const PORTAL_SNAPSHOT_CACHE_TTL_SECONDS = 120;
const PORTAL_CACHE_TTL_MS = PORTAL_SNAPSHOT_CACHE_TTL_SECONDS * 1000;
const PORTAL_COMPUTE_TIMEOUT_MS = 3500;

type WorkerExecutionContext = { waitUntil(promise: Promise<unknown>): void };
type PortalLogger = (event: string, meta?: Record<string, unknown>) => void;

const createPortalLogger = (requestId: string): PortalLogger => {
  return (event, meta = {}) => {
    console.log(`[portal] ${event}`, { requestId, ...meta });
  };
};

interface PortalPeriodSelection {
  key: string;
  label: string;
  since: Date | null;
  until: Date | null;
  datePreset: string;
}

const toUtcStart = (value: Date): Date => {
  const copy = new Date(value);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
};

const toUtcEnd = (value: Date): Date => {
  const copy = new Date(value);
  copy.setUTCHours(23, 59, 59, 999);
  return copy;
};

const formatRuDate = (value: Date): string => {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
};

const resolvePortalPeriod = (raw: string | null, now: Date): PortalPeriodSelection => {
  const key = (raw ?? "today").toLowerCase();
  const todayStart = toUtcStart(now);
  const todayEnd = toUtcEnd(now);

  switch (key) {
    case "yesterday": {
      const start = toUtcStart(new Date(now.getTime() - 24 * 60 * 60 * 1000));
      return { key: "yesterday", label: "Вчера", since: start, until: toUtcEnd(start), datePreset: "yesterday" };
    }
    case "week": {
      const start = toUtcStart(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
      return { key: "week", label: "Неделя", since: start, until: todayEnd, datePreset: "last_7d" };
    }
    case "month": {
      const start = toUtcStart(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));
      return { key: "month", label: "Месяц", since: start, until: todayEnd, datePreset: "last_30d" };
    }
    case "max": {
      return { key: "max", label: "Максимум", since: null, until: null, datePreset: "lifetime" };
    }
    case "today":
    default:
      return { key: "today", label: "Сегодня", since: todayStart, until: todayEnd, datePreset: "today" };
  }
};

const isoDay = (value: Date | null): string | null => {
  if (!value) {
    return null;
  }
  const copy = new Date(value.getTime());
  copy.setUTCHours(0, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
};

const resolveLeadType = (lead: LeadRecord): PortalLeadView["type"] => {
  if (lead.phone && lead.phone.trim()) {
    return "Контакт";
  }
  const objective = lead.campaignObjective ? lead.campaignObjective.toUpperCase() : "";
  if (objective.includes("MESSAGE")) {
    return "Сообщение";
  }
  return "Сообщение";
};

const toPortalLeadView = (lead: LeadRecord): PortalLeadView => {
  const adLabel = lead.adName && lead.adName.trim() ? lead.adName.trim() : null;
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone ?? null,
    status: lead.status,
    createdAt: lead.createdAt,
    adLabel,
    type: resolveLeadType(lead),
  };
};

const toIsoDate = (value: Date | null, now: Date): string => {
  if (!value) {
    const today = new Date(now.getTime());
    today.setUTCHours(0, 0, 0, 0);
    return today.toISOString().slice(0, 10);
  }
  const copy = new Date(value.getTime());
  copy.setUTCHours(0, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
};

const formatPeriodLabel = (periodSelection: PortalPeriodSelection): string => {
  if (periodSelection.since && periodSelection.until) {
    const startLabel = formatRuDate(periodSelection.since);
    const endLabel = formatRuDate(periodSelection.until);
    return startLabel === endLabel
      ? `${periodSelection.label} · ${startLabel}`
      : `${periodSelection.label} · ${startLabel} — ${endLabel}`;
  }
  return periodSelection.label;
};

interface PortalBaseComputation {
  billing: ProjectBillingSummary;
  statusCounts: PortalStatusCounts;
  page: number;
  totalPages: number;
  leads: PortalLeadView[];
  periodLabel: string;
  summary: ProjectSummary;
  preferenceInput: { campaignIds: string[]; metrics: PortalMetricKey[] };
}

const preparePortalBaseData = async (
  bindings: EnvBindings,
  project: ProjectRecord,
  portalRecord: ProjectPortalRecord,
  periodSelection: PortalPeriodSelection,
  requestedPage: number,
  now: Date,
  logger?: PortalLogger,
): Promise<PortalBaseComputation> => {
  const [allLeads, payments] = await Promise.all([
    getProjectLeads(bindings, project.id),
    listPayments(bindings),
  ]);

  logger?.("leads_loaded", { projectId: project.id, count: allLeads.length });

  const billing = projectBilling.summarize(payments.filter((entry) => entry.projectId === project.id));

  const sinceMs = periodSelection.since ? periodSelection.since.getTime() : null;
  const untilMs = periodSelection.until ? periodSelection.until.getTime() : null;

  const leadsInPeriod = allLeads.filter((lead) => {
    const created = Date.parse(lead.createdAt);
    if (Number.isNaN(created)) {
      return true;
    }
    if (sinceMs !== null && created < sinceMs) {
      return false;
    }
    if (untilMs !== null && created > untilMs) {
      return false;
    }
    return true;
  });

  logger?.("leads_filtered", { projectId: project.id, count: leadsInPeriod.length });

  const statusCounts = leadsInPeriod.reduce<PortalStatusCounts>(
    (acc, lead) => {
      acc.all += 1;
      if (lead.status === "done") {
        acc.done += 1;
      } else {
        acc.new += 1;
      }
      return acc;
    },
    { all: 0, new: 0, done: 0 },
  );

  const totalPages = Math.max(1, Math.ceil(leadsInPeriod.length / PORTAL_PAGE_SIZE));
  const safePage = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
  const page = Math.min(safePage, totalPages);
  const offset = (page - 1) * PORTAL_PAGE_SIZE;
  const paginatedLeads = leadsInPeriod.slice(offset, offset + PORTAL_PAGE_SIZE);
  const leadViews = paginatedLeads.map(toPortalLeadView);

  const latestLeadTimestamp = leadsInPeriod.reduce((acc, lead) => {
    const created = Date.parse(lead.createdAt);
    if (!Number.isNaN(created) && created > acc) {
      return created;
    }
    return acc;
  }, 0);

  const summary: ProjectSummary = {
    ...project,
    leadStats: {
      total: statusCounts.all,
      new: statusCounts.new,
      done: statusCounts.done,
      latestAt: latestLeadTimestamp ? new Date(latestLeadTimestamp).toISOString() : undefined,
    },
    billing,
  };

  const preferences = extractProjectReportPreferences(project.settings ?? {});
  const preferenceInput = {
    campaignIds:
      portalRecord.mode === "manual" && portalRecord.campaignIds.length
        ? portalRecord.campaignIds
        : preferences.campaignIds,
    metrics: portalRecord.metrics.length ? portalRecord.metrics : preferences.metrics,
  };

  const periodLabel = formatPeriodLabel(periodSelection);

  return {
    billing,
    statusCounts,
    page,
    totalPages,
    leads: leadViews,
    periodLabel,
    summary,
    preferenceInput,
  };
};

interface PortalCampaignLoadResult {
  campaigns: MetaCampaign[];
  fetchedAt: string;
  source: PortalSnapshotDataSource;
}

interface PortalReportPeriod {
  key: string;
  datePreset?: string | null;
  since?: string | null;
  until?: string | null;
}

const loadPortalCampaigns = async (
  bindings: EnvBindings,
  extendedEnv: EnvBindings & Record<string, unknown>,
  project: ProjectRecord,
  portalRecord: ProjectPortalRecord,
  accountId: string | null,
  period: PortalReportPeriod,
  options: { ctx?: WorkerExecutionContext | null; logger?: PortalLogger; allowDeferred: boolean },
): Promise<PortalCampaignLoadResult> => {
  const logger = options.logger;
  if (!accountId) {
    logger?.("campaign_fetch_skipped", { projectId: project.id, reason: "missing_account" });
    return { campaigns: [], fetchedAt: new Date().toISOString(), source: "skipped" };
  }

  const reportPeriod: PortalReportPeriod = {
    key: period.key,
    datePreset: period.datePreset ?? null,
    since: period.since ?? null,
    until: period.until ?? null,
  };

  logger?.("campaign_cache_lookup", {
    projectId: project.id,
    accountId,
    preset: reportPeriod.datePreset ?? null,
  });

  let campaigns: MetaCampaign[] = [];
  let fetchedAt = new Date().toISOString();
  let source: PortalSnapshotDataSource = "error";

  const cached = await readPortalReportCache(bindings, accountId, reportPeriod).catch((error) => {
    logger?.("campaign_cache_error", {
      projectId: project.id,
      accountId,
      message: (error as Error).message,
    });
    return null;
  });

  if (cached?.campaigns?.length) {
    campaigns = cached.campaigns as MetaCampaign[];
    fetchedAt = cached.fetchedAt;
    source = "cache";
    logger?.("campaign_cache_hit", {
      projectId: project.id,
      accountId,
      count: campaigns.length,
    });
  } else {
    logger?.("campaign_cache_miss", { projectId: project.id, accountId });
  }

  const fetchLimit =
    portalRecord.mode === "manual" && portalRecord.campaignIds.length
      ? Math.max(10, portalRecord.campaignIds.length || 10)
      : 25;

  const persistCampaigns = async (data: MetaCampaign[], timestamp: string) => {
    await writePortalReportCache(bindings, accountId, reportPeriod, data).catch((error) => {
      logger?.("campaign_cache_write_failed", {
        projectId: project.id,
        accountId,
        message: (error as Error).message,
      });
    });
    await syncCampaignObjectives(bindings, project.id, data).catch((error) => {
      logger?.("campaign_objective_sync_failed", {
        projectId: project.id,
        accountId,
        message: (error as Error).message,
      });
    });
  };

  const performFetch = async (): Promise<{ campaigns: MetaCampaign[]; fetchedAt: string }> => {
    logger?.("campaign_fetch_start", { projectId: project.id, accountId });
    const token = await loadMetaToken(bindings);
    if (!token?.accessToken) {
      throw new Error("meta_token_missing");
    }
    const metaEnv = await withMetaSettings(extendedEnv);
    const fetched = await fetchCampaigns(metaEnv, token, accountId, {
      limit: fetchLimit,
      datePreset: reportPeriod.datePreset ?? undefined,
      since: reportPeriod.since ?? undefined,
      until: reportPeriod.until ?? undefined,
    });
    const timestamp = new Date().toISOString();
    await persistCampaigns(fetched, timestamp);
    logger?.("campaign_fetch_success", {
      projectId: project.id,
      accountId,
      count: fetched.length,
    });
    return { campaigns: fetched, fetchedAt: timestamp };
  };

  const scheduleDeferredFetch = () => {
    if (!options.ctx) {
      return;
    }
    options.ctx.waitUntil(
      performFetch().catch((error) => {
        logger?.("campaign_fetch_failed", {
          projectId: project.id,
          accountId,
          message: (error as Error).message,
          stage: "deferred",
        });
      }),
    );
  };

  if (!campaigns.length) {
    if (options.allowDeferred && options.ctx) {
      source = "deferred";
      fetchedAt = new Date().toISOString();
      scheduleDeferredFetch();
    } else {
      try {
        const result = await performFetch();
        campaigns = result.campaigns;
        fetchedAt = result.fetchedAt;
        source = "fresh";
      } catch (error) {
        logger?.("campaign_fetch_failed", {
          projectId: project.id,
          accountId,
          message: (error as Error).message,
        });
        source = "error";
      }
    }
  } else if (options.allowDeferred && options.ctx) {
    scheduleDeferredFetch();
  }

  if (!campaigns.length && source === "error") {
    fetchedAt = new Date().toISOString();
  }

  return { campaigns, fetchedAt, source };
};

const buildPortalFallbackSnapshot = async (
  bindings: EnvBindings,
  project: ProjectRecord,
  portalRecord: ProjectPortalRecord,
  periodSelection: PortalPeriodSelection,
  requestedPage: number,
  now: Date,
  logger?: PortalLogger,
): Promise<PortalComputationResult> => {
  try {
    const base = await preparePortalBaseData(bindings, project, portalRecord, periodSelection, requestedPage, now, logger);
    return {
      billing: base.billing,
      statusCounts: base.statusCounts,
      page: base.page,
      totalPages: base.totalPages,
      leads: base.leads,
      metrics: [],
      campaigns: [],
      periodLabel: base.periodLabel,
      updatedAt: new Date(now.getTime()).toISOString(),
      partial: true,
      dataSource: "fallback",
    } satisfies PortalComputationResult;
  } catch (error) {
    logger?.("snapshot_fallback_failed", {
      projectId: project.id,
      message: (error as Error).message,
    });
    return {
      billing: projectBilling.summarize([]),
      statusCounts: { all: 0, new: 0, done: 0 },
      page: 1,
      totalPages: 1,
      leads: [],
      metrics: [],
      campaigns: [],
      periodLabel: formatPeriodLabel(periodSelection),
      updatedAt: new Date(now.getTime()).toISOString(),
      partial: true,
      dataSource: "fallback",
    } satisfies PortalComputationResult;
  }
};

interface PortalComputationOptions {
  ctx?: WorkerExecutionContext | null;
  logger?: PortalLogger;
}

const computePortalSnapshot = async (
  bindings: EnvBindings,
  project: ProjectRecord,
  portalRecord: ProjectPortalRecord,
  periodSelection: PortalPeriodSelection,
  requestedPage: number,
  now: Date,
  options: PortalComputationOptions = {},
): Promise<PortalComputationResult> => {
  const extendedEnv = bindings as EnvBindings & Record<string, unknown>;
  const { ctx, logger } = options;

  const leadSyncTask = syncProjectLeads(extendedEnv, project.id)
    .then((result) => {
      logger?.("lead_sync_complete", {
        projectId: project.id,
        newLeads: result.newLeads,
        totalLeads: result.total,
      });
    })
    .catch((error) => {
      logger?.("lead_sync_failed", {
        projectId: project.id,
        message: (error as Error).message,
      });
    });

  if (ctx) {
    ctx.waitUntil(leadSyncTask);
  } else {
    await leadSyncTask;
  }

  const base = await preparePortalBaseData(bindings, project, portalRecord, periodSelection, requestedPage, now, logger);

  const accountId = project.adAccountId || project.metaAccountId || null;

  const reportPeriod = {
    key: periodSelection.key,
    datePreset: periodSelection.datePreset ?? null,
    since: isoDay(periodSelection.since),
    until: isoDay(periodSelection.until),
  };

  const campaignLoad = await loadPortalCampaigns(bindings, extendedEnv, project, portalRecord, accountId, reportPeriod, {
    ctx,
    logger,
    allowDeferred: Boolean(ctx),
  });

  const campaigns = campaignLoad.campaigns;

  const selectedCampaigns = (() => {
    if (!campaigns.length) {
      return [] as MetaCampaign[];
    }
    const sorted = campaigns.slice().sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0));
    if (portalRecord.mode === "manual" && portalRecord.campaignIds.length) {
      const ids = new Set(portalRecord.campaignIds);
      const manual = sorted.filter((campaign) => ids.has(campaign.id));
      return manual.length ? manual : sorted.slice(0, 10);
    }
    return sorted.slice(0, 10);
  })();

  const contextMap = await collectProjectMetricContext(bindings, [base.summary]);
  const context = contextMap.get(project.id);
  const { report, metrics: metricKeys } = buildProjectReportEntry(
    base.summary,
    selectedCampaigns,
    context,
    base.preferenceInput,
    { start: toIsoDate(periodSelection.since, now), end: toIsoDate(periodSelection.until, now) },
  );

  const spendCurrency =
    selectedCampaigns.find((campaign) => campaign.spendCurrency)?.spendCurrency
    || campaigns.find((campaign) => campaign.spendCurrency)?.spendCurrency
    || "USD";

  const formatNumber = (value: number): string => new Intl.NumberFormat("ru-RU").format(Math.round(value));
  const formatCurrency = (value: number | undefined): string => {
    if (value === undefined || Number.isNaN(value) || value === 0) {
      return "—";
    }
    try {
      return new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: spendCurrency,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${value.toFixed(2)} ${spendCurrency}`;
    }
  };

  const filteredMetricKeys = metricKeys.filter((key) => key !== "leads_done" && key !== "conversations");
  const metrics = filteredMetricKeys
    .map((key) => {
      const raw = (report.kpis as Record<PortalMetricKey, number | undefined>)[key];
      let value: string;
      switch (key) {
        case "spend":
        case "cpl":
        case "cpa":
        case "cpc":
        case "cpm":
        case "cpe":
        case "cpv":
        case "cpi":
        case "cpurchase":
          value = formatCurrency(raw);
          break;
        case "ctr":
          value = raw !== undefined ? `${raw.toFixed(2)}%` : "—";
          break;
        case "roas":
          value = raw !== undefined ? `${raw.toFixed(2)}x` : "—";
          break;
        case "freq":
          value = raw !== undefined ? raw.toFixed(2) : "—";
          break;
        default:
          value = raw !== undefined ? formatNumber(raw) : "—";
          break;
      }
      return { key, label: KPI_LABELS[key], value } satisfies PortalMetricEntry;
    })
    .filter((entry) => entry.value && entry.value !== "—");

  const normalizedCampaigns = normalizeCampaigns(selectedCampaigns);

  const snapshot = {
    billing: base.billing,
    statusCounts: base.statusCounts,
    page: base.page,
    totalPages: base.totalPages,
    leads: base.leads,
    metrics,
    campaigns: normalizedCampaigns,
    periodLabel: base.periodLabel,
    updatedAt: campaignLoad.fetchedAt,
    partial: campaignLoad.source === "deferred" || campaignLoad.source === "error",
    dataSource: campaignLoad.source,
  } satisfies PortalComputationResult;

  logger?.("snapshot_computed", {
    projectId: project.id,
    page: base.page,
    metrics: metrics.length,
    campaigns: normalizedCampaigns.length,
    partial: snapshot.partial ?? false,
    source: snapshot.dataSource ?? null,
  });

  return snapshot;
};

interface PortalSnapshotLoadOptions {
  ctx?: WorkerExecutionContext | null;
  logger?: PortalLogger;
}

const buildSnapshotDescriptor = (
  periodSelection: PortalPeriodSelection,
  page: number,
): PortalSnapshotCacheDescriptor => ({
  key: periodSelection.key,
  datePreset: periodSelection.datePreset,
  since: isoDay(periodSelection.since),
  until: isoDay(periodSelection.until),
  page,
});

const buildSafeFallbackSnapshot = async (
  bindings: EnvBindings,
  project: ProjectRecord,
  portalRecord: ProjectPortalRecord,
  periodSelection: PortalPeriodSelection,
  requestedPage: number,
  now: Date,
  logger?: PortalLogger,
): Promise<PortalComputationResult> => {
  try {
    return await buildPortalFallbackSnapshot(
      bindings,
      project,
      portalRecord,
      periodSelection,
      requestedPage,
      now,
      logger,
    );
  } catch (error) {
    logger?.("snapshot_fallback_unhandled", {
      projectId: project.id,
      message: (error as Error).message,
    });
    return {
      billing: projectBilling.summarize([]),
      statusCounts: { all: 0, new: 0, done: 0 },
      page: 1,
      totalPages: 1,
      leads: [],
      metrics: [],
      campaigns: [],
      periodLabel: formatPeriodLabel(periodSelection),
      updatedAt: new Date(now.getTime()).toISOString(),
      partial: true,
      dataSource: "fallback",
    } satisfies PortalComputationResult;
  }
};

const loadPortalSnapshot = async (
  bindings: EnvBindings,
  project: ProjectRecord,
  portalRecord: ProjectPortalRecord,
  periodSelection: PortalPeriodSelection,
  requestedPage: number,
  now: Date,
  options: PortalSnapshotLoadOptions = {},
): Promise<{ snapshot: PortalComputationResult; source: "fresh" | "cache" | "stale-cache" | "fallback" }> => {
  const sanitizedPage = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
  const descriptor = buildSnapshotDescriptor(periodSelection, sanitizedPage);
  const logger = options.logger;

  let cached = null;
  try {
    cached = await readPortalSnapshotCache(bindings, project.id, descriptor);
  } catch (error) {
    logger?.("snapshot_cache_error", {
      projectId: project.id,
      message: (error as Error).message,
    });
  }

  const nowMs = now.getTime();
  const cacheAgeMs = cached ? nowMs - Date.parse(cached.fetchedAt) : null;
  const cacheValid = cacheAgeMs !== null && Number.isFinite(cacheAgeMs);
  const cacheIsPartial = Boolean(cached?.data?.partial);
  const cacheIsFresh = cacheValid && !cacheIsPartial && (cacheAgeMs as number) < PORTAL_CACHE_TTL_MS;

  if (cached && cacheIsFresh) {
    logger?.("snapshot_cache_hit", {
      projectId: project.id,
      page: sanitizedPage,
      ageMs: cacheAgeMs,
    });
    if (options.ctx && cacheAgeMs !== null && cacheAgeMs > PORTAL_CACHE_TTL_MS / 2) {
      options.ctx.waitUntil(
        computePortalSnapshot(bindings, project, portalRecord, periodSelection, sanitizedPage, now, {
          ctx: options.ctx,
          logger,
        })
          .then((data) =>
            writePortalSnapshotCache(bindings, project.id, descriptor, data, PORTAL_SNAPSHOT_CACHE_TTL_SECONDS).catch(
              (error) => {
                logger?.("snapshot_cache_write_failed", {
                  projectId: project.id,
                  message: (error as Error).message,
                });
              },
            ),
          )
          .catch((error) => {
            logger?.("snapshot_refresh_failed", {
              projectId: project.id,
              message: (error as Error).message,
            });
          }),
      );
    }
    if (!cached.data.dataSource) {
      cached.data.dataSource = "cache";
    }
    if (cached.data.partial === undefined) {
      cached.data.partial = false;
    }
    return { snapshot: cached.data, source: "cache" };
  }

  if (!cached) {
    logger?.("snapshot_cache_miss", { projectId: project.id, page: sanitizedPage });
  } else {
    logger?.("snapshot_cache_stale", {
      projectId: project.id,
      page: sanitizedPage,
      ageMs: cacheAgeMs,
      partial: cacheIsPartial,
    });
  }

  const computePromise = computePortalSnapshot(
    bindings,
    project,
    portalRecord,
    periodSelection,
    sanitizedPage,
    now,
    {
      ctx: options.ctx,
      logger,
    },
  );

  const timeoutSymbol = Symbol("portal-timeout");
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<symbol>((resolve) => {
    timeoutHandle = setTimeout(() => resolve(timeoutSymbol), PORTAL_COMPUTE_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([computePromise, timeoutPromise]);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    if (result === timeoutSymbol) {
      logger?.("snapshot_compute_timeout", {
        projectId: project.id,
        timeoutMs: PORTAL_COMPUTE_TIMEOUT_MS,
      });
      if (options.ctx) {
        options.ctx.waitUntil(
          computePromise
            .then((data) =>
              writePortalSnapshotCache(bindings, project.id, descriptor, data, PORTAL_SNAPSHOT_CACHE_TTL_SECONDS).catch(
                (error) => {
                  logger?.("snapshot_cache_write_failed", {
                    projectId: project.id,
                    message: (error as Error).message,
                  });
                },
              ),
            )
            .catch((error) => {
              logger?.("snapshot_refresh_failed", {
                projectId: project.id,
                message: (error as Error).message,
              });
            }),
        );
      }
      if (cached) {
        logger?.("snapshot_cache_fallback", {
          projectId: project.id,
          ageMs: cacheAgeMs,
        });
        if (!cached.data.dataSource) {
          cached.data.dataSource = "stale-cache";
        }
        return { snapshot: cached.data, source: "stale-cache" };
      }
      const fallbackSnapshot = await buildSafeFallbackSnapshot(
        bindings,
        project,
        portalRecord,
        periodSelection,
        sanitizedPage,
        now,
        logger,
      );
      await writePortalSnapshotCache(bindings, project.id, descriptor, fallbackSnapshot, PORTAL_SNAPSHOT_CACHE_TTL_SECONDS).catch(
        (error) => {
          logger?.("snapshot_cache_write_failed", {
            projectId: project.id,
            message: (error as Error).message,
          });
        },
      );
      return { snapshot: fallbackSnapshot, source: "fallback" };
    }
    const snapshot = result as PortalComputationResult;
    if (!snapshot.dataSource) {
      snapshot.dataSource = cached ? "stale-cache" : "fresh";
    }
    if (snapshot.partial === undefined) {
      snapshot.partial = false;
    }
    await writePortalSnapshotCache(bindings, project.id, descriptor, snapshot, PORTAL_SNAPSHOT_CACHE_TTL_SECONDS).catch(
      (error) => {
        logger?.("snapshot_cache_write_failed", {
          projectId: project.id,
          message: (error as Error).message,
        });
      },
    );
    return { snapshot, source: cached ? "stale-cache" : "fresh" };
  } catch (error) {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    logger?.("snapshot_compute_failed", {
      projectId: project.id,
      message: (error as Error).message,
    });
    if (cached) {
      logger?.("snapshot_cache_fallback", {
        projectId: project.id,
        ageMs: cacheAgeMs,
      });
      if (!cached.data.dataSource) {
        cached.data.dataSource = "stale-cache";
      }
      return { snapshot: cached.data, source: "stale-cache" };
    }
    const fallbackSnapshot = await buildSafeFallbackSnapshot(
      bindings,
      project,
      portalRecord,
      periodSelection,
      sanitizedPage,
      now,
      logger,
    );
    await writePortalSnapshotCache(bindings, project.id, descriptor, fallbackSnapshot, PORTAL_SNAPSHOT_CACHE_TTL_SECONDS).catch(
      (writeError) => {
        logger?.("snapshot_cache_write_failed", {
          projectId: project.id,
          message: (writeError as Error).message,
        });
      },
    );
    return { snapshot: fallbackSnapshot, source: "fallback" };
  }
};

const loadPortalContext = async (
  bindings: EnvBindings,
  slug: string,
): Promise<{ project: ProjectRecord | null; portal: ProjectPortalRecord | null }> => {
  let portalRecord = await loadPortalById(bindings, slug);
  let project = portalRecord ? await loadProject(bindings, portalRecord.projectId) : null;

  if (!portalRecord && !project) {
    project = await loadProject(bindings, slug);
    if (project) {
      portalRecord = await loadPortalByProjectId(bindings, project.id);
    }
  }

  if (!portalRecord && !project) {
    const allProjects = await listProjects(bindings).catch(() => [] as ProjectRecord[]);
    const match = allProjects.find((entry) => entry.portalSlug === slug);
    if (match) {
      project = match;
      portalRecord = await loadPortalByProjectId(bindings, match.id);
    }
  }

  return { project, portal: portalRecord };
};

type PortalRouteFailureCode = "project_missing" | "portal_missing" | "portal_disabled";

interface PortalRouteFailure {
  ok: false;
  status: number;
  code: PortalRouteFailureCode;
  title: string;
  message: string;
}

interface PortalRouteSuccess {
  ok: true;
  project: ProjectRecord;
  portal: ProjectPortalRecord;
  periodSelection: PortalPeriodSelection;
  snapshot: PortalComputationResult;
  snapshotSource: "fresh" | "cache" | "stale-cache" | "fallback";
  slug: string;
  basePath: string;
}

const resolvePortalRequest = async (
  bindings: EnvBindings,
  slug: string,
  searchParams: URLSearchParams,
  now: Date,
  options: PortalSnapshotLoadOptions = {},
): Promise<PortalRouteSuccess | PortalRouteFailure> => {
  const context = await loadPortalContext(bindings, slug);
  const project = context.project;
  if (!project) {
    return {
      ok: false,
      status: 404,
      code: "project_missing",
      title: "Проект не найден",
      message: "Запрошенный проект отсутствует или был удалён.",
    };
  }

  const portalRecord = context.portal;
  if (!portalRecord) {
    return {
      ok: false,
      status: 404,
      code: "portal_missing",
      title: "Портал не настроен",
      message: "Администратор ещё не создал портал для этого проекта. Обратитесь в поддержку TargetBot.",
    };
  }

  if (isProjectAutoDisabled(project, now)) {
    return {
      ok: false,
      status: 403,
      code: "portal_disabled",
      title: "Портал временно отключён",
      message: "Продлите обслуживание у администратора, чтобы вернуть доступ к порталу.",
    };
  }

  const periodSelection = resolvePortalPeriod(searchParams.get("period"), now);
  const requestedPage = Number(searchParams.get("page") ?? "1");
  const pageNumber = Number.isFinite(requestedPage) ? requestedPage : 1;

  let snapshotResult;
  try {
    snapshotResult = await loadPortalSnapshot(
      bindings,
      project,
      portalRecord,
      periodSelection,
      pageNumber,
      now,
      options,
    );
  } catch (error) {
    options.logger?.("snapshot_unhandled_error", {
      projectId: project.id,
      message: (error as Error).message,
    });
    const fallbackSnapshot = await buildSafeFallbackSnapshot(
      bindings,
      project,
      portalRecord,
      periodSelection,
      pageNumber,
      now,
      options.logger,
    );
    snapshotResult = { snapshot: fallbackSnapshot, source: "fallback" };
  }

  options.logger?.("snapshot_source", {
    projectId: project.id,
    source: snapshotResult.source,
  });

  const snapshot = snapshotResult.snapshot;
  if (!snapshot.dataSource) {
    snapshot.dataSource = snapshotResult.source;
  }

  if (snapshot.partial === undefined) {
    snapshot.partial = false;
  }

  return {
    ok: true,
    project,
    portal: portalRecord,
    periodSelection,
    snapshot,
    snapshotSource: snapshotResult.source,
    slug,
    basePath: `/portal/${encodeURIComponent(slug)}`,
  };
};

const isPortalFailure = (
  value: PortalRouteSuccess | PortalRouteFailure,
): value is PortalRouteFailure => {
  return value.ok === false;
};

let projectMigrationRan = false;

export default {
  async fetch(request: Request, env: unknown, ctx?: WorkerExecutionContext): Promise<Response> {
    const executionCtx: WorkerExecutionContext | null = ctx ?? null;
    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const method = request.method.toUpperCase();
    if (method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+/g, "/");

    try {
      if (!projectMigrationRan) {
        const bindings = ensureEnv(env);
        await migrateProjectsStructure(bindings).catch((error) => {
          console.warn("project:migration", (error as Error).message);
        });
        projectMigrationRan = true;
      }

      if (pathname === "/bot/webhook" && method === "POST") {
        return await handleTelegramUpdate(request, env);
      }

      if (pathname === "/meta/webhook" && (method === "GET" || method === "POST")) {
        return await handleMetaWebhook(request, env);
      }

      if (pathname === "/") {
        return htmlResponse(
          "<h1>Targetbot Worker</h1><p>Используйте /admin для панели управления или /api/* для API.</p>",
        );
      }

      if (pathname === "/health") {
        return jsonResponse({ ok: true, data: { status: "healthy" } });
      }

      if (pathname === "/auth/facebook" && method === "GET") {
        return withCors(await handleMetaOAuthStart(request, env));
      }

      if (pathname === "/auth/facebook/callback" && method === "GET") {
        return withCors(await handleMetaOAuthCallback(request, env));
      }

      if (pathname.startsWith("/api/meta/status") && method === "GET") {
        return withCors(await handleMetaStatus(request, env));
      }
      if (pathname.startsWith("/api/meta/adaccounts") && method === "GET") {
        return withCors(await handleMetaAdAccounts(request, env));
      }
      if (pathname.startsWith("/api/meta/campaigns") && method === "GET") {
        return withCors(await handleMetaCampaigns(request, env));
      }
      if (pathname === "/api/meta/oauth/start" && method === "GET") {
        return withCors(await handleMetaOAuthStart(request, env));
      }
      if (pathname === "/api/meta/oauth/callback" && method === "GET") {
        return withCors(await handleMetaOAuthCallback(request, env));
      }
      if (pathname === "/api/meta/refresh" && method === "POST") {
        return withCors(await handleMetaRefresh(request, env));
      }

      if (pathname === "/api/projects" && method === "GET") {
        return withCors(await handleProjectsList(request, env));
      }
      if (pathname === "/api/projects" && method === "POST") {
        return withCors(await handleProjectsCreate(request, env));
      }

      const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
      if (projectMatch) {
        const projectId = decodeURIComponent(projectMatch[1]);
        if (method === "GET") {
          return withCors(await handleProjectGet(request, env, projectId));
        }
        if (method === "PATCH") {
          return withCors(await handleProjectUpdate(request, env, projectId));
        }
        if (method === "DELETE") {
          return withCors(await handleProjectDelete(request, env, projectId));
        }
      }

      const projectLeadsMatch = pathname.match(/^\/api\/projects\/([^/]+)\/leads$/);
      if (projectLeadsMatch && method === "GET") {
        const projectId = decodeURIComponent(projectLeadsMatch[1]);
        return withCors(await handleLeadsList(request, env, projectId));
      }

      if (pathname === "/api/leads" && method === "POST") {
        return withCors(await handleLeadCreate(request, env));
      }

      const leadMatch = pathname.match(/^\/api\/leads\/([^/]+)$/);
      if (leadMatch && method === "PATCH") {
        const leadId = decodeURIComponent(leadMatch[1]);
        return withCors(await handleLeadUpdateStatus(request, env, leadId));
      }

      if (pathname === "/api/leads" && method === "GET") {
        const projectId = url.searchParams.get("projectId");
        if (!projectId) {
          return withCors(jsonResponse({ ok: false, error: "projectId is required" }, { status: 400 }));
        }
        return withCors(await handleLeadsList(request, env, projectId));
      }

      if (pathname === "/api/payments" && method === "GET") {
        return withCors(await handlePaymentsList(request, env));
      }
      if (pathname === "/api/payments" && method === "POST") {
        return withCors(await handlePaymentsCreate(request, env));
      }
      const paymentMatch = pathname.match(/^\/api\/payments\/([^/]+)$/);
      if (paymentMatch) {
        const paymentId = decodeURIComponent(paymentMatch[1]);
        if (method === "PATCH") {
          return withCors(await handlePaymentUpdate(request, env, paymentId));
        }
        if (method === "DELETE") {
          return withCors(await handlePaymentDelete(request, env, paymentId));
        }
      }

      if (pathname === "/api/reports" && method === "GET") {
        return withCors(await handleReportsList(request, env));
      }
      if (pathname === "/api/reports" && method === "POST") {
        return withCors(await handleReportsCreate(request, env));
      }
      if (pathname === "/api/reports/generate" && method === "POST") {
        return withCors(await handleReportsGenerate(request, env));
      }
      const reportContentMatch = pathname.match(/^\/api\/reports\/([^/]+)\/content$/);
      if (reportContentMatch && method === "GET") {
        const reportId = decodeURIComponent(reportContentMatch[1]);
        return withCors(await handleReportContent(request, env, reportId));
      }
      const reportMatch = pathname.match(/^\/api\/reports\/([^/]+)$/);
      if (reportMatch) {
        const reportId = decodeURIComponent(reportMatch[1]);
        if (method === "GET") {
          return withCors(await handleReportGet(request, env, reportId));
        }
        if (method === "DELETE") {
          return withCors(await handleReportDelete(request, env, reportId));
        }
      }

      if (pathname === "/api/report-schedules" && method === "GET") {
        return withCors(await handleReportSchedulesList(request, env));
      }
      if (pathname === "/api/report-schedules" && method === "POST") {
        return withCors(await handleReportSchedulesCreate(request, env));
      }
      const scheduleMatch = pathname.match(/^\/api\/report-schedules\/([^/]+)$/);
      if (scheduleMatch) {
        const scheduleId = decodeURIComponent(scheduleMatch[1]);
        if (method === "PATCH") {
          return withCors(await handleReportSchedulesUpdate(request, env, scheduleId));
        }
        if (method === "DELETE") {
          return withCors(await handleReportSchedulesDelete(request, env, scheduleId));
        }
      }

      if (pathname === "/api/settings" && (method === "GET" || method === "PATCH" || method === "POST")) {
        if (method === "GET") {
          return withCors(await handleSettingsList(request, env));
        }
        return withCors(await handleSettingsUpsert(request, env));
      }
      const settingMatch = pathname.match(/^\/api\/settings\/([^/]+)$/);
      if (settingMatch && method === "GET") {
        const key = decodeURIComponent(settingMatch[1]);
        return withCors(await handleSettingGet(request, env, key));
      }

      if (pathname === "/api/logs/commands" && method === "GET") {
        return withCors(await handleCommandLogsList(request, env));
      }

      if (pathname === "/api/users" && method === "GET") {
        return withCors(await handleUsersList(request, env));
      }
      if (pathname === "/api/users" && method === "POST") {
        return withCors(await handleUsersCreate(request, env));
      }

      const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
      if (userMatch) {
        const userId = decodeURIComponent(userMatch[1]);
        if (method === "PATCH") {
          return withCors(await handleUserUpdate(request, env, userId));
        }
        if (method === "DELETE") {
          return withCors(await handleUserDelete(request, env, userId));
        }
      }

      if (pathname === "/admin" && method === "GET") {
        const bindings = ensureEnv(env);
        const [projectsWithLeads, token, reports, settings, commandLogs] = await Promise.all([
          summarizeProjects(bindings),
          loadMetaToken(bindings),
          listReports(bindings),
          listSettings(bindings),
          listCommandLogs(bindings),
        ]);
        const projectSummaries: ProjectSummary[] = sortProjectSummaries(projectsWithLeads);
        const [meta, accounts] = await Promise.all([
          resolveMetaStatus(bindings, token),
          fetchAdAccounts(bindings, token, {
            includeSpend: true,
            includeCampaigns: true,
            campaignsLimit: 5,
            datePreset: "today",
          }).catch(() => []),
        ]);
        let flash: AdminFlashMessage | undefined;
        const metaStatusParam = url.searchParams.get("meta");
        if (metaStatusParam === "success") {
          const accountNames = url.searchParams.getAll("metaAccount");
          const accountTotalParam = url.searchParams.get("metaAccountTotal");
          const totalCount = accountTotalParam ? Number(accountTotalParam) : accountNames.length;
          const expiresParam = url.searchParams.get("metaExpires");
          let message = "Meta OAuth успешно подключён.";
          if (expiresParam) {
            const expiresDate = Date.parse(expiresParam);
            const formatted = Number.isNaN(expiresDate)
              ? expiresParam
              : new Intl.DateTimeFormat("ru-RU", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(expiresDate));
            message += ` Токен активен до: ${formatted}.`;
          }
          if (accountNames.length) {
            message += ` Подключённые аккаунты: ${accountNames.slice(0, 5).join(", ")}`;
            if (totalCount > accountNames.length) {
              message += ` и ещё ${totalCount - accountNames.length}.`;
            }
          } else if (totalCount > 0) {
            message += ` Найдено рекламных аккаунтов: ${totalCount}.`;
          }
          flash = { type: "success", message };
        } else if (metaStatusParam === "error") {
          const message = url.searchParams.get("metaMessage") || "Не удалось завершить Meta OAuth.";
          flash = { type: "error", message };
        }
        const recentReports = [...reports]
          .sort((a, b) => Date.parse(b.generatedAt || b.createdAt) - Date.parse(a.generatedAt || a.createdAt))
          .slice(0, 5);
        const html = renderAdminDashboard({
          meta,
          accounts,
          projects: projectSummaries,
          reports: recentReports,
          settings,
          commandLogs: commandLogs.slice(0, 20),
          flash,
        });
        return htmlResponse(html);
      }

      if (pathname === "/admin/projects/new" && method === "GET") {
        const bindings = ensureEnv(env);
        const [users, token] = await Promise.all([
          listUsers(bindings),
          loadMetaToken(bindings),
        ]);
        const accounts = await fetchAdAccounts(bindings, token).catch(() => []);
        return htmlResponse(
          renderProjectForm({ mode: "create", users, accounts }),
        );
      }

      const editProjectMatch = pathname.match(/^\/admin\/projects\/([^/]+)$/);
      if (editProjectMatch && method === "GET") {
        const projectId = decodeURIComponent(editProjectMatch[1]);
        const bindings = ensureEnv(env);
        const project = await loadProject(bindings, projectId);
        if (!project) {
          return htmlResponse("<h1>Проект не найден</h1>", { status: 404 });
        }
        const [users, token] = await Promise.all([
          listUsers(bindings),
          loadMetaToken(bindings),
        ]);
        const accounts = await fetchAdAccounts(bindings, token).catch(() => []);
        return htmlResponse(
          renderProjectForm({ mode: "edit", project, users, accounts }),
        );
      }

      if (pathname === "/admin/users" && method === "GET") {
        const bindings = ensureEnv(env);
        const users = await listUsers(bindings);
        return htmlResponse(renderUsersPage(users));
      }

      if (pathname === "/admin/settings" && method === "GET") {
        const bindings = ensureEnv(env);
        const settings = await listSettings(bindings);
        return htmlResponse(renderSettingsPage({ settings }));
      }

      if (pathname.startsWith("/admin/payments") && method === "GET") {
        const bindings = ensureEnv(env);
        const [payments, projects] = await Promise.all([
          listPayments(bindings),
          listProjects(bindings),
        ]);
        const activeProject = url.searchParams.get("project");
        return htmlResponse(
          renderPaymentsPage({ payments, projects, activeProjectId: activeProject }),
        );
      }

      if (pathname === "/report" && method === "GET") {
        const projectParam = url.searchParams.get("project") ?? "";
        const periodParam = url.searchParams.get("period") ?? undefined;
        const bindings = ensureEnv(env);
        return withCors(await handleLegacyReportRequest(bindings, projectParam, periodParam));
      }

      const legacyReportMatch = pathname.match(/^\/report\/([^/]+)(?:\/([^/]+))?$/);
      if (legacyReportMatch && method === "GET") {
        const projectParam = decodeURIComponent(legacyReportMatch[1]);
        const periodParam = legacyReportMatch[2]
          ? decodeURIComponent(legacyReportMatch[2])
          : url.searchParams.get("period") ?? undefined;
        const bindings = ensureEnv(env);
        return withCors(await handleLegacyReportRequest(bindings, projectParam, periodParam));
      }

      const portalMatch = pathname.match(/^\/portal\/([^/]+)$/);
      if (portalMatch && method === "GET") {
        const slug = decodeURIComponent(portalMatch[1]);
        const bindings = ensureEnv(env);
        const now = new Date();
        const portalLogger = createPortalLogger(requestId);
        portalLogger("route_start", { route: "portal.view", slug, url: request.url });
        const resolution = await resolvePortalRequest(bindings, slug, url.searchParams, now, {
          ctx: executionCtx ?? undefined,
          logger: portalLogger,
        });
        if (isPortalFailure(resolution)) {
          portalLogger("route_failure", {
            route: "portal.view",
            slug,
            status: resolution.status,
            code: resolution.code,
          });
          const { title, message, status } = resolution;
          return htmlResponse(`<h1>${title}</h1><p>${message}</p>`, { status });
        }

        const { project, periodSelection, snapshot: portalSnapshot, snapshotSource, basePath } = resolution;

        const buildPortalUrl = (periodKey: string, pageNumber: number): string => {
          const params = new URLSearchParams();
          if (periodKey !== "today") {
            params.set("period", periodKey);
          }
          if (pageNumber > 1) {
            params.set("page", String(pageNumber));
          }
          const query = params.toString();
          return `${basePath}${query ? `?${query}` : ""}`;
        };

        const periodOptionKeys: Array<PortalPeriodSelection["key"]> = [
          "today",
          "yesterday",
          "week",
          "month",
          "max",
        ];

        const periodOptions = periodOptionKeys.map((key) => {
          const selection = resolvePortalPeriod(key, now);
          return {
            key,
            label: selection.label,
            url: buildPortalUrl(key, 1),
            active: key === periodSelection.key,
          };
        });

        const pagination: PortalPagination = {
          page: portalSnapshot.page,
          totalPages: portalSnapshot.totalPages,
          prevUrl: portalSnapshot.page > 1 ? buildPortalUrl(periodSelection.key, portalSnapshot.page - 1) : null,
          nextUrl:
            portalSnapshot.page < portalSnapshot.totalPages
              ? buildPortalUrl(periodSelection.key, portalSnapshot.page + 1)
              : null,
        };

        const snapshotPayload: PortalSnapshotPayload = {
          metrics: portalSnapshot.metrics,
          campaigns: portalSnapshot.campaigns,
          leads: portalSnapshot.leads,
          statusCounts: portalSnapshot.statusCounts,
          pagination,
          periodLabel: portalSnapshot.periodLabel,
          updatedAt: portalSnapshot.updatedAt,
          partial: portalSnapshot.partial,
          dataSource: portalSnapshot.dataSource ?? snapshotSource,
        };

        const params = new URLSearchParams();
        if (periodSelection.key !== "today") {
          params.set("period", periodSelection.key);
        }
        if (portalSnapshot.page > 1) {
          params.set("page", String(portalSnapshot.page));
        }
        const suffix = params.toString() ? `?${params.toString()}` : "";
        const snapshotUrl = `${basePath}/snapshot${suffix}`;
        const statsUrl = `${basePath}/stats${suffix}`;
        const leadsUrl = `${basePath}/leads${suffix}`;
        const campaignsUrl = `${basePath}/campaigns${suffix}`;

        const html = renderPortal({
          project,
          billing: portalSnapshot.billing,
          periodOptions,
          snapshot: snapshotPayload,
          snapshotUrl,
          statsUrl,
          leadsUrl,
          campaignsUrl,
          periodKey: periodSelection.key,
        });
        portalLogger("route_success", { route: "portal.view", slug, source: request.url });
        return htmlResponse(html);
      }

      const portalSnapshotMatch = pathname.match(/^\/portal\/([^/]+)\/snapshot$/);
      if (portalSnapshotMatch && method === "GET") {
        const slug = decodeURIComponent(portalSnapshotMatch[1]);
        const bindings = ensureEnv(env);
        const now = new Date();
        const portalLogger = createPortalLogger(requestId);
        portalLogger("route_start", { route: "portal.snapshot", slug, url: request.url });
        const resolution = await resolvePortalRequest(bindings, slug, url.searchParams, now, {
          ctx: executionCtx ?? undefined,
          logger: portalLogger,
        });
        if (isPortalFailure(resolution)) {
          portalLogger("route_failure", {
            route: "portal.snapshot",
            slug,
            status: resolution.status,
            code: resolution.code,
          });
          const { message, status, code } = resolution;
          return jsonResponse({ ok: false, error: message, details: { code } }, { status });
        }

        const { periodSelection, snapshot: portalSnapshot, snapshotSource } = resolution;
        const buildPortalUrl = (periodKey: string, pageNumber: number): string => {
          const params = new URLSearchParams();
          if (periodKey !== "today") {
            params.set("period", periodKey);
          }
          if (pageNumber > 1) {
            params.set("page", String(pageNumber));
          }
          const query = params.toString();
          return `${resolution.basePath}${query ? `?${query}` : ""}`;
        };

        const pagination: PortalPagination = {
          page: portalSnapshot.page,
          totalPages: portalSnapshot.totalPages,
          prevUrl: portalSnapshot.page > 1 ? buildPortalUrl(periodSelection.key, portalSnapshot.page - 1) : null,
          nextUrl:
            portalSnapshot.page < portalSnapshot.totalPages
              ? buildPortalUrl(periodSelection.key, portalSnapshot.page + 1)
              : null,
        };

        const payload: PortalSnapshotPayload = {
          metrics: portalSnapshot.metrics,
          campaigns: portalSnapshot.campaigns,
          leads: portalSnapshot.leads,
          statusCounts: portalSnapshot.statusCounts,
          pagination,
          periodLabel: portalSnapshot.periodLabel,
          updatedAt: portalSnapshot.updatedAt,
          partial: portalSnapshot.partial,
          dataSource: portalSnapshot.dataSource ?? snapshotSource,
        };

        portalLogger("route_success", { route: "portal.snapshot", slug, page: portalSnapshot.page });
        return jsonResponse({ ok: true, data: payload });
      }

      const portalStatsMatch = pathname.match(/^\/portal\/([^/]+)\/stats$/);
      if (portalStatsMatch && method === "GET") {
        const slug = decodeURIComponent(portalStatsMatch[1]);
        const bindings = ensureEnv(env);
        const now = new Date();
        const portalLogger = createPortalLogger(requestId);
        portalLogger("route_start", { route: "portal.stats", slug, url: request.url });
        const resolution = await resolvePortalRequest(bindings, slug, url.searchParams, now, {
          ctx: executionCtx ?? undefined,
          logger: portalLogger,
        });
        if (isPortalFailure(resolution)) {
          portalLogger("route_failure", {
            route: "portal.stats",
            slug,
            status: resolution.status,
            code: resolution.code,
          });
          const { message, status, code } = resolution;
          return jsonResponse({ ok: false, error: message, details: { code } }, { status });
        }
        const { snapshot: portalSnapshot, snapshotSource } = resolution;
        const response = jsonResponse({
          ok: true,
          data: {
            metrics: portalSnapshot.metrics,
            periodLabel: portalSnapshot.periodLabel,
            updatedAt: portalSnapshot.updatedAt,
            statusCounts: portalSnapshot.statusCounts,
            billing: portalSnapshot.billing,
            partial: portalSnapshot.partial ?? false,
            dataSource: portalSnapshot.dataSource ?? snapshotSource,
          },
        });
        portalLogger("route_success", { route: "portal.stats", slug });
        return response;
      }

      const portalLeadsMatch = pathname.match(/^\/portal\/([^/]+)\/leads$/);
      if (portalLeadsMatch && method === "GET") {
        const slug = decodeURIComponent(portalLeadsMatch[1]);
        const bindings = ensureEnv(env);
        const now = new Date();
        const portalLogger = createPortalLogger(requestId);
        portalLogger("route_start", { route: "portal.leads", slug, url: request.url });
        const resolution = await resolvePortalRequest(bindings, slug, url.searchParams, now, {
          ctx: executionCtx ?? undefined,
          logger: portalLogger,
        });
        if (isPortalFailure(resolution)) {
          portalLogger("route_failure", {
            route: "portal.leads",
            slug,
            status: resolution.status,
            code: resolution.code,
          });
          const { message, status, code } = resolution;
          return jsonResponse({ ok: false, error: message, details: { code } }, { status });
        }
        const { snapshot: portalSnapshot, periodSelection, snapshotSource } = resolution;
        const buildPortalUrl = (periodKey: string, pageNumber: number): string => {
          const params = new URLSearchParams();
          if (periodKey !== "today") {
            params.set("period", periodKey);
          }
          if (pageNumber > 1) {
            params.set("page", String(pageNumber));
          }
          const query = params.toString();
          return `${resolution.basePath}${query ? `?${query}` : ""}`;
        };
        const pagination: PortalPagination = {
          page: portalSnapshot.page,
          totalPages: portalSnapshot.totalPages,
          prevUrl: portalSnapshot.page > 1 ? buildPortalUrl(periodSelection.key, portalSnapshot.page - 1) : null,
          nextUrl:
            portalSnapshot.page < portalSnapshot.totalPages
              ? buildPortalUrl(periodSelection.key, portalSnapshot.page + 1)
              : null,
        };
        const response = jsonResponse({
          ok: true,
          data: {
            leads: portalSnapshot.leads,
            pagination,
            statusCounts: portalSnapshot.statusCounts,
            periodLabel: portalSnapshot.periodLabel,
            partial: portalSnapshot.partial ?? false,
            dataSource: portalSnapshot.dataSource ?? snapshotSource,
          },
        });
        portalLogger("route_success", { route: "portal.leads", slug, page: portalSnapshot.page });
        return response;
      }

      const portalCampaignsMatch = pathname.match(/^\/portal\/([^/]+)\/campaigns$/);
      if (portalCampaignsMatch && method === "GET") {
        const slug = decodeURIComponent(portalCampaignsMatch[1]);
        const bindings = ensureEnv(env);
        const now = new Date();
        const portalLogger = createPortalLogger(requestId);
        portalLogger("route_start", { route: "portal.campaigns", slug, url: request.url });
        const resolution = await resolvePortalRequest(bindings, slug, url.searchParams, now, {
          ctx: executionCtx ?? undefined,
          logger: portalLogger,
        });
        if (isPortalFailure(resolution)) {
          portalLogger("route_failure", {
            route: "portal.campaigns",
            slug,
            status: resolution.status,
            code: resolution.code,
          });
          const { message, status, code } = resolution;
          return jsonResponse({ ok: false, error: message, details: { code } }, { status });
        }
        const { snapshot: portalSnapshot, snapshotSource } = resolution;
        const response = jsonResponse({
          ok: true,
          data: {
            campaigns: portalSnapshot.campaigns,
            updatedAt: portalSnapshot.updatedAt,
            partial: portalSnapshot.partial ?? false,
            dataSource: portalSnapshot.dataSource ?? snapshotSource,
          },
        });
        portalLogger("route_success", { route: "portal.campaigns", slug, campaigns: portalSnapshot.campaigns.length });
        return response;
      }

      if (pathname.startsWith("/manage/telegram/webhook") && method === "GET") {
        return await handleTelegramWebhookRefresh(request, env);
      }

      return notFound();
    } catch (error) {
      console.error("Unhandled error", error);
      return jsonResponse({ ok: false, error: (error as Error).message }, { status: 500 });
    }
  },

  async scheduled(_event: unknown, env: unknown): Promise<void> {
    try {
      const bindings = ensureEnv(env);
      if (!projectMigrationRan) {
        await migrateProjectsStructure(bindings).catch((error) => {
          console.warn("project:migration", (error as Error).message);
        });
        projectMigrationRan = true;
      }
      const extended = bindings as typeof bindings & TelegramEnv & Record<string, unknown>;
      const [autoStats, reminders, reports] = await Promise.all([
        runAutoReportEngine(extended),
        runReminderSweep(extended),
        runReportSchedules(extended),
      ]);
      const qa = await runRegressionChecks(bindings);
      if (autoStats.reportsSent || autoStats.weeklyReports || autoStats.alertsSent || autoStats.errors) {
        console.log("auto-report", autoStats);
      }
      if (reminders.paymentRemindersSent) {
        console.log("reminders:sent", reminders);
      }
      if (reports.triggered || reports.errors) {
        console.log("reports:schedules", reports);
      }
      if (qa.issues.length) {
        console.warn("qa:issues", { id: qa.id, issues: qa.issues.length });
      }
    } catch (error) {
      console.error("reminders:error", error);
    }
  },
};
