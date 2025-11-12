import type { RouteHandler } from "../core/types";
import { ok, readJsonBody } from "../core/utils";
import { requireAdmin } from "../core/auth";

export const getSettingsHandler: RouteHandler = async (context) => {
  const authError = requireAdmin(context);
  if (authError) return authError;
  const token = await context.env.KV_META.get("meta:token");
  return ok({
    telegramTokenConfigured: Boolean(context.env.TELEGRAM_TOKEN),
    facebookAppId: context.env.FACEBOOK_APP_ID,
    workerUrl: context.env.WORKER_PUBLIC_URL,
    metaToken: token ? JSON.parse(token) : null,
  });
};

export const updateSettingsHandler: RouteHandler = async (context) => {
  const authError = requireAdmin(context);
  if (authError) return authError;
  const payload = await readJsonBody<Record<string, string>>(context.request);
  if (!payload) {
    return ok({ updated: false });
  }
  await context.env.KV_META.put("settings:last", JSON.stringify({
    payload,
    updatedAt: new Date().toISOString(),
  }));
  return ok({ updated: true });
};
