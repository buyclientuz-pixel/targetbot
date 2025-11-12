import { jsonResponse } from "../utils/http";
import { EnvBindings, listCommandLogs } from "../utils/storage";
import { ApiError, ApiSuccess, CommandLogRecord } from "../types";

const ensureEnv = (env: unknown): EnvBindings => {
  if (!env || typeof env !== "object" || !("DB" in env) || !("R2" in env)) {
    throw new Error("Env bindings are not configured");
  }
  return env as EnvBindings;
};

const parseLimit = (request: Request): number => {
  try {
    const url = new URL(request.url);
    const raw = url.searchParams.get("limit");
    if (!raw) {
      return 50;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 50;
    }
    return Math.min(Math.floor(parsed), 100);
  } catch (error) {
    return 50;
  }
};

export const handleCommandLogsList = async (request: Request, env: unknown): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const limit = parseLimit(request);
    const logs = await listCommandLogs(bindings);
    const payload: ApiSuccess<CommandLogRecord[]> = { ok: true, data: logs.slice(0, limit) };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 500 });
  }
};
