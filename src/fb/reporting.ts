import { callGraph } from "./client";
import { appendLogEntry, readJsonFromR2, writeJsonToR2 } from "../utils/r2";
import { findProjectCard } from "../utils/projects";
import { processAutoAlerts } from "../utils/alerts";
import { CampaignMetric, ProjectCard, ProjectReport, ProjectSummary, BillingInfo } from "../types";

const PERIOD_MAP: Record<string, string> = {
  today: "today",
  yesterday: "yesterday",
  week: "last_7d",
  month: "last_30d",
  all: "lifetime",
};

const DEFAULT_PERIOD = "last_30d";

const parseLeads = (actions: any[]): number => {
  if (!Array.isArray(actions)) {
    return 0;
  }
  let total = 0;
  for (const action of actions) {
    const type = action && action.action_type ? String(action.action_type) : "";
    if (type.includes("lead")) {
      const value = Number(action.value || 0);
      total += Number.isFinite(value) ? value : 0;
    }
  }
  return total;
};

interface CampaignStatusInfo {
  status: string;
  updated_time: string | null;
}

const toCampaignMetric = (
  entry: any,
  statusMap: Map<string, CampaignStatusInfo>
): CampaignMetric => {
  const campaignId = String(entry.campaign_id || "");
  const spend = Number(entry.spend || 0);
  const clicks = Number(entry.clicks || 0);
  const impressions = Number(entry.impressions || 0);
  const leads = parseLeads(entry.actions || []);
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : null;
  const cpa = leads > 0 ? spend / leads : null;
  const cpc = clicks > 0 ? spend / clicks : null;
  const frequency = entry.frequency ? Number(entry.frequency) : null;
  const lastActive = entry.date_stop ? entry.date_stop : entry.date_start;
  const statusInfo = statusMap.get(campaignId);
  const status = statusInfo ? statusInfo.status : "UNKNOWN";
  const statusUpdated = statusInfo ? statusInfo.updated_time : null;

  return {
    id: campaignId,
    name: String(entry.campaign_name || "Без названия"),
    status,
    spend,
    clicks,
    impressions,
    leads,
    ctr,
    cpa,
    cpc,
    frequency,
    last_active: lastActive || null,
    status_updated_at: statusUpdated,
  };
};

const summarizeCampaigns = (campaigns: CampaignMetric[]): ProjectSummary => {
  const summary: ProjectSummary = {
    spend: 0,
    leads: 0,
    clicks: 0,
    impressions: 0,
    frequency: null,
    cpa: null,
    cpc: null,
    ctr: null,
    active_campaigns: 0,
  };

  let frequencySum = 0;
  let frequencyCount = 0;

  for (const campaign of campaigns) {
    summary.spend += campaign.spend;
    summary.leads += campaign.leads;
    summary.clicks += campaign.clicks;
    summary.impressions += campaign.impressions;
    if (campaign.frequency && Number.isFinite(campaign.frequency)) {
      frequencySum += campaign.frequency;
      frequencyCount += 1;
    }
    if (
      campaign.status === "ACTIVE" ||
      campaign.status === "PAUSED" ||
      campaign.status === "PAUSED_DUE_TO_HIGH_CPA"
    ) {
      summary.active_campaigns =
        (summary.active_campaigns || 0) + (campaign.status === "ACTIVE" ? 1 : 0);
    }
  }

  summary.frequency = frequencyCount > 0 ? frequencySum / frequencyCount : null;
  summary.cpa = summary.leads > 0 ? summary.spend / summary.leads : null;
  summary.cpc = summary.clicks > 0 ? summary.spend / summary.clicks : null;
  summary.ctr = summary.impressions > 0 ? (summary.clicks / summary.impressions) * 100 : null;

  return summary;
};

const pickPeriod = (project: ProjectCard | null, override?: string): string => {
  if (override && PERIOD_MAP[override]) {
    return PERIOD_MAP[override];
  }
  if (project && project.default_period && PERIOD_MAP[project.default_period]) {
    return PERIOD_MAP[project.default_period];
  }
  return DEFAULT_PERIOD;
};

