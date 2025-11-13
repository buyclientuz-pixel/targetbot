import {
  ChatRegistrationRecord,
  CommandLogRecord,
  LeadRecord,
  MetaAccountLinkRecord,
  MetaProjectLinkRecord,
  MetaTokenRecord,
  MetaTokenStatus,
  PaymentRecord,
  ProjectBillingState,
  ProjectRecord,
  ReportFilters,
  ReportRecord,
  SettingRecord,
  TelegramGroupLinkRecord,
  UserRecord,
} from "../types";
import { createId } from "./ids";

const META_TOKEN_KEY = "meta:token";
const PROJECT_INDEX_KEY = "projects/index.json";
const LEAD_INDEX_PREFIX = "leads/";
const USER_INDEX_KEY = "users/index.json";
const PAYMENT_INDEX_KEY = "payments/index.json";
const REPORT_INDEX_KEY = "reports/index.json";
const SETTINGS_KEY = "settings/index.json";
const COMMAND_LOG_KEY = "logs/commands.json";
const REPORT_SESSION_PREFIX = "reports/session/";
const CHAT_REGISTRY_KEY = "chats/index.json";
const META_ACCOUNTS_KEY = "meta/accounts.json";
const TELEGRAM_GROUPS_KEY = "telegram/groups.json";
const META_PROJECTS_KEY = "meta/projects.json";
const META_PENDING_PREFIX = "meta/link/pending/";

const USER_KV_INDEX_KEY = "users:index";
const PROJECT_KV_INDEX_KEY = "projects:index";
const META_KV_INDEX_KEY = "meta:index";
const LEAD_KV_INDEX_PREFIX = "leads:index:";

const USER_KV_PREFIX = "users:";
const PROJECT_KV_PREFIX = "project:";
const META_KV_PREFIX = "meta:";
const LEAD_KV_PREFIX = "leads:";

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

const readKvIndex = async (env: EnvBindings, key: string): Promise<string[]> => {
  const stored = await env.DB.get(key);
  if (!stored) {
    return [];
  }
  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === "string" && value.length > 0);
    }
  } catch (error) {
    console.warn("Failed to parse KV index", key, error);
  }
  return [];
};

const writeKvIndex = async (env: EnvBindings, key: string, values: string[]): Promise<void> => {
  await env.DB.put(key, JSON.stringify(values));
};

interface KvSyncOptions<T> {
  env: EnvBindings;
  indexKey: string;
  prefix: string;
  items: T[];
  getId: (item: T) => string;
  serialize: (item: T) => Record<string, unknown>;
}

const syncKvRecords = async <T>({
  env,
  indexKey,
  prefix,
  items,
  getId,
  serialize,
}: KvSyncOptions<T>): Promise<void> => {
  const previous = await readKvIndex(env, indexKey);
  const currentIds = items.map(getId).filter((id) => id);
  const currentSet = new Set(currentIds);

  const toDelete = previous.filter((id) => !currentSet.has(id));
  await Promise.all(toDelete.map((id) => env.DB.delete(`${prefix}${id}`)));

  await Promise.all(
    items.map((item) => {
      const id = getId(item);
      if (!id) {
        return Promise.resolve();
      }
      return env.DB.put(`${prefix}${id}`, JSON.stringify(serialize(item)));
    }),
  );

  const sorted = Array.from(currentSet).sort((a, b) => a.localeCompare(b, "en"));
  await writeKvIndex(env, indexKey, sorted);
};

const syncLeadKvRecords = async (
  env: EnvBindings,
  projectId: string,
  leads: LeadRecord[],
): Promise<void> => {
  const indexKey = `${LEAD_KV_INDEX_PREFIX}${projectId}`;
  const previous = await readKvIndex(env, indexKey);
  const currentIds = leads.map((lead) => lead.id);
  const currentSet = new Set(currentIds);

  const toDelete = previous.filter((id) => !currentSet.has(id));
  await Promise.all(toDelete.map((id) => env.DB.delete(`${LEAD_KV_PREFIX}${projectId}:${id}`)));

  await Promise.all(
    leads.map((lead) =>
      env.DB.put(
        `${LEAD_KV_PREFIX}${projectId}:${lead.id}`,
        JSON.stringify({
          id: lead.id,
          project_id: lead.projectId,
          name: lead.name,
          phone: lead.phone ?? null,
          source: lead.source,
          created_at: lead.createdAt,
          status: lead.status === "done" ? "processed" : "new",
        }),
      ),
    ),
  );

  const sorted = Array.from(currentSet).sort((a, b) => a.localeCompare(b, "en"));
  await writeKvIndex(env, indexKey, sorted);
};

