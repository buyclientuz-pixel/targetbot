import assert from "node:assert/strict";
import test from "node:test";

import { MemoryKVNamespace, MemoryR2Bucket } from "../utils/mocks.ts";
import type { TelegramUpdate } from "../../src/bot/types.ts";
import type { MetaSummaryMetrics, MetaSummaryPayload } from "../../src/domain/meta-summary.ts";

const { KvClient } = await import("../../src/infra/kv.ts");
const { R2Client } = await import("../../src/infra/r2.ts");
const { createTelegramBotController } = await import("../../src/bot/controller.ts");
const { PANEL_ERROR_MESSAGE } = await import("../../src/bot/panel-engine.ts");
const { recordKnownChat } = await import("../../src/domain/chat-registry.ts");
const { putFreeChatRecord, getFreeChatRecord, getOccupiedChatRecord, putOccupiedChatRecord } = await import(
  "../../src/domain/project-chats.ts",
);
const { putProjectsByUser, getProjectsByUser } = await import("../../src/domain/spec/projects-by-user.ts");
const { putProjectRecord, requireProjectRecord } = await import("../../src/domain/spec/project.ts");
const { putProject, createProject } = await import("../../src/domain/projects.ts");
const { createLead, saveLead } = await import("../../src/domain/leads.ts");
const { putBillingRecord, getBillingRecord } = await import("../../src/domain/spec/billing.ts");
const { putAutoreportsRecord, getAutoreportsRecord } = await import("../../src/domain/spec/autoreports.ts");
const { putProjectLeadsList } = await import("../../src/domain/spec/project-leads.ts");
const { putMetaCampaignsDocument } = await import("../../src/domain/spec/meta-campaigns.ts");
const { putPaymentsHistoryDocument, getPaymentsHistoryDocument } = await import("../../src/domain/spec/payments-history.ts");
const { getFbAuthRecord, putFbAuthRecord } = await import("../../src/domain/spec/fb-auth.ts");
const { getUserSettingsRecord } = await import("../../src/domain/spec/user-settings.ts");
const { ensureProjectSettings } = await import("../../src/domain/project-settings.ts");
const { createMetaCacheEntry, saveMetaCache } = await import("../../src/domain/meta-cache.ts");
const { buildLeadsPanelId, buildLeadsPayloadSegment } = await import("../../src/bot/leads-panel-state.ts");
const { resolvePeriodRange } = await import("../../src/services/project-insights.ts");

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
  await putAutoreportsRecord(kv, "proj_a", {
    enabled: true,
    time: "10:00",
    mode: "yesterday_plus_week",
    sendToChat: true,
    sendToAdmin: true,
    paymentAlerts: {
      enabled: false,
      sendToChat: true,
      sendToAdmin: true,
      lastAccountStatus: null,
      lastAlertAt: null,
    },
  });
  const now = new Date();
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString();
  await putProjectLeadsList(r2, "proj_a", {
    stats: { total: 3, today: 1 },
    leads: [
      {
        id: "lead_1",
        name: "User",
        phone: "+99890",
        createdAt: thirtyMinutesAgo,
        source: "facebook",
        campaignName: "Test",
        status: "new",
        type: "lead",
      },
      {
        id: "lead_2",
        name: "Processing",
        phone: "сообщение",
        createdAt: threeDaysAgo,
        source: "facebook",
        campaignName: "Test",
        status: "processing",
        type: "message",
      },
      {
        id: "lead_3",
        name: "Closed",
        phone: "+99899",
        createdAt: twentyDaysAgo,
        source: "facebook",
        campaignName: "Archive",
        status: "done",
        type: "lead",
      },
    ],
    syncedAt: new Date().toISOString(),
  });
  await saveLead(
    r2,
    createLead({
      id: "lead_1",
      projectId: "proj_a",
      name: "User",
      phone: "+99890",
      campaign: "Test",
      createdAt: thirtyMinutesAgo,
      formId: "form_a",
      metaRaw: { form_name: "Форма BirLash" },
    }),
  );
  await saveLead(
    r2,
    createLead({
      id: "lead_2",
      projectId: "proj_a",
      name: "Processing",
      phone: "сообщение",
      campaign: "Test",
      createdAt: threeDaysAgo,
      formId: "form_b",
      metaRaw: { form_name: "Форма Flex" },
    }),
  );
  await saveLead(
    r2,
    createLead({
      id: "lead_3",
      projectId: "proj_a",
      name: "Closed",
      phone: "+99899",
      campaign: "Archive",
      createdAt: twentyDaysAgo,
      formId: null,
      metaRaw: { form_name: null },
    }),
  );
  await putMetaCampaignsDocument(r2, "proj_a", {
    periodKey: "today",
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
  return {
    todayLeadDate: thirtyMinutesAgo.slice(0, 10),
    weekLeadDate: threeDaysAgo.slice(0, 10),
    monthLeadDate: twentyDaysAgo.slice(0, 10),
  } as const;
};

const shiftDateByDays = (date: Date, days: number): Date => {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
};

const scopedCache = (
  prefix: "summary" | "campaigns",
  periodKey: string,
  timezone: string,
  reportDate: Date,
) => {
  const range = resolvePeriodRange(periodKey, timezone, { now: reportDate });
  return { scope: `${prefix}:${periodKey}:${range.period.from}:${range.period.to}`, period: range.period };
};

const createScopedSummaryEntry = (
  projectId: string,
  periodKey: string,
  timezone: string,
  reportDate: Date,
  payload: MetaSummaryPayload,
  ttlSeconds = 3600,
) => {
  const { scope, period } = scopedCache("summary", periodKey, timezone, reportDate);
  return createMetaCacheEntry(projectId, scope, period, payload, ttlSeconds);
};

const createScopedCampaignEntry = (
  projectId: string,
  periodKey: string,
  timezone: string,
  reportDate: Date,
  payload: import("../../src/services/meta-api.ts").MetaInsightsRawResponse,
  ttlSeconds = 3600,
) => {
  const { scope, period } = scopedCache("campaigns", periodKey, timezone, reportDate);
  return createMetaCacheEntry(projectId, scope, period, payload, ttlSeconds);
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
    facebookUserId: "fb_user_100",
    facebookName: "Meta Owner",
  });
  await putFreeChatRecord(kv, {
    chatId: -1007001,
    chatTitle: "Birlash Leads",
    topicId: null,
    ownerId: 100,
    registeredAt: new Date().toISOString(),
  });

  const controller = createController(kv, r2);
  const stub = installFetchStub((url) => {
    if (url.includes("graph.facebook.com") && url.includes("/me/adaccounts")) {
      return { body: { data: [{ id: "act_manual", name: "Manual", currency: "USD", account_status: 1 }] } };
    }
    if (url.includes("graph.facebook.com") && url.includes("/me?")) {
      return { body: { id: "fb_manual", name: "Manual User" } };
    }
    return undefined;
  });

  try {
    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "/start" },
    } as unknown as TelegramUpdate);

    assert.ok(stub.requests.length >= 1);
    const menuRequest = stub.requests.find((entry) =>
      String(entry?.body?.text ?? "").includes("Главное меню"),
    );
    assert.ok(menuRequest, "expected a menu render request");
    const menuKeyboard = menuRequest?.body.reply_markup as {
      inline_keyboard: Array<Array<{ text: string; url?: string; callback_data?: string }>>;
    };
    assert.ok(menuKeyboard);
    assert.equal(
      menuKeyboard.inline_keyboard[0]?.[0]?.url,
      "https://th-reports.buyclientuz.workers.dev/api/meta/oauth/start?tid=100",
    );

    stub.requests.length = 0;

    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "Проекты" },
    } as unknown as TelegramUpdate);

    const projectRequest = findLastSendMessage(stub.requests);
    assert.ok(projectRequest, "expected project selection message");
    const creationKeyboard = projectRequest?.body.reply_markup as {
      inline_keyboard: Array<Array<{ text: string; callback_data?: string }>>;
    };
    assert.ok(creationKeyboard);
    const firstButton = creationKeyboard.inline_keyboard[0]?.[0];
    const secondButton = creationKeyboard.inline_keyboard[1]?.[0];
    assert.equal(firstButton?.callback_data, "project:card:proj_a");
    assert.match(String(firstButton?.text ?? ""), /^✅/);
    assert.equal(secondButton?.callback_data, "project:add:act_456");
    assert.match(String(secondButton?.text ?? ""), /^⚙️/);
    const hasLegacyButton = creationKeyboard.inline_keyboard
      .flat()
      .some((btn) => btn?.callback_data === "project:list");
    assert.equal(hasLegacyButton, false);
    assert.match(String(projectRequest?.body.text), /Выберите рекламный аккаунт/);
  } finally {
    stub.restore();
  }
});

