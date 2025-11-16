import { KV_PREFIXES } from "../config/kv";
import { listProjects } from "../domain/projects";
import { deleteLead, parseStoredLead } from "../domain/leads";
import { getLeadRetentionDays, getMetaCacheRetentionDays } from "../domain/config";
import { parseMetaCacheEntry } from "../domain/meta-cache";
import { getProjectLeadsList, putProjectLeadsList } from "../domain/spec/project-leads";
import type { KvClient } from "../infra/kv";
import type { R2Client } from "../infra/r2";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const safeTimestamp = (value: string): number => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const cleanupLeadObjects = async (
  r2: R2Client,
  projectId: string,
  prefix: string,
  olderThanMs: number,
): Promise<number> => {
  let cursor: string | undefined;
  let removed = 0;
  do {
    const { objects, cursor: nextCursor } = await r2.list(prefix, { cursor, limit: 1000 });
    for (const object of objects) {
      if (object.key.endsWith("/list.json")) {
        continue;
      }
      const payload = await r2.getJson<unknown>(object.key);
      if (!payload) {
        await r2.delete(object.key);
        removed += 1;
        continue;
      }
      let createdAtMs = 0;
      try {
        const lead = parseStoredLead(payload, projectId);
        createdAtMs = safeTimestamp(lead.createdAt);
        if (createdAtMs === 0 || createdAtMs >= olderThanMs) {
          continue;
        }
        await deleteLead(r2, projectId, lead.id);
        removed += 1;
      } catch {
        await r2.delete(object.key);
        removed += 1;
      }
    }
    cursor = nextCursor;
  } while (cursor);
  return removed;
};

const cleanupLeadSummaries = async (
  r2: R2Client,
  projectId: string,
  olderThanMs: number,
  now: Date,
): Promise<number> => {
  const record = await getProjectLeadsList(r2, projectId);
  if (!record) {
    return 0;
  }
  const filtered = record.leads.filter((lead) => safeTimestamp(lead.createdAt) >= olderThanMs);
  const removed = record.leads.length - filtered.length;
  if (removed === 0) {
    return 0;
  }
  const todayKey = now.toISOString().slice(0, 10);
  const todayCount = filtered.filter((lead) => lead.createdAt.slice(0, 10) === todayKey).length;
  await putProjectLeadsList(r2, projectId, {
    stats: { total: filtered.length, today: todayCount },
    leads: filtered,
    syncedAt: record.syncedAt ?? null,
  });
  return removed;
};

const cleanupProjectLeads = async (
  r2: R2Client,
  projectId: string,
  olderThanMs: number,
  now: Date,
): Promise<number> => {
  const primaryPrefix = `project-leads/${projectId}/`;
  const legacyPrefix = `leads/${projectId}/`;
  const removedPrimary = await cleanupLeadObjects(r2, projectId, primaryPrefix, olderThanMs);
  const removedLegacy = await cleanupLeadObjects(r2, projectId, legacyPrefix, olderThanMs);
  const removedSummaries = await cleanupLeadSummaries(r2, projectId, olderThanMs, now);
  return removedPrimary + removedLegacy + removedSummaries;
};

const cleanupMetaCache = async (
  kv: KvClient,
  olderThanMs: number,
): Promise<number> => {
  let cursor: string | undefined;
  let removed = 0;

  do {
    const { keys, cursor: nextCursor } = await kv.list(KV_PREFIXES.metaCache, { cursor, limit: 1000 });
    for (const key of keys) {
      const payload = await kv.getJson<Record<string, unknown>>(key);
      if (!payload) {
        continue;
      }
      try {
        const entry = parseMetaCacheEntry(payload);
        if (safeTimestamp(entry.fetchedAt) >= olderThanMs) {
          continue;
        }
        await kv.delete(key);
        removed += 1;
      } catch {
        await kv.delete(key);
        removed += 1;
      }
    }
    cursor = nextCursor;
  } while (cursor);

  return removed;
};

export interface MaintenanceSummary {
  leadRetentionDays: number;
  metaCacheRetentionDays: number;
  deletedLeadCount: number;
  deletedCacheCount: number;
  scannedProjects: number;
}

export const runMaintenance = async (
  kv: KvClient,
  r2: R2Client,
  now = new Date(),
): Promise<MaintenanceSummary> => {
  const [leadRetentionDays, metaCacheRetentionDays] = await Promise.all([
    getLeadRetentionDays(kv),
    getMetaCacheRetentionDays(kv),
  ]);

  const leadThreshold = now.getTime() - leadRetentionDays * DAY_IN_MS;
  const cacheThreshold = now.getTime() - metaCacheRetentionDays * DAY_IN_MS;

  const projects = await listProjects(kv);
  let deletedLeadCount = 0;

  for (const project of projects) {
    deletedLeadCount += await cleanupProjectLeads(r2, project.id, leadThreshold, now);
  }

  const deletedCacheCount = await cleanupMetaCache(kv, cacheThreshold);

  return {
    leadRetentionDays,
    metaCacheRetentionDays,
    deletedLeadCount,
    deletedCacheCount,
    scannedProjects: projects.length,
  };
};
