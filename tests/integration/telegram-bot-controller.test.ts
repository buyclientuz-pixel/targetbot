import assert from "node:assert/strict";
import test from "node:test";

import { MemoryKVNamespace, MemoryR2Bucket } from "../utils/mocks.ts";
import type { TelegramUpdate } from "../../src/bot/types.ts";

const { KvClient } = await import("../../src/infra/kv.ts");
const { R2Client } = await import("../../src/infra/r2.ts");
const { createTelegramBotController } = await import("../../src/bot/controller.ts");
const { recordKnownChat } = await import("../../src/domain/chat-registry.ts");
const { putFreeChatRecord, getFreeChatRecord, getOccupiedChatRecord } = await import(
  "../../src/domain/project-chats.ts",
);
const { putProjectsByUser, getProjectsByUser } = await import("../../src/domain/spec/projects-by-user.ts");
const { putProjectRecord, requireProjectRecord } = await import("../../src/domain/spec/project.ts");
const { putBillingRecord, getBillingRecord } = await import("../../src/domain/spec/billing.ts");
const { putAlertsRecord, getAlertsRecord } = await import("../../src/domain/spec/alerts.ts");
const { putAutoreportsRecord, getAutoreportsRecord } = await import("../../src/domain/spec/autoreports.ts");
const { putProjectLeadsList } = await import("../../src/domain/spec/project-leads.ts");
const { putMetaCampaignsDocument } = await import("../../src/domain/spec/meta-campaigns.ts");
const { putPaymentsHistoryDocument, getPaymentsHistoryDocument } = await import("../../src/domain/spec/payments-history.ts");
const { getFbAuthRecord, putFbAuthRecord } = await import("../../src/domain/spec/fb-auth.ts");
const { getUserSettingsRecord } = await import("../../src/domain/spec/user-settings.ts");

interface FetchRecord {
  url: string;
  method: string;
  body: Record<string, unknown>;
}

const installFetchStub = (
  responder?: (url: string, init?: RequestInit) => { status?: number; body?: unknown },
) => {
  const originalFetch = globalThis.fetch;
  const requests: FetchRecord[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const bodyText = typeof init?.body === "string" ? init.body : init?.body ? String(init.body) : "{}";
    try {
      requests.push({
        url,
        method: init?.method ?? "GET",
        body: JSON.parse(bodyText) as Record<string, unknown>,
      });
    } catch {
      requests.push({ url, method: init?.method ?? "GET", body: {} });
    }
    const override = responder?.(url, init);
    const status = override?.status ?? 200;
    const payload = override?.body ?? { ok: true, result: {} };
    const responseBody = typeof payload === "string" ? payload : JSON.stringify(payload);
    return new Response(responseBody, {
      status,
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

const createController = (
  kv: InstanceType<typeof KvClient>,
  r2: InstanceType<typeof R2Client>,
  overrides?: { workerUrl?: string },
) =>
  createTelegramBotController({
    kv,
    r2,
    token: "test-token",
    workerUrl: overrides?.workerUrl ?? "th-reports.buyclientuz.workers.dev",
    telegramSecret: "secret",
    defaultTimezone: "Asia/Tashkent",
    adminIds: [999999],
  });

const findLastSendMessage = (requests: FetchRecord[]) =>
  [...requests].reverse().find((entry) => entry.url.includes("/sendMessage"));

const findLastSendDocument = (requests: FetchRecord[]) =>
  [...requests].reverse().find((entry) => entry.url.includes("/sendDocument"));

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
  await putFbAuthRecord(kv, {
    userId: 100,
    accessToken: "token",
    expiresAt: "2025-01-01T00:00:00.000Z",
    adAccounts: [
      { id: "act_123", name: "BirLash", currency: "USD", status: 1 },
      { id: "act_456", name: "FlexAds", currency: "USD", status: 1 },
    ],
  });
  await putFreeChatRecord(kv, {
    chatId: -1007001,
    chatTitle: "Birlash Leads",
    ownerId: 100,
    registeredAt: new Date().toISOString(),
  });

  const controller = createController(kv, r2);
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "/start" },
    } as unknown as TelegramUpdate);

    assert.ok(stub.requests.length >= 1);
    assert.ok(String(stub.requests[0]?.body.text).includes("Главное меню"));
    const menuKeyboard = stub.requests[0]?.body.reply_markup as {
      inline_keyboard: Array<Array<{ text: string; url?: string; callback_data?: string }>>;
    };
    assert.ok(menuKeyboard);
    assert.equal(
      menuKeyboard.inline_keyboard[0]?.[0]?.url,
      "https://th-reports.buyclientuz.workers.dev/api/meta/oauth/start?tid=100",
    );
    assert.equal(menuKeyboard.inline_keyboard[0]?.[1]?.callback_data, "cmd:meta");

    stub.requests.length = 0;

    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "Проекты" },
    } as unknown as TelegramUpdate);

    assert.equal(stub.requests.length, 1);
    const creationKeyboard = stub.requests[0]?.body.reply_markup as {
      inline_keyboard: Array<Array<{ callback_data?: string }>>;
    };
    assert.ok(creationKeyboard);
    assert.equal(creationKeyboard.inline_keyboard[0]?.[0]?.callback_data, "project:add:act_123");
    const myProjectsButton = creationKeyboard.inline_keyboard
      .flat()
      .find((btn) => btn.callback_data === "project:list");
    assert.ok(myProjectsButton);
    assert.match(String(stub.requests[0]?.body.text), /Выберите рекламный аккаунт/);
  } finally {
    stub.restore();
  }
});

