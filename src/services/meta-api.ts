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
  purchases: number;
  addToCart: number;
  calls: number;
  registrations: number;
  engagement: number;
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
  "promoted_object",
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

const normaliseActionType = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  return value.toLowerCase();
};

type ActionMatcher = (actionType: string) => boolean;

const countActionsByMatcher = (actions: unknown, matcher: ActionMatcher): number => {
  if (!Array.isArray(actions)) {
    return 0;
  }
  return actions.reduce((total, action) => {
    if (!action || typeof action !== "object") {
      return total;
    }
    const record = action as Record<string, unknown>;
    const type = normaliseActionType(record.action_type);
    if (type && matcher(type)) {
      return total + parseNumber(record.value);
    }
    return total;
  }, 0);
};

const includesAny = (value: string, keywords: string[]): boolean => {
  return keywords.some((keyword) => value.includes(keyword));
};

export const countLeadsFromActions = (actions: unknown): number => {
  return countActionsByMatcher(actions, (type) =>
    type === "lead" || type.includes("lead") || type.includes("submit_application"),
  );
};

const isMessageAction = (type: string): boolean => {
  const lower = type.toLowerCase();
  return lower.includes("message") || lower.includes("messaging");
};

export const countMessagesFromActions = (actions: unknown): number => {
  return countActionsByMatcher(actions, (type) => isMessageAction(type));
};

export const countPurchasesFromActions = (actions: unknown): number => {
  return countActionsByMatcher(actions, (type) => includesAny(type, ["purchase", "sale", "conversion"]));
};

export const countAddToCartFromActions = (actions: unknown): number => {
  return countActionsByMatcher(actions, (type) => includesAny(type, ["add_to_cart", "addtocart"]));
};

export const countCallsFromActions = (actions: unknown): number => {
  return countActionsByMatcher(actions, (type) => includesAny(type, ["call", "phone_call"]));
};

export const countRegistrationsFromActions = (actions: unknown): number => {
  return countActionsByMatcher(actions, (type) => includesAny(type, ["subscribe", "registration", "complete_registration"]));
};

export const countEngagementFromActions = (actions: unknown): number => {
  return countActionsByMatcher(actions, (type) => includesAny(type, ["engagement", "view_content", "post_engagement"]));
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
  const purchases = countPurchasesFromActions(aggregate.actions);
  const addToCart = countAddToCartFromActions(aggregate.actions);
  const calls = countCallsFromActions(aggregate.actions);
  const registrations = countRegistrationsFromActions(aggregate.actions);
  const engagement = countEngagementFromActions(aggregate.actions);
  return { spend, impressions, clicks, leads, messages, purchases, addToCart, calls, registrations, engagement };
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
  earliestAllowed.setDate(earliestAllowed.getDate() + 1); // stay strictly inside Meta's 37-month window
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

const buildLeadUrl = (nodeId: string, options: MetaLeadFetchOptions, cursor?: string): URL => {
  const url = new URL(`${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${nodeId}/leads`);
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

interface LeadGenFormDescriptor {
  id: string;
  accessToken?: string;
}

const fetchLeadGenForms = async (
  nodeId: string,
  accessToken: string,
  overrideToken?: string,
): Promise<LeadGenFormDescriptor[]> => {
  const forms: LeadGenFormDescriptor[] = [];
  let cursor: string | undefined;
  do {
    const url = new URL(`${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${nodeId}/leadgen_forms`);
    url.searchParams.set("access_token", overrideToken ?? accessToken);
    url.searchParams.set("limit", "100");
    url.searchParams.set("fields", "id");
    if (cursor) {
      url.searchParams.set("after", cursor);
    }
    const response = await fetch(url);
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Meta leadgen forms request failed with ${response.status}: ${errorBody}`);
    }
    const payload = (await response.json()) as {
      data?: Array<{ id?: string }>;
      paging?: { cursors?: { after?: string | null } };
    };
    if (Array.isArray(payload.data)) {
      for (const entry of payload.data) {
        if (entry && typeof entry.id === "string" && entry.id.trim()) {
          forms.push({ id: entry.id.trim(), accessToken: overrideToken ?? accessToken });
        }
      }
    }
    cursor = payload.paging?.cursors?.after ?? undefined;
  } while (cursor);
  return forms;
};

interface MetaPageRecord {
  id: string;
  accessToken?: string;
}

const normaliseId = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const buildManagedPagesUrl = (accessToken: string, after?: string | null): URL => {
  const url = new URL(`${GRAPH_API_BASE}/${GRAPH_API_VERSION}/me/accounts`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("fields", "id,name,access_token");
  url.searchParams.set("limit", "100");
  if (after) {
    url.searchParams.set("after", after);
  }
  return url;
};

const fetchManagedPages = async (accessToken: string): Promise<MetaPageRecord[]> => {
  const pages: MetaPageRecord[] = [];
  let cursor: string | undefined;
  do {
    const url = buildManagedPagesUrl(accessToken, cursor);
    const response = await fetch(url);
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Meta managed pages request failed with ${response.status}: ${errorBody}`);
    }
    const payload = (await response.json()) as {
      data?: Array<{ id?: string | number; access_token?: string }>;
      paging?: { cursors?: { after?: string | null } };
    };
    if (Array.isArray(payload.data)) {
      for (const entry of payload.data) {
        const id = normaliseId(entry?.id);
        if (!id) {
          continue;
        }
        pages.push({ id, accessToken: typeof entry?.access_token === "string" ? entry.access_token : undefined });
      }
    }
    cursor = payload.paging?.cursors?.after ?? undefined;
  } while (cursor);
  return pages;
};

