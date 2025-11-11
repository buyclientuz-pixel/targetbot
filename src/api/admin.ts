import { jsonResponse, unauthorized } from "../utils/http";
import { loadMetaStatus } from "./meta";
import { callGraph } from "../fb/client";
import { loadProjectCards } from "../utils/projects";
import { readJsonFromR2 } from "../utils/r2";
import { AdminDashboardData, MetaAccountInfo, DashboardLogEntry, TokenStatus } from "../types";
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

const ADMIN_KEY_ENV = "ADMIN_KEY";

const verifyKey = (request: Request, env: Record<string, unknown>): boolean => {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const configured = String(env[ADMIN_KEY_ENV] || "");
  if (!configured) {
    return true;
  }
  return key === configured;
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
  if (!verifyKey(request, env)) {
    return unauthorized("Invalid admin key");
  }

  const [metaStatus, accounts, projects, logs] = await Promise.all([
    loadMetaStatus(env, { useCache: true }).catch((error) => ({
      ok: false,
      issues: [(error as Error).message],
    })),
    loadAccounts(env),
    loadProjectCards(env),
    loadLogs(env),
  ]);

  const dashboard: AdminDashboardData = {
    meta_status: metaStatus as any,
    accounts,
    projects,
    logs,
    tokens: collectTokenStatus(env),
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
