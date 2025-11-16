import { KvClient } from "../infra/kv";
import { runAutoReports } from "./auto-reports";
import { runAlerts } from "./alerts";
import { runMaintenance } from "./maintenance";
import type { TargetBotEnv } from "../worker/types";
import { R2Client } from "../infra/r2";
import { resolveTelegramToken } from "../config/telegram";
import { PORTAL_AUTO_PERIOD_PLAN, runPortalSync } from "./portal-sync";

export const runScheduledTasks = async (
  event: ScheduledEvent,
  env: TargetBotEnv,
  executionCtx: ExecutionContext,
): Promise<void> => {
  const now = event.scheduledTime ? new Date(event.scheduledTime) : new Date();
  const kv = new KvClient(env.KV);
  const r2 = new R2Client(env.R2);

  executionCtx.waitUntil(
    (async () => {
      const token = resolveTelegramToken(env);
      await runAutoReports(kv, token, now);
      await runAlerts(kv, r2, token, now);
      await runPortalSync(kv, r2, PORTAL_AUTO_PERIOD_PLAN);
      await runMaintenance(kv, r2, now);
    })(),
  );
};
