import { R2_KEYS } from "../../config/r2";
import type { R2Client } from "../../infra/r2";
import { DataValidationError } from "../../errors";
import { assertEnum, assertNumber, assertString } from "../validation";
import { KPI_TYPES } from "./project";

export interface MetaPeriodRange {
  from: string;
  to: string;
}

export interface MetaSummaryMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  messages: number;
}

export interface MetaCampaignRecord extends MetaSummaryMetrics {
  id: string;
  name: string;
  objective: string;
  kpiType: typeof KPI_TYPES[number];
}

export interface MetaCampaignsDocument {
  period: MetaPeriodRange;
  summary: MetaSummaryMetrics;
  campaigns: MetaCampaignRecord[];
}

const parseSummary = (raw: unknown, field: string): MetaSummaryMetrics => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError(`${field} must be an object`);
  }
  const record = raw as Record<string, unknown>;
  return {
    spend: assertNumber(record.spend ?? record["spend"], `${field}.spend`),
    impressions: assertNumber(record.impressions ?? record["impressions"], `${field}.impressions`),
    clicks: assertNumber(record.clicks ?? record["clicks"], `${field}.clicks`),
    leads: assertNumber(record.leads ?? record["leads"], `${field}.leads`),
    messages: assertNumber(record.messages ?? record["messages"], `${field}.messages`),
  };
};

const parsePeriod = (raw: unknown): MetaPeriodRange => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("meta.campaigns.period must be an object");
  }
  const record = raw as Record<string, unknown>;
  return {
    from: assertString(record.from ?? record["from"], "meta.campaigns.period.from"),
    to: assertString(record.to ?? record["to"], "meta.campaigns.period.to"),
  };
};

const parseCampaign = (raw: unknown, index: number): MetaCampaignRecord => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError(`meta.campaigns[${index}] must be an object`);
  }
  const record = raw as Record<string, unknown>;
  return {
    id: assertString(record.id ?? record["id"], `meta.campaigns[${index}].id`),
    name: assertString(record.name ?? record["name"], `meta.campaigns[${index}].name`),
    objective: assertString(record.objective ?? record["objective"], `meta.campaigns[${index}].objective`),
    kpiType: assertEnum(record.kpi_type ?? record["kpi_type"], `meta.campaigns[${index}].kpi_type`, KPI_TYPES),
    spend: assertNumber(record.spend ?? record["spend"], `meta.campaigns[${index}].spend`),
    impressions: assertNumber(
      record.impressions ?? record["impressions"],
      `meta.campaigns[${index}].impressions`,
    ),
    clicks: assertNumber(record.clicks ?? record["clicks"], `meta.campaigns[${index}].clicks`),
    leads: assertNumber(record.leads ?? record["leads"], `meta.campaigns[${index}].leads`),
    messages: assertNumber(record.messages ?? record["messages"], `meta.campaigns[${index}].messages`),
  };
};

export const parseMetaCampaignsDocument = (raw: unknown): MetaCampaignsDocument => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("meta.campaigns document must be an object");
  }
  const record = raw as Record<string, unknown>;
  const campaigns = record.campaigns ?? record["campaigns"];
  if (!Array.isArray(campaigns)) {
    throw new DataValidationError("meta.campaigns.campaigns must be an array");
  }
  return {
    period: parsePeriod(record.period ?? record["period"]),
    summary: parseSummary(record.summary ?? record["summary"], "meta.campaigns.summary"),
    campaigns: campaigns.map((entry, index) => parseCampaign(entry, index)),
  };
};

export const getMetaCampaignsDocument = async (
  r2: R2Client,
  projectId: string,
): Promise<MetaCampaignsDocument | null> => {
  const raw = await r2.getJson<Record<string, unknown>>(R2_KEYS.metaCampaigns(projectId));
  return raw ? parseMetaCampaignsDocument(raw) : null;
};

export const putMetaCampaignsDocument = async (
  r2: R2Client,
  projectId: string,
  document: MetaCampaignsDocument,
): Promise<void> => {
  await r2.putJson(R2_KEYS.metaCampaigns(projectId), {
    period: document.period,
    summary: document.summary,
    campaigns: document.campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      objective: campaign.objective,
      kpi_type: campaign.kpiType,
      spend: campaign.spend,
      impressions: campaign.impressions,
      clicks: campaign.clicks,
      leads: campaign.leads,
      messages: campaign.messages,
    })),
  });
};
