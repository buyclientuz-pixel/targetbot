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
  handleReportDelete,
  handleReportGet,
  handleReportsCreate,
  handleReportsList,
} from "./api/reports";
import {
  handleSettingGet,
  handleSettingsList,
  handleSettingsUpsert,
} from "./api/settings";
import { handleTelegramWebhookRefresh } from "./api/manage";
import { AdminFlashMessage, renderAdminDashboard } from "./admin/index";
import { renderUsersPage } from "./admin/users";
import { renderProjectForm } from "./admin/project-form";
import { renderPaymentsPage } from "./admin/payments";
import { renderPortal } from "./views/portal";
import { htmlResponse, jsonResponse } from "./utils/http";
import {
  EnvBindings,
  listPayments,
  listProjects,
  listUsers,
  loadMetaToken,
  loadProject,
  listLeads,
} from "./utils/storage";
import { fetchAdAccounts, resolveMetaStatus } from "./utils/meta";
import { projectBilling, summarizeProjects, sortProjectSummaries } from "./utils/projects";
import { ProjectSummary } from "./types";
import { handleTelegramUpdate } from "./bot/router";

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

      if (pathname === "/") {
        return htmlResponse(
          "<h1>Targetbot Worker</h1><p>Используйте /admin для панели управления или /api/* для API.</p>",
        );
      }

      if (pathname === "/auth/facebook" && method === "GET") {
        return withCors(await handleMetaOAuthStart(request, env));
      }

      if (pathname === "/health") {
        return jsonResponse({ ok: true, data: { status: "healthy" } });
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
        const [projectsWithLeads, token] = await Promise.all([
          summarizeProjects(bindings),
          loadMetaToken(bindings),
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
        const html = renderAdminDashboard({ meta, accounts, projects: projectSummaries, flash });
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
        const projectId = decodeURIComponent(portalMatch[1]);
        const bindings = ensureEnv(env);
        const project = await loadProject(bindings, projectId);
        if (!project) {
          return htmlResponse("<h1>Проект не найден</h1>", { status: 404 });
        }
        const [leads, payments] = await Promise.all([
          listLeads(bindings, projectId),
          listPayments(bindings),
        ]);
        const billing = projectBilling.summarize(payments.filter((entry) => entry.projectId === projectId));
        const html = renderPortal({ project, leads, billing });
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
};