const normalizeProjectRecord = (input: ProjectRecord | Record<string, unknown>): ProjectRecord => {
  const data = input as Record<string, unknown>;
  const now = new Date().toISOString();
  const idSource = data.id ?? data.projectId ?? data.project_id;
  const id = typeof idSource === "string" && idSource.trim() ? idSource.trim() : `p_${createId(10)}`;
  const nameSource = data.name ?? data.projectName ?? data.project_name ?? id;
  const name = typeof nameSource === "string" && nameSource.trim() ? nameSource.trim() : id;

  const metaAccountCandidate =
    data.metaAccountId ?? data.accountId ?? data.adAccountId ?? data.meta_account_id ?? data.account_id ?? data.ad_account_id;
  const metaAccountId =
    typeof metaAccountCandidate === "string" && metaAccountCandidate.trim()
      ? metaAccountCandidate.trim()
      : metaAccountCandidate !== undefined
        ? String(metaAccountCandidate)
        : "";
  const metaAccountNameCandidate = data.metaAccountName ?? data.accountName ?? data.meta_account_name ?? name;
  const metaAccountName =
    typeof metaAccountNameCandidate === "string" && metaAccountNameCandidate.trim()
      ? metaAccountNameCandidate.trim()
      : name;

  const chatCandidate = data.chatId ?? data.chat_id ?? data.telegramChatId ?? data.chatID;
  const chatId =
    typeof chatCandidate === "string" && chatCandidate.trim()
      ? chatCandidate.trim()
      : typeof chatCandidate === "number"
        ? chatCandidate.toString()
        : "";

  const billingCandidate = (data.billingStatus ?? data.billing_status) as string | undefined;
  const allowedBilling: ProjectBillingState[] = ["active", "overdue", "blocked", "pending"];
  const billingStatus = allowedBilling.includes(billingCandidate as ProjectBillingState)
    ? (billingCandidate as ProjectBillingState)
    : "pending";

  const nextPaymentCandidate = data.nextPaymentDate ?? data.next_payment_date;
  const nextPaymentDate =
    typeof nextPaymentCandidate === "string" && nextPaymentCandidate.trim() ? nextPaymentCandidate : null;

  const tariffCandidate = data.tariff;
  const tariff =
    typeof tariffCandidate === "number" && Number.isFinite(tariffCandidate)
      ? tariffCandidate
      : typeof tariffCandidate === "string" && tariffCandidate.trim() && !Number.isNaN(Number(tariffCandidate))
        ? Number(tariffCandidate)
        : 0;

  const createdCandidate = data.createdAt ?? data.created_at;
  const createdAt =
    typeof createdCandidate === "string" && createdCandidate.trim() ? createdCandidate : now;
  const updatedCandidate = data.updatedAt ?? data.updated_at;
  const updatedAt =
    typeof updatedCandidate === "string" && updatedCandidate.trim() ? updatedCandidate : createdAt;

  const settingsValue = data.settings;
  const settings =
    settingsValue && typeof settingsValue === "object" && !Array.isArray(settingsValue)
      ? (settingsValue as ProjectRecord["settings"])
      : ({} as ProjectRecord["settings"]);

  const userId = typeof data.userId === "string" ? data.userId : undefined;
  const telegramChatId = typeof data.telegramChatId === "string" ? data.telegramChatId : chatId || undefined;
  const telegramThreadId = typeof data.telegramThreadId === "number" ? data.telegramThreadId : undefined;
  const telegramLink = typeof data.telegramLink === "string" ? data.telegramLink : undefined;
  const adAccountId = typeof data.adAccountId === "string" ? data.adAccountId : metaAccountId;

  return {
    id,
    name,
    metaAccountId,
    metaAccountName,
    chatId,
    billingStatus,
    nextPaymentDate,
    tariff,
    createdAt,
    updatedAt,
    settings,
    userId,
    telegramChatId,
    telegramThreadId,
    telegramLink,
    adAccountId,
  };
};

const normalizeUserRecord = (input: UserRecord | Record<string, unknown>): UserRecord => {
  const data = input as Record<string, unknown>;
  const idCandidate = data.id;
  const id = typeof idCandidate === "string" && idCandidate.trim() ? idCandidate.trim() : createId();
  const name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : undefined;
  const username = typeof data.username === "string" && data.username.trim() ? data.username.trim() : undefined;
  const roleCandidate = data.role;
  const validRoles: UserRecord["role"][] = ["owner", "manager", "client"];
  const role = validRoles.includes(roleCandidate as UserRecord["role"])
    ? (roleCandidate as UserRecord["role"])
    : "client";
  const createdCandidate = data.createdAt ?? data.created_at;
  const createdAt =
    typeof createdCandidate === "string" && createdCandidate.trim() ? createdCandidate : new Date().toISOString();
  const registeredCandidate = data.registeredAt ?? data.registered_at;
  const registeredAt =
    typeof registeredCandidate === "string" && registeredCandidate.trim() ? registeredCandidate : createdAt;
  return {
    id,
    name,
    username,
    role,
    createdAt,
    registeredAt,
  };
};

