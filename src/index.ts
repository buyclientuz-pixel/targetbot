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
  handleProjectCleanup,
  handleProjectUnlinkChat,
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
} from "./utils/storage";
import { fetchAdAccounts, fetchCampaigns, resolveMetaStatus, withMetaSettings } from "./utils/meta";
import {
  projectBilling,
  summarizeProjects,
  sortProjectSummaries,
  isProjectAutoDisabled,
  extractProjectReportPreferences,
} from "./utils/projects";
import { MetaCampaign, PortalMetricKey, ProjectSummary, ProjectRecord } from "./types";
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

let projectMigrationRan = false;

export default {
  async fetch(request: Request, env: unknown): Promise<Response> {
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

      const projectMatch = pathname.match(/^\/(?:api\/)?projects\/([^/]+)$/);
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

      const projectCleanupMatch = pathname.match(/^\/(?:api\/)?projects\/([^/]+)\/cleanup$/);
      if (projectCleanupMatch && method === "POST") {
        const projectId = decodeURIComponent(projectCleanupMatch[1]);
        return withCors(await handleProjectCleanup(request, env, projectId));
      }

      const projectUnlinkMatch = pathname.match(/^\/(?:api\/)?projects\/([^/]+)\/unlink-chat$/);
      if (projectUnlinkMatch && method === "POST") {
        const projectId = decodeURIComponent(projectUnlinkMatch[1]);
        return withCors(await handleProjectUnlinkChat(request, env, projectId));
      }

      const projectLeadsMatch = pathname.match(/^\/(?:api\/)?projects\/([^/]+)\/leads$/);
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

      if (pathname === "/projects" && method === "GET") {
        const redirectUrl = new URL("/admin", request.url);
        return new Response(null, { status: 302, headers: { location: redirectUrl.toString() } });
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

      const portalMatch = pathname.match(/^\/portal\/([^/]+)$/);
      if (portalMatch && method === "GET") {
        const slug = decodeURIComponent(portalMatch[1]);
        const bindings = ensureEnv(env);
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

        if (!project) {
          return htmlResponse("<h1>Проект не найден</h1>", { status: 404 });
        }

        if (!portalRecord) {
          return htmlResponse(
            "<h1>Портал не настроен</h1><p>Администратор ещё не создал портал для этого проекта. Обратитесь к команде поддержки TargetBot.</p>",
            { status: 404 },
          );
        }

        const now = new Date();
        if (isProjectAutoDisabled(project, now)) {
          return htmlResponse(
            "<h1>Портал временно отключён</h1><p>Продлите обслуживание у администратора, чтобы вернуть доступ.</p>",
            { status: 403 },
          );
        }

        const periodSelection = resolvePortalPeriod(url.searchParams.get("period"), now);
        await syncProjectLeads(bindings, project.id).catch((error) => {
          console.warn("Failed to sync portal leads", project.id, (error as Error).message);
        });
        const [allLeads, payments] = await Promise.all([
          getProjectLeads(bindings, project.id),
          listPayments(bindings),
        ]);
        const billing = projectBilling.summarize(payments.filter((entry) => entry.projectId === project.id));

        const sinceMs = periodSelection.since ? periodSelection.since.getTime() : null;
        const untilMs = periodSelection.until ? periodSelection.until.getTime() : null;
        const leads = allLeads.filter((lead) => {
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

        const statusCounts = leads.reduce(
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

        const requestedPage = Number(url.searchParams.get("page") ?? "1");
        const rawPage = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
        const totalPages = Math.max(1, Math.ceil(leads.length / PORTAL_PAGE_SIZE));
        const page = Math.min(rawPage, totalPages);
        const offset = (page - 1) * PORTAL_PAGE_SIZE;
        const paginatedLeads = leads.slice(offset, offset + PORTAL_PAGE_SIZE);

        const basePath = `/portal/${encodeURIComponent(slug)}`;
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

        const pagination = {
          page,
          totalPages,
          prevUrl: page > 1 ? buildPortalUrl(periodSelection.key, page - 1) : null,
          nextUrl: page < totalPages ? buildPortalUrl(periodSelection.key, page + 1) : null,
        };

        let periodLabel = periodSelection.label;
        if (periodSelection.since && periodSelection.until) {
          const startLabel = formatRuDate(periodSelection.since);
          const endLabel = formatRuDate(periodSelection.until);
          periodLabel = startLabel === endLabel
            ? `${periodSelection.label} · ${startLabel}`
            : `${periodSelection.label} · ${startLabel} — ${endLabel}`;
        }

        let campaigns: MetaCampaign[] = [];
        try {
          if (project.adAccountId) {
            const token = await loadMetaToken(bindings);
            const metaEnv = await withMetaSettings(bindings);
            campaigns = await fetchCampaigns(metaEnv, token, project.adAccountId, {
              limit: portalRecord.mode === "manual" ? Math.max(10, portalRecord.campaignIds.length || 10) : 25,
              datePreset: periodSelection.datePreset,
            });
            await syncCampaignObjectives(bindings, project.id, campaigns);
          }
        } catch (error) {
          console.warn("Failed to load portal campaigns", project.id, (error as Error).message);
        }

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

        const toIsoDate = (value: Date | null): string => {
          if (!value) {
            const today = new Date(now.getTime());
            today.setUTCHours(0, 0, 0, 0);
            return today.toISOString().slice(0, 10);
          }
          const copy = new Date(value.getTime());
          copy.setUTCHours(0, 0, 0, 0);
          return copy.toISOString().slice(0, 10);
        };

        const latestLeadTimestamp = leads.reduce((acc, lead) => {
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

        const contextMap = await collectProjectMetricContext(bindings, [summary]);
        const context = contextMap.get(project.id);
        const { report, metrics: metricKeys } = buildProjectReportEntry(
          summary,
          selectedCampaigns,
          context,
          preferenceInput,
          { start: toIsoDate(periodSelection.since), end: toIsoDate(periodSelection.until) },
        );

        const spendCurrency =
          selectedCampaigns.find((campaign) => campaign.spendCurrency)?.spendCurrency || campaigns[0]?.spendCurrency || "USD";

        const formatNumber = (value: number): string => new Intl.NumberFormat("ru-RU").format(Math.round(value));
        const formatCurrency = (value: number | undefined): string => {
          if (value === undefined || Number.isNaN(value)) {
            return "—";
          }
          if (value === 0) {
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

        const metricLabels = KPI_LABELS;
        const filteredMetricKeys = metricKeys.filter(
          (key) => key !== "leads_done" && key !== "conversations",
        );
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
            return { key, label: metricLabels[key], value };
          })
          .filter((entry) => entry.value && entry.value !== "—");

        const normalizedCampaigns = normalizeCampaigns(selectedCampaigns);

        const html = renderPortal({
          project,
          leads: paginatedLeads,
          billing,
          campaigns: normalizedCampaigns,
          metrics,
          periodOptions,
          periodLabel,
          pagination,
          statusCounts,
        });
        return htmlResponse(html);
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
      if (reminders.leadRemindersSent || reminders.paymentRemindersSent) {
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
