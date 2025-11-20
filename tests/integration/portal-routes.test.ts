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
const { createLead, saveLead } = await import("../../src/domain/leads.ts");
const { putMetaCampaignsDocument } = await import("../../src/domain/spec/meta-campaigns.ts");
const { putPaymentsHistoryDocument } = await import("../../src/domain/spec/payments-history.ts");

const createEnv = () => ({
  KV: new MemoryKVNamespace(),
  R2: new MemoryR2Bucket(),
  LEADS_KV: new MemoryKVNamespace(),
  FACEBOOK_API_VERSION: "v18.0",
  FB_LONG_TOKEN: "test-facebook-token",
}) as import("../../src/worker/types.ts").TargetBotEnv;

test("portal routes serve HTML shell plus summary, leads, campaigns, and payments", async () => {
  const RealDate = Date;
  const fixedNow = new RealDate("2025-11-15T10:00:00.000Z");
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

  try {
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
    const leadsSyncedAt = new Date().toISOString();
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
      syncedAt: leadsSyncedAt,
    });
    await saveLead(
      r2,
      createLead({
        id: "lead-1",
        projectId: projectRecord.id,
        name: "Sharofat Ona",
        phone: "+998902867999",
        campaign: "Campaign A",
        createdAt: recentLeadDate,
      }),
    );

    await putMetaCampaignsDocument(r2, projectRecord.id, {
      period: { from: "2025-11-14", to: "2025-11-15" },
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
    assert.equal(summaryPayload.data.metrics.cpaToday, null);
    assert.equal(summaryPayload.data.period.from, "2025-11-14");
    assert.equal(summaryPayload.data.period.to, "2025-11-15");

    const leadsResponse = await router.dispatch(
      new Request("https://example.com/api/projects/birlash/leads/yesterday"),
      env,
      execution,
    );
    assert.equal(leadsResponse.status, 200);
    const leadsPayload = (await leadsResponse.clone().json()) as {
      ok: boolean;
      data: {
        leads: Array<{ id: string; status: string; contact: string }>;
        stats: { total: number; today: number };
        periodStats: { total: number; today: number };
        periodKey: string | null;
      };
    };
    assert.ok(leadsPayload.ok);
    assert.equal(leadsPayload.data.leads.length, 1);
    assert.equal(leadsPayload.data.leads[0]?.id, "lead-1");
    assert.equal(leadsPayload.data.leads[0]?.status, "new");
    assert.equal(leadsPayload.data.leads[0]?.contact, "+998902867999");
    assert.equal(leadsPayload.data.stats.total, 170);
    assert.equal(leadsPayload.data.periodStats.total, 1);
    assert.equal(leadsPayload.data.periodStats.today, 0);

    const customFrom = new Date(new Date(recentLeadDate).getTime() - 60 * 60 * 1000).toISOString();
    const customTo = new Date(new Date(recentLeadDate).getTime() + 60 * 60 * 1000).toISOString();
    const leadsRangeResponse = await router.dispatch(
      new Request(
        `https://example.com/api/projects/birlash/leads?from=${encodeURIComponent(customFrom)}&to=${encodeURIComponent(customTo)}`,
      ),
      env,
      execution,
    );
    assert.equal(leadsRangeResponse.status, 200);
    const leadsRangePayload = (await leadsRangeResponse.clone().json()) as typeof leadsPayload;
    assert.ok(leadsRangePayload.ok);
    assert.equal(leadsRangePayload.data.periodKey, "custom");
    assert.equal(leadsRangePayload.data.leads.length, 1);
    assert.equal(leadsRangePayload.data.periodStats.total, 1);

    const campaignsResponse = await router.dispatch(
      new Request("https://example.com/api/projects/birlash/campaigns?period=yesterday"),
      env,
      execution,
    );
    assert.equal(campaignsResponse.status, 200);
    const campaignsPayload = (await campaignsResponse.clone().json()) as {
      ok: boolean;
      data: { campaigns: Array<{ id: string; spend: number; leads: number }>; period?: { from: string; to: string } };
    };
    assert.ok(campaignsPayload.ok);
    assert.equal(campaignsPayload.data.campaigns.length, 1);
    const campaign = campaignsPayload.data.campaigns[0];
    assert.equal(campaign?.id, "cmp-1");
    assert.equal(campaign?.spend, 16.15);
    assert.equal(campaign?.leads, 5);
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Date = RealDate;
  }
});