const extractPromotedPageIds = (campaigns: Record<string, unknown>[]): string[] => {
  const ids = new Set<string>();
  for (const campaign of campaigns) {
    const promoted = campaign?.promoted_object;
    if (!promoted || typeof promoted !== "object") {
      continue;
    }
    const pageId = normaliseId((promoted as Record<string, unknown>).page_id);
    if (pageId) {
      ids.add(pageId);
    }
  }
  return Array.from(ids);
};

const fetchLeadGenFormsViaPages = async (
  accountId: string,
  accessToken: string,
): Promise<LeadGenFormDescriptor[]> => {
  const campaigns = await fetchMetaCampaignStatuses(accountId, accessToken);
  const campaignPageIds = extractPromotedPageIds(campaigns);
  let managedPages: MetaPageRecord[] = [];
  let managedPagesError: Error | null = null;
  try {
    managedPages = await fetchManagedPages(accessToken);
  } catch (error) {
    managedPagesError = error as Error;
    console.warn(`[meta] Failed to enumerate managed pages: ${managedPagesError.message}`);
  }
  const pageIds = new Set<string>();
  campaignPageIds.forEach((id) => pageIds.add(id));
  managedPages.forEach((page) => pageIds.add(page.id));
  if (pageIds.size === 0) {
    if (managedPagesError) {
      throw managedPagesError;
    }
    return [];
  }
  const tokenByPageId = new Map<string, string>();
  for (const page of managedPages) {
    if (page.accessToken) {
      tokenByPageId.set(page.id, page.accessToken);
    }
  }
  const forms = new Map<string, LeadGenFormDescriptor>();
  for (const pageId of pageIds) {
    const token = tokenByPageId.get(pageId) ?? accessToken;
    try {
      const pageForms = await fetchLeadGenForms(pageId, token, token);
      pageForms.forEach((form) => forms.set(form.id, form));
    } catch (error) {
      console.warn(`[meta] Failed to load leadgen forms for page ${pageId}: ${(error as Error).message}`);
    }
  }
  return Array.from(forms.values());
};

const fetchLeadsForNode = async (
  nodeId: string,
  options: MetaLeadFetchOptions,
  limit?: number,
): Promise<MetaLeadRecord[]> => {
  const collected: MetaLeadRecord[] = [];
  let cursor: string | undefined;
  do {
    const url = buildLeadUrl(nodeId, options, cursor);
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
    if (limit && collected.length >= limit) {
      return collected.slice(0, limit);
    }
  } while (cursor);
  return limit ? collected.slice(0, limit) : collected;
};

export const fetchMetaLeads = async (options: MetaLeadFetchOptions): Promise<MetaLeadRecord[]> => {
  if (!options.accountId) {
    throw new DataValidationError("Meta Ads account id is required for leads");
  }
  if (!options.accessToken) {
    throw new DataValidationError("Meta access token is required for leads");
  }
  const limit = options.limit;
  let accountError: Error | null = null;
  try {
    const accountLeads = await fetchLeadsForNode(options.accountId, options, limit);
    if (accountLeads.length > 0) {
      return limit ? accountLeads.slice(0, limit) : accountLeads;
    }
  } catch (error) {
    accountError = error as Error;
    console.warn(`[meta] Failed to download leads via account ${options.accountId}: ${accountError.message}`);
  }
  let primaryError: Error | null = null;
  let fallbackError: Error | null = null;
  let fallbackAttempted = false;
  let forms: LeadGenFormDescriptor[] = [];
  try {
    forms = await fetchLeadGenForms(options.accountId, options.accessToken);
  } catch (error) {
    primaryError = error as Error;
  }
  if (forms.length === 0) {
    fallbackAttempted = true;
    try {
      forms = await fetchLeadGenFormsViaPages(options.accountId, options.accessToken);
    } catch (error) {
      fallbackError = error as Error;
    }
  }
  if (forms.length === 0) {
    if (fallbackError) {
      throw fallbackError;
    }
    if (primaryError && !fallbackAttempted) {
      throw primaryError;
    }
    if (accountError) {
      throw accountError;
    }
    return [];
  }
  const collected: MetaLeadRecord[] = [];
  for (const form of forms) {
    const remaining = typeof limit === "number" ? Math.max(limit - collected.length, 0) : undefined;
    if (remaining === 0) {
      break;
    }
    const token = form.accessToken ?? options.accessToken;
    const leads = await fetchLeadsForNode(form.id, { ...options, accessToken: token }, remaining);
    collected.push(...leads);
    if (limit && collected.length >= limit) {
      break;
    }
  }
  return limit ? collected.slice(0, limit) : collected;
};