test("Project list buttons reflect chat binding state", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await seedProject(kv, r2);
  await putProjectsByUser(kv, 100, { projects: ["proj_a", "proj_b"] });
  await putProjectRecord(kv, {
    id: "proj_b",
    name: "Free Slot",
    ownerId: 100,
    adAccountId: "act_789",
    chatId: null,
    portalUrl: "https://th-reports.buyclientuz.workers.dev/p/proj_b",
    settings: {
      currency: "USD",
      timezone: "Asia/Tashkent",
      kpi: { mode: "auto", type: "LEAD", label: "Лиды" },
    },
  });
  await putMetaCampaignsDocument(r2, "proj_b", {
    period: { from: "2025-01-01", to: "2025-01-01" },
    summary: { spend: 45, impressions: 0, clicks: 0, leads: 0, messages: 0 },
    campaigns: [],
    periodKey: null,
  });
  await putFbAuthRecord(kv, {
    userId: 100,
    accessToken: "token",
    expiresAt: "2025-01-01T00:00:00.000Z",
    adAccounts: [
      { id: "act_123", name: "BirLash", currency: "USD", status: 1 },
      { id: "act_789", name: "Free Slot", currency: "USD", status: 1 },
    ],
    facebookUserId: "fb_user_100",
    facebookName: "Meta Owner",
  });

  const controller = createController(kv, r2);
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "Проекты" },
    } as unknown as TelegramUpdate);

    const projectRequest = findLastSendMessage(stub.requests);
    assert.ok(projectRequest, "project selection message should be sent");
    const keyboard = projectRequest?.body.reply_markup as {
      inline_keyboard: Array<Array<{ text: string; callback_data?: string }>>;
    };
    const firstButton = keyboard.inline_keyboard[0]?.[0];
    const secondButton = keyboard.inline_keyboard[1]?.[0];
    assert.equal(firstButton?.callback_data, "project:card:proj_a");
    assert.match(String(firstButton?.text ?? ""), /^✅/);
    assert.equal(secondButton?.callback_data, "project:chat-change:proj_b");
    assert.match(String(secondButton?.text ?? ""), /^⚙️/);
  } finally {
    stub.restore();
  }
});

