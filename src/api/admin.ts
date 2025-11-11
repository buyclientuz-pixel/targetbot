import { jsonResponse, unauthorized, notFound, badRequest } from "../utils/http";
import { loadMetaStatus, STATUS_CACHE_KEY, clearMetaStatusCache } from "./meta";
import { fetchAdAccounts } from "../fb/accounts";
import { getFacebookTokenStatus, checkAndRefreshFacebookToken } from "../fb/auth";
import {
  loadProjectCards,
  writeProjectConfig,
  readProjectConfig,
  writeBillingInfo,
  readBillingInfo,
  writeAlertsConfig,
  readAlertsConfig,
  findProjectForAccount,
  listProjectsWithoutAccount,
  hasProjectChat,
} from "../utils/projects";
import {
  readJsonFromR2,
  listR2Keys,
  countFallbackEntries,
  appendLogEntry,
  deleteFromR2,
  deletePrefixFromR2,
  clearFallbackEntries,
  readCronStatus,
  writeJsonToR2,
  writeFallbackRecord,
} from "../utils/r2";
import { formatCurrency, metaAccountStatusIcon } from "../utils/format";
import { resolveAccountSpend, buildChatLabel } from "../utils/accounts";
import {
  AdminDashboardData,
  MetaAccountInfo,
  DashboardLogEntry,
  TokenStatus,
  StorageOverview,
  ProjectConfigRecord,
  ProjectCard,
  ProjectReport,
  ProjectAlertsConfig,
  BillingInfo,
  MetaTokenStatus,
  WorkerEnv,
  CronStatusMap,
} from "../types";
import { renderAdminPage } from "../views/admin";
import { refreshAllProjects } from "./projects";
import { getTelegramWebhookStatus } from "./manage";

const LOG_KEYS = ((): string[] => {
  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const format = (date: Date) => date.toISOString().slice(0, 10);
  return ["logs/" + format(today) + ".json", "logs/" + format(yesterday) + ".json"];
})();

const loadLogs = async (env: unknown): Promise<DashboardLogEntry[]> => {
  const logs: DashboardLogEntry[] = [];
  for (const key of LOG_KEYS) {
    const file = await readJsonFromR2<DashboardLogEntry[]>(env as any, key);
    if (Array.isArray(file)) {
      logs.push(...file);
    }
  }
  return logs.sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
};

const countDistinctRecords = (keys: string[], prefix: string): number => {
  const seen = new Set<string>();
  for (const key of keys) {
    if (!key.startsWith(prefix) || !key.endsWith(".json")) {
      continue;
    }
    const trimmed = key.slice(prefix.length).replace(/\.json$/, "");
    if (!trimmed || trimmed.includes("/")) {
      continue;
    }
    if (trimmed === "index" || trimmed === "projects") {
      continue;
    }
    seen.add(trimmed);
  }
  return seen.size;
};

const loadStorageOverview = async (env: unknown): Promise<StorageOverview> => {
  const [reportKeys, projectKeys, billingKeys, alertKeys, fallbackCount] = await Promise.all([
    listR2Keys(env as any, "reports/"),
    listR2Keys(env as any, "projects/"),
    listR2Keys(env as any, "billing/"),
    listR2Keys(env as any, "alerts/"),
    countFallbackEntries(env as any),
  ]);

  return {
    reports: countDistinctRecords(reportKeys, "reports/"),
    projects: countDistinctRecords(projectKeys, "projects/"),
    billing: countDistinctRecords(billingKeys, "billing/"),
    alerts: countDistinctRecords(alertKeys, "alerts/"),
    kvFallbacks: fallbackCount,
  };
};


const ADMIN_KEY_ENV = "ADMIN_KEY";

const extractAdminKey = (request: Request): string | null => {
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      return token;
    }
  }
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  return key && key.trim() ? key.trim() : null;
};

const verifyKey = (request: Request, env: Record<string, unknown>): boolean => {
  const configured = String(env[ADMIN_KEY_ENV] || "");
  if (!configured) {
    return true;
  }
  const provided = extractAdminKey(request);
  return provided === configured;
};

