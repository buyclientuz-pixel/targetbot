import type { TargetBotEnv } from "../worker/types";

export interface MetaLeadFieldValue {
  value?: string;
}

export interface MetaLeadFieldEntry {
  name?: string;
  values?: Array<string | MetaLeadFieldValue>;
}

export interface MetaLeadRecord {
  id: string;
  created_time: string;
  field_data?: MetaLeadFieldEntry[];
}

export interface StoredLead {
  lead_id: string;
  project_id: string;
  form_id: string;
  name: string | null;
  phone: string | null;
  created_time: string;
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

const getFormIdsKey = (projectId: string): string => `FORM_IDS:${projectId}`;
const getLeadKey = (projectId: string, leadId: string): string => `LEAD:${projectId}:${leadId}`;

export const parseFieldData = (fieldData: MetaLeadFieldEntry[] | undefined): { name: string | null; phone: string | null } => {
  if (!Array.isArray(fieldData)) {
    return { name: null, phone: null };
  }

  let resolvedName: string | null = null;
  let resolvedPhone: string | null = null;

  for (const entry of fieldData) {
    if (!entry?.name || !Array.isArray(entry.values) || entry.values.length === 0) {
      continue;
    }
    const rawValue = entry.values[0];
    const value = typeof rawValue === "string" ? rawValue : rawValue?.value;
    if (!value) {
      continue;
    }
    const normalisedName = entry.name.trim().toLowerCase();
    if (!resolvedName && (normalisedName.includes("name") || normalisedName === "full_name")) {
      resolvedName = value.trim();
    }
    if (!resolvedPhone && (normalisedName.includes("phone") || normalisedName === "phone_number")) {
      resolvedPhone = value.trim();
    }
  }

  return { name: resolvedName, phone: resolvedPhone };
};

export const fetchLeadsForForm = async (
  formId: string,
  env: TargetBotEnv,
): Promise<MetaLeadRecord[]> => {
  const token = (env.FB_LONG_TOKEN ?? env.FACEBOOK_TOKEN)?.trim();
  const apiVersion = env.FACEBOOK_API_VERSION ?? "v18.0";
  if (!token) {
    throw new MetaApiError("FB_LONG_TOKEN is not configured", 500, {
      error: "FB_LONG_TOKEN is not configured",
    });
  }
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(formId)}/leads`);
  url.searchParams.set("fields", "id,created_time,field_data");
  url.searchParams.set("access_token", token);

  const response = await fetch(url.toString());
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    payload = text;
  }

  if (!response.ok) {
    console.error("[leads] Meta API error", { formId, status: response.status, payload });
    throw new MetaApiError("Failed to fetch leads", response.status, payload);
  }

  const data = (payload as { data?: MetaLeadRecord[] } | undefined)?.data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data;
};

export const saveLead = async (env: TargetBotEnv, lead: StoredLead): Promise<boolean> => {
  const key = getLeadKey(lead.project_id, lead.lead_id);
  const existing = await env.LEADS_KV.get(key);
  if (existing) {
    return false;
  }
  await env.LEADS_KV.put(key, JSON.stringify(lead));
  return true;
};

export const listLeads = async (env: TargetBotEnv, projectId: string): Promise<StoredLead[]> => {
  const prefix = `LEAD:${projectId}:`;
  let cursor: string | undefined;
  const leads: StoredLead[] = [];

  do {
    const { keys, cursor: nextCursor } = await env.LEADS_KV.list({ prefix, cursor });
    for (const entry of keys ?? []) {
      const key = typeof (entry as { name?: string }).name === "string" ? (entry as { name: string }).name : undefined;
      if (!key) {
        continue;
      }
      const raw = await env.LEADS_KV.get(key);
      if (!raw) {
        continue;
      }
      try {
        const parsed = JSON.parse(raw) as StoredLead;
        leads.push(parsed);
      } catch (error) {
        console.error("[leads] Failed to parse stored lead", { key, error });
      }
    }
    cursor = nextCursor ?? undefined;
  } while (cursor);

  return leads.sort((a, b) => {
    const left = Date.parse(a.created_time);
    const right = Date.parse(b.created_time);
    return Number.isNaN(right - left) ? 0 : right - left;
  });
};

export const loadProjectFormIds = async (env: TargetBotEnv, projectId: string): Promise<string[]> => {
  const raw = await env.LEADS_KV.get(getFormIdsKey(projectId));
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((value) => (typeof value === "string" || typeof value === "number" ? String(value).trim() : ""))
      .filter((value) => value.length > 0);
  } catch (error) {
    console.error("[leads] Invalid FORM_IDS entry", { projectId, error });
    return [];
  }
};

export const syncProjectLeads = async (
  env: TargetBotEnv,
  projectId: string,
  formIds: string[],
): Promise<{ imported: number }> => {
  let imported = 0;
  for (const formId of formIds) {
    try {
      const leads = await fetchLeadsForForm(formId, env);
      for (const lead of leads) {
        const { name, phone } = parseFieldData(lead.field_data);
        const stored: StoredLead = {
          lead_id: lead.id,
          project_id: projectId,
          form_id: formId,
          name,
          phone,
          created_time: lead.created_time,
        };
        const saved = await saveLead(env, stored);
        if (saved) {
          imported += 1;
        }
      }
    } catch (error) {
      if (error instanceof MetaApiError) {
        throw error;
      }
      console.error("[leads] Failed to process form", { formId, error });
      throw error;
    }
  }
  return { imported };
};
