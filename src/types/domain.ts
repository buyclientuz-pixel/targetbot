export type Role = "SUPER_ADMIN" | "ADMIN" | "VIEWER";

export const ROLES: Role[] = ["SUPER_ADMIN", "ADMIN", "VIEWER"];

export interface ChatRef {
  title?: string;
  tgTopicLink?: string;
  chatId: number;
  threadId?: number;
}

export interface Project {
  id: string;
  projectName?: string;
  accountName?: string;
  description?: string;
  chats: ChatRef[];
}

export type DigestPreset = "today" | "yesterday" | "last_7d";

export type ReportSlot = "daily_9" | "daily_18" | "weekly_mon" | "monthly_1";

export interface ReportSchedule {
  projectId: string;
  tz: string;
  cron: string;
  targets: ReportSlot[];
  preset: DigestPreset;
  lastRunAt?: string;
}

export type Objective =
  | "LEAD_GENERATION"
  | "CONVERSIONS"
  | "AWARENESS"
  | "TRAFFIC"
  | "ENGAGEMENT"
  | "APP_PROMOTION"
  | "SALES";

export const OBJECTIVES: Objective[] = [
  "LEAD_GENERATION",
  "CONVERSIONS",
  "AWARENESS",
  "TRAFFIC",
  "ENGAGEMENT",
  "APP_PROMOTION",
  "SALES",
];

export interface MetricSet {
  fields: string[];
  breakdowns?: string[];
}

export interface ProjectObjective {
  objective: Objective;
  source: "auto" | "manual";
  updatedAt: string;
}

export interface BillingSnapshot {
  limit: number;
  spent: number;
  alertsEnabled: boolean;
  meta?: Record<string, unknown>;
  updatedAt: string;
}

export interface AdminRoles {
  roles: Record<string, Role>;
}

export interface PortalLinkResponse {
  url: string;
}

export interface WorkerLogEntry {
  id: string;
  message: string;
  level: "info" | "warn" | "error";
  timestamp: string;
  context?: Record<string, unknown>;
}