test("Ad account buttons show spend summary without IDs", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await seedProject(kv, r2);
  await putFbAuthRecord(kv, {
    userId: 100,
    accessToken: "token",
    expiresAt: "2025-01-01T00:00:00.000Z",
    adAccounts: [{ id: "act_123", name: "BirLash", currency: "USD", status: 1 }],
    facebookUserId: "fb_user_100",
    facebookName: "Meta Owner",
  });

  const controller = createController(kv, r2);
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "Проекты" },
    } as unknown as TelegramUpdate);

    const creationRequest = findLastSendMessage(stub.requests);
    assert.ok(creationRequest, "account creation keyboard should be sent");
    const keyboard = creationRequest?.body.reply_markup as {
      inline_keyboard: Array<Array<{ text: string }>>;
    };
    const buttonText = keyboard.inline_keyboard[0]?.[0]?.text ?? "";
    assert.match(buttonText, /BirLash/);
    assert.match(buttonText, /^[✅⚙️]/);
    assert.match(buttonText, /\$/);
    assert.ok(!/сегодня/i.test(buttonText));
    assert.ok(!buttonText.includes("act_"));
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
    facebookUserId: "fb_user_100",
    facebookName: "Meta Owner",
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

test("Group chats ignore commands except /reg and /stat", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await seedProject(kv, r2);
  await putOccupiedChatRecord(kv, {
    chatId: -100555666777,
    chatTitle: "Bir Group",
    topicId: null,
    ownerId: 100,
    projectId: "proj_a",
    projectName: "BirLash",
    boundAt: new Date().toISOString(),
  });

  const controller = createController(kv, r2);
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      message: {
        chat: { id: -100555666777, type: "supergroup", title: "Bir" },
        from: { id: 200 },
        text: "/start",
      },
    } as unknown as TelegramUpdate);

    assert.equal(stub.requests.length, 0, "non-whitelisted commands stay silent in groups");

    stub.requests.length = 0;

    await controller.handleUpdate({
      message: {
        chat: { id: -100555666777, type: "supergroup", title: "Bir" },
        from: { id: 200 },
        text: "/stat",
      },
    } as unknown as TelegramUpdate);

    const statMessage = stub.requests.find((entry) => entry.url.includes("sendMessage"));
    assert.ok(statMessage, "/stat should send a report to the group");
    assert.equal(statMessage?.body.chat_id, -100555666777);
    assert.match(String(statMessage?.body.text), /Отчёт по рекламе/);
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
        message_thread_id: 777,
      },
    } as unknown as TelegramUpdate);

    const record = await getFreeChatRecord(kv, -1005001);
    assert.equal(record?.ownerId, 555);
    assert.equal(record?.topicId, 777);
    const groupMessage = stub.requests.find((entry) => entry.url.includes("sendMessage") && entry.body.chat_id === -1005001);
    assert.ok(groupMessage);
    assert.match(String(groupMessage?.body.text), /Группа зарегистрирована/);
    assert.equal(groupMessage?.body.message_thread_id, 777);
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
    facebookUserId: "fb_user_100",
    facebookName: "Meta Owner",
  });
  await putFreeChatRecord(kv, {
    chatId: -1009001,
    chatTitle: "Fresh Group",
    topicId: null,
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
    const settings = await ensureProjectSettings(kv, newProjectId);
    assert.equal(settings.meta.facebookUserId, "fb_user_100");

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

test("lead notifications can be toggled from the leads panel", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await seedProject(kv, r2);
  await ensureProjectSettings(kv, "proj_a");

  const controller = createController(kv, r2);
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      callback_query: {
        id: "cb-show-leads",
        from: { id: 100 },
        message: { chat: { id: 100 }, message_id: 77 },
        data: buildLeadsPanelId("proj_a"),
      },
    } as unknown as TelegramUpdate);

    const leadsMessage = findLastSendMessage(stub.requests);
    assert.ok(leadsMessage, "expected leads panel render");
    const leadsText = String(leadsMessage?.body?.text ?? "");
    assert.match(leadsText, /Период:/);
    assert.match(leadsText, /За период:/);
    assert.match(leadsText, /Формы и лиды/);
    assert.match(leadsText, /Уведомления:/);
    const leadsKeyboard = leadsMessage?.body?.reply_markup as {
      inline_keyboard: { text: string; callback_data?: string }[][];
    };
    const toggleButton = leadsKeyboard?.inline_keyboard
      ?.flat()
      .find((button) => button.text?.startsWith("👥 Чат"));
    assert.ok(toggleButton);

    stub.requests.length = 0;

    await controller.handleUpdate({
      callback_query: {
        id: "cb-toggle",
        from: { id: 100 },
        message: { chat: { id: 100 }, message_id: 78 },
        data: `project:leads-target:chat:${buildLeadsPayloadSegment("proj_a")}`,
      },
    } as unknown as TelegramUpdate);

    const updatedSettings = await ensureProjectSettings(kv, "proj_a");
    assert.equal(updatedSettings.leads.sendToChat, false);
    const rerender = findLastSendMessage(stub.requests);
    assert.ok(rerender, "expected panel rerender after toggle");
    const rerenderKeyboard = rerender?.body?.reply_markup as {
      inline_keyboard: { text: string; callback_data?: string }[][];
    };
    const rerenderChatButton = rerenderKeyboard?.inline_keyboard
      ?.flat()
      .find((button) => button.text?.startsWith("👥 Чат"));
    assert.ok(rerenderChatButton?.text?.includes("выкл"));
  } finally {
    stub.restore();
  }
});