test("Inline main menu buttons route through cmd:* callbacks", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await putFbAuthRecord(kv, {
    userId: 100,
    accessToken: "token",
    expiresAt: "2025-01-01T00:00:00.000Z",
    adAccounts: [{ id: "act_inline", name: "Inline Ads", currency: "USD", status: 1 }],
  });

  const controller = createController(kv, r2);
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "/start" },
    } as unknown as TelegramUpdate);

    stub.requests.length = 0;

    await controller.handleUpdate({
      callback_query: {
        id: "cb_cmd_projects",
        from: { id: 100 },
        message: { chat: { id: 100 }, message_id: 42 },
        data: "cmd:projects",
      },
    } as unknown as TelegramUpdate);

    const request = stub.requests.find((entry) => entry.url.includes("sendMessage") || entry.url.includes("editMessage"));
    assert.ok(request, "panel render should send or edit a message");
    assert.match(String(request?.body.text), /Выберите рекламный аккаунт/);
  } finally {
    stub.restore();
  }
});

test("Telegram bot warns group chats to switch to private chat", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  const controller = createController(kv, r2);
  let sendAttempts = 0;
  const stub = installFetchStub((url) => {
    if (url.includes("sendMessage")) {
      sendAttempts += 1;
      if (sendAttempts === 1) {
        return { status: 403, body: { ok: false, description: "Forbidden" } };
      }
    }
    return undefined;
  });

  try {
    await controller.handleUpdate({
      message: {
        chat: { id: -100777, type: "supergroup", title: "Team" },
        from: { id: 555 },
        text: "/start",
      },
    } as unknown as TelegramUpdate);

    assert.equal(stub.requests.length, 2);
    assert.equal(stub.requests[0]?.body.chat_id, 555);
    assert.match(String(stub.requests[0]?.body.text), /личном чате/);
    assert.equal(stub.requests[1]?.body.chat_id, -100777);
    assert.match(String(stub.requests[1]?.body.text), /В группах бот реагирует только на команду \/reg/);

    stub.requests.length = 0;

    await controller.handleUpdate({
      message: {
        chat: { id: -100777, type: "supergroup", title: "Team" },
        from: { id: 555 },
        text: "/start",
      },
    } as unknown as TelegramUpdate);

    assert.equal(stub.requests.length, 0, "repeat messages are throttled");
  } finally {
    stub.restore();
  }
});

