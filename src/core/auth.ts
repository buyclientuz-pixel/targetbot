import type { PortalKeyRole } from "./types";
import { RouterContext } from "./types";
import { fail } from "./utils";
import { getPortalKey, savePortalKey } from "./db";

function extractAuthKey(context: RouterContext) {
  const headerKey = context.request.headers.get("x-auth-key") ?? context.request.headers.get("X-Auth-Key");
  const bearer = getBearerToken(context.request);
  const query = new URL(context.request.url).searchParams.get("key");
  return headerKey ?? bearer ?? query ?? undefined;
}

interface RequireSignatureOptions {
  roles?: PortalKeyRole[];
  optional?: boolean;
}

export async function requirePortalSignature(context: RouterContext, options: RequireSignatureOptions = {}) {
  const key = extractAuthKey(context);
  if (!key) {
    return options.optional ? null : fail("Unauthorized", 401);
  }

  if (context.env.ADMIN_KEY && key === context.env.ADMIN_KEY) {
    context.data = { ...(context.data ?? {}), auth: { key, role: "admin", source: "env" } };
    return null;
  }

  const record = await getPortalKey(context.env, key);
  if (!record) {
    return fail("Forbidden", 403);
  }

  if (options.roles && !options.roles.includes(record.role)) {
    return fail("Forbidden", 403);
  }

  const updated = { ...record, lastUsedAt: new Date().toISOString() };
  await savePortalKey(context.env, updated);
  context.data = { ...(context.data ?? {}), auth: updated };
  return null;
}

export function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer") return undefined;
  return token;
}

export function isAdminRequest(context: RouterContext) {
  const auth = (context.data?.auth as { role?: PortalKeyRole; key?: string } | undefined) ?? undefined;
  if (auth?.role === "admin") return true;
  const key = extractAuthKey(context);
  return Boolean(context.env.ADMIN_KEY && key === context.env.ADMIN_KEY);
}

export async function requireAdmin(context: RouterContext) {
  const result = await requirePortalSignature(context, { roles: ["admin"] });
  if (result) return result;
  if (!isAdminRequest(context)) {
    return fail("Unauthorized", 401);
  }
  return null;
}

export function maskToken(token?: string) {
  if (!token) return "";
  if (token.length <= 6) return `${token.slice(0, 3)}***`;
  return `${token.slice(0, 3)}***${token.slice(-3)}`;
}
