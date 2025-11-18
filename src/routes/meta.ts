import { createMetaToken, getMetaToken, parseMetaToken, upsertMetaToken } from "../domain/meta-tokens";
import { ensureProjectSettings, type ProjectSettings } from "../domain/project-settings";
import { getProject, type Project } from "../domain/projects";
import { saveLead, type Lead } from "../domain/leads";
import { DataValidationError, EntityNotFoundError } from "../errors";
import { jsonResponse } from "../http/responses";
import { loadProjectCampaigns, loadProjectSummary } from "../services/project-insights";
import { parseMetaWebhookPayload } from "../services/meta-webhook";
import { dispatchProjectMessage, type ProjectMessageRoute } from "../services/project-messaging";
import { resolveTelegramToken } from "../config/telegram";
import { resolveWorkerBaseUrl } from "../config/worker";
import { mergeProjectLeadsList } from "../services/project-leads-list";
import { requireProjectRecord } from "../domain/spec/project";
import type { Router } from "../worker/router";
import type { KvClient } from "../infra/kv";

const DEFAULT_LEAD_NOTIFICATION_TIMEZONE = "Asia/Tashkent";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normaliseTelHref = (value: string): string => {
  const cleaned = value.replace(/[^0-9+]/g, "");
  if (!cleaned) {
    return "";
  }
  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  if (cleaned.startsWith("00")) {
    return `+${cleaned.slice(2)}`;
  }
  if (cleaned.length >= 11) {
    return `+${cleaned}`;
  }
  return cleaned;
};

const formatPhoneForMessage = (phone: string | null): string => {
  if (!phone) {
    return "—";
  }
  const href = normaliseTelHref(phone);
  if (!href) {
    return escapeHtml(phone);
  }
  return `<a href="tel:${href}">${escapeHtml(phone)}</a>`;
};

