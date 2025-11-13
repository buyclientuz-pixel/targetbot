import { PortalMetricKey, MetaCampaign } from "../types";
import {
  EnvBindings,
  getCampaignObjective,
  listCampaignObjectivesForProject,
  listProjectCampaignKpis,
  saveCampaignObjectiveRecord,
  saveProjectCampaignKpis,
} from "./storage";

const KPI_LEAD_GENERATION: PortalMetricKey[] = [
  "leads",
  "cpl",
  "spend",
  "impressions",
  "reach",
];

const KPI_MESSAGES: PortalMetricKey[] = ["messages", "cpm", "cpc", "spend"];

const KPI_TRAFFIC: PortalMetricKey[] = ["clicks", "cpc", "ctr", "spend", "impressions"];

const KPI_CONVERSIONS: PortalMetricKey[] = ["purchases", "roas", "spend", "cpa", "cpurchase"];

const KPI_ENGAGEMENT: PortalMetricKey[] = ["engagements", "cpe", "impressions", "spend"];

const KPI_VIDEO_VIEWS: PortalMetricKey[] = ["thruplays", "cpv", "impressions", "spend"];

const KPI_APP_INSTALLS: PortalMetricKey[] = ["installs", "cpi", "spend"];

const KPI_AWARENESS: PortalMetricKey[] = ["reach", "impressions", "freq", "cpm"];

const KPI_SALES: PortalMetricKey[] = ["purchases", "roas", "spend", "cpa", "cpurchase"];

export const OBJECTIVE_DEFAULT_KPIS: Record<string, PortalMetricKey[]> = {
  LEAD_GENERATION: KPI_LEAD_GENERATION,
  OUTCOME_LEADS: KPI_LEAD_GENERATION,
  LEADS: KPI_LEAD_GENERATION,
  MESSAGES: KPI_MESSAGES,
  OUTCOME_MESSAGES: KPI_MESSAGES,
  TRAFFIC: KPI_TRAFFIC,
  OUTCOME_TRAFFIC: KPI_TRAFFIC,
  AWARENESS: KPI_AWARENESS,
  BRAND_AWARENESS: KPI_AWARENESS,
  OUTCOME_AWARENESS: KPI_AWARENESS,
  ENGAGEMENT: KPI_ENGAGEMENT,
  OUTCOME_ENGAGEMENT: KPI_ENGAGEMENT,
  POST_ENGAGEMENT: KPI_ENGAGEMENT,
  CONVERSIONS: KPI_CONVERSIONS,
  OUTCOME_CONVERSIONS: KPI_CONVERSIONS,
  SALES: KPI_SALES,
  OUTCOME_SALES: KPI_SALES,
  VIDEO_VIEWS: KPI_VIDEO_VIEWS,
  OUTCOME_VIDEO_VIEWS: KPI_VIDEO_VIEWS,
  APP_INSTALLS: KPI_APP_INSTALLS,
  OUTCOME_APP_INSTALLS: KPI_APP_INSTALLS,
};

export const KPI_LABELS: Record<PortalMetricKey, string> = {
  leads_total: "Лиды всего",
  leads_new: "Новые лиды",
  leads_done: "Завершено",
  spend: "Расход",
  impressions: "Показы",
  clicks: "Клики",
  leads: "Лиды",
  cpl: "CPL",
  ctr: "CTR",
  cpc: "CPC",
  reach: "Охват",
  messages: "Сообщения",
  conversations: "Диалоги",
  cpm: "CPM",
  purchases: "Покупки",
  cpa: "CPA",
  roas: "ROAS",
  conversions: "Конверсии",
  engagements: "Вовлечённость",
  cpe: "CPE",
  thruplays: "ThruPlays",
  cpv: "CPV",
  installs: "Установки",
  cpi: "CPI",
  freq: "Частота",
  cpurchase: "Цена за покупку",
};

const FALLBACK_KPIS: PortalMetricKey[] = ["leads", "cpl", "spend", "ctr", "cpc", "reach"];

const normalizeObjectiveKey = (objective: string): string => {
  return objective
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_|_$/g, "");
};

export const getCampaignKPIs = (objective: string | null | undefined): PortalMetricKey[] => {
  if (!objective) {
    return [...FALLBACK_KPIS];
  }
  const key = normalizeObjectiveKey(objective);
  const preset = OBJECTIVE_DEFAULT_KPIS[key];
  if (preset) {
    return [...preset];
  }
  return [...FALLBACK_KPIS];
};

export const resolveObjectiveKpis = (objective: string | null | undefined): PortalMetricKey[] => {
  return getCampaignKPIs(objective);
};

export const syncCampaignObjectives = async (
  env: EnvBindings,
  projectId: string,
  campaigns: MetaCampaign[],
): Promise<void> => {
  await Promise.all(
    campaigns.map((campaign) =>
      saveCampaignObjectiveRecord(env, projectId, campaign.id, campaign.objective ?? null).catch((error) => {
        console.warn("Failed to persist campaign objective", projectId, campaign.id, error);
      }),
    ),
  );
};

export const loadCampaignObjectiveMap = async (
  env: EnvBindings,
  projectId: string,
): Promise<Record<string, string>> => {
  try {
    return await listCampaignObjectivesForProject(env, projectId);
  } catch (error) {
    console.warn("Failed to load campaign objectives", projectId, error);
    return {};
  }
};

export const resolveCampaignKpis = async (
  env: EnvBindings,
  projectId: string,
  campaignId: string,
  objectiveHint?: string | null,
): Promise<PortalMetricKey[]> => {
  const map = await listProjectCampaignKpis(env, projectId).catch((error) => {
    console.warn("Failed to load stored campaign KPIs", projectId, error);
    return {} as Record<string, PortalMetricKey[]>;
  });
  const stored = map[campaignId];
  if (stored && stored.length) {
    return [...stored];
  }
  const objective =
    objectiveHint ?? (await getCampaignObjective(env, projectId, campaignId).catch(() => null));
  return getCampaignKPIs(objective);
};

export const persistCampaignKpis = async (
  env: EnvBindings,
  projectId: string,
  campaignId: string,
  metrics: PortalMetricKey[],
): Promise<PortalMetricKey[]> => {
  try {
    return await saveProjectCampaignKpis(env, projectId, campaignId, metrics);
  } catch (error) {
    console.warn("Failed to save campaign KPIs", projectId, campaignId, error);
    return metrics;
  }
};