const normalizeTimestamp = (value: unknown): string | undefined => {
  if (!value) {
    return undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) {
      const normalized = asNumber > 1_000_000_000 ? asNumber : asNumber * 1000;
      return new Date(normalized).toISOString();
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = value > 1_000_000_000 ? value : value * 1000;
    return new Date(normalized).toISOString();
  }
  return undefined;
};

const normalizeMetaTokenRecord = (value: unknown): MetaTokenRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = value as Record<string, unknown>;
  const rawToken =
    data.accessToken ||
    data.access_token ||
    data.token ||
    data.access ||
    data.value;
  if (typeof rawToken !== "string" || !rawToken.trim()) {
    return null;
  }

  const refreshCandidate = data.refreshToken || data.refresh_token;
  const userCandidate = data.userId || data.user_id;
  const expiresCandidate =
    data.expiresAt ||
    data.expires_at ||
    data.expiration ||
    data.expires ||
    data.expire_at;

  const expiresAt = normalizeTimestamp(expiresCandidate);
  const refreshToken = typeof refreshCandidate === "string" && refreshCandidate.trim() ? refreshCandidate.trim() : undefined;
  const userId = typeof userCandidate === "string" && userCandidate.trim() ? userCandidate.trim() : undefined;

  const explicitStatus = typeof data.status === "string" ? data.status : typeof data.state === "string" ? data.state : undefined;
  const normalizedStatus: MetaTokenStatus = (() => {
    if (explicitStatus === "expired") {
      return "expired";
    }
    if (explicitStatus === "missing") {
      return "missing";
    }
    if (expiresAt) {
      const expires = Date.parse(expiresAt);
      if (!Number.isNaN(expires) && expires <= Date.now()) {
        return "expired";
      }
    }
    return "valid";
  })();

  return {
    accessToken: rawToken.trim(),
    refreshToken,
    userId,
    expiresAt,
    status: normalizedStatus,
  };
};

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
    const parsed = JSON.parse(stored);
    return normalizeMetaTokenRecord(parsed);
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
  const stored = await readJsonFromR2<ProjectRecord[] | Record<string, unknown>[]>(
    env,
    PROJECT_INDEX_KEY,
    [],
  );
  return stored.map((record) => normalizeProjectRecord(record));
};

export const saveProjects = async (env: EnvBindings, projects: ProjectRecord[]): Promise<void> => {
  const normalized = projects.map((project) => normalizeProjectRecord(project));
  await writeJsonToR2(env, PROJECT_INDEX_KEY, normalized);
  await syncKvRecords({
    env,
    indexKey: PROJECT_KV_INDEX_KEY,
    prefix: PROJECT_KV_PREFIX,
    items: normalized,
    getId: (project) => project.id,
    serialize: (project) => {
      const metaAccountId = project.metaAccountId || project.adAccountId || "";
      const chatRaw = project.chatId || project.telegramChatId || "";
      const chatNumeric = typeof chatRaw === "number" ? chatRaw : Number(chatRaw);
      const chatIdValue =
        typeof chatNumeric === "number" && Number.isFinite(chatNumeric) && !Number.isNaN(chatNumeric)
          ? chatNumeric
          : chatRaw || null;
      return {
        id: project.id,
        name: project.name,
        meta_account_id: metaAccountId,
        meta_account_name: project.metaAccountName || project.name,
        chat_id: chatIdValue,
        billing_status: project.billingStatus ?? "pending",
        next_payment_date: project.nextPaymentDate ?? null,
        tariff: project.tariff ?? 0,
        created_at: project.createdAt,
      };
    },
  });
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
  await syncLeadKvRecords(env, projectId, leads);
};

export const deleteLeads = async (env: EnvBindings, projectId: string): Promise<void> => {
  await env.R2.delete(`${LEAD_INDEX_PREFIX}${projectId}.json`);
  const indexKey = `${LEAD_KV_INDEX_PREFIX}${projectId}`;
  const existing = await readKvIndex(env, indexKey);
  await Promise.all(existing.map((id) => env.DB.delete(`${LEAD_KV_PREFIX}${projectId}:${id}`)));
  await writeKvIndex(env, indexKey, []);
};

