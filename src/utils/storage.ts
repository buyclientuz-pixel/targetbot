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
  PendingCampaignSelectionRecord,
  PendingPortalOperation,
  PendingProjectEditOperation,
  PortalMetricKey,
  ProjectBillingState,
  ProjectDeletionSummary,
  ProjectPortalRecord,
  ProjectRecord,
  ReportFilters,
  ReportRecord,
  ReportScheduleRecord,
  ReportDeliveryRecord,
  SettingRecord,
  TelegramGroupLinkRecord,
  UserRecord,
  QaRunRecord,
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
const PROJECT_PENDING_PREFIX = "projects/pending/";
const QA_RUNS_KEY = "qa/runs.json";

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
const QA_RUN_KV_INDEX_KEY = "qa:runs:index";

const USER_KV_PREFIX = "users:";
const PROJECT_KV_PREFIX = "project:";
const META_KV_PREFIX = "meta:";
const LEAD_KV_PREFIX = "leads:";
const META_WEBHOOK_KV_PREFIX = "meta:webhook:event:";
const LEAD_REMINDER_KV_PREFIX = "reminders:lead:";
const PAYMENT_REMINDER_KV_PREFIX = "reminders:payment:";
const REPORT_SCHEDULE_KV_PREFIX = "reports:schedule:";
const REPORT_DELIVERY_KV_PREFIX = "reports:delivery:";
const QA_RUN_KV_PREFIX = "qa:run:";
const PORTAL_INDEX_KEY = "portals/index.json";
const PORTAL_KV_INDEX_KEY = "portals:index";
const PORTAL_KV_PREFIX = "portal:";
const PORTAL_PENDING_PREFIX = "portal/pending/";
const CAMPAIGN_PENDING_PREFIX = "campaigns/pending/";

const PORTAL_ALLOWED_METRICS: PortalMetricKey[] = [
  "leads_total",
  "leads_new",
  "leads_done",
  "spend",
  "impressions",
  "clicks",
];

const sanitizePortalMetrics = (values: unknown): PortalMetricKey[] => {
  if (!Array.isArray(values)) {
    return [...PORTAL_ALLOWED_METRICS];
  }
  const normalized = values
    .map((value) => String(value).trim())
    .filter((value): value is PortalMetricKey => PORTAL_ALLOWED_METRICS.includes(value as PortalMetricKey));
  return normalized.length > 0 ? normalized : [...PORTAL_ALLOWED_METRICS];
};

const sanitizeTelegramLink = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const lower = trimmed.toLowerCase();
  if (trimmed.startsWith("tg://")) {
    return trimmed;
  }
  if (lower.startsWith("http://")) {
    return `https://${trimmed.slice(7)}`;
  }
  if (lower.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (lower.startsWith("t.me/") || lower.startsWith("telegram.me/")) {
    return `https://${trimmed.replace(/^\/+/, "")}`;
  }
  if (trimmed.startsWith("@")) {
    return `https://t.me/${trimmed.slice(1)}`;
  }
  if (trimmed.startsWith("+")) {
    return `https://t.me/${trimmed}`;
  }
  return `https://t.me/${trimmed.replace(/^\/+/, "")}`;
};

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

export const QA_RUN_HISTORY_LIMIT = 50;

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
  const telegramChatId =
    typeof data.telegramChatId === "string" && data.telegramChatId.trim()
      ? data.telegramChatId.trim()
      : chatId || undefined;
  const telegramThreadId = typeof data.telegramThreadId === "number" ? data.telegramThreadId : undefined;
  const telegramLink =
    sanitizeTelegramLink(
      data.telegramLink ?? data.chatLink ?? data.telegram_link ?? data.chat_link ?? data.inviteLink ?? data.invite_link,
    ) || undefined;
  const telegramTitleSource =
    data.telegramTitle ?? data.chatTitle ?? data.telegram_title ?? data.chat_title ?? data.title;
  const telegramTitle =
    typeof telegramTitleSource === "string" && telegramTitleSource.trim() ? telegramTitleSource.trim() : undefined;
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
    telegramTitle,
    adAccountId,
  };
};

