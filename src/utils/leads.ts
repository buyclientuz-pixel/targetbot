import { LeadRecord, MetaCampaign } from "../types";
import { EnvBindings, listLeads, loadMetaToken, loadProject, saveLeads } from "./storage";
import { fetchCampaigns, withMetaSettings, callGraph } from "./meta";

interface GraphLeadField {
  name?: string;
  values?: Array<string | number | boolean | null>;
}

interface GraphLeadNode {
  id?: string;
  created_time?: string;
  ad_id?: string;
  form_id?: string;
  campaign_id?: string;
  field_data?: GraphLeadField[];
}

interface GraphLeadResponse {
  data?: GraphLeadNode[];
  paging?: {
    cursors?: { after?: string };
  };
}

interface GraphFormResponse {
  data?: Array<{ id?: string }>; 
}

interface GraphAdsResponse {
  data?: Array<{ id?: string }>; 
}

const MAX_LEAD_PAGES = 5;

const normalizeAccountId = (accountId: string): string => {
  return accountId.startsWith("act_") ? accountId : `act_${accountId}`;
};

const pickFieldValue = (fields: GraphLeadField[] | undefined, keys: string[]): string | undefined => {
  if (!Array.isArray(fields)) {
    return undefined;
  }
  for (const key of keys) {
    for (const field of fields) {
      if (!field?.name) continue;
      if (field.name.toLowerCase() !== key.toLowerCase()) continue;
      const values = field.values?.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      );
      if (values && values.length) {
        return values[0].trim();
      }
    }
  }
  return undefined;
};

const combineName = (fields: GraphLeadField[] | undefined): string | undefined => {
  const full = pickFieldValue(fields, ["full_name", "name"]);
  if (full) {
    return full;
  }
  const first = pickFieldValue(fields, ["first_name", "firstName", "firstname"]);
  const last = pickFieldValue(fields, ["last_name", "lastName", "lastname"]);
  if (first || last) {
    return [first, last].filter(Boolean).join(" ").trim();
  }
  return undefined;
};

const extractPhone = (fields: GraphLeadField[] | undefined): string | undefined => {
  return pickFieldValue(fields, ["phone_number", "phone", "phone number"]);
};

const fetchLeadEdge = async (
  env: EnvBindings & Record<string, unknown>,
  accessToken: string,
  path: string,
  params: Record<string, string> = {},
): Promise<GraphLeadNode[]> => {
  const results: GraphLeadNode[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_LEAD_PAGES; page += 1) {
    const response = await callGraph<GraphLeadResponse>(env, path, {
      access_token: accessToken,
      limit: params.limit ?? "200",
      ...params,
      ...(after ? { after } : {}),
    }).catch((error: Error) => {
      console.warn("Failed to fetch Meta leads", path, error.message);
      return null;
    });
    if (!response?.data?.length) {
      break;
    }
    results.push(...response.data);
    after = response.paging?.cursors?.after;
    if (!after) {
      break;
    }
  }
  return results;
};

const fetchAccountForms = async (
  env: EnvBindings & Record<string, unknown>,
  accessToken: string,
  accountId: string,
): Promise<string[]> => {
  const response = await callGraph<GraphFormResponse>(env, `${accountId}/leadgen_forms`, {
    access_token: accessToken,
    limit: "200",
  }).catch((error: Error) => {
    console.warn("Failed to fetch account forms", accountId, error.message);
    return null;
  });
  return (response?.data || []).map((item) => (item?.id ? String(item.id) : null)).filter((id): id is string => Boolean(id));
};

const fetchCampaignAds = async (
  env: EnvBindings & Record<string, unknown>,
  accessToken: string,
  campaignId: string,
): Promise<string[]> => {
  const response = await callGraph<GraphAdsResponse>(env, `${campaignId}/ads`, {
    access_token: accessToken,
    fields: "id",
    limit: "100",
  }).catch((error: Error) => {
    console.warn("Failed to fetch campaign ads", campaignId, error.message);
    return null;
  });
  return (response?.data || []).map((item) => (item?.id ? String(item.id) : null)).filter((id): id is string => Boolean(id));
};