const requireAdminKey = (
  request: Request,
  env: Record<string, unknown>,
): Response | null => {
  if (verifyKey(request, env)) {
    return null;
  }
  return unauthorized("Invalid admin key");
};

const hasString = (value: unknown): boolean => typeof value === "string" && value.trim().length > 0;

const collectTokenStatus = (env: Record<string, unknown>): TokenStatus[] => {
  const telegramConfigured =
    hasString(env.BOT_TOKEN) || hasString(env.TELEGRAM_BOT_TOKEN) || hasString(env.TG_API_TOKEN);
  const metaTokenConfigured = hasString(env.META_LONG_TOKEN) || hasString(env.META_ACCESS_TOKEN);
  const manageTokenConfigured = hasString(env.META_MANAGE_TOKEN);
  const adminKeyConfigured = hasString(env.ADMIN_KEY);
  const r2Configured = Boolean(env.REPORTS_BUCKET || env.R2_BUCKET || env.BOT_BUCKET || env.STORAGE_BUCKET);

  return [
    { name: "Telegram Bot Token", configured: telegramConfigured, hint: "BOT_TOKEN" },
    { name: "Meta Access Token", configured: metaTokenConfigured, hint: "META_LONG_TOKEN" },
    { name: "Meta Manage Token", configured: manageTokenConfigured, hint: "META_MANAGE_TOKEN" },
    { name: "Admin Key", configured: adminKeyConfigured, hint: "ADMIN_KEY" },
    { name: "R2 Bucket", configured: r2Configured, hint: "R2_BUCKET" },
  ];
};

const readJsonBody = async (request: Request): Promise<any> => {
  const text = await request.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
};

const coerceString = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const coerceNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const sanitizeProjectPatch = (input: any): Partial<ProjectConfigRecord> => {
  const patch: Partial<ProjectConfigRecord> = {};
  const name = coerceString(input?.name);
  if (name !== null) {
    patch.name = name;
  }
  if ("chat_id" in input) {
    if (input.chat_id === null) {
      patch.chat_id = null;
    } else if (typeof input.chat_id === "string" || typeof input.chat_id === "number") {
      patch.chat_id = input.chat_id;
    }
  }
  const chatUsername = coerceString(input?.chat_username);
  if (chatUsername !== null) {
    patch.chat_username = chatUsername;
  }
  if ("chat_username" in input && chatUsername === null && input.chat_username === null) {
    patch.chat_username = null;
  }
  const chatLink = coerceString(input?.chat_link);
  if (chatLink !== null) {
    patch.chat_link = chatLink;
  }
  if ("chat_link" in input && chatLink === null && input.chat_link === null) {
    patch.chat_link = null;
  }
  const accountId = coerceString(input?.account_id);
  if (accountId !== null) {
    patch.account_id = accountId;
  }
  if ("account_id" in input && accountId === null && input.account_id === null) {
    patch.account_id = null;
  }
  const accountName = coerceString(input?.account_name);
  if (accountName !== null) {
    patch.account_name = accountName;
  }
  if ("account_name" in input && accountName === null && input.account_name === null) {
    patch.account_name = null;
  }
  const billingDay = coerceNumber(input?.billing_day);
  if (billingDay !== null) {
    patch.billing_day = billingDay;
  }
  if ("billing_day" in input && billingDay === null && input.billing_day === null) {
    patch.billing_day = null;
  }
  const status = coerceString(input?.status);
  if (status !== null) {
    patch.status = status;
  }
  if ("status" in input && status === null && input.status === null) {
    patch.status = null;
  }
  if (typeof input?.alerts_enabled === "boolean") {
    patch.alerts_enabled = input.alerts_enabled;
  }
  if (typeof input?.silent_weekends === "boolean") {
    patch.silent_weekends = input.silent_weekends;
  }
  const manager = coerceString(input?.manager);
  if (manager !== null) {
    patch.manager = manager;
  }
  if ("manager" in input && manager === null && input.manager === null) {
    patch.manager = null;
  }
  const portalUrl = coerceString(input?.portal_url);
  if (portalUrl !== null) {
    patch.portal_url = portalUrl;
  }
  if ("portal_url" in input && portalUrl === null && input.portal_url === null) {
    patch.portal_url = null;
  }
  const lastSync = coerceString(input?.last_sync);
  if (lastSync !== null) {
    patch.last_sync = lastSync;
  }
  if ("last_sync" in input && lastSync === null && input.last_sync === null) {
    patch.last_sync = null;
  }
  return patch;
};

