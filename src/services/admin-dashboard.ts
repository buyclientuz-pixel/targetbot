import { KV_PREFIXES } from "../config/kv";
import type { KvClient } from "../infra/kv";
import type { R2Client } from "../infra/r2";
import { loadProjectBundle, type ProjectBundle } from "../bot/data";
import { getOccupiedChatRecord } from "../domain/project-chats";
import { getProject } from "../domain/projects";
import { getProjectsByUser, type ProjectsByUserRecord } from "../domain/spec/projects-by-user";
import { getUserSettingsRecord } from "../domain/spec/user-settings";
import { getFbAuthRecord, type FbAuthRecord } from "../domain/spec/fb-auth";
import { getProjectLeadsList } from "../domain/spec/project-leads";
import { getPaymentsHistoryDocument } from "../domain/spec/payments-history";
import { ensureProjectSettings } from "../domain/project-settings";
import { getPortalSyncState, type PortalSyncState } from "../domain/portal-sync";

const stripPrefix = (key: string, prefix: string): string =>
  key.startsWith(prefix) ? key.slice(prefix.length) : key;

const listKeys = async (kv: KvClient, prefix: string): Promise<string[]> => {
  const collected: string[] = [];
  let cursor: string | undefined;
  do {
    const { keys, cursor: nextCursor } = await kv.list(prefix, { cursor });
    collected.push(...keys);
    cursor = nextCursor;
  } while (cursor);
  return collected;
};

const loadAllProjectBundles = async (kv: KvClient, r2: R2Client): Promise<ProjectBundle[]> => {
  const keys = await listKeys(kv, KV_PREFIXES.projects);
  if (keys.length === 0) {
    return [];
  }
  const bundles = await Promise.all(
    keys.map(async (key) => {
      const projectId = stripPrefix(key, KV_PREFIXES.projects);
      try {
        return await loadProjectBundle(kv, r2, projectId);
      } catch {
        return null;
      }
    }),
  );
  return bundles.filter((bundle): bundle is ProjectBundle => bundle != null);
};

export interface AdminProjectSummary {
  id: string;
  name: string;
  ownerId: number;
  adAccountId: string | null;
  chatId: number | null;
  chatTitle: string | null;
  currency: string;
  kpiLabel: string;
  kpiType: string;
  createdAt: string | null;
  updatedAt: string | null;
  portalUrl: string;
  status: "active" | "pending";
  leadsToday: number;
  leadsTotal: number;
  spend: number;
}

export const listAdminProjectSummaries = async (
  kv: KvClient,
  r2: R2Client,
): Promise<AdminProjectSummary[]> => {
  const bundles = await loadAllProjectBundles(kv, r2);
  const summaries: AdminProjectSummary[] = [];
  for (const bundle of bundles) {
    const meta = await getProject(kv, bundle.project.id).catch(() => null);
    const chatRecord = bundle.project.chatId
      ? await getOccupiedChatRecord(kv, bundle.project.chatId).catch(() => null)
      : null;
    summaries.push({
      id: bundle.project.id,
      name: bundle.project.name,
      ownerId: bundle.project.ownerId,
      adAccountId: bundle.project.adAccountId,
      chatId: bundle.project.chatId,
      chatTitle: chatRecord?.chatTitle ?? null,
      currency: bundle.project.settings.currency,
      kpiLabel: bundle.project.settings.kpi.label,
      kpiType: bundle.project.settings.kpi.type,
      createdAt: meta?.createdAt ?? null,
      updatedAt: meta?.updatedAt ?? null,
      portalUrl: bundle.project.portalUrl,
      status: bundle.project.chatId && bundle.project.adAccountId ? "active" : "pending",
      leadsToday: bundle.leads.stats.today ?? 0,
      leadsTotal: bundle.leads.stats.total ?? 0,
      spend: bundle.campaigns.summary.spend ?? 0,
    });
  }
  return summaries.sort((a, b) => a.name.localeCompare(b.name));
};

export interface AdminProjectDetail extends ProjectBundle {
  chatTitle: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  portal: {
    enabled: boolean;
    sync: PortalSyncState;
  };
}

export const loadAdminProjectDetail = async (
  kv: KvClient,
  r2: R2Client,
  projectId: string,
): Promise<AdminProjectDetail> => {
  const bundle = await loadProjectBundle(kv, r2, projectId);
  const meta = await getProject(kv, projectId).catch(() => null);
  const chatRecord = bundle.project.chatId
    ? await getOccupiedChatRecord(kv, bundle.project.chatId).catch(() => null)
    : null;
  const settings = await ensureProjectSettings(kv, projectId);
  const portalSync = await getPortalSyncState(kv, projectId);
  return {
    ...bundle,
    chatTitle: chatRecord?.chatTitle ?? null,
    createdAt: meta?.createdAt ?? null,
    updatedAt: meta?.updatedAt ?? null,
    portal: {
      enabled: settings.portalEnabled,
      sync: portalSync,
    },
  } satisfies AdminProjectDetail;
};

export interface AdminAnalyticsOverview {
  totals: {
    spendByCurrency: Record<string, number>;
    leads: number;
    messages: number;
  };
  topProjects: { id: string; name: string; leads: number; spend: number }[];
  topCampaigns: { projectId: string; name: string; spend: number; kpi: number }[];
}

