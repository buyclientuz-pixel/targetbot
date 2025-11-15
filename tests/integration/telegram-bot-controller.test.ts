import assert from "node:assert/strict";
import test from "node:test";

import { MemoryKVNamespace, MemoryR2Bucket } from "../utils/mocks.ts";
import type { TelegramUpdate } from "../../src/bot/types.ts";

const { KvClient } = await import("../../src/infra/kv.ts");
const { R2Client } = await import("../../src/infra/r2.ts");
const { createTelegramBotController } = await import("../../src/bot/controller.ts");
const { putProjectsByUser } = await import("../../src/domain/spec/projects-by-user.ts");
const { putProjectRecord } = await import("../../src/domain/spec/project.ts");
const { putBillingRecord } = await import("../../src/domain/spec/billing.ts");
const { putAlertsRecord } = await import("../../src/domain/spec/alerts.ts");
const { putAutoreportsRecord } = await import("../../src/domain/spec/autoreports.ts");
const { putProjectLeadsList } = await import("../../src/domain/spec/project-leads.ts");
const { putMetaCampaignsDocument } = await import("../../src/domain/spec/meta-campaigns.ts");
const { putPaymentsHistoryDocument } = await import("../../src/domain/spec/payments-history.ts");

const installFetchStub = () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const bodyText = typeof init?.body === "string" ? init.body : init?.body ? String(init.body) : "{}";
    try {
      requests.push({ url, body: JSON.parse(bodyText) as Record<string, unknown> });
    } catch {
      requests.push({ url, body: {} });
    }
    return new Response(JSON.stringify({ ok: true, result: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  return {
    requests,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
};

const seedProject = async (kv: InstanceType<typeof KvClient>, r2: InstanceType<typeof R2Client>) => {
  await putProjectsByUser(kv, 100, { projects: ["proj_a"] });
  await putProjectRecord(kv, {
    id: "proj_a",
    name: "BirLash",
    ownerId: 100,
    adAccountId: "act_123",
    chatId: -100555666777,
    portalUrl: "https://th-reports.buyclientuz.workers.dev/p/proj_a",
    settings: {
      currency: "USD",
      timezone: "Asia/Tashkent",
      kpi: { mode: "auto", type: "LEAD", label: "Лиды" },
    },
  });
  await putBillingRecord(kv, "proj_a", {
    tariff: 500,
    currency: "USD",
    nextPaymentDate: "2025-01-01",
    autobilling: true,
  });
  await putAlertsRecord(kv, "proj_a", {
    enabled: true,
    channel: "both",
    types: { leadInQueue: true, pause24h: true, paymentReminder: true },
    leadQueueThresholdHours: 1,
    pauseThresholdHours: 24,
    paymentReminderDays: [7, 1],
  });
  await putAutoreportsRecord(kv, "proj_a", {
    enabled: true,
    time: "10:00",
    mode: "yesterday_plus_week",
    sendTo: "both",
  });
  await putProjectLeadsList(r2, "proj_a", {
    stats: { total: 10, today: 2 },
    leads: [
      {
        id: "lead_1",
        name: "User",
        phone: "+99890",
        createdAt: "2025-01-01T00:00:00Z",
        source: "facebook",
        campaignName: "Test",
        status: "new",
        type: null,
      },
    ],
  });
  await putMetaCampaignsDocument(r2, "proj_a", {
    period: { from: "2025-01-01", to: "2025-01-01" },
    summary: { spend: 120, impressions: 1000, clicks: 100, leads: 5, messages: 0 },
    campaigns: [
      {
        id: "cmp1",
        name: "Lead Gen",
        objective: "LEAD_GENERATION",
        kpiType: "LEAD",
        spend: 120,
        impressions: 1000,
        clicks: 100,
        leads: 5,
        messages: 0,
      },
    ],
  });
  await putPaymentsHistoryDocument(r2, "proj_a", { payments: [] });
};

test("Telegram bot controller serves menu and project list", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await seedProject(kv, r2);

  const controller = createTelegramBotController({ kv, r2, token: "test-token" });
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "/start" },
    } as unknown as TelegramUpdate);

    assert.ok(stub.requests.length >= 1);
    assert.ok(String(stub.requests[0]?.body.text).includes("Главное меню"));

    stub.requests.length = 0;

    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "Проекты" },
    } as unknown as TelegramUpdate);

    assert.ok(stub.requests.length >= 1);
    const keyboard = stub.requests[0]?.body.reply_markup as { inline_keyboard: Array<Array<{ callback_data: string }>> };
    assert.ok(keyboard);
    assert.equal(keyboard.inline_keyboard[0]?.[0]?.callback_data, "project:card:proj_a");
  } finally {
    stub.restore();
  }
});

test("Telegram bot controller shows project card and handles +30 billing", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await seedProject(kv, r2);

  const controller = createTelegramBotController({ kv, r2, token: "test-token" });
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      callback_query: {
        id: "cb1",
        from: { id: 100 },
        message: { chat: { id: 100 } },
        data: "project:card:proj_a",
      },
    } as unknown as TelegramUpdate);

    assert.equal(stub.requests.length, 2);
    assert.ok(String(stub.requests[0]?.body.text).includes("Проект: <b>BirLash</b>"));

    stub.requests.length = 0;

    await controller.handleUpdate({
      callback_query: {
        id: "cb2",
        from: { id: 100 },
        message: { chat: { id: 100 } },
        data: "billing:add30:proj_a",
      },
    } as unknown as TelegramUpdate);

    assert.equal(stub.requests.length >= 2, true);
    const confirmation = stub.requests[0];
    assert.ok(String(confirmation?.body.text).includes("✅ Дата следующего платежа"));

    const billing = await (await import("../../src/domain/spec/billing.ts")).getBillingRecord(kv, "proj_a");
    assert.equal(billing?.nextPaymentDate, "2025-01-31");

    const payments = await (await import("../../src/domain/spec/payments-history.ts")).getPaymentsHistoryDocument(r2, "proj_a");
    assert.equal(payments?.payments.length, 1);
    assert.equal(payments?.payments[0]?.periodTo, "2025-01-31");
  } finally {
    stub.restore();
  }
});

test("Telegram bot controller updates billing date via prompt", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await seedProject(kv, r2);

  const controller = createTelegramBotController({ kv, r2, token: "test-token" });
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      callback_query: {
        id: "cb3",
        from: { id: 100 },
        message: { chat: { id: 100 } },
        data: "billing:set-date:proj_a",
      },
    } as unknown as TelegramUpdate);

    assert.ok(stub.requests.length >= 1);
    assert.ok(String(stub.requests[0]?.body.text).includes("Введите дату"));
    stub.requests.length = 0;

    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "2025-02-15" },
    } as unknown as TelegramUpdate);

    assert.equal(stub.requests.length >= 1, true);
    const billing = await (await import("../../src/domain/spec/billing.ts")).getBillingRecord(kv, "proj_a");
    assert.equal(billing?.nextPaymentDate, "2025-02-15");
  } finally {
    stub.restore();
  }
});