const sanitizeBillingPatch = (input: any): BillingInfo => {
  const patch: BillingInfo = {};
  const amount = coerceNumber(input?.amount);
  if (amount !== null) {
    patch.amount = amount;
  }
  if ("amount" in input && amount === null && input.amount === null) {
    patch.amount = null;
  }
  const spendLimit = coerceNumber(input?.spend_limit);
  if (spendLimit !== null) {
    patch.spend_limit = spendLimit;
  }
  if ("spend_limit" in input && spendLimit === null && input.spend_limit === null) {
    patch.spend_limit = null;
  }
  const daysToPay = coerceNumber(input?.days_to_pay);
  if (daysToPay !== null) {
    patch.days_to_pay = daysToPay;
  }
  if ("days_to_pay" in input && daysToPay === null && input.days_to_pay === null) {
    patch.days_to_pay = null;
  }
  const currency = coerceString(input?.currency);
  if (currency !== null) {
    patch.currency = currency;
  }
  if ("currency" in input && currency === null && input.currency === null) {
    patch.currency = null;
  }
  const nextPayment = coerceString(input?.next_payment);
  if (nextPayment !== null) {
    patch.next_payment = nextPayment;
  }
  if ("next_payment" in input && nextPayment === null && input.next_payment === null) {
    patch.next_payment = null;
  }
  const nextPaymentDate = coerceString(input?.next_payment_date);
  if (nextPaymentDate !== null) {
    patch.next_payment_date = nextPaymentDate;
  }
  if ("next_payment_date" in input && nextPaymentDate === null && input.next_payment_date === null) {
    patch.next_payment_date = null;
  }
  const lastPayment = coerceString(input?.last_payment);
  if (lastPayment !== null) {
    patch.last_payment = lastPayment;
  }
  if ("last_payment" in input && lastPayment === null && input.last_payment === null) {
    patch.last_payment = null;
  }
  const cardLast4 = coerceString(input?.card_last4);
  if (cardLast4 !== null) {
    patch.card_last4 = cardLast4;
  }
  if ("card_last4" in input && cardLast4 === null && input.card_last4 === null) {
    patch.card_last4 = null;
  }
  const status = coerceString(input?.status);
  if (status !== null) {
    patch.status = status;
  }
  if ("status" in input && status === null && input.status === null) {
    patch.status = null;
  }
  return patch;
};

const sanitizeAlertsPatch = (input: any): ProjectAlertsConfig => {
  const patch: ProjectAlertsConfig = {};
  const chatId = coerceString(input?.chat_id);
  if (chatId !== null) {
    patch.chat_id = chatId;
  }
  if ("chat_id" in input && chatId === null && input.chat_id === null) {
    patch.chat_id = null;
  }
  const adminChatId = coerceString(input?.admin_chat_id);
  if (adminChatId !== null) {
    patch.admin_chat_id = adminChatId;
  }
  if ("admin_chat_id" in input && adminChatId === null && input.admin_chat_id === null) {
    patch.admin_chat_id = null;
  }
  const cpaThreshold = coerceNumber(input?.cpa_threshold);
  if (cpaThreshold !== null) {
    patch.cpa_threshold = cpaThreshold;
  }
  if ("cpa_threshold" in input && cpaThreshold === null && input.cpa_threshold === null) {
    patch.cpa_threshold = null;
  }
  const spendLimit = coerceNumber(input?.spend_limit);
  if (spendLimit !== null) {
    patch.spend_limit = spendLimit;
  }
  if ("spend_limit" in input && spendLimit === null && input.spend_limit === null) {
    patch.spend_limit = null;
  }
  const moderationHours = coerceNumber(input?.moderation_hours);
  if (moderationHours !== null) {
    patch.moderation_hours = moderationHours;
  }
  if ("moderation_hours" in input && moderationHours === null && input.moderation_hours === null) {
    patch.moderation_hours = null;
  }
  const threadId = coerceNumber(input?.message_thread_id);
  if (threadId !== null) {
    patch.message_thread_id = threadId;
  }
  if ("message_thread_id" in input && threadId === null && input.message_thread_id === null) {
    patch.message_thread_id = null;
  }
  return patch;
};

