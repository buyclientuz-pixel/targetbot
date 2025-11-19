import assert from "node:assert/strict";
import test from "node:test";

import { MemoryKVNamespace, MemoryR2Bucket, TestExecutionContext } from "../utils/mocks.ts";
import "../utils/url-pattern.ts";

const { createRouter } = await import("../../src/worker/router.ts");
const { registerLeadWorkerRoutes } = await import("../../src/routes/lead-sync.ts");

const createEnv = () => ({
  KV: new MemoryKVNamespace(),
  R2: new MemoryR2Bucket(),
  LEADS_KV: new MemoryKVNamespace(),
  FACEBOOK_API_VERSION: "v18.0",
  FB_LONG_TOKEN: "test-facebook-token",
}) as import("../../src/worker/types.ts").TargetBotEnv;

test("sync-leads imports new entries and exposes them over /leads", async () => {
  const env = createEnv();
  const router = createRouter();
  registerLeadWorkerRoutes(router);
  await env.LEADS_KV.put("FORM_IDS:act_123", JSON.stringify(["999999"]));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? new URL(input) : new URL((input as Request).url);
    if (url.hostname === "graph.facebook.com") {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "lead-1",
              created_time: "2025-11-17T13:11:45+0000",
              field_data: [
                { name: "full_name", values: ["Kamilla"] },
                { name: "phone_number", values: ["+998909999999"] },
              ],
            },
            {
              id: "lead-2",
              created_time: "2025-11-18T10:00:00+0000",
              field_data: [
                { name: "full_name", values: ["Aziz"] },
                { name: "phone_number", values: ["+998977777777"] },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return originalFetch(input);
  }) as typeof fetch;

  try {
    const execution = new TestExecutionContext();
    const syncResponse = await router.dispatch(
      new Request("https://example.com/api/projects/act_123/sync-leads"),
      env,
      execution,
    );
    await execution.flush();
    assert.equal(syncResponse.status, 200);
    const syncBody = (await syncResponse.json()) as { success: boolean; imported: number };
    assert.equal(syncBody.success, true);
    assert.equal(syncBody.imported, 2);

    const leadsResponse = await router.dispatch(
      new Request("https://example.com/api/projects/act_123/leads"),
      env,
      new TestExecutionContext(),
    );
    assert.equal(leadsResponse.status, 200);
    const leadsPayload = (await leadsResponse.json()) as {
      project_id: string;
      total: number;
      leads: Array<{ lead_id: string; name: string | null }>;
    };
    assert.equal(leadsPayload.project_id, "act_123");
    assert.equal(leadsPayload.total, 2);
    assert.equal(leadsPayload.leads[0].lead_id, "lead-2");
    assert.equal(leadsPayload.leads[0].name, "Aziz");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sync-leads returns Meta error payloads", async () => {
  const env = createEnv();
  const router = createRouter();
  registerLeadWorkerRoutes(router);
  await env.LEADS_KV.put("FORM_IDS:act_404", JSON.stringify(["broken-form"]));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ error: { message: "Invalid OAuth" } }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const response = await router.dispatch(
      new Request("https://example.com/api/projects/act_404/sync-leads"),
      env,
      new TestExecutionContext(),
    );
    assert.equal(response.status, 401);
    const body = (await response.json()) as { success: boolean; error: unknown };
    assert.equal(body.success, false);
    assert.deepEqual(body.error, { error: { message: "Invalid OAuth" } });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
