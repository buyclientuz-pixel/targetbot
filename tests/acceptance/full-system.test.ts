import assert from "node:assert/strict";
import test from "node:test";

import { MemoryKVNamespace, MemoryR2Bucket, TestExecutionContext } from "../utils/mocks.ts";
import "../utils/url-pattern.ts";

const { createRouter } = await import("../../src/worker/router.ts");
const { registerMetaRoutes } = await import("../../src/routes/meta.ts");
const { registerPortalRoutes } = await import("../../src/routes/portal.ts");
const { registerProjectRoutes } = await import("../../src/routes/projects.ts");
const { registerAuthRoutes } = await import("../../src/routes/auth.ts");
const { KvClient } = await import("../../src/infra/kv.ts");
const { R2Client } = await import("../../src/infra/r2.ts");
const { putProjectsByUser } = await import("../../src/domain/spec/projects-by-user.ts");
const { putProjectRecord } = await import("../../src/domain/spec/project.ts");
const { putBillingRecord } = await import("../../src/domain/spec/billing.ts");
const { putAutoreportsRecord } = await import("../../src/domain/spec/autoreports.ts");
const { putProjectLeadsList } = await import("../../src/domain/spec/project-leads.ts");
const { putMetaCampaignsDocument } = await import("../../src/domain/spec/meta-campaigns.ts");
const { putPaymentsHistoryDocument } = await import("../../src/domain/spec/payments-history.ts");
const { getFbAuthRecord } = await import("../../src/domain/spec/fb-auth.ts");
const { R2_KEYS } = await import("../../src/config/r2.ts");
const { createLead, saveLead, getLead } = await import("../../src/domain/leads.ts");
import type { DispatchProjectMessageOptions } from "../../src/services/project-messaging.ts";

const seedProjectData = async (kv: InstanceType<typeof KvClient>, r2: InstanceType<typeof R2Client>) => {
  await putProjectsByUser(kv, 100, { projects: ["proj_acceptance"] });
  await putProjectRecord(kv, {
    id: "proj_acceptance",
    name: "Acceptance",
    ownerId: 100,
    adAccountId: "act_acceptance",
    chatId: -1003269756488,
    portalUrl: "https://th-reports.buyclientuz.workers.dev/p/proj_acceptance",
    settings: {
      currency: "USD",
      timezone: "Asia/Tashkent",
      kpi: { mode: "auto", type: "LEAD", label: "Лиды" },
    },
  });
  await putBillingRecord(kv, "proj_acceptance", {
    tariff: 500,
    currency: "USD",
    nextPaymentDate: "2025-12-15",
    autobilling: true,
  });
  await putAutoreportsRecord(kv, "proj_acceptance", {
    enabled: true,
    time: "10:00",
    mode: "yesterday_plus_week",
    sendToChat: true,
    sendToAdmin: true,
  });
  await putProjectLeadsList(r2, "proj_acceptance", {
    stats: { total: 5, today: 2 },
    leads: [
      {
        id: "lead_static",
        name: "Existing",
        phone: "+998901112233",
        createdAt: "2025-11-15T09:00:00Z",
        source: "facebook",
        campaignName: "BirLash Лиды",
        status: "new",
        type: null,
      },
    ],
    syncedAt: "2025-11-15T09:05:00Z",
  });
  await saveLead(
    r2,
    createLead({
      id: "lead_static",
      projectId: "proj_acceptance",
      name: "Existing",
      phone: "+998901112233",
      campaign: "BirLash Лиды",
      createdAt: "2025-11-15T09:00:00Z",
    }),
  );
  await putMetaCampaignsDocument(r2, "proj_acceptance", {
    period: { from: "2025-11-15", to: "2025-11-15" },
    summary: { spend: 25, impressions: 2500, clicks: 180, leads: 7, messages: 3 },
    campaigns: [
      {
        id: "cmp_acceptance",
        name: "Acceptance Leads",
        objective: "LEAD_GENERATION",
        kpiType: "LEAD",
        spend: 25,
        impressions: 2500,
        clicks: 180,
        leads: 7,
        messages: 3,
      },
    ],
  });
  await putPaymentsHistoryDocument(r2, "proj_acceptance", {
    payments: [
      {
        id: "pay_acceptance",
        amount: 500,
        currency: "USD",
        periodFrom: "2025-11-15",
        periodTo: "2025-12-15",
        paidAt: "2025-11-15T18:11:00Z",
        status: "paid",
        comment: "Оплата за месяц",
      },
    ],
  });
};

