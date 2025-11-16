import { DataValidationError } from "../errors";

export interface MetaInsightsPeriod {
  preset: string;
  from?: string;
  to?: string;
}

export interface MetaFetchOptions {
  accountId: string;
  accessToken: string;
  period: MetaInsightsPeriod;
  fields?: string;
  level?: string;
}

export interface MetaInsightsRawResponse {
  data: Record<string, unknown>[];
  paging?: Record<string, unknown>;
  summary?: Record<string, unknown>;
}

export interface MetaInsightsSummary {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
}

export interface MetaInsightsResult {
  summary: MetaInsightsSummary;
  raw: MetaInsightsRawResponse;
}

const DEFAULT_FIELDS = [
  "spend",
  "impressions",
  "clicks",
  "actions",
  "action_values",
];

const DEFAULT_LEVEL = "account";
const GRAPH_API_BASE = "https://graph.facebook.com";
const GRAPH_API_VERSION = "v18.0";
const CAMPAIGN_FIELDS = [
  "id",
  "name",
  "status",
  "effective_status",
  "daily_budget",
  "budget_remaining",
  "lifetime_budget",
  "updated_time",
  "configured_status",
];

const parseNumber = (value: unknown): number => {
  if (value == null) {
    return 0;
  }
  const num = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  if (Number.isNaN(num)) {
    return 0;
  }
  return num;
};

export const countLeadsFromActions = (actions: unknown): number => {
  if (!Array.isArray(actions)) {
    return 0;
  }
  return actions.reduce((total, action) => {
    if (!action || typeof action !== "object") {
      return total;
    }
    const record = action as Record<string, unknown>;
    const type = record.action_type;
    if (type === "lead" || type === "onsite_conversion.lead_grouped") {
      return total + parseNumber(record.value);
    }
    return total;
  }, 0);
};

const buildInsightsUrl = (options: MetaFetchOptions): URL => {
  const { accountId, accessToken, period, fields = DEFAULT_FIELDS.join(","), level = DEFAULT_LEVEL } =
    options;
  if (!accountId) {
    throw new DataValidationError("Meta Ads account id is required");
  }
  if (!accessToken) {
    throw new DataValidationError("Meta access token is required");
  }

  const url = new URL(`${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${accountId}/insights`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("fields", fields);
  url.searchParams.set("level", level);
  if (period.preset === "time_range" && period.from && period.to) {
    url.searchParams.set("time_range", JSON.stringify({ since: period.from, until: period.to }));
  } else {
    url.searchParams.set("date_preset", period.preset);
  }
  return url;
};

const buildCampaignsUrl = (accountId: string, accessToken: string, after?: string | null): URL => {
  const url = new URL(`${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${accountId}/campaigns`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("fields", CAMPAIGN_FIELDS.join(","));
  url.searchParams.set("limit", "200");
  if (after) {
    url.searchParams.set("after", after);
  }
  return url;
};

export const fetchMetaInsightsRaw = async (options: MetaFetchOptions): Promise<MetaInsightsRawResponse> => {
  const url = buildInsightsUrl(options);
  const response = await fetch(url);
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Meta API request failed with ${response.status}: ${errorBody}`);
  }
  const json = (await response.json()) as MetaInsightsRawResponse;
  json.data = Array.isArray(json.data) ? json.data : [];
  return json;
};

export const summariseMetaInsights = (raw: MetaInsightsRawResponse): MetaInsightsSummary => {
  const aggregate = raw.data.length > 0 ? (raw.data[0] as Record<string, unknown>) : {};
  const spend = parseNumber(aggregate.spend);
  const impressions = parseNumber(aggregate.impressions);
  const clicks = parseNumber(aggregate.clicks);
  const leads = countLeadsFromActions(aggregate.actions);
  return { spend, impressions, clicks, leads };
};

export const fetchMetaInsights = async (options: MetaFetchOptions): Promise<MetaInsightsResult> => {
  const raw = await fetchMetaInsightsRaw(options);
  return {
    raw,
    summary: summariseMetaInsights(raw),
  };
};

export const fetchMetaCampaignStatuses = async (
  accountId: string,
  accessToken: string,
): Promise<Record<string, unknown>[]> => {
  let after: string | undefined;
  const campaigns: Record<string, unknown>[] = [];

  do {
    const url = buildCampaignsUrl(accountId, accessToken, after);
    const response = await fetch(url);
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Meta campaign request failed with ${response.status}: ${errorBody}`);
    }
    const json = (await response.json()) as {
      data?: Record<string, unknown>[];
      paging?: { cursors?: { after?: string | null } };
    };
    if (Array.isArray(json.data)) {
      campaigns.push(...json.data);
    }
    after = json.paging?.cursors?.after ?? undefined;
  } while (after);

  return campaigns;
};

export const resolveDatePreset = (periodKey: string): MetaInsightsPeriod => {
  switch (periodKey) {
    case "today":
      return { preset: "today" };
    case "yesterday":
      return { preset: "yesterday" };
    case "week":
      return { preset: "last_7d" };
    case "month":
      return { preset: "last_30d" };
    case "max":
      return { preset: "lifetime" };
    default:
      return { preset: "today" };
  }
};