const normalizeMetaAccountLinkRecord = (
  input: MetaAccountLinkRecord | Record<string, unknown>,
): MetaAccountLinkRecord => {
  const data = input as Record<string, unknown>;
  const idCandidate = data.accountId ?? data.account_id ?? data.id;
  const accountId =
    typeof idCandidate === "string" && idCandidate.trim()
      ? idCandidate.trim()
      : typeof idCandidate === "number"
        ? String(idCandidate)
        : `act_${createId(10)}`;

  const nameCandidate = data.accountName ?? data.name ?? data.account_name ?? accountId;
  const accountName =
    typeof nameCandidate === "string" && nameCandidate.trim() ? nameCandidate.trim() : String(accountId);

  const currencyCandidate = data.currency ?? data.accountCurrency ?? data.currency_code;
  const currency =
    typeof currencyCandidate === "string" && currencyCandidate.trim()
      ? currencyCandidate.trim().toUpperCase()
      : null;

  const spentCandidate =
    data.spentToday ??
    data.spent_today ??
    data.today_spent ??
    data.spend_today ??
    data.spend ??
    data.spendToday;
  const spentToday = (() => {
    if (typeof spentCandidate === "number" && Number.isFinite(spentCandidate)) {
      return spentCandidate;
    }
    if (typeof spentCandidate === "string" && spentCandidate.trim() && !Number.isNaN(Number(spentCandidate))) {
      return Number(spentCandidate);
    }
    return null;
  })();

  const linkedCandidate = data.linkedProjectId ?? data.projectId ?? data.linked_project_id ?? data.project_id;
  const linkedProjectId =
    typeof linkedCandidate === "string" && linkedCandidate.trim() ? linkedCandidate.trim() : null;

  const isLinkedCandidate = data.isLinked ?? data.is_linked ?? data.linked ?? data.connected;
  const isLinked = (() => {
    if (typeof isLinkedCandidate === "boolean") {
      return isLinkedCandidate;
    }
    if (typeof isLinkedCandidate === "number") {
      return isLinkedCandidate > 0;
    }
    if (typeof isLinkedCandidate === "string") {
      const normalized = isLinkedCandidate.trim().toLowerCase();
      return ["1", "true", "yes", "linked"].includes(normalized);
    }
    return Boolean(linkedProjectId);
  })();

  const updatedCandidate = data.updatedAt ?? data.updated_at ?? data.synced_at;
  const updatedAt =
    typeof updatedCandidate === "string" && updatedCandidate.trim() ? updatedCandidate.trim() : undefined;

  return {
    accountId,
    accountName,
    currency,
    spentToday,
    isLinked,
    linkedProjectId,
    updatedAt,
  };
};

const normalizeTelegramGroupLinkRecord = (
  input: TelegramGroupLinkRecord | Record<string, unknown>,
): TelegramGroupLinkRecord => {
  const data = input as Record<string, unknown>;
  const chatCandidate = data.chatId ?? data.chat_id ?? data.id ?? data.group_id;
  const chatId =
    typeof chatCandidate === "string" && chatCandidate.trim()
      ? chatCandidate.trim()
      : typeof chatCandidate === "number"
        ? String(chatCandidate)
        : `chat_${createId(8)}`;

  const titleCandidate = data.title ?? data.chatTitle ?? data.name ?? data.chat_title;
  const title = typeof titleCandidate === "string" && titleCandidate.trim() ? titleCandidate.trim() : null;

  const membersCandidate = data.members ?? data.memberCount ?? data.member_count ?? data.participants;
  const members = (() => {
    if (typeof membersCandidate === "number" && Number.isFinite(membersCandidate)) {
      return membersCandidate;
    }
    if (typeof membersCandidate === "string" && membersCandidate.trim() && !Number.isNaN(Number(membersCandidate))) {
      return Number(membersCandidate);
    }
    return null;
  })();

  const registeredCandidate = data.registered ?? data.isRegistered ?? data.registered_at ?? data.status;
  const registered = (() => {
    if (typeof registeredCandidate === "boolean") {
      return registeredCandidate;
    }
    if (typeof registeredCandidate === "number") {
      return registeredCandidate > 0;
    }
    if (typeof registeredCandidate === "string") {
      const normalized = registeredCandidate.trim().toLowerCase();
      if (normalized === "registered" || normalized === "yes" || normalized === "true" || normalized === "1") {
        return true;
      }
      if (normalized === "0" || normalized === "false" || normalized === "no") {
        return false;
      }
    }
    return false;
  })();

  const linkedCandidate = data.linkedProjectId ?? data.projectId ?? data.linked_project_id ?? data.project_id;
  const linkedProjectId =
    typeof linkedCandidate === "string" && linkedCandidate.trim() ? linkedCandidate.trim() : null;

  const updatedCandidate = data.updatedAt ?? data.updated_at ?? data.synced_at;
  const updatedAt =
    typeof updatedCandidate === "string" && updatedCandidate.trim() ? updatedCandidate.trim() : undefined;

  return {
    chatId,
    title,
    members,
    registered,
    linkedProjectId,
    updatedAt,
  };
};