const fetchCampaignStatuses = async (
  env: unknown,
  accountId: string
): Promise<Map<string, CampaignStatusInfo>> => {
  try {
    const response = await callGraph(env as any, `${accountId}/campaigns`, {
      fields: "id,status,effective_status,updated_time",
      limit: "500",
    });
    const map = new Map<string, CampaignStatusInfo>();
    if (response && Array.isArray(response.data)) {
      for (const item of response.data) {
        const id = String(item.id || "");
        const status = String(item.effective_status || item.status || "UNKNOWN");
        const updated = item.updated_time ? String(item.updated_time) : null;
        if (id) {
          map.set(id, {
            status: status.toUpperCase(),
            updated_time: updated,
          });
        }
      }
    }
    return map;
  } catch (_error) {
    return new Map();
  }
};

const DAY_MS = 24 * 60 * 60 * 1000;

const fetchBillingInfo = (account: any): BillingInfo | undefined => {
  if (!account) {
    return undefined;
  }
  const details = account.funding_source_details || {};
  const card = details.display_string || details.card_number_last_four || null;
  const nextDate = account.next_bill_date || details.next_bill_date || null;
  let daysToPay: number | null = null;
  if (nextDate) {
    const target = new Date(nextDate).getTime();
    if (Number.isFinite(target)) {
      const diff = Math.ceil((target - Date.now()) / DAY_MS);
      if (Number.isFinite(diff)) {
        daysToPay = diff < 0 ? 0 : diff;
      }
    }
  }
  const spendCap =
    account.spend_cap !== undefined && account.spend_cap !== null
      ? Number(account.spend_cap)
      : null;
  const normalizedSpendCap =
    typeof spendCap === "number" && Number.isFinite(spendCap) ? spendCap : null;

  return {
    card_last4: card ? String(card).slice(-4) : null,
    next_payment_date: nextDate || null,
    days_to_pay: daysToPay,
    spend_limit: normalizedSpendCap,
  };
};

export const refreshProjectReport = async (
  env: unknown,
  projectId: string,
  options: { period?: string } = {}
): Promise<ProjectReport | null> => {
  const project = await findProjectCard(env, projectId);
  if (!project) {
    await appendLogEntry(env as any, {
      level: "warn",
      message: `Project not found for refresh: ${projectId}`,
      timestamp: new Date().toISOString(),
    });
    return null;
  }

  const accountId = project.ad_account_id || projectId;
  try {
    const statusMap = await fetchCampaignStatuses(env, accountId);
    const period = pickPeriod(project, options.period);
    const insights = await callGraph(env as any, `${accountId}/insights`, {
      level: "campaign",
      time_increment: "1",
      date_preset: period,
      limit: "500",
      fields:
        "campaign_id,campaign_name,impressions,clicks,spend,actions,action_values,ctr,cpc,cpp,cpm,frequency,date_start,date_stop",
    });

    const campaigns: CampaignMetric[] = [];
    if (insights && Array.isArray(insights.data)) {
      for (const entry of insights.data) {
        campaigns.push(toCampaignMetric(entry, statusMap));
      }
    }

    const accountDetails = await callGraph(env as any, accountId, {
      fields:
        "name,account_status,balance,spend_cap,currency,funding_source_details,next_bill_date,amount_spent,disable_reason",
    });

    const summary = summarizeCampaigns(campaigns);

    const report: ProjectReport = {
      project_id: projectId,
      project_name: project.name,
      currency: accountDetails.currency || project.currency || "USD",
      updated_at: new Date().toISOString(),
      period,
      period_label: options.period || project.default_period || null,
      status: normalizeStatus(accountDetails.account_status, accountDetails.disable_reason),
      summary,
      campaigns,
      billing: fetchBillingInfo(accountDetails),
      chat_link: project.chat_link || null,
      kpi: project.kpi || null,
      alerts: project.alerts || null,
    };

    await writeJsonToR2(env as any, `reports/${projectId}.json`, report);
    await processAutoAlerts(env, project, report);
    return report;
  } catch (error) {
    await appendLogEntry(env as any, {
      level: "error",
      message: `Failed to refresh project ${projectId}: ${(error as Error).message}`,
      timestamp: new Date().toISOString(),
    });
    return await readJsonFromR2<ProjectReport>(env as any, `reports/${projectId}.json`);
  }
};

const normalizeStatus = (
  status: any,
  disableReason: any
): "active" | "pending" | "paused" | "unknown" => {
  const rawStatus = String(status || "").toUpperCase();
  if (rawStatus.includes("ACTIVE")) {
    return "active";
  }
  if (rawStatus.includes("PENDING")) {
    return "pending";
  }
  if (rawStatus.includes("DISABLED") || rawStatus.includes("CLOSED") || disableReason) {
    return "paused";
  }
  return "unknown";
};