const formatLeadTimestamp = (value: string, timezone: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  const datePart = new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${datePart}, ${timePart}`;
};

const formatLeadWaitTime = (createdAt: string, now: Date): string => {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    return "—";
  }
  const diffMs = Math.max(0, now.getTime() - created.getTime());
  const totalMinutes = Math.floor(diffMs / 60000);
  const minutesInDay = 24 * 60;
  const days = Math.floor(totalMinutes / minutesInDay);
  const hours = Math.floor((totalMinutes % minutesInDay) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days} д`);
  }
  if (hours > 0) {
    parts.push(`${hours} ч`);
  }
  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes} мин`);
  }
  return parts.join(" ");
};

const buildLeadNotificationMessage = (
  lead: Lead,
  project: Project,
  timezone: string,
  now: Date,
): string => {
  const lines = [
    "🔔 Лид ожидает ответа",
    `Имя: ${escapeHtml(lead.name)}`,
    `Телефон: ${formatPhoneForMessage(lead.phone)}`,
    `Получен: ${formatLeadTimestamp(lead.createdAt, timezone)}`,
    `В ожидании: ${formatLeadWaitTime(lead.createdAt, now)}`,
    `Проект: ${escapeHtml(project.name)}`,
  ];
  return lines.join("\n");
};

type ProjectMessageDispatcher = typeof dispatchProjectMessage;

const dispatchLeadNotifications = async (
  kv: KvClient,
  token: string | undefined,
  project: Project,
  settings: ProjectSettings,
  lead: Lead,
  timezone: string,
  sendMessage: ProjectMessageDispatcher,
): Promise<boolean> => {
  if (!token) {
    return false;
  }

  const route = resolveLeadNotificationRoute(settings.leads);
  if (!route) {
    return false;
  }

  const message = buildLeadNotificationMessage(lead, project, timezone, new Date());
  const result = await sendMessage({
    kv,
    token,
    project,
    settings,
    text: message,
    route,
    parseMode: "HTML",
  });

  return result.delivered.chat || result.delivered.admin;
};

const resolveLeadNotificationRoute = (settings: ProjectSettings["leads"]): ProjectMessageRoute | null => {
  const sendToChat = settings.sendToChat;
  const sendToAdmin = settings.sendToAdmin;
  if (sendToChat && sendToAdmin) {
    return "BOTH";
  }
  if (sendToChat) {
    return "CHAT";
  }
  if (sendToAdmin) {
    return "ADMIN";
  }
  return null;
};

interface TokenRequestBody {
  accessToken?: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
}

interface ValidatedTokenBody {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}

const badRequest = (message: string): Response => jsonResponse({ error: message }, { status: 400 });
const notFound = (message: string): Response => jsonResponse({ error: message }, { status: 404 });
const unprocessable = (message: string): Response => jsonResponse({ error: message }, { status: 422 });

const ensureTokenBody = (body: TokenRequestBody): ValidatedTokenBody => {
  if (!body.accessToken) {
    throw new DataValidationError("accessToken is required");
  }
  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken ?? null,
    expiresAt: body.expiresAt ?? null,
  };
};

export interface MetaRouteDependencies {
  dispatchProjectMessage?: ProjectMessageDispatcher;
}

export const registerMetaRoutes = (
  router: Router,
  deps: MetaRouteDependencies = {},
): void => {
  const sendProjectMessage = deps.dispatchProjectMessage ?? dispatchProjectMessage;

  router.on("GET", "/api/meta/oauth/start", async (context) => {
    const url = new URL(context.request.url);
    const tid = url.searchParams.get("tid");
    if (!tid) {
      return jsonResponse({ error: "tid is required" }, { status: 400 });
    }
    if (!/^[0-9]+$/.test(tid)) {
      return jsonResponse({ error: "tid must be a numeric Telegram ID" }, { status: 400 });
    }
    const appId = context.env.FB_APP_ID;
    if (!appId) {
      return jsonResponse({ error: "FB_APP_ID is not configured" }, { status: 500 });
    }
    const workerBaseUrl = resolveWorkerBaseUrl(context.env);
    const redirectUri = `${workerBaseUrl}/auth/facebook/callback`;
    const oauthUrl = new URL("https://www.facebook.com/v18.0/dialog/oauth");
    oauthUrl.searchParams.set("client_id", appId);
    oauthUrl.searchParams.set("redirect_uri", redirectUri);
    oauthUrl.searchParams.set("response_type", "code");
    oauthUrl.searchParams.set(
      "scope",
      [
        "ads_management",
        "ads_read",
        "leads_retrieval",
        "business_management",
        "pages_manage_metadata",
        "pages_read_engagement",
        "pages_show_list",
      ].join(","),
    );
    oauthUrl.searchParams.set("state", tid);
    return new Response(null, {
      status: 302,
      headers: { Location: oauthUrl.toString() },
    });
  });

  router.on("GET", "/api/meta/webhook", async (context) => {
    const url = new URL(context.request.url);
    const mode = url.searchParams.get("hub.mode");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = url.searchParams.get("hub.verify_token");

    if (mode === "subscribe" && challenge) {
      const expectedToken = context.env.META_WEBHOOK_VERIFY_TOKEN;
      if (!expectedToken || verifyToken !== expectedToken) {
        return new Response("forbidden", { status: 403 });
      }
      return new Response(challenge, {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }

    return jsonResponse({ status: "ok" });
  });

  router.on("POST", "/api/meta/webhook", async (context) => {
    let payload: unknown;
    try {
      payload = await context.json<unknown>();
    } catch {
      return badRequest("Invalid JSON body");
    }

    let events;
    try {
      events = parseMetaWebhookPayload(payload);
    } catch (error) {
      if (error instanceof DataValidationError) {
        return unprocessable(error.message);
      }
      throw error;
    }

    if (events.length === 0) {
      return jsonResponse({ status: "ignored", reason: "no_leads" });
    }

    const processed: Array<{
      projectId: string;
      leadId: string;
      stored: boolean;
      duplicate: boolean;
      notificationsDispatched: boolean;
    }> = [];

    for (const event of events) {
      const { projectId, lead } = event;

      let project: Project;
      try {
        project = await getProject(context.kv, projectId);
      } catch (error) {
        if (error instanceof EntityNotFoundError) {
          return notFound(`Project '${projectId}' was not found for incoming Meta lead`);
        }
        throw error;
      }

      const settings = await ensureProjectSettings(context.kv, projectId);
      let projectTimezone = context.env.DEFAULT_TZ ?? DEFAULT_LEAD_NOTIFICATION_TIMEZONE;
      try {
        const projectRecord = await requireProjectRecord(context.kv, projectId);
        if (projectRecord.settings.timezone) {
          projectTimezone = projectRecord.settings.timezone;
        }
      } catch (error) {
        if (!(error instanceof EntityNotFoundError)) {
          throw error;
        }
      }

      const stored = await saveLead(context.r2, lead);
      if (stored) {
        await mergeProjectLeadsList(context.r2, projectId, [lead]).catch(() => {});
      }

      let notificationsDispatched = false;
      if (stored) {
        notificationsDispatched = await dispatchLeadNotifications(
          context.kv,
          resolveTelegramToken(context.env),
          project,
          settings,
          lead,
          projectTimezone,
          sendProjectMessage,
        );
      }

      processed.push({
        projectId,
        leadId: lead.id,
        stored,
        duplicate: !stored,
        notificationsDispatched,
      });
    }

    return jsonResponse({ status: "ok", processed });
  });

  router.on("PUT", "/api/meta/tokens/:facebookUserId", async (context) => {
    const facebookUserId = context.state.params.facebookUserId;
    if (!facebookUserId) {
      return badRequest("facebookUserId param is required");
    }

    let payload: TokenRequestBody;
    try {
      payload = await context.json<TokenRequestBody>();
    } catch {
      return badRequest("Invalid JSON body");
    }

    try {
      const body = ensureTokenBody(payload);
      try {
        const existing = await getMetaToken(context.kv, facebookUserId);
        const updated = parseMetaToken({
          ...existing,
          accessToken: body.accessToken ?? existing.accessToken,
          refreshToken: body.refreshToken ?? existing.refreshToken,
          expiresAt: body.expiresAt ?? existing.expiresAt,
          updatedAt: new Date().toISOString(),
        });
        await upsertMetaToken(context.kv, updated);
        return jsonResponse({ token: updated });
      } catch (error) {
        if (error instanceof EntityNotFoundError) {
          const token = createMetaToken({
            facebookUserId,
            accessToken: body.accessToken,
            refreshToken: body.refreshToken,
            expiresAt: body.expiresAt,
          });
          await upsertMetaToken(context.kv, token);
          return jsonResponse({ token }, { status: 201 });
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof DataValidationError) {
        return unprocessable(error.message);
      }
      throw error;
    }
  });

  router.on("GET", "/api/meta/projects/:projectId/summary", async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }

    const url = new URL(context.request.url);
    const periodKey = url.searchParams.get("period") ?? "today";
    const facebookUserId = url.searchParams.get("facebookUserId");

    if (!facebookUserId) {
      return badRequest("facebookUserId query param is required");
    }
    try {
      const { entry } = await loadProjectSummary(context.kv, projectId, periodKey, {
        facebookUserId,
      });
      return jsonResponse(entry);
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        return notFound(error.message);
      }
      if (error instanceof DataValidationError) {
        return unprocessable(error.message);
      }
      throw error;
    }
  });

  router.on("GET", "/api/meta/projects/:projectId/campaigns", async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    const url = new URL(context.request.url);
    const periodKey = url.searchParams.get("period") ?? "today";
    const facebookUserId = url.searchParams.get("facebookUserId");

    if (!facebookUserId) {
      return badRequest("facebookUserId query param is required");
    }

    try {
      const { entry } = await loadProjectCampaigns(context.kv, projectId, periodKey, {
        facebookUserId,
      });
      return jsonResponse(entry);
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        return notFound(error.message);
      }
      if (error instanceof DataValidationError) {
        return unprocessable(error.message);
      }
      throw error;
    }
  });
};
