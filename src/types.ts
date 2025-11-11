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
}

export interface ProjectReport {
  project_id: string;
  project_name: string;
  currency: string;
  updated_at: string;
  status?: "active" | "pending" | "paused" | "unknown";
  summary: ProjectSummary;
  campaigns: CampaignMetric[];
  billing?: BillingInfo;
  chat_link?: string | null;
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
  status?: string;
  currency?: string;
  summary?: ProjectSummary | null;
  updated_at?: string | null;
  ad_account_id?: string | null;
  default_period?: string | null;
  billing?: BillingInfo;
}

export interface AdminDashboardData {
  meta_status: MetaAuthStatus;
  accounts: MetaAccountInfo[];
  projects: ProjectCard[];
  logs: DashboardLogEntry[];
}

export interface DashboardLogEntry {
  level: "info" | "warn" | "error";
  message: string;
  timestamp: string;
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
