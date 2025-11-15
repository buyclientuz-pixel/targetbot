import assert from "node:assert/strict";
import test from "node:test";
import { MemoryKVNamespace, MemoryR2Bucket } from "../utils/mocks.ts";

const { KvClient } = await import("../../src/infra/kv.ts");
const { R2Client } = await import("../../src/infra/r2.ts");
const { createProject, putProject } = await import("../../src/domain/projects.ts");
const { createDefaultProjectSettings, upsertProjectSettings } = await import(
  "../../src/domain/project-settings.ts"
);
const { createMetaCacheEntry, saveMetaCache } = await import("../../src/domain/meta-cache.ts");
const { KV_KEYS } = await import("../../src/config/kv.ts");
const { createLead, saveLead } = await import("../../src/domain/leads.ts");
const { runAutoReports } = await import("../../src/services/auto-reports.ts");
const { runAlerts } = await import("../../src/services/alerts.ts");
const { runMaintenance } = await import("../../src/services/maintenance.ts");
const { R2_KEYS } = await import("../../src/config/r2.ts");
const { createMetaToken, upsertMetaToken } = await import("../../src/domain/meta-tokens.ts");

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
    const project = createProject({
      id: "proj-auto",
      name: "Auto Reports",
      adsAccountId: "act_1",
      ownerTelegramId: 777000,
    });
    await putProject(kv, project);

    const settings = createDefaultProjectSettings(project.id);
    settings.alerts.route = "ADMIN";
    settings.reports.autoReportsEnabled = true;
    settings.reports.timeSlots = ["12:00"];
    settings.reports.mode = "today";
    settings.meta.facebookUserId = "fb_auto";
    await upsertProjectSettings(kv, settings);

    const summaryEntry = createMetaCacheEntry(project.id, "summary:today", { from: "2025-01-01", to: "2025-01-01" }, {
      periodKey: "today",
      metrics: {
        spend: 20,
        impressions: 1500,
        clicks: 120,
        leads: 4,
        leadsToday: 4,
        leadsTotal: 200,
        cpa: 5,
        spendToday: 20,
        cpaToday: 5,
      },
      source: {},
    }, 3600);
    await saveMetaCache(kv, summaryEntry);

    const now = new Date("2025-01-01T12:02:00.000Z");
    const telegram = stubTelegramFetch();

    try {
      await runAutoReports(kv, "TEST_TOKEN", now);
    } finally {
      telegram.restore();
    }

    assert.equal(telegram.calls.length, 1);
    assert.ok(telegram.calls[0].url.includes("sendMessage"));
    assert.match(String(telegram.calls[0].body.text ?? ""), /Автоотчёт/);
    assert.equal(telegram.calls[0].body.chat_id, project.ownerTelegramId);

    const state = await kv.getJson<{ slots?: Record<string, string | null> }>(KV_KEYS.reportState(project.id));
    assert.ok(state?.slots?.["12:00"]);
  },
);

