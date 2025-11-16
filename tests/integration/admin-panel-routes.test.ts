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
  ADMIN_KEY: "secret",
  WORKER_URL: "admin.test.workers.dev",
  TELEGRAM_SECRET: "test-secret",
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
  assert.ok(html.includes("admin-login admin-login--visible"));
});

test("admin APIs require x-admin-key and return project summaries", async () => {
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

  const unauthorized = await router.dispatch(new Request("https://example.com/api/admin/projects"), env, execution);
  assert.equal(unauthorized.status, 401);

  const response = await router.dispatch(
    new Request("https://example.com/api/admin/projects", {
      headers: { "x-admin-key": env.ADMIN_KEY! },
    }),
    env,
    execution,
  );
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { ok: boolean; data: { projects: { id: string }[] } };
  assert.ok(payload.ok);
  assert.equal(payload.data.projects[0]?.id, projectRecord.id);
});
