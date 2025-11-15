import { KV_KEYS } from "../config/kv";
import type { KvClient } from "../infra/kv";

export interface AlertState {
  projectId: string;
  type: string;
  lastSentAt: string | null;
  lastEventKey: string | null;
  updatedAt: string;
}

const normaliseAlertState = (projectId: string, type: string, raw: unknown): AlertState => {
  if (!raw || typeof raw !== "object") {
    return createDefaultAlertState(projectId, type);
  }
  const record = raw as Record<string, unknown>;
  return {
    projectId,
    type,
    lastSentAt: typeof record.lastSentAt === "string" ? record.lastSentAt : null,
    lastEventKey: typeof record.lastEventKey === "string" ? record.lastEventKey : null,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
  };
};

export const createDefaultAlertState = (projectId: string, type: string): AlertState => ({
  projectId,
  type,
  lastSentAt: null,
  lastEventKey: null,
  updatedAt: new Date().toISOString(),
});

export const getAlertState = async (
  kv: KvClient,
  projectId: string,
  type: string,
): Promise<AlertState> => {
  const key = KV_KEYS.alertState(projectId, type);
  const raw = await kv.getJson<Record<string, unknown>>(key);
  if (!raw) {
    return createDefaultAlertState(projectId, type);
  }
  return normaliseAlertState(projectId, type, raw);
};

export const saveAlertState = async (kv: KvClient, state: AlertState): Promise<void> => {
  const key = KV_KEYS.alertState(state.projectId, state.type);
  await kv.putJson(key, state);
};

export const shouldSendAlert = (
  state: AlertState,
  eventKey: string,
  windowMs: number,
  now: Date,
): boolean => {
  if (state.lastEventKey !== eventKey) {
    return true;
  }
  if (!state.lastSentAt) {
    return true;
  }
  const lastSent = new Date(state.lastSentAt);
  if (Number.isNaN(lastSent.getTime())) {
    return true;
  }
  return now.getTime() - lastSent.getTime() > windowMs;
};

export const markAlertSent = async (
  kv: KvClient,
  projectId: string,
  type: string,
  eventKey: string,
  timestamp: string,
): Promise<void> => {
  const state = await getAlertState(kv, projectId, type);
  state.lastSentAt = timestamp;
  state.lastEventKey = eventKey;
  state.updatedAt = timestamp;
  await saveAlertState(kv, state);
};
