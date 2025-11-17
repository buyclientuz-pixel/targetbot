import { KV_KEYS } from "../config/kv";
import type { KvClient } from "../infra/kv";
import { DataValidationError } from "../errors";
import { assertIsoDate, assertOptionalString, assertString } from "./validation";

export interface ProjectLeadSyncState {
  projectId: string;
  lastLeadCreatedAt: string | null;
  lastSyncAt: string | null;
}

const serialiseState = (state: ProjectLeadSyncState): Record<string, unknown> => ({
  projectId: state.projectId,
  lastLeadCreatedAt: state.lastLeadCreatedAt,
  lastSyncAt: state.lastSyncAt,
});

const parseState = (raw: unknown, projectId: string): ProjectLeadSyncState => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("projectLeadSync state must be an object");
  }
  const record = raw as Record<string, unknown>;
  return {
    projectId: assertString(record.projectId ?? projectId, "projectLeadSync.projectId"),
    lastLeadCreatedAt: assertOptionalString(
      record.lastLeadCreatedAt ?? record["last_lead_created_at"],
      "projectLeadSync.lastLeadCreatedAt",
    ),
    lastSyncAt: assertOptionalString(record.lastSyncAt ?? record["last_sync_at"], "projectLeadSync.lastSyncAt"),
  };
};

export const getProjectLeadSyncState = async (
  kv: KvClient,
  projectId: string,
): Promise<ProjectLeadSyncState | null> => {
  const key = KV_KEYS.projectLeadSyncState(projectId);
  const raw = await kv.getJson<Record<string, unknown>>(key);
  if (!raw) {
    return null;
  }
  const state = parseState(raw, projectId);
  if (state.lastLeadCreatedAt) {
    assertIsoDate(state.lastLeadCreatedAt, "projectLeadSync.lastLeadCreatedAt");
  }
  if (state.lastSyncAt) {
    assertIsoDate(state.lastSyncAt, "projectLeadSync.lastSyncAt");
  }
  return state;
};

export const saveProjectLeadSyncState = async (
  kv: KvClient,
  state: ProjectLeadSyncState,
): Promise<void> => {
  const key = KV_KEYS.projectLeadSyncState(state.projectId);
  await kv.putJson(key, serialiseState(state));
};
