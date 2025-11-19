import { KV_PREFIXES } from "../config/kv";
import type { KvClient } from "../infra/kv";
import type { R2Client } from "../infra/r2";
import { ensureProjectSettings, type ProjectSettings } from "../domain/project-settings";
import { getProject, type Project } from "../domain/projects";
import { requireProjectRecord, type ProjectRecord } from "../domain/spec/project";
import { getPortalSyncState, savePortalSyncState, type PortalSyncState } from "../domain/portal-sync";
import { loadProjectSummary, syncProjectCampaignDocument } from "./project-insights";
import { DataValidationError } from "../errors";
import { syncProjectLeadsFromMeta } from "./project-leads-sync";

export type PortalPeriodKey = "today" | "yesterday" | "week" | "month" | "all";

const normalisePortalPeriodKey = (key: PortalPeriodKey | "max"): PortalPeriodKey => (key === "max" ? "all" : key);

export const PORTAL_PERIOD_KEYS: PortalPeriodKey[] = ["today", "yesterday", "week", "month", "all"];
const DEFAULT_PERIOD_PLAN: PortalPeriodKey[] = [...PORTAL_PERIOD_KEYS.filter((key) => key !== "today"), "today"];
export const PORTAL_AUTO_PERIOD_PLAN: PortalPeriodKey[] = [...DEFAULT_PERIOD_PLAN];

export type PortalSyncTaskKey = PortalPeriodKey | "leads";

export interface PortalSyncPeriodResult {
  periodKey: PortalSyncTaskKey;
  ok: boolean;
  error?: string;
}

export interface PortalSyncResult {
  projectId: string;
  ok: boolean;
  periods: PortalSyncPeriodResult[];
}

interface SyncPortalMetricsOptions {
  periods?: PortalPeriodKey[];
  allowPartial?: boolean;
  updateState?: boolean;
  project?: Project;
  projectRecord?: ProjectRecord;
  settings?: ProjectSettings;
  facebookUserId?: string | null;
}

const ensurePeriodPlan = (periods?: (PortalPeriodKey | "max")[]): PortalPeriodKey[] => {
  if (!periods || periods.length === 0) {
    return [...DEFAULT_PERIOD_PLAN];
  }
  const normalised = periods.map((key) => normalisePortalPeriodKey(key));
  const unique = Array.from(new Set(normalised)) as PortalPeriodKey[];
  const todayIndex = unique.indexOf("today");
  if (todayIndex === -1) {
    unique.push("today");
  } else if (todayIndex !== unique.length - 1) {
    unique.splice(todayIndex, 1);
    unique.push("today");
  }
  return unique;
};

const requireFacebookUserId = (settings: ProjectSettings, provided?: string | null): string => {
  if (provided && provided.trim().length > 0) {
    return provided;
  }
  if (!settings.meta.facebookUserId) {
    throw new DataValidationError("Проекту не назначен Meta-аккаунт для портала");
  }
  return settings.meta.facebookUserId;
};

const updatePortalSyncState = async (
  kv: KvClient,
  projectId: string,
  periods: PortalPeriodKey[],
  result: { ok: boolean; hadErrors: boolean; errorMessage?: string },
): Promise<PortalSyncState> => {
  const state = await getPortalSyncState(kv, projectId);
  const nowIso = new Date().toISOString();
  const nextState: PortalSyncState = {
    ...state,
    periodKeys: periods,
    lastRunAt: nowIso,
    lastSuccessAt: result.ok ? nowIso : state.lastSuccessAt,
    lastErrorAt: result.hadErrors || !result.ok ? nowIso : state.lastErrorAt,
    lastErrorMessage: result.hadErrors || !result.ok ? result.errorMessage ?? state.lastErrorMessage : null,
  };
  await savePortalSyncState(kv, nextState);
  return nextState;
};

