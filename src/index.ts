import {
  handleMetaAdAccounts,
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
  handleUserDelete,
  handleUserUpdate,
  handleUsersCreate,
  handleUsersList,
} from "./api/users";
import { AdminFlashMessage, ProjectSummary, renderAdminDashboard } from "./admin/index";
import { renderUsersPage } from "./admin/users";
import { renderProjectForm } from "./admin/project-form";
import { renderPortal } from "./views/portal";
import { htmlResponse, jsonResponse } from "./utils/http";
import {
  EnvBindings,
  listProjects,
  listUsers,
  loadMetaToken,
  loadProject,
  listLeads,
} from "./utils/storage";
import { fetchAdAccounts, resolveMetaStatus } from "./utils/meta";

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
      if (pathname === "/") {
        return htmlResponse(
          "<h1>Targetbot Worker</h1><p>Используйте /admin для панели управления или /api/* для API.</p>",
        );
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
        const [projects, token] = await Promise.all([
          listProjects(bindings),
          loadMetaToken(bindings),
        ]);
        const projectSummaries: ProjectSummary[] = await Promise.all(
          projects.map(async (project) => {
            const leads = await listLeads(bindings, project.id).catch(() => []);
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
              ...project,
              leadStats: {
                total: leads.length,
                new: newCount,
                done: doneCount,
                latestAt: latestTimestamp ? new Date(latestTimestamp).toISOString() : undefined,
              },
            };
          }),
        );
        projectSummaries.sort((a, b) => {
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

        const [meta, accounts] = await Promise.all([
          resolveMetaStatus(bindings, token),
          fetchAdAccounts(bindings, token).catch(() => []),
        ]);
        let flash: AdminFlashMessage | undefined;
        const metaStatusParam = url.searchParams.get("meta");
        if (metaStatusParam === "success") {
          flash = { type: "success", message: "Meta OAuth успешно подключён." };
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

      const portalMatch = pathname.match(/^\/portal\/([^/]+)$/);
      if (portalMatch && method === "GET") {
        const projectId = decodeURIComponent(portalMatch[1]);
        const bindings = ensureEnv(env);
        const project = await loadProject(bindings, projectId);
        if (!project) {
          return htmlResponse("<h1>Проект не найден</h1>", { status: 404 });
        }
        const leads = await listLeads(bindings, projectId);
        const html = renderPortal({ project, leads });
        return htmlResponse(html);
      }

      return notFound();
    } catch (error) {
      console.error("Unhandled error", error);
      return jsonResponse({ ok: false, error: (error as Error).message }, { status: 500 });
    }
  },
};