const coalesce = <T>(...values: (T | null | undefined)[]): T | undefined => {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
};

const chooseLatest = (a?: string, b?: string): { latest?: string; winner: 1 | 2 | 0 } => {
  const aTime = a ? Date.parse(a) : Number.NaN;
  const bTime = b ? Date.parse(b) : Number.NaN;
  if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) {
    if (aTime === bTime) {
      return { latest: a, winner: 0 };
    }
    return aTime > bTime ? { latest: a, winner: 1 } : { latest: b, winner: 2 };
  }
  if (!Number.isNaN(aTime)) {
    return { latest: a, winner: 1 };
  }
  if (!Number.isNaN(bTime)) {
    return { latest: b, winner: 2 };
  }
  return { latest: undefined, winner: 0 };
};

const mergeProjectRecords = (first: ProjectRecord, second: ProjectRecord): ProjectRecord => {
  const { latest, winner } = chooseLatest(first.updatedAt, second.updatedAt);
  const base = winner === 2 ? second : first;
  const extra = winner === 2 ? first : second;
  const tariff = base.tariff && base.tariff > 0 ? base.tariff : extra.tariff ?? base.tariff ?? 0;
  return {
    ...base,
    metaAccountId: base.metaAccountId || extra.metaAccountId,
    metaAccountName: base.metaAccountName || extra.metaAccountName || base.name,
    adAccountId: base.adAccountId || extra.adAccountId || base.metaAccountId || extra.metaAccountId,
    chatId: base.chatId || extra.chatId,
    billingStatus: base.billingStatus || extra.billingStatus,
    nextPaymentDate: coalesce(base.nextPaymentDate, extra.nextPaymentDate, null) ?? null,
    tariff,
    settings: { ...extra.settings, ...base.settings },
    userId: base.userId ?? extra.userId,
    telegramChatId: base.telegramChatId ?? extra.telegramChatId,
    telegramThreadId: base.telegramThreadId ?? extra.telegramThreadId,
    telegramLink: base.telegramLink ?? extra.telegramLink,
    telegramTitle: base.telegramTitle ?? extra.telegramTitle,
    updatedAt: latest ?? base.updatedAt ?? extra.updatedAt,
  };
};

const mergeMetaAccountRecords = (
  first: MetaAccountLinkRecord,
  second: MetaAccountLinkRecord,
): MetaAccountLinkRecord => {
  const { latest, winner } = chooseLatest(first.updatedAt, second.updatedAt);
  const base = winner === 2 ? second : first;
  const extra = winner === 2 ? first : second;
  return {
    ...base,
    accountName: base.accountName || extra.accountName || base.accountId,
    currency: base.currency ?? extra.currency ?? null,
    spentToday: base.spentToday ?? extra.spentToday ?? null,
    isLinked: base.isLinked || extra.isLinked,
    linkedProjectId: base.linkedProjectId ?? extra.linkedProjectId ?? null,
    updatedAt: latest ?? base.updatedAt ?? extra.updatedAt,
  };
};

const mergeTelegramGroupRecords = (
  first: TelegramGroupLinkRecord,
  second: TelegramGroupLinkRecord,
): TelegramGroupLinkRecord => {
  const { latest, winner } = chooseLatest(first.updatedAt, second.updatedAt);
  const base = winner === 2 ? second : first;
  const extra = winner === 2 ? first : second;
  return {
    ...base,
    title: base.title ?? extra.title ?? null,
    members: base.members ?? extra.members ?? null,
    registered: base.registered || extra.registered,
    linkedProjectId: base.linkedProjectId ?? extra.linkedProjectId ?? null,
    updatedAt: latest ?? base.updatedAt ?? extra.updatedAt,
  };
};

