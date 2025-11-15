import { KV_KEYS } from "../config/kv";
import type { KvClient } from "../infra/kv";

export interface ReportScheduleState {
  projectId: string;
  lastRunAt: string | null;
  slots: Record<string, string | null>;
  updatedAt: string;
}

const normaliseState = (projectId: string, raw: unknown): ReportScheduleState => {
  if (!raw || typeof raw !== "object") {
    return createDefaultState(projectId);
  }
  const record = raw as Record<string, unknown>;
  const slots = record.slots && typeof record.slots === "object" ? record.slots : {};
  const normalisedSlots: Record<string, string | null> = {};
  for (const [slot, value] of Object.entries(slots as Record<string, unknown>)) {
    if (typeof value === "string") {
      normalisedSlots[slot] = value;
    } else {
      normalisedSlots[slot] = null;
    }
  }

  return {
    projectId,
    lastRunAt: typeof record.lastRunAt === "string" ? record.lastRunAt : null,
    slots: normalisedSlots,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
  };
};

export const createDefaultState = (projectId: string): ReportScheduleState => ({
  projectId,
  lastRunAt: null,
  slots: {},
  updatedAt: new Date().toISOString(),
});

export const getReportScheduleState = async (
  kv: KvClient,
  projectId: string,
): Promise<ReportScheduleState> => {
  const key = KV_KEYS.reportState(projectId);
  const raw = await kv.getJson<Record<string, unknown>>(key);
  if (!raw) {
    return createDefaultState(projectId);
  }
  return normaliseState(projectId, raw);
};

export const saveReportScheduleState = async (
  kv: KvClient,
  state: ReportScheduleState,
): Promise<void> => {
  const key = KV_KEYS.reportState(state.projectId);
  await kv.putJson(key, state);
};

export const markReportSlotDispatched = async (
  kv: KvClient,
  projectId: string,
  slot: string,
  timestamp: string,
): Promise<void> => {
  const state = await getReportScheduleState(kv, projectId);
  state.lastRunAt = timestamp;
  state.updatedAt = timestamp;
  state.slots[slot] = timestamp;
  await saveReportScheduleState(kv, state);
};
