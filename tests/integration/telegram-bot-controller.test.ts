import assert from "node:assert/strict";
import test from "node:test";

import { MemoryKVNamespace, MemoryR2Bucket } from "../utils/mocks.ts";

const { KvClient } = await import("../../src/infra/kv.ts");
const { R2Client } = await import("../../src/infra/r2.ts");
const { createProject, putProject } = await import("../../src/domain/projects.ts");
const {
  createDefaultProjectSettings,
  parseProjectSettings,
  upsertProjectSettings,
  ensureProjectSettings,
} = await import("../../src/domain/project-settings.ts");
const { createTelegramBotController } = await import("../../src/bot/controller.ts");
const { listProjectPayments } = await import("../../src/domain/payments.ts");
const { createMetaCacheEntry, saveMetaCache } = await import("../../src/domain/meta-cache.ts");

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

const seedProject = async (kv: InstanceType<typeof KvClient>, projectId: string) => {
  const project = createProject({
    id: projectId,
    name: "Birlash",
    adsAccountId: "act_111",
    ownerTelegramId: 111,
  });
  await putProject(kv, project);
  const defaults = createDefaultProjectSettings(projectId);
  const settings = parseProjectSettings(
    {
      ...defaults,
      billing: { ...defaults.billing, tariff: 500, currency: "USD", nextPaymentDate: "2025-01-01" },
      alerts: { ...defaults.alerts, route: "CHAT" },
    },
    projectId,
  );
  await upsertProjectSettings(kv, settings);
  const summaryEntry = createMetaCacheEntry(
    projectId,
    "summary:today",
    { from: "2025-01-01", to: "2025-01-01" },
    {
      metrics: {
        spendToday: 120.5,
        cpaToday: 12.05,
        leadsToday: 10,
        leadsTotal: 350,
      },
    },
    60,
  );
  await saveMetaCache(kv, summaryEntry);
  return { project, settings };
};

test("Telegram bot controller serves menu and project list", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await seedProject(kv, "birlash");

  const controller = createTelegramBotController({ kv, r2, token: "test-token" });
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "/start" },
    } as unknown as import("../../src/bot/types.ts").TelegramUpdate);

    assert.equal(stub.requests.length, 1);
    assert.equal(stub.requests[0]?.url.endsWith("/sendMessage"), true);
    assert.ok(String(stub.requests[0]?.body.text).includes("Главное меню"));

    stub.requests.length = 0;

    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "Проекты" },
    } as unknown as import("../../src/bot/types.ts").TelegramUpdate);

    assert.equal(stub.requests.length, 1);
    const keyboard = stub.requests[0]?.body.reply_markup as
      | { inline_keyboard: Array<Array<{ callback_data: string }>> }
      | undefined;
    assert.ok(keyboard);
    assert.equal(keyboard?.inline_keyboard[0]?.[0]?.callback_data, "project:birlash");
  } finally {
    stub.restore();
  }
});

test("Telegram bot controller shows project card and handles +30 billing", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  const { project } = await seedProject(kv, "birlash");

  const controller = createTelegramBotController({ kv, r2, token: "test-token" });
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      callback_query: {
        id: "cb1",
        from: { id: 200 },
        message: { chat: { id: 200 } },
        data: "project:birlash",
      },
    } as unknown as import("../../src/bot/types.ts").TelegramUpdate);

    assert.equal(stub.requests.length, 2);
    const projectCardCall = stub.requests.at(-1)!;
    assert.ok(String(projectCardCall.body.text).includes("Проект: Birlash"));

    stub.requests.length = 0;

    await controller.handleUpdate({
      callback_query: {
        id: "cb2",
        from: { id: 200 },
        message: { chat: { id: 200 } },
        data: "billing:add30:birlash",
      },
    } as unknown as import("../../src/bot/types.ts").TelegramUpdate);

    assert.equal(stub.requests.length, 2);
    const updatedCard = stub.requests.at(-1)!;
    assert.ok(String(updatedCard.body.text).includes("Оплата: следующая дата 31.01.2025"));

    const updatedSettings = await ensureProjectSettings(kv, project.id);
    assert.equal(updatedSettings.billing.nextPaymentDate, "2025-01-31");

    const payments = await listProjectPayments(r2, project.id);
    assert.equal(payments.length, 1);
    assert.equal(payments[0]?.periodStart, "2025-01-01");
    assert.equal(payments[0]?.periodEnd, "2025-01-31");
  } finally {
    stub.restore();
  }
});

test("Telegram bot controller updates billing date via prompt", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  const { project } = await seedProject(kv, "birlash");

  const controller = createTelegramBotController({ kv, r2, token: "test-token" });
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      callback_query: {
        id: "cb3",
        from: { id: 300 },
        message: { chat: { id: 300 } },
        data: "billing:set-date:birlash",
      },
    } as unknown as import("../../src/bot/types.ts").TelegramUpdate);

    assert.equal(stub.requests.length, 2);
    assert.ok(String(stub.requests.at(-1)?.body.text).includes("Введите дату"));
    stub.requests.length = 0;

    await controller.handleUpdate({
      message: { chat: { id: 300 }, from: { id: 300 }, text: "2025-02-15" },
    } as unknown as import("../../src/bot/types.ts").TelegramUpdate);

    assert.equal(stub.requests.length, 2);
    assert.ok(String(stub.requests[0]?.body.text).includes("Дата оплаты обновлена"));
    assert.ok(String(stub.requests.at(-1)?.body.text).includes("15.02.2025"));

    const updatedSettings = await ensureProjectSettings(kv, project.id);
    assert.equal(updatedSettings.billing.nextPaymentDate, "2025-02-15");

    const payments = await listProjectPayments(r2, project.id);
    assert.equal(payments.length, 1);
    assert.equal(payments[0]?.periodStart, "2025-02-15");
    assert.equal(payments[0]?.periodEnd, "2025-02-15");
  } finally {
    stub.restore();
  }
});