const ensureProjectIdParam = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Project ID is required");
  }
  return trimmed;
};

const logAdminAction = async (env: unknown, message: string): Promise<void> => {
  await appendLogEntry(env as any, {
    level: "info",
    message,
    timestamp: new Date().toISOString(),
  });
};

export const handleAdminPage = async (request: Request, env: Record<string, unknown>): Promise<Response> => {
  const error = requireAdminKey(request, env);
  if (error) {
    return error;
  }

  const [metaStatus, tokenStatus, accounts, projects, logs, storage] = await Promise.all([
    loadMetaStatus(env, { useCache: true }).catch((error) => ({
      ok: false,
      issues: [(error as Error).message],
    })),
    getFacebookTokenStatus(env as WorkerEnv).catch((error) => ({
      ok: false,
      status: "invalid",
      valid: false,
      issues: [(error as Error).message],
      token_snippet: null,
      account_id: null,
      account_name: null,
      refreshed_at: null,
    }) as MetaTokenStatus),
    fetchAdAccounts(env),
    loadProjectCards(env),
    loadLogs(env),
    loadStorageOverview(env),
  ]);

  const dashboard: AdminDashboardData = {
    meta_status: metaStatus as any,
    meta_token: tokenStatus,
    accounts,
    projects,
    logs,
    tokens: collectTokenStatus(env),
    storage,
  };

  const html = renderAdminPage(dashboard);
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};

export const handleAdminProjects = async (env: unknown): Promise<Response> => {
  const projects = await loadProjectCards(env);
  return jsonResponse({ projects });
};

export const handleRefreshAllRequest = async (env: unknown): Promise<Response> => {
  const result = await refreshAllProjects(env);
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/admin",
      "x-refreshed-projects": result.refreshed.join(","),
    },
  });
};

const loadProjectReport = async (env: unknown, projectId: string): Promise<ProjectReport | null> => {
  return readJsonFromR2<ProjectReport>(env as any, "reports/" + projectId + ".json");
};

export const handleAdminProjectsApi = async (
  request: Request,
  env: Record<string, unknown>,
): Promise<Response> => {
  const error = requireAdminKey(request, env);
  if (error) {
    return error;
  }

  const projects = await loadProjectCards(env);
  return jsonResponse({ projects });
};

