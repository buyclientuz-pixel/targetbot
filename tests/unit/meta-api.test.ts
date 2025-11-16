import assert from "node:assert/strict";
import test from "node:test";

const { resolveDatePreset, fetchMetaLeads } = await import("../../src/services/meta-api.ts");

test("resolveDatePreset clamps max period to Meta's 37-month limit", () => {
  const realNow = Date.now;
  const fixedNow = new Date("2025-11-16T00:00:00.000Z");
  Date.now = () => fixedNow.getTime();
  try {
    const period = resolveDatePreset("max");
    assert.equal(period.preset, "time_range");
    assert.equal(period.to, "2025-11-16");
    assert.equal(period.from, "2022-10-17");
  } finally {
    Date.now = realNow;
  }
});

test("fetchMetaLeads falls back to page leadgen forms when ad account edge is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
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
    requests.push(url.pathname);
    if (url.pathname.includes("/act_page/leadgen_forms")) {
      return new Response(JSON.stringify({ error: { message: "unsupported" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.includes("/act_page/campaigns")) {
      return new Response(
        JSON.stringify({ data: [{ id: "cmp1", promoted_object: { page_id: "12345" } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.pathname.includes("/me/accounts")) {
      return new Response(
        JSON.stringify({ data: [{ id: "12345", access_token: "page-token" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.pathname.includes("/12345/leadgen_forms")) {
      return new Response(JSON.stringify({ data: [{ id: "form-page-1" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.includes("/form-page-1/leads")) {
      return new Response(
        JSON.stringify({ data: [{ id: "lead-1", created_time: "2025-11-17T00:00:00Z", field_data: [] }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const leads = await fetchMetaLeads({ accountId: "act_page", accessToken: "user-token" });
    assert.equal(leads.length, 1);
    assert.ok(requests.some((path) => path.includes("/me/accounts")));
    assert.ok(requests.some((path) => path.includes("/12345/leadgen_forms")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchMetaLeads returns empty list when both leadgen sources have no forms", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url);
    if (url.pathname.includes("/act_empty/leadgen_forms")) {
      return new Response(JSON.stringify({ error: { message: "edge unavailable" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.includes("/act_empty/campaigns")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/me/accounts")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/leadgen_forms")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const leads = await fetchMetaLeads({ accountId: "act_empty", accessToken: "token" });
    assert.equal(leads.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
