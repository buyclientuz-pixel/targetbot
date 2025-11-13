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
import { AdminFlashMessage, renderAdminDashboard } from "./admin/index";
import { renderUsersPage } from "./admin/users";
import { renderProjectForm } from "./admin/project-form";
import { renderPaymentsPage } from "./admin/payments";
import { renderSettingsPage } from "./admin/settings";
import { renderPortal } from "./views/portal";
import { htmlResponse, jsonResponse } from "./utils/http";
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
  listLeads,
  loadPortalById,
  loadPortalByProjectId,
  listProjectCampaignKpis,
} from "./utils/storage";
import { fetchAdAccounts, fetchCampaigns, resolveMetaStatus, withMetaSettings } from "./utils/meta";
import { projectBilling, summarizeProjects, sortProjectSummaries } from "./utils/projects";
import { MetaCampaign, PortalMetricKey, ProjectSummary } from "./types";
import { handleTelegramUpdate } from "./bot/router";
import { handleMetaWebhook } from "./api/meta-webhook";
import { runReminderSweep } from "./utils/reminders";
import { runReportSchedules } from "./utils/report-scheduler";
import { runAutoReportEngine } from "./utils/auto-report-engine";
import { TelegramEnv } from "./utils/telegram";
import { runRegressionChecks } from "./utils/qa";
import { KPI_LABELS, syncCampaignObjectives, applyKpiSelection, getCampaignKPIs } from "./utils/kpi";

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

