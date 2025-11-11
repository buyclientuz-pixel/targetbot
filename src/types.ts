export interface CampaignMetric {
  id: string;
  name: string;
  status: string;
  spend: number;
  leads: number;
  clicks: number;
  impressions: number;
  cpa: number | null;
  cpc: number | null;
  ctr: number | null;
  frequency?: number | null;
  last_active?: string | null;
  status_updated_at?: string | null;
}

export interface ProjectSummary {
  spend: number;
  leads: number;
  clicks: number;
  impressions: number;
  frequency: number | null;
  cpa: number | null;
  cpc: number | null;
  ctr: number | null;
  active_campaigns?: number | null;
}

export interface BillingInfo {
  card_last4?: string | null;
  next_payment_date?: string | null;
  days_to_pay?: number | null;
  spend_limit?: number | null;
  last_payment?: string | null;
  next_payment?: string | null;
  amount?: number | null;
  currency?: string | null;
  status?: "paid" | "due" | "overdue" | "inactive" | string | null;
}

export interface ProjectKpiTargets {
  target_cpa?: number | null;
  target_ctr?: number | null;
  planned_spend?: number | null;
}

export interface ProjectAlertsConfig {
  chat_id?: string | null;
  admin_chat_id?: string | null;
  cpa_threshold?: number | null;
  spend_limit?: number | null;
  moderation_hours?: number | null;
  message_thread_id?: number | null;
}

export interface ProjectConfigRecord {
  id: string;
  name: string;
  chat_id?: number | string | null;
  chat_username?: string | null;
  chat_link?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  billing_day?: number | null;
  status?: string | null;
  alerts_enabled?: boolean;
  silent_weekends?: boolean;
  last_sync?: string | null;
  portal_url?: string | null;
  manager?: string | null;
  threads?: Record<string, number> | null;
  kpi?: ProjectKpiTargets | null;
  alerts?: ProjectAlertsConfig | null;
}

export interface ProjectReport {
  project_id: string;
  project_name: string;
  currency: string;
  updated_at: string;
  period?: string | null;
  period_label?: string | null;
  status?: "active" | "pending" | "paused" | "unknown";
  summary: ProjectSummary;
  campaigns: CampaignMetric[];
  billing?: BillingInfo;
  chat_link?: string | null;
  kpi?: ProjectKpiTargets | null;
  alerts?: ProjectAlertsConfig | null;
  portal_url?: string | null;
}

export interface MetaAuthStatus {
  ok: boolean;
  last_refresh?: string;
  expires_at?: string;
  account_name?: string;
  issues?: string[];
}

export interface MetaAccountInfo {
  id: string;
  name: string;
  currency: string;
  spend_cap?: number | null;
  balance?: number | null;
  status?: string;
  payment_method?: string | null;
  last_update?: string | null;
  issues?: string[];
}

export interface ProjectCard {
  id: string;
  name: string;
  chat_link?: string | null;
  chat_id?: string | number | null;
  chat_username?: string | null;
  status?: string;
  currency?: string;
  account_name?: string | null;
  account_id?: string | null;
  summary?: ProjectSummary | null;
  updated_at?: string | null;
  ad_account_id?: string | null;
  default_period?: string | null;
  billing?: BillingInfo;
  kpi?: ProjectKpiTargets | null;
  alerts?: ProjectAlertsConfig | null;
  billing_day?: number | null;
  alerts_enabled?: boolean | null;
  silent_weekends?: boolean | null;
  last_sync?: string | null;
  portal_url?: string | null;
  manager?: string | null;
}

export interface AdminDashboardData {
  meta_status: MetaAuthStatus;
  accounts: MetaAccountInfo[];
  projects: ProjectCard[];
  logs: DashboardLogEntry[];
  tokens: TokenStatus[];
  storage: StorageOverview;
}

export interface DashboardLogEntry {
  level: "info" | "warn" | "error";
  message: string;
  timestamp: string;
}

export interface TokenStatus {
  name: string;
  configured: boolean;
  hint?: string;
}

export interface StorageOverview {
  reports: number;
  projects: number;
  alerts: number;
  billing: number;
  kvFallbacks?: number | null;
}

export interface WorkerEnv extends Record<string, unknown> {
  REPORTS_BUCKET?: R2Bucket;
  R2_BUCKET?: R2Bucket;
  LOGS_BUCKET?: R2Bucket;
  FALLBACK_KV?: KVNamespace;
  LOGS_NAMESPACE?: KVNamespace;
  SESSION_NAMESPACE?: KVNamespace;
  META_MANAGE_TOKEN?: string;
  META_LONG_TOKEN?: string;
  META_ACCESS_TOKEN?: string;
  FB_GRAPH_VERSION?: string;
  BOT_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TG_API_TOKEN?: string;
  ADMIN_KEY?: string;
  DEFAULT_TZ?: string;
  WORKER_URL?: string;
}

export interface AlertPayload {
  project_id: string;
  campaign_id?: string;
  metric: string;
  value: number;
  threshold: number;
  direction: "above" | "below";
  description?: string;
}

export interface ProjectAlertState {
  cpa_exceeded?: boolean;
  spend_exceeded?: boolean;
  moderation_alerts?: string[];
  updated_at?: string;
}
