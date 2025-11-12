import type { RouteHandler } from "../core/types";
import { fail, ok } from "../core/utils";
import { getMetaToken } from "../core/db";
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
  const accountId = url.searchParams.get("ad_account_id");
  if (!accountId) return fail("Missing ad_account_id", 400);
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
  return ok({ summary });
};
