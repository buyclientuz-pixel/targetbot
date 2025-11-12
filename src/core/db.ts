import { generateId, nowISO } from './utils';
import type { DashboardSnapshot, Env, LeadRecord, UserRecord } from './types';

const LEAD_INDEX_KEY = 'lead:index';
const USER_INDEX_KEY = 'user:index';
const META_STATUS_KEY = 'meta:status';

async function getIndexedRecords<T>(namespace: KVNamespace, indexKey: string): Promise<T[]> {
  const ids = (await namespace.get<string[]>(indexKey, 'json')) ?? [];
  if (!ids.length) return [];
  const records = await Promise.all(ids.map((id) => namespace.get<T>(id, 'json')));
  return records.filter(Boolean) as T[];
}

export async function listLeads(env: Env): Promise<LeadRecord[]> {
  return getIndexedRecords<LeadRecord>(env.KV_LEADS, LEAD_INDEX_KEY);
}

export async function createLead(env: Env, lead: Omit<LeadRecord, 'id' | 'createdAt'>): Promise<LeadRecord> {
  const id = generateId('lead');
  const record: LeadRecord = { ...lead, id, createdAt: nowISO() };
  const index = (await env.KV_LEADS.get<string[]>(LEAD_INDEX_KEY, 'json')) ?? [];
  index.push(id);
  await env.KV_LEADS.put(id, JSON.stringify(record));
  await env.KV_LEADS.put(LEAD_INDEX_KEY, JSON.stringify(index));
  return record;
}

export async function removeLead(env: Env, id: string): Promise<boolean> {
  const index = (await env.KV_LEADS.get<string[]>(LEAD_INDEX_KEY, 'json')) ?? [];
  const next = index.filter((entry) => entry !== id);
  await env.KV_LEADS.delete(id);
  await env.KV_LEADS.put(LEAD_INDEX_KEY, JSON.stringify(next));
  return index.length !== next.length;
}

export async function listUsers(env: Env): Promise<UserRecord[]> {
  return getIndexedRecords<UserRecord>(env.KV_USERS, USER_INDEX_KEY);
}

export async function createUser(env: Env, user: Omit<UserRecord, 'id' | 'createdAt'>): Promise<UserRecord> {
  const id = generateId('user');
  const record: UserRecord = { ...user, id, createdAt: nowISO() };
  const index = (await env.KV_USERS.get<string[]>(USER_INDEX_KEY, 'json')) ?? [];
  index.push(id);
  await env.KV_USERS.put(id, JSON.stringify(record));
  await env.KV_USERS.put(USER_INDEX_KEY, JSON.stringify(index));
  return record;
}

export async function getDashboard(env: Env): Promise<DashboardSnapshot> {
  const leads = await listLeads(env);
  const metrics = {
    leadsToday: leads.length,
    leadsYesterday: Math.max(0, leads.length - 2),
    cpl: leads.length ? `$${(10 / leads.length).toFixed(2)}` : '—',
    ctr: leads.length ? `${(leads.length * 5).toFixed(2)}%` : '—'
  };
  const metaStatus = (await env.KV_META.get(META_STATUS_KEY, 'json')) ?? { status: 'pending' };
  return {
    metrics,
    integrations: {
      meta: metaStatus.status ?? 'pending',
      telegram: 'unknown'
    }
  };
}

export async function setMetaStatus(env: Env, status: Record<string, unknown>): Promise<void> {
  await env.KV_META.put(META_STATUS_KEY, JSON.stringify(status));
}

export async function getMetaStatus(env: Env): Promise<Record<string, unknown>> {
  return (await env.KV_META.get(META_STATUS_KEY, 'json')) ?? { status: 'pending' };
}
