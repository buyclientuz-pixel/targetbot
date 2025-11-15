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

import {
  buildAutoReportNotification,
  evaluateAutoReportTrigger,
} from "../src/utils/auto-report-engine";
import { buildAutoReportDataset } from "../src/utils/reports";
import { applyKpiSelection } from "../src/utils/kpi";
import { normalizeCampaigns } from "../src/utils/campaigns";
import { ensureTelegramUrl, ensureTelegramUrlFromId, resolveChatLink } from "../src/utils/chat-links";
import { evaluateQaDataset } from "../src/utils/qa";
import {
  AutoReportDataset,
  MetaAdAccount,
  MetaCampaign,
  LeadRecord,
  LeadReminderRecord,
  PaymentReminderRecord,
  ProjectRecord,
  ProjectSummary,
  ReportScheduleRecord,
} from "../src/types";

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
  const leadReminders: LeadReminderRecord[] = [
    {
      id: "lr1",
      leadId: "missing",
      projectId: "p1",
      status: "pending",
      notifiedCount: 0,
      createdAt: new Date("2025-02-21T10:00:00Z").toISOString(),
      updatedAt: new Date("2025-02-21T10:00:00Z").toISOString(),
    },
  ];
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
    leadReminders,
    paymentReminders,
    schedules,
    now: new Date("2025-02-22T12:00:00Z"),
  });

  expect.equal(evaluation.scheduleIssues, 1);
  expect.equal(evaluation.scheduleRescheduled, 1);
  expect.equal(evaluation.leadReminderIssues, 1);
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

test("evaluateQaDataset keeps clean dataset untouched", () => {
  const projects = [createProject("p1")];
  const leads = [createLead("l1", "p1")];
  const leadReminders: LeadReminderRecord[] = [
    {
      id: "lr1",
      leadId: "l1",
      projectId: "p1",
      status: "pending",
      notifiedCount: 0,
      createdAt: new Date("2025-02-21T10:00:00Z").toISOString(),
      updatedAt: new Date("2025-02-21T10:00:00Z").toISOString(),
    },
  ];
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
    leadReminders,
    paymentReminders,
    schedules,
    now: new Date("2025-02-22T12:00:00Z"),
  });

  expect.equal(evaluation.scheduleIssues, 0);
  expect.equal(evaluation.scheduleRescheduled, 0);
  expect.equal(evaluation.leadReminderIssues, 0);
  expect.equal(evaluation.paymentReminderIssues, 0);
  expect.deepEqual(evaluation.projectIssueIds, []);
  expect.equal(
    evaluation.schedules[0].nextRunAt,
    new Date("2025-02-23T08:00:00Z").toISOString(),
  );
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
