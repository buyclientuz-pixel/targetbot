export type UserRole = "client" | "manager" | "admin";

export interface UserRecord {
  id: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  token: string;
  createdAt: string;
  meta?: Record<string, unknown>;
}

export interface LeadRecord {
  id: string;
  userId: number;
  name: string;
  contact: string;
  status: "new" | "in_progress" | "closed";
  source: "telegram" | "facebook" | "manual" | string;
  campaignId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MetaTokenRecord {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  accountId?: string;
  campaignId?: string;
  updatedAt: string;
}

export interface MetaInsight {
  campaignId: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number | null;
  ctr: number | null;
}

export interface MetaStatsSummary {
  updatedAt: string;
  totals: {
    spend: number;
    leads: number;
    clicks: number;
    impressions: number;
    cpl: number | null;
    ctr: number | null;
  };
  insights: MetaInsight[];
}

export interface ReportSummary {
  id: string;
  period: {
    from: string;
    to: string;
  };
  createdAt: string;
  url?: string;
  filename: string;
}

export type PortalKeyRole = "admin" | "manager" | "partner" | "service";

export interface PortalKeyRecord {
  key: string;
  role: PortalKeyRole;
  label?: string;
  owner?: string;
  scopes?: string[];
  createdAt: string;
  lastUsedAt?: string;
}

export interface WebhookStatus {
  configured: boolean;
  url?: string;
  pendingUpdateCount?: number;
  hasCustomCertificate?: boolean;
  lastErrorMessage?: string;
  lastErrorDate?: string;
  error?: string;
}

export interface DashboardSnapshot {
  generatedAt: string;
  leads: {
    total: number;
    today: number;
    yesterday: number;
    statuses: Record<string, number>;
    sources: Record<string, number>;
    recent: LeadRecord[];
  };
  meta?: MetaStatsSummary | null;
  telegramWebhook: WebhookStatus;
}

export interface AuthenticatedRequest {
  isAdmin: boolean;
  user?: UserRecord;
}

export interface Env {
  KV_USERS: KVNamespace;
  KV_LEADS: KVNamespace;
  KV_META: KVNamespace;
  KV_LOGS: KVNamespace;
  R2_REPORTS: R2Bucket;
  TELEGRAM_TOKEN?: string;
  FACEBOOK_APP_ID?: string;
  FACEBOOK_APP_SECRET?: string;
  FACEBOOK_REDIRECT_URL?: string;
  WORKER_PUBLIC_URL?: string;
  ADMIN_KEY?: string;
  JWT_SECRET?: string;
}

export interface RouterContext {
  env: Env;
  request: Request;
  params: Record<string, string>;
  data?: Record<string, unknown>;
  ctx: ExecutionContext;
}

export type RouteHandler = (context: RouterContext) => Promise<Response> | Response;
