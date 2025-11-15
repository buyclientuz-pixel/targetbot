/* eslint-disable no-console */

declare const process: { exit(code?: number): never };

type TestCase = { name: string; fn: () => void | Promise<void> };

const tests: TestCase[] = [];

const test = (name: string, fn: () => void | Promise<void>): void => {
  tests.push({ name, fn });
};

const toJson = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
};

const expect = {
  equal(actual: unknown, expected: unknown, message?: string) {
    if (actual !== expected) {
      throw new Error(message ?? `Expected ${toJson(actual)} to equal ${toJson(expected)}`);
    }
  },
  ok(value: unknown, message?: string) {
    if (!value) {
      throw new Error(message ?? `Expected value to be truthy, received ${toJson(value)}`);
    }
  },
  deepEqual(actual: unknown, expected: unknown, message?: string) {
    if (toJson(actual) !== toJson(expected)) {
      throw new Error(message ?? `Expected ${toJson(actual)} to deepEqual ${toJson(expected)}`);
    }
  },
};

import { Buffer } from "node:buffer";

import {
  buildAutoReportNotification,
  evaluateAutoReportTrigger,
} from "../src/utils/auto-report-engine";
import { buildAutoReportDataset } from "../src/utils/reports";
import { applyKpiSelection } from "../src/utils/kpi";
import { normalizeCampaigns } from "../src/utils/campaigns";
import { ensureTelegramUrl, ensureTelegramUrlFromId, resolveChatLink } from "../src/utils/chat-links";
import { evaluateQaDataset, runRegressionChecks } from "../src/utils/qa";
import { appendProjectPayment } from "../src/utils/payments";
import { applyProjectSettingsPatch, extractProjectSettings, summarizeProjects } from "../src/utils/projects";
import { handlePaymentsCreate } from "../src/api/payments";
import { ProgressReporter, ProgressSnapshot } from "../src/utils/progress-reporter";
import { calculateLeadAnalytics } from "../src/utils/analytics";
import { createSlaReport } from "../src/utils/sla";
import { renderPortal } from "../src/views/portal";
import {
  EnvBindings,
  listLeads,
  listPayments,
  listProjects,
  listReports,
  readPortalSnapshotCache,
  saveLeads,
  savePortals,
  saveProjects,
  writePortalSnapshotCache,
  writePortalReportCache,
  getReportAsset,
} from "../src/utils/storage";
import {
  ApiSuccess,
  AutoReportDataset,
  NormalizedCampaign,
  MetaAdAccount,
  MetaCampaign,
  LeadRecord,
  PaymentRecord,
  PaymentReminderRecord,
  ProjectBillingSummary,
  ProjectPortalRecord,
  ProjectRecord,
  ProjectSummary,
  PortalComputationResult,
  PortalSnapshotCacheDescriptor,
  PortalSnapshotPayload,
  ReportScheduleRecord,
} from "../src/types";
import worker, {
  testBuildPortalApiPayload,
  testResolvePortalRequestForProject,
} from "../src/index";

class MemoryKV implements KVNamespace {
  private readonly store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  async put(key: string, value: string, _options?: KVPutOptions): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

class MemoryR2ObjectBody implements R2ObjectBody {
  constructor(private readonly value: string) {}

  async text(): Promise<string> {
    return this.value;
  }

  async json<T = unknown>(): Promise<T> {
    return JSON.parse(this.value) as T;
  }
}

class MemoryR2 implements R2Bucket {
  private readonly store = new Map<string, string>();

  async get(key: string): Promise<R2ObjectBody | null> {
    const value = this.store.get(key);
    return value === undefined ? null : new MemoryR2ObjectBody(value);
  }

