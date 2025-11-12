export interface Env {
  KV_USERS: KVNamespace;
  KV_LEADS: KVNamespace;
  KV_META: KVNamespace;
  KV_LOGS: KVNamespace;
  R2_REPORTS: R2Bucket;
  DEFAULT_TZ?: string;
  ADMIN_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  WORKER_URL?: string;
}

export interface RouterRequest extends Request {
  params?: Record<string, string>;
}

export interface LeadRecord {
  id: string;
  name: string;
  contact: string;
  source: string;
  status: string;
  createdAt: string;
}

export interface UserRecord {
  id: string;
  telegramId: string;
  firstName?: string;
  lastName?: string;
  role: string;
  createdAt: string;
}

export interface DashboardSnapshot {
  metrics: {
    leadsToday: number;
    leadsYesterday: number;
    cpl: string;
    ctr: string;
  };
  integrations: {
    meta: string;
    telegram: string;
  };
}
