import { PortalMetricKey, MetaCampaign } from "../types";
import {
  EnvBindings,
  getCampaignObjective,
  listCampaignObjectivesForProject,
  listProjectCampaignKpis,
  saveCampaignObjectiveRecord,
  saveProjectCampaignKpis,
} from "./storage";

export const OBJECTIVE_KPI_MAP: Record<string, PortalMetricKey[]> = {
  LEAD_GENERATION: ["leads", "cpl", "spend"],
  MESSAGES: ["messages", "cpc", "cpm"],
  TRAFFIC: ["clicks", "cpc", "ctr", "spend"],
  AWARENESS: ["reach", "impressions", "cpm"],
  ENGAGEMENT: ["engagements", "cpe"],
  APP_INSTALLS: ["installs", "cpi"],
  CONVERSIONS: ["conversions", "cpa", "spend"],
  SALES: ["purchases", "roas", "spend"],
};

const OBJECTIVE_KPI_ALIASES: Record<string, keyof typeof OBJECTIVE_KPI_MAP> = {
  OUTCOME_LEADS: "LEAD_GENERATION",
  LEADS: "LEAD_GENERATION",
  OUTCOME_MESSAGES: "MESSAGES",
  OUTCOME_TRAFFIC: "TRAFFIC",
  OUTCOME_AWARENESS: "AWARENESS",
  BRAND_AWARENESS: "AWARENESS",
  OUTCOME_ENGAGEMENT: "ENGAGEMENT",
  POST_ENGAGEMENT: "ENGAGEMENT",
  VIDEO_VIEWS: "ENGAGEMENT",
  OUTCOME_VIDEO_VIEWS: "ENGAGEMENT",
  OUTCOME_CONVERSIONS: "CONVERSIONS",
  OUTCOME_SALES: "SALES",
  OUTCOME_APP_INSTALLS: "APP_INSTALLS",
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

const sanitizeSelection = (input: PortalMetricKey[] | null | undefined): PortalMetricKey[] => {
  if (!Array.isArray(input)) {
    return [];
  }
  const seen = new Set<PortalMetricKey>();
  const result: PortalMetricKey[] = [];
  input.forEach((value) => {
    const key = String(value).trim() as PortalMetricKey;
    if (Object.prototype.hasOwnProperty.call(KPI_LABELS, key) && !seen.has(key)) {
      seen.add(key);
      result.push(key);
    }
  });
  return result;
};

export interface ApplyKpiSelectionOptions {
  objective?: string | null;
  projectManual?: PortalMetricKey[] | null | undefined;
  campaignManual?: PortalMetricKey[] | null | undefined;
  override?: PortalMetricKey[] | null | undefined;
}

export const applyKpiSelection = ({
  objective,
  projectManual,
  campaignManual,
  override,
}: ApplyKpiSelectionOptions): PortalMetricKey[] => {
  const overrideMetrics = sanitizeSelection(override ?? undefined);
  if (overrideMetrics.length) {
    return overrideMetrics;
  }
  const campaignMetrics = sanitizeSelection(campaignManual ?? undefined);
  if (campaignMetrics.length) {
    return campaignMetrics;
  }
  const projectMetrics = sanitizeSelection(projectManual ?? undefined);
  if (projectMetrics.length) {
    return projectMetrics;
  }
  return getCampaignKPIs(objective ?? null);
};

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
    return [];
  }
  const key = normalizeObjectiveKey(objective);
  const preset = OBJECTIVE_KPI_MAP[key];
  if (preset) {
    return [...preset];
  }
  const alias = OBJECTIVE_KPI_ALIASES[key];
  if (alias) {
    return [...OBJECTIVE_KPI_MAP[alias]];
  }
  return [];
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
  projectManual?: PortalMetricKey[] | null,
): Promise<PortalMetricKey[]> => {
  const map = await listProjectCampaignKpis(env, projectId).catch((error) => {
    console.warn("Failed to load stored campaign KPIs", projectId, error);
    return {} as Record<string, PortalMetricKey[]>;
  });
  const campaignManual = map[campaignId];
  const objective =
    objectiveHint ?? (await getCampaignObjective(env, projectId, campaignId).catch(() => null));
  return applyKpiSelection({ objective, projectManual, campaignManual });
};

export const getKPIsForCampaign = (
  project: { manualKpi?: PortalMetricKey[] | null } | null | undefined,
  campaign: { objective?: string | null; manualKpi?: PortalMetricKey[] | null } | null | undefined,
  override?: PortalMetricKey[] | null,
): PortalMetricKey[] => {
  return applyKpiSelection({
    objective: campaign?.objective ?? null,
    projectManual: project?.manualKpi,
    campaignManual: campaign?.manualKpi,
    override,
  });
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
