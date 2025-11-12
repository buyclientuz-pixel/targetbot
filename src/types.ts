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
}

export interface ProjectRecord {
  id: string;
  name: string;
  userId: string;
  telegramChatId?: string;
  telegramThreadId?: number;
  telegramLink?: string;
  adAccountId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectLeadStats {
  total: number;
  new: number;
  done: number;
  latestAt?: string;
}

export interface ProjectSummary extends ProjectRecord {
  leadStats: ProjectLeadStats;
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

export type UserRole = "client" | "manager" | "admin";

export interface UserRecord {
  id: string;
  name: string;
  username?: string;
  role: UserRole;
  createdAt: string;
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