export const handleAdminAccountsApi = async (
  request: Request,
  env: Record<string, unknown>,
): Promise<Response> => {
  const error = requireAdminKey(request, env);
  if (error) {
    return error;
  }

  const [projects, accounts] = await Promise.all([loadProjectCards(env), fetchAdAccounts(env)]);

  const accountPayloads = await Promise.all(
    accounts.map(async (account) => {
      const project = findProjectForAccount(projects, account.id);
      const spendInfo = await resolveAccountSpend(env, project);
      const hasChat = project ? hasProjectChat(project) : false;
      const formattedSpend =
        spendInfo && spendInfo.value !== null
          ? formatCurrency(spendInfo.value, spendInfo.currency)
          : "—";

      return {
        id: account.id,
        name: account.name,
        status: account.status || null,
        status_icon: metaAccountStatusIcon(account.status),
        currency: spendInfo ? spendInfo.currency : account.currency || "USD",
        spend_value: spendInfo ? spendInfo.value : null,
        spend_label: spendInfo ? spendInfo.label : null,
        spend_formatted: formattedSpend,
        balance: account.balance ?? null,
        spend_cap: account.spend_cap ?? null,
        payment_method: account.payment_method || null,
        last_update: account.last_update || null,
        project_id: project ? project.id : null,
        project_name: project ? project.name : null,
        project_chat: hasChat ? buildChatLabel(project) : null,
        chat_link: project?.chat_link || null,
        chat_username: project?.chat_username || null,
        chat_id: project?.chat_id ? String(project.chat_id) : null,
        has_chat: hasChat,
      };
    }),
  );

  const availableChats = listProjectsWithoutAccount(projects).map((project) => ({
    id: project.id,
    name: project.name,
    chat_label: buildChatLabel(project),
    chat_link: project.chat_link || null,
    chat_username: project.chat_username || null,
    chat_id: project.chat_id ? String(project.chat_id) : null,
  }));

  return jsonResponse({
    accounts: accountPayloads,
    available_chats: availableChats,
    updated_at: new Date().toISOString(),
  });
};

export const handleAdminAccountLink = async (
  request: Request,
  env: Record<string, unknown>,
  accountIdParam: string,
): Promise<Response> => {
  const error = requireAdminKey(request, env);
  if (error) {
    return error;
  }

  const accountIdValue = coerceString(accountIdParam);
  if (!accountIdValue) {
    return badRequest("Account id is required");
  }

  const payload = await readJsonBody(request);
  if (payload === null) {
    return badRequest("Invalid JSON body");
  }

  const projectIdValue = coerceString(payload?.project_id);
  if (!projectIdValue) {
    return badRequest("Project id is required");
  }

  const [projects, accounts] = await Promise.all([loadProjectCards(env), fetchAdAccounts(env)]);
  const project = projects.find((item) => item.id === projectIdValue) || null;
  if (!project) {
    return notFound("Project not found");
  }

  const existing = findProjectForAccount(projects, accountIdValue);
  if (existing && existing.id !== project.id) {
    return badRequest("Account already linked to another project");
  }

  const account = accounts.find((item) => item.id === accountIdValue) || null;
  const accountName =
    coerceString(payload?.account_name) ||
    coerceString(payload?.name) ||
    (account && account.name ? account.name : null) ||
    accountIdValue;

  const patch: Partial<ProjectConfigRecord> = {
    account_id: accountIdValue,
    account_name: accountName,
  };

  const record = await writeProjectConfig(env, project.id, patch);
  if (!record) {
    return jsonResponse({ error: "Unable to persist project config" }, { status: 500 });
  }

  await logAdminAction(env, "Admin linked account " + accountIdValue + " to project " + project.id);

  if (!hasProjectChat(project)) {
    await appendLogEntry(env, {
      level: "warn",
      message: "Account " + accountIdValue + " linked to project " + project.id + " without chat binding",
      timestamp: new Date().toISOString(),
    });
  }

  return jsonResponse({ ok: true, project: record });
};

export const handleAdminProjectDetail = async (
  request: Request,
  env: Record<string, unknown>,
  projectId: string,
): Promise<Response> => {
  const error = requireAdminKey(request, env);
  if (error) {
    return error;
  }

  const [card, report, config, billing, alerts] = await Promise.all([
    loadProjectCards(env).then((projects) => projects.find((project) => project.id === projectId) || null),
    loadProjectReport(env, projectId),
    readProjectConfig(env, projectId),
    readBillingInfo(env, projectId),
    readAlertsConfig(env, projectId),
  ]);

  if (!card && !report && !config) {
    return notFound("Project not found");
  }

  return jsonResponse({
    id: projectId,
    card,
    report,
    config,
    billing,
    alerts,
  });
};

