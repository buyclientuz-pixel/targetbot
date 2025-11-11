import {
  BillingInfo,
  ProjectAlertsConfig,
  ProjectCard,
  ProjectConfigRecord,
  ProjectReport,
} from "../types";
import { listR2Keys, readJsonFromR2, writeJsonToR2 } from "./r2";

const PROJECT_INDEX_KEYS = [
  "meta/projects/index.json",
  "meta/projects.json",
  "projects/index.json",
  "projects/projects.json",
];

const parseIndexEntry = (entry: any): Partial<ProjectConfigRecord> | null => {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  if (typeof entry.id !== "string") {
    return null;
  }
  const config: Partial<ProjectConfigRecord> = {
    id: entry.id,
    name: typeof entry.name === "string" ? entry.name : entry.id,
    chat_id: entry.chat_id ?? entry.chatId ?? null,
    chat_username: entry.chat_username ?? entry.chatUsername ?? null,
    chat_link: entry.chat_link ?? entry.chatLink ?? null,
    account_id: entry.account_id ?? entry.ad_account_id ?? entry.accountId ?? null,
    account_name: entry.account_name ?? entry.accountName ?? null,
    billing_day: entry.billing_day ?? entry.billingDay ?? null,
    status: entry.status ?? null,
    alerts_enabled: entry.alerts_enabled ?? entry.alertsEnabled ?? null,
    silent_weekends: entry.silent_weekends ?? entry.silentWeekends ?? null,
    last_sync: entry.last_sync ?? entry.lastSync ?? null,
    portal_url: entry.portal_url ?? entry.portalUrl ?? null,
    manager: entry.manager ?? null,
    kpi: entry.kpi || null,
    alerts: entry.alerts || null,
  };
  return config;
};

const applyConfigToCard = (card: ProjectCard, config: Partial<ProjectConfigRecord>): void => {
  const coalesce = <T,>(current: T | undefined, next: T | null | undefined): T | undefined =>
    next !== undefined && next !== null && next !== "" ? (next as T) : current;

  card.name = config.name && config.name.trim() ? config.name : card.name;
  card.chat_id = coalesce(card.chat_id, config.chat_id ? String(config.chat_id) : null);
  card.chat_username = coalesce(card.chat_username, config.chat_username);
  card.chat_link = coalesce(card.chat_link, config.chat_link);
  card.status = coalesce(card.status, config.status ?? undefined);
  card.billing_day = coalesce(card.billing_day, config.billing_day ?? undefined);
  card.account_id = coalesce(card.account_id, config.account_id ?? undefined);
  card.account_name = coalesce(card.account_name, config.account_name ?? undefined);
  card.alerts_enabled = coalesce(card.alerts_enabled ?? undefined, config.alerts_enabled ?? undefined);
  card.silent_weekends = coalesce(card.silent_weekends ?? undefined, config.silent_weekends ?? undefined);
  card.last_sync = coalesce(card.last_sync, config.last_sync ?? undefined);
  card.portal_url = coalesce(card.portal_url, config.portal_url ?? undefined);
  card.manager = coalesce(card.manager, config.manager ?? undefined);

  if (config.kpi && (!card.kpi || Object.keys(card.kpi).length === 0)) {
    card.kpi = config.kpi;
  }
  if (config.alerts && (!card.alerts || Object.keys(card.alerts).length === 0)) {
    card.alerts = config.alerts;
  }
};

const applyReportToCard = (card: ProjectCard, report: ProjectReport): void => {
  card.name = report.project_name || card.name;
  card.currency = report.currency || card.currency;
  card.summary = report.summary || card.summary || null;
  card.updated_at = report.updated_at || card.updated_at;
  card.status = report.status || card.status;
  if (report.chat_link) {
    card.chat_link = report.chat_link;
  }
  if (report.billing) {
    card.billing = { ...(card.billing || {}), ...report.billing } as BillingInfo;
  }
  if (report.kpi) {
    card.kpi = card.kpi ? { ...report.kpi, ...card.kpi } : report.kpi;
  }
  if (report.alerts) {
    card.alerts = card.alerts ? { ...report.alerts, ...card.alerts } : report.alerts;
  }
  if (report.portal_url && !card.portal_url) {
    card.portal_url = report.portal_url;
  }
};

