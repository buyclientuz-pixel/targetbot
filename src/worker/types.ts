export interface TargetBotEnv {
  KV: KVNamespace;
  R2: R2Bucket;
  TELEGRAM_BOT_TOKEN?: string;
  BOT_TOKEN?: string;
  TELEGRAM_SECRET?: string;
  WORKER_URL?: string;
  DEFAULT_TZ?: string;
  ADMIN_ID?: string;
  ADMIN_IDS?: string;
  FB_APP_ID?: string;
  FB_APP_SECRET?: string;
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  META_REDIRECT_URI?: string;
  META_WEBHOOK_VERIFY_TOKEN?: string;
}

export type TargetBotBindings = TargetBotEnv;

export interface WorkerRequestState {
  params: Record<string, string>;
}

export interface WorkerContextOptions {
  cors?: {
    allowOrigin?: string;
    allowMethods?: string;
    allowHeaders?: string;
  };
}
