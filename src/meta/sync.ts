import type { RouteHandler } from "../core/types";
import { fail, ok, readJsonBody } from "../core/utils";
import { getMetaToken, saveMetaToken } from "../core/db";
import { graphRequest } from "./client";
import { requireAdmin } from "../core/auth";

interface CampaignResponse {
  data: Array<{
    id: string;
    name: string;
    status: string;
    effective_status: string;
  }>;
}

export const metaSyncHandler: RouteHandler = async (context) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;
  const token = await getMetaToken(context.env);
  if (!token) return fail("Meta token not found", 404);
  const url = new URL(context.request.url);
  const body = await readJsonBody<{
    ad_account_id?: string;
    accountId?: string;
    campaign_id?: string;
    campaignId?: string;
  }>(context.request);

  const accountId =
    url.searchParams.get("ad_account_id") ?? body?.ad_account_id ?? body?.accountId ?? token.accountId ?? undefined;
  if (!accountId) return fail("Missing ad_account_id", 400);
  const campaignId =
    url.searchParams.get("campaign_id") ?? body?.campaign_id ?? body?.campaignId ?? token.campaignId ?? undefined;

  const campaigns = await graphRequest<CampaignResponse>(
    context.env,
    `${accountId}/campaigns`,
    { fields: "id,name,status,effective_status", limit: "100" },
    token.accessToken,
  );
  const summary = {
    fetchedAt: new Date().toISOString(),
    accountId,
    total: campaigns.data.length,
    campaigns: campaigns.data,
  };
  await context.env.KV_META.put(`meta:sync:${accountId}`, JSON.stringify(summary));
  if (campaignId || token.accountId !== accountId) {
    await saveMetaToken(context.env, { ...token, accountId, campaignId });
  }
  return ok({ summary });
};
