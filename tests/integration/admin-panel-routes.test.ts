import assert from "node:assert/strict";
import test from "node:test";

import { MemoryKVNamespace, MemoryR2Bucket, TestExecutionContext } from "../utils/mocks.ts";
import "../utils/url-pattern.ts";

const { createRouter } = await import("../../src/worker/router.ts");
const { registerAdminRoutes } = await import("../../src/routes/admin.ts");
const { KvClient } = await import("../../src/infra/kv.ts");
const { R2Client } = await import("../../src/infra/r2.ts");
const { putProjectRecord } = await import("../../src/domain/spec/project.ts");

const createEnv = () => ({
  KV: new MemoryKVNamespace(),
  R2: new MemoryR2Bucket(),
  LEADS_KV: new MemoryKVNamespace(),
  WORKER_URL: "admin.test.workers.dev",
  TELEGRAM_SECRET: "test-secret",
  FACEBOOK_API_VERSION: "v18.0",
  FB_LONG_TOKEN: "test-facebook-token",
}) as import("../../src/worker/types.ts").TargetBotEnv;

test("/admin serves the SPA shell", async () => {
  const env = createEnv();
  const router = createRouter();
  registerAdminRoutes(router);
  const execution = new TestExecutionContext();

  const response = await router.dispatch(new Request("https://example.com/admin"), env, execution);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes("TargetBot Admin"));
  assert.ok(!html.includes("data-login-panel"));
  assert.ok(!html.includes("admin-login"));
});

test("admin APIs return project summaries without auth header", async () => {
  const env = createEnv();
  const router = createRouter();
  registerAdminRoutes(router);
  const execution = new TestExecutionContext();

  const kv = new KvClient(env.KV);
  const projectRecord: import("../../src/domain/spec/project.ts").ProjectRecord = {
    id: "proj_admin",
    name: "Admin Test",
    ownerId: 123,
    adAccountId: "act_1",
    chatId: -100,
    portalUrl: "https://example.com/p/proj_admin",
    settings: {
      currency: "USD",
      timezone: "Asia/Tashkent",
      kpi: { mode: "auto", type: "LEAD", label: "Лиды" },
    },
  };
  await putProjectRecord(kv, projectRecord);

  const response = await router.dispatch(new Request("https://example.com/api/admin/projects"), env, execution);
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { ok: boolean; data: { projects: { id: string }[] } };
  assert.ok(payload.ok);
  assert.equal(payload.data.projects[0]?.id, projectRecord.id);
});
