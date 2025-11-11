import { jsonResponse, textResponse, notFound, serverError } from "./utils/http";
import { handleProjectsList, handleProjectDetail, handleProjectRefresh } from "./api/projects";
import { handleMetaStatus } from "./api/meta";
import { handlePortalSummary, handlePortalCampaigns } from "./api/portal";
import { handleAdminPage, handleRefreshAllRequest } from "./api/admin";
import { handleTelegramWebhook } from "./telegram";
import { handleTelegramAlert } from "./api/telegram";
import { appendLogEntry } from "./utils/r2";
import { refreshAllProjects } from "./api/projects";

interface Env extends Record<string, unknown> {
  REPORTS_BUCKET?: R2Bucket;
  R2_BUCKET?: R2Bucket;
  LOGS_BUCKET?: R2Bucket;
  FALLBACK_KV?: KVNamespace;
  LOGS_NAMESPACE?: KVNamespace;
  SESSION_NAMESPACE?: KVNamespace;
  META_MANAGE_TOKEN?: string;
  META_LONG_TOKEN?: string;
  META_ACCESS_TOKEN?: string;
  FB_GRAPH_VERSION?: string;
  BOT_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TG_API_TOKEN?: string;
  ADMIN_KEY?: string;
  DEFAULT_TZ?: string;
  WORKER_URL?: string;
}

const handleNotFound = (): Response => notFound("Route not found");

const routePortal = async (request: Request, env: Env, segments: string[]): Promise<Response> => {
  if (segments.length === 2) {
    return handlePortalSummary(request, env, segments[1]);
  }
  if (segments.length === 3 && segments[2] === "campaigns") {
    return handlePortalCampaigns(request, env, segments[1]);
  }
  return handleNotFound();
};

const routeApi = async (request: Request, env: Env, segments: string[]): Promise<Response> => {
  if (segments[1] === "meta" && segments[2] === "status" && request.method === "GET") {
    return handleMetaStatus(env);
  }
  if (segments[1] === "projects" && request.method === "GET") {
    return handleProjectsList(env);
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

const routeAdmin = (request: Request, env: Env): Promise<Response> => handleAdminPage(request, env);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

      if (segments[0] === "api") {
        return routeApi(request, env, segments);
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

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        try {
          const result = await refreshAllProjects(env);
          await appendLogEntry(env, {
            level: "info",
            message: "Scheduled refresh completed for " + result.refreshed.length + " projects",
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          await appendLogEntry(env, {
            level: "error",
            message: "Scheduled refresh failed: " + (error as Error).message,
            timestamp: new Date().toISOString(),
          });
        }
      })(),
    );
  },
};
