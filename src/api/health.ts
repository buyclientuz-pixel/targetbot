import type { RouteHandler } from "../core/types";
import { jsonResponse } from "../core/utils";
import { maskToken } from "../core/auth";

export const healthHandler: RouteHandler = async ({ env }) => {
  return jsonResponse({
    ok: true,
    telegramToken: maskToken(env.TELEGRAM_TOKEN),
    metaConfigured: Boolean(env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET),
    storage: {
      kvUsers: "KV_USERS" in env,
      kvLeads: "KV_LEADS" in env,
      kvMeta: "KV_META" in env,
      r2Reports: "R2_REPORTS" in env,
    },
    timestamp: new Date().toISOString(),
  });
};