export const buildAdminAnalyticsOverview = async (
  kv: KvClient,
  r2: R2Client,
): Promise<AdminAnalyticsOverview> => {
  const bundles = await loadAllProjectBundles(kv, r2);
  const spendByCurrency: Record<string, number> = {};
  let leads = 0;
  let messages = 0;
  const topProjects: AdminAnalyticsOverview["topProjects"] = [];
  const campaigns: AdminAnalyticsOverview["topCampaigns"] = [];

  for (const bundle of bundles) {
    const spend = bundle.campaigns.summary.spend ?? 0;
    const projectLeads = bundle.campaigns.summary.leads ?? 0;
    const projectMessages = bundle.campaigns.summary.messages ?? 0;
    spendByCurrency[bundle.project.settings.currency] =
      (spendByCurrency[bundle.project.settings.currency] ?? 0) + spend;
    leads += projectLeads;
    messages += projectMessages;
    topProjects.push({ id: bundle.project.id, name: bundle.project.name, leads: projectLeads, spend });
    for (const campaign of bundle.campaigns.campaigns ?? []) {
      campaigns.push({
        projectId: bundle.project.id,
        name: campaign.name,
        spend: campaign.spend ?? 0,
        kpi: (campaign.leads ?? campaign.messages ?? 0) ?? 0,
      });
    }
  }

  topProjects.sort((a, b) => (b.leads === a.leads ? b.spend - a.spend : b.leads - a.leads));
  campaigns.sort((a, b) => (b.kpi === a.kpi ? b.spend - a.spend : b.kpi - a.kpi));

  return {
    totals: { spendByCurrency, leads, messages },
    topProjects: topProjects.slice(0, 5),
    topCampaigns: campaigns.slice(0, 5),
  } satisfies AdminAnalyticsOverview;
};

export interface AdminFinanceOverview {
  totals: { spendByCurrency: Record<string, number> };
  projects: {
    id: string;
    name: string;
    tariff: number;
    currency: string;
    nextPaymentDate: string | null;
    autobilling: boolean;
    payments: Awaited<ReturnType<typeof getPaymentsHistoryDocument>>;
  }[];
}

export const buildAdminFinanceOverview = async (
  kv: KvClient,
  r2: R2Client,
): Promise<AdminFinanceOverview> => {
  const bundles = await loadAllProjectBundles(kv, r2);
  const spendByCurrency: Record<string, number> = {};
  const projects = await Promise.all(
    bundles.map(async (bundle) => {
      spendByCurrency[bundle.billing.currency] =
        (spendByCurrency[bundle.billing.currency] ?? 0) + bundle.billing.tariff;
      const payments = await getPaymentsHistoryDocument(r2, bundle.project.id);
      return {
        id: bundle.project.id,
        name: bundle.project.name,
        tariff: bundle.billing.tariff,
        currency: bundle.billing.currency,
        nextPaymentDate: bundle.billing.nextPaymentDate ?? null,
        autobilling: bundle.billing.autobilling,
        payments,
      };
    }),
  );
  return { totals: { spendByCurrency }, projects } satisfies AdminFinanceOverview;
};

export interface AdminUserEntry {
  userId: number;
  projects: ProjectsByUserRecord["projects"];
  projectCount: number;
  language: string;
  timezone: string;
}

export const listAdminUsers = async (kv: KvClient): Promise<AdminUserEntry[]> => {
  const keys = await listKeys(kv, KV_PREFIXES.projectsByUser);
  if (keys.length === 0) {
    return [];
  }
  const entries = await Promise.all(
    keys.map(async (key) => {
      const userIdRaw = stripPrefix(key, KV_PREFIXES.projectsByUser);
      const userId = Number(userIdRaw);
      if (!Number.isFinite(userId)) {
        return null;
      }
      const record = await getProjectsByUser(kv, userId);
      if (!record) {
        return null;
      }
      const settings = await getUserSettingsRecord(kv, userId).catch(() => ({
        language: "ru",
        timezone: "Asia/Tashkent",
      }));
      return {
        userId,
        projects: record.projects,
        projectCount: record.projects.length,
        language: settings.language,
        timezone: settings.timezone,
      } satisfies AdminUserEntry;
    }),
  );
  return entries.filter((entry): entry is AdminUserEntry => entry != null);
};

export interface AdminMetaAccountEntry {
  userId: number;
  expiresAt: string;
  adAccounts: FbAuthRecord["adAccounts"];
}

export const listAdminMetaAccounts = async (kv: KvClient): Promise<AdminMetaAccountEntry[]> => {
  const fbKeys = new Set<string>();
  for (const key of await listKeys(kv, KV_PREFIXES.facebookAuth)) {
    fbKeys.add(key);
  }
  for (const key of await listKeys(kv, KV_PREFIXES.fbAuth)) {
    fbKeys.add(key);
  }
  const entries = await Promise.all(
    Array.from(fbKeys).map(async (key) => {
      const userIdRaw = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
      const userId = Number(userIdRaw);
      if (!Number.isFinite(userId)) {
        return null;
      }
      const record = await getFbAuthRecord(kv, userId);
      if (!record) {
        return null;
      }
      return { userId, expiresAt: record.expiresAt, adAccounts: record.adAccounts };
    }),
  );
  return entries.filter((entry): entry is AdminMetaAccountEntry => entry != null);
};

export const listAdminProjectLeads = async (r2: R2Client, projectId: string) => {
  const list = await getProjectLeadsList(r2, projectId);
  return list ?? { stats: { total: 0, today: 0 }, leads: [] };
};
