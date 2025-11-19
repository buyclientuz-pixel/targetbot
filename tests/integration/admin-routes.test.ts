import assert from "node:assert/strict";
import test from "node:test";
import { MemoryKVNamespace, MemoryR2Bucket, TestExecutionContext } from "../utils/mocks.ts";
import "../utils/url-pattern.ts";

const { createRouter } = await import("../../src/worker/router.ts");
const { registerAdminRoutes } = await import("../../src/routes/admin.ts");
const { KvClient } = await import("../../src/infra/kv.ts");
const { getProject } = await import("../../src/domain/projects.ts");
const { ensureProjectSettings, createDefaultProjectSettings, upsertProjectSettings } = await import(
  "../../src/domain/project-settings.ts",
);
const { getMetaToken } = await import("../../src/domain/meta-tokens.ts");
const { putProjectRecord } = await import("../../src/domain/spec/project.ts");

const createEnv = () => ({
  KV: new MemoryKVNamespace(),
  R2: new MemoryR2Bucket(),
  LEADS_KV: new MemoryKVNamespace(),
  FACEBOOK_API_VERSION: "v18.0",
  FB_LONG_TOKEN: "test-facebook-token",
}) as import("../../src/worker/types.ts").TargetBotEnv;

const readData = async <T>(response: Response): Promise<T> => {
  const payload = (await response.clone().json()) as { data: T };
  return payload.data;
};