export const handleAdminProjectCreate = async (
  request: Request,
  env: Record<string, unknown>,
): Promise<Response> => {
  const error = requireAdminKey(request, env);
  if (error) {
    return error;
  }

  const payload = await readJsonBody(request);
  if (payload === null) {
    return badRequest("Invalid JSON body");
  }

  const projectIdValue = coerceString(payload?.id);
  if (!projectIdValue) {
    return badRequest("Project id is required");
  }

  const projectId = ensureProjectIdParam(projectIdValue);
  const patch = sanitizeProjectPatch(payload);
  if (!patch.name) {
    patch.name = projectId;
  }

  const record = await writeProjectConfig(env, projectId, patch);
  if (!record) {
    return jsonResponse({ error: "Unable to persist project config" }, { status: 500 });
  }

  await logAdminAction(env, "Admin saved project config for " + projectId);

  return jsonResponse({ ok: true, project: record });
};

export const handleAdminProjectUpdate = async (
  request: Request,
  env: Record<string, unknown>,
  projectIdParam: string,
): Promise<Response> => {
  const error = requireAdminKey(request, env);
  if (error) {
    return error;
  }

  const projectId = ensureProjectIdParam(projectIdParam);
  const payload = await readJsonBody(request);
  if (payload === null) {
    return badRequest("Invalid JSON body");
  }

  const patch = sanitizeProjectPatch(payload);
  const record = await writeProjectConfig(env, projectId, patch);
  if (!record) {
    return jsonResponse({ error: "Unable to persist project config" }, { status: 500 });
  }

  await logAdminAction(env, "Admin updated project config for " + projectId);

  return jsonResponse({ ok: true, project: record });
};

export const handleAdminProjectToggle = async (
  request: Request,
  env: Record<string, unknown>,
  projectIdParam: string,
): Promise<Response> => {
  const error = requireAdminKey(request, env);
  if (error) {
    return error;
  }

  const projectId = ensureProjectIdParam(projectIdParam);
  const payload = await readJsonBody(request);
  if (payload === null) {
    return badRequest("Invalid JSON body");
  }

  const field = typeof payload.field === "string" ? payload.field.trim() : "";
  if (field !== "alerts_enabled" && field !== "silent_weekends") {
    return badRequest("Unsupported toggle field");
  }

  const current = await readProjectConfig(env, projectId);
  const previous = current && typeof (current as any)[field] === "boolean" ? Boolean((current as any)[field]) : false;
  const nextValue = !previous;
  const patch: Partial<ProjectConfigRecord> = {};
  (patch as any)[field] = nextValue;

  const record = await writeProjectConfig(env, projectId, patch);
  if (!record) {
    return jsonResponse({ error: "Unable to persist project toggle" }, { status: 500 });
  }

  await logAdminAction(env, "Admin toggled " + field + " for " + projectId + " => " + String(nextValue));

  return jsonResponse({ ok: true, field, value: nextValue, project: record });
};

export const handleAdminProjectBillingUpdate = async (
  request: Request,
  env: Record<string, unknown>,
  projectIdParam: string,
): Promise<Response> => {
  const error = requireAdminKey(request, env);
  if (error) {
    return error;
  }

  const projectId = ensureProjectIdParam(projectIdParam);
  const payload = await readJsonBody(request);
  if (payload === null) {
    return badRequest("Invalid JSON body");
  }

  const patch = sanitizeBillingPatch(payload);
  const record = await writeBillingInfo(env, projectId, patch);
  if (!record) {
    return jsonResponse({ error: "Unable to persist billing info" }, { status: 500 });
  }

  await logAdminAction(env, "Admin updated billing info for " + projectId);

  return jsonResponse({ ok: true, billing: record });
};

export const handleAdminProjectAlertsUpdate = async (
  request: Request,
  env: Record<string, unknown>,
  projectIdParam: string,
): Promise<Response> => {
  const error = requireAdminKey(request, env);
  if (error) {
    return error;
  }

  const projectId = ensureProjectIdParam(projectIdParam);
  const payload = await readJsonBody(request);
  if (payload === null) {
    return badRequest("Invalid JSON body");
  }

  const patch = sanitizeAlertsPatch(payload);
  const record = await writeAlertsConfig(env, projectId, patch);
  if (!record) {
    return jsonResponse({ error: "Unable to persist alerts config" }, { status: 500 });
  }

  await logAdminAction(env, "Admin updated alerts config for " + projectId);

  return jsonResponse({ ok: true, alerts: record });
};