test(
  "runAlerts dispatches billing, meta, budget and pause alerts",
  { concurrency: false },
  async () => {
    const kvNamespace = new MemoryKVNamespace();
    const kv = new KvClient(kvNamespace);
    const project = createProject({
      id: "proj-alerts",
      name: "Alerts Demo",
      adsAccountId: "act_2",
      ownerTelegramId: 555001,
    });
    await putProject(kv, project);

    const settings = createDefaultProjectSettings(project.id);
    settings.alerts.route = "ADMIN";
    settings.billing.tariff = 500;
    settings.billing.currency = "USD";
    settings.billing.nextPaymentDate = "2025-01-12";
    settings.kpi.targetCpl = 5;
    settings.kpi.targetLeadsPerDay = 10;
    settings.meta.facebookUserId = "fb_1";
    await upsertProjectSettings(kv, settings);

    const metaToken = createMetaToken({ facebookUserId: "fb_1", accessToken: "access" });
    metaToken.expiresAt = "2025-01-13T00:00:00.000Z";
    await upsertMetaToken(kv, metaToken);

    const campaignEntry = createMetaCacheEntry(
      project.id,
      "campaign-status",
      { from: "2025-01-11", to: "2025-01-11" },
      {
        campaigns: [
          {
            id: "cmp-low",
            name: "Low Budget",
            status: "ACTIVE",
            effectiveStatus: "ACTIVE",
            dailyBudget: 20,
            budgetRemaining: 100,
            updatedTime: "2025-01-11T08:00:00.000Z",
          },
          {
            id: "cmp-pause",
            name: "Paused Long",
            status: "PAUSED",
            effectiveStatus: "PAUSED",
            dailyBudget: 60,
            budgetRemaining: 80,
            updatedTime: "2025-01-11T03:00:00.000Z",
          },
        ],
      },
      3600,
    );
    await saveMetaCache(kv, campaignEntry);

    const now = new Date("2025-01-11T09:00:00.000Z");
    const telegram = stubTelegramFetch();

    try {
      await runAlerts(kv, "TEST_TOKEN", now);
    } finally {
      telegram.restore();
    }

    assert.equal(telegram.calls.length, 4);
    const texts = telegram.calls.map((call) => String(call.body.text ?? ""));
    assert.ok(texts.some((text) => text.includes("Скоро оплата")));
    assert.ok(texts.some((text) => text.includes("Meta токен скоро истечёт")));
    assert.ok(texts.some((text) => text.includes("Бюджет кампаний ниже KPI")));
    assert.ok(texts.some((text) => text.includes("Кампании приостановлены")));

    const billingState = await kv.getJson<{ lastEventKey?: string }>(KV_KEYS.alertState(project.id, "billing"));
    assert.ok(billingState?.lastEventKey?.startsWith("due:"));
    const metaState = await kv.getJson<{ lastEventKey?: string }>(KV_KEYS.alertState(project.id, "meta-api"));
    assert.ok(metaState?.lastEventKey?.startsWith("expiring:"));
    const budgetState = await kv.getJson<{ lastEventKey?: string }>(KV_KEYS.alertState(project.id, "budget"));
    assert.ok(budgetState?.lastEventKey?.includes("cmp-low"));
    const pauseState = await kv.getJson<{ lastEventKey?: string }>(KV_KEYS.alertState(project.id, "pause"));
    assert.ok(pauseState?.lastEventKey?.includes("cmp-pause"));
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

    const oldLead = createLead({
      id: "old", 
      projectId: project.id,
      name: "Old Lead",
      phone: null,
      createdAt: "2024-12-31T10:00:00.000Z",
    });
    const recentLead = createLead({
      id: "recent",
      projectId: project.id,
      name: "Recent Lead",
      phone: null,
      createdAt: "2025-01-14T10:00:00.000Z",
    });
    await saveLead(r2, oldLead);
    await saveLead(r2, recentLead);

    const freshEntry = createMetaCacheEntry(
      project.id,
      "summary:today",
      { from: "2025-01-14", to: "2025-01-14" },
      { periodKey: "today", metrics: { spend: 1, impressions: 1, clicks: 1, leads: 1, leadsToday: 1, leadsTotal: 1, cpa: 1, spendToday: 1, cpaToday: 1 }, source: {} },
      3600,
    );
    await saveMetaCache(kv, freshEntry);

    const staleEntry = createMetaCacheEntry(
      project.id,
      "summary:week",
      { from: "2025-01-07", to: "2025-01-13" },
      { periodKey: "week", metrics: { spend: 1, impressions: 1, clicks: 1, leads: 1, leadsToday: 1, leadsTotal: 1, cpa: 1, spendToday: 1, cpaToday: 1 }, source: {} },
      3600,
    );
    staleEntry.fetchedAt = new Date("2025-01-05T00:00:00.000Z").toISOString();
    await saveMetaCache(kv, staleEntry);

    const now = new Date("2025-01-15T00:00:00.000Z");
    const summary = await runMaintenance(kv, r2, now);

    assert.equal(summary.deletedLeadCount, 1);
    assert.equal(summary.deletedCacheCount, 1);
    assert.equal(summary.scannedProjects, 1);

    const storedOldLead = await r2.getJson(R2_KEYS.lead(project.id, oldLead.id));
    assert.equal(storedOldLead, null);
    const storedRecentLead = await r2.getJson(R2_KEYS.lead(project.id, recentLead.id));
    assert.ok(storedRecentLead);

    const staleKey = KV_KEYS.metaCache(project.id, "summary:week");
    const stillThere = await kv.getJson(staleKey);
    assert.equal(stillThere, null);
    const freshKey = KV_KEYS.metaCache(project.id, "summary:today");
    const freshCached = await kv.getJson(freshKey);
    assert.ok(freshCached);
  },
);
