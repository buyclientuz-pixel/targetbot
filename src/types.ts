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
}

export interface MetaAdAccount {
  id: string;
  name: string;
  currency?: string;
  status?: string;
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

export interface LeadRecord {
  id: string;
  projectId: string;
  name: string;
  phone?: string;
  source: string;
  status: "new" | "done";
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