export const listUsers = async (env: EnvBindings): Promise<UserRecord[]> => {
  const stored = await readJsonFromR2<UserRecord[] | Record<string, unknown>[]>(
    env,
    USER_INDEX_KEY,
    [],
  );
  return stored.map((record) => normalizeUserRecord(record));
};

export const saveUsers = async (env: EnvBindings, users: UserRecord[]): Promise<void> => {
  const normalized = users.map((user) => normalizeUserRecord(user));
  await writeJsonToR2(env, USER_INDEX_KEY, normalized);
  await syncKvRecords({
    env,
    indexKey: USER_KV_INDEX_KEY,
    prefix: USER_KV_PREFIX,
    items: normalized,
    getId: (user) => user.id,
    serialize: (user) => ({
      id: user.id,
      username: user.username ?? user.name ?? null,
      name: user.name ?? null,
      role: user.role,
      registered_at: user.registeredAt ?? user.createdAt,
    }),
  });
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

export const listChatRegistrations = async (
  env: EnvBindings,
): Promise<ChatRegistrationRecord[]> => {
  return readJsonFromR2<ChatRegistrationRecord[]>(env, CHAT_REGISTRY_KEY, []);
};

export const saveChatRegistrations = async (
  env: EnvBindings,
  records: ChatRegistrationRecord[],
): Promise<void> => {
  await writeJsonToR2(env, CHAT_REGISTRY_KEY, records);
};

export const listMetaAccountLinks = async (
  env: EnvBindings,
): Promise<MetaAccountLinkRecord[]> => {
  return readJsonFromR2<MetaAccountLinkRecord[]>(env, META_ACCOUNTS_KEY, []);
};

export const saveMetaAccountLinks = async (
  env: EnvBindings,
  records: MetaAccountLinkRecord[],
): Promise<void> => {
  await writeJsonToR2(env, META_ACCOUNTS_KEY, records);
  await syncKvRecords({
    env,
    indexKey: META_KV_INDEX_KEY,
    prefix: META_KV_PREFIX,
    items: records,
    getId: (record) => record.accountId,
    serialize: (record) => ({
      id: record.accountId,
      name: record.accountName,
      currency: record.currency ?? null,
      spent_today: record.spentToday ?? 0,
      is_linked: record.isLinked,
      linked_project_id: record.linkedProjectId ?? null,
    }),
  });
};

export const listTelegramGroupLinks = async (
  env: EnvBindings,
): Promise<TelegramGroupLinkRecord[]> => {
  return readJsonFromR2<TelegramGroupLinkRecord[]>(env, TELEGRAM_GROUPS_KEY, []);
};

export const saveTelegramGroupLinks = async (
  env: EnvBindings,
  records: TelegramGroupLinkRecord[],
): Promise<void> => {
  await writeJsonToR2(env, TELEGRAM_GROUPS_KEY, records);
};

export const listMetaProjectLinks = async (
  env: EnvBindings,
): Promise<MetaProjectLinkRecord[]> => {
  return readJsonFromR2<MetaProjectLinkRecord[]>(env, META_PROJECTS_KEY, []);
};

export const saveMetaProjectLinks = async (
  env: EnvBindings,
  records: MetaProjectLinkRecord[],
): Promise<void> => {
  await writeJsonToR2(env, META_PROJECTS_KEY, records);
};

export const loadMetaProjectLink = async (
  env: EnvBindings,
  projectId: string,
): Promise<MetaProjectLinkRecord | null> => {
  const projects = await listMetaProjectLinks(env);
  return projects.find((project) => project.projectId === projectId) ?? null;
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

export interface PendingMetaLinkState {
  metaAccountId?: string;
  telegramChatId?: string;
  updatedAt?: string;
}

const pendingMetaLinkKey = (userId: string): string => `${META_PENDING_PREFIX}${userId}`;

export const loadPendingMetaLink = async (
  env: EnvBindings,
  userId: string,
): Promise<PendingMetaLinkState | null> => {
  const stored = await env.DB.get(pendingMetaLinkKey(userId));
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored) as PendingMetaLinkState;
  } catch (error) {
    console.error("Failed to parse pending meta link", error);
    return null;
  }
};

export const savePendingMetaLink = async (
  env: EnvBindings,
  userId: string,
  state: PendingMetaLinkState,
  ttlSeconds = 900,
): Promise<void> => {
  const payload = {
    ...state,
    updatedAt: new Date().toISOString(),
  } satisfies PendingMetaLinkState;
  await env.DB.put(pendingMetaLinkKey(userId), JSON.stringify(payload), {
    expirationTtl: Math.max(60, ttlSeconds),
  });
};

export const clearPendingMetaLink = async (
  env: EnvBindings,
  userId: string,
): Promise<void> => {
  await env.DB.delete(pendingMetaLinkKey(userId));
};
