import { RouterContext } from "./types";
import { fail } from "./utils";

export function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer") return undefined;
  return token;
}

export function isAdminRequest(context: RouterContext) {
  const queryKey = new URL(context.request.url).searchParams.get("key");
  const bearer = getBearerToken(context.request);
  const adminKey = context.env.ADMIN_KEY;
  return Boolean(adminKey && (queryKey === adminKey || bearer === adminKey));
}

export function requireAdmin(context: RouterContext) {
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
