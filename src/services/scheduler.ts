import { KvClient } from "../infra/kv";
import { runAutoReports } from "./auto-reports";
import { runAlerts } from "./alerts";
import type { TargetBotEnv } from "../worker/types";

export const runScheduledTasks = async (
  event: ScheduledEvent,
  env: TargetBotEnv,
  executionCtx: ExecutionContext,
): Promise<void> => {
  const now = event.scheduledTime ? new Date(event.scheduledTime) : new Date();
  const kv = new KvClient(env.KV);

  executionCtx.waitUntil(
    (async () => {
      await runAutoReports(kv, env.TELEGRAM_BOT_TOKEN, now);
      await runAlerts(kv, env.TELEGRAM_BOT_TOKEN, now);
    })(),
  );
};
