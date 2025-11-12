import type { RouteHandler, DashboardSnapshot, LeadRecord, WebhookStatus, Env } from "../core/types";
import { requireAdmin } from "../core/auth";
import { listLeads, getMetaStatsSummary } from "../core/db";
import { ok } from "../core/utils";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const TELEGRAM_API = "https://api.telegram.org";

function startOfUtcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function countBy<T>(items: T[], selector: (item: T) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const raw = selector(item);
    const value = typeof raw === "string" ? raw : raw?.toString() ?? "";
    const key = value.trim().length > 0 ? value : "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function normalizeSource(source?: LeadRecord["source"]) {
  if (!source) return "unknown";
  const text = source.toString().trim();
  return text.length > 0 ? text : "unknown";
}

async function getWebhookStatus(env: Env): Promise<WebhookStatus> {
  if (!env.TELEGRAM_TOKEN) {
    return { configured: false, error: "TELEGRAM_TOKEN is not configured" };
  }

  try {
    const response = await fetch(`${TELEGRAM_API}/bot${env.TELEGRAM_TOKEN}/getWebhookInfo`);
    if (!response.ok) {
      return { configured: true, error: `HTTP ${response.status}` };
    }
    const body = await response.json<{
      ok: boolean;
      result?: {
        url?: string;
        has_custom_certificate?: boolean;
        pending_update_count?: number;
        last_error_message?: string;
        last_error_date?: number;
      };
    }>();

    const result = body.result ?? {};
    return {
      configured: Boolean(result.url),
      url: result.url,
      hasCustomCertificate: result.has_custom_certificate,
      pendingUpdateCount: result.pending_update_count,
      lastErrorMessage: result.last_error_message,
      lastErrorDate: result.last_error_date ? new Date(result.last_error_date * 1000).toISOString() : undefined,
      error: body.ok ? undefined : "Telegram API returned ok=false",
    };
  } catch (error) {
    return { configured: true, error: error instanceof Error ? error.message : String(error) };
  }
}

export const dashboardHandler: RouteHandler = async (context) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  const leads = await listLeads(context.env);
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const tomorrowStart = todayStart + DAY_IN_MS;
  const yesterdayStart = todayStart - DAY_IN_MS;

  let today = 0;
  let yesterday = 0;

  for (const lead of leads) {
    const timestamp = Date.parse(lead.createdAt);
    if (Number.isNaN(timestamp)) continue;
    if (timestamp >= todayStart && timestamp < tomorrowStart) {
      today += 1;
    } else if (timestamp >= yesterdayStart && timestamp < todayStart) {
      yesterday += 1;
    }
  }

  const snapshot: DashboardSnapshot = {
    generatedAt: now.toISOString(),
    leads: {
      total: leads.length,
      today,
      yesterday,
      statuses: countBy(leads, (lead) => lead.status ?? "unknown"),
      sources: countBy(leads, (lead) => normalizeSource(lead.source)),
      recent: leads.slice(0, 5),
    },
    meta: await getMetaStatsSummary(context.env),
    telegramWebhook: await getWebhookStatus(context.env),
  };

  return ok({ snapshot });
};