test("Telegram bot controller shows project card and handles +30 billing", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await seedProject(kv, r2);

  const controller = createController(kv, r2);
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

    const billing = await getBillingRecord(kv, "proj_a");
    assert.equal(billing?.nextPaymentDate, "2025-01-31");

    const payments = await getPaymentsHistoryDocument(r2, "proj_a");
    assert.equal(payments?.payments.length, 1);
    assert.equal(payments?.payments[0]?.periodTo, "2025-01-31");
  } finally {
    stub.restore();
  }
});

test("/reg command registers a chat group", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  const controller = createController(kv, r2);
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      message: {
        chat: { id: -1005001, type: "supergroup", title: "Target Group" },
        from: { id: 555 },
        text: "/reg",
      },
    } as unknown as TelegramUpdate);

    const record = await getFreeChatRecord(kv, -1005001);
    assert.equal(record?.ownerId, 555);
    const groupMessage = stub.requests.find((entry) => entry.url.includes("sendMessage") && entry.body.chat_id === -1005001);
    assert.ok(groupMessage);
    assert.match(String(groupMessage?.body.text), /Группа зарегистрирована/);
  } finally {
    stub.restore();
  }
});

test("ad account binding creates a new project and occupies chat", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await putFbAuthRecord(kv, {
    userId: 100,
    accessToken: "token",
    expiresAt: "2025-01-01T00:00:00.000Z",
    adAccounts: [{ id: "act_new", name: "New Ads", currency: "USD", status: 1 }],
  });
  await putFreeChatRecord(kv, {
    chatId: -1009001,
    chatTitle: "Fresh Group",
    ownerId: 100,
    registeredAt: new Date().toISOString(),
  });

  const controller = createController(kv, r2);
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      callback_query: {
        id: "cb1",
        from: { id: 100 },
        data: "project:add:act_new",
        message: { chat: { id: 100 }, message_id: 10 },
      },
    } as unknown as TelegramUpdate);

    const prompt = findLastSendMessage(stub.requests);
    assert.ok(prompt);
    assert.match(String(prompt?.body.text), /свободную чат-группу/);

    await controller.handleUpdate({
      callback_query: {
        id: "cb2",
        from: { id: 100 },
        data: "project:bind:act_new:-1009001",
        message: { chat: { id: 100 }, message_id: 11 },
      },
    } as unknown as TelegramUpdate);

    const membership = await getProjectsByUser(kv, 100);
    assert.ok(membership);
    const newProjectId = membership.projects[0];
    const project = await requireProjectRecord(kv, newProjectId);
    assert.equal(project.chatId, -1009001);

    const freeChat = await getFreeChatRecord(kv, -1009001);
    assert.equal(freeChat, null);
    const occupied = await getOccupiedChatRecord(kv, -1009001);
    assert.equal(occupied?.projectId, newProjectId);

    const groupNotification = stub.requests.find(
      (entry) => entry.url.includes("sendMessage") && entry.body.chat_id === -1009001,
    );
    assert.ok(groupNotification);
    assert.match(String(groupNotification?.body.text), /Группа успешно подключена/);
    const userNotification = findLastSendMessage(stub.requests);
    assert.match(String(userNotification?.body.text), /📦 Проект подключён/);
  } finally {
    stub.restore();
  }
});

test("Telegram bot controller exports leads as CSV document", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await seedProject(kv, r2);

  const controller = createController(kv, r2);
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      callback_query: {
        id: "cb1",
        from: { id: 100 },
        message: { message_id: 10, chat: { id: 100 } },
        data: "project:export-leads:proj_a",
      },
    } as unknown as TelegramUpdate);

    const docRequest = findLastSendDocument(stub.requests);
    assert.ok(docRequest, "expected sendDocument request");
    assert.equal(docRequest?.method, "POST");
  } finally {
    stub.restore();
  }
});

