import type { KvClient } from "../infra/kv";
import type { R2Client } from "../infra/r2";

import { getProjectsByUser } from "../domain/spec/projects-by-user";
import { requireProjectRecord, type ProjectRecord } from "../domain/spec/project";
import { getBillingRecord, type BillingRecord } from "../domain/spec/billing";
import { getAlertsRecord, type AlertsRecord } from "../domain/spec/alerts";
import { getAutoreportsRecord, type AutoreportsRecord } from "../domain/spec/autoreports";
import {
  getProjectLeadsList,
  type ProjectLeadsListRecord,
  LEAD_STATUSES,
} from "../domain/spec/project-leads";
import { getMetaCampaignsDocument, type MetaCampaignsDocument } from "../domain/spec/meta-campaigns";
import {
  getPaymentsHistoryDocument,
  type PaymentsHistoryDocument,
} from "../domain/spec/payments-history";

const createDefaultBilling = (project: ProjectRecord): BillingRecord => ({
  tariff: 0,
  currency: project.settings.currency,
  nextPaymentDate: new Date().toISOString().slice(0, 10),
  autobilling: false,
});

const createDefaultAlerts = (): AlertsRecord => ({
  enabled: false,
  channel: "chat",
  types: {
    leadInQueue: false,
    pause24h: false,
    paymentReminder: false,
  },
  leadQueueThresholdHours: 1,
  pauseThresholdHours: 24,
  paymentReminderDays: [7, 1],
});

const createDefaultAutoreports = (): AutoreportsRecord => ({
  enabled: false,
  time: "10:00",
  mode: "yesterday_plus_week",
  sendTo: "chat",
});

const createEmptyLeadsList = (): ProjectLeadsListRecord => ({
  stats: { total: 0, today: 0 },
  leads: [],
});

const createEmptyMetaCampaigns = (): MetaCampaignsDocument => ({
  period: { from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) },
  summary: { spend: 0, impressions: 0, clicks: 0, leads: 0, messages: 0 },
  campaigns: [],
});

const createEmptyPayments = (): PaymentsHistoryDocument => ({ payments: [] });

export interface ProjectBundle {
  project: ProjectRecord;
  billing: BillingRecord;
  alerts: AlertsRecord;
  autoreports: AutoreportsRecord;
  leads: ProjectLeadsListRecord;
  campaigns: MetaCampaignsDocument;
  payments: PaymentsHistoryDocument;
}

export const loadUserProjects = async (kv: KvClient, userId: number): Promise<ProjectRecord[]> => {
  const membership = await getProjectsByUser(kv, userId);
  if (!membership) {
    return [];
  }

  const projects = await Promise.all(
    membership.projects.map(async (projectId) => {
      try {
        return await requireProjectRecord(kv, projectId);
      } catch {
        return null;
      }
    }),
  );

  return projects.filter((project): project is ProjectRecord => project !== null);
};

export const loadProjectBundle = async (
  kv: KvClient,
  r2: R2Client,
  projectId: string,
): Promise<ProjectBundle> => {
  const project = await requireProjectRecord(kv, projectId);
  const [billingRaw, alertsRaw, autoreportsRaw, leadsRaw, campaignsRaw, paymentsRaw] = await Promise.all([
    getBillingRecord(kv, projectId),
    getAlertsRecord(kv, projectId),
    getAutoreportsRecord(kv, projectId),
    getProjectLeadsList(r2, projectId),
    getMetaCampaignsDocument(r2, projectId),
    getPaymentsHistoryDocument(r2, projectId),
  ]);

  return {
    project,
    billing: billingRaw ?? createDefaultBilling(project),
    alerts: alertsRaw ?? createDefaultAlerts(),
    autoreports: autoreportsRaw ?? createDefaultAutoreports(),
    leads: leadsRaw ?? createEmptyLeadsList(),
    campaigns: campaignsRaw ?? createEmptyMetaCampaigns(),
    payments: paymentsRaw ?? createEmptyPayments(),
  };
};

export const leadStatusLabel = (status: ProjectLeadsListRecord["leads"][number]["status"]): string => {
  switch (status) {
    case "new":
      return "🆕 Новые";
    case "processing":
      return "⏳ В обработке";
    case "done":
      return "✅ Завершённые";
    case "trash":
      return "🗑 В корзине";
    default:
      return status;
  }
};

export const ALL_LEAD_STATUSES = [...LEAD_STATUSES];
