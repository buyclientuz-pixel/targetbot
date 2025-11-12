import { RouterContext } from "./types";
import { uuid } from "./utils";

export async function logEvent(
  env: RouterContext["env"],
  event: string,
  details: Record<string, unknown> = {},
) {
  const entry = {
    id: uuid(),
    event,
    details,
    timestamp: new Date().toISOString(),
  };
  await env.KV_LOGS.put(`log:${Date.now()}:${entry.id}`, JSON.stringify(entry));
  return entry;
}

export async function logError(env: RouterContext["env"], error: unknown, context?: string) {
  const message = error instanceof Error ? error.message : String(error);
  return logEvent(env, "error", {
    message,
    stack: error instanceof Error ? error.stack : undefined,
    context,
  });
}
