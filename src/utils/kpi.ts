import { PortalMetricKey, MetaCampaign } from "../types";
import {
  EnvBindings,
  getCampaignObjective,
  listCampaignObjectivesForProject,
  listProjectCampaignKpis,
  saveCampaignObjectiveRecord,
  saveProjectCampaignKpis,
} from "./storage";

export const OBJECTIVE_DEFAULT_KPIS: Record<string, PortalMetricKey[]> = {
  LEAD_GENERATION: ["leads", "cpl", "spend", "ctr", "cpc", "reach"],
  MESSAGES: ["conversations", "cpm", "cpc", "spend"],
  OUTCOME_TRAFFIC: ["clicks", "cpc", "ctr", "spend", "impressions"],
  CONVERSIONS: ["purchases", "cpa", "spend", "roas", "cpm"],
  POST_ENGAGEMENT: ["engagements", "cpe", "spend", "reach"],
  VIDEO_VIEWS: ["thruplays", "cpv", "impressions", "spend"],
  APP_INSTALLS: ["installs", "cpi", "spend"],
  BRAND_AWARENESS: ["reach", "impressions", "cpm"],
  OUTCOME_SALES: ["purchases", "roas", "spend"],
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
  conversations: "Диалоги",
  cpm: "CPM",
  purchases: "Покупки",
  cpa: "CPA",
  roas: "ROAS",
  engagements: "Вовлечённость",
  cpe: "CPE",
  thruplays: "ThruPlays",
  cpv: "CPV",
  installs: "Установки",
  cpi: "CPI",
};

const FALLBACK_KPIS: PortalMetricKey[] = ["leads", "cpl", "spend", "ctr", "cpc", "reach"];

export const resolveObjectiveKpis = (objective: string | null | undefined): PortalMetricKey[] => {
  if (!objective) {
    return [...FALLBACK_KPIS];
  }
  const normalized = objective.toUpperCase();
  const preset = OBJECTIVE_DEFAULT_KPIS[normalized];
  return preset ? [...preset] : [...FALLBACK_KPIS];
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
  return resolveObjectiveKpis(objective);
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
