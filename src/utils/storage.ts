import {
  ChatRegistrationRecord,
  CommandLogRecord,
  LeadRecord,
  LeadReminderRecord,
  MetaAccountLinkRecord,
  MetaProjectLinkRecord,
  MetaTokenRecord,
  MetaTokenStatus,
  MetaWebhookEventRecord,
  JsonObject,
  PaymentReminderRecord,
  PaymentRecord,
  ProjectBillingState,
  ProjectRecord,
  ReportFilters,
  ReportRecord,
  ReportScheduleRecord,
  ReportDeliveryRecord,
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
const REPORT_SCHEDULE_KEY = "reports/schedules.json";
const REPORT_DELIVERY_KEY = "reports/deliveries.json";
const SETTINGS_KEY = "settings/index.json";
const COMMAND_LOG_KEY = "logs/commands.json";
const REPORT_SESSION_PREFIX = "reports/session/";
const REPORT_ASSET_PREFIX = "reports/assets/";
const LEAD_REMINDER_INDEX_KEY = "reminders/leads.json";
const PAYMENT_REMINDER_INDEX_KEY = "reminders/payments.json";
const CHAT_REGISTRY_KEY = "chats/index.json";
const META_ACCOUNTS_KEY = "meta/accounts.json";
const TELEGRAM_GROUPS_KEY = "telegram/groups.json";
const META_PROJECTS_KEY = "meta/projects.json";
const META_WEBHOOK_INDEX_KEY = "meta/webhook/events.json";
const META_PENDING_PREFIX = "meta/link/pending/";
const USER_PENDING_PREFIX = "users/pending/";
const BILLING_PENDING_PREFIX = "billing/pending/";

const TELEGRAM_GROUP_KV_INDEX_KEY = "telegram:groups:index";
const TELEGRAM_GROUP_KV_PREFIX = "telegram:group:";

const USER_KV_INDEX_KEY = "users:index";
const PROJECT_KV_INDEX_KEY = "projects:index";
const META_KV_INDEX_KEY = "meta:index";
const LEAD_KV_INDEX_PREFIX = "leads:index:";
const META_WEBHOOK_KV_INDEX_KEY = "meta:webhook:index";
const LEAD_REMINDER_KV_INDEX_KEY = "reminders:lead:index";
const PAYMENT_REMINDER_KV_INDEX_KEY = "reminders:payment:index";
const REPORT_SCHEDULE_KV_INDEX_KEY = "reports:schedule:index";
const REPORT_DELIVERY_KV_INDEX_KEY = "reports:delivery:index";

const USER_KV_PREFIX = "users:";
const PROJECT_KV_PREFIX = "project:";
const META_KV_PREFIX = "meta:";
const LEAD_KV_PREFIX = "leads:";
const META_WEBHOOK_KV_PREFIX = "meta:webhook:event:";
const LEAD_REMINDER_KV_PREFIX = "reminders:lead:";
const PAYMENT_REMINDER_KV_PREFIX = "reminders:payment:";
const REPORT_SCHEDULE_KV_PREFIX = "reports:schedule:";
const REPORT_DELIVERY_KV_PREFIX = "reports:delivery:";

const MAX_REPORT_RECORDS = 200;
const MAX_REPORT_DELIVERIES = 200;

export interface ReportSessionRecord {
  id: string;
  chatId: string;
  userId?: string;
  username?: string;
  type: "auto" | "summary" | "finance" | "custom";
  command: "auto_report" | "summary" | "finance" | "custom";
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

export const updateProjectRecord = async (
  env: EnvBindings,
  projectId: string,
  patch: Partial<ProjectRecord>,
): Promise<ProjectRecord | null> => {
  const projects = await listProjects(env);
  const index = projects.findIndex((project) => project.id === projectId);
  if (index < 0) {
    return null;
  }
  const current = projects[index];
  const updated: ProjectRecord = {
    ...current,
    ...patch,
    id: current.id,
    updatedAt: new Date().toISOString(),
  };
  projects[index] = updated;
  await saveProjects(env, projects);
  return normalizeProjectRecord(updated);
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

const normalizeLeadReminderRecord = (
  input: LeadReminderRecord | Record<string, unknown>,
): LeadReminderRecord => {
  const data = input as Record<string, unknown>;
  const nowIso = new Date().toISOString();
  const leadSource = data.leadId ?? data.lead_id ?? data.leadID ?? data.id;
  const leadId =
    typeof leadSource === "string" && leadSource.trim()
      ? leadSource.trim()
      : leadSource !== undefined
        ? String(leadSource)
        : "";
  const projectSource = data.projectId ?? data.project_id;
  const projectId =
    typeof projectSource === "string" && projectSource.trim()
      ? projectSource.trim()
      : projectSource !== undefined
        ? String(projectSource)
        : "";
  const idSource = data.id ?? leadId;
  const id =
    typeof idSource === "string" && idSource.trim()
      ? idSource.trim()
      : `leadrem_${createId(8)}`;
  const statusSource = data.status;
  const status: LeadReminderRecord["status"] =
    statusSource === "notified" || statusSource === "resolved" ? statusSource : "pending";
  const notifiedSource = data.notifiedCount ?? data.notified_count ?? data.count;
  const notifiedCount =
    typeof notifiedSource === "number" && Number.isFinite(notifiedSource)
      ? Math.max(0, Math.floor(notifiedSource))
      : 0;
  const createdSource = data.createdAt ?? data.created_at;
  const createdAt =
    typeof createdSource === "string" && createdSource.trim() && !Number.isNaN(Date.parse(createdSource))
      ? new Date(createdSource).toISOString()
      : nowIso;
  const updatedSource = data.updatedAt ?? data.updated_at;
  const updatedAt =
    typeof updatedSource === "string" && updatedSource.trim() && !Number.isNaN(Date.parse(updatedSource))
      ? new Date(updatedSource).toISOString()
      : nowIso;
  const lastSource = data.lastNotifiedAt ?? data.last_notified_at;
  const lastNotifiedAt =
    typeof lastSource === "string" && lastSource.trim() && !Number.isNaN(Date.parse(lastSource))
      ? new Date(lastSource).toISOString()
      : lastSource === null
        ? null
        : undefined;
  return {
    id,
    leadId,
    projectId,
    status,
    notifiedCount,
    createdAt,
    updatedAt,
    lastNotifiedAt,
  };
};

const normalizePaymentReminderRecord = (
  input: PaymentReminderRecord | Record<string, unknown>,
): PaymentReminderRecord => {
  const data = input as Record<string, unknown>;
  const nowIso = new Date().toISOString();
  const projectSource = data.projectId ?? data.project_id;
  const projectId =
    typeof projectSource === "string" && projectSource.trim()
      ? projectSource.trim()
      : projectSource !== undefined
        ? String(projectSource)
        : "";
  const idSource = data.id ?? projectId;
  const id =
    typeof idSource === "string" && idSource.trim()
      ? idSource.trim()
      : `payrem_${createId(8)}`;
  const statusSource = data.status;
  const status: PaymentReminderRecord["status"] =
    statusSource === "upcoming" || statusSource === "overdue" ? statusSource : "pending";
  const dueSource = data.dueDate ?? data.due_date ?? data.nextPaymentDate ?? data.next_payment_date;
  const dueDate =
    typeof dueSource === "string" && dueSource.trim() && !Number.isNaN(Date.parse(dueSource))
      ? new Date(dueSource).toISOString()
      : dueSource === null
        ? null
        : undefined;
  const notifiedSource = data.notifiedCount ?? data.notified_count ?? data.count;
  const notifiedCount =
    typeof notifiedSource === "number" && Number.isFinite(notifiedSource)
      ? Math.max(0, Math.floor(notifiedSource))
      : 0;
  const createdSource = data.createdAt ?? data.created_at;
  const createdAt =
    typeof createdSource === "string" && createdSource.trim() && !Number.isNaN(Date.parse(createdSource))
      ? new Date(createdSource).toISOString()
      : nowIso;
  const updatedSource = data.updatedAt ?? data.updated_at;
  const updatedAt =
    typeof updatedSource === "string" && updatedSource.trim() && !Number.isNaN(Date.parse(updatedSource))
      ? new Date(updatedSource).toISOString()
      : nowIso;
  const lastSource = data.lastNotifiedAt ?? data.last_notified_at;
  const lastNotifiedAt =
    typeof lastSource === "string" && lastSource.trim() && !Number.isNaN(Date.parse(lastSource))
      ? new Date(lastSource).toISOString()
      : lastSource === null
        ? null
        : undefined;
  return {
    id,
    projectId,
    status,
    dueDate,
    notifiedCount,
    createdAt,
    updatedAt,
    lastNotifiedAt,
  };
};

export const listLeadReminders = async (env: EnvBindings): Promise<LeadReminderRecord[]> => {
  const stored = await readJsonFromR2<LeadReminderRecord[] | Record<string, unknown>[]>(
    env,
    LEAD_REMINDER_INDEX_KEY,
    [],
  );
  return stored
    .map((record) => normalizeLeadReminderRecord(record))
    .filter((record) => record.leadId && record.projectId);
};

export const saveLeadReminders = async (
  env: EnvBindings,
  reminders: LeadReminderRecord[],
): Promise<void> => {
  const normalized = reminders
    .map((record) => normalizeLeadReminderRecord(record))
    .filter((record) => record.leadId && record.projectId);
  await writeJsonToR2(env, LEAD_REMINDER_INDEX_KEY, normalized);
  await syncKvRecords({
    env,
    indexKey: LEAD_REMINDER_KV_INDEX_KEY,
    prefix: LEAD_REMINDER_KV_PREFIX,
    items: normalized,
    getId: (record) => record.id,
    serialize: (record) => ({
      id: record.id,
      lead_id: record.leadId,
      project_id: record.projectId,
      status: record.status,
      notified_count: record.notifiedCount,
      last_notified_at: record.lastNotifiedAt ?? null,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    }),
  });
};

export const clearLeadReminder = async (env: EnvBindings, leadId: string): Promise<void> => {
  if (!leadId) {
    return;
  }
  const reminders = await listLeadReminders(env);
  const filtered = reminders.filter((record) => record.leadId !== leadId);
  if (filtered.length === reminders.length) {
    return;
  }
  await saveLeadReminders(env, filtered);
};

export const clearLeadRemindersByProject = async (
  env: EnvBindings,
  projectId: string,
): Promise<void> => {
  if (!projectId) {
    return;
  }
  const reminders = await listLeadReminders(env);
  const filtered = reminders.filter((record) => record.projectId !== projectId);
  if (filtered.length === reminders.length) {
    return;
  }
  await saveLeadReminders(env, filtered);
};

export const listPaymentReminders = async (env: EnvBindings): Promise<PaymentReminderRecord[]> => {
  const stored = await readJsonFromR2<PaymentReminderRecord[] | Record<string, unknown>[]>(
    env,
    PAYMENT_REMINDER_INDEX_KEY,
    [],
  );
  return stored
    .map((record) => normalizePaymentReminderRecord(record))
    .filter((record) => record.projectId);
};

export const savePaymentReminders = async (
  env: EnvBindings,
  reminders: PaymentReminderRecord[],
): Promise<void> => {
  const normalized = reminders
    .map((record) => normalizePaymentReminderRecord(record))
    .filter((record) => record.projectId);
  await writeJsonToR2(env, PAYMENT_REMINDER_INDEX_KEY, normalized);
  await syncKvRecords({
    env,
    indexKey: PAYMENT_REMINDER_KV_INDEX_KEY,
    prefix: PAYMENT_REMINDER_KV_PREFIX,
    items: normalized,
    getId: (record) => record.id,
    serialize: (record) => ({
      id: record.id,
      project_id: record.projectId,
      status: record.status,
      due_date: record.dueDate ?? null,
      notified_count: record.notifiedCount,
      last_notified_at: record.lastNotifiedAt ?? null,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    }),
  });
};

export const clearPaymentReminder = async (env: EnvBindings, projectId: string): Promise<void> => {
  if (!projectId) {
    return;
  }
  const reminders = await listPaymentReminders(env);
  const filtered = reminders.filter((record) => record.projectId !== projectId);
  if (filtered.length === reminders.length) {
    return;
  }
  await savePaymentReminders(env, filtered);
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

export const appendReportRecord = async (
  env: EnvBindings,
  record: ReportRecord,
  options: { max?: number } = {},
): Promise<ReportRecord[]> => {
  const reports = await listReports(env);
  const nextReports = [record, ...reports];
  const limit = options.max ?? MAX_REPORT_RECORDS;
  if (nextReports.length > limit) {
    nextReports.length = limit;
  }
  await saveReports(env, nextReports);
  return nextReports;
};

export const saveReportAsset = async (
  env: EnvBindings,
  reportId: string,
  content: string | ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<void> => {
  let payload: string | ArrayBuffer;
  if (typeof content === "string") {
    payload = content;
  } else if (content instanceof ArrayBuffer) {
    payload = content;
  } else {
    const copy = new Uint8Array(content.byteLength);
    copy.set(content);
    payload = copy.buffer;
  }
  await env.R2.put(`${REPORT_ASSET_PREFIX}${reportId}`, payload, {
    httpMetadata: { contentType },
  });
};

export const getReportAsset = async (
  env: EnvBindings,
  reportId: string,
): Promise<{ body: ArrayBuffer; contentType?: string } | null> => {
  const object = await env.R2.get(`${REPORT_ASSET_PREFIX}${reportId}`);
  if (!object) {
    return null;
  }
  const stream = (object as { body?: ReadableStream<Uint8Array> }).body;
  const body = stream ? await new Response(stream).arrayBuffer() : new ArrayBuffer(0);
  const meta = (object as { httpMetadata?: { contentType?: string } }).httpMetadata;
  return {
    body,
    contentType: meta?.contentType,
  };
};

export const deleteReportAsset = async (env: EnvBindings, reportId: string): Promise<void> => {
  await env.R2.delete(`${REPORT_ASSET_PREFIX}${reportId}`);
};

export const listReportSchedules = async (env: EnvBindings): Promise<ReportScheduleRecord[]> => {
  return readJsonFromR2<ReportScheduleRecord[]>(env, REPORT_SCHEDULE_KEY, []);
};

export const saveReportSchedules = async (
  env: EnvBindings,
  schedules: ReportScheduleRecord[],
): Promise<void> => {
  await writeJsonToR2(env, REPORT_SCHEDULE_KEY, schedules);
  await syncKvRecords({
    env,
    indexKey: REPORT_SCHEDULE_KV_INDEX_KEY,
    prefix: REPORT_SCHEDULE_KV_PREFIX,
    items: schedules,
    getId: (item) => item.id,
    serialize: (item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      frequency: item.frequency,
      time: item.time,
      timezone: item.timezone ?? null,
      weekdays: item.weekdays ?? null,
      project_ids: item.projectIds,
      chat_id: item.chatId,
      enabled: item.enabled,
      next_run_at: item.nextRunAt ?? null,
      last_run_at: item.lastRunAt ?? null,
      last_status: item.lastStatus ?? null,
    }),
  });
};

export const listReportDeliveries = async (env: EnvBindings): Promise<ReportDeliveryRecord[]> => {
  return readJsonFromR2<ReportDeliveryRecord[]>(env, REPORT_DELIVERY_KEY, []);
};

export const saveReportDeliveries = async (
  env: EnvBindings,
  deliveries: ReportDeliveryRecord[],
): Promise<void> => {
  const limited = deliveries.slice(0, MAX_REPORT_DELIVERIES);
  await writeJsonToR2(env, REPORT_DELIVERY_KEY, limited);
  await syncKvRecords({
    env,
    indexKey: REPORT_DELIVERY_KV_INDEX_KEY,
    prefix: REPORT_DELIVERY_KV_PREFIX,
    items: limited,
    getId: (item) => item.id,
    serialize: (item) => ({
      id: item.id,
      schedule_id: item.scheduleId,
      report_id: item.reportId ?? null,
      type: item.type,
      channel: item.channel,
      status: item.status,
      delivered_at: item.deliveredAt,
      error: item.error ?? null,
    }),
  });
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
  await syncKvRecords({
    env,
    indexKey: TELEGRAM_GROUP_KV_INDEX_KEY,
    prefix: TELEGRAM_GROUP_KV_PREFIX,
    items: records,
    getId: (record) => record.chatId,
    serialize: (record) => ({
      chat_id: record.chatId,
      title: record.title ?? null,
      members: record.members ?? null,
      registered: Boolean(record.registered),
      linked_project_id: record.linkedProjectId ?? null,
    }),
  });
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

const normalizeMetaWebhookEvent = (
  input: MetaWebhookEventRecord | Record<string, unknown>,
): MetaWebhookEventRecord => {
  const data = input as Record<string, unknown>;
  const nowIso = new Date().toISOString();
  const idSource = data.id ?? data.eventId ?? data.event_id;
  const id = typeof idSource === "string" && idSource.trim() ? idSource.trim() : `mwh_${createId(10)}`;
  const objectSource = data.object ?? data.source ?? "";
  const object = typeof objectSource === "string" ? objectSource : String(objectSource ?? "");
  const fieldSource = data.field ?? data.event ?? data.type;
  const field = typeof fieldSource === "string" ? fieldSource : String(fieldSource ?? "");
  const createdSource = data.createdAt ?? data.created_at ?? data.time ?? data.timestamp;
  const createdAt = typeof createdSource === "string" && createdSource.trim()
    ? new Date(createdSource).toISOString()
    : typeof createdSource === "number" && Number.isFinite(createdSource)
      ? new Date(createdSource * (createdSource > 1_000_000_000 ? 1 : 1000)).toISOString()
      : nowIso;
  const updatedSource = data.updatedAt ?? data.updated_at ?? createdAt;
  const updatedAt = typeof updatedSource === "string" && updatedSource.trim()
    ? new Date(updatedSource).toISOString()
    : createdAt;
  const leadIdSource = data.leadId ?? data.lead_id ?? data.leadId ?? data.leadgen_id;
  const leadId = typeof leadIdSource === "string" && leadIdSource.trim() ? leadIdSource.trim() : undefined;
  const adAccountSource =
    data.adAccountId ?? data.ad_account_id ?? data.account_id ?? data.adAccount ?? data.ad_account;
  const adAccountId = typeof adAccountSource === "string" && adAccountSource.trim()
    ? adAccountSource.trim()
    : adAccountSource !== undefined
      ? String(adAccountSource)
      : undefined;
  const projectIdSource = data.projectId ?? data.project_id;
  const projectId = typeof projectIdSource === "string" && projectIdSource.trim()
    ? projectIdSource.trim()
    : undefined;
  const projectNameSource = data.projectName ?? data.project_name;
  const projectName = typeof projectNameSource === "string" && projectNameSource.trim()
    ? projectNameSource.trim()
    : undefined;
  const processed = data.processed === undefined ? false : Boolean(data.processed);
  const typeSource = data.type ?? data.changeType ?? data.eventType;
  const type = typeof typeSource === "string" && typeSource.trim() ? typeSource.trim() : undefined;
  const payloadSource = data.payload;
  let payload: JsonObject = {};
  if (payloadSource && typeof payloadSource === "object") {
    try {
      payload = JSON.parse(JSON.stringify(payloadSource)) as JsonObject;
    } catch (error) {
      console.warn("Failed to normalize webhook payload", error);
      payload = {};
    }
  }

  return {
    id,
    object,
    field,
    type,
    leadId,
    adAccountId,
    projectId,
    projectName,
    processed,
    createdAt,
    updatedAt,
    payload,
  };
};

export const listMetaWebhookEvents = async (
  env: EnvBindings,
): Promise<MetaWebhookEventRecord[]> => {
  const stored = await readJsonFromR2<MetaWebhookEventRecord[] | Record<string, unknown>[]>(
    env,
    META_WEBHOOK_INDEX_KEY,
    [],
  );
  return stored.map((record) => normalizeMetaWebhookEvent(record));
};

export const appendMetaWebhookEvent = async (
  env: EnvBindings,
  event: MetaWebhookEventRecord,
  limit = 200,
): Promise<void> => {
  const normalized = normalizeMetaWebhookEvent(event);
  const existing = await listMetaWebhookEvents(env);
  const filtered = existing.filter((item) => item.id !== normalized.id);
  const next = [normalized, ...filtered]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, Math.max(1, limit));
  await writeJsonToR2(env, META_WEBHOOK_INDEX_KEY, next);
  await syncKvRecords({
    env,
    indexKey: META_WEBHOOK_KV_INDEX_KEY,
    prefix: META_WEBHOOK_KV_PREFIX,
    items: next,
    getId: (item) => item.id,
    serialize: (item) => ({
      id: item.id,
      object: item.object,
      field: item.field,
      type: item.type ?? null,
      lead_id: item.leadId ?? null,
      ad_account_id: item.adAccountId ?? null,
      project_id: item.projectId ?? null,
      project_name: item.projectName ?? null,
      processed: item.processed,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    }),
  });
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

export type MetaLinkFlow = "meta" | "project";

export interface PendingMetaLinkState {
  metaAccountId?: string;
  telegramChatId?: string;
  updatedAt?: string;
  flow?: MetaLinkFlow;
}

export type PendingBillingAction = "set-next-payment" | "set-tariff";

export interface PendingBillingOperation {
  action: PendingBillingAction;
  projectId: string;
  updatedAt?: string;
}

const pendingMetaLinkKey = (userId: string): string => `${META_PENDING_PREFIX}${userId}`;

const pendingBillingKey = (userId: string): string => `${BILLING_PENDING_PREFIX}${userId}`;

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

export const loadPendingBillingOperation = async (
  env: EnvBindings,
  userId: string,
): Promise<PendingBillingOperation | null> => {
  const stored = await env.DB.get(pendingBillingKey(userId));
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored) as PendingBillingOperation;
  } catch (error) {
    console.error("Failed to parse pending billing operation", error);
    return null;
  }
};

export const savePendingBillingOperation = async (
  env: EnvBindings,
  userId: string,
  operation: PendingBillingOperation,
  ttlSeconds = 900,
): Promise<void> => {
  const payload = {
    ...operation,
    updatedAt: new Date().toISOString(),
  } satisfies PendingBillingOperation;
  await env.DB.put(pendingBillingKey(userId), JSON.stringify(payload), {
    expirationTtl: Math.max(60, ttlSeconds),
  });
};

export const clearPendingBillingOperation = async (
  env: EnvBindings,
  userId: string,
): Promise<void> => {
  await env.DB.delete(pendingBillingKey(userId));
};

export type PendingUserAction = "create" | "create-role";

export interface PendingUserOperation {
  action: PendingUserAction;
  targetUserId?: string;
  username?: string | null;
  name?: string | null;
  updatedAt?: string;
}

const pendingUserKey = (userId: string): string => `${USER_PENDING_PREFIX}${userId}`;

export const loadPendingUserOperation = async (
  env: EnvBindings,
  userId: string,
): Promise<PendingUserOperation | null> => {
  const stored = await env.DB.get(pendingUserKey(userId));
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored) as PendingUserOperation;
  } catch (error) {
    console.error("Failed to parse pending user operation", error);
    return null;
  }
};

export const savePendingUserOperation = async (
  env: EnvBindings,
  userId: string,
  operation: PendingUserOperation,
  ttlSeconds = 900,
): Promise<void> => {
  const payload = {
    ...operation,
    updatedAt: new Date().toISOString(),
  } satisfies PendingUserOperation;
  await env.DB.put(pendingUserKey(userId), JSON.stringify(payload), {
    expirationTtl: Math.max(60, ttlSeconds),
  });
};

export const clearPendingUserOperation = async (
  env: EnvBindings,
  userId: string,
): Promise<void> => {
  await env.DB.delete(pendingUserKey(userId));
};
