import { MetaCampaign, NormalizedCampaign } from "../types";

const STATUS_ORDER: Record<string, number> = {
  ACTIVE: 0,
  PAUSED: 1,
};

const DEFAULT_STATUS_ORDER = 2;

const buildGraphemeArray = (input: string): string[] => {
  return Array.from(input);
};

export const buildCampaignShortName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) {
    return "—";
  }
  const graphemes = buildGraphemeArray(trimmed);
  const letters: string[] = [];
  for (const char of graphemes) {
    if (!char.trim()) {
      continue;
    }
    letters.push(char);
    if (letters.length >= 4) {
      break;
    }
  }
  if (letters.length >= 4) {
    return letters.join("");
  }
  const fallbackLength = Math.min(5, graphemes.length);
  return graphemes.slice(0, fallbackLength).join("");
};

const normalizeObjectiveKey = (objective: string | null | undefined): string => {
  if (!objective) {
    return "";
  }
  return objective
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_|_$/g, "");
};

interface ObjectiveMetricEntry {
  objectiveLabel: string;
  metricLabel: string;
  metricKey: string;
  extract: (campaign: MetaCampaign) => number | undefined;
}

const OBJECTIVE_METRICS: Record<string, ObjectiveMetricEntry> = {
  LEAD_GENERATION: {
    objectiveLabel: "Лиды",
    metricLabel: "Лиды",
    metricKey: "leads",
    extract: (campaign) => campaign.leads,
  },
  CONVERSIONS: {
    objectiveLabel: "Конверсии",
    metricLabel: "Конверсии",
    metricKey: "conversions",
    extract: (campaign) => campaign.conversions ?? campaign.leads,
  },
  SALES: {
    objectiveLabel: "Продажи",
    metricLabel: "Покупки",
    metricKey: "purchases",
    extract: (campaign) => campaign.purchases,
  },
  OUTCOME_SALES: {
    objectiveLabel: "Продажи",
    metricLabel: "Покупки",
    metricKey: "purchases",
    extract: (campaign) => campaign.purchases,
  },
  MESSAGES: {
    objectiveLabel: "Сообщения",
    metricLabel: "Сообщения",
    metricKey: "messages",
    extract: (campaign) => campaign.conversations,
  },
  ENGAGEMENT: {
    objectiveLabel: "Взаимодействие",
    metricLabel: "Взаимодействия",
    metricKey: "engagement",
    extract: (campaign) => campaign.engagements,
  },
  POST_ENGAGEMENT: {
    objectiveLabel: "Взаимодействие",
    metricLabel: "Взаимодействия",
    metricKey: "engagement",
    extract: (campaign) => campaign.engagements,
  },
  APP_INSTALLS: {
    objectiveLabel: "Инсталлы",
    metricLabel: "Инсталлы",
    metricKey: "installs",
    extract: (campaign) => campaign.installs,
  },
  TRAFFIC: {
    objectiveLabel: "Трафик",
    metricLabel: "Клики",
    metricKey: "clicks",
    extract: (campaign) => campaign.inlineLinkClicks ?? campaign.clicks,
  },
  OUTCOME_TRAFFIC: {
    objectiveLabel: "Трафик",
    metricLabel: "Клики",
    metricKey: "clicks",
    extract: (campaign) => campaign.inlineLinkClicks ?? campaign.clicks,
  },
  AWARENESS: {
    objectiveLabel: "Узнаваемость",
    metricLabel: "Охват",
    metricKey: "reach",
    extract: (campaign) => campaign.reach ?? campaign.impressions,
  },
  BRAND_AWARENESS: {
    objectiveLabel: "Узнаваемость",
    metricLabel: "Охват",
    metricKey: "reach",
    extract: (campaign) => campaign.reach ?? campaign.impressions,
  },
  VIDEO_VIEWS: {
    objectiveLabel: "Просмотры",
    metricLabel: "Просмотры",
    metricKey: "thruplays",
    extract: (campaign) => campaign.thruplays,
  },
  OUTCOME_ENGAGEMENT: {
    objectiveLabel: "Взаимодействие",
    metricLabel: "Взаимодействия",
    metricKey: "engagement",
    extract: (campaign) => campaign.engagements,
  },
};

const resolveObjectiveKey = (objectiveKey: string): string | null => {
  if (!objectiveKey) {
    return null;
  }
  if (OBJECTIVE_METRICS[objectiveKey]) {
    return objectiveKey;
  }
  const includes = (needle: string): boolean => objectiveKey.includes(needle);
  if (includes("LEAD")) {
    return "LEAD_GENERATION";
  }
  if (includes("MESSAGE") || includes("CONVERSATION")) {
    return "MESSAGES";
  }
  if (includes("TRAFFIC") || includes("CLICK")) {
    return "TRAFFIC";
  }
  if (includes("AWARE") || includes("REACH") || includes("BRAND")) {
    return "AWARENESS";
  }
  if (includes("ENGAGEMENT") || includes("INTERACTION") || includes("POST")) {
    return "ENGAGEMENT";
  }
  if (includes("CONVERSION")) {
    return "CONVERSIONS";
  }
  if (includes("SALE") || includes("PURCHASE")) {
    return "SALES";
  }
  if (includes("INSTALL")) {
    return "APP_INSTALLS";
  }
  if (includes("VIDEO") || includes("THRUPLAY") || includes("VIEW")) {
    return "VIDEO_VIEWS";
  }
  return null;
};