test("cmd:meta shows stored ad accounts", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await putFbAuthRecord(kv, {
    userId: 100,
    accessToken: "token",
    expiresAt: "2026-01-01T00:00:00.000Z",
    adAccounts: [
      { id: "act_1", name: "BirLash", currency: "USD", status: 1 },
      { id: "act_2", name: "Test", currency: "USD", status: 1 },
    ],
  });

  const controller = createController(kv, r2);
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      callback_query: {
        id: "cb-meta",
        from: { id: 100 },
        message: { chat: { id: 100 } },
        data: "cmd:meta",
      },
    } as unknown as TelegramUpdate);

    const lastMessage = findLastSendMessage(stub.requests);
    assert.ok(lastMessage);
    assert.ok(String(lastMessage.body.text).includes("Доступные рекламные аккаунты"));
    assert.ok(String(lastMessage.body.text).includes("BirLash"));
  } finally {
    stub.restore();
  }
});

test("cmd:webhooks normalises worker URL", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await seedProject(kv, r2);

  const controller = createController(kv, r2, {
    workerUrl: "https://th-reports.buyclientuz.workers.dev/",
  });
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      callback_query: {
        id: "cb-webhook",
        from: { id: 100 },
        message: { chat: { id: 100 } },
        data: "cmd:webhooks",
      },
    } as unknown as TelegramUpdate);

    const lastMessage = findLastSendMessage(stub.requests);
    assert.ok(lastMessage);
    const text = String(lastMessage.body.text);
    assert.ok(text.includes("https://th-reports.buyclientuz.workers.dev/tg-webhook?secret=secret"));
    assert.ok(!text.includes("https://https://"));
    assert.ok(text.includes("Нажмите «🔄 Обновить вебхук»"));

    const keyboard = lastMessage.body.reply_markup as {
      inline_keyboard: { text: string; url?: string; callback_data?: string }[][];
    };
    assert.ok(Array.isArray(keyboard.inline_keyboard));
    const flattened = keyboard.inline_keyboard.flat();
    const refreshButton = flattened.find((button) => button.text === "🔄 Обновить вебхук");
    assert.ok(refreshButton);
    const encoded = encodeURIComponent(
      "https://th-reports.buyclientuz.workers.dev/tg-webhook?secret=secret",
    );
    assert.equal(
      refreshButton?.url,
      `https://api.telegram.org/bottest-token/setWebhook?url=${encoded}`,
    );
  } finally {
    stub.restore();
  }
});

test("panel renderer fallback notifies chat on failure", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  const controller = createController(kv, r2);
  const stub = installFetchStub();
  try {
    await controller.handleUpdate({
      callback_query: {
        id: "cb-error",
        from: { id: 100 },
        message: { chat: { id: 100 } },
        data: "project:card:proj_missing",
      },
    } as unknown as TelegramUpdate);

    const lastMessage = findLastSendMessage(stub.requests);
    assert.ok(lastMessage);
    assert.ok(String(lastMessage.body.text).includes("Не удалось загрузить панель"));
  } finally {
    stub.restore();
  }
});

test("Telegram bot fetches Facebook ad accounts on demand", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await putFbAuthRecord(kv, {
    userId: 100,
    accessToken: "test-token",
    expiresAt: "2026-01-01T00:00:00.000Z",
    adAccounts: [],
  });

  const controller = createController(kv, r2);
  const stub = installFetchStub((url) =>
    url.includes("graph.facebook.com")
      ? {
          body: {
            data: [
              { id: "act_123", name: "BirLash", currency: "USD", account_status: 1 },
              { id: "act_456", name: "Client Two", currency: "EUR", account_status: 2 },
            ],
          },
        }
      : undefined,
  );

  try {
    await controller.handleUpdate({
      callback_query: {
        id: "cb-auth",
        from: { id: 100 },
        message: { chat: { id: 100 } },
        data: "auth:accounts",
      },
    } as unknown as TelegramUpdate);

    const sendMessage = findLastSendMessage(stub.requests);
    assert.ok(sendMessage);
    assert.match(String(sendMessage.body.text), /BirLash/);
    assert.match(String(sendMessage.body.text), /Client Two/);

    const record = await getFbAuthRecord(kv, 100);
    assert.ok(record);
    assert.equal(record.adAccounts.length, 2);
  } finally {
    stub.restore();
  }
});

