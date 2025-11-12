import type { RouteHandler } from "../core/types";
import { fail, ok } from "../core/utils";
import { getMetaToken } from "../core/db";
import { graphRequest } from "./client";
import { requireAdmin } from "../core/auth";

interface InsightsResponse {
  data: Array<{
    campaign_id: string;
    spend: string;
    impressions: string;
    clicks: string;
    actions?: Array<{ action_type: string; value: string }>;
  }>;
}

export const metaStatsHandler: RouteHandler = async (context) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;
  const token = await getMetaToken(context.env);
  if (!token) return fail("Meta token not found", 404);
  const url = new URL(context.request.url);
  const accountId = url.searchParams.get("ad_account_id");
  const campaignId = url.searchParams.get("campaign_id");
  if (!accountId) {
    return fail("Missing ad_account_id", 400);
  }
  const params: Record<string, string> = {
    fields: "campaign_id,spend,impressions,clicks,actions",
    date_preset: url.searchParams.get("date_preset") ?? "last_7d",
  };
  if (campaignId) params.filtering = JSON.stringify([{ field: "campaign.id", operator: "IN", value: [campaignId] }]);
  const insights = await graphRequest<InsightsResponse>(context.env, `${accountId}/insights`, params, token.accessToken);
  const normalized = insights.data.map((entry) => {
    const leadsAction = entry.actions?.find((action) => action.action_type === "lead" || action.action_type === "onsite_conversion.lead_grouped");
    const leads = leadsAction ? Number(leadsAction.value) : 0;
    const spend = Number(entry.spend);
    return {
      campaignId: entry.campaign_id,
      spend,
      impressions: Number(entry.impressions),
      clicks: Number(entry.clicks),
      leads,
      cpl: leads > 0 ? spend / leads : null,
      ctr: Number(entry.impressions) > 0 ? Number(entry.clicks) / Number(entry.impressions) : null,
    };
  });
  return ok({ insights: normalized });
};