const applyBillingToCard = (card: ProjectCard, billing: BillingInfo): void => {
  card.billing = { ...(card.billing || {}), ...billing };
};

const applyAlertsToCard = (card: ProjectCard, alerts: ProjectAlertsConfig): void => {
  card.alerts = { ...(card.alerts || {}), ...alerts };
};

export const resolvePortalUrl = (
  env: unknown,
  projectId: string,
  current?: string | null,
): string | null => {
  if (current && current.trim()) {
    return current;
  }
  const runtime = env as Record<string, unknown>;
  const base = typeof runtime.WORKER_URL === "string" ? runtime.WORKER_URL.trim() : "";
  if (!base) {
    return "/portal/" + projectId;
  }
  const normalized = base.endsWith("/") ? base.slice(0, -1) : base;
  return normalized + "/portal/" + projectId;
};

const ensureCard = (map: Map<string, ProjectCard>, projectId: string): ProjectCard => {
  if (!map.has(projectId)) {
    map.set(projectId, {
      id: projectId,
      name: projectId,
      chat_link: null,
      summary: null,
    });
  }
  return map.get(projectId)!;
};

const loadConfigsFromIndex = async (
  env: unknown,
  map: Map<string, ProjectCard>,
): Promise<void> => {
  for (const key of PROJECT_INDEX_KEYS) {
    const data = await readJsonFromR2<any>(env as any, key);
    const entries = Array.isArray(data) ? data : Array.isArray(data?.projects) ? data.projects : null;
    if (!entries || entries.length === 0) {
      continue;
    }
    for (const entry of entries) {
      const config = parseIndexEntry(entry);
      if (!config) {
        continue;
      }
      const card = ensureCard(map, config.id);
      applyConfigToCard(card, config);
    }
  }
};

const loadConfigsFromFiles = async (
  env: unknown,
  map: Map<string, ProjectCard>,
  ids: Set<string>,
): Promise<void> => {
  for (const projectId of ids) {
    const config = await readJsonFromR2<ProjectConfigRecord>(env as any, "projects/" + projectId + ".json");
    if (!config) {
      continue;
    }
    const card = ensureCard(map, projectId);
    applyConfigToCard(card, config);
  }
};

const collectProjectIds = async (env: unknown): Promise<Set<string>> => {
  const ids = new Set<string>();
  const prefixes = ["projects/", "reports/", "billing/", "alerts/"];
  for (const prefix of prefixes) {
    const keys = await listR2Keys(env as any, prefix);
    for (const key of keys) {
      if (!key.endsWith(".json")) {
        continue;
      }
      const relative = key.replace(prefix, "");
      const id = relative.replace(/\.json$/, "");
      if (id) {
        ids.add(id);
      }
    }
  }
  return ids;
};

export const loadProjectCards = async (env: unknown): Promise<ProjectCard[]> => {
  const map = new Map<string, ProjectCard>();

  await loadConfigsFromIndex(env, map);

  const ids = await collectProjectIds(env);
  if (ids.size === 0 && map.size > 0) {
    map.forEach((card, id) => ids.add(id));
  }

  await loadConfigsFromFiles(env, map, ids);

  for (const projectId of ids) {
    const card = ensureCard(map, projectId);
    const report = await readJsonFromR2<ProjectReport>(env as any, "reports/" + projectId + ".json");
    if (report) {
      applyReportToCard(card, report);
    }
    const billing = await readJsonFromR2<BillingInfo>(env as any, "billing/" + projectId + ".json");
    if (billing) {
      applyBillingToCard(card, billing);
    }
    const alerts = await readJsonFromR2<ProjectAlertsConfig>(env as any, "alerts/" + projectId + ".json");
    if (alerts) {
      applyAlertsToCard(card, alerts);
    }
    if (!card.chat_link && card.chat_username) {
      card.chat_link = "https://t.me/" + card.chat_username.replace(/^@/, "");
    }
    card.portal_url = resolvePortalUrl(env, projectId, card.portal_url);
  }

  const cards = Array.from(map.values());
  return cards.sort((a, b) => a.name.localeCompare(b.name, "ru"));
};

