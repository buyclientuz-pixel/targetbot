import type { PortalKeyRole, RouteHandler } from "../core/types";
import { ok, readJsonBody, fail } from "../core/utils";
import { requireAdmin } from "../core/auth";
import { createPortalKey, deletePortalKey, listPortalKeys } from "../core/db";

export const getSettingsHandler: RouteHandler = async (context) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;
  const token = await context.env.KV_META.get("meta:token");
  return ok({
    telegramTokenConfigured: Boolean(context.env.TELEGRAM_TOKEN),
    facebookAppId: context.env.FACEBOOK_APP_ID,
    workerUrl: context.env.WORKER_PUBLIC_URL,
    metaToken: token ? JSON.parse(token) : null,
    apiKeys: await listPortalKeys(context.env),
  });
};

export const updateSettingsHandler: RouteHandler = async (context) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;
  const payload = await readJsonBody<Record<string, string>>(context.request);
  if (!payload) {
    return ok({ updated: false });
  }
  if (payload.action === "create_key") {
    const requestedRole =
      typeof payload.role === "string" ? (payload.role.toLowerCase() as PortalKeyRole) : undefined;
    const allowedRoles: PortalKeyRole[] = ["admin", "manager", "partner", "service"];
    const role = requestedRole && allowedRoles.includes(requestedRole) ? requestedRole : "partner";
    const record = await createPortalKey(context.env, {
      label: payload.label,
      role,
      owner:
        typeof payload.owner === "string" && payload.owner.trim().length > 0
          ? payload.owner.trim()
          : undefined,
    });
    return ok({ created: true, key: record });
  }
  if (payload.action === "delete_key") {
    const key = payload.key;
    if (!key) {
      return fail("Missing key", 400);
    }
    await deletePortalKey(context.env, key);
    return ok({ deleted: true, key });
  }
  await context.env.KV_META.put("settings:last", JSON.stringify({
    payload,
    updatedAt: new Date().toISOString(),
  }));
  return ok({ updated: true });
};
