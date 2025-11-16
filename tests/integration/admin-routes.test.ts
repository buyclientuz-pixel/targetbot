import assert from "node:assert/strict";
import test from "node:test";
import { MemoryKVNamespace, MemoryR2Bucket, TestExecutionContext } from "../utils/mocks.ts";
import "../utils/url-pattern.ts";

const { createRouter } = await import("../../src/worker/router.ts");
const { registerAdminRoutes } = await import("../../src/routes/admin.ts");
const { KvClient } = await import("../../src/infra/kv.ts");
const { getProject } = await import("../../src/domain/projects.ts");
const { ensureProjectSettings } = await import("../../src/domain/project-settings.ts");
const { getMetaToken } = await import("../../src/domain/meta-tokens.ts");

const ADMIN_KEY = "secret";

const createEnv = () => ({
  KV: new MemoryKVNamespace(),
  R2: new MemoryR2Bucket(),
  ADMIN_KEY,
}) as import("../../src/worker/types.ts").TargetBotEnv;

const createAdminRequest = (url: string, init?: RequestInit): Request =>
  new Request(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "x-admin-key": ADMIN_KEY,
    },
  });

const readData = async <T>(response: Response): Promise<T> => {
  const payload = (await response.clone().json()) as { data: T };
  return payload.data;
};

test("admin routes allow managing projects, settings, and Meta tokens", async () => {
  const env = createEnv();
  const router = createRouter();
  registerAdminRoutes(router);

  const execution = new TestExecutionContext();

  const createResponse = await router.dispatch(
    createAdminRequest("https://example.com/api/admin/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "birlash",
        name: "Birlash",
        adsAccountId: "act_123",
        ownerTelegramId: 123456789,
      }),
    }),
    env,
    execution,
  );

  assert.equal(createResponse.status, 201);
  const createdBody = await readData<{ project: { id: string; name: string; ownerTelegramId: number }; settings: { projectId: string } }>(
    createResponse,
  );
  assert.equal(createdBody.project.id, "birlash");
  assert.equal(createdBody.settings.projectId, "birlash");

  const listResponse = await router.dispatch(createAdminRequest("https://example.com/api/admin/projects"), env, execution);
  const listBody = await readData<{ projects: Array<{ id: string }> }>(listResponse);
  assert.equal(listBody.projects.length, 1);
  assert.equal(listBody.projects[0].id, "birlash");

  const updateResponse = await router.dispatch(
    createAdminRequest("https://example.com/api/admin/projects/birlash", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Birlash Updated" }),
    }),
    env,
    execution,
  );
  assert.equal(updateResponse.status, 200);
  const kv = new KvClient(env.KV);
  const storedProject = await getProject(kv, "birlash");
  assert.equal(storedProject.name, "Birlash Updated");

  const settingsResponse = await router.dispatch(
    createAdminRequest("https://example.com/api/admin/projects/birlash/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        billing: { tariff: 500, currency: "USD", nextPaymentDate: "2025-12-15" },
        alerts: { route: "ADMIN" },
      }),
    }),
    env,
    execution,
  );
  assert.equal(settingsResponse.status, 200);
  const updatedSettings = await ensureProjectSettings(kv, "birlash");
  assert.equal(updatedSettings.billing.tariff, 500);
  assert.equal(updatedSettings.alerts.route, "ADMIN");
  assert.equal(updatedSettings.billing.nextPaymentDate, "2025-12-15");

  const metaResponse = await router.dispatch(
    createAdminRequest("https://example.com/api/admin/meta-tokens/123", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessToken: "access", refreshToken: "refresh" }),
    }),
    env,
    execution,
  );
  assert.equal(metaResponse.status, 200);
  const token = await getMetaToken(kv, "123");
  assert.equal(token.accessToken, "access");
  assert.equal(token.refreshToken, "refresh");

  await execution.flush();
});