export const handleAdminLogsApi = async (
  request: Request,
  env: Record<string, unknown>,
): Promise<Response> => {
  const error = requireAdminKey(request, env);
  if (error) {
    return error;
  }

  const logs = await loadLogs(env);
  return jsonResponse({ logs });
};

export const handleAdminBillingApi = async (
  request: Request,
  env: Record<string, unknown>,
): Promise<Response> => {
  const error = requireAdminKey(request, env);
  if (error) {
    return error;
  }

  const projects = await loadProjectCards(env);
  const billing = projects
    .map((project) => ({
      id: project.id,
      name: project.name,
      billing: project.billing || null,
      billing_day: project.billing_day ?? null,
      status: project.status || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  return jsonResponse({ billing });
};

export const handleAdminSystemApi = async (
  request: Request,
  env: Record<string, unknown>,
): Promise<Response> => {
  const error = requireAdminKey(request, env);
  if (error) {
    return error;
  }

  const [metaStatus, tokenStatus, tokens, storage, webhook, cronStatus] = await Promise.all([
    loadMetaStatus(env, { useCache: true }).catch((err) => ({
      ok: false,
      issues: [(err as Error).message],
    })),
    getFacebookTokenStatus(env as WorkerEnv).catch((error) => ({
      ok: false,
      status: "invalid",
      valid: false,
      issues: [(error as Error).message],
      token_snippet: null,
      account_id: null,
      account_name: null,
      refreshed_at: null,
    }) as MetaTokenStatus),
    Promise.resolve(collectTokenStatus(env)),
    loadStorageOverview(env),
    getTelegramWebhookStatus(env as any).catch(() => null),
    readCronStatus(env as any).catch(() => ({} as CronStatusMap)),
  ]);

  return jsonResponse({
    meta: metaStatus,
    token: tokenStatus,
    tokens,
    storage,
    webhook,
    cron: cronStatus,
  });
};

export const handleAdminSystemAction = async (
  request: Request,
  env: Record<string, unknown>,
): Promise<Response> => {
  const error = requireAdminKey(request, env);
  if (error) {
    return error;
  }

  const payload = await readJsonBody(request);
  if (payload === null) {
    return badRequest("Invalid JSON body");
  }

  const action = coerceString(payload?.action);
  if (!action) {
    return badRequest("Action is required");
  }

  if (action === "refresh-all") {
    const result = await refreshAllProjects(env);
    await logAdminAction(
      env,
      "Admin triggered refresh-all for " + result.refreshed.length + " projects",
    );
    return jsonResponse({ ok: true, refreshed: result.refreshed });
  }

  if (action === "refresh-meta-token") {
    const outcome = await checkAndRefreshFacebookToken(env as WorkerEnv, { force: true, notify: true });
    const message =
      "Admin requested Meta token refresh => " +
      (outcome.refresh && outcome.refresh.ok ? "success" : "failure") +
      (outcome.refresh && outcome.refresh.message ? ": " + outcome.refresh.message : "");
    await logAdminAction(env, message);
    return jsonResponse(outcome);
  }

  if (action === "clear-meta-cache") {
    const cleared = await clearMetaStatusCache(env);
    if (cleared) {
      await logAdminAction(env, "Admin cleared Facebook status cache");
    }
    return jsonResponse({ ok: Boolean(cleared), key: STATUS_CACHE_KEY });
  }

  if (action === "clear-cache-prefix") {
    const prefix = coerceString(payload?.prefix) || "cache/";
    if (!prefix) {
      return badRequest("Prefix is required");
    }
    const removed = await deletePrefixFromR2(env as any, prefix);
    await logAdminAction(env, "Admin cleared cache prefix " + prefix + " => " + removed + " items");
    return jsonResponse({ ok: true, prefix, removed });
  }

  if (action === "clear-project-report") {
    const projectIdValue = coerceString(payload?.project_id);
    if (!projectIdValue) {
      return badRequest("Project ID is required");
    }
    const projectId = ensureProjectIdParam(projectIdValue);
    const key = "reports/" + projectId + ".json";
    const deleted = await deleteFromR2(env as any, key);
    if (deleted) {
      await logAdminAction(env, "Admin removed cached report for " + projectId);
    }
    return jsonResponse({ ok: Boolean(deleted), project: projectId, key });
  }

  if (action === "clear-fallbacks") {
    const removed = await clearFallbackEntries(env as any);
    if (removed !== null) {
      await logAdminAction(env, "Admin cleared fallback entries => " + removed);
      return jsonResponse({ ok: true, removed });
    }
    return jsonResponse({ ok: false, error: "Fallback storage not configured" }, { status: 503 });
  }

  if (action === "r2-load-test") {
    const iterationsInput = Number(payload?.iterations);
    const iterations = Number.isFinite(iterationsInput)
      ? Math.min(Math.max(Math.trunc(iterationsInput), 1), 25)
      : 5;
    const prefix = coerceString(payload?.prefix) || "reports/__loadtest";
    const seed = Math.random().toString(16).slice(2, 10);

    const writeDurations: number[] = [];
    const readDurations: number[] = [];
    let writeSuccess = 0;
    let readSuccess = 0;

    for (let index = 0; index < iterations; index += 1) {
      const key = `${prefix}/${seed}-${Date.now()}-${index}.json`;
      const payloadData = {
        iteration: index,
        timestamp: new Date().toISOString(),
        seed,
      };

      const startWrite = Date.now();
      const wrote = await writeJsonToR2(env as any, key, payloadData);
      writeDurations.push(Date.now() - startWrite);
      if (wrote) {
        writeSuccess += 1;
        const startRead = Date.now();
        const read = await readJsonFromR2(env as any, key);
        readDurations.push(Date.now() - startRead);
        if (read) {
          readSuccess += 1;
        }
      }

      await deleteFromR2(env as any, key);
    }

    const avg = (values: number[]): number | null => {
      if (!values.length) {
        return null;
      }
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };

    const summary = {
      iterations,
      writes: { ok: writeSuccess, avg_ms: avg(writeDurations) },
      reads: { ok: readSuccess, avg_ms: avg(readDurations) },
      prefix,
    };

    await logAdminAction(
      env,
      `Admin executed R2 load test: ${writeSuccess}/${iterations} writes, ${readSuccess}/${iterations} reads`,
    );

    return jsonResponse({ ok: true, summary });
  }

  if (action === "simulate-fallback") {
    const countInput = Number(payload?.count);
    const count = Number.isFinite(countInput) ? Math.min(Math.max(Math.trunc(countInput), 1), 20) : 3;
    const reason = coerceString(payload?.reason) || "manual_test";
    const prefix = coerceString(payload?.prefix) || "fallback-test";

    let success = 0;
    for (let index = 0; index < count; index += 1) {
      const key = `${prefix}/${Date.now()}-${index}`;
      const ok = await writeFallbackRecord(env as any, key, {
        reason,
        created_at: new Date().toISOString(),
        index,
      });
      if (ok) {
        success += 1;
      }
    }

    if (success === 0) {
      return jsonResponse(
        { ok: false, error: "Fallback storage not configured" },
        { status: 503 },
      );
    }

    await logAdminAction(env, `Admin simulated fallback writes => ${success}/${count}`);

    return jsonResponse({ ok: true, written: success, requested: count, reason, prefix });
  }

  if (action === "check-telegram-webhook") {
    const token = coerceString(payload?.token) || undefined;
    const status = await getTelegramWebhookStatus(env as any, token);
    return jsonResponse(status, { status: status.ok ? 200 : 502 });
  }

  return badRequest("Unsupported system action");
};