const resolveLeadRecord = (
  projectId: string,
  node: GraphLeadNode,
  overrides: { campaignId?: string | null; formId?: string | null; adId?: string | null },
): LeadRecord | null => {
  if (!node?.id) {
    return null;
  }
  const createdRaw = node.created_time ? Date.parse(node.created_time) : Date.now();
  const createdAt = Number.isNaN(createdRaw) ? new Date().toISOString() : new Date(createdRaw).toISOString();
  const fields = node.field_data;
  const name = combineName(fields) || `Лид ${String(node.id).slice(-6)}`;
  const phone = extractPhone(fields) || null;
  const campaignId = overrides.campaignId ?? (node.campaign_id ? String(node.campaign_id) : null);
  const formId = overrides.formId ?? (node.form_id ? String(node.form_id) : null);
  const adId = overrides.adId ?? (node.ad_id ? String(node.ad_id) : null);
  return {
    id: String(node.id),
    projectId,
    name,
    phone,
    source: "facebook",
    campaignId,
    formId,
    adId,
    status: "new",
    createdAt,
  };
};

export interface SyncProjectLeadsResult {
  newLeads: number;
  total: number;
  synced: number;
}

export const getProjectLeads = async (env: EnvBindings, projectId: string): Promise<LeadRecord[]> => {
  return listLeads(env, projectId);
};

export const syncProjectLeads = async (
  env: EnvBindings & Record<string, unknown>,
  projectId: string,
): Promise<SyncProjectLeadsResult> => {
  const project = await loadProject(env, projectId);
  if (!project) {
    return { newLeads: 0, total: 0, synced: 0 };
  }
  const existing = await listLeads(env, projectId).catch(() => [] as LeadRecord[]);
  const accountId = project.adAccountId || project.metaAccountId;
  if (!accountId) {
    return { newLeads: 0, total: existing.length, synced: 0 };
  }
  const metaEnv = await withMetaSettings(env);
  const tokenRecord = await loadMetaToken(metaEnv);
  if (!tokenRecord?.accessToken) {
    return { newLeads: 0, total: existing.length, synced: 0 };
  }
  const accessToken = tokenRecord.accessToken;
  const normalizedAccount = normalizeAccountId(accountId);
  const [forms, campaigns] = await Promise.all([
    fetchAccountForms(metaEnv, accessToken, normalizedAccount),
    fetchCampaigns(metaEnv, tokenRecord, normalizedAccount, { limit: 50, datePreset: "today" }).catch(() => [] as MetaCampaign[]),
  ]);
  const adIds = new Set<string>();
  const collected = new Map<string, LeadRecord>();
  const existingMap = new Map(existing.map((lead) => [lead.id, lead]));
  let synced = 0;
  for (const formId of forms) {
    const nodes = await fetchLeadEdge(metaEnv, accessToken, `${formId}/leads`, { limit: "200" });
    for (const node of nodes) {
      const record = resolveLeadRecord(projectId, node, { formId });
      if (!record) continue;
      if (record.adId) {
        adIds.add(record.adId);
      }
      const previous = existingMap.get(record.id);
      if (previous) {
        record.status = previous.status;
        if (previous.phone && !record.phone) {
          record.phone = previous.phone;
        }
      }
      collected.set(record.id, record);
      synced += 1;
    }
  }
  for (const campaign of campaigns) {
    const ads = await fetchCampaignAds(metaEnv, accessToken, campaign.id);
    ads.forEach((id) => adIds.add(id));
  }
  for (const adId of Array.from(adIds)) {
    const nodes = await fetchLeadEdge(metaEnv, accessToken, `${adId}/leads`, { limit: "200" });
    for (const node of nodes) {
      const record = resolveLeadRecord(projectId, node, { adId });
      if (!record) continue;
      if (!record.campaignId && node.campaign_id) {
        record.campaignId = String(node.campaign_id);
      }
      const previous = existingMap.get(record.id) || collected.get(record.id);
      if (previous) {
        record.status = previous.status;
        if (previous.phone && !record.phone) {
          record.phone = previous.phone;
        }
      }
      collected.set(record.id, record);
      synced += 1;
    }
  }
  existing.forEach((lead) => {
    if (!collected.has(lead.id)) {
      collected.set(lead.id, lead);
    }
  });
  const next = Array.from(collected.values());
  const beforeIds = new Set(existing.map((lead) => lead.id));
  const newCount = next.filter((lead) => !beforeIds.has(lead.id)).length;
  await saveLeads(env, projectId, next);
  return { newLeads: newCount, total: next.length, synced };
};
