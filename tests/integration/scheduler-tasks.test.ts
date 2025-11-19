import assert from "node:assert/strict";
import test from "node:test";
import { MemoryKVNamespace, MemoryR2Bucket } from "../utils/mocks.ts";
import type { MetaSummaryMetrics, MetaSummaryPayload } from "../../src/domain/meta-summary.ts";

const { KvClient } = await import("../../src/infra/kv.ts");
const { R2Client } = await import("../../src/infra/r2.ts");
const { createProject, putProject } = await import("../../src/domain/projects.ts");
const { putProjectRecord } = await import("../../src/domain/spec/project.ts");
const { putBillingRecord } = await import("../../src/domain/spec/billing.ts");
const { getAutoreportsRecord, putAutoreportsRecord } = await import("../../src/domain/spec/autoreports.ts");
const { putProjectLeadsList, putLeadDetailRecord } = await import(
  "../../src/domain/spec/project-leads.ts"
);
const { createMetaCacheEntry, saveMetaCache } = await import("../../src/domain/meta-cache.ts");
const { KV_KEYS } = await import("../../src/config/kv.ts");
const { runAutoReports } = await import("../../src/services/auto-reports.ts");
const { runMaintenance } = await import("../../src/services/maintenance.ts");
const { R2_KEYS } = await import("../../src/config/r2.ts");
const { ensureProjectSettings, upsertProjectSettings } = await import("../../src/domain/project-settings.ts");
const { createMetaToken, upsertMetaToken } = await import("../../src/domain/meta-tokens.ts");
const { resolvePeriodRange } = await import("../../src/services/project-insights.ts");

interface TelegramCall {
  url: string;
  body: Record<string, unknown>;
}