test("leads panel period buttons expand the dataset", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await seedProject(kv, r2);
  await ensureProjectSettings(kv, "proj_a");

  const controller = createController(kv, r2);
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      callback_query: {
        id: "cb-show-leads",
        from: { id: 100 },
        message: { chat: { id: 100 }, message_id: 77 },
        data: buildLeadsPanelId("proj_a"),
      },
    } as unknown as TelegramUpdate);

    stub.requests.length = 0;

    await controller.handleUpdate({
      callback_query: {
        id: "cb-period-week",
        from: { id: 100 },
        message: { chat: { id: 100 }, message_id: 78 },
        data: buildLeadsPanelId("proj_a", { periodKey: "week" }),
      },
    } as unknown as TelegramUpdate);

    const weekMessage = findLastSendMessage(stub.requests);
    assert.ok(weekMessage, "expected leads panel rerender for week period");
    const text = String(weekMessage?.body?.text ?? "");
    assert.match(text, /За период: <b>2<\/b>/);
  } finally {
    stub.restore();
  }
});

test("leads panel lists forms and opens form detail", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await seedProject(kv, r2);
  await ensureProjectSettings(kv, "proj_a");

  const controller = createController(kv, r2);
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      callback_query: {
        id: "cb-leads",
        from: { id: 100 },
        message: { chat: { id: 100 }, message_id: 81 },
        data: buildLeadsPanelId("proj_a"),
      },
    } as unknown as TelegramUpdate);

    const leadsMessage = findLastSendMessage(stub.requests);
    assert.ok(leadsMessage, "expected leads panel render");
    const keyboard = leadsMessage?.body?.reply_markup as {
      inline_keyboard: { text: string; callback_data?: string }[][];
    };
    const formButton = keyboard?.inline_keyboard
      ?.flat()
      .find((button) => button.callback_data?.includes(":form:"));
    assert.ok(formButton, "expected form button in keyboard");

    stub.requests.length = 0;

    await controller.handleUpdate({
      callback_query: {
        id: "cb-form",
        from: { id: 100 },
        message: { chat: { id: 100 }, message_id: 82 },
        data: formButton?.callback_data!,
      },
    } as unknown as TelegramUpdate);

    const detailMessage = findLastSendMessage(stub.requests);
    assert.ok(detailMessage, "expected form detail render");
    const detailText = String(detailMessage?.body?.text ?? "");
    assert.match(detailText, /Форма:/);
    assert.match(detailText, /Последние контакты/);
    const detailKeyboard = detailMessage?.body?.reply_markup as {
      inline_keyboard: { text: string; callback_data?: string }[][];
    };
    const backToForms = detailKeyboard?.inline_keyboard
      ?.flat()
      .find((button) => button.text?.includes("К формам"));
    assert.ok(backToForms, "expected back to forms button");
  } finally {
    stub.restore();
  }
});