test("Telegram bot controller updates billing date via prompt", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await seedProject(kv, r2);

  const controller = createController(kv, r2);
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
    const billing = await getBillingRecord(kv, "proj_a");
    assert.equal(billing?.nextPaymentDate, "2025-02-15");
  } finally {
    stub.restore();
  }
});

test("Telegram bot controller exits manual mode when a command arrives", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await seedProject(kv, r2);

  const controller = createController(kv, r2);
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      callback_query: {
        id: "cb-cancel",
        from: { id: 100 },
        message: { chat: { id: 100 } },
        data: "billing:set-date:proj_a",
      },
    } as unknown as TelegramUpdate);

    stub.requests.length = 0;

    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "/start" },
    } as unknown as TelegramUpdate);

    const reply = findLastSendMessage(stub.requests);
    assert.ok(reply);
    assert.match(String(reply.body.text), /Главное меню/);
  } finally {
    stub.restore();
  }
});

test("Telegram bot controller serves analytics, users, finance and webhook sections", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await seedProject(kv, r2);

  const controller = createController(kv, r2);
  const stub = installFetchStub((url) => {
    if (url.includes("getWebhookInfo")) {
      return { body: { ok: true, result: { url: "https://example/tg", pending_update_count: 0 } } };
    }
    return {};
  });

  try {
    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "Аналитика" },
    } as unknown as TelegramUpdate);
    assert.ok(findLastSendMessage(stub.requests)?.body.text?.includes("Сводная аналитика"));

    stub.requests.length = 0;
    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "Пользователи" },
    } as unknown as TelegramUpdate);
    assert.ok(findLastSendMessage(stub.requests)?.body.text?.includes("Пользователи и доступы"));

    stub.requests.length = 0;
    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "Финансы" },
    } as unknown as TelegramUpdate);
    assert.ok(findLastSendMessage(stub.requests)?.body.text?.includes("Финансы (все проекты)"));

    stub.requests.length = 0;
    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "Вебхуки Telegram" },
    } as unknown as TelegramUpdate);
    const webhookRequest = stub.requests.find((entry) => entry.url.includes("getWebhookInfo"));
    assert.ok(webhookRequest);
    assert.ok(findLastSendMessage(stub.requests)?.body.text?.includes("Telegram Webhook"));
  } finally {
    stub.restore();
  }
});

test("Telegram bot controller updates chat bindings via selection and manual input", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await seedProject(kv, r2);
  await recordKnownChat(kv, { id: -1001234, title: "Bir Group", type: "supergroup" });
  await putFreeChatRecord(kv, {
    chatId: -1001234,
    chatTitle: "Bir Group",
    ownerId: 100,
    registeredAt: new Date().toISOString(),
  });
  await putFreeChatRecord(kv, {
    chatId: -1007001,
    chatTitle: "Manual Chat",
    ownerId: 100,
    registeredAt: new Date().toISOString(),
  });

  const controller = createController(kv, r2);
  const stub = installFetchStub((url) => {
    if (url.includes("getChat")) {
      return { body: { ok: true, result: { id: -1007001, title: "Manual Chat", type: "supergroup" } } };
    }
    return {};
  });

  try {
    await controller.handleUpdate({
      callback_query: {
        id: "chat1",
        from: { id: 100 },
        message: { chat: { id: 100 } },
        data: "project:chat-change:proj_a",
      },
    } as unknown as TelegramUpdate);

    await controller.handleUpdate({
      callback_query: {
        id: "chat2",
        from: { id: 100 },
        message: { chat: { id: 100 } },
        data: "project:chat-select:proj_a:-1001234",
      },
    } as unknown as TelegramUpdate);

    let project = await requireProjectRecord(kv, "proj_a");
    assert.equal(project.chatId, -1001234);

    await controller.handleUpdate({
      callback_query: {
        id: "chat3",
        from: { id: 100 },
        message: { chat: { id: 100 } },
        data: "project:chat-manual:proj_a",
      },
    } as unknown as TelegramUpdate);

    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "@manualchat" },
    } as unknown as TelegramUpdate);

    project = await requireProjectRecord(kv, "proj_a");
    assert.equal(project.chatId, -1007001);
  } finally {
    stub.restore();
  }
});

