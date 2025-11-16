import { jsonResponse } from "../http/responses";
import type { RequestContext } from "../worker/context";

const ADMIN_HEADER = "x-admin-key";
const ADMIN_HEADERS = {
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization, x-admin-key",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
};

const misconfigured = (): Response =>
  jsonResponse({ ok: false, error: "ADMIN_KEY is not configured" }, { status: 500, headers: ADMIN_HEADERS });

const unauthorized = (): Response =>
  jsonResponse({ ok: false, error: "Admin key required" }, { status: 401, headers: ADMIN_HEADERS });

const stripQuotes = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed.length) {
    return null;
  }
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

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
  const configuredRaw = context.env.ADMIN_KEY ?? context.env.ADMIN_ID ?? null;
  const configured = normaliseToken(stripQuotes(configuredRaw));
  if (!configured) {
    return misconfigured();
  }
  const headerToken = normaliseToken(stripQuotes(context.request.headers.get(ADMIN_HEADER)));
  const authHeader = normaliseToken(stripQuotes(context.request.headers.get("authorization")));
  const provided = headerToken ?? authHeader;
  if (!provided || provided !== configured) {
    return unauthorized();
  }
  return null;
};