const readProjectsFromKv = async (env: EnvBindings): Promise<ProjectRecord[]> => {
  const ids = await readKvIndex(env, PROJECT_KV_INDEX_KEY);
  if (!ids.length) {
    return [];
  }
  const records = await Promise.all(
    ids.map(async (id) => {
      try {
        const stored = await env.DB.get(`${PROJECT_KV_PREFIX}${id}`);
        if (!stored) {
          return null;
        }
        const parsed = JSON.parse(stored) as Record<string, unknown>;
        return normalizeProjectRecord({ id, ...parsed });
      } catch (error) {
        console.warn("Failed to read project from KV", id, error);
        return null;
      }
    }),
  );
  return records.filter((record): record is ProjectRecord => Boolean(record));
};

const readMetaAccountsFromKv = async (env: EnvBindings): Promise<MetaAccountLinkRecord[]> => {
  const ids = await readKvIndex(env, META_KV_INDEX_KEY);
  if (!ids.length) {
    return [];
  }
  const records = await Promise.all(
    ids.map(async (id) => {
      try {
        const stored = await env.DB.get(`${META_KV_PREFIX}${id}`);
        if (!stored) {
          return null;
        }
        const parsed = JSON.parse(stored) as Record<string, unknown>;
        return normalizeMetaAccountLinkRecord({ accountId: id, ...parsed });
      } catch (error) {
        console.warn("Failed to read meta account from KV", id, error);
        return null;
      }
    }),
  );
  return records.filter((record): record is MetaAccountLinkRecord => Boolean(record));
};

