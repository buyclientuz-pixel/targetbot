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
  reach?: number;
  uniqueReach?: number;
  leads?: number;
  conversations?: number;
  purchases?: number;
  installs?: number;
  engagements?: number;
  thruplays?: number;
  conversions?: number;
  roasValue?: number;
  revenueCurrency?: string;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  cpl?: number;
  cpa?: number;
  roas?: number;
  cpv?: number;
  cpi?: number;
  cpe?: number;
  updatedTime?: string;
}

export type PortalMode = "auto" | "manual";

export type PortalMetricKey =
  | "leads_total"
  | "leads_new"
  | "leads_done"
  | "spend"
  | "impressions"
  | "clicks"
  | "leads"
  | "cpl"
  | "ctr"
  | "cpc"
  | "reach"
  | "messages"
  | "conversations"
  | "cpm"
  | "purchases"
  | "cpa"
  | "roas"
  | "conversions"
  | "engagements"
  | "cpe"
  | "thruplays"
  | "cpv"
  | "installs"
  | "cpi"
  | "freq"
  | "cpurchase";

export type ReportRoutingTarget = "chat" | "admin" | "both";

export interface ProjectAutoReportSettings {
  enabled: boolean;
  times: string[];
  sendTarget: ReportRoutingTarget;
  alertsTarget: ReportRoutingTarget;
  mondayDoubleReport: boolean;
  lastSentDaily?: string | null;
  lastSentMonday?: string | null;
}

export interface ProjectAlertSettings {
  payment: boolean;
  budget: boolean;
  metaApi: boolean;
  pause: boolean;
  target: ReportRoutingTarget;
}

export interface ProjectKpiSettings {
  default: PortalMetricKey[];
  perCampaign: Record<string, PortalMetricKey[]>;
}

export interface ProjectSettingsRecord {
  autoReport: ProjectAutoReportSettings;
  alerts: ProjectAlertSettings;
  kpi: ProjectKpiSettings;
  billing: {
    nextPaymentDate: string | null;
    status: string;
  };
  meta: {
    adAccountId: string;
    status: string;
    name: string;
    currency: string;
  };
}

export interface ProjectPortalRecord {
  portalId: string;
  projectId: string;
  mode: PortalMode;
  campaignIds: string[];
  metrics: PortalMetricKey[];
  createdAt: string;
  updatedAt: string;
  lastRegeneratedAt?: string | null;
  lastSharedAt?: string | null;
  lastReportId?: string | null;
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
  telegramTitle?: string;
  adAccountId?: string;
}

export interface ProjectDeletionSummary {
  project: ProjectRecord;
  metaAccount?: MetaAccountLinkRecord | null;
  telegramGroup?: TelegramGroupLinkRecord | null;
  removedLeads: number;
  removedPayments: number;
  removedReports: number;
  clearedLeadReminders: number;
  clearedPaymentReminders: number;
  updatedSchedules: number;
  portalRemoved?: boolean;
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

export type ProjectReportFrequency = "daily" | "weekly";

export interface ProjectSettings {
  reportFrequency: ProjectReportFrequency;
  quietWeekends: boolean;
  silentReports: boolean;
  leadAlerts: boolean;
}

export interface ProjectReportPreferences {
  campaignIds: string[];
  metrics: PortalMetricKey[];
}

export interface ProjectSummary extends ProjectRecord {
  leadStats: ProjectLeadStats;
  billing: ProjectBillingSummary;
}

export interface PendingPortalOperation {
  projectId: string;
  action: "metrics" | "campaigns";
  page?: number;
  updatedAt: string;
}

export type PendingProjectEditAction = "rename";

export interface PendingProjectEditOperation {
  action: PendingProjectEditAction;
  projectId: string;
  updatedAt?: string;
}

export interface PendingCampaignSelectionRecord {
  projectId: string;
  campaignIds: string[];
  updatedAt: string;
}

export interface PendingKpiSelectionRecord {
  projectId: string;
  campaignId: string;
  metrics: PortalMetricKey[];
  updatedAt: string;
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

export type LeadReminderStatus = "pending" | "notified" | "resolved";

export interface LeadReminderRecord {
  id: string;
  leadId: string;
  projectId: string;
  status: LeadReminderStatus;
  notifiedCount: number;
  createdAt: string;
  updatedAt: string;
  lastNotifiedAt?: string | null;
}

export type PaymentReminderStatus = "pending" | "upcoming" | "overdue";

export interface PaymentReminderRecord {
  id: string;
  projectId: string;
  status: PaymentReminderStatus;
  dueDate?: string | null;
  notifiedCount: number;
  createdAt: string;
  updatedAt: string;
  lastNotifiedAt?: string | null;
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

export type ReportScheduleType = "summary" | "detailed" | "finance" | "sla";

export type ReportScheduleFrequency = "daily" | "weekly";

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

export interface AutoReportProjectBilling {
  status: ProjectBillingSummary["status"];
  label: string;
  nextPaymentDate: string | null;
  tariff: number | null;
}

export interface AutoReportProjectSpend {
  label: string;
  amount: number | null;
  currency: string | null;
  period: string | null;
}

export interface AutoReportProjectEntry {
  projectId: string;
  projectName: string;
  chatId: string;
  chatTitle: string | null;
  chatLink: string | null;
  metaAccountId: string;
  metaAccountName: string;
  adAccountId: string | null;
  leads: ProjectLeadStats;
  billing: AutoReportProjectBilling;
  spend: AutoReportProjectSpend;
  metrics: PortalMetricKey[];
}

export interface AutoReportDataset {
  periodLabel: string;
  generatedAt: string;
  totals: ReportTotals;
  projects: AutoReportProjectEntry[];
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

export interface ReportScheduleRecord {
  id: string;
  title: string;
  type: ReportScheduleType;
  frequency: ReportScheduleFrequency;
  time: string;
  timezone?: string;
  weekdays?: number[];
  projectIds: string[];
  chatId: string;
  format?: "html" | "pdf" | "xlsx" | "csv";
  enabled: boolean;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  lastStatus?: "success" | "error";
  lastError?: string | null;
  metadata?: JsonValue;
  createdAt: string;
  updatedAt: string;
}

export interface ReportDeliveryRecord {
  id: string;
  scheduleId: string;
  reportId?: string;
  type: ReportScheduleType;
  channel: ReportChannel;
  status: "success" | "error";
  deliveredAt: string;
  error?: string | null;
  details?: JsonValue;
}

export type QaIssueType = "project" | "schedule" | "lead-reminder" | "payment-reminder";

export interface QaIssueRecord {
  type: QaIssueType;
  referenceId?: string;
  projectId?: string;
  message: string;
  details?: JsonValue;
}

export interface QaCheckSummary {
  total: number;
  invalid: number;
}

export interface QaScheduleCheckSummary extends QaCheckSummary {
  rescheduled: number;
}

export interface QaRunChecks {
  projects: QaCheckSummary;
  reportSchedules: QaScheduleCheckSummary;
  leadReminders: QaCheckSummary;
  paymentReminders: QaCheckSummary;
}

export interface QaRunRecord {
  id: string;
  createdAt: string;
  durationMs: number;
  checks: QaRunChecks;
  issues: QaIssueRecord[];
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
