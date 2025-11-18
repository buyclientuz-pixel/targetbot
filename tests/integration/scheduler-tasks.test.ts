import assert from "node:assert/strict";
import test from "node:test";
import { MemoryKVNamespace, MemoryR2Bucket } from "../utils/mocks.ts";

const { KvClient } = await import("../../src/infra/kv.ts");
const { R2Client } = await import("../../src/infra/r2.ts");
const { createProject, putProject } = await import("../../src/domain/projects.ts");
const { putProjectRecord } = await import("../../src/domain/spec/project.ts");
const { putBillingRecord } = await import("../../src/domain/spec/billing.ts");
const { putAutoreportsRecord } = await import("../../src/domain/spec/autoreports.ts");
const { putProjectLeadsList, putLeadDetailRecord } = await import(
  "../../src/domain/spec/project-leads.ts"
);
const { createMetaCacheEntry, saveMetaCache } = await import("../../src/domain/meta-cache.ts");
const { KV_KEYS } = await import("../../src/config/kv.ts");
const { runAutoReports } = await import("../../src/services/auto-reports.ts");
const { runMaintenance } = await import("../../src/services/maintenance.ts");
const { R2_KEYS } = await import("../../src/config/r2.ts");

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
    await putAutoreportsRecord(kv, "proj-auto", {
      enabled: true,
      time: "12:00",
      mode: "today",
      sendTo: "admin",
    });

    const summaryEntry = createMetaCacheEntry("proj-auto", "summary:today", { from: "2025-01-01", to: "2025-01-01" }, {
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
    }, 3600);
    await saveMetaCache(kv, summaryEntry);
    for (const periodKey of ["yesterday", "week", "month"]) {
      const entry = createMetaCacheEntry(
        "proj-auto",
        `summary:${periodKey}`,
        { from: "2024-12-25", to: "2024-12-31" },
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

    const campaignsEntry = createMetaCacheEntry(
      "proj-auto",
      "campaigns:today",
      { from: "2025-01-01", to: "2025-01-01" },
      {
        data: [
          {
            campaign_id: "cmp-auto",
            campaign_name: "Авто",
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

    const now = new Date("2025-01-01T12:02:00.000Z");
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
    assert.deepEqual(telegram.calls[0].body.reply_markup, {
      inline_keyboard: [[{ text: "Открыть портал", url: "https://th-reports.buyclientuz.workers.dev/p/proj-auto" }]],
    });
    assert.equal(telegram.calls[0].body.chat_id, 777000);

    const state = await kv.getJson<{ slots?: Record<string, string | null> }>(KV_KEYS.reportState("proj-auto"));
    assert.ok(state?.slots?.["12:00"]);
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