const readTelegramGroupsFromKv = async (env: EnvBindings): Promise<TelegramGroupLinkRecord[]> => {
  const ids = await readKvIndex(env, TELEGRAM_GROUP_KV_INDEX_KEY);
  if (!ids.length) {
    return [];
  }
  const records = await Promise.all(
    ids.map(async (id) => {
      try {
        const stored = await env.DB.get(`${TELEGRAM_GROUP_KV_PREFIX}${id}`);
        if (!stored) {
          return null;
        }
        const parsed = JSON.parse(stored) as Record<string, unknown>;
        return normalizeTelegramGroupLinkRecord({ chatId: id, ...parsed });
      } catch (error) {
        console.warn("Failed to read telegram group from KV", id, error);
        return null;
      }
    }),
  );
  return records.filter((record): record is TelegramGroupLinkRecord => Boolean(record));
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
  const [r2Records, kvRecords, metaLinkRecords] = await Promise.all([
    readJsonFromR2<ProjectRecord[] | Record<string, unknown>[]>(env, PROJECT_INDEX_KEY, []).catch(() => []),
    readProjectsFromKv(env).catch(() => [] as ProjectRecord[]),
    listMetaProjectLinks(env).catch(() => [] as MetaProjectLinkRecord[]),
  ]);
  const map = new Map<string, ProjectRecord>();
  kvRecords.forEach((record) => {
    map.set(record.id, normalizeProjectRecord(record));
  });
  r2Records
    .map((record) => normalizeProjectRecord(record))
    .forEach((record) => {
      const existing = map.get(record.id);
      map.set(record.id, existing ? mergeProjectRecords(existing, record) : record);
    });
  metaLinkRecords
    .map((link) =>
      normalizeProjectRecord({
        id: link.projectId,
        projectId: link.projectId,
        projectName: link.projectName,
        accountId: link.accountId,
        meta_account_name: link.projectName,
        chatId: link.chatId,
        chat_id: link.chatId,
        telegramChatId: link.chatId,
        telegramTitle: link.chatTitle ?? undefined,
        billingStatus: link.billingStatus,
        nextPaymentDate: link.nextPaymentDate ?? null,
        settings: link.settings ?? {},
        createdAt: link.createdAt,
        updatedAt: link.createdAt,
      }),
    )
    .forEach((record) => {
      const existing = map.get(record.id);
      map.set(record.id, existing ? mergeProjectRecords(existing, record) : record);
    });
  return Array.from(map.values());
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
        chat_title: project.telegramTitle ?? null,
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

export const listQaRuns = async (env: EnvBindings): Promise<QaRunRecord[]> => {
  return readJsonFromR2<QaRunRecord[]>(env, QA_RUNS_KEY, []);
};

export const saveQaRuns = async (env: EnvBindings, runs: QaRunRecord[]): Promise<void> => {
  const limited = runs.slice(0, QA_RUN_HISTORY_LIMIT);
  await writeJsonToR2(env, QA_RUNS_KEY, limited);
  await syncKvRecords({
    env,
    indexKey: QA_RUN_KV_INDEX_KEY,
    prefix: QA_RUN_KV_PREFIX,
    items: limited,
    getId: (item) => item.id,
    serialize: (item) => ({
      id: item.id,
      created_at: item.createdAt,
      duration_ms: item.durationMs,
      projects_total: item.checks.projects.total,
      projects_invalid: item.checks.projects.invalid,
      schedules_total: item.checks.reportSchedules.total,
      schedules_invalid: item.checks.reportSchedules.invalid,
      schedules_rescheduled: item.checks.reportSchedules.rescheduled,
      lead_reminders_total: item.checks.leadReminders.total,
      lead_reminders_invalid: item.checks.leadReminders.invalid,
      payment_reminders_total: item.checks.paymentReminders.total,
      payment_reminders_invalid: item.checks.paymentReminders.invalid,
      issue_count: item.issues.length,
    }),
  });
};

const normalizePortalRecord = (input: ProjectPortalRecord | Record<string, unknown>): ProjectPortalRecord => {
  const data = input as Record<string, unknown>;
  const nowIso = new Date().toISOString();
  const portalId = typeof data.portalId === "string" ? data.portalId : (data.portal_id as string) || "";
  const projectId = typeof data.projectId === "string" ? data.projectId : (data.project_id as string) || "";
  const mode = data.mode === "manual" ? "manual" : "auto";
  const campaignIds = Array.isArray(data.campaignIds)
    ? data.campaignIds.map(String)
    : Array.isArray((data as { campaign_ids?: unknown }).campaign_ids)
      ? ((data as { campaign_ids?: unknown }).campaign_ids as unknown[]).map((value) => String(value))
      : [];
  const metricsSource = Array.isArray(data.metrics)
    ? data.metrics
    : Array.isArray((data as { metrics?: unknown }).metrics)
      ? ((data as { metrics?: unknown }).metrics as unknown[])
      : PORTAL_ALLOWED_METRICS;
  const metrics = sanitizePortalMetrics(metricsSource);
  return {
    portalId,
    projectId,
    mode: mode === "manual" ? "manual" : "auto",
    campaignIds,
    metrics,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : (data.created_at as string) || nowIso,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : (data.updated_at as string) || nowIso,
    lastRegeneratedAt:
      typeof data.lastRegeneratedAt === "string"
        ? data.lastRegeneratedAt
        : (data.last_regenerated_at as string) ?? null,
    lastSharedAt:
      typeof data.lastSharedAt === "string" ? data.lastSharedAt : (data.last_shared_at as string) ?? null,
    lastReportId:
      typeof data.lastReportId === "string" ? data.lastReportId : (data.last_report_id as string) ?? null,
  } satisfies ProjectPortalRecord;
};

export const listPortals = async (env: EnvBindings): Promise<ProjectPortalRecord[]> => {
  const stored = await readJsonFromR2<ProjectPortalRecord[] | Record<string, unknown>[] | null>(
    env,
    PORTAL_INDEX_KEY,
    [],
  );
  return (stored ?? []).map(normalizePortalRecord);
};

export const savePortals = async (env: EnvBindings, portals: ProjectPortalRecord[]): Promise<void> => {
  await writeJsonToR2(env, PORTAL_INDEX_KEY, portals);
  await syncKvRecords({
    env,
    indexKey: PORTAL_KV_INDEX_KEY,
    prefix: PORTAL_KV_PREFIX,
    items: portals,
    getId: (portal) => portal.portalId,
    serialize: (portal) => ({
      portal_id: portal.portalId,
      project_id: portal.projectId,
      mode: portal.mode,
      campaign_ids: portal.campaignIds,
      metrics: portal.metrics,
      created_at: portal.createdAt,
      updated_at: portal.updatedAt,
      last_regenerated_at: portal.lastRegeneratedAt ?? null,
      last_shared_at: portal.lastSharedAt ?? null,
      last_report_id: portal.lastReportId ?? null,
    }),
  });
};

export const loadPortalById = async (
  env: EnvBindings,
  portalId: string,
): Promise<ProjectPortalRecord | null> => {
  const portals = await listPortals(env);
  return portals.find((portal) => portal.portalId === portalId) ?? null;
};

export const loadPortalByProjectId = async (
  env: EnvBindings,
  projectId: string,
): Promise<ProjectPortalRecord | null> => {
  const portals = await listPortals(env);
  return portals.find((portal) => portal.projectId === projectId) ?? null;
};

export const savePortalRecord = async (
  env: EnvBindings,
  record: ProjectPortalRecord,
): Promise<ProjectPortalRecord> => {
  const portals = await listPortals(env);
  const index = portals.findIndex((portal) => portal.portalId === record.portalId);
  const normalized = normalizePortalRecord(record);
  if (index >= 0) {
    portals[index] = normalized;
  } else {
    portals.push(normalized);
  }
  await savePortals(env, portals);
  return normalized;
};

export const deletePortalRecord = async (
  env: EnvBindings,
  portalId: string,
): Promise<void> => {
  const portals = await listPortals(env);
  const filtered = portals.filter((portal) => portal.portalId !== portalId);
  if (filtered.length !== portals.length) {
    await savePortals(env, filtered);
  }
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
  const [r2Records, kvRecords] = await Promise.all([
    readJsonFromR2<MetaAccountLinkRecord[] | Record<string, unknown>[]>(env, META_ACCOUNTS_KEY, []).catch(() => []),
    readMetaAccountsFromKv(env).catch(() => [] as MetaAccountLinkRecord[]),
  ]);
  const map = new Map<string, MetaAccountLinkRecord>();
  kvRecords.forEach((record) => {
    const normalized = normalizeMetaAccountLinkRecord(record);
    map.set(normalized.accountId, normalized);
  });
  r2Records
    .map((record) => normalizeMetaAccountLinkRecord(record))
    .forEach((record) => {
      const existing = map.get(record.accountId);
      map.set(record.accountId, existing ? mergeMetaAccountRecords(existing, record) : record);
    });
  return Array.from(map.values());
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
  const [r2Records, kvRecords] = await Promise.all([
    readJsonFromR2<TelegramGroupLinkRecord[] | Record<string, unknown>[]>(env, TELEGRAM_GROUPS_KEY, []).catch(() => []),
    readTelegramGroupsFromKv(env).catch(() => [] as TelegramGroupLinkRecord[]),
  ]);
  const map = new Map<string, TelegramGroupLinkRecord>();
  kvRecords.forEach((record) => {
    const normalized = normalizeTelegramGroupLinkRecord(record);
    map.set(normalized.chatId, normalized);
  });
  r2Records
    .map((record) => normalizeTelegramGroupLinkRecord(record))
    .forEach((record) => {
      const existing = map.get(record.chatId);
      map.set(record.chatId, existing ? mergeTelegramGroupRecords(existing, record) : record);
    });
  return Array.from(map.values());
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

export const deleteProjectCascade = async (
  env: EnvBindings,
  projectId: string,
): Promise<ProjectDeletionSummary | null> => {
  const projects = await listProjects(env);
  const index = projects.findIndex((project) => project.id === projectId);
  if (index === -1) {
    return null;
  }

  const project = projects[index];
  const now = new Date().toISOString();
  const projectChatId = project.telegramChatId || project.chatId;

  const [
    metaAccounts,
    telegramGroups,
    leads,
    payments,
    leadReminders,
    paymentReminders,
    schedules,
    reports,
    portals,
  ] = await Promise.all([
    listMetaAccountLinks(env).catch(() => [] as MetaAccountLinkRecord[]),
    listTelegramGroupLinks(env).catch(() => [] as TelegramGroupLinkRecord[]),
    listLeads(env, projectId).catch(() => [] as LeadRecord[]),
    listPayments(env).catch(() => [] as PaymentRecord[]),
    listLeadReminders(env).catch(() => [] as LeadReminderRecord[]),
    listPaymentReminders(env).catch(() => [] as PaymentReminderRecord[]),
    listReportSchedules(env).catch(() => [] as ReportScheduleRecord[]),
    listReports(env).catch(() => [] as ReportRecord[]),
    listPortals(env).catch(() => [] as ProjectPortalRecord[]),
  ]);

  const account = metaAccounts.find(
    (entry) => entry.linkedProjectId === projectId || entry.accountId === project.metaAccountId,
  );
  const group = telegramGroups.find(
    (entry) => entry.linkedProjectId === projectId || entry.chatId === projectChatId,
  );

  const updatedAccounts = account
    ? metaAccounts.map((entry) =>
        entry.accountId === account.accountId
          ? { ...entry, isLinked: false, linkedProjectId: null, updatedAt: now }
          : entry,
      )
    : metaAccounts;
  const updatedGroups = group
    ? telegramGroups.map((entry) =>
        entry.chatId === group.chatId ? { ...entry, linkedProjectId: null, updatedAt: now } : entry,
      )
    : telegramGroups;

  const paymentsRemaining = payments.filter((payment) => payment.projectId !== projectId);
  const removedPayments = payments.length - paymentsRemaining.length;

  const leadRemindersRemaining = leadReminders.filter((record) => record.projectId !== projectId);
  const removedLeadReminders = leadReminders.length - leadRemindersRemaining.length;

  const paymentRemindersRemaining = paymentReminders.filter((record) => record.projectId !== projectId);
  const removedPaymentReminders = paymentReminders.length - paymentRemindersRemaining.length;

  const portalsRemaining = portals.filter((portal) => portal.projectId !== projectId);
  const removedPortal = portals.length !== portalsRemaining.length;

  let updatedSchedulesCount = 0;
  const updatedSchedules = schedules.map((schedule) => {
    if (!schedule.projectIds?.includes(projectId)) {
      return schedule;
    }
    updatedSchedulesCount += 1;
    const remainingIds = schedule.projectIds.filter((id) => id !== projectId);
    const nextSchedule: ReportScheduleRecord = {
      ...schedule,
      projectIds: remainingIds,
      updatedAt: now,
    };
    if (!remainingIds.length) {
      nextSchedule.enabled = false;
      nextSchedule.nextRunAt = null;
    }
    return nextSchedule;
  });

  const reportPartition = reports.reduce<{
    kept: ReportRecord[];
    removed: ReportRecord[];
  }>(
    (acc, record) => {
      const matchesProject =
        record.projectId === projectId ||
        (Array.isArray(record.projectIds) && record.projectIds.includes(projectId));
      if (matchesProject) {
        acc.removed.push(record);
      } else {
        acc.kept.push(record);
      }
      return acc;
    },
    { kept: [], removed: [] },
  );

  const nextProjects = [...projects];
  nextProjects.splice(index, 1);

  const storageUpdates: Promise<unknown>[] = [saveProjects(env, nextProjects)];
  if (account) {
    storageUpdates.push(saveMetaAccountLinks(env, updatedAccounts));
  }
  if (group) {
    storageUpdates.push(saveTelegramGroupLinks(env, updatedGroups));
  }
  if (removedPayments > 0) {
    storageUpdates.push(savePayments(env, paymentsRemaining));
  }
  if (removedLeadReminders > 0) {
    storageUpdates.push(saveLeadReminders(env, leadRemindersRemaining));
  }
  if (removedPaymentReminders > 0) {
    storageUpdates.push(savePaymentReminders(env, paymentRemindersRemaining));
  }
  if (updatedSchedulesCount > 0) {
    storageUpdates.push(saveReportSchedules(env, updatedSchedules));
  }
  if (reportPartition.removed.length > 0) {
    storageUpdates.push(saveReports(env, reportPartition.kept));
  }
  if (removedPortal) {
    storageUpdates.push(savePortals(env, portalsRemaining));
  }

  await Promise.all(storageUpdates);

  const cleanupTasks: Promise<void>[] = [
    deleteLeads(env, projectId).catch((error) => {
      console.warn("Failed to delete project leads", projectId, error);
    }),
  ];

  if (reportPartition.removed.length > 0) {
    cleanupTasks.push(
      Promise.all(
        reportPartition.removed.map((record) =>
          deleteReportAsset(env, record.id).catch((error) => {
            console.warn("Failed to delete report asset", record.id, error);
          }),
        ),
      ).then(() => undefined),
    );
  }

  await Promise.all(cleanupTasks);

  return {
    project,
    metaAccount: account ?? null,
    telegramGroup: group ?? null,
    removedLeads: leads.length,
    removedPayments,
    removedReports: reportPartition.removed.length,
    clearedLeadReminders: removedLeadReminders,
    clearedPaymentReminders: removedPaymentReminders,
    updatedSchedules: updatedSchedulesCount,
    portalRemoved: removedPortal,
  } satisfies ProjectDeletionSummary;
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

const pendingProjectEditKey = (userId: string): string => `${PROJECT_PENDING_PREFIX}${userId}`;

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

export const loadPendingProjectEditOperation = async (
  env: EnvBindings,
  userId: string,
): Promise<PendingProjectEditOperation | null> => {
  const stored = await env.DB.get(pendingProjectEditKey(userId));
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored) as PendingProjectEditOperation;
  } catch (error) {
    console.error("Failed to parse pending project edit", error);
    return null;
  }
};

export const savePendingProjectEditOperation = async (
  env: EnvBindings,
  userId: string,
  operation: PendingProjectEditOperation,
  ttlSeconds = 900,
): Promise<void> => {
  const payload = { ...operation, updatedAt: new Date().toISOString() } satisfies PendingProjectEditOperation;
  await env.DB.put(pendingProjectEditKey(userId), JSON.stringify(payload), {
    expirationTtl: Math.max(60, ttlSeconds),
  });
};

export const clearPendingProjectEditOperation = async (
  env: EnvBindings,
  userId: string,
): Promise<void> => {
  await env.DB.delete(pendingProjectEditKey(userId));
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

const pendingPortalKey = (userId: string): string => `${PORTAL_PENDING_PREFIX}${userId}`;

export const loadPendingPortalOperation = async (
  env: EnvBindings,
  userId: string,
): Promise<PendingPortalOperation | null> => {
  const stored = await env.DB.get(pendingPortalKey(userId));
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored) as PendingPortalOperation;
  } catch (error) {
    console.error("Failed to parse pending portal operation", error);
    return null;
  }
};

