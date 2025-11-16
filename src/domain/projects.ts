import { KV_KEYS, KV_PREFIXES } from "../config/kv";
import type { KvClient } from "../infra/kv";
import { DataValidationError, EntityNotFoundError } from "../errors";
import {
  assertIsoDate,
  assertNumber,
  assertOptionalString,
  assertString,
} from "./validation";
import { parseProjectRecord } from "./spec/project";

export interface Project {
  id: string;
  name: string;
  adsAccountId: string | null;
  ownerTelegramId: number;
  createdAt: string;
  updatedAt: string;
}

export const parseProject = (raw: unknown): Project => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("Project payload must be an object");
  }

  const record = raw as Record<string, unknown>;
  try {
    return {
      id: assertString(record.id, "project.id"),
      name: assertString(record.name, "project.name"),
      adsAccountId: assertOptionalString(record.adsAccountId, "project.adsAccountId"),
      ownerTelegramId: assertNumber(record.ownerTelegramId, "project.ownerTelegramId"),
      createdAt: assertIsoDate(record.createdAt, "project.createdAt"),
      updatedAt: assertIsoDate(record.updatedAt, "project.updatedAt"),
    };
  } catch (error) {
    if (!(error instanceof DataValidationError)) {
      throw error;
    }
    const legacy = parseProjectRecord(record);
    const now = new Date().toISOString();
    return {
      id: legacy.id,
      name: legacy.name,
      adsAccountId: legacy.adAccountId ?? null,
      ownerTelegramId: legacy.ownerId,
      createdAt: now,
      updatedAt: now,
    };
  }
};

export const serialiseProject = (project: Project): Record<string, unknown> => ({
  id: project.id,
  name: project.name,
  adsAccountId: project.adsAccountId,
  ownerTelegramId: project.ownerTelegramId,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});

export const getProject = async (kv: KvClient, projectId: string): Promise<Project> => {
  const key = KV_KEYS.project(projectId);
  const raw = await kv.getJson<Record<string, unknown>>(key);
  if (!raw) {
    throw new EntityNotFoundError("project", projectId);
  }
  return parseProject(raw);
};

export const putProject = async (kv: KvClient, project: Project): Promise<void> => {
  const key = KV_KEYS.project(project.id);
  await kv.putJson(key, serialiseProject(project));
};

export const createProject = (input: Omit<Project, "createdAt" | "updatedAt">): Project => {
  const now = new Date().toISOString();
  const project: Project = {
    ...input,
    adsAccountId: input.adsAccountId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  return parseProject(project);
};

export const touchProjectUpdatedAt = async (kv: KvClient, projectId: string): Promise<Project> => {
  const project = await getProject(kv, projectId);
  const updated: Project = { ...project, updatedAt: new Date().toISOString() };
  await putProject(kv, updated);
  return updated;
};

export const deleteProject = async (kv: KvClient, projectId: string): Promise<void> => {
  await kv.delete(KV_KEYS.project(projectId));
};

export const listProjects = async (kv: KvClient): Promise<Project[]> => {
  const { keys } = await kv.list(KV_PREFIXES.projects);
  if (keys.length === 0) {
    return [];
  }
  const projects = await Promise.all(
    keys.map(async (key) => {
      const record = await kv.getJson<Record<string, unknown>>(key);
      if (!record) {
        return null;
      }
      try {
        return parseProject(record);
      } catch {
        return null;
      }
    }),
  );
  return projects.filter((project): project is Project => project !== null);
};