const installFacebookFetchStub = () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const target = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (target.includes("/oauth/access_token") && target.includes("code=")) {
      return new Response(JSON.stringify({ access_token: "SHORT_TOKEN", token_type: "bearer", expires_in: 60 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (target.includes("/oauth/access_token") && target.includes("grant_type=fb_exchange_token")) {
      return new Response(JSON.stringify({ access_token: "LONG_TOKEN", token_type: "bearer", expires_in: 60 * 60 * 2 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (target.includes("/me/adaccounts")) {
      return new Response(
        JSON.stringify({ data: [{ id: "act_acceptance", name: "Acceptance", currency: "usd", account_status: 1 }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (target.includes("/me?") && target.includes("fields=id")) {
      return new Response(JSON.stringify({ id: "fb_acceptance", name: "Acceptance Owner" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (target.includes("/insights")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              campaign_id: "cmp_acceptance",
              campaign_name: "Acceptance Campaign",
              objective: "LEAD_GENERATION",
              spend: "25",
              impressions: "1000",
              clicks: "120",
              actions: [
                { action_type: "lead", value: "2" },
                { action_type: "onsite_conversion.lead_grouped", value: "1" },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (target.includes("/campaigns")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "cmp_acceptance",
              name: "Acceptance Campaign",
              status: "ACTIVE",
              effective_status: "ACTIVE",
              daily_budget: "0",
              budget_remaining: "0",
              lifetime_budget: "0",
              updated_time: new Date().toISOString(),
              configured_status: "ACTIVE",
            },
          ],
          paging: {},
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (target.includes("api.telegram.org")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected fetch request: ${target}`);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
};

const dispatchRequest = async (
  router: ReturnType<typeof createRouter>,
  request: Request,
  env: import("../../src/worker/types.ts").TargetBotEnv,
) => {
  const execution = new TestExecutionContext();
  const response = await router.dispatch(request, env, execution);
  await execution.flush();
  return response;
};

test("full system acceptance scenario", async () => {
  const kvNamespace = new MemoryKVNamespace();
  const r2Bucket = new MemoryR2Bucket();
  const leadsNamespace = new MemoryKVNamespace();
  const env: import("../../src/worker/types.ts").TargetBotEnv = {
    KV: kvNamespace,
    R2: r2Bucket,
    LEADS_KV: leadsNamespace,
    TELEGRAM_BOT_TOKEN: "test-token",
    FB_APP_ID: "fb-app",
    FB_APP_SECRET: "fb-secret",
    WORKER_URL: "https://th-reports.buyclientuz.workers.dev",
    META_WEBHOOK_VERIFY_TOKEN: "VERIFY_TOKEN",
    FACEBOOK_API_VERSION: "v18.0",
    FB_LONG_TOKEN: "test-facebook-token",
  };

  const projectMessages: DispatchProjectMessageOptions[] = [];
  const router = createRouter();
  registerMetaRoutes(router, {
    dispatchProjectMessage: async (options) => {
      projectMessages.push(options);
      return { delivered: { chat: true, admin: false } };
    },
  });
  registerProjectRoutes(router);
  registerPortalRoutes(router);
  registerAuthRoutes(router);

  const kv = new KvClient(kvNamespace);
  const r2 = new R2Client(r2Bucket);
  await seedProjectData(kv, r2);

  const oauthStartResponse = await dispatchRequest(
    router,
    new Request("https://example.com/api/meta/oauth/start?tid=100"),
    env,
  );
  assert.equal(oauthStartResponse.status, 302);
  const location = oauthStartResponse.headers.get("Location");
  assert.ok(location?.includes("state=100"));
  assert.ok(location?.includes("facebook.com"));

  const restoreFetch = installFacebookFetchStub();
  try {
    const callbackResponse = await dispatchRequest(
      router,
      new Request("https://example.com/auth/facebook/callback?code=abc&state=100"),
      env,
    );
    assert.equal(callbackResponse.status, 200);

    const fbRecord = await getFbAuthRecord(kv, 100);
    assert.ok(fbRecord);
    assert.equal(fbRecord?.adAccounts[0]?.id, "act_acceptance");
    assert.equal(fbRecord?.accessToken, "LONG_TOKEN");

    const webhookPayload = {
      object: "page",
      entry: [
        {
        id: "page_1",
        changes: [
          {
            field: "leadgen",
            value: {
              leadgen_id: "lead_acceptance",
              project_id: "proj_acceptance",
              created_time: 1731600000,
              campaign_name: "Acceptance Leads",
              ad_name: "Creative",
              field_data: [
                { name: "Full Name", values: ["Sharofat Ona"] },
                { name: "phone_number", values: ["+998902867999"] },
              ],
            },
          },
        ],
      },
    ],
  };
    const webhookResponse = await dispatchRequest(
      router,
      new Request("https://example.com/api/meta/webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(webhookPayload),
      }),
      env,
    );
    assert.equal(webhookResponse.status, 200);
    const storedLead = await r2.getJson(R2_KEYS.projectLead("proj_acceptance", "lead_acceptance"));
    assert.ok(storedLead);
    const parsedLead = await getLead(r2, "proj_acceptance", "lead_acceptance");
    assert.equal(parsedLead?.projectId, "proj_acceptance");
    assert.ok(projectMessages.length >= 1);
    assert.match(projectMessages[0]?.text ?? "", /Лид ожидает ответа/);

    const summaryResponse = await dispatchRequest(
      router,
      new Request("https://example.com/api/projects/proj_acceptance/summary?period=today"),
      env,
    );
    const summaryPayload = (await summaryResponse.json()) as { ok: boolean; data: { metrics: { leadsToday: number } } };
    assert.ok(summaryPayload.ok);
    assert.equal(summaryPayload.data.metrics.leadsToday, 0);

    const leadsResponse = await dispatchRequest(
      router,
      new Request("https://example.com/api/projects/proj_acceptance/leads/max"),
      env,
    );
    const leadsPayload = (await leadsResponse.json()) as { ok: boolean; data: { leads: Array<{ id: string }> } };
    assert.ok(leadsPayload.ok);
    assert.equal(leadsPayload.data.leads[0]?.id, "lead_static");

    const campaignsResponse = await dispatchRequest(
      router,
      new Request("https://example.com/api/projects/proj_acceptance/campaigns?period=today"),
      env,
    );
    const campaignsPayload = (await campaignsResponse.json()) as {
      ok: boolean;
      data: { summary: { spend: number }; campaigns: Array<{ id: string }> };
    };
    assert.ok(campaignsPayload.ok);
    assert.equal(campaignsPayload.data.summary.spend, 25);
    assert.equal(campaignsPayload.data.campaigns[0]?.id, "cmp_acceptance");

    const paymentsResponse = await dispatchRequest(
      router,
      new Request("https://example.com/api/projects/proj_acceptance/payments"),
      env,
    );
    const paymentsPayload = (await paymentsResponse.json()) as {
      ok: boolean;
      data: { payments: Array<{ id: string }>; billing: { nextPaymentDate: string | null } };
    };
    assert.ok(paymentsPayload.ok);
    assert.equal(paymentsPayload.data.payments[0]?.id, "pay_acceptance");
    assert.equal(paymentsPayload.data.billing.nextPaymentDate, "2025-12-15");
  } finally {
    restoreFetch();
  }
});
