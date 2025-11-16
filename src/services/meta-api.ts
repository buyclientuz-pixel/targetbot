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
  messages: number;
}

export interface MetaInsightsResult {
  summary: MetaInsightsSummary;
  raw: MetaInsightsRawResponse;
}

export interface MetaLeadFieldValue {
  name?: string | null;
  values?: Array<{ value?: string | null } | string> | null;
}

export interface MetaLeadRecord {
  id: string;
  created_time?: string | null;
  campaign_name?: string | null;
  adset_name?: string | null;
  ad_name?: string | null;
  field_data?: MetaLeadFieldValue[] | null;
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

const isMessageAction = (type: unknown): boolean => {
  if (typeof type !== "string") {
    return false;
  }
  const lower = type.toLowerCase();
  return lower.includes("message") || lower.includes("messaging");
};

export const countMessagesFromActions = (actions: unknown): number => {
  if (!Array.isArray(actions)) {
    return 0;
  }
  return actions.reduce((total, action) => {
    if (!action || typeof action !== "object") {
      return total;
    }
    const record = action as Record<string, unknown>;
    if (isMessageAction(record.action_type)) {
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
  const messages = countMessagesFromActions(aggregate.actions);
  return { spend, impressions, clicks, leads, messages };
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

const formatDateOnly = (date: Date): string => {
  const iso = date.toISOString();
  return iso.split("T")[0] ?? iso;
};

const META_TIME_RANGE_MONTH_LIMIT = 37;

const clampToMetaTimeRangeLimit = (requestedFrom: Date, today: Date): Date => {
  const earliestAllowed = new Date(today);
  earliestAllowed.setMonth(earliestAllowed.getMonth() - META_TIME_RANGE_MONTH_LIMIT);
  if (requestedFrom < earliestAllowed) {
    return earliestAllowed;
  }
  return requestedFrom;
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
    case "max": {
      const today = new Date();
      const from = clampToMetaTimeRangeLimit(new Date(0), today);
      return { preset: "time_range", from: formatDateOnly(from), to: formatDateOnly(today) };
    }
    default:
      return { preset: "today" };
  }
};

interface MetaLeadFetchOptions {
  accountId: string;
  accessToken: string;
  limit?: number;
  since?: Date;
}

const buildLeadUrl = (options: MetaLeadFetchOptions, cursor?: string): URL => {
  const url = new URL(`${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${options.accountId}/leads`);
  url.searchParams.set("access_token", options.accessToken);
  url.searchParams.set("fields", ["id", "created_time", "campaign_name", "adset_name", "ad_name", "field_data"].join(","));
  url.searchParams.set("limit", "100");
  if (cursor) {
    url.searchParams.set("after", cursor);
  }
  if (options.since) {
    const sinceTs = Math.floor(options.since.getTime() / 1000);
    if (Number.isFinite(sinceTs)) {
      url.searchParams.set("filtering", JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: sinceTs }]));
    }
  }
  return url;
};

const normaliseLeadRecord = (record: Record<string, unknown>): MetaLeadRecord | null => {
  const idValue = record.id ?? record["id"];
  if (typeof idValue !== "string" || !idValue.trim()) {
    return null;
  }
  return {
    id: idValue.trim(),
    created_time: typeof record.created_time === "string" ? record.created_time : null,
    campaign_name: typeof record.campaign_name === "string" ? record.campaign_name : null,
    adset_name: typeof record.adset_name === "string" ? record.adset_name : null,
    ad_name: typeof record.ad_name === "string" ? record.ad_name : null,
    field_data: Array.isArray(record.field_data) ? (record.field_data as MetaLeadFieldValue[]) : null,
  } satisfies MetaLeadRecord;
};

export const fetchMetaLeads = async (options: MetaLeadFetchOptions): Promise<MetaLeadRecord[]> => {
  if (!options.accountId) {
    throw new DataValidationError("Meta Ads account id is required for leads");
  }
  if (!options.accessToken) {
    throw new DataValidationError("Meta access token is required for leads");
  }
  const collected: MetaLeadRecord[] = [];
  let cursor: string | undefined;
  do {
    const url = buildLeadUrl(options, cursor);
    const response = await fetch(url);
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Meta leads request failed with ${response.status}: ${errorBody}`);
    }
    const payload = (await response.json()) as {
      data?: Record<string, unknown>[];
      paging?: { cursors?: { after?: string | null } };
    };
    if (Array.isArray(payload.data)) {
      for (const entry of payload.data) {
        if (entry && typeof entry === "object") {
          const normalised = normaliseLeadRecord(entry as Record<string, unknown>);
          if (normalised) {
            collected.push(normalised);
          }
        }
      }
    }
    cursor = payload.paging?.cursors?.after ?? undefined;
    if (options.limit && collected.length >= options.limit) {
      return collected.slice(0, options.limit);
    }
  } while (cursor);
  return options.limit ? collected.slice(0, options.limit) : collected;
};