export default {
  async fetch(request: Request, env: unknown): Promise<Response> {
    const method = request.method.toUpperCase();
    if (method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+/g, "/");

    try {
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

        if (!project) {
          return htmlResponse("<h1>Проект не найден</h1>", { status: 404 });
        }

        if (!portalRecord) {
          return htmlResponse(
            "<h1>Портал не настроен</h1><p>Администратор ещё не создал портал для этого проекта. Обратитесь к команде поддержки TargetBot.</p>",
            { status: 404 },
          );
        }

        const [leads, payments] = await Promise.all([
          listLeads(bindings, project.id),
          listPayments(bindings),
        ]);
        const billing = projectBilling.summarize(payments.filter((entry) => entry.projectId === project.id));

        let campaigns: MetaCampaign[] = [];
        try {
          if (project.adAccountId) {
            const token = await loadMetaToken(bindings);
            const metaEnv = await withMetaSettings(bindings);
            campaigns = await fetchCampaigns(metaEnv, token, project.adAccountId, {
              limit: portalRecord.mode === "manual" ? Math.max(10, portalRecord.campaignIds.length || 10) : 25,
              datePreset: "today",
            });
            await syncCampaignObjectives(bindings, project.id, campaigns);
            try {
              const storedKpis = await listProjectCampaignKpis(bindings, project.id);
              campaigns.forEach((campaign) => {
                const metrics = storedKpis[campaign.id];
                campaign.manualKpi = metrics && metrics.length ? metrics : undefined;
              });
            } catch (error) {
              console.warn("Failed to load portal campaign KPIs", project.id, error);
            }
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

        const leadsNew = leads.filter((lead) => lead.status === "new").length;
        const leadsDone = leads.filter((lead) => lead.status === "done").length;
        const leadsTotal = leads.length;

        const spendCurrency =
          selectedCampaigns.find((campaign) => campaign.spendCurrency)?.spendCurrency || campaigns[0]?.spendCurrency;
        const spendTotal = selectedCampaigns.reduce((total, campaign) => total + (campaign.spend ?? 0), 0);
        const impressionsTotal = selectedCampaigns.reduce((total, campaign) => total + (campaign.impressions ?? 0), 0);
        const clicksTotal = selectedCampaigns.reduce((total, campaign) => total + (campaign.clicks ?? 0), 0);

        const formatNumber = (value: number): string => new Intl.NumberFormat("ru-RU").format(value);
        const formatCurrency = (value: number): string => {
          if (!Number.isFinite(value) || value === 0) {
            return "—";
          }
          try {
            return new Intl.NumberFormat("ru-RU", {
              style: "currency",
              currency: spendCurrency || "USD",
              maximumFractionDigits: 2,
            }).format(value);
          } catch {
            return `${value.toFixed(2)} ${spendCurrency || "USD"}`;
          }
        };

        const aggregates = selectedCampaigns.reduce(
          (acc, campaign) => ({
            spend: acc.spend + (campaign.spend ?? 0),
            impressions: acc.impressions + (campaign.impressions ?? 0),
            clicks: acc.clicks + (campaign.clicks ?? 0),
            reach: acc.reach + (campaign.reach ?? 0),
            leads: acc.leads + (campaign.leads ?? 0),
            conversations: acc.conversations + (campaign.conversations ?? 0),
            purchases: acc.purchases + (campaign.purchases ?? 0),
            conversions: acc.conversions + (campaign.conversions ?? 0),
            engagements: acc.engagements + (campaign.engagements ?? 0),
            thruplays: acc.thruplays + (campaign.thruplays ?? 0),
            installs: acc.installs + (campaign.installs ?? 0),
            revenue: acc.revenue + (campaign.roasValue ?? 0),
          }),
          {
            spend: 0,
            impressions: 0,
            clicks: 0,
            reach: 0,
            leads: 0,
            conversations: 0,
            purchases: 0,
            conversions: 0,
            engagements: 0,
            thruplays: 0,
            installs: 0,
            revenue: 0,
          },
        );

        const metricLabels = KPI_LABELS;

        const metricValues: Record<PortalMetricKey, string> = {
          leads_total: formatNumber(leadsTotal),
          leads_new: formatNumber(leadsNew),
          leads_done: formatNumber(leadsDone),
          spend: spendTotal > 0 ? formatCurrency(spendTotal) : "—",
          impressions: impressionsTotal > 0 ? formatNumber(impressionsTotal) : "—",
          clicks: clicksTotal > 0 ? formatNumber(clicksTotal) : "—",
          leads: aggregates.leads > 0 ? formatNumber(Math.round(aggregates.leads)) : formatNumber(leadsTotal),
          cpl:
            aggregates.leads > 0 && spendTotal > 0 ? formatCurrency(spendTotal / aggregates.leads) : "—",
          ctr:
            impressionsTotal > 0 && clicksTotal > 0
              ? `${((clicksTotal / impressionsTotal) * 100).toFixed(2)}%`
              : "—",
          cpc:
            clicksTotal > 0 && spendTotal > 0 ? formatCurrency(spendTotal / clicksTotal) : "—",
          reach: aggregates.reach > 0 ? formatNumber(Math.round(aggregates.reach)) : "—",
          messages:
            aggregates.conversations > 0 ? formatNumber(Math.round(aggregates.conversations)) : "—",
          conversations:
            aggregates.conversations > 0 ? formatNumber(Math.round(aggregates.conversations)) : "—",
          cpm:
            impressionsTotal > 0 && spendTotal > 0 ? formatCurrency((spendTotal / impressionsTotal) * 1000) : "—",
          purchases: aggregates.purchases > 0 ? formatNumber(Math.round(aggregates.purchases)) : "—",
          cpa:
            aggregates.purchases > 0 && spendTotal > 0
              ? formatCurrency(spendTotal / aggregates.purchases)
              : "—",
          roas:
            aggregates.revenue > 0 && spendTotal > 0
              ? `${(aggregates.revenue / spendTotal).toFixed(2)}x`
              : "—",
          engagements:
            aggregates.engagements > 0 ? formatNumber(Math.round(aggregates.engagements)) : "—",
          cpe:
            aggregates.engagements > 0 && spendTotal > 0
              ? formatCurrency(spendTotal / aggregates.engagements)
              : "—",
          thruplays:
            aggregates.thruplays > 0 ? formatNumber(Math.round(aggregates.thruplays)) : "—",
          cpv:
            aggregates.thruplays > 0 && spendTotal > 0
              ? formatCurrency(spendTotal / aggregates.thruplays)
              : "—",
          installs: aggregates.installs > 0 ? formatNumber(Math.round(aggregates.installs)) : "—",
          cpi:
            aggregates.installs > 0 && spendTotal > 0
              ? formatCurrency(spendTotal / aggregates.installs)
              : "—",
          conversions:
            aggregates.conversions > 0 ? formatNumber(Math.round(aggregates.conversions)) : "—",
          freq:
            aggregates.reach > 0 && impressionsTotal > 0
              ? (impressionsTotal / aggregates.reach).toFixed(2)
              : "—",
          cpurchase:
            aggregates.purchases > 0 && spendTotal > 0
              ? formatCurrency(spendTotal / aggregates.purchases)
              : "—",
        } as Record<PortalMetricKey, string>;

        const portalOverride = portalRecord.metrics.length ? portalRecord.metrics : undefined;
        const manualProject = Array.isArray(project.manualKpi) ? project.manualKpi : undefined;
        const metricSet = new Set<PortalMetricKey>();
        selectedCampaigns.forEach((campaign) => {
          const selection = applyKpiSelection({
            objective: campaign.objective ?? null,
            projectManual: manualProject,
            campaignManual: campaign.manualKpi,
            override: portalOverride,
          });
          selection.forEach((metric) => metricSet.add(metric));
        });
        if (!metricSet.size && portalOverride?.length) {
          portalOverride.forEach((metric) => metricSet.add(metric));
        }
        if (!metricSet.size && manualProject?.length) {
          manualProject.forEach((metric) => metricSet.add(metric));
        }
        if (!metricSet.size) {
          getCampaignKPIs("LEAD_GENERATION").forEach((metric) => metricSet.add(metric));
        }
        const preferredMetrics = Array.from(metricSet);

        const metrics = preferredMetrics
          .map((key) => ({ key, label: metricLabels[key], value: metricValues[key] }))
          .filter((entry) => entry.value && entry.value !== "—");

        const html = renderPortal({
          project,
          leads,
          billing,
          campaigns: selectedCampaigns,
          metrics,
          mode: portalRecord.mode,
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
