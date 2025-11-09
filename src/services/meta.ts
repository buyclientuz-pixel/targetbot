import { fetch } from "undici";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { loadEnv } from "../utils/env";
import { MetricSet, Objective, ProjectObjective } from "../types/domain";
import { kvGet, kvPut } from "./kv";

dayjs.extend(utc);
dayjs.extend(timezone);

const GRAPH_BASE = "https://graph.facebook.com/v18.0";

const OBJECTIVE_FIELDS: Record<Objective, MetricSet> = {
  TRAFFIC: {
    fields: [
      "impressions",
      "reach",
      "spend",
      "cpc",
      "ctr",
      "link_clicks",
      "landing_page_view",
    ],
  },
  LEAD_GENERATION: {
    fields: [
      "impressions",
      "reach",
      "spend",
      "cpl",
      "inline_link_clicks",
      "leads",
    ],
  },
  ENGAGEMENT: {
    fields: [
      "impressions",
      "reach",
      "spend",
      "post_engagement",
      "ctr",
      "inline_post_engagement",
    ],
  },
  AWARENESS: {
    fields: [
      "impressions",
      "reach",
      "spend",
      "frequency",
      "estimated_ad_recallers",
    ],
  },
  CONVERSIONS: {
    fields: [
      "impressions",
      "reach",
      "spend",
      "cpa",
      "purchases",
      "purchase_roas",
      "adds_to_cart",
    ],
  },
  SALES: {
    fields: [
      "impressions",
      "reach",
      "spend",
      "cpa",
      "purchases",
      "purchase_roas",
      "adds_to_cart",
    ],
  },
  APP_PROMOTION: {
    fields: [
      "impressions",
      "reach",
      "spend",
      "app_install",
      "cost_per_app_install",
      "app_custom_event",
    ],
  },
};

export function getMetricSet(objective: Objective): MetricSet {
  return OBJECTIVE_FIELDS[objective];
}

export async function getProjectObjective(projectId: string): Promise<ProjectObjective | null> {
  const key = `fb:objective:${projectId}`;
  const raw = await kvGet(key);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as ProjectObjective;
}

export async function setProjectObjective(
  projectId: string,
  objective: Objective,
  source: "auto" | "manual"
): Promise<ProjectObjective> {
  const entry: ProjectObjective = {
    objective,
    source,
    updatedAt: new Date().toISOString(),
  };
  await kvPut(`fb:objective:${projectId}`, JSON.stringify(entry));
  return entry;
}

async function graphRequest<T>(path: string, params: Record<string, string>): Promise<T> {
  const { FB_LONG_TOKEN, FB_APP_ID, FB_APP_SECRET } = loadEnv();
  const token = FB_LONG_TOKEN ?? `${FB_APP_ID}|${FB_APP_SECRET}`;
  const url = new URL(`${GRAPH_BASE}/${path}`);
  url.search = new URLSearchParams({ ...params, access_token: token }).toString();

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API error (${res.status}) ${path}: ${text}`);
  }

  return (await res.json()) as T;
}

export async function getCampaignObjectives(accountId: string): Promise<Record<Objective, number>> {
  const data = await graphRequest<{
    data: { objective: Objective }[];
  }>(`act_${accountId}/campaigns`, {
    fields: "objective",
    limit: "200",
  });

  const summary: Record<Objective, number> = {
    LEAD_GENERATION: 0,
    CONVERSIONS: 0,
    AWARENESS: 0,
    TRAFFIC: 0,
    ENGAGEMENT: 0,
    APP_PROMOTION: 0,
    SALES: 0,
  };

  for (const item of data.data) {
    if (item.objective in summary) {
      summary[item.objective] += 1;
    }
  }

  return summary;
}

export async function getProjectInsights(
  entityId: string,
  objective: Objective,
  preset: "today" | "yesterday" | "last_7d"
): Promise<unknown> {
  const metrics = getMetricSet(objective);
  const params = new URLSearchParams({
    date_preset: preset,
    fields: metrics.fields.join(","),
  });
  if (metrics.breakdowns?.length) {
    params.set("breakdowns", metrics.breakdowns.join(","));
  }

  return graphRequest(`${entityId}/insights`, Object.fromEntries(params));
}

export async function refreshLongTokenIfNeeded(): Promise<void> {
  // Refresh token logic could be added here. Leaving as placeholder for now to avoid leaking secrets.
}