export const savePendingPortalOperation = async (
  env: EnvBindings,
  userId: string,
  operation: PendingPortalOperation,
  ttlSeconds = 900,
): Promise<void> => {
  const payload = { ...operation, updatedAt: new Date().toISOString() } satisfies PendingPortalOperation;
  await env.DB.put(pendingPortalKey(userId), JSON.stringify(payload), {
    expirationTtl: Math.max(60, ttlSeconds),
  });
};

export const clearPendingPortalOperation = async (
  env: EnvBindings,
  userId: string,
): Promise<void> => {
  await env.DB.delete(pendingPortalKey(userId));
};

const pendingCampaignKey = (userId: string): string => `${CAMPAIGN_PENDING_PREFIX}${userId}`;

export const loadPendingCampaignSelection = async (
  env: EnvBindings,
  userId: string,
): Promise<PendingCampaignSelectionRecord | null> => {
  const stored = await env.DB.get(pendingCampaignKey(userId));
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored) as PendingCampaignSelectionRecord;
  } catch (error) {
    console.error("Failed to parse campaign selection", error);
    return null;
  }
};

export const savePendingCampaignSelection = async (
  env: EnvBindings,
  userId: string,
  payload: PendingCampaignSelectionRecord,
  ttlSeconds = 900,
): Promise<void> => {
  const record = { ...payload, updatedAt: new Date().toISOString() } satisfies PendingCampaignSelectionRecord;
  await env.DB.put(pendingCampaignKey(userId), JSON.stringify(record), {
    expirationTtl: Math.max(60, ttlSeconds),
  });
};

export const clearPendingCampaignSelection = async (
  env: EnvBindings,
  userId: string,
): Promise<void> => {
  await env.DB.delete(pendingCampaignKey(userId));
};
