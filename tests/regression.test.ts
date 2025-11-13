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

import { evaluateQaDataset } from "../src/utils/qa";
import {
  LeadRecord,
  LeadReminderRecord,
  PaymentReminderRecord,
  ProjectRecord,
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
      notifiedCount: 0,
      createdAt: new Date("2025-02-21T10:00:00Z").toISOString(),
      updatedAt: new Date("2025-02-21T10:00:00Z").toISOString(),
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
      notifiedCount: 0,
      createdAt: new Date("2025-02-21T10:00:00Z").toISOString(),
      updatedAt: new Date("2025-02-21T10:00:00Z").toISOString(),
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
