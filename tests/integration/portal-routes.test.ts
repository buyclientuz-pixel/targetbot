import assert from "node:assert/strict";
import test from "node:test";
import { MemoryKVNamespace, MemoryR2Bucket, TestExecutionContext } from "../utils/mocks.ts";

class SimpleURLPattern {
  private readonly segments: string[];

  constructor(init: { pathname: string }) {
    this.segments = init.pathname.split("/").filter(Boolean);
  }

  exec(url: string | URL) {
    const target = typeof url === "string" ? new URL(url) : url;
    const pathSegments = target.pathname.split("/").filter(Boolean);
    if (pathSegments.length !== this.segments.length) {
      return null;
    }
    const groups: Record<string, string> = {};
    for (let index = 0; index < this.segments.length; index += 1) {
      const patternSegment = this.segments[index];
      const actual = pathSegments[index];
      if (patternSegment.startsWith(":")) {
        groups[patternSegment.slice(1)] = actual;
      } else if (patternSegment !== actual) {
        return null;
      }
    }
    return { pathname: { input: target.pathname, groups } };
  }
}

(globalThis as unknown as { URLPattern?: unknown }).URLPattern ||= SimpleURLPattern;

const { createRouter } = await import("../../src/worker/router.ts");
const { registerPortalRoutes } = await import("../../src/routes/portal.ts");
const { KvClient } = await import("../../src/infra/kv.ts");
const { R2Client } = await import("../../src/infra/r2.ts");
const { createProject, putProject } = await import("../../src/domain/projects.ts");
const { createDefaultProjectSettings, upsertProjectSettings } = await import("../../src/domain/project-settings.ts");
const { createLead, saveLead } = await import("../../src/domain/leads.ts");
const { createPayment, savePayment } = await import("../../src/domain/payments.ts");
const { createMetaCacheEntry, saveMetaCache } = await import("../../src/domain/meta-cache.ts");
const { resolvePeriodRange } = await import("../../src/services/project-insights.ts");

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

  const project = createProject({
    id: "birlash",
    name: "Birlash",
    adsAccountId: "act_813372877848888",
    ownerTelegramId: 123456789,
  });
  await putProject(kv, project);
  const settings = createDefaultProjectSettings(project.id);
  settings.meta.facebookUserId = "fb_1";
  await upsertProjectSettings(kv, settings);

  const periodRange = resolvePeriodRange("yesterday");
  const summaryEntry = createMetaCacheEntry(
    project.id,
    "summary:yesterday",
    periodRange.period,
    {
      periodKey: "yesterday",
      metrics: {
        spend: 16.15,
        impressions: 1200,
        clicks: 140,
        leads: 6,
        leadsToday: 2,
        leadsTotal: 170,
        cpa: 2.69,
        spendToday: 4.5,
        cpaToday: 2.25,
      },
      source: { mock: true },
    },
    600,
  );
  await saveMetaCache(kv, summaryEntry);

  const campaignEntry = createMetaCacheEntry(
    project.id,
    "campaigns:yesterday",
    periodRange.period,
    {
      data: [
        {
          campaign_id: "cmp-1",
          campaign_name: "Campaign A",
          spend: "16.15",
          impressions: "1000",
          clicks: "120",
          actions: [
            { action_type: "lead", value: "5" },
            { action_type: "view_content", value: "100" },
          ],
        },
      ],
    },
    600,
  );
  await saveMetaCache(kv, campaignEntry);

  const lead = createLead({
    id: "lead-1",
    projectId: project.id,
    name: "Sharofat Ona",
    phone: "+998902867999",
    campaign: "Campaign A",
    adset: "Женщины",
    ad: "Креатив №3",
    createdAt: "2025-11-14T21:54:26.000Z",
  });
  await saveLead(r2, lead);

  const payment = createPayment({
    projectId: project.id,
    amount: 500,
    currency: "USD",
    periodStart: "2025-11-15",
    periodEnd: "2025-12-15",
    status: "PAID",
    paidAt: "2025-11-15T17:11:00.000Z",
    comment: "Оплата от клиента",
    createdBy: 123456789,
  });
  await savePayment(r2, payment);

  const summaryResponse = await router.dispatch(
    new Request("https://example.com/api/projects/birlash/summary?period=yesterday"),
    env,
    execution,
  );
  assert.equal(summaryResponse.status, 200);
  const summary = (await summaryResponse.clone().json()) as {
    metrics: { spend: number; leads: number; cpaToday: number | null };
    period: { from: string; to: string };
  };
  assert.equal(summary.metrics.spend, 16.15);
  assert.equal(summary.metrics.leads, 6);
  assert.equal(summary.metrics.cpaToday, 2.25);
  assert.equal(summary.period.from, summary.period.to);

  const leadsResponse = await router.dispatch(
    new Request("https://example.com/api/projects/birlash/leads?period=yesterday"),
    env,
    execution,
  );
  assert.equal(leadsResponse.status, 200);
  const leadsBody = (await leadsResponse.clone().json()) as { leads: Array<{ id: string; status: string }> };
  assert.equal(leadsBody.leads.length, 1);
  assert.equal(leadsBody.leads[0]?.id, "lead-1");
  assert.equal(leadsBody.leads[0]?.status, "NEW");

  const campaignsResponse = await router.dispatch(
    new Request("https://example.com/api/projects/birlash/campaigns?period=yesterday"),
    env,
    execution,
  );
  assert.equal(campaignsResponse.status, 200);
  const campaigns = (await campaignsResponse.clone().json()) as { campaigns: Array<{ id: string; cpa: number | null }> };
  assert.equal(campaigns.campaigns.length, 1);
  assert.equal(campaigns.campaigns[0]?.id, "cmp-1");
  const cpa = campaigns.campaigns[0]?.cpa ?? 0;
  assert.ok(Math.abs(cpa - 3.23) < 0.001, `expected CPA ≈ 3.23, received ${cpa}`);

  const paymentsResponse = await router.dispatch(
    new Request("https://example.com/api/projects/birlash/payments"),
    env,
    execution,
  );
  assert.equal(paymentsResponse.status, 200);
  const payments = (await paymentsResponse.clone().json()) as { payments: Array<{ id: string; status: string }> };
  assert.equal(payments.payments.length, 1);
  assert.equal(payments.payments[0]?.id, payment.id);
  assert.equal(payments.payments[0]?.status, "PAID");

  const portalResponse = await router.dispatch(
    new Request("https://example.com/portal/birlash"),
    env,
    execution,
  );
  assert.equal(portalResponse.status, 200);
  assert.equal(portalResponse.headers.get("content-type"), "text/html; charset=utf-8");
  const portalHtml = await portalResponse.text();
  assert.ok(portalHtml.includes("Ключевые показатели"));

  await execution.flush();
});
