import {
  createMetaCacheEntry,
  getMetaCache,
  isMetaCacheEntryFresh,
  saveMetaCache,
  type MetaCacheEntry,
} from "../domain/meta-cache";
import { createMetaToken, getMetaToken, parseMetaToken, upsertMetaToken } from "../domain/meta-tokens";
import { ensureProjectSettings, type ProjectSettings } from "../domain/project-settings";
import { getProject, type Project } from "../domain/projects";
import { getLead, saveLead, type Lead } from "../domain/leads";
import type { MetaSummaryPayload } from "../domain/meta-summary";
import { DataValidationError, EntityNotFoundError } from "../errors";
import { jsonResponse } from "../http/responses";
import { fetchMetaInsights, fetchMetaInsightsRaw, resolveDatePreset } from "../services/meta-api";
import { parseMetaWebhookPayload } from "../services/meta-webhook";
import { sendTelegramMessage } from "../services/telegram";
import type { Router } from "../worker/router";

const CACHE_TTL_SECONDS = 60;

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

const safeText = (value: string | null): string => {
  if (!value) {
    return "—";
  }
  return escapeHtml(value);
};

const buildLeadNotificationMessage = (lead: Lead): string => {
  const lines = [
    "🔔 Новый лид (контакт)",
    `Имя: ${escapeHtml(lead.name)}`,
    `Телефон: ${formatPhoneForMessage(lead.phone)}`,
    `Кампания: ${safeText(lead.campaign)}`,
    `Объявление: ${safeText(lead.ad)}`,
  ];
  return lines.join("\n");
};

const shouldNotifyChat = (settings: ProjectSettings): boolean => {
  return (
    settings.chatId != null &&
    (settings.alerts.route === "CHAT" || settings.alerts.route === "BOTH")
  );
};

const shouldNotifyAdmin = (settings: ProjectSettings): boolean => {
  return settings.alerts.route === "ADMIN" || settings.alerts.route === "BOTH";
};