const humanizeObjectiveKey = (objectiveKey: string): string | null => {
  if (!objectiveKey) {
    return null;
  }
  const cleaned = objectiveKey.replace(/_/g, " ").trim();
  if (!cleaned) {
    return null;
  }
  return cleaned
    .toLowerCase()
    .replace(/(^|\s)([а-яa-z])/g, (match) => match.toUpperCase());
};

const resolveObjectiveLabel = (objectiveKey: string): string => {
  const canonical = resolveObjectiveKey(objectiveKey);
  if (canonical) {
    return OBJECTIVE_METRICS[canonical]?.objectiveLabel ?? "Не определено";
  }
  const humanized = humanizeObjectiveKey(objectiveKey);
  if (humanized) {
    return humanized;
  }
  return "Не определено";
};

const deriveCampaignResult = (
  campaign: MetaCampaign,
): { objectiveLabel: string; metricLabel: string; metricKey: string; value: number } => {
  const objectiveRaw = normalizeObjectiveKey(campaign.objective);
  const canonicalKey = resolveObjectiveKey(objectiveRaw);
  const mapping = canonicalKey ? OBJECTIVE_METRICS[canonicalKey] : undefined;
  const fallbackValue =
    campaign.leads ??
    campaign.conversions ??
    campaign.purchases ??
    campaign.conversations ??
    campaign.inlineLinkClicks ??
    campaign.clicks ??
    campaign.reach ??
    0;
  if (mapping) {
    const extracted = mapping.extract(campaign);
    const value = extracted !== undefined ? extracted : fallbackValue ?? 0;
    return {
      objectiveLabel: mapping.objectiveLabel,
      metricLabel: mapping.metricLabel,
      metricKey: mapping.metricKey,
      value: value ?? 0,
    };
  }
  return {
    objectiveLabel: resolveObjectiveLabel(objectiveRaw),
    metricLabel: "Результат",
    metricKey: "result",
    value: fallbackValue ?? 0,
  };
};

export const assignCampaignResult = (campaign: MetaCampaign): void => {
  const result = deriveCampaignResult(campaign);
  campaign.resultLabel = result.metricLabel;
  campaign.resultMetric = result.metricKey;
  campaign.resultValue = result.value ?? 0;
  campaign.objectiveLabel = result.objectiveLabel;
  campaign.primaryMetricLabel = result.metricLabel;
  campaign.primaryMetricValue = result.value ?? 0;
};

export const campaignStatusOrder = (campaign: MetaCampaign): number => {
  const status = (campaign.effectiveStatus || campaign.status || "").toUpperCase();
  if (STATUS_ORDER[status] !== undefined) {
    return STATUS_ORDER[status];
  }
  return DEFAULT_STATUS_ORDER;
};

export const compareCampaigns = (a: MetaCampaign, b: MetaCampaign): number => {
  const statusDiff = campaignStatusOrder(a) - campaignStatusOrder(b);
  if (statusDiff !== 0) {
    return statusDiff;
  }
  const spendDiff = (b.spend ?? 0) - (a.spend ?? 0);
  if (spendDiff !== 0) {
    return spendDiff;
  }
  return a.name.localeCompare(b.name, "ru-RU");
};

export const normalizeCampaign = (campaign: MetaCampaign): NormalizedCampaign => {
  const statusOrder = campaignStatusOrder(campaign);
  const shortName = campaign.shortName || buildCampaignShortName(campaign.name);
  if (!campaign.shortName) {
    campaign.shortName = shortName;
  }
  if (
    !campaign.resultLabel ||
    campaign.resultValue === undefined ||
    !campaign.objectiveLabel ||
    campaign.primaryMetricLabel === undefined ||
    campaign.primaryMetricValue === undefined
  ) {
    assignCampaignResult(campaign);
  }
  return {
    id: campaign.id,
    name: campaign.name,
    shortName,
    status: campaign.status,
    effectiveStatus: campaign.effectiveStatus,
    objective: campaign.objective ?? null,
    objectiveLabel: campaign.objectiveLabel ?? resolveObjectiveLabel(normalizeObjectiveKey(campaign.objective)),
    spend: campaign.spend ?? 0,
    spendFormatted: campaign.spendFormatted,
    spendCurrency: campaign.spendCurrency,
    impressions: campaign.impressions ?? 0,
    clicks: campaign.clicks ?? 0,
    reach: campaign.reach ?? 0,
    resultLabel: campaign.resultLabel,
    resultValue: campaign.resultValue,
    resultMetric: campaign.resultMetric,
    primaryMetricLabel: campaign.primaryMetricLabel ?? campaign.resultLabel ?? "Результат",
    primaryMetricValue: campaign.primaryMetricValue ?? campaign.resultValue ?? 0,
    statusOrder,
    raw: campaign,
  };
};

export const normalizeCampaigns = (campaigns: MetaCampaign[]): NormalizedCampaign[] => {
  return campaigns
    .slice()
    .sort(compareCampaigns)
    .map((campaign) => normalizeCampaign(campaign));
};

export const mapCampaignShortNames = (campaigns: MetaCampaign[]): Record<string, string> => {
  const map: Record<string, string> = {};
  campaigns.forEach((campaign) => {
    if (!campaign.id) {
      return;
    }
    const normalized = normalizeCampaign(campaign);
    map[campaign.id] = normalized.shortName;
  });
  return map;
};