test("Telegram bot controller toggles autoreports and alerts", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await seedProject(kv, r2);

  const controller = createController(kv, r2);
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      callback_query: {
        id: "auto1",
        from: { id: 100 },
        message: { chat: { id: 100 } },
        data: "project:autoreports-toggle:proj_a",
      },
    } as unknown as TelegramUpdate);
    let autoreports = await getAutoreportsRecord(kv, "proj_a");
    assert.equal(autoreports?.enabled, false);

    await controller.handleUpdate({
      callback_query: {
        id: "auto2",
        from: { id: 100 },
        message: { chat: { id: 100 } },
        data: "project:autoreports-time:proj_a",
      },
    } as unknown as TelegramUpdate);

    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "11:30" },
    } as unknown as TelegramUpdate);
    autoreports = await getAutoreportsRecord(kv, "proj_a");
    assert.equal(autoreports?.time, "11:30");

    await controller.handleUpdate({
      callback_query: {
        id: "auto3",
        from: { id: 100 },
        message: { chat: { id: 100 } },
        data: "project:autoreports-send:proj_a:admin",
      },
    } as unknown as TelegramUpdate);
    autoreports = await getAutoreportsRecord(kv, "proj_a");
    assert.equal(autoreports?.sendTo, "admin");

    await controller.handleUpdate({
      callback_query: {
        id: "alert1",
        from: { id: 100 },
        message: { chat: { id: 100 } },
        data: "project:alerts-toggle:proj_a",
      },
    } as unknown as TelegramUpdate);
    let alerts = await getAlertsRecord(kv, "proj_a");
    assert.equal(alerts?.enabled, false);

    await controller.handleUpdate({
      callback_query: {
        id: "alert2",
        from: { id: 100 },
        message: { chat: { id: 100 } },
        data: "project:alerts-route-set:proj_a:admin",
      },
    } as unknown as TelegramUpdate);
    alerts = await getAlertsRecord(kv, "proj_a");
    assert.equal(alerts?.channel, "admin");

    await controller.handleUpdate({
      callback_query: {
        id: "alert3",
        from: { id: 100 },
        message: { chat: { id: 100 } },
        data: "project:alerts-type:proj_a:lead",
      },
    } as unknown as TelegramUpdate);
    alerts = await getAlertsRecord(kv, "proj_a");
    assert.equal(alerts?.types.leadInQueue, false);
  } finally {
    stub.restore();
  }
});

test("Telegram bot controller stores Facebook tokens and user settings", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await seedProject(kv, r2);

  const controller = createController(kv, r2);
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "Авторизация Facebook" },
    } as unknown as TelegramUpdate);
    await controller.handleUpdate({
      callback_query: {
        id: "auth-manual",
        from: { id: 100 },
        message: { chat: { id: 100 } },
        data: "auth:manual",
      },
    } as unknown as TelegramUpdate);
    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "EAATESTTOKEN" },
    } as unknown as TelegramUpdate);
    const fbAuth = await getFbAuthRecord(kv, 100);
    assert.equal(fbAuth?.accessToken, "EAATESTTOKEN");

    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "Настройки" },
    } as unknown as TelegramUpdate);
    await controller.handleUpdate({
      callback_query: {
        id: "set1",
        from: { id: 100 },
        message: { chat: { id: 100 } },
        data: "settings:tz:Europe/Moscow",
      },
    } as unknown as TelegramUpdate);
    await controller.handleUpdate({
      callback_query: {
        id: "set2",
        from: { id: 100 },
        message: { chat: { id: 100 } },
        data: "settings:language:en",
      },
    } as unknown as TelegramUpdate);

    const settings = await getUserSettingsRecord(kv, 100, {});
    assert.equal(settings.timezone, "Europe/Moscow");
    assert.equal(settings.language, "en");
  } finally {
    stub.restore();
  }
});
