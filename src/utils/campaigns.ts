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

interface ResultMappingEntry {
  label: string;
  metric: string;
  extract: (campaign: MetaCampaign) => number | undefined;
}

const RESULT_MAPPING: Record<string, ResultMappingEntry> = {
  LEAD_GENERATION: {
    label: "Лиды на платформе",
    metric: "leads",
    extract: (campaign) => campaign.leads,
  },
  CONVERSIONS: {
    label: "Лиды с сайта",
    metric: "conversions",
    extract: (campaign) => campaign.conversions ?? campaign.leads,
  },
  SALES: {
    label: "Покупки",
    metric: "purchases",
    extract: (campaign) => campaign.purchases,
  },
  OUTCOME_SALES: {
    label: "Покупки",
    metric: "purchases",
    extract: (campaign) => campaign.purchases,
  },
  MESSAGES: {
    label: "Сообщения",
    metric: "messages",
    extract: (campaign) => campaign.conversations,
  },
  ENGAGEMENT: {
    label: "Взаимодействия",
    metric: "engagements",
    extract: (campaign) => campaign.engagements,
  },
  POST_ENGAGEMENT: {
    label: "Взаимодействия",
    metric: "engagements",
    extract: (campaign) => campaign.engagements,
  },
  APP_INSTALLS: {
    label: "Инсталлы",
    metric: "installs",
    extract: (campaign) => campaign.installs,
  },
  TRAFFIC: {
    label: "Клики по ссылке",
    metric: "clicks",
    extract: (campaign) => campaign.inlineLinkClicks ?? campaign.clicks,
  },
  OUTCOME_TRAFFIC: {
    label: "Клики по ссылке",
    metric: "clicks",
    extract: (campaign) => campaign.inlineLinkClicks ?? campaign.clicks,
  },
  AWARENESS: {
    label: "Охват",
    metric: "reach",
    extract: (campaign) => campaign.reach ?? campaign.impressions,
  },
  BRAND_AWARENESS: {
    label: "Охват",
    metric: "reach",
    extract: (campaign) => campaign.reach ?? campaign.impressions,
  },
  VIDEO_VIEWS: {
    label: "Просмотры",
    metric: "thruplays",
    extract: (campaign) => campaign.thruplays,
  },
};

const deriveCampaignResult = (campaign: MetaCampaign): { label: string; metric: string; value: number } | null => {
  const objectiveKey = normalizeObjectiveKey(campaign.objective);
  const mapping = RESULT_MAPPING[objectiveKey];
  if (mapping) {
    const value = mapping.extract(campaign);
    if (value !== undefined) {
      return { label: mapping.label, metric: mapping.metric, value };
    }
  }
  const fallbackValue =
    campaign.leads ??
    campaign.conversions ??
    campaign.purchases ??
    campaign.conversations ??
    campaign.inlineLinkClicks ??
    campaign.clicks ??
    campaign.reach ??
    0;
  return {
    label: "Результат",
    metric: "result",
    value: fallbackValue ?? 0,
  };
};

export const assignCampaignResult = (campaign: MetaCampaign): void => {
  const result = deriveCampaignResult(campaign);
  if (result) {
    campaign.resultLabel = result.label;
    campaign.resultMetric = result.metric;
    campaign.resultValue = result.value ?? 0;
  }
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
  if (!campaign.resultLabel || campaign.resultValue === undefined) {
    assignCampaignResult(campaign);
  }
  return {
    id: campaign.id,
    name: campaign.name,
    shortName,
    status: campaign.status,
    effectiveStatus: campaign.effectiveStatus,
    objective: campaign.objective ?? null,
    spend: campaign.spend ?? 0,
    spendFormatted: campaign.spendFormatted,
    spendCurrency: campaign.spendCurrency,
    impressions: campaign.impressions ?? 0,
    clicks: campaign.clicks ?? 0,
    reach: campaign.reach ?? 0,
    resultLabel: campaign.resultLabel,
    resultValue: campaign.resultValue,
    resultMetric: campaign.resultMetric,
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
