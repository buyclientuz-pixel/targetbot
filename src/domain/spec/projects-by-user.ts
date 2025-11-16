import { KV_KEYS } from "../../config/kv";
import type { KvClient } from "../../infra/kv";
import { DataValidationError } from "../../errors";
import { assertStringArray } from "../validation";

export interface ProjectsByUserRecord {
  projects: string[];
}

export const parseProjectsByUserRecord = (raw: unknown): ProjectsByUserRecord => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("projects_by_user payload must be an object");
  }
  const record = raw as Record<string, unknown>;
  return {
    projects: assertStringArray(record.projects ?? record["projects"], "projects_by_user.projects"),
  };
};

export const serialiseProjectsByUserRecord = (
  record: ProjectsByUserRecord,
): Record<string, unknown> => ({
  projects: [...record.projects],
});

export const getProjectsByUser = async (
  kv: KvClient,
  userId: number | string,
): Promise<ProjectsByUserRecord | null> => {
  const raw = await kv.getJson<Record<string, unknown>>(KV_KEYS.projectsByUser(userId));
  return raw ? parseProjectsByUserRecord(raw) : null;
};

export const putProjectsByUser = async (
  kv: KvClient,
  userId: number | string,
  record: ProjectsByUserRecord,
): Promise<void> => {
  await kv.putJson(KV_KEYS.projectsByUser(userId), serialiseProjectsByUserRecord(record));
};