test("admin routes allow managing projects, settings, and Meta tokens", async () => {
  const env = createEnv();
  const router = createRouter();
  registerAdminRoutes(router);

  const execution = new TestExecutionContext();

  const pingResponse = await router.dispatch(new Request("https://example.com/api/admin/ping"), env, execution);
  assert.equal(pingResponse.status, 200);
  const pingPayload = (await pingResponse.json()) as { ok: boolean; data: { status: string } };
  assert.ok(pingPayload.ok);
  assert.equal(pingPayload.data.status, "ok");

  const createResponse = await router.dispatch(
    new Request("https://example.com/api/admin/projects", {
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

  const listResponse = await router.dispatch(new Request("https://example.com/api/admin/projects"), env, execution);
  const listBody = await readData<{ projects: Array<{ id: string }> }>(listResponse);
  assert.equal(listBody.projects.length, 1);
  assert.equal(listBody.projects[0].id, "birlash");

  const updateResponse = await router.dispatch(
    new Request("https://example.com/api/admin/projects/birlash", {
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
    new Request("https://example.com/api/admin/projects/birlash/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        billing: { tariff: 500, currency: "USD", nextPaymentDate: "2025-12-15" },
        leads: { sendToChat: false, sendToAdmin: true },
      }),
    }),
    env,
    execution,
  );
  assert.equal(settingsResponse.status, 200);
  const updatedSettings = await ensureProjectSettings(kv, "birlash");
  assert.equal(updatedSettings.billing.tariff, 500);
  assert.equal(updatedSettings.billing.nextPaymentDate, "2025-12-15");
  assert.equal(updatedSettings.leads.sendToChat, false);
  assert.equal(updatedSettings.leads.sendToAdmin, true);

  const metaResponse = await router.dispatch(
    new Request("https://example.com/api/admin/meta-tokens/123", {
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

  const deleteResponse = await router.dispatch(
    new Request("https://example.com/api/admin/projects/birlash", {
      method: "DELETE",
    }),
    env,
    execution,
  );
  assert.equal(deleteResponse.status, 200);

  const afterDelete = await router.dispatch(new Request("https://example.com/api/admin/projects"), env, execution);
  const emptyList = await readData<{ projects: Array<{ id: string }> }>(afterDelete);
  assert.equal(emptyList.projects.length, 0);

  await execution.flush();
});

test("admin portal routes manage lifecycle", async () => {
  const env = createEnv();
  const router = createRouter();
  registerAdminRoutes(router);
  const execution = new TestExecutionContext();
  const kv = new KvClient(env.KV);

  const projectRecord: import("../../src/domain/spec/project.ts").ProjectRecord = {
    id: "portal_case",
    name: "Portal Case",
    ownerId: 42,
    adAccountId: "act_portal",
    chatId: null,
    portalUrl: "",
    settings: {
      currency: "USD",
      timezone: "Asia/Tashkent",
      kpi: { mode: "auto", type: "LEAD", label: "Лиды" },
    },
  };
  await putProjectRecord(kv, projectRecord);
  const defaults = createDefaultProjectSettings(projectRecord.id);
  await upsertProjectSettings(kv, { ...defaults, portalEnabled: false });

  const createResponse = await router.dispatch(
    new Request(`https://example.com/api/admin/projects/${projectRecord.id}/portal/create`, { method: "POST" }),
    env,
    execution,
  );
  assert.equal(createResponse.status, 200);
  const createdPortal = await readData<{ portal: { portalUrl: string; enabled: boolean } }>(createResponse);
  assert.ok(createdPortal.portal.portalUrl.endsWith(`/p/${projectRecord.id}`));
  assert.equal(createdPortal.portal.enabled, true);

  const toggleResponse = await router.dispatch(
    new Request(`https://example.com/api/admin/projects/${projectRecord.id}/portal/toggle`, { method: "POST" }),
    env,
    execution,
  );
  assert.equal(toggleResponse.status, 200);
  const toggled = await readData<{ portal: { enabled: boolean } }>(toggleResponse);
  assert.equal(toggled.portal.enabled, false);

  const syncResponse = await router.dispatch(
    new Request(`https://example.com/api/admin/projects/${projectRecord.id}/portal/sync`, { method: "POST" }),
    env,
    execution,
  );
  assert.equal(syncResponse.status, 422);

  const deleteResponse = await router.dispatch(
    new Request(`https://example.com/api/admin/projects/${projectRecord.id}/portal`, { method: "DELETE" }),
    env,
    execution,
  );
  assert.equal(deleteResponse.status, 200);
  const deleted = await readData<{ portal: { portalUrl: string; enabled: boolean } }>(deleteResponse);
  assert.equal(deleted.portal.portalUrl, "");
  assert.equal(deleted.portal.enabled, false);

  await execution.flush();
});

test("admin payment routes allow editing, deletion, and manual import", async () => {
  const env = createEnv();
  const router = createRouter();
  registerAdminRoutes(router);
  const execution = new TestExecutionContext();

  const projectId = "billing_case";
  await router.dispatch(
    new Request("https://example.com/api/admin/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: projectId,
        name: "Billing Case",
        adsAccountId: "act_case",
        ownerTelegramId: 777,
      }),
    }),
    env,
    execution,
  );

  const addResponse = await router.dispatch(
    new Request(`https://example.com/api/admin/projects/${projectId}/payments/add`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        amount: 500,
        currency: "USD",
        periodFrom: "2025-11-01",
        periodTo: "2025-11-30",
        status: "planned",
      }),
    }),
    env,
    execution,
  );
  assert.equal(addResponse.status, 200);
  const addBody = await readData<{ payments: { payments: Array<{ id: string }> } }>(addResponse);
  assert.ok(addBody.payments.payments.length === 1);
  const paymentId = addBody.payments.payments[0]!.id;

  const updateResponse = await router.dispatch(
    new Request(`https://example.com/api/admin/projects/${projectId}/payments/${paymentId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        amount: 550,
        currency: "USD",
        periodFrom: "2025-12-01",
        periodTo: "2025-12-15",
        status: "overdue",
      }),
    }),
    env,
    execution,
  );
  assert.equal(updateResponse.status, 200);
  const updatedDoc = await readData<{ payments: { payments: Array<{ amount: number; status: string; periodTo: string }> } }>(
    updateResponse,
  );
  assert.equal(updatedDoc.payments.payments[0]!.amount, 550);
  assert.equal(updatedDoc.payments.payments[0]!.status, "overdue");

  const deleteResponse = await router.dispatch(
    new Request(`https://example.com/api/admin/projects/${projectId}/payments/${paymentId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmDate: "2025-12-15" }),
    }),
    env,
    execution,
  );
  assert.equal(deleteResponse.status, 200);
  const afterDelete = await readData<{ payments: { payments: unknown[] } }>(deleteResponse);
  assert.equal(afterDelete.payments.payments.length, 0);

  const manualResponse = await router.dispatch(
    new Request(`https://example.com/api/admin/projects/${projectId}/payments/manual`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entries: "600 01.01.2026 Просрочено\n550 2025-10-01 Оплачено",
      }),
    }),
    env,
    execution,
  );
  assert.equal(manualResponse.status, 200);
  const manualDoc = await readData<{ payments: { payments: Array<{ status: string; periodTo: string }> } }>(manualResponse);
  assert.equal(manualDoc.payments.payments.length, 2);
  assert.equal(manualDoc.payments.payments[0]!.status, "overdue");
  assert.equal(manualDoc.payments.payments[1]!.status, "paid");
  assert.equal(manualDoc.payments.payments[0]!.periodTo, "2026-01-01");

  await execution.flush();
});