const stubTelegramFetch = (): { calls: TelegramCall[]; restore: () => void } => {
  const calls: TelegramCall[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const bodyRaw = typeof init?.body === "string" ? init.body : undefined;
    const parsedBody = bodyRaw ? (JSON.parse(bodyRaw) as Record<string, unknown>) : {};
    calls.push({ url, body: parsedBody });
    return new Response(JSON.stringify({ ok: true, result: { message_id: calls.length } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
};

const createAutoreportRecord = (
  overrides: Partial<{
    enabled: boolean;
    time: string;
    mode: string;
    sendToChat: boolean;
    sendToAdmin: boolean;
    paymentAlerts: Record<string, unknown>;
  }> = {},
) => {
  const { paymentAlerts, ...rest } = overrides;
  return {
    enabled: false,
    time: "12:00",
    mode: "today",
    sendToChat: true,
    sendToAdmin: false,
    paymentAlerts: {
      enabled: false,
      sendToChat: true,
      sendToAdmin: true,
      lastAccountStatus: null,
      lastAlertAt: null,
      ...(paymentAlerts ?? {}),
    },
    ...rest,
  };
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
  payload: import("../../src/domain/meta-cache.ts").MetaInsightsRawResponse,
  ttlSeconds = 3600,
) => {
  const { scope, period } = scopedCache("campaigns", periodKey, timezone, reportDate);
  return createMetaCacheEntry(projectId, scope, period, payload, ttlSeconds);
};

test(
  "runAutoReports dispatches due slot and records schedule state",
  { concurrency: false },
  async () => {
    const kvNamespace = new MemoryKVNamespace();
    const kv = new KvClient(kvNamespace);
    await putProject(kv, createProject({
      id: "proj-auto",
      name: "Auto Reports",
      adsAccountId: "act_1",
      ownerTelegramId: 777000,
    }));
    await putProjectRecord(kv, {
      id: "proj-auto",
      name: "Auto Reports",
      ownerId: 777000,
      adAccountId: "act_1",
      chatId: null,
      portalUrl: "https://th-reports.buyclientuz.workers.dev/p/proj-auto",
      settings: { currency: "USD", timezone: "Asia/Tashkent", kpi: { mode: "auto", type: "LEAD", label: "Лиды" } },
    });
    await putBillingRecord(kv, "proj-auto", {
      tariff: 500,
      currency: "USD",
      nextPaymentDate: "2025-01-31",
      autobilling: true,
    });
    await putAutoreportsRecord(
      kv,
      "proj-auto",
      createAutoreportRecord({ enabled: true, time: "12:00", mode: "today", sendToChat: false, sendToAdmin: true }),
    );

    const now = new Date("2025-01-01T07:02:00.000Z");
    const reportDate = shiftDateByDays(now, -1);
    const timezone = "Asia/Tashkent";
    const summaryEntry = createScopedSummaryEntry(
      "proj-auto",
      "today",
      timezone,
      reportDate,
      {
        periodKey: "today",
        metrics: {
          spend: 20,
          impressions: 1500,
          clicks: 120,
          leads: 4,
          messages: 2,
          purchases: 1,
          addToCart: 0,
          calls: 0,
          registrations: 0,
          engagement: 0,
          leadsToday: 4,
          leadsTotal: 200,
          cpa: 5,
          spendToday: 20,
          cpaToday: 5,
        },
        source: {},
      },
      3600,
    );
    await saveMetaCache(kv, summaryEntry);
    for (const periodKey of ["yesterday", "week", "month"]) {
      const entry = createScopedSummaryEntry(
        "proj-auto",
        periodKey,
        timezone,
        reportDate,
        {
          periodKey,
          metrics: {
            spend: 20,
            impressions: 1500,
            clicks: 120,
            leads: 4,
            messages: 2,
            purchases: 1,
            addToCart: 0,
            calls: 0,
            registrations: 0,
            engagement: 0,
            leadsToday: 4,
            leadsTotal: 200,
            cpa: 5,
            spendToday: 20,
            cpaToday: 5,
          },
          source: {},
        },
        3600,
      );
      await saveMetaCache(kv, entry);
    }

    const campaignsEntry = createScopedCampaignEntry(
      "proj-auto",
      "today",
      timezone,
      reportDate,
      {
        data: [
          {
            campaign_id: "cmp-auto",
            campaign_name: "Авто",
            objective: "LINK_CLICKS",
            spend: "20",
            impressions: "800",
            clicks: "100",
            actions: [
              { action_type: "lead", value: "4" },
              { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "2" },
            ],
          },
        ],
      },
      3600,
    );
    await saveMetaCache(kv, campaignsEntry);
    const telegram = stubTelegramFetch();

    try {
      await runAutoReports(kv, "TEST_TOKEN", now);
    } finally {
      telegram.restore();
    }

    assert.equal(telegram.calls.length, 1);
    assert.ok(telegram.calls[0].url.includes("sendMessage"));
    const messageText = String(telegram.calls[0].body.text ?? "");
    assert.match(messageText, /📊 Отчёт/);
    assert.match(messageText, /Топ кампании/);
    assert.match(messageText, /Цель: Лиды/);
    assert.deepEqual(telegram.calls[0].body.reply_markup, {
      inline_keyboard: [[{ text: "Открыть портал", url: "https://th-reports.buyclientuz.workers.dev/p/proj-auto" }]],
    });
    assert.equal(telegram.calls[0].body.chat_id, 777000);

    const state = await kv.getJson<{ slots?: Record<string, string | null> }>(KV_KEYS.reportState("proj-auto"));
    assert.ok(state?.slots?.["12:00"]);
  },
);

test(
  "runAutoReports prefers messages goal when there are no leads",
  { concurrency: false },
  async () => {
    const kvNamespace = new MemoryKVNamespace();
    const kv = new KvClient(kvNamespace);
    await putProject(
      kv,
      createProject({
        id: "proj-auto-msg",
        name: "Auto Reports Msg",
        adsAccountId: "act_msg",
        ownerTelegramId: 999111,
      }),
    );
    await putProjectRecord(kv, {
      id: "proj-auto-msg",
      name: "Auto Reports Msg",
      ownerId: 999111,
      adAccountId: "act_msg",
      chatId: -1009911,
      portalUrl: "",
      settings: { currency: "USD", timezone: "Asia/Tashkent", kpi: { mode: "auto", type: "LEAD", label: "Лиды" } },
    });
    await putBillingRecord(kv, "proj-auto-msg", {
      tariff: 350,
      currency: "USD",
      nextPaymentDate: "2025-02-01",
      autobilling: false,
    });
    await putAutoreportsRecord(
      kv,
      "proj-auto-msg",
      createAutoreportRecord({ enabled: true, time: "14:00", mode: "today", sendToChat: true, sendToAdmin: false }),
    );

    const summaryMetrics = {
      spend: 15,
      impressions: 900,
      clicks: 80,
      leads: 0,
      messages: 6,
      purchases: 0,
      addToCart: 0,
      calls: 0,
      registrations: 0,
      engagement: 0,
      leadsToday: 0,
      leadsTotal: 120,
      cpa: null,
      spendToday: 15,
      cpaToday: null,
    } satisfies MetaSummaryMetrics;

    const now = new Date("2025-01-01T09:01:00.000Z");
    const reportDate = shiftDateByDays(now, -1);
    const timezone = "Asia/Tashkent";
    const summaryEntry = createScopedSummaryEntry(
      "proj-auto-msg",
      "today",
      timezone,
      reportDate,
      { periodKey: "today", metrics: summaryMetrics as MetaSummaryPayload["metrics"], source: {} },
      3600,
    );
    await saveMetaCache(kv, summaryEntry);
    for (const periodKey of ["yesterday", "week", "month"]) {
      const entry = createScopedSummaryEntry(
        "proj-auto-msg",
        periodKey,
        timezone,
        reportDate,
        { periodKey, metrics: summaryMetrics as MetaSummaryPayload["metrics"], source: {} },
        3600,
      );
      await saveMetaCache(kv, entry);
    }

    const campaignsEntry = createScopedCampaignEntry(
      "proj-auto-msg",
      "today",
      timezone,
      reportDate,
      {
        data: [
          {
            campaign_id: "cmp-msg",
            campaign_name: "Messages",
            objective: "LINK_CLICKS",
            spend: "15",
            impressions: "600",
            clicks: "60",
            actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "6" }],
          },
        ],
      },
      3600,
    );
    await saveMetaCache(kv, campaignsEntry);
    const telegram = stubTelegramFetch();

    try {
      await runAutoReports(kv, "TEST_TOKEN", now);
    } finally {
      telegram.restore();
    }

    assert.equal(telegram.calls.length, 1);
    const messageText = String(telegram.calls[0].body.text ?? "");
    assert.match(messageText, /Цель: Сообщения/);
  },
);

test(
  "runAutoReports sticks to leads for auto KPI click projects",
  { concurrency: false },
  async () => {
    const kvNamespace = new MemoryKVNamespace();
    const kv = new KvClient(kvNamespace);
    await putProject(kv, createProject({
      id: "proj-auto-click",
      name: "Auto Reports Click",
      adsAccountId: "act_click",
      ownerTelegramId: 600100,
    }));
    await putProjectRecord(kv, {
      id: "proj-auto-click",
      name: "Auto Reports Click",
      ownerId: 600100,
      adAccountId: "act_click",
      chatId: null,
      portalUrl: "",
      settings: { currency: "USD", timezone: "Asia/Tashkent", kpi: { mode: "auto", type: "CLICK", label: "Клики" } },
    });
    await putBillingRecord(kv, "proj-auto-click", {
      tariff: 450,
      currency: "USD",
      nextPaymentDate: "2025-02-15",
      autobilling: false,
    });
    await putAutoreportsRecord(
      kv,
      "proj-auto-click",
      createAutoreportRecord({ enabled: true, time: "15:00", mode: "today", sendToChat: false, sendToAdmin: true }),
    );

    const emptyConversions: MetaSummaryMetrics = {
      spend: 30,
      impressions: 2000,
      clicks: 150,
      leads: 0,
      messages: 0,
      purchases: 0,
      addToCart: 0,
      calls: 0,
      registrations: 0,
      engagement: 0,
      leadsToday: 0,
      leadsTotal: 120,
      cpa: null,
      spendToday: 30,
      cpaToday: null,
    };

    const now = new Date("2025-01-01T10:02:00.000Z");
    const reportDate = shiftDateByDays(now, -1);
    const timezone = "Asia/Tashkent";
    for (const periodKey of ["today", "yesterday", "week", "month"]) {
      const entry = createScopedSummaryEntry(
        "proj-auto-click",
        periodKey,
        timezone,
        reportDate,
        { periodKey, metrics: emptyConversions as MetaSummaryPayload["metrics"], source: {} },
        3600,
      );
      await saveMetaCache(kv, entry);
    }

    const campaignsEntry = createScopedCampaignEntry(
      "proj-auto-click",
      "today",
      timezone,
      reportDate,
      {
        data: [
          {
            campaign_id: "cmp-click",
            campaign_name: "Traffic",
            objective: "LINK_CLICKS",
            spend: "30",
            impressions: "2000",
            clicks: "150",
            actions: [],
          },
        ],
      },
      3600,
    );
    await saveMetaCache(kv, campaignsEntry);
    const telegram = stubTelegramFetch();
    try {
      await runAutoReports(kv, "TEST_TOKEN", now);
    } finally {
      telegram.restore();
    }

    assert.equal(telegram.calls.length, 1);
    const messageText = String(telegram.calls[0].body.text ?? "");
    assert.match(messageText, /Цель: Лиды/);
  },
);

test(
  "runAutoReports respects manual KPI mode for click projects",
  { concurrency: false },
  async () => {
    const kvNamespace = new MemoryKVNamespace();
    const kv = new KvClient(kvNamespace);
    await putProject(kv, createProject({
      id: "proj-manual-click",
      name: "Manual KPI Click",
      adsAccountId: "act_manual_click",
      ownerTelegramId: 600200,
    }));
    await putProjectRecord(kv, {
      id: "proj-manual-click",
      name: "Manual KPI Click",
      ownerId: 600200,
      adAccountId: "act_manual_click",
      chatId: null,
      portalUrl: "",
      settings: { currency: "USD", timezone: "Asia/Tashkent", kpi: { mode: "manual", type: "CLICK", label: "Клики" } },
    });
    await putBillingRecord(kv, "proj-manual-click", {
      tariff: 300,
      currency: "USD",
      nextPaymentDate: "2025-02-20",
      autobilling: false,
    });
    await putAutoreportsRecord(
      kv,
      "proj-manual-click",
      createAutoreportRecord({ enabled: true, time: "15:00", mode: "today", sendToChat: false, sendToAdmin: true }),
    );

    const emptyConversions: MetaSummaryMetrics = {
      spend: 25,
      impressions: 1500,
      clicks: 120,
      leads: 0,
      messages: 0,
      purchases: 0,
      addToCart: 0,
      calls: 0,
      registrations: 0,
      engagement: 0,
      leadsToday: 0,
      leadsTotal: 80,
      cpa: null,
      spendToday: 25,
      cpaToday: null,
    };

    const now = new Date("2025-01-01T10:02:00.000Z");
    const reportDate = shiftDateByDays(now, -1);
    const timezone = "Asia/Tashkent";
    for (const periodKey of ["today", "yesterday", "week", "month"]) {
      const entry = createScopedSummaryEntry(
        "proj-manual-click",
        periodKey,
        timezone,
        reportDate,
        { periodKey, metrics: emptyConversions as MetaSummaryPayload["metrics"], source: {} },
        3600,
      );
      await saveMetaCache(kv, entry);
    }

    const campaignsEntry = createScopedCampaignEntry(
      "proj-manual-click",
      "today",
      timezone,
      reportDate,
      {
        data: [
          {
            campaign_id: "cmp-manual-click",
            campaign_name: "Traffic Manual",
            objective: "LINK_CLICKS",
            spend: "25",
            impressions: "1500",
            clicks: "120",
            actions: [],
          },
        ],
      },
      3600,
    );
    await saveMetaCache(kv, campaignsEntry);
    const telegram = stubTelegramFetch();
    try {
      await runAutoReports(kv, "TEST_TOKEN", now);
    } finally {
      telegram.restore();
    }

    assert.equal(telegram.calls.length, 1);
    const messageText = String(telegram.calls[0].body.text ?? "");
    assert.match(messageText, /Цель: Клики/);
  },
);

test(
  "runAutoReports sends findings only to admin recipients",
  { concurrency: false },
  async () => {
    const kvNamespace = new MemoryKVNamespace();
    const kv = new KvClient(kvNamespace);
    await putProject(kv, createProject({
      id: "proj-auto-both",
      name: "Auto Reports Both",
      adsAccountId: "act_3",
      ownerTelegramId: 12345,
    }));
    await putProjectRecord(kv, {
      id: "proj-auto-both",
      name: "Auto Reports Both",
      ownerId: 12345,
      adAccountId: "act_3",
      chatId: -100500,
      portalUrl: "https://th-reports.buyclientuz.workers.dev/p/proj-auto-both",
      settings: { currency: "USD", timezone: "Asia/Tashkent", kpi: { mode: "auto", type: "LEAD", label: "Лиды" } },
    });
    await putBillingRecord(kv, "proj-auto-both", {
      tariff: 500,
      currency: "USD",
      nextPaymentDate: "2025-01-31",
      autobilling: true,
    });
    await putAutoreportsRecord(
      kv,
      "proj-auto-both",
      createAutoreportRecord({ enabled: true, time: "13:15", mode: "today", sendToChat: true, sendToAdmin: true }),
    );

    const now = new Date("2025-01-01T08:16:00.000Z");
    const reportDate = shiftDateByDays(now, -1);
    const timezone = "Asia/Tashkent";
    const summaryEntry = createScopedSummaryEntry(
      "proj-auto-both",
      "today",
      timezone,
      reportDate,
      {
        periodKey: "today",
        metrics: {
          spend: 40,
          impressions: 2000,
          clicks: 160,
          leads: 8,
          messages: 1,
          purchases: 0,
          addToCart: 0,
          calls: 0,
          registrations: 0,
          engagement: 0,
          leadsToday: 8,
          leadsTotal: 250,
          cpa: 5,
          spendToday: 40,
          cpaToday: 5,
        },
        source: {},
      },
      3600,
    );
    await saveMetaCache(kv, summaryEntry);
    for (const periodKey of ["yesterday", "week", "month"]) {
      const entry = createScopedSummaryEntry(
        "proj-auto-both",
        periodKey,
        timezone,
        reportDate,
        {
          periodKey,
          metrics: {
            spend: 30,
            impressions: 1500,
            clicks: 120,
            leads: 6,
            messages: 1,
            purchases: 0,
            addToCart: 0,
            calls: 0,
            registrations: 0,
            engagement: 0,
            leadsToday: 6,
            leadsTotal: 200,
            cpa: 5,
            spendToday: 30,
            cpaToday: 5,
          },
          source: {},
        },
        3600,
      );
      await saveMetaCache(kv, entry);
    }
    const campaignsEntry = createScopedCampaignEntry(
      "proj-auto-both",
      "today",
      timezone,
      reportDate,
      {
        data: [
          {
            campaign_id: "cmp-1",
            campaign_name: "Leads",
            objective: "LEAD_GENERATION",
            spend: "40",
            impressions: "2000",
            clicks: "160",
            actions: [{ action_type: "lead", value: "8" }],
          },
        ],
      },
      3600,
    );
    await saveMetaCache(kv, campaignsEntry);

    const telegram = stubTelegramFetch();
    try {
      await runAutoReports(kv, "TEST_TOKEN", now);
    } finally {
      telegram.restore();
    }
    assert.equal(telegram.calls.length, 2);
    const chatMessage = telegram.calls.find((call) => call.body.chat_id === -100500);
    assert.ok(chatMessage, "expected chat delivery");
    assert.ok(!String(chatMessage?.body.text ?? "").includes("Вывод:"));
    const adminMessage = telegram.calls.find((call) => call.body.chat_id === 12345);
    assert.ok(adminMessage, "expected admin delivery");
    assert.ok(String(adminMessage?.body.text ?? "").includes("Вывод:"));
  },
);

test(
  "runAutoReports honours project timezone offsets",
  { concurrency: false },
  async () => {
    const kvNamespace = new MemoryKVNamespace();
    const kv = new KvClient(kvNamespace);
    await putProject(kv, createProject({
      id: "proj-auto-ny",
      name: "Auto Reports NY",
      adsAccountId: "act_2",
      ownerTelegramId: 8800,
    }));
    await putProjectRecord(kv, {
      id: "proj-auto-ny",
      name: "Auto Reports NY",
      ownerId: 8800,
      adAccountId: "act_2",
      chatId: null,
      portalUrl: "https://th-reports.buyclientuz.workers.dev/p/proj-auto-ny",
      settings: { currency: "USD", timezone: "America/New_York", kpi: { mode: "auto", type: "LEAD", label: "Лиды" } },
    });
    await putBillingRecord(kv, "proj-auto-ny", {
      tariff: 1000,
      currency: "USD",
      nextPaymentDate: "2025-02-01",
      autobilling: false,
    });
    await putAutoreportsRecord(
      kv,
      "proj-auto-ny",
      createAutoreportRecord({ enabled: true, time: "09:30", mode: "today", sendToChat: false, sendToAdmin: true }),
    );

    const now = new Date("2025-01-01T14:31:00.000Z");
    const reportDate = shiftDateByDays(now, -1);
    const timezone = "America/New_York";
    for (const periodKey of ["today", "yesterday", "week", "month"]) {
      const entry = createScopedSummaryEntry(
        "proj-auto-ny",
        periodKey,
        timezone,
        reportDate,
        {
          periodKey,
          metrics: {
            spend: 30,
            impressions: 1000,
            clicks: 200,
            leads: 6,
            messages: 3,
            purchases: 0,
            addToCart: 0,
            calls: 0,
            registrations: 0,
            engagement: 0,
            leadsToday: 6,
            leadsTotal: 400,
            cpa: 5,
            spendToday: 30,
            cpaToday: 5,
          },
          source: {},
        },
        3600,
      );
      await saveMetaCache(kv, entry);
    }

    const campaignsEntry = createScopedCampaignEntry(
      "proj-auto-ny",
      "today",
      timezone,
      reportDate,
      {
        data: [
          {
            campaign_id: "cmp-ny",
            campaign_name: "NYC",
            spend: "30",
            impressions: "900",
            clicks: "120",
            actions: [
              { action_type: "lead", value: "6" },
              { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "3" },
            ],
          },
        ],
      },
      3600,
    );
    await saveMetaCache(kv, campaignsEntry);
    const telegram = stubTelegramFetch();

    try {
      await runAutoReports(kv, "TEST_TOKEN", now);
    } finally {
      telegram.restore();
    }

    assert.equal(telegram.calls.length, 1);
    assert.ok(String(telegram.calls[0].body.text ?? "").includes("📊 Отчёт"));
  },
);

test(
  "runAutoReports dispatches payment alert when Meta blocks billing",
  { concurrency: false },
  async () => {
    const kvNamespace = new MemoryKVNamespace();
    const kv = new KvClient(kvNamespace);
    const project = createProject({
      id: "proj-payment-alert",
      name: "Payment Alerts",
      adsAccountId: "act_payment",
      ownerTelegramId: 600500,
    });
    await putProject(kv, project);
    await putProjectRecord(kv, {
      id: project.id,
      name: project.name,
      ownerId: project.ownerTelegramId,
      adAccountId: project.adsAccountId,
      chatId: -100500123,
      portalUrl: "https://th-reports.buyclientuz.workers.dev/p/proj-payment-alert",
      settings: { currency: "USD", timezone: "Asia/Tashkent", kpi: { mode: "auto", type: "LEAD", label: "Лиды" } },
    });
    await putBillingRecord(kv, project.id, {
      tariff: 500,
      currency: "USD",
      nextPaymentDate: "2025-01-31",
      autobilling: true,
    });
    await putAutoreportsRecord(
      kv,
      project.id,
      createAutoreportRecord({
        enabled: false,
        paymentAlerts: { enabled: true, sendToChat: true, sendToAdmin: true },
      }),
    );

    const settings = await ensureProjectSettings(kv, project.id);
    await upsertProjectSettings(kv, { ...settings, meta: { facebookUserId: "fb_payment" } });
    const metaToken = createMetaToken({ facebookUserId: "fb_payment", accessToken: "META_TOKEN" });
    await upsertMetaToken(kv, metaToken);

    const telegramCalls: TelegramCall[] = [];
    const metaRequests: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("graph.facebook.com")) {
        metaRequests.push(url);
        return new Response(
          JSON.stringify({ id: project.adsAccountId, name: "Birllash", account_status: 3 }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      telegramCalls.push({ url, body });
      return new Response(JSON.stringify({ ok: true, result: { message_id: telegramCalls.length } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    try {
      await runAutoReports(kv, "TEST_TOKEN", new Date("2025-01-01T05:00:00.000Z"));
      assert.equal(metaRequests.length, 1);
      assert.equal(telegramCalls.length, 2);
      const texts = telegramCalls.map((call) => String(call.body.text ?? ""));
      assert.ok(texts.every((text) => /Meta остановила показ рекламы/.test(text)));
      assert.ok(texts.every((text) => /Birllash/.test(text)));
      const chatDelivery = telegramCalls.find((call) => call.body.chat_id === -100500123);
      assert.ok(chatDelivery, "expected chat alert delivery");
      const adminDelivery = telegramCalls.find((call) => call.body.chat_id === project.ownerTelegramId);
      assert.ok(adminDelivery, "expected admin alert delivery");
      const record = await getAutoreportsRecord(kv, project.id);
      assert.ok(record);
      assert.equal(record.paymentAlerts.lastAccountStatus, 3);
      assert.ok(record.paymentAlerts.lastAlertAt);

      await runAutoReports(kv, "TEST_TOKEN", new Date("2025-01-01T06:00:00.000Z"));
      assert.equal(telegramCalls.length, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);


test(
  "runMaintenance removes stale leads and cache entries",
  { concurrency: false },
  async () => {
    const kvNamespace = new MemoryKVNamespace();
    const r2Bucket = new MemoryR2Bucket();
    const kv = new KvClient(kvNamespace);
    const r2 = new R2Client(r2Bucket);

    await kv.put(KV_KEYS.config("lead-retention-days"), "7");
    await kv.put(KV_KEYS.config("meta-cache-retention-days"), "2");

    const project = createProject({
      id: "proj-maint",
      name: "Maintenance",
      adsAccountId: "act_3",
      ownerTelegramId: 600100,
    });
    await putProject(kv, project);
    await putProjectRecord(kv, {
      id: project.id,
      name: project.name,
      ownerId: project.ownerTelegramId,
      adAccountId: project.adsAccountId,
      chatId: null,
      portalUrl: "https://th-reports.buyclientuz.workers.dev/p/proj-maint",
      settings: { currency: "USD", timezone: "Asia/Tashkent", kpi: { mode: "auto", type: "LEAD", label: "Лиды" } },
    });

    await putLeadDetailRecord(r2, project.id, {
      id: "old",
      name: "Old Lead",
      phone: "+998900000001",
      createdAt: "2024-12-31T10:00:00.000Z",
      source: "facebook",
      campaignName: "BirLash",
      status: "new",
      type: null,
      adset: null,
      ad: null,
      metaRaw: null,
    });
    await putLeadDetailRecord(r2, project.id, {
      id: "recent",
      name: "Recent Lead",
      phone: "+998900000002",
      createdAt: "2025-01-14T10:00:00.000Z",
      source: "facebook",
      campaignName: "BirLash",
      status: "new",
      type: null,
      adset: null,
      ad: null,
      metaRaw: null,
    });
    await putProjectLeadsList(r2, project.id, {
      stats: { total: 2, today: 1 },
      leads: [
        {
          id: "old",
          name: "Old Lead",
          phone: "+998900000001",
          createdAt: "2024-12-31T10:00:00.000Z",
          source: "facebook",
          campaignName: "BirLash",
          status: "new",
          type: null,
        },
        {
          id: "recent",
          name: "Recent Lead",
          phone: "+998900000002",
          createdAt: "2025-01-14T10:00:00.000Z",
          source: "facebook",
          campaignName: "BirLash",
          status: "new",
          type: null,
        },
      ],
      syncedAt: "2025-01-14T10:05:00.000Z",
    });

    const freshEntry = createMetaCacheEntry(
      project.id,
      "summary:today",
      { from: "2025-01-14", to: "2025-01-14" },
      {
        periodKey: "today",
        metrics: {
          spend: 1,
          impressions: 1,
          clicks: 1,
          leads: 1,
          messages: 0,
          purchases: 0,
          addToCart: 0,
          calls: 0,
          registrations: 0,
          engagement: 0,
          leadsToday: 1,
          leadsTotal: 1,
          cpa: 1,
          spendToday: 1,
          cpaToday: 1,
        },
        source: {},
      },
      3600,
    );
    await saveMetaCache(kv, freshEntry);

    const staleEntry = createMetaCacheEntry(
      project.id,
      "summary:week",
      { from: "2025-01-07", to: "2025-01-13" },
      {
        periodKey: "week",
        metrics: {
          spend: 1,
          impressions: 1,
          clicks: 1,
          leads: 1,
          messages: 0,
          purchases: 0,
          addToCart: 0,
          calls: 0,
          registrations: 0,
          engagement: 0,
          leadsToday: 1,
          leadsTotal: 1,
          cpa: 1,
          spendToday: 1,
          cpaToday: 1,
        },
        source: {},
      },
      3600,
    );
    staleEntry.fetchedAt = new Date("2025-01-05T00:00:00.000Z").toISOString();
    await saveMetaCache(kv, staleEntry);

    const now = new Date("2025-01-15T00:00:00.000Z");
    const summary = await runMaintenance(kv, r2, now);

    assert.equal(summary.deletedLeadCount, 2);
    assert.equal(summary.deletedCacheCount, 1);
    assert.equal(summary.scannedProjects, 1);

    const storedOldLead = await r2.getJson(R2_KEYS.projectLead(project.id, "old"));
    assert.equal(storedOldLead, null);
    const storedRecentLead = await r2.getJson(R2_KEYS.projectLead(project.id, "recent"));
    assert.ok(storedRecentLead);

    const staleKey = KV_KEYS.metaCache(project.id, "summary:week");
    const stillThere = await kv.getJson(staleKey);
    assert.equal(stillThere, null);
    const freshKey = KV_KEYS.metaCache(project.id, "summary:today");
    const freshCached = await kv.getJson(freshKey);
    assert.ok(freshCached);
  },
);