const dispatchLeadNotifications = (
  token: string | undefined,
  project: Project,
  settings: ProjectSettings,
  lead: Lead,
): Promise<void>[] => {
  if (!token || !settings.alerts.leadNotifications) {
    return [];
  }

  const message = buildLeadNotificationMessage(lead);
  const promises: Promise<void>[] = [];

  if (shouldNotifyChat(settings)) {
    promises.push(
      sendTelegramMessage(token, {
        chatId: settings.chatId!,
        messageThreadId: settings.topicId ?? undefined,
        text: message,
        parseMode: "HTML",
        disableWebPagePreview: true,
      }).then(() => undefined),
    );
  }

  if (shouldNotifyAdmin(settings)) {
    promises.push(
      sendTelegramMessage(token, {
        chatId: project.ownerTelegramId,
        text: message,
        parseMode: "HTML",
        disableWebPagePreview: true,
      }).then(() => undefined),
    );
  }

  return promises;
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

const toIsoDate = (date: Date): string => date.toISOString().split("T")[0] ?? date.toISOString();

const startOfDay = (date: Date): Date => {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
};

const addDays = (date: Date, days: number): Date => {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
};

const resolveCachePeriod = (periodKey: string): { from: string; to: string } => {
  const now = new Date();
  const today = startOfDay(now);
  switch (periodKey) {
    case "today": {
      const from = toIsoDate(today);
      return { from, to: from };
    }
    case "yesterday": {
      const from = toIsoDate(addDays(today, -1));
      return { from, to: from };
    }
    case "week": {
      const from = toIsoDate(addDays(today, -6));
      return { from, to: toIsoDate(today) };
    }
    case "month": {
      const from = toIsoDate(addDays(today, -29));
      return { from, to: toIsoDate(today) };
    }
    case "max": {
      return { from: "1970-01-01", to: toIsoDate(today) };
    }
    default:
      return { from: toIsoDate(today), to: toIsoDate(today) };
  }
};

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

export const registerMetaRoutes = (router: Router): void => {
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

      const existing = await getLead(context.r2, projectId, lead.id);
      const duplicate = Boolean(existing);

      await saveLead(context.r2, lead);

      let notificationsDispatched = false;
      if (!duplicate) {
        const tasks = dispatchLeadNotifications(
          context.env.TELEGRAM_BOT_TOKEN,
          project,
          settings,
          lead,
        );
        if (tasks.length > 0) {
          notificationsDispatched = true;
          context.waitUntil(Promise.allSettled(tasks));
        }
      }

      processed.push({
        projectId,
        leadId: lead.id,
        stored: true,
        duplicate,
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

    const summaryScope = `summary:${periodKey}`;

    try {
      const cachedSummary = await getMetaCache<MetaSummaryPayload>(context.kv, projectId, summaryScope);
      if (cachedSummary && isMetaCacheEntryFresh(cachedSummary)) {
        return jsonResponse(cachedSummary);
      }

      const project = await getProject(context.kv, projectId);
      if (!project.adsAccountId) {
        return unprocessable("Project is missing adsAccountId for Meta insights");
      }

      const token = await getMetaToken(context.kv, facebookUserId);

      type MetaInsightsEntry = MetaCacheEntry<Awaited<ReturnType<typeof fetchMetaInsights>>>;

      const ensureInsights = async (key: string): Promise<MetaInsightsEntry> => {
        const scope = `insights:${key}`;
        const cached = await getMetaCache<Awaited<ReturnType<typeof fetchMetaInsights>>>(
          context.kv,
          projectId,
          scope,
        );
        if (cached && isMetaCacheEntryFresh(cached)) {
          return cached;
        }
        const result = await fetchMetaInsights({
          accountId: project.adsAccountId!,
          accessToken: token.accessToken,
          period: resolveDatePreset(key),
        });
        const entry = createMetaCacheEntry(projectId, scope, resolveCachePeriod(key), result, CACHE_TTL_SECONDS);
        await saveMetaCache(context.kv, entry);
        return entry;
      };

      const requestedInsights = await ensureInsights(periodKey);
      const lifetimeInsights = await ensureInsights("max");
      const todayInsights = periodKey === "today" ? requestedInsights : await ensureInsights("today");

      const metrics = {
        spend: requestedInsights.payload.summary.spend,
        impressions: requestedInsights.payload.summary.impressions,
        clicks: requestedInsights.payload.summary.clicks,
        leads: requestedInsights.payload.summary.leads,
        leadsToday: todayInsights.payload.summary.leads,
        leadsTotal: lifetimeInsights.payload.summary.leads,
        cpa:
          requestedInsights.payload.summary.leads > 0
            ? requestedInsights.payload.summary.spend / requestedInsights.payload.summary.leads
            : null,
      };

      const summaryEntry = createMetaCacheEntry<MetaSummaryPayload>(
        projectId,
        summaryScope,
        resolveCachePeriod(periodKey),
        {
          periodKey,
          metrics,
          source: requestedInsights.payload.raw,
        },
        CACHE_TTL_SECONDS,
      );
      await saveMetaCache(context.kv, summaryEntry);
      return jsonResponse(summaryEntry);
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

    const scope = `campaigns:${periodKey}`;
    try {
      const cached = await getMetaCache<unknown>(context.kv, projectId, scope);
      if (cached && isMetaCacheEntryFresh(cached)) {
        return jsonResponse(cached);
      }

      const project = await getProject(context.kv, projectId);
      if (!project.adsAccountId) {
        return unprocessable("Project is missing adsAccountId for Meta insights");
      }
      const token = await getMetaToken(context.kv, facebookUserId);

      const raw = await fetchMetaInsightsRaw({
        accountId: project.adsAccountId,
        accessToken: token.accessToken,
        period: resolveDatePreset(periodKey),
        level: "campaign",
        fields: [
          "campaign_id",
          "campaign_name",
          "spend",
          "impressions",
          "clicks",
          "actions",
        ].join(","),
      });
      const entry = createMetaCacheEntry(projectId, scope, resolveCachePeriod(periodKey), raw, CACHE_TTL_SECONDS);
      await saveMetaCache(context.kv, entry);
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
