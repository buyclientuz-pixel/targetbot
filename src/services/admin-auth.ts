import { jsonResponse } from "../http/responses";
import type { RequestContext } from "../worker/context";

const ADMIN_HEADER = "x-admin-key";

const misconfigured = (): Response =>
  jsonResponse(
    { ok: false, error: "ADMIN_KEY is not configured" },
    { status: 500, headers: { "cache-control": "no-store" } },
  );

const unauthorized = (): Response =>
  jsonResponse({ ok: false, error: "Admin key required" }, { status: 401, headers: { "cache-control": "no-store" } });

const normaliseToken = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    return trimmed.slice(7).trim();
  }
  return trimmed;
};

export const ensureAdminRequest = (context: RequestContext): Response | null => {
  const configured = context.env.ADMIN_KEY ?? context.env.ADMIN_ID ?? null;
  if (!configured) {
    return misconfigured();
  }
  const headerToken = normaliseToken(context.request.headers.get(ADMIN_HEADER));
  const authHeader = normaliseToken(context.request.headers.get("authorization"));
  const provided = headerToken ?? authHeader;
  if (!provided || provided !== configured) {
    return unauthorized();
  }
  return null;
};