  private async normaliseValue(
    value: string | ArrayBuffer | ReadableStream | Blob,
  ): Promise<string> {
    if (typeof value === "string") {
      return value;
    }
    if (value instanceof ArrayBuffer) {
      return Buffer.from(value).toString();
    }
    if (typeof (value as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer === "function") {
      const buffer = await (value as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer();
      return Buffer.from(buffer).toString();
    }
    if (value instanceof ReadableStream) {
      const reader = value.getReader();
      const chunks: Uint8Array[] = [];
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const { done, value: chunk } = await reader.read();
        if (done) {
          break;
        }
        if (chunk) {
          chunks.push(chunk);
        }
      }
      return Buffer.concat(chunks).toString();
    }
    return "";
  }

  async put(
    key: string,
    value: string | ArrayBuffer | ReadableStream | Blob,
    _options?: R2PutOptions,
  ): Promise<R2Object | null> {
    const text = await this.normaliseValue(value);
    this.store.set(key, text);
    return { key, size: text.length, uploaded: new Date().toISOString() };
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

const createTestEnv = (): EnvBindings => ({
  DB: new MemoryKV(),
  R2: new MemoryR2(),
});

const createProject = (id: string): ProjectRecord => {
  const now = new Date("2025-02-20T10:00:00Z").toISOString();
  return {
    id,
    name: `Project ${id}`,
    metaAccountId: `act_${id}`,
    metaAccountName: `Account ${id}`,
    chatId: "-1001",
    billingStatus: "active",
    nextPaymentDate: now,
    tariff: 350,
    createdAt: now,
    updatedAt: now,
    settings: {},
  };
};

const createBillingProject = (id: string): ProjectRecord => ({
  ...createProject(id),
  billingStatus: "pending",
  paymentEnabled: false,
  billingEnabled: false,
  billingAmountUsd: null,
  paymentPlan: null,
  tariff: 0,
  nextPaymentDate: null,
  lastPaymentDate: null,
});

const createSummary = (id: string): ProjectSummary => {
  const base = createProject(id);
  return {
    ...base,
    adAccountId: base.metaAccountId,
    telegramTitle: `Client ${id}`,
    leadStats: { total: 5, new: 3, done: 2, latestAt: base.createdAt },
    billing: {
      status: "active",
      active: true,
      overdue: false,
      amount: 350,
      currency: "USD",
      amountFormatted: "$350",
      periodLabel: "Ноябрь 2025",
      periodStart: base.createdAt,
      periodEnd: base.createdAt,
      updatedAt: base.createdAt,
    },
  };
};

const createDataset = (): AutoReportDataset => {
  const summary = createSummary("p1");
  const account: MetaAdAccount = {
    id: summary.metaAccountId,
    name: summary.metaAccountName,
    currency: "USD",
    spend: 9.92,
    spendCurrency: "USD",
  };
  const campaigns: MetaCampaign[] = [
    {
      id: "c1",
      accountId: summary.metaAccountId,
      name: "Campaign 1",
      spend: 9.92,
      spendCurrency: "USD",
      leads: 5,
      clicks: 20,
      impressions: 100,
      reach: 80,
    },
  ];
  return buildAutoReportDataset(
    [summary],
    new Map([[account.id, account]]),
    new Map(),
    new Map([[summary.id, { objectives: { c1: "LEAD_GENERATION" }, manual: {} }]]),
    new Map([[summary.id, campaigns]]),
    new Map([[summary.id, { portalId: "portal1", portalUrl: "https://example.com/portal/p1" }]]),
    "13.11.2025 [Чт]",
    new Date("2025-11-13T10:00:00Z").toISOString(),
    { datePreset: "today" },
  );
};

const createLead = (id: string, projectId: string): LeadRecord => ({
  id,
  projectId,
  name: `Lead ${id}`,
  source: "test",
  status: "new",
  createdAt: new Date("2025-02-20T09:00:00Z").toISOString(),
});

const createPortalRecord = (project: ProjectRecord): ProjectPortalRecord => {
  const now = new Date("2025-02-20T10:05:00Z").toISOString();
  return {
    portalId: `${project.id}-portal`,
    projectId: project.id,
    mode: "auto",
    campaignIds: [],
    metrics: ["spend", "leads"],
    createdAt: now,
    updatedAt: now,
  } satisfies ProjectPortalRecord;
};

const createBillingSummary = (overrides: Partial<ProjectBillingSummary> = {}): ProjectBillingSummary => ({
  status: "active",
  active: true,
  overdue: false,
  amount: 350,
  currency: "USD",
  amountFormatted: "$350",
  periodLabel: "Февраль 2025",
  updatedAt: new Date("2025-02-20T10:10:00Z").toISOString(),
  ...overrides,
});

const createSchedule = (overrides: Partial<ReportScheduleRecord> = {}): ReportScheduleRecord => ({
  id: "rs1",
  title: "Daily",
  type: "summary",
  frequency: "daily",
  time: "08:00",
  timezone: "UTC",
  projectIds: ["p1"],
  chatId: "-1001",
  enabled: true,
  createdAt: new Date("2025-02-20T08:00:00Z").toISOString(),
  updatedAt: new Date("2025-02-20T08:00:00Z").toISOString(),
  nextRunAt: new Date("2025-02-22T07:00:00Z").toISOString(),
  ...overrides,
});

test("evaluateQaDataset flags missing references and reschedules schedules", () => {
  const projects = [createProject("p1")];
  const leads: LeadRecord[] = [createLead("l1", "p1")];
  const paymentReminders: PaymentReminderRecord[] = [
    {
      id: "pr1",
      projectId: "p-missing",
      status: "pending",
      stage: "pending",
      method: null,
      notifiedCount: 0,
      createdAt: new Date("2025-02-21T10:00:00Z").toISOString(),
      updatedAt: new Date("2025-02-21T10:00:00Z").toISOString(),
      nextFollowUpAt: null,
      adminChatId: null,
      clientChatId: null,
      lastClientPromptAt: null,
    },
  ];
  const schedules: ReportScheduleRecord[] = [
    createSchedule({
      projectIds: ["p1", "p-missing"],
      nextRunAt: new Date("2025-02-20T06:00:00Z").toISOString(),
    }),
  ];

  const evaluation = evaluateQaDataset({
    projects,
    leads,
    paymentReminders,
    schedules,
    now: new Date("2025-02-22T12:00:00Z"),
  });

  expect.equal(evaluation.scheduleIssues, 1);
  expect.equal(evaluation.scheduleRescheduled, 1);
  expect.equal(evaluation.paymentReminderIssues, 1);
  expect.ok(evaluation.projectIssueIds.includes("p-missing"));
  expect.ok(evaluation.issues.some((issue) => issue.type === "schedule"));
  const nextRun = evaluation.schedules[0].nextRunAt;
  expect.ok(nextRun);
  expect.ok(Date.parse(nextRun!) > Date.parse("2025-02-22T12:00:00Z"));
});

test("applyKpiSelection prioritises override, campaign, project, then auto objective", () => {
  const override = applyKpiSelection({
    objective: "LEAD_GENERATION",
    override: ["spend", "leads", "cpl"],
    campaignManual: ["reach"],
    projectManual: ["impressions"],
  });
  expect.deepEqual(override, ["spend", "leads", "cpl"]);

  const campaign = applyKpiSelection({
    objective: "LEAD_GENERATION",
    campaignManual: ["reach", "leads"],
    projectManual: ["impressions"],
  });
  expect.deepEqual(campaign, ["reach", "leads"]);

  const project = applyKpiSelection({
    objective: "LEAD_GENERATION",
    projectManual: ["ctr", "cpc"],
  });
  expect.deepEqual(project, ["ctr", "cpc"]);

  const auto = applyKpiSelection({ objective: "LEAD_GENERATION" });
  expect.deepEqual(auto, ["leads", "cpl", "spend"]);

  const unknown = applyKpiSelection({ objective: "UNKNOWN_OBJECTIVE" });
  expect.deepEqual(unknown, []);
});

test("normalizeCampaign resolves objective labels and metrics from heuristic objectives", () => {
  const leadCampaign: MetaCampaign = {
    id: "c1",
    accountId: "act_1",
    name: "Test Lead",
    objective: "OUTCOME_LEADS",
    spend: 100,
    spendCurrency: "USD",
    leads: 12,
  };
  const messageCampaign: MetaCampaign = {
    id: "c2",
    accountId: "act_1",
    name: "Test Messages",
    objective: "OUTCOME_MESSAGES",
    spend: 50,
    spendCurrency: "USD",
    conversations: 8,
  };
  const normalized = normalizeCampaigns([leadCampaign, messageCampaign]);
  expect.equal(normalized[0].objectiveLabel, "Лиды");
  expect.equal(normalized[0].primaryMetricLabel, "Лиды");
  expect.equal(normalized[0].primaryMetricValue, 12);
  expect.equal(normalized[1].objectiveLabel, "Сообщения");
  expect.equal(normalized[1].primaryMetricLabel, "Сообщения");
  expect.equal(normalized[1].primaryMetricValue, 8);
});

test("evaluateAutoReportTrigger detects daily window", () => {
  const settings = {
    enabled: true,
    times: ["10:00"],
    sendTarget: "chat",
    alertsTarget: "admin",
    mondayDoubleReport: false,
    lastSentDaily: null,
    lastSentMonday: null,
  } satisfies Parameters<typeof evaluateAutoReportTrigger>[0];
  const now = new Date("2025-02-20T10:02:00Z");
  const result = evaluateAutoReportTrigger(settings, now);
  expect.equal(result.daily, "10:00");
  expect.equal(result.weekly, null);
});

test("evaluateAutoReportTrigger respects cooldown and monday double", () => {
  const baseSettings = {
    enabled: true,
    times: ["15:00"],
    sendTarget: "chat",
    alertsTarget: "admin",
    mondayDoubleReport: true,
    lastSentDaily: new Date("2025-02-24T14:58:00Z").toISOString(),
    lastSentMonday: null,
  } satisfies Parameters<typeof evaluateAutoReportTrigger>[0];

  const cooldownResult = evaluateAutoReportTrigger(baseSettings, new Date("2025-02-24T15:01:00Z"));
  expect.equal(cooldownResult.daily, null, "Cooldown should suppress repeated send");

  const mondayResult = evaluateAutoReportTrigger(
    { ...baseSettings, lastSentDaily: new Date("2025-02-23T09:00:00Z").toISOString() },
    new Date("2025-02-24T15:02:00Z"),
  );
  expect.equal(mondayResult.weekly, "15:00");
});

test("project settings patch toggles lead alerts and persists flag", () => {
  const extracted = extractProjectSettings({
    alerts: { leads: false },
    reports: { auto: { frequency: "weekly", quietWeekends: true, silent: true } },
  });
  expect.equal(extracted.leadAlerts, false);
  expect.equal(extracted.reportFrequency, "weekly");
  expect.equal(extracted.quietWeekends, true);

  const patched = applyProjectSettingsPatch({}, { leadAlerts: false, silentReports: true });
  const alerts = (patched.alerts as { leads?: boolean } | undefined) ?? {};
  expect.equal(alerts.leads, false);
  const reports = (patched.reports as { auto?: { silent?: boolean } } | undefined)?.auto ?? {};
  expect.equal(reports.silent, true);

  const restored = applyProjectSettingsPatch(patched, { leadAlerts: true });
  const restoredAlerts = (restored.alerts as { leads?: boolean } | undefined) ?? {};
  expect.equal(restoredAlerts.leads, true);
});

test("listLeads merges KV overlays and preserves processed status", async () => {
  const env = createTestEnv();
  const project = createProject("p-leads-merge");
  await saveProjects(env, [project]);

  const baseLead = {
    ...createLead("lead-1", project.id),
    createdAt: "2025-02-20T09:00:00.000Z",
    status: "new" as const,
  } satisfies LeadRecord;
  await saveLeads(env, project.id, [baseLead]);

  const kvKey = `leads:${project.id}:${baseLead.id}`;
  await env.DB.put(
    kvKey,
    JSON.stringify({
      id: baseLead.id,
      project_id: project.id,
      name: "Lead KV Override",
      phone: "+998901112233",
      source: "facebook",
      campaign_id: "camp-override",
      form_id: null,
      ad_id: "ad-override",
      ad_name: "Ad Override",
      campaign_name: "Campaign Override",
      campaign_short_name: "Override",
      campaign_objective: "LEAD_GENERATION",
      created_at: "2025-02-21T10:30:00.000Z",
      status: "processed",
    }),
  );

  const leads = await listLeads(env, project.id);
  expect.equal(leads.length, 1);
  const [merged] = leads;
  expect.equal(merged.status, "done");
  expect.equal(merged.campaignName, "Campaign Override");
  expect.equal(merged.adName, "Ad Override");
  expect.equal(merged.phone, "+998901112233");
  expect.equal(merged.createdAt, "2025-02-21T10:30:00.000Z");
});

test("portal snapshot cache roundtrip retains partial data source", async () => {
  const env = createTestEnv();
  const snapshotNow = new Date();
  const startOfDay = new Date(snapshotNow);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const dayIso = startOfDay.toISOString().slice(0, 10);
  const descriptor: PortalSnapshotCacheDescriptor = {
    key: "today",
    datePreset: "today",
    since: dayIso,
    until: dayIso,
    page: 1,
  };

  const now = new Date("2025-02-22T11:00:00Z").toISOString();
  const snapshot: PortalComputationResult = {
    billing: {
      status: "pending",
      active: true,
      overdue: false,
      amount: 350,
      currency: "USD",
      amountFormatted: "$350",
      updatedAt: now,
    },
    statusCounts: { all: 2, new: 1, done: 1 },
    page: 1,
    totalPages: 1,
    leads: [],
    metrics: [
      { key: "spend", label: "Расход", value: "9.90$" },
      { key: "leads_total", label: "Лиды", value: "2" },
    ],
    campaigns: [] as NormalizedCampaign[],
    periodLabel: "Сегодня",
    updatedAt: now,
    partial: true,
    dataSource: "fallback",
  };

  await writePortalSnapshotCache(env, "p-cache", descriptor, snapshot, 180);
  const cached = await readPortalSnapshotCache(env, "p-cache", descriptor);
  expect.ok(cached, "cache entry should be readable");
  expect.equal(cached?.data.partial, true);
  expect.equal(cached?.data.dataSource, "fallback");
  expect.equal(cached?.data.metrics.length, 2);
  expect.equal(cached?.data.billing.amount, 350);
});

test("buildAutoReportDataset builds portal link and project report", () => {
  const dataset = createDataset();
  expect.equal(dataset.projects.length, 1);
  const project = dataset.projects[0];
  expect.equal(dataset.periodLabel, "13.11.2025 [Чт]");
  expect.equal(project.portalUrl, "https://example.com/portal/p1");
  expect.ok(project.metrics.includes("leads"));
  expect.ok(project.metrics.includes("spend"));
  expect.ok(project.metrics.includes("impressions"));
  expect.equal(project.billing.label, "активен · $350 · Ноябрь 2025");
  expect.ok(project.spend.label?.includes("9"));
  expect.equal(project.report.kpis.leads_total, 5);
  expect.equal(project.report.kpis.spend, 9.92);
  expect.equal(project.report.campaigns.length, 1);
});

test("appendProjectPayment syncs project billing for bot and portal", async () => {
  const env = createTestEnv();
  const project = createBillingProject("p-pay-sync");
  await saveProjects(env, [project]);

  const record = await appendProjectPayment(env, project.id, {
    amount: 500,
    currency: "USD",
    periodStart: "2025-01-01",
    periodEnd: "2025-02-01",
    status: "pending",
    paidAt: null,
  });

  expect.equal(record.projectId, project.id);
  expect.equal(record.amount, 500);
  expect.equal(record.periodEnd?.startsWith("2025-02-01"), true);

  const payments = (await listPayments(env)).filter((item) => item.projectId === project.id);
  expect.equal(payments.length, 1);

  const storedProject = (await listProjects(env)).find((item) => item.id === project.id);
  expect.ok(storedProject, "project should exist after payment append");
  expect.equal(storedProject?.nextPaymentDate, "2025-02-01");
  expect.equal(storedProject?.paymentPlan, 500);
  expect.equal(storedProject?.billingAmountUsd, 500);

  const [summary] = await summarizeProjects(env, { projectIds: [project.id] });
  expect.equal(summary.billing.amount, 500);
  expect.equal(summary.billing.status, "pending");
  expect.equal(summary.nextPaymentDate, "2025-02-01");
  expect.equal(summary.tariff, 500);
});

test("handlePaymentsCreate persists payments and refreshes summaries", async () => {
  const env = createTestEnv();
  const project = createBillingProject("p-pay-api");
  await saveProjects(env, [project]);

  const request = new Request("https://example.com/api/payments", {
    method: "POST",
    body: JSON.stringify({
      projectId: project.id,
      amount: 350,
      currency: "USD",
      status: "active",
      periodStart: "2025-02-01",
      periodEnd: "2025-03-01",
      paidAt: "2025-02-28",
      notes: "Оплата через портал",
    }),
  });

  const response = await handlePaymentsCreate(request, env);
  expect.equal(response.status, 201);
  const payload = (await response.json()) as ApiSuccess<PaymentRecord>;
  expect.equal(payload.ok, true);
  expect.equal(payload.data.projectId, project.id);
  expect.equal(payload.data.status, "active");
  expect.equal(payload.data.amount, 350);

  const projectAfter = (await listProjects(env)).find((item) => item.id === project.id);
  expect.ok(projectAfter, "project should persist after portal payment");
  expect.equal(projectAfter?.nextPaymentDate, "2025-03-01");
  expect.equal(projectAfter?.paymentPlan, 350);
  expect.equal(projectAfter?.billingStatus, "active");

  const [summary] = await summarizeProjects(env, { projectIds: [project.id] });
  expect.equal(summary.billing.status, "active");
  expect.equal(summary.billing.amount, 350);
  expect.equal(summary.billing.periodEnd?.startsWith("2025-03-01"), true);
  expect.equal(summary.nextPaymentDate, "2025-03-01");
});

test("buildAutoReportNotification renders summary text and buttons", () => {
  const dataset = createDataset();
  const { text, replyMarkup } = buildAutoReportNotification(dataset, {
    datePreset: "today",
    now: new Date("2025-11-13T12:00:00Z"),
  });
  expect.ok(text.includes("⏰ Отчёт за 13.11.2025 [Чт]"));
  expect.ok(text.includes("• Client p1"));
  expect.ok(text.includes("Лиды: 5"));
  expect.ok(text.includes("CPA: 1.98$"));
  expect.ok(text.includes("Расход: 9.92$"));
  expect.ok(text.includes("CTR: 20.00%"));
  expect.ok(text.includes("CPC: 0.50$"));
  expect.ok(text.includes("Активные кампании:"));
  expect.ok(text.includes("Campaign 1"));
  expect.ok(!text.includes("<"), "text should not contain HTML tags");
  expect.ok(replyMarkup && replyMarkup.inline_keyboard.length === 1);
  expect.deepEqual(replyMarkup?.inline_keyboard[0], [
    { text: "Портал проекта", url: "https://example.com/portal/p1" },
  ]);
});

test("ensureTelegramUrl normalizes chat identifiers", () => {
  expect.equal(
    ensureTelegramUrl("-1001234567890"),
    "https://t.me/c/1234567890/2",
  );
  expect.equal(ensureTelegramUrl("@targetbot"), "https://t.me/targetbot");
  expect.equal(ensureTelegramUrl("+InviteCode"), "https://t.me/+InviteCode");
});

test("resolveChatLink prefers explicit link but falls back to chat id", () => {
  expect.equal(
    resolveChatLink(undefined, "-1009876543210"),
    "https://t.me/c/9876543210/2",
  );
  expect.equal(
    resolveChatLink("tg://openmessage?chat_id=-1001", "-1009876543210"),
    "https://t.me/c/1/2",
  );
  expect.equal(
    ensureTelegramUrlFromId("123456"),
    "tg://user?id=123456",
  );
});

test("ProgressReporter emits iteration snapshots", () => {
  const logs: { message: string; meta?: unknown }[] = [];
  const reporter = new ProgressReporter(["alpha", "beta"], (message, meta) => {
    logs.push({ message, meta });
  });

  const start = reporter.start();
  expect.equal(start.iteration, 0);
  expect.equal(start.total, 2);
  expect.equal(start.remaining, 2);

  const first = reporter.complete("alpha");
  expect.equal(first.iteration, 1);
  expect.equal(first.remaining, 1);
  expect.equal(first.completed, "alpha");

  const second = reporter.complete("beta", null);
  expect.equal(second.iteration, 2);
  expect.equal(second.remaining, 0);
  expect.equal(second.next, null);

  expect.equal(logs.length, 3);
  expect.ok((logs[1].message as string).includes("Iteration 1/2 completed"));
  expect.ok((logs[2].message as string).includes("Iteration 2/2 completed"));
});

test("runRegressionChecks reports iteration progress", async () => {
  const env = createTestEnv();
  await saveProjects(env, [createProject("p-progress")]);

  const snapshots: ProgressSnapshot[] = [];
  const reporter = new ProgressReporter(
    ["load_projects", "load_related_records", "evaluate_dataset", "persist_results"],
    (_message, meta) => {
      if (meta) {
        snapshots.push(meta as ProgressSnapshot);
      }
    },
  );

  await runRegressionChecks(env, { reporter });

  const last = snapshots[snapshots.length - 1];
  expect.ok(last, "progress reporter should capture snapshots");
  expect.equal(last.iteration, 4);
  expect.equal(last.remaining, 0);
  expect.equal(last.next, null);
});

test("evaluateQaDataset keeps clean dataset untouched", () => {
  const projects = [createProject("p1")];
  const leads = [createLead("l1", "p1")];
  const paymentReminders: PaymentReminderRecord[] = [
    {
      id: "pr1",
      projectId: "p1",
      status: "pending",
      stage: "pending",
      method: null,
      notifiedCount: 0,
      createdAt: new Date("2025-02-21T10:00:00Z").toISOString(),
      updatedAt: new Date("2025-02-21T10:00:00Z").toISOString(),
      nextFollowUpAt: null,
      adminChatId: null,
      clientChatId: null,
      lastClientPromptAt: null,
    },
  ];
  const schedules: ReportScheduleRecord[] = [
    createSchedule({
      projectIds: ["p1"],
      nextRunAt: new Date("2025-02-23T08:00:00Z").toISOString(),
    }),
  ];

  const evaluation = evaluateQaDataset({
    projects,
    leads,
    paymentReminders,
    schedules,
    now: new Date("2025-02-22T12:00:00Z"),
  });

  expect.equal(evaluation.scheduleIssues, 0);
  expect.equal(evaluation.scheduleRescheduled, 0);
  expect.equal(evaluation.paymentReminderIssues, 0);
  expect.deepEqual(evaluation.projectIssueIds, []);
  expect.equal(
    evaluation.schedules[0].nextRunAt,
    new Date("2025-02-23T08:00:00Z").toISOString(),
  );
});

test("calculateLeadAnalytics summarises totals consistently", async () => {
  const env = createTestEnv();
  const primary = { ...createProject("analytics-main") };
  const secondary = { ...createProject("analytics-secondary") };
  await saveProjects(env, [primary, secondary]);

  const leads: LeadRecord[] = [
    { ...createLead("lead-today", primary.id), createdAt: "2025-02-22T09:00:00.000Z" },
    { ...createLead("lead-week", primary.id), createdAt: "2025-02-18T10:00:00.000Z" },
    { ...createLead("lead-old", primary.id), createdAt: "2025-01-25T08:00:00.000Z", status: "done" },
  ];
  await saveLeads(env, primary.id, leads);

  const analytics = await calculateLeadAnalytics(env, new Date("2025-02-22T12:00:00Z"));

  expect.deepEqual(analytics.totals, { today: 1, week: 2, month: 2, total: 3 });
  expect.equal(analytics.lastLeadAt, "2025-02-22T09:00:00.000Z");
  const topProject = analytics.projects[0];
  expect.equal(topProject.projectId, primary.id);
  expect.equal(topProject.today, 1);
  expect.equal(topProject.week, 2);
  expect.equal(topProject.month, 2);
  expect.equal(topProject.total, 3);
  expect.equal(topProject.lastLeadAt, "2025-02-22T09:00:00.000Z");
  const secondaryStats = analytics.projects.find((entry) => entry.projectId === secondary.id);
  expect.ok(secondaryStats);
  if (secondaryStats) {
    expect.deepEqual(
      { today: secondaryStats.today, week: secondaryStats.week, month: secondaryStats.month, total: secondaryStats.total },
      { today: 0, week: 0, month: 0, total: 0 },
    );
  }
});

test("buildPortalApiPayload maps lead counters to metrics", () => {
  const project = { ...createProject("portal-api") };
  const portal = createPortalRecord(project);
  project.portalSlug = portal.portalId;
  const periodSelection = {
    key: "today",
    label: "Сегодня",
    since: new Date("2025-02-22T00:00:00Z"),
    until: new Date("2025-02-22T23:59:59Z"),
    datePreset: "today",
  };
  const snapshot: PortalComputationResult = {
    billing: createBillingSummary({ amount: 420, amountFormatted: "$420" }),
    statusCounts: { all: 4, new: 3, done: 1 },
    page: 1,
    totalPages: 2,
    leads: [
      {
        id: "lead-1",
        name: "Lead 1",
        phone: "+998901112233",
        status: "new",
        createdAt: "2025-02-22T09:00:00.000Z",
        adLabel: "Ad A",
        type: "Контакт",
      },
    ],
    metrics: [
      { key: "spend", label: "Расход", value: "9.90 $" },
      { key: "leads", label: "Лиды", value: "4" },
    ],
    campaigns: [],
    periodLabel: "Сегодня",
    updatedAt: "2025-02-22T12:00:00.000Z",
    partial: false,
    dataSource: "cache",
  } satisfies PortalComputationResult;

  const resolution = {
    ok: true,
    project,
    portal,
    periodSelection,
    snapshot,
    snapshotSource: "cache" as const,
    slug: portal.portalId,
    basePath: `/portal/${portal.portalId}`,
  };

  const payload = testBuildPortalApiPayload(
    resolution as Parameters<typeof testBuildPortalApiPayload>[0],
  );

  expect.equal(payload.statusCounts.new, snapshot.statusCounts.new);
  expect.ok(Object.prototype.hasOwnProperty.call(payload.metricsMap, "spend"));
  expect.equal(payload.metricsMap.spend, "9.90 $");
  expect.equal(payload.metricsMap.leads_total, "4");
  expect.equal(payload.metricsMap.leads_new, "3");
  expect.equal(payload.metricsMap.leads_done, "1");
  expect.equal(payload.partial, false);
  expect.equal(payload.dataSource, "cache");
});

test("resolvePortalRequestForProject serves cached snapshot", async () => {
  const env = createTestEnv();
  const project = { ...createProject("portal-resolve") };
  const portal = createPortalRecord(project);
  project.portalSlug = portal.portalId;
  await saveProjects(env, [project]);
  await savePortals(env, [portal]);
  await saveLeads(env, project.id, [
    {
      ...createLead("lead-api-1", project.id),
      name: "Portal API Lead",
      phone: "+998901112299",
      createdAt: "2025-02-22T09:30:00.000Z",
    },
    {
      ...createLead("lead-api-2", project.id),
      name: "Portal API Lead 2",
      createdAt: "2025-02-21T11:00:00.000Z",
    },
    {
      ...createLead("lead-api-3", project.id),
      name: "Portal API Closed",
      status: "done",
      createdAt: "2025-02-20T08:00:00.000Z",
    },
  ]);

  const descriptor: PortalSnapshotCacheDescriptor = {
    key: "today",
    datePreset: "today",
    since: null,
    until: null,
    page: 1,
  };
  const snapshot: PortalComputationResult = {
    billing: createBillingSummary(),
    statusCounts: { all: 2, new: 1, done: 1 },
    page: 1,
    totalPages: 1,
    leads: [],
    metrics: [{ key: "spend", label: "Расход", value: "12.50 $" }],
    campaigns: [],
    periodLabel: "Сегодня",
    updatedAt: "2025-02-22T12:00:00.000Z",
    partial: false,
    dataSource: "cache",
  } satisfies PortalComputationResult;

  await writePortalSnapshotCache(env, project.id, descriptor, snapshot, 120);

  const resolution = await testResolvePortalRequestForProject(
    env,
    project.id,
    new URLSearchParams(),
    new Date("2025-02-22T13:00:00Z"),
  );

  expect.ok((resolution as { ok: boolean }).ok);
  if ((resolution as { ok: boolean }).ok) {
    const success = resolution as Extract<typeof resolution, { ok: true }>;
    expect.ok(["cache", "fresh", "stale-cache", "fallback"].includes(success.snapshotSource));
    expect.equal(typeof success.snapshot.partial, "boolean");
  }
});

test("createSlaReport persists CSV asset and report record", async () => {
  const env = createTestEnv();
  const project = createProject("sla-project");
  await saveProjects(env, [project]);
  const leads: LeadRecord[] = [
    { ...createLead("sla-1", project.id), createdAt: "2025-02-21T09:00:00.000Z" },
    { ...createLead("sla-2", project.id), createdAt: "2025-02-20T09:00:00.000Z", status: "done" },
  ];
  await saveLeads(env, project.id, leads);

  const result = await createSlaReport(env, { thresholdMinutes: 60 });
  expect.ok(result.record.id);
  expect.ok(result.text.includes("SLA-экспорт"));

  const reports = await listReports(env);
  expect.equal(reports.length, 1);
  expect.equal(reports[0].id, result.record.id);

  const asset = await getReportAsset(env, result.record.id);
  // @ts-expect-error accessing test double internals
  const rawAsset = await env.R2.get(`reports/assets/${result.record.id}`);
  const csvText = rawAsset ? await rawAsset.text() : "";
  expect.ok(asset);
  expect.ok(csvText.includes("lead_id"));
});

test("renderPortal embeds loader overlay and retry control", () => {
  const project = createProject("portal-view");
  const billing = createBillingSummary();
  const snapshot: PortalSnapshotPayload = {
    metrics: [{ key: "spend", label: "Расход", value: "15.00 $" }],
    leads: [],
    campaigns: [],
    statusCounts: { all: 0, new: 0, done: 0 },
    pagination: { page: 1, totalPages: 1, prevUrl: null, nextUrl: null },
    billing,
    periodLabel: "Сегодня",
    updatedAt: "2025-02-22T12:00:00.000Z",
    partial: false,
    dataSource: "cache",
  };

  const html = renderPortal({
    project,
    billing,
    periodOptions: [],
    snapshot,
    snapshotUrl: "/portal/portal-view/snapshot",
    statsUrl: "/api/meta/stats?project=portal-view",
    leadsUrl: "/api/meta/leads?project=portal-view",
    campaignsUrl: "/api/meta/campaigns?project=portal-view",
    periodKey: "today",
  });

  expect.ok(html.includes('data-role="portal-loader"'));
  expect.ok(html.includes('data-role="loader-retry"'));
  expect.ok(html.includes("Готовим данные…"));
  expect.ok(html.includes("window.__portalSnapshot"));
});

test("portal API endpoints return cached snapshot payloads", async () => {
  const env = createTestEnv();
  const project = { ...createProject("portal-api-fetch") };
  project.metaAccountId = "";
  (project as { adAccountId?: string | null }).adAccountId = null;
  const portal = createPortalRecord(project);
  project.portalSlug = portal.portalId;
  await saveProjects(env, [project]);
  await savePortals(env, [portal]);

  const snapshotNow = new Date();
  const startOfDay = new Date(snapshotNow);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const dayIso = startOfDay.toISOString().slice(0, 10);
  const descriptor: PortalSnapshotCacheDescriptor = {
    key: "today",
    datePreset: "today",
    since: dayIso,
    until: dayIso,
    page: 1,
  };
  const snapshot: PortalComputationResult = {
    billing: createBillingSummary({ amountFormatted: "$510" }),
    statusCounts: { all: 3, new: 2, done: 1 },
    page: 1,
    totalPages: 1,
    leads: [
      {
        id: "lead-api-1",
        name: "Portal API Lead",
        phone: "+998901112299",
        status: "new",
        createdAt: "2025-02-22T09:30:00.000Z",
        adLabel: "API Ad",
        type: "Контакт",
      },
      {
        id: "lead-api-2",
        name: "Portal API Lead 2",
        phone: null,
        status: "new",
        createdAt: "2025-02-21T11:00:00.000Z",
        adLabel: "API Ad",
        type: "Сообщение",
      },
      {
        id: "lead-api-3",
        name: "Portal API Closed",
        phone: null,
        status: "done",
        createdAt: "2025-02-20T08:00:00.000Z",
        adLabel: "API Ad",
        type: "Контакт",
      },
    ],
    metrics: [
      { key: "spend", label: "Расход", value: "15.00 $" },
      { key: "leads", label: "Лиды", value: "3" },
    ],
    campaigns: [
      {
        id: "cmp-api",
        name: "API Campaign",
        status: "ACTIVE",
        objectiveLabel: "Лиды",
        primaryMetricLabel: "Лиды",
        primaryMetricValue: 3,
        spend: 15,
        spendCurrency: "USD",
        impressions: 1200,
        clicks: 45,
      },
    ],
    periodLabel: "Сегодня",
    updatedAt: snapshotNow.toISOString(),
    partial: false,
    dataSource: "cache",
  } satisfies PortalComputationResult;

  await writePortalSnapshotCache(env, project.id, descriptor, snapshot, 120);
  await writePortalReportCache(
    env,
    project.metaAccountId,
    { key: "today", datePreset: "today", since: dayIso, until: dayIso },
    snapshot.campaigns as unknown as MetaCampaign[],
  );

  const baseUrl = "https://example.dev";
  const statsResponse = await worker.fetch(
    new Request(`${baseUrl}/api/meta/stats?project=${project.id}`),
    env,
  );
  expect.equal(statsResponse.status, 200);
  const statsBody = (await statsResponse.json()) as ApiSuccess<{
    metrics: PortalComputationResult["metrics"];
    metricsMap: Record<string, string>;
    statusCounts: PortalComputationResult["statusCounts"];
    periodLabel: string;
    updatedAt: string | null | undefined;
    billing: PortalComputationResult["billing"];
    partial: boolean;
    dataSource: string;
  }>;
  expect.ok(statsBody.ok);
  expect.ok(Object.prototype.hasOwnProperty.call(statsBody.data.metricsMap, "leads_total"));
  expect.ok(statsBody.data.billing === null || typeof statsBody.data.billing === "object");

  const leadsResponse = await worker.fetch(
    new Request(`${baseUrl}/api/meta/leads?project=${project.id}&page=1`),
    env,
  );
  expect.equal(leadsResponse.status, 200);
  const leadsBody = (await leadsResponse.json()) as ApiSuccess<{
    leads: PortalComputationResult["leads"];
    statusCounts: PortalComputationResult["statusCounts"];
    pagination: ReturnType<typeof testBuildPortalApiPayload>["pagination"];
    updatedAt: string | null | undefined;
    partial: boolean;
    dataSource: string;
  }>;
  expect.ok(leadsBody.ok);
  expect.ok(Array.isArray(leadsBody.data.leads));
  expect.equal(leadsBody.data.pagination.page, 1);

  const campaignsResponse = await worker.fetch(
    new Request(`${baseUrl}/api/meta/campaigns?project=${project.id}`),
    env,
  );
  expect.equal(campaignsResponse.status, 200);
  const campaignsBody = (await campaignsResponse.json()) as ApiSuccess<{
    campaigns: PortalComputationResult["campaigns"];
    updatedAt: string | null | undefined;
    partial: boolean;
    dataSource: string;
  }>;
  expect.ok(campaignsBody.ok);
  expect.ok(Array.isArray(campaignsBody.data.campaigns));
  expect.equal(typeof campaignsBody.data.partial, "boolean");

  expect.deepEqual(leadsBody.data.statusCounts, statsBody.data.statusCounts);
  expect.equal(leadsBody.data.dataSource, statsBody.data.dataSource);
  expect.equal(campaignsBody.data.dataSource, statsBody.data.dataSource);
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✔ ${name}`);
    } catch (error) {
      console.error(`✖ ${name}`);
      console.error(error);
      process.exit(1);
    }
  }
  console.log(`✅ ${tests.length} regression test(s) passed`);
})();