export const syncPortalMetrics = async (
  kv: KvClient,
  r2: R2Client,
  projectId: string,
  options: SyncPortalMetricsOptions = {},
): Promise<PortalSyncResult> => {
  const periods = ensurePeriodPlan(options.periods);
  const projectRecord = options.projectRecord ?? (await requireProjectRecord(kv, projectId));
  if (!projectRecord.portalUrl) {
    throw new DataValidationError("Портал ещё не создан для этого проекта");
  }
  const settings = options.settings ?? (await ensureProjectSettings(kv, projectId));
  const project = options.project ?? (await getProject(kv, projectId));
  if (!project.adsAccountId) {
    throw new DataValidationError("У проекта нет привязанного рекламного аккаунта Meta");
  }
  const facebookUserId = requireFacebookUserId(settings, options.facebookUserId);
  const periodResults: PortalSyncPeriodResult[] = [];
  let firstError: Error | null = null;
  const allowPartial = options.allowPartial === true;

  const recordResult = (
    periodKey: PortalSyncTaskKey,
    outcome: { ok: true } | { ok: false; error: Error },
  ): void => {
    if (outcome.ok) {
      periodResults.push({ periodKey, ok: true });
    } else {
      const error = (outcome as { ok: false; error: Error }).error;
      periodResults.push({ periodKey, ok: false, error: error.message });
      if (!firstError) {
        firstError = error;
      }
    }
  };

  for (const periodKey of periods) {
    try {
      await loadProjectSummary(kv, projectId, periodKey, { project, settings, facebookUserId });
      await syncProjectCampaignDocument(kv, r2, projectId, periodKey, {
        project,
        settings,
        projectRecord,
        facebookUserId,
      });
      recordResult(periodKey, { ok: true });
    } catch (error) {
      recordResult(periodKey, { ok: false, error: error as Error });
      if (!allowPartial) {
        break;
      }
    }
  }

  try {
    await syncProjectLeadsFromMeta(kv, r2, projectId, { project, settings, facebookUserId, projectRecord });
    recordResult("leads", { ok: true });
  } catch (error) {
    recordResult("leads", { ok: false, error: error as Error });
  }

  const ok = periodResults.some((entry) => entry.ok);
  const hadErrors = periodResults.some((entry) => !entry.ok);
  if (options.updateState !== false) {
    await updatePortalSyncState(kv, projectId, periods, { ok, hadErrors, errorMessage: firstError?.message });
  }
  const shouldThrow = (!allowPartial && hadErrors) || (!ok && firstError);
  if (shouldThrow) {
    if (firstError) {
      throw firstError;
    }
    throw new Error("Portal sync failed");
  }
  return { projectId, ok, periods: periodResults };
};

const stripPrefix = (key: string, prefix: string): string =>
  key.startsWith(prefix) ? key.slice(prefix.length) : key;

const listProjectIds = async (kv: KvClient): Promise<string[]> => {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const { keys, cursor: nextCursor } = await kv.list(KV_PREFIXES.projects, { cursor });
    ids.push(...keys.map((key) => stripPrefix(key, KV_PREFIXES.projects)));
    cursor = nextCursor;
  } while (cursor);
  return ids;
};

export const runPortalSync = async (
  kv: KvClient,
  r2: R2Client,
  periods: PortalPeriodKey[] = PORTAL_AUTO_PERIOD_PLAN,
): Promise<PortalSyncResult[]> => {
  const projectIds = await listProjectIds(kv);
  const results: PortalSyncResult[] = [];
  for (const projectId of projectIds) {
    let projectRecord: ProjectRecord;
    try {
      projectRecord = await requireProjectRecord(kv, projectId);
    } catch {
      continue;
    }
    if (!projectRecord.portalUrl) {
      continue;
    }
    let settings: ProjectSettings;
    try {
      settings = await ensureProjectSettings(kv, projectId);
    } catch {
      continue;
    }
    if (!settings.portalEnabled) {
      continue;
    }
    try {
      const result = await syncPortalMetrics(kv, r2, projectId, {
        periods,
        allowPartial: true,
        projectRecord,
        settings,
      });
      results.push(result);
    } catch (error) {
      console.warn(`[portal-sync] Failed to sync ${projectId}: ${(error as Error).message}`);
    }
  }
  return results;
};
