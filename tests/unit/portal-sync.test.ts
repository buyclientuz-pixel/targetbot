import assert from "node:assert/strict";
import test from "node:test";
import { MemoryKVNamespace, MemoryR2Bucket } from "../utils/mocks.ts";

const { KvClient } = await import("../../src/infra/kv.ts");
const { R2Client } = await import("../../src/infra/r2.ts");
const { PORTAL_AUTO_PERIOD_PLAN, syncPortalMetrics } = await import("../../src/services/portal-sync.ts");
const { putProjectRecord } = await import("../../src/domain/spec/project.ts");
const { createProject, putProject } = await import("../../src/domain/projects.ts");
const { createDefaultProjectSettings, upsertProjectSettings } = await import("../../src/domain/project-settings.ts");
const { createMetaToken, upsertMetaToken } = await import("../../src/domain/meta-tokens.ts");
const { getPortalSyncState } = await import("../../src/domain/portal-sync.ts");
const { getMetaCampaignsDocument } = await import("../../src/domain/spec/meta-campaigns.ts");

const installGraphStub = () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? new URL(input) : new URL(input instanceof Request ? input.url : input.toString());
    if (url.hostname === "graph.facebook.com" && url.pathname.includes("/insights")) {
      const level = url.searchParams.get("level");
      if (level === "campaign") {
        return new Response(
          JSON.stringify({
            data: [
              {
                campaign_id: "cmp-1",
                campaign_name: "Lead",
                objective: "LEAD_GENERATION",
                spend: "15",
                impressions: "500",
                clicks: "40",
                actions: [{ action_type: "lead", value: "3" }],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              spend: "20",
              impressions: "1000",
              clicks: "80",
              actions: [{ action_type: "lead", value: "4" }],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.hostname === "graph.facebook.com" && url.pathname.includes("/leads")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "stub-lead",
              created_time: new Date().toISOString(),
              campaign_name: "Lead",
              field_data: [{ name: "full_name", values: [{ value: "Stub" }] }],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return originalFetch(input);
  }) as typeof fetch;
  return { restore: () => (globalThis.fetch = originalFetch) };
};

test("syncPortalMetrics fetches insights and records state", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await putProjectRecord(kv, {
    id: "proj-sync",
    name: "Sync",
    ownerId: 1,
    adAccountId: "act_sync",
    chatId: null,
    portalUrl: "https://example.com/p/proj-sync",
    settings: { currency: "USD", timezone: "Asia/Tashkent", kpi: { mode: "auto", type: "LEAD", label: "Лиды" } },
  });
  const project = createProject({ id: "proj-sync", name: "Sync", adsAccountId: "act_sync", ownerTelegramId: 1 });
  await putProject(kv, project);
  const defaults = createDefaultProjectSettings("proj-sync");
  await upsertProjectSettings(kv, { ...defaults, projectId: "proj-sync", portalEnabled: true, meta: { facebookUserId: "fb_sync" } });
  const token = createMetaToken({ facebookUserId: "fb_sync", accessToken: "token" });
  await upsertMetaToken(kv, token);
  const stub = installGraphStub();
  try {
    const result = await syncPortalMetrics(kv, r2, "proj-sync", { periods: ["today"] });
    assert.ok(result.ok);
    assert.equal(result.periods.length, 2);
    assert.equal(result.periods.at(-1)?.periodKey, "leads");
    const doc = await getMetaCampaignsDocument(r2, "proj-sync");
    assert.equal(doc?.periodKey, "today");
    const state = await getPortalSyncState(kv, "proj-sync");
    assert.ok(state.lastSuccessAt);
    assert.deepEqual(state.periodKeys, ["today"]);
  } finally {
    stub.restore();
  }
});

test("syncPortalMetrics syncs the full period plan by default", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  await putProjectRecord(kv, {
    id: "proj-plan",
    name: "Plan",
    ownerId: 1,
    adAccountId: "act_plan",
    chatId: null,
    portalUrl: "https://example.com/p/proj-plan",
    settings: { currency: "USD", timezone: "Asia/Tashkent", kpi: { mode: "auto", type: "LEAD", label: "Лиды" } },
  });
  const project = createProject({ id: "proj-plan", name: "Plan", adsAccountId: "act_plan", ownerTelegramId: 1 });
  await putProject(kv, project);
  const defaults = createDefaultProjectSettings("proj-plan");
  await upsertProjectSettings(kv, {
    ...defaults,
    projectId: "proj-plan",
    portalEnabled: true,
    meta: { facebookUserId: "fb_plan" },
  });
  const token = createMetaToken({ facebookUserId: "fb_plan", accessToken: "token" });
  await upsertMetaToken(kv, token);
  const stub = installGraphStub();
  try {
    const result = await syncPortalMetrics(kv, r2, "proj-plan");
    const expectedPlan = PORTAL_AUTO_PERIOD_PLAN;
    assert.equal(result.periods.length, expectedPlan.length + 1);
    assert.deepEqual(
      result.periods
        .map((entry) => entry.periodKey)
        .sort(),
      [...expectedPlan, "leads"].sort(),
    );
    const state = await getPortalSyncState(kv, "proj-plan");
    assert.deepEqual(state.periodKeys.sort(), expectedPlan.slice().sort());
  } finally {
    stub.restore();
  }
});
