import type { RouteHandler } from "../core/types";
import { requireAdmin } from "../core/auth";
import { getMetaStatsSummary, getMetaToken } from "../core/db";
import { ok } from "../core/utils";

function sanitizeSyncRecord(record: unknown) {
  if (!record || typeof record !== "object") return null;
  const data = record as Record<string, unknown>;
  return {
    fetchedAt: typeof data.fetchedAt === "string" ? data.fetchedAt : undefined,
    accountId: typeof data.accountId === "string" ? data.accountId : undefined,
    total: typeof data.total === "number" ? data.total : undefined,
  };
}

export const metaStatusHandler: RouteHandler = async (context) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  const token = await getMetaToken(context.env);
  const summary = await getMetaStatsSummary(context.env);
  let lastSync: ReturnType<typeof sanitizeSyncRecord> = null;

  if (token?.accountId) {
    const syncRaw = await context.env.KV_META.get(`meta:sync:${token.accountId}`);
    if (syncRaw) {
      try {
        lastSync = sanitizeSyncRecord(JSON.parse(syncRaw));
      } catch (error) {
        console.error("Failed to parse meta sync record", error);
      }
    }
  }

  return ok({
    connected: Boolean(token),
    token: token
      ? {
          accessToken: token.accessToken ? `${token.accessToken.slice(0, 6)}…` : undefined,
          updatedAt: token.updatedAt,
          expiresAt: token.expiresAt,
          accountId: token.accountId,
          campaignId: token.campaignId,
        }
      : null,
    summary,
    lastSync,
  });
};
