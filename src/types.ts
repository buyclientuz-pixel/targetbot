export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export interface JsonObject {
  [key: string]: JsonValue;
}
export interface JsonArray extends Array<JsonValue> {}

export type MetaTokenStatus = "valid" | "expired" | "missing";

export interface MetaTokenRecord {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  userId?: string;
  status: MetaTokenStatus;
}

export interface MetaStatusResponse {
  ok: boolean;
  status: MetaTokenStatus;
  accountName?: string;
  accountId?: string;
  expiresAt?: string;
  refreshedAt?: string;
  issues?: string[];
  accounts?: MetaAdAccount[];
}

export interface MetaAdAccount {
  id: string;
  name: string;
  currency?: string;
  status?: string;
  statusCode?: number;
  statusSeverity?: "success" | "warning" | "error";
  business?: { id?: string; name?: string } | null;
  spend?: number;
  spendCurrency?: string;
  spendPeriod?: string;
  spendFormatted?: string;
  impressions?: number;
  clicks?: number;
  campaigns?: MetaCampaign[];
}

export interface MetaCampaign {
  id: string;
  accountId: string;
  name: string;
  status?: string;
  effectiveStatus?: string;
  objective?: string;
  dailyBudget?: number;
  spend?: number;
  spendCurrency?: string;
  spendPeriod?: string;
  spendFormatted?: string;
  impressions?: number;
  clicks?: number;
  updatedTime?: string;
}

export interface MetaOAuthStatePayload {
  origin?: "telegram" | "admin" | "external";
  chatId?: string;
  messageId?: number;
  userId?: string;
  botUsername?: string;
  botDeeplink?: string;
  returnTo?: string;
  timestamp?: number;
}

export interface MetaAccountLinkRecord {
  accountId: string;
  accountName: string;
  currency?: string | null;
  spentToday?: number | null;
  isLinked: boolean;
  linkedProjectId?: string | null;
  updatedAt?: string;
}

export interface MetaLeadDetails {
  id: string;
  createdAt?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  formId?: string;
  adId?: string;
  campaignId?: string;
  answers: JsonObject;
}

export interface MetaWebhookEventRecord {
  id: string;
  object: string;
  field: string;
  type?: string;
  leadId?: string;
  adAccountId?: string;
  projectId?: string;
  projectName?: string;
  processed: boolean;
  createdAt: string;
  updatedAt: string;
  payload: JsonObject;
}

export interface TelegramGroupLinkRecord {
  chatId: string;
  title?: string | null;
  members?: number | null;
  registered: boolean;
  linkedProjectId?: string | null;
  updatedAt?: string;
}

export interface MetaProjectLinkRecord {
  projectId: string;
  projectName: string;
  accountId: string;
  chatId: string;
  chatTitle?: string | null;
  createdAt: string;
  billingStatus: string;
  nextPaymentDate?: string | null;
  settings: JsonObject;
}

export type ProjectBillingState = "active" | "overdue" | "blocked" | "pending";

export interface ProjectRecord {
  id: string;
  name: string;
  metaAccountId: string;
  metaAccountName: string;
  chatId: string;
  billingStatus: ProjectBillingState;
  nextPaymentDate: string | null;
  tariff: number;
  createdAt: string;
  updatedAt: string;
  settings: JsonObject;
  userId?: string;
  telegramChatId?: string;
  telegramThreadId?: number;
  telegramLink?: string;
  adAccountId?: string;
}

export interface ChatRegistrationRecord {
  id: string;
  chatId: string;
  chatType?: string;
  chatTitle?: string;
  username?: string;
  status: "pending" | "linked";
  linkedProjectId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectLeadStats {
  total: number;
  new: number;
  done: number;
  latestAt?: string;
}

export interface ProjectBillingSummary {
  status: PaymentStatus | "missing";
  active: boolean;
  overdue: boolean;
  amount?: number;
  currency?: string;
  amountFormatted?: string;
  periodStart?: string;
  periodEnd?: string;
  periodLabel?: string;
  paidAt?: string | null;
  updatedAt?: string;
  notes?: string;
}

export interface ProjectSummary extends ProjectRecord {
  leadStats: ProjectLeadStats;
  billing: ProjectBillingSummary;
}

export interface LeadRecord {
  id: string;
  projectId: string;
  name: string;
  phone?: string;
  source: string;
  status: "new" | "done";
  createdAt: string;
}

export type PaymentStatus = "pending" | "active" | "overdue" | "cancelled";

export interface PaymentRecord {
  id: string;
  projectId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  periodStart: string;
  periodEnd: string;
  paidAt?: string | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReportType = "summary" | "detailed" | "finance" | "custom";

export type ReportChannel = "telegram" | "web" | "api";

export interface ReportFilters {
  datePreset?: string;
  since?: string;
  until?: string;
}

export interface ReportTotals {
  projects: number;
  leadsTotal: number;
  leadsNew: number;
  leadsDone: number;
}

export interface ReportRecord {
  id: string;
  projectId: string;
  type: ReportType;
  title: string;
  format: "pdf" | "xlsx" | "csv" | "html";
  url?: string;
  generatedAt: string;
  createdAt: string;
  updatedAt: string;
  projectIds?: string[];
  filters?: ReportFilters;
  summary?: string;
  totals?: ReportTotals;
  channel?: ReportChannel;
  generatedBy?: string;
  metadata?: JsonValue;
}

export type SettingScope = "bot" | "portal" | "reports" | "billing" | "system";

export interface SettingRecord {
  key: string;
  value: JsonValue;
  scope: SettingScope;
  updatedAt: string;
}

export interface CommandLogRecord {
  id: string;
  userId?: string;
  chatId?: string;
  command: string;
  payload?: JsonValue;
  createdAt: string;
}

export type UserRole = "owner" | "manager" | "client";

export interface UserRecord {
  id: string;
  name?: string;
  username?: string;
  role: UserRole;
  createdAt: string;
  registeredAt: string;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
  details?: JsonValue;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
