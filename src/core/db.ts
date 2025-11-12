import type {
  Env,
  LeadRecord,
  MetaStatsSummary,
  MetaTokenRecord,
  PortalKeyRecord,
  ReportSummary,
  UserRecord,
  PortalKeyRole,
} from "./types";
import { uuid } from "./utils";

const PORTAL_KEY_PREFIX = "auth:key:";
const META_STATS_KEY = "meta:stats:last";

export async function getUser(env: Env, id: number) {
  const data = await env.KV_USERS.get(`user:${id}`);
  return data ? (JSON.parse(data) as UserRecord) : null;
}

export async function saveUser(env: Env, user: UserRecord) {
  await env.KV_USERS.put(`user:${user.id}`, JSON.stringify(user));
  return user;
}

export async function listUsers(env: Env) {
  const list = await env.KV_USERS.list({ prefix: "user:" });
  const users: UserRecord[] = [];
  for (const key of list.keys) {
    const data = await env.KV_USERS.get(key.name);
    if (data) users.push(JSON.parse(data) as UserRecord);
  }
  return users;
}

export async function deleteUser(env: Env, id: number | string) {
  await env.KV_USERS.delete(`user:${id}`);
}

export async function getLead(env: Env, id: string) {
  const data = await env.KV_LEADS.get(`lead:${id}`);
  return data ? (JSON.parse(data) as LeadRecord) : null;
}

export async function saveLead(env: Env, lead: LeadRecord) {
  await env.KV_LEADS.put(`lead:${lead.id}`, JSON.stringify(lead));
  return lead;
}

export async function createLead(env: Env, lead: Omit<LeadRecord, "id" | "createdAt" | "updatedAt">) {
  const record: LeadRecord = {
    id: uuid(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...lead,
  };
  await saveLead(env, record);
  return record;
}

export async function listLeads(env: Env) {
  const list = await env.KV_LEADS.list({ prefix: "lead:" });
  const leads: LeadRecord[] = [];
  for (const key of list.keys) {
    const data = await env.KV_LEADS.get(key.name);
    if (data) leads.push(JSON.parse(data) as LeadRecord);
  }
  leads.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
  return leads;
}

export async function updateLead(env: Env, id: string, patch: Partial<LeadRecord>) {
  const existing = await getLead(env, id);
  if (!existing) return null;
  const updated: LeadRecord = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await saveLead(env, updated);
  return updated;
}

export async function saveMetaToken(env: Env, token: MetaTokenRecord) {
  await env.KV_META.put("meta:token", JSON.stringify(token));
  return token;
}

export async function getMetaToken(env: Env) {
  const data = await env.KV_META.get("meta:token");
  return data ? (JSON.parse(data) as MetaTokenRecord) : null;
}

export async function saveMetaStatsSummary(env: Env, summary: MetaStatsSummary) {
  await env.KV_META.put(META_STATS_KEY, JSON.stringify(summary));
  return summary;
}

export async function getMetaStatsSummary(env: Env) {
  const data = await env.KV_META.get(META_STATS_KEY);
  return data ? (JSON.parse(data) as MetaStatsSummary) : null;
}

export async function listReports(env: Env) {
  const objects = await env.R2_REPORTS.list({ prefix: "reports/" });
  return objects.objects.map<ReportSummary>((object) => ({
    id: object.key.replace("reports/", ""),
    createdAt: object.uploaded?.toISOString() ?? new Date().toISOString(),
    filename: object.key,
    period: {
      from: object.customMetadata?.from ?? "",
      to: object.customMetadata?.to ?? "",
    },
    url: object.httpEtag,
  }));
}

export async function saveReport(env: Env, key: string, content: string, metadata?: Record<string, string>) {
  await env.R2_REPORTS.put(`reports/${key}`, content, {
    httpMetadata: {
      contentType: "text/csv",
    },
    customMetadata: metadata,
  });
}

export async function getReport(env: Env, key: string) {
  const object = await env.R2_REPORTS.get(`reports/${key}`);
  if (!object) return null;
  return object.text();
}

export async function listPortalKeys(env: Env) {
  const list = await env.KV_META.list({ prefix: PORTAL_KEY_PREFIX });
  const keys: PortalKeyRecord[] = [];
  for (const item of list.keys) {
    const value = await env.KV_META.get(item.name);
    if (!value) continue;
    const record = JSON.parse(value) as PortalKeyRecord;
    if (!record.key) {
      record.key = item.name.replace(PORTAL_KEY_PREFIX, "");
    }
    keys.push(record);
  }
  keys.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
  return keys;
}

export async function getPortalKey(env: Env, key: string) {
  const value = await env.KV_META.get(`${PORTAL_KEY_PREFIX}${key}`);
  if (!value) return null;
  const record = JSON.parse(value) as PortalKeyRecord;
  if (!record.key) record.key = key;
  return record;
}

export async function savePortalKey(env: Env, record: PortalKeyRecord) {
  await env.KV_META.put(`${PORTAL_KEY_PREFIX}${record.key}`, JSON.stringify(record));
  return record;
}

export async function createPortalKey(env: Env, options: { label?: string; role?: PortalKeyRole; owner?: string }) {
  const key = uuid().replace(/-/g, "");
  const record: PortalKeyRecord = {
    key,
    role: options.role ?? "partner",
    label: options.label,
    owner: options.owner,
    createdAt: new Date().toISOString(),
  };
  await savePortalKey(env, record);
  return record;
}

export async function deletePortalKey(env: Env, key: string) {
  await env.KV_META.delete(`${PORTAL_KEY_PREFIX}${key}`);
}
