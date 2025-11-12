import {
  CommandLogRecord,
  LeadRecord,
  MetaTokenRecord,
  PaymentRecord,
  ProjectRecord,
  ReportFilters,
  ReportRecord,
  SettingRecord,
  UserRecord,
} from "../types";

const META_TOKEN_KEY = "meta:token";
const PROJECT_INDEX_KEY = "projects/index.json";
const LEAD_INDEX_PREFIX = "leads/";
const USER_INDEX_KEY = "users/index.json";
const PAYMENT_INDEX_KEY = "payments/index.json";
const REPORT_INDEX_KEY = "reports/index.json";
const SETTINGS_KEY = "settings/index.json";
const COMMAND_LOG_KEY = "logs/commands.json";
const REPORT_SESSION_PREFIX = "reports/session/";

export interface ReportSessionRecord {
  id: string;
  chatId: string;
  userId?: string;
  username?: string;
  type: "auto" | "summary" | "custom";
  command: "auto_report" | "summary" | "custom";
  projectIds: string[];
  projects: { id: string; name: string }[];
  filters?: ReportFilters;
  title?: string;
  format?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

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

export const deleteLeads = async (env: EnvBindings, projectId: string): Promise<void> => {
  await env.R2.delete(`${LEAD_INDEX_PREFIX}${projectId}.json`);
};

export const listUsers = async (env: EnvBindings): Promise<UserRecord[]> => {
  return readJsonFromR2<UserRecord[]>(env, USER_INDEX_KEY, []);
};

export const saveUsers = async (env: EnvBindings, users: UserRecord[]): Promise<void> => {
  await writeJsonToR2(env, USER_INDEX_KEY, users);
};

export const listPayments = async (env: EnvBindings): Promise<PaymentRecord[]> => {
  return readJsonFromR2<PaymentRecord[]>(env, PAYMENT_INDEX_KEY, []);
};

export const savePayments = async (
  env: EnvBindings,
  payments: PaymentRecord[],
): Promise<void> => {
  await writeJsonToR2(env, PAYMENT_INDEX_KEY, payments);
};

export const listReports = async (env: EnvBindings): Promise<ReportRecord[]> => {
  return readJsonFromR2<ReportRecord[]>(env, REPORT_INDEX_KEY, []);
};

export const saveReports = async (env: EnvBindings, reports: ReportRecord[]): Promise<void> => {
  await writeJsonToR2(env, REPORT_INDEX_KEY, reports);
};

export const listSettings = async (env: EnvBindings): Promise<SettingRecord[]> => {
  return readJsonFromR2<SettingRecord[]>(env, SETTINGS_KEY, []);
};

export const saveSettings = async (
  env: EnvBindings,
  settings: SettingRecord[],
): Promise<void> => {
  await writeJsonToR2(env, SETTINGS_KEY, settings);
};

export const appendCommandLog = async (
  env: EnvBindings,
  entry: CommandLogRecord,
  limit = 500,
): Promise<void> => {
  const existing = await readJsonFromR2<CommandLogRecord[]>(env, COMMAND_LOG_KEY, []);
  const next = [entry, ...existing].slice(0, limit);
  await writeJsonToR2(env, COMMAND_LOG_KEY, next);
};

export const listCommandLogs = async (env: EnvBindings): Promise<CommandLogRecord[]> => {
  return readJsonFromR2<CommandLogRecord[]>(env, COMMAND_LOG_KEY, []);
};

const parseSessionRecord = (value: string | null): ReportSessionRecord | null => {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as ReportSessionRecord;
    return parsed;
  } catch (error) {
    console.error("Failed to parse report session", error);
    return null;
  }
};

const sessionKey = (sessionId: string): string => `${REPORT_SESSION_PREFIX}${sessionId}`;

export const loadReportSession = async (
  env: EnvBindings,
  sessionId: string,
): Promise<ReportSessionRecord | null> => {
  const stored = await env.DB.get(sessionKey(sessionId));
  const record = parseSessionRecord(stored);
  if (!record) {
    return null;
  }
  if (record.expiresAt) {
    const expires = Date.parse(record.expiresAt);
    if (!Number.isNaN(expires) && expires < Date.now()) {
      await deleteReportSession(env, sessionId);
      return null;
    }
  }
  return record;
};

export const saveReportSession = async (
  env: EnvBindings,
  session: ReportSessionRecord,
): Promise<void> => {
  let ttl = 1800;
  if (session.expiresAt) {
    const expires = Date.parse(session.expiresAt);
    if (!Number.isNaN(expires)) {
      ttl = Math.max(60, Math.floor((expires - Date.now()) / 1000));
    }
  }
  await env.DB.put(sessionKey(session.id), JSON.stringify(session), {
    expirationTtl: ttl,
  });
};

export const deleteReportSession = async (env: EnvBindings, sessionId: string): Promise<void> => {
  await env.DB.delete(sessionKey(sessionId));
};