export const hasProjectChat = (project: ProjectCard): boolean => {
  if (!project) {
    return false;
  }
  if (project.chat_link && project.chat_link.trim()) {
    return true;
  }
  if (project.chat_username && project.chat_username.trim()) {
    return true;
  }
  if (project.chat_id !== null && project.chat_id !== undefined && String(project.chat_id).trim()) {
    return true;
  }
  return false;
};

export const findProjectForAccount = (
  projects: ProjectCard[],
  accountId: string | null | undefined,
): ProjectCard | null => {
  if (!accountId) {
    return null;
  }
  const normalized = String(accountId).trim();
  if (!normalized) {
    return null;
  }
  return (
    projects.find((project) => {
      if (!project.account_id) {
        return false;
      }
      return String(project.account_id).trim() === normalized;
    }) || null
  );
};

export const listProjectsWithoutAccount = (projects: ProjectCard[]): ProjectCard[] => {
  return projects.filter((project) => {
    if (!hasProjectChat(project)) {
      return false;
    }
    if (project.account_id && String(project.account_id).trim()) {
      return false;
    }
    return true;
  });
};

export const findProjectCard = async (env: unknown, projectId: string): Promise<ProjectCard | null> => {
  const projects = await loadProjectCards(env);
  return projects.find((project) => project.id === projectId) || null;
};

const PROJECT_CONFIG_PREFIX = "projects/";
const BILLING_PREFIX = "billing/";
const ALERTS_PREFIX = "alerts/";

const ensureProjectId = (projectId: string): string => {
  const id = projectId.trim();
  if (!id) {
    throw new Error("Project ID is required");
  }
  return id;
};

export const readProjectConfig = async (
  env: unknown,
  projectId: string,
): Promise<ProjectConfigRecord | null> => {
  return readJsonFromR2<ProjectConfigRecord>(env as any, PROJECT_CONFIG_PREFIX + ensureProjectId(projectId) + ".json");
};

export const writeProjectConfig = async (
  env: unknown,
  projectId: string,
  patch: Partial<ProjectConfigRecord>,
): Promise<ProjectConfigRecord | null> => {
  const id = ensureProjectId(projectId);
  const existing = await readProjectConfig(env, id);
  const base: ProjectConfigRecord = existing
    ? { ...existing }
    : {
        id,
        name: id,
      };

  const next: ProjectConfigRecord = {
    ...base,
    ...patch,
    id,
    name: patch.name && patch.name.trim() ? patch.name : base.name || id,
  };

  if (patch.kpi) {
    next.kpi = { ...(base.kpi || {}), ...patch.kpi };
  }

  if (patch.alerts) {
    next.alerts = { ...(base.alerts || {}), ...patch.alerts };
  }

  const success = await writeJsonToR2(env as any, PROJECT_CONFIG_PREFIX + id + ".json", next);
  return success ? next : null;
};

export const readBillingInfo = async (
  env: unknown,
  projectId: string,
): Promise<BillingInfo | null> => {
  return readJsonFromR2<BillingInfo>(env as any, BILLING_PREFIX + ensureProjectId(projectId) + ".json");
};

export const writeBillingInfo = async (
  env: unknown,
  projectId: string,
  patch: BillingInfo,
): Promise<BillingInfo | null> => {
  const id = ensureProjectId(projectId);
  const existing = await readBillingInfo(env, id);
  const next: BillingInfo = { ...(existing || {}), ...patch };
  const success = await writeJsonToR2(env as any, BILLING_PREFIX + id + ".json", next);
  return success ? next : null;
};

export const readAlertsConfig = async (
  env: unknown,
  projectId: string,
): Promise<ProjectAlertsConfig | null> => {
  return readJsonFromR2<ProjectAlertsConfig>(env as any, ALERTS_PREFIX + ensureProjectId(projectId) + ".json");
};

export const writeAlertsConfig = async (
  env: unknown,
  projectId: string,
  patch: ProjectAlertsConfig,
): Promise<ProjectAlertsConfig | null> => {
  const id = ensureProjectId(projectId);
  const existing = await readAlertsConfig(env, id);
  const next: ProjectAlertsConfig = { ...(existing || {}), ...patch };
  const success = await writeJsonToR2(env as any, ALERTS_PREFIX + id + ".json", next);
  return success ? next : null;
};
