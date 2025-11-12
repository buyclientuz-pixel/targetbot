import { LeadRecord, MetaTokenRecord, ProjectRecord, UserRecord } from "../types";

const META_TOKEN_KEY = "meta:token";
const PROJECT_INDEX_KEY = "projects/index.json";
const LEAD_INDEX_PREFIX = "leads/";
const USER_INDEX_KEY = "users/index.json";

export interface EnvBindings {
  DB: KVNamespace;
  R2: R2Bucket;
}

const readJsonFromR2 = async <T>(env: EnvBindings, key: string, fallback: T): Promise<T> => {
  const object = await env.R2.get(key);
  if (!object) {
    return fallback;
  }
  const text = await object.text();
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("Failed to parse R2 object", key, error);
    return fallback;
  }
};

const writeJsonToR2 = async <T>(env: EnvBindings, key: string, value: T): Promise<void> => {
  await env.R2.put(key, JSON.stringify(value, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });
};

export const loadMetaToken = async (env: EnvBindings): Promise<MetaTokenRecord | null> => {
  const stored = await env.DB.get(META_TOKEN_KEY);
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored) as MetaTokenRecord;
  } catch (error) {
    console.error("Failed to parse meta token", error);
    return null;
  }
};

export const saveMetaToken = async (env: EnvBindings, record: MetaTokenRecord): Promise<void> => {
  await env.DB.put(META_TOKEN_KEY, JSON.stringify(record));
};

export const deleteMetaToken = async (env: EnvBindings): Promise<void> => {
  await env.DB.delete(META_TOKEN_KEY);
};

export const listProjects = async (env: EnvBindings): Promise<ProjectRecord[]> => {
  return readJsonFromR2<ProjectRecord[]>(env, PROJECT_INDEX_KEY, []);
};

export const saveProjects = async (env: EnvBindings, projects: ProjectRecord[]): Promise<void> => {
  await writeJsonToR2(env, PROJECT_INDEX_KEY, projects);
};

export const loadProject = async (env: EnvBindings, projectId: string): Promise<ProjectRecord | null> => {
  const projects = await listProjects(env);
  return projects.find((project) => project.id === projectId) || null;
};

export const listLeads = async (env: EnvBindings, projectId: string): Promise<LeadRecord[]> => {
  return readJsonFromR2<LeadRecord[]>(env, `${LEAD_INDEX_PREFIX}${projectId}.json`, []);
};

export const saveLeads = async (
  env: EnvBindings,
  projectId: string,
  leads: LeadRecord[],
): Promise<void> => {
  await writeJsonToR2(env, `${LEAD_INDEX_PREFIX}${projectId}.json`, leads);
};

export const listUsers = async (env: EnvBindings): Promise<UserRecord[]> => {
  return readJsonFromR2<UserRecord[]>(env, USER_INDEX_KEY, []);
};

export const saveUsers = async (env: EnvBindings, users: UserRecord[]): Promise<void> => {
  await writeJsonToR2(env, USER_INDEX_KEY, users);
};
