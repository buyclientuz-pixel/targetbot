import assert from "node:assert/strict";
import test from "node:test";
import { MemoryKVNamespace, MemoryR2Bucket, TestExecutionContext } from "../utils/mocks.ts";
import "../utils/url-pattern.ts";

const { createRouter } = await import("../../src/worker/router.ts");
const { registerPortalRoutes } = await import("../../src/routes/portal.ts");
const { KvClient } = await import("../../src/infra/kv.ts");
const { R2Client } = await import("../../src/infra/r2.ts");
const { putProjectRecord } = await import("../../src/domain/spec/project.ts");
const { putBillingRecord } = await import("../../src/domain/spec/billing.ts");
const { putProjectLeadsList } = await import("../../src/domain/spec/project-leads.ts");
const { putMetaCampaignsDocument } = await import("../../src/domain/spec/meta-campaigns.ts");
const { putPaymentsHistoryDocument } = await import("../../src/domain/spec/payments-history.ts");
const { createMetaCacheEntry, saveMetaCache } = await import("../../src/domain/meta-cache.ts");

const createEnv = () => ({
  KV: new MemoryKVNamespace(),
  R2: new MemoryR2Bucket(),
}) as import("../../src/worker/types.ts").TargetBotEnv;

test("portal routes serve HTML shell plus summary, leads, campaigns, and payments", async () => {
  const env = createEnv();
  const router = createRouter();
  registerPortalRoutes(router);
  const execution = new TestExecutionContext();

  const kv = new KvClient(env.KV);
  const r2 = new R2Client(env.R2);

  const projectRecord: import("../../src/domain/spec/project.ts").ProjectRecord = {
    id: "birlash",
    name: "Birlash",
    ownerId: 123456789,
    adAccountId: "act_813372877848888",
    chatId: -1003269756488,
    portalUrl: "https://th-reports.buyclientuz.workers.dev/p/birlash",
    settings: {
      currency: "USD",
      timezone: "Asia/Tashkent",
      kpi: { mode: "auto", type: "LEAD", label: "Лиды" },
    },
  };
  await putProjectRecord(kv, projectRecord);
  await putBillingRecord(kv, projectRecord.id, {
    tariff: 500,
    currency: "USD",
    nextPaymentDate: "2025-12-15",
    autobilling: true,
  });

  const recentLeadDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await putProjectLeadsList(r2, projectRecord.id, {
    stats: { total: 170, today: 2 },
    leads: [
      {
        id: "lead-1",
        name: "Sharofat Ona",
        phone: "+998902867999",
        createdAt: recentLeadDate,
        source: "facebook",
        campaignName: "Campaign A",
        status: "new",
        type: "lead",
      },
    ],
    syncedAt: recentLeadDate,
  });

  await putMetaCampaignsDocument(r2, projectRecord.id, {
    period: { from: "2025-11-14", to: "2025-11-14" },
    summary: { spend: 16.15, impressions: 1200, clicks: 140, leads: 6, messages: 2 },
    campaigns: [
      {
        id: "cmp-1",
        name: "Campaign A",
        objective: "LEAD_GENERATION",
        kpiType: "LEAD",
        spend: 16.15,
        impressions: 1000,
        clicks: 120,
        leads: 5,
        messages: 0,
      },
    ],
    periodKey: "yesterday",
  });

  await putPaymentsHistoryDocument(r2, projectRecord.id, {
    payments: [
      {
        id: "pay-1",
        amount: 500,
        currency: "USD",
        periodFrom: "2025-11-15",
        periodTo: "2025-12-15",
        paidAt: "2025-11-15T17:11:00.000Z",
        status: "paid",
        comment: "Оплата от клиента",
      },
    ],
  });

  const summaryResponse = await router.dispatch(
    new Request("https://example.com/api/projects/birlash/summary?period=yesterday"),
    env,
    execution,
  );
  assert.equal(summaryResponse.status, 200);
  const summaryPayload = (await summaryResponse.clone().json()) as {
    ok: boolean;
    data: { metrics: { spend: number; leads: number; cpaToday: number | null }; period: { from: string; to: string } };
  };
  assert.ok(summaryPayload.ok);
  assert.equal(summaryPayload.data.metrics.spend, 16.15);
  assert.equal(summaryPayload.data.metrics.leads, 6);
  assert.equal(summaryPayload.data.metrics.cpaToday, 16.15 / 2);
  assert.equal(summaryPayload.data.period.from, summaryPayload.data.period.to);

  const leadsResponse = await router.dispatch(
    new Request("https://example.com/api/projects/birlash/leads?period=yesterday"),
    env,
    execution,
  );
  assert.equal(leadsResponse.status, 200);
  const leadsPayload = (await leadsResponse.clone().json()) as {
    ok: boolean;
    data: { leads: Array<{ id: string; status: string }>; stats: { total: number; today: number } };
  };
  assert.ok(leadsPayload.ok);
  assert.equal(leadsPayload.data.leads.length, 1);
  assert.equal(leadsPayload.data.leads[0]?.id, "lead-1");
  assert.equal(leadsPayload.data.leads[0]?.status, "new");
  assert.equal(leadsPayload.data.stats.total, 170);

  const campaignsResponse = await router.dispatch(
    new Request("https://example.com/api/projects/birlash/campaigns?period=yesterday"),
    env,
    execution,
  );
  assert.equal(campaignsResponse.status, 200);
  const campaignsPayload = (await campaignsResponse.clone().json()) as {
    ok: boolean;
    data: { campaigns: Array<{ id: string; spend: number; leads: number }> };
  };
  assert.ok(campaignsPayload.ok);
  assert.equal(campaignsPayload.data.campaigns.length, 1);
  const campaign = campaignsPayload.data.campaigns[0];
  assert.equal(campaign?.id, "cmp-1");
  assert.equal(campaign?.spend, 16.15);
  assert.equal(campaign?.leads, 5);

  const paymentsResponse = await router.dispatch(
    new Request("https://example.com/api/projects/birlash/payments"),
    env,
    execution,
  );
  assert.equal(paymentsResponse.status, 200);
  const paymentsPayload = (await paymentsResponse.clone().json()) as {
    ok: boolean;
    data: { payments: Array<{ id: string; status: string }>; billing: { tariff: number } };
  };
  assert.ok(paymentsPayload.ok);
  assert.equal(paymentsPayload.data.payments.length, 1);
  assert.equal(paymentsPayload.data.payments[0]?.id, "pay-1");
  assert.equal(paymentsPayload.data.payments[0]?.status, "paid");
  assert.equal(paymentsPayload.data.billing.tariff, 500);

  const portalResponse = await router.dispatch(
    new Request("https://example.com/portal/birlash"),
    env,
    execution,
  );
  assert.equal(portalResponse.status, 200);
  assert.equal(portalResponse.headers.get("content-type"), "text/html; charset=utf-8");
  const portalHtml = await portalResponse.text();
  assert.ok(portalHtml.includes("Ключевые показатели"));

  const shortPortalResponse = await router.dispatch(
    new Request("https://example.com/p/birlash"),
    env,
    execution,
  );
  assert.equal(shortPortalResponse.status, 200);
  assert.equal(shortPortalResponse.headers.get("content-type"), "text/html; charset=utf-8");

  await execution.flush();
});