test("custom lead ranges can be entered manually", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  const { monthLeadDate } = await seedProject(kv, r2);
  await ensureProjectSettings(kv, "proj_a");

  const controller = createController(kv, r2);
  const stub = installFetchStub();

  try {
    await controller.handleUpdate({
      callback_query: {
        id: "cb-range",
        from: { id: 100 },
        message: { chat: { id: 100 }, message_id: 80 },
        data: `project:leads-range:${buildLeadsPayloadSegment("proj_a")}`,
      },
    } as unknown as TelegramUpdate);

    const prompt = findLastSendMessage(stub.requests);
    assert.ok(prompt, "expected manual range prompt");
    assert.match(String(prompt?.body?.text ?? ""), /Введите период/);

    stub.requests.length = 0;

    await controller.handleUpdate({
      message: { chat: { id: 100, type: "private" }, from: { id: 100 }, text: `${monthLeadDate} ${monthLeadDate}` },
    } as unknown as TelegramUpdate);

    const customMessage = findLastSendMessage(stub.requests);
    assert.ok(customMessage, "expected custom range render");
    const text = String(customMessage?.body?.text ?? "");
    assert.match(text, new RegExp(`Период: ${monthLeadDate}`));
    assert.match(text, /За период: <b>1<\/b>/);
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
    facebookUserId: "fb_user_100",
    facebookName: "Meta Owner",
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
    const analyticsText = String(findLastSendMessage(stub.requests)?.body.text ?? "");
    assert.ok(analyticsText.includes("Сводная аналитика"));

    stub.requests.length = 0;
    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "Пользователи" },
    } as unknown as TelegramUpdate);
    const usersText = String(findLastSendMessage(stub.requests)?.body.text ?? "");
    assert.ok(usersText.includes("Пользователи и доступы"));

    stub.requests.length = 0;
    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "Финансы" },
    } as unknown as TelegramUpdate);
    const financeText = String(findLastSendMessage(stub.requests)?.body.text ?? "");
    assert.ok(financeText.includes("Финансы (все проекты)"));

    stub.requests.length = 0;
    await controller.handleUpdate({
      message: { chat: { id: 100 }, from: { id: 100 }, text: "Вебхуки Telegram" },
    } as unknown as TelegramUpdate);
    const webhookRequest = stub.requests.find((entry) => entry.url.includes("getWebhookInfo"));
    assert.ok(webhookRequest);
    const webhookText = String(findLastSendMessage(stub.requests)?.body.text ?? "");
    assert.ok(webhookText.includes("Telegram Webhook"));
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
    topicId: null,
    ownerId: 100,
    registeredAt: new Date().toISOString(),
  });
  await putFreeChatRecord(kv, {
    chatId: -1007001,
    chatTitle: "Manual Chat",
    topicId: null,
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


test("auto_send_now dispatches manual auto-report", async () => {
  const RealDate = Date;
  const fixedNow = new RealDate("2025-11-20T12:00:00Z");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Date = class extends RealDate {
    constructor(value?: unknown) {
      if (arguments.length === 0) {
        super(fixedNow.getTime());
      } else {
        super(value as any);
      }
    }
    static now() {
      return fixedNow.getTime();
    }
  } as DateConstructor;

  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await seedProject(kv, r2);
  await putProject(
    kv,
    createProject({ id: "proj_a", name: "BirLash", adsAccountId: "act_123", ownerTelegramId: 100 }),
  );

  const timezone = "Asia/Tashkent";
  const reportDate = shiftDateByDays(new Date(), -1);
  const todayMetrics = {
    spend: 44.94,
    impressions: 3000,
    clicks: 280,
    leads: 21,
    messages: 12,
    purchases: 1,
    addToCart: 0,
    calls: 0,
    registrations: 0,
    engagement: 0,
    leadsToday: 21,
    messagesToday: 12,
    leadsTotal: 300,
    cpa: 2.14,
    spendToday: 44.94,
    cpaToday: 2.14,
  } satisfies MetaSummaryMetrics;
  const yesterdayMetrics = {
    spend: 12,
    impressions: 1800,
    clicks: 150,
    leads: 9,
    messages: 4,
    purchases: 0,
    addToCart: 0,
    calls: 0,
    registrations: 0,
    engagement: 0,
    leadsToday: 9,
    messagesToday: 4,
    leadsTotal: 200,
    cpa: 1.33,
    spendToday: 12,
    cpaToday: 1.33,
  } satisfies MetaSummaryMetrics;

  const summaryByPeriod: Record<string, MetaSummaryMetrics> = {
    today: todayMetrics,
    yesterday: yesterdayMetrics,
    week: todayMetrics,
    month: todayMetrics,
  };

  for (const periodKey of Object.keys(summaryByPeriod)) {
    await saveMetaCache(
      kv,
      createScopedSummaryEntry(
        "proj_a",
        periodKey,
        timezone,
        reportDate,
        { periodKey, metrics: summaryByPeriod[periodKey], source: {} } as MetaSummaryPayload,
        3600,
      ),
    );
  }

  await saveMetaCache(
    kv,
      createScopedCampaignEntry(
        "proj_a",
        "today",
        timezone,
        reportDate,
        {
          data: [
            {
              campaign_id: "cmp1",
              campaign_name: "Lead Ads",
              objective: "LEAD_GENERATION",
              spend: 44.94,
              impressions: 3000,
              clicks: 280,
              actions: [
                { action_type: "lead", value: 21 },
                { action_type: "onsite_conversion.messaging_conversation_started_7d", value: 12 },
              ],
            },
          ],
        },
        3600,
    ),
  );

  const controller = createController(kv, r2);
  const stub = installFetchStub((url) => {
    if (url.includes("graph.facebook.com")) {
      throw new Error(`unexpected graph request: ${url}`);
    }
    return undefined;
  });

  try {
    await controller.handleUpdate({
      callback_query: {
        id: "auto-now",
        from: { id: 100 },
        message: { chat: { id: 100 } },
        data: "auto_send_now:proj_a",
      },
    } as unknown as TelegramUpdate);

    const reportRequests = stub.requests.filter(
      (entry) =>
        entry.url.includes("/sendMessage") &&
        typeof entry.body?.text === "string" &&
        String(entry.body.text).startsWith("📊 Отчёт"),
    );
    const chatDelivery = reportRequests.find((entry) => entry.body.chat_id === -100555666777);
    assert.ok(chatDelivery, "expected chat delivery for auto report");
    assert.match(String(chatDelivery?.body?.text ?? ""), /ручной запуск/);
    assert.match(JSON.stringify(chatDelivery?.body?.reply_markup ?? {}), /Открыть портал/);

    const normalised = String(chatDelivery?.body?.text ?? "").replace(/\u00a0/g, " ");
    assert.match(normalised, /Вчера: 21 лидов · расход 44,94 \$ · цена 2,14 \$/);
    assert.match(normalised, /Позавчера: 9 лидов · цена 1,33 \$/);

    const ownerDelivery = reportRequests.find((entry) => entry.body.chat_id === 100);
    assert.ok(ownerDelivery, "expected owner delivery for auto report");
  } finally {
    stub.restore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Date = RealDate;
  }
});

test("Telegram bot controller stores Facebook tokens and user settings", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await seedProject(kv, r2);

  const controller = createController(kv, r2);
  const graphRequests: string[] = [];
  const stub = installFetchStub((url) => {
    if (url.includes("graph.facebook.com") && url.includes("/me/adaccounts")) {
      graphRequests.push(url);
      return { body: { data: [{ id: "act_manual", name: "Manual", currency: "USD", account_status: 1 }] } };
    }
    if (url.includes("graph.facebook.com") && url.includes("/me?")) {
      graphRequests.push(url);
      return { body: { id: "fb_manual", name: "Manual User" } };
    }
    return undefined;
  });

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
    assert.equal(fbAuth?.facebookUserId, "fb_manual");
    assert.ok(graphRequests.some((url) => url.includes("/me/adaccounts")));
    assert.ok(graphRequests.some((url) => url.includes("/me?")));

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

test("panel fallback message is sent if Telegram rejects updates", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await seedProject(kv, r2);
  const controller = createController(kv, r2);
  let sendAttempts = 0;
  const stub = installFetchStub((url) => {
    if (url.includes("/sendMessage")) {
      sendAttempts += 1;
      if (sendAttempts === 2) {
        return { status: 500, body: JSON.stringify({ ok: false, description: "error" }) };
      }
    }
    return undefined;
  });
  try {
    await controller.handleUpdate({
      message: { chat: { id: 100, type: "private" }, from: { id: 100 }, text: "/start" },
    } as TelegramUpdate);
    const sends = stub.requests.filter((entry) => entry.url.includes("/sendMessage"));
    assert.equal(sends.length >= 2, true);
    const fallback = sends.find((entry) => entry.body.text === PANEL_ERROR_MESSAGE);
    assert.ok(fallback);
  } finally {
    stub.restore();
  }
});
