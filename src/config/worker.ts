import type { TargetBotEnv } from "../worker/types";
import { normaliseBaseUrl } from "../utils/url";

export const DEFAULT_WORKER_DOMAIN = "th-reports.buyclientuz.workers.dev";

export const resolveWorkerBaseUrl = (env: TargetBotEnv): string => {
  return normaliseBaseUrl(env.WORKER_URL, DEFAULT_WORKER_DOMAIN) || `https://${DEFAULT_WORKER_DOMAIN}`;
};
