import { jsonResponse, unauthorized } from "../utils/http";
import { checkAndRefreshFacebookToken, getFacebookTokenStatus } from "../fb/auth";
import { WorkerEnv } from "../types";

const extractAdminKey = (request: Request): string | null => {
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      return token;
    }
  }
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  return key && key.trim() ? key.trim() : null;
};

const ensureAdminAuth = (request: Request, env: WorkerEnv): Response | null => {
  const configuredKey = typeof env.ADMIN_KEY === "string" ? env.ADMIN_KEY : "";
  if (!configuredKey) {
    return null;
  }
  const provided = extractAdminKey(request);
  if (provided === configuredKey) {
    return null;
  }
  return unauthorized("Invalid admin key");
};

export const handleFacebookStatusApi = async (
  request: Request,
  env: WorkerEnv,
): Promise<Response> => {
  const authError = ensureAdminAuth(request, env);
  if (authError) {
    return authError;
  }

  const status = await getFacebookTokenStatus(env);
  return jsonResponse(status);
};

export const handleFacebookRefreshApi = async (
  request: Request,
  env: WorkerEnv,
): Promise<Response> => {
  const authError = ensureAdminAuth(request, env);
  if (authError) {
    return authError;
  }

  const result = await checkAndRefreshFacebookToken(env, { force: true, notify: true });
  return jsonResponse(result);
};
