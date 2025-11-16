import { KV_KEYS } from "../config/kv";
import type { KvClient } from "../infra/kv";
import { DataValidationError } from "../errors";
import { assertOptionalString, assertString, assertStringArray } from "./validation";

export interface PortalSyncState {
  projectId: string;
  periodKeys: string[];
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
}

const parsePortalSyncState = (raw: unknown): PortalSyncState => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("portalSyncState must be an object");
  }
  const record = raw as Record<string, unknown>;
  return {
    projectId: assertString(record.projectId, "portalSyncState.projectId"),
    periodKeys: assertStringArray(record.periodKeys ?? [], "portalSyncState.periodKeys"),
    lastRunAt: assertOptionalString(record.lastRunAt, "portalSyncState.lastRunAt"),
    lastSuccessAt: assertOptionalString(record.lastSuccessAt, "portalSyncState.lastSuccessAt"),
    lastErrorAt: assertOptionalString(record.lastErrorAt, "portalSyncState.lastErrorAt"),
    lastErrorMessage: assertOptionalString(record.lastErrorMessage, "portalSyncState.lastErrorMessage"),
  };
};

export const createPortalSyncState = (projectId: string): PortalSyncState => ({
  projectId,
  periodKeys: [],
  lastRunAt: null,
  lastSuccessAt: null,
  lastErrorAt: null,
  lastErrorMessage: null,
});

export const getPortalSyncState = async (kv: KvClient, projectId: string): Promise<PortalSyncState> => {
  const raw = await kv.getJson<Record<string, unknown>>(KV_KEYS.portalSyncState(projectId));
  if (!raw) {
    return createPortalSyncState(projectId);
  }
  return parsePortalSyncState(raw);
};

export const savePortalSyncState = async (kv: KvClient, state: PortalSyncState): Promise<void> => {
  await kv.putJson(KV_KEYS.portalSyncState(state.projectId), {
    projectId: state.projectId,
    periodKeys: state.periodKeys,
    lastRunAt: state.lastRunAt,
    lastSuccessAt: state.lastSuccessAt,
    lastErrorAt: state.lastErrorAt,
    lastErrorMessage: state.lastErrorMessage,
  });
};

export const deletePortalSyncState = async (kv: KvClient, projectId: string): Promise<void> => {
  await kv.delete(KV_KEYS.portalSyncState(projectId));
};
