import assert from "node:assert/strict";
import test from "node:test";
import { MemoryKVNamespace } from "../utils/mocks.ts";

const { KvClient } = await import("../../src/infra/kv.ts");
const { putProjectRecord } = await import("../../src/domain/spec/project.ts");
const { fetchLiveProjectLeads } = await import("../../src/services/project-live-leads.ts");

test("fetchLiveProjectLeads uses override token when provided", async () => {
  const kvNamespace = new MemoryKVNamespace();
  const kv = new KvClient(kvNamespace);
  await putProjectRecord(kv, {
    id: "birlash",
    name: "Birlash",
    ownerId: 123456,
    adAccountId: "act_123",
    chatId: null,
    portalUrl: "https://example.com/p/birlash",
    settings: {
      currency: "USD",
      timezone: "Asia/Tashkent",
      kpi: { mode: "auto", type: "LEAD", label: "Лиды" },
    },
  });

  const originalFetch = globalThis.fetch;
  const requests: URL[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const target =
      typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.toString()
            : String(input);
    const url = new URL(target);
    requests.push(url);
    if (url.pathname.includes("/act_123/leads")) {
      return new Response(
        JSON.stringify({ data: [{ id: "lead-override", created_time: "2025-11-18T10:00:00+0000", field_data: [] }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const leads = await fetchLiveProjectLeads(kv, "birlash", {
      accessTokenOverride: "env-long-token",
    });
    assert.equal(leads.length, 1);
    assert.equal(leads[0]?.id, "lead-override");
    assert.ok(requests.some((request) => request.searchParams.get("access_token") === "env-long-token"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
