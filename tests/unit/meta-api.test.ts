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

test("fetchMetaLeads returns account-level leads without enumerating forms", async () => {
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
    if (url.pathname.includes("/act_account/leads")) {
      return new Response(JSON.stringify({ data: [{ id: "lead-account", created_time: "2025-11-17T00:00:00Z" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.includes("/leadgen_forms")) {
      return new Response(JSON.stringify({ error: { message: "should not be called" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const leads = await fetchMetaLeads({ accountId: "act_account", accessToken: "token" });
    assert.equal(leads.length, 1);
    assert.ok(requests.some((request) => request.pathname.includes("/act_account/leads")));
    assert.ok(!requests.some((request) => request.pathname.includes("leadgen_forms")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchMetaLeads falls back to page leadgen forms when ad account edge is unavailable", async () => {
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
    if (url.pathname.includes("/act_page/leads")) {
      return new Response(
        JSON.stringify({ error: { message: "(#100) Tried accessing nonexisting field (leads) on node type (AdAccount)" } }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
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
    assert.ok(requests.some((request) => request.pathname.includes("/me/accounts")));
    const leadRequest = requests.find((request) => request.pathname.includes("/form-page-1/leads"));
    assert.ok(leadRequest);
    assert.equal(leadRequest?.searchParams.get("access_token"), "page-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchMetaLeads ignores missing account leads edge errors when no forms are available", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url);
    if (url.pathname.includes("/act_missing/leads")) {
      return new Response(
        JSON.stringify({ error: { message: "(#100) Tried accessing nonexisting field (leads) on node type (AdAccount)" } }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    if (url.pathname.includes("/act_missing/campaigns")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/me/accounts")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const leads = await fetchMetaLeads({ accountId: "act_missing", accessToken: "token" });
    assert.equal(leads.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchMetaLeads returns empty list when both leadgen sources have no forms", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url);
    if (url.pathname.includes("/act_empty/leads")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
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

test("fetchMetaLeads enumerates managed pages when campaigns are missing page ids", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url);
    if (url.pathname.includes("/act_pages_only/leads")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/act_pages_only/campaigns")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/me/accounts")) {
      return new Response(
        JSON.stringify({ data: [{ id: "pg-1", access_token: "pg-token" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.pathname.includes("/pg-1/leadgen_forms")) {
      return new Response(JSON.stringify({ data: [{ id: "form-1" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.includes("/form-1/leads")) {
      return new Response(JSON.stringify({ data: [{ id: "lead-2", field_data: [] }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.includes("/act_pages_only/leadgen_forms")) {
      return new Response(JSON.stringify({ error: { message: "unsupported" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const leads = await fetchMetaLeads({ accountId: "act_pages_only", accessToken: "acct-token" });
    assert.equal(leads.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchMetaLeads still downloads leads when managed pages request fails", async () => {
  const originalFetch = globalThis.fetch;
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url);
    if (url.pathname.includes("/act_perm/leads")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/act_perm/campaigns")) {
      return new Response(
        JSON.stringify({ data: [{ id: "cmp1", promoted_object: { page_id: "pg-5" } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.pathname.includes("/me/accounts")) {
      return new Response(JSON.stringify({ error: { message: "missing permission" } }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.includes("/pg-5/leadgen_forms")) {
      return new Response(JSON.stringify({ data: [{ id: "form-perm" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.includes("/form-perm/leads")) {
      return new Response(JSON.stringify({ data: [{ id: "lead-3", field_data: [] }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.includes("/act_perm/leadgen_forms")) {
      return new Response(JSON.stringify({ error: { message: "unsupported" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const leads = await fetchMetaLeads({ accountId: "act_perm", accessToken: "acct-token" });
    assert.equal(leads.length, 1);
    assert.ok(warnings.some((message) => message.includes("Failed to enumerate managed pages")));
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});