test("portal summary and campaigns prefer Meta cache entries when available", async () => {
  const env = createEnv();
  const router = createRouter();
  registerPortalRoutes(router);
  const execution = new TestExecutionContext();

  const kv = new KvClient(env.KV);
  const r2 = new R2Client(env.R2);

  const projectRecord: import("../../src/domain/spec/project.ts").ProjectRecord = {
    id: "cache_proj",
    name: "Cache Project",
    ownerId: 1,
    adAccountId: "act_cache",
    chatId: null,
    portalUrl: "https://example.com/p/cache_proj",
    settings: {
      currency: "USD",
      timezone: "Asia/Tashkent",
      kpi: { mode: "auto", type: "LEAD", label: "Лиды" },
    },
  };
  await putProjectRecord(kv, projectRecord);
  const cachedLeadDate = new Date().toISOString();
  await putProjectLeadsList(r2, projectRecord.id, {
    stats: { total: 50, today: 2 },
    leads: [],
    syncedAt: cachedLeadDate,
  });
  await putMetaCampaignsDocument(r2, projectRecord.id, {
    period: { from: "2025-01-01", to: "2025-01-01" },
    summary: { spend: 5, impressions: 100, clicks: 10, leads: 1, messages: 0 },
    campaigns: [],
    periodKey: "today",
  });

  const summaryEntry = createMetaCacheEntry(
    projectRecord.id,
    "summary:today",
    { from: "2025-11-16", to: "2025-11-16" },
    {
      periodKey: "today",
      metrics: {
        spend: 42,
        impressions: 900,
        clicks: 120,
        leads: 6,
        messages: 0,
        purchases: 0,
        addToCart: 0,
        calls: 0,
        registrations: 0,
        engagement: 0,
        leadsToday: 6,
        leadsTotal: 200,
        cpa: 7,
        spendToday: 42,
        cpaToday: 7,
      },
      source: { cached: true },
    },
    60,
  );
  await saveMetaCache(kv, summaryEntry);

  const campaignsEntry = createMetaCacheEntry(
    projectRecord.id,
    "campaigns:today",
    { from: "2025-11-16", to: "2025-11-16" },
    {
      data: [
        {
          campaign_id: "cmp-live",
          campaign_name: "Live",
          spend: "21",
          impressions: "500",
          clicks: "50",
          actions: [{ action_type: "lead", value: "3" }],
        },
      ],
    },
    60,
  );
  await saveMetaCache(kv, campaignsEntry);

  const statusEntry = createMetaCacheEntry(
    projectRecord.id,
    "campaign-status",
    { from: "2025-11-16", to: "2025-11-16" },
    {
      campaigns: [
        {
          id: "cmp-live",
          name: "Live",
          status: "PAUSED",
          effectiveStatus: "PAUSED",
          configuredStatus: "PAUSED",
          objective: "LEAD_GENERATION",
          dailyBudget: 10000,
          budgetRemaining: 5000,
          updatedTime: "2025-11-16T00:00:00.000Z",
        },
      ],
    },
    300,
  );
  await saveMetaCache(kv, statusEntry);

  const summaryResponse = await router.dispatch(
    new Request("https://example.com/api/projects/cache_proj/summary?period=today"),
    env,
    execution,
  );
  const summaryPayload = (await summaryResponse.json()) as {
    ok: boolean;
    data: { metrics: { spend: number; leads: number; cpaToday: number | null } };
  };
  assert.ok(summaryPayload.ok);
  assert.equal(summaryPayload.data.metrics.spend, 42);
  assert.equal(summaryPayload.data.metrics.leads, 6);
  assert.equal(summaryPayload.data.metrics.cpaToday, 7);

  const campaignsResponse = await router.dispatch(
    new Request("https://example.com/api/projects/cache_proj/campaigns?period=today"),
    env,
    execution,
  );
  const campaignsPayload = (await campaignsResponse.json()) as {
    ok: boolean;
    data: { campaigns: Array<{ id: string; status?: string | null; objective?: string; spend: number; leads: number }>; };
  };
  assert.ok(campaignsPayload.ok);
  const liveCampaign = campaignsPayload.data.campaigns.find((campaign) => campaign.id === "cmp-live");
  assert.ok(liveCampaign);
  assert.equal(liveCampaign?.status, "PAUSED");
  assert.equal(liveCampaign?.objective, "LEAD_GENERATION");
  assert.equal(liveCampaign?.spend, 21);
  assert.equal(liveCampaign?.leads, 3);

  await execution.flush();
});
