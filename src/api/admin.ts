import { jsonResponse, unauthorized, notFound } from "../utils/http";
import { loadMetaStatus } from "./meta";
import { callGraph } from "../fb/client";
import { loadProjectCards } from "../utils/projects";
import { readJsonFromR2, listR2Keys, countFallbackEntries } from "../utils/r2";
import {
  AdminDashboardData,
  MetaAccountInfo,
  DashboardLogEntry,
  TokenStatus,
  StorageOverview,
  ProjectConfigRecord,
  ProjectReport,
  ProjectAlertsConfig,
  BillingInfo,
} from "../types";
import { renderAdminPage } from "../views/admin";
import { refreshAllProjects } from "./projects";

const LOG_KEYS = ((): string[] => {
  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const format = (date: Date) => date.toISOString().slice(0, 10);
  return ["logs/" + format(today) + ".json", "logs/" + format(yesterday) + ".json"];
})();

const toAccountInfo = (account: any): MetaAccountInfo => {
  return {
    id: String(account.id || ""),
    name: String(account.name || "Без названия"),
    currency: String(account.currency || "USD"),
    spend_cap: account.spend_cap !== undefined ? Number(account.spend_cap) : null,
    balance: account.balance !== undefined ? Number(account.balance) : null,
    status: account.account_status ? String(account.account_status) : undefined,
    payment_method: account.funding_source_details ? account.funding_source_details.display_string : undefined,
    last_update: account.last_used_time || undefined,
    issues: account.disable_reason ? [String(account.disable_reason)] : undefined,
  };
};

const loadAccounts = async (env: unknown): Promise<MetaAccountInfo[]> => {
  try {
    const response = await callGraph(env as any, "me/adaccounts", {
      fields:
        "id,name,currency,account_status,balance,spend_cap,funding_source_details,last_used_time,disable_reason",
      limit: "50",
    });
    if (!response || !Array.isArray(response.data)) {
      return [];
    }
    return response.data.map(toAccountInfo);
  } catch (_error) {
    return [];
  }
};

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

export const handleAdminPage = async (request: Request, env: Record<string, unknown>): Promise<Response> => {
  const error = requireAdminKey(request, env);
  if (error) {
    return error;
  }

  const [metaStatus, accounts, projects, logs, storage] = await Promise.all([
    loadMetaStatus(env, { useCache: true }).catch((error) => ({
      ok: false,
      issues: [(error as Error).message],
    })),
    loadAccounts(env),
    loadProjectCards(env),
    loadLogs(env),
    loadStorageOverview(env),
  ]);

  const dashboard: AdminDashboardData = {
    meta_status: metaStatus as any,
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

const loadProjectConfig = async (
  env: unknown,
  projectId: string,
): Promise<ProjectConfigRecord | null> => {
  return readJsonFromR2<ProjectConfigRecord>(env as any, "projects/" + projectId + ".json");
};

const loadProjectBilling = async (env: unknown, projectId: string): Promise<BillingInfo | null> => {
  return readJsonFromR2<BillingInfo>(env as any, "billing/" + projectId + ".json");
};

const loadProjectAlerts = async (env: unknown, projectId: string): Promise<ProjectAlertsConfig | null> => {
  return readJsonFromR2<ProjectAlertsConfig>(env as any, "alerts/" + projectId + ".json");
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
    loadProjectConfig(env, projectId),
    loadProjectBilling(env, projectId),
    loadProjectAlerts(env, projectId),
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

  const [metaStatus, tokens, storage] = await Promise.all([
    loadMetaStatus(env, { useCache: true }).catch((err) => ({
      ok: false,
      issues: [(err as Error).message],
    })),
    Promise.resolve(collectTokenStatus(env)),
    loadStorageOverview(env),
  ]);

  return jsonResponse({
    meta: metaStatus,
    tokens,
    storage,
  });
};
