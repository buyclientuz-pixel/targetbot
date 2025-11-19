import assert from "node:assert/strict";
import test from "node:test";

import { MemoryKVNamespace } from "../utils/mocks.ts";

const { KvClient } = await import("../../src/infra/kv.ts");
const { createProject, putProject } = await import("../../src/domain/projects.ts");
const { createDefaultProjectSettings, upsertProjectSettings } = await import(
  "../../src/domain/project-settings.ts"
);
const { createMetaToken, upsertMetaToken } = await import("../../src/domain/meta-tokens.ts");
const { loadProjectCampaigns, resolvePeriodRange } = await import(
  "../../src/services/project-insights.ts"
);

type KvClientInstance = InstanceType<typeof KvClient>;

const createProjectWithSettings = async (kv: KvClientInstance, projectId: string) => {
  const project = createProject({ id: projectId, name: projectId, adsAccountId: "act_123", ownerTelegramId: 1 });
  await putProject(kv, project);
  const settings = createDefaultProjectSettings(projectId);
  settings.meta.facebookUserId = "fb-user";
  await upsertProjectSettings(kv, settings);
  await upsertMetaToken(kv, createMetaToken({ facebookUserId: "fb-user", accessToken: "ACCESS" }));
  return project;
};

test("loadProjectCampaigns requests custom time range when explicit period is provided", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  await createProjectWithSettings(kv, "proj-custom");

  const periodRange = resolvePeriodRange("today", "Asia/Tashkent", { now: new Date("2025-11-18T12:00:00Z") });
  const requests: URL[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    requests.push(url);
    return new Response(JSON.stringify({ data: [], paging: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await loadProjectCampaigns(kv, "proj-custom", "today", { periodRange, forceCacheScope: true });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const insightsRequest = requests.find((request) => request.pathname.includes("/act_123/insights"));
  assert.ok(insightsRequest, "insights request should be issued");
  const timeRange = insightsRequest?.searchParams.get("time_range") ?? "";
  assert.equal(timeRange, JSON.stringify({ since: periodRange.period.from, until: periodRange.period.to }));
});
