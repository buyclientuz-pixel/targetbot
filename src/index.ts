import { jsonResponse, textResponse, notFound, serverError } from "./utils/http";
import { handleProjectsList, handleProjectDetail, handleProjectRefresh } from "./api/projects";
import { handleMetaStatus } from "./api/meta";
import { handlePortalSummary, handlePortalCampaigns } from "./api/portal";
import {
  handleAdminPage,
  handleRefreshAllRequest,
  handleAdminProjectsApi,
  handleAdminProjectDetail,
  handleAdminProjectCreate,
  handleAdminProjectUpdate,
  handleAdminProjectToggle,
  handleAdminProjectBillingUpdate,
  handleAdminProjectAlertsUpdate,
  handleAdminLogsApi,
  handleAdminBillingApi,
  handleAdminSystemApi,
  handleAdminSystemAction,
  handleAdminAccountsApi,
  handleAdminAccountLink,
} from "./api/admin";
import { handleTelegramWebhook } from "./telegram";
import { handleTelegramAlert } from "./api/telegram";
import { handleManageTelegramWebhook, handleManageMeta } from "./api/manage";
import { appendLogEntry, updateCronStatus } from "./utils/r2";
import { refreshAllProjects } from "./api/projects";
import {
  handleFacebookStatusApi,
  handleFacebookRefreshApi,
  handleFacebookLogin,
  handleFacebookCallback,
} from "./api/auth";
import { checkAndRefreshFacebookToken } from "./fb/auth";
import { WorkerEnv } from "./types";
import { notifyTelegramAdmins } from "./utils/telegram";

const handleNotFound = (): Response => notFound("Route not found");

const routePortal = async (request: Request, env: WorkerEnv, segments: string[]): Promise<Response> => {
  if (segments.length === 2) {
    return handlePortalSummary(request, env, segments[1]);
  }
  if (segments.length === 3 && segments[2] === "campaigns") {
    return handlePortalCampaigns(request, env, segments[1]);
  }
  return handleNotFound();
};

const routeApi = async (request: Request, env: WorkerEnv, segments: string[]): Promise<Response> => {
  if (segments[1] === "ping" && request.method === "GET") {
    return jsonResponse({ pong: true, timestamp: new Date().toISOString() });
  }
  if (segments[1] === "meta" && segments[2] === "status" && request.method === "GET") {
    return handleMetaStatus(env);
  }
  if (segments[1] === "auth" && segments.length >= 4 && segments[2] === "facebook") {
    if (segments[3] === "status" && request.method === "GET") {
      return handleFacebookStatusApi(request, env);
    }
    if (segments[3] === "refresh" && (request.method === "POST" || request.method === "GET")) {
      return handleFacebookRefreshApi(request, env);
    }
  }
  if (segments[1] === "projects" && request.method === "GET") {
    return handleProjectsList(env);
  }
  if (segments[1] === "admin") {
    if (segments.length === 2) {
      if (request.method === "GET") {
        return handleAdminProjectsApi(request, env);
      }
      if (request.method === "POST") {
        return handleAdminProjectCreate(request, env);
      }
    }
    if (segments.length === 3) {
      if (segments[2] === "logs" && request.method === "GET") {
        return handleAdminLogsApi(request, env);
      }
      if (segments[2] === "billing" && request.method === "GET") {
        return handleAdminBillingApi(request, env);
      }
      if (segments[2] === "accounts" && request.method === "GET") {
        return handleAdminAccountsApi(request, env);
      }
      if (segments[2] === "system") {
        if (request.method === "GET") {
          return handleAdminSystemApi(request, env);
        }
        if (request.method === "POST") {
          return handleAdminSystemAction(request, env);
        }
      }
    }
    if (segments.length >= 4 && segments[2] === "account") {
      const accountId = segments[3];
      if (segments.length === 5 && segments[4] === "link" && request.method === "POST") {
        return handleAdminAccountLink(request, env, accountId);
      }
    }
    if (segments.length >= 4 && segments[2] === "project") {
      const projectId = segments[3];
      if (segments.length === 4) {
        if (request.method === "GET") {
          return handleAdminProjectDetail(request, env, projectId);
        }
        if (request.method === "POST" || request.method === "PATCH") {
          return handleAdminProjectUpdate(request, env, projectId);
        }
      }
      if (segments.length === 5) {
        if (segments[4] === "toggle" && request.method === "POST") {
          return handleAdminProjectToggle(request, env, projectId);
        }
        if (segments[4] === "billing" && request.method === "POST") {
          return handleAdminProjectBillingUpdate(request, env, projectId);
        }
        if (segments[4] === "alerts" && request.method === "POST") {
          return handleAdminProjectAlertsUpdate(request, env, projectId);
        }
      }
    }
  }
  if (segments[1] === "project" && segments.length >= 3) {
    const projectId = segments[2];
    if (segments.length === 3 && request.method === "GET") {
      return handleProjectDetail(env, projectId);
    }
    if (segments.length === 3 && request.method === "POST") {
      const url = new URL(request.url);
      const period = url.searchParams.get("period") || undefined;
      return handleProjectRefresh(env, projectId, period || undefined);
    }
    if (segments.length === 4 && segments[3] === "refresh") {
      const periodParam = new URL(request.url).searchParams.get("period") || undefined;
      if (request.method === "POST" || request.method === "GET") {
        return handleProjectRefresh(env, projectId, periodParam);
      }
    }
  }
  if (segments[1] === "project" && segments.length >= 3 && segments[2] === "refresh-all" && request.method === "POST") {
    return handleRefreshAllRequest(env);
  }
  if (segments[1] === "tg" && segments.length >= 3 && segments[2] === "alert" && request.method === "POST") {
    return handleTelegramAlert(request, env);
  }
  return handleNotFound();
};

const routeAuth = async (request: Request, env: WorkerEnv, segments: string[]): Promise<Response> => {
  if (segments.length >= 2 && segments[1] === "facebook") {
    if (segments.length === 3 && segments[2] === "login" && request.method === "GET") {
      return handleFacebookLogin(request, env);
    }
    if (segments.length === 3 && segments[2] === "callback" && request.method === "GET") {
      return handleFacebookCallback(request, env);
    }
    if (segments.length === 3 && segments[2] === "status" && request.method === "GET") {
      return handleFacebookStatusApi(request, env);
    }
    if (segments.length === 3 && segments[2] === "refresh" && (request.method === "GET" || request.method === "POST")) {
      return handleFacebookRefreshApi(request, env);
    }
  }
  return handleNotFound();
};

const routeAdmin = (request: Request, env: WorkerEnv): Promise<Response> => handleAdminPage(request, env);

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const segments = pathname.split("/").filter(Boolean);

    try {
      if (pathname === "/" && request.method === "GET") {
        return textResponse("ok");
      }

      if (pathname === "/health") {
        return jsonResponse({ ok: true, timestamp: new Date().toISOString() });
      }

      if (segments[0] === "portal") {
        return routePortal(request, env, segments);
      }

      if (segments[0] === "admin") {
        return routeAdmin(request, env);
      }

      if (segments[0] === "auth") {
        return routeAuth(request, env, segments);
      }

      if (segments[0] === "api") {
        return routeApi(request, env, segments);
      }

      if (segments[0] === "manage") {
        if (segments.length >= 3 && segments[1] === "telegram" && segments[2] === "webhook") {
          return handleManageTelegramWebhook(request, env);
        }
        if (segments.length >= 2 && segments[1] === "meta") {
          return handleManageMeta(request, env);
        }
      }

      if ((segments[0] === "tg" || segments[0] === "telegram" || segments[0] === "webhook") && request.method === "POST") {
        return handleTelegramWebhook(request, env);
      }

      return handleNotFound();
    } catch (error) {
      await appendLogEntry(env, {
        level: "error",
        message: "Unhandled error: " + (error as Error).message,
        timestamp: new Date().toISOString(),
      });
      return serverError("Internal error");
    }
  },

  async scheduled(event: ScheduledEvent, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        const cronExpression = (event as { cron?: string }).cron || "";
        const shouldRunProjects = !cronExpression || cronExpression === "*/5 * * * *" || cronExpression === "0 3 * * *";
        const shouldRunTokenCheck = !cronExpression || cronExpression === "0 3 * * *";

        if (shouldRunProjects) {
          try {
            const result = await refreshAllProjects(env);
            const message =
              "Scheduled refresh completed for " + result.refreshed.length + " projects";
            await appendLogEntry(env, {
              level: "info",
              message,
              timestamp: new Date().toISOString(),
            });
            await updateCronStatus(env, "projects-refresh", { ok: true, message });
          } catch (error) {
            const message = "Scheduled refresh failed: " + (error as Error).message;
            await appendLogEntry(env, {
              level: "error",
              message,
              timestamp: new Date().toISOString(),
            });
            await updateCronStatus(env, "projects-refresh", { ok: false, message });
            await notifyTelegramAdmins(env, "🚨 Ошибка крон-задачи проектов: " + (error as Error).message);
          }
        }

        if (shouldRunTokenCheck) {
          try {
            const result = await checkAndRefreshFacebookToken(env, { notify: true });
            const message =
              "Meta token check status: " +
              result.status.status +
              (result.refresh && result.refresh.message ? " - " + result.refresh.message : "");
            await appendLogEntry(env, {
              level: result.refresh && result.refresh.ok ? "info" : "warn",
              message,
              timestamp: new Date().toISOString(),
            });
            await updateCronStatus(env, "meta-token", {
              ok: result.refresh ? result.refresh.ok : result.status.ok,
              message,
            });
          } catch (error) {
            const message = "Meta token scheduled check failed: " + (error as Error).message;
            await appendLogEntry(env, {
              level: "error",
              message,
              timestamp: new Date().toISOString(),
            });
            await updateCronStatus(env, "meta-token", { ok: false, message });
            await notifyTelegramAdmins(env, "🚨 Ошибка проверки Meta токена: " + (error as Error).message);
          }
        }
      })(),
    );
  },
};
