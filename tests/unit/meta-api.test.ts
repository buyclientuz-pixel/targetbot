import assert from "node:assert/strict";
import test from "node:test";

const {
  resolveDatePreset,
  fetchMetaLeads,
  summariseMetaInsights,
  countMessagesFromActions,
  fetchMetaAdAccount,
} = await import(
  "../../src/services/meta-api.ts",
);

test("resolveDatePreset clamps all-period window and supports legacy max alias", () => {
  const realNow = Date.now;
  const fixedNow = new Date("2025-11-16T00:00:00.000Z");
  Date.now = () => fixedNow.getTime();
  try {
    const period = resolveDatePreset("all");
    assert.equal(period.preset, "time_range");
    assert.equal(period.to, "2025-11-16");
    assert.equal(period.from, "2022-10-17");
    assert.deepEqual(resolveDatePreset("max"), period);
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

test("fetchMetaLeads normalises raw account id to act_ prefix", async () => {
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
    if (url.pathname.includes("/act_123456/leads")) {
      return new Response(JSON.stringify({ data: [{ id: "lead-account", created_time: "2025-11-17T00:00:00Z" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const leads = await fetchMetaLeads({ accountId: "123456", accessToken: "token" });
    assert.equal(leads.length, 1);
    assert.ok(requests.some((request) => request.pathname.includes("/act_123456/leads")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchMetaAdAccount returns parsed account status", async () => {
  const originalFetch = globalThis.fetch;
  const requests: URL[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    requests.push(url);
    return new Response(
      JSON.stringify({
        id: "act_payment",
        name: "BirLash",
        account_status: "2",
        disable_reason: 3,
        disable_reasons: [3, "11"],
        balance: "100",
        currency: "USD",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const info = await fetchMetaAdAccount({ accountId: "act_payment", accessToken: "token" });
    assert.equal(info.id, "act_payment");
    assert.equal(info.name, "BirLash");
    assert.equal(info.account_status, 2);
    assert.equal(info.disable_reason, 3);
    assert.deepEqual(info.disable_reasons, [3, 11]);
    assert.equal(info.balance, "100");
    assert.equal(info.currency, "USD");
    assert.ok(requests.some((request) => request.pathname.includes("/act_payment")));
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

test("countMessagesFromActions prioritises messaging conversation started metrics", () => {
  const actions = [
    { action_type: "messaging_first_reply", value: "4" },
    { action_type: "messaging_conversation_started", value: "9" },
    { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "7" },
  ];
  assert.equal(countMessagesFromActions(actions), 9);
});

test("countMessagesFromActions falls back to generic message counters", () => {
  const actions = [
    { action_type: "other", value: "2" },
    { action_type: "outbound_message", value: "5" },
  ];
  assert.equal(countMessagesFromActions(actions), 5);
});

test("fetchMetaLeads falls back to lead campaigns when forms are unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const requests: URL[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url);
    requests.push(url);
    if (url.pathname.includes("/act_campaign/leads") && !url.pathname.includes("/cmp_")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/act_campaign/leadgen_forms")) {
      return new Response(JSON.stringify({ error: { message: "edge unavailable" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.includes("/act_campaign/campaigns")) {
      return new Response(
        JSON.stringify({
          data: [
            { id: "cmp_leads", objective: "LEAD_GENERATION", status: "ACTIVE" },
            { id: "cmp_messages", objective: "MESSAGES", status: "ACTIVE" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.pathname.includes("/cmp_leads/leads")) {
      return new Response(
        JSON.stringify({ data: [{ id: "lead_campaign", created_time: "2025-11-17T00:00:00Z" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.pathname.includes("/cmp_messages/leads")) {
      return new Response(JSON.stringify({ error: { message: "should not hit" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.includes("/me/accounts")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const leads = await fetchMetaLeads({ accountId: "act_campaign", accessToken: "token" });
    assert.equal(leads.length, 1);
    assert.ok(requests.some((request) => request.pathname.includes("/cmp_leads/leads")));
    assert.ok(!requests.some((request) => request.pathname.includes("/cmp_messages/leads")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchMetaLeads skips archived or non-lead campaigns in fallback", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url);
    if (url.pathname.includes("/act_skip/leads") && !url.pathname.includes("/cmp")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/act_skip/leadgen_forms")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/act_skip/campaigns")) {
      return new Response(
        JSON.stringify({
          data: [
            { id: "cmp_archived", objective: "LEAD_GENERATION", status: "ARCHIVED" },
            { id: "cmp_messages", objective: "MESSAGES", status: "ACTIVE" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.pathname.includes("/cmp_archived/leads")) {
      return new Response(JSON.stringify({ error: { message: "should not fetch archived" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const leads = await fetchMetaLeads({ accountId: "act_skip", accessToken: "token" });
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

test("fetchMetaLeads continues when individual form requests fail", async () => {
  const originalFetch = globalThis.fetch;
  const requests: URL[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url);
    requests.push(url);
    if (url.pathname.includes("/act_partial/leads") && !url.pathname.includes("/leadgen_forms")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/act_partial/leadgen_forms")) {
      return new Response(
        JSON.stringify({ data: [{ id: "form-bad" }, { id: "form-good" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.pathname.includes("/form-bad/leads")) {
      return new Response(JSON.stringify({ error: { message: "form failed" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.includes("/form-good/leads")) {
      return new Response(
        JSON.stringify({ data: [{ id: "lead-good", created_time: "2025-11-17T00:00:00Z", field_data: [] }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const leads = await fetchMetaLeads({ accountId: "act_partial", accessToken: "token" });
    assert.equal(leads.length, 1);
    assert.ok(requests.some((request) => request.pathname.includes("/form-bad/leads")));
    assert.ok(requests.some((request) => request.pathname.includes("/form-good/leads")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchMetaLeads falls back to ad creative forms when pages don't expose leadgen forms", async () => {
  const originalFetch = globalThis.fetch;
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
    if (url.pathname.includes("/act_ads/leads")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/act_ads/leadgen_forms")) {
      return new Response(JSON.stringify({ error: { message: "edge unavailable" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.includes("/act_ads/campaigns")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/me/accounts")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/act_ads/ads")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              creative: {
                object_story_spec: {
                  link_data: { call_to_action: { value: { leadgen_form_id: "form-ads" } } },
                },
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.pathname.includes("/form-ads/leads")) {
      return new Response(
        JSON.stringify({ data: [{ id: "lead-ads", created_time: "2025-11-17T00:00:00Z", field_data: [] }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const leads = await fetchMetaLeads({ accountId: "act_ads", accessToken: "acct-token" });
    assert.equal(leads.length, 1);
    assert.equal(leads[0]?.id, "lead-ads");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchMetaLeads enriches account forms with page tokens before fetching leads", async () => {
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
    if (url.pathname.includes("/act_page_token/leads") && !url.pathname.includes("/leadgen_forms")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/act_page_token/leadgen_forms")) {
      return new Response(JSON.stringify({ data: [{ id: "form-page-token" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.includes("/act_page_token/campaigns")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/me/accounts")) {
      return new Response(
        JSON.stringify({ data: [{ id: "pg-pt", access_token: "page-token" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.pathname.includes("/pg-pt/leadgen_forms")) {
      return new Response(JSON.stringify({ data: [{ id: "form-page-token" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.includes("/form-page-token/leads")) {
      const token = url.searchParams.get("access_token");
      if (token !== "page-token") {
        return new Response(JSON.stringify({ error: { message: "wrong token" } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ data: [{ id: "lead-page", created_time: "2025-11-20T00:00:00Z", field_data: [] }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const leads = await fetchMetaLeads({ accountId: "act_page_token", accessToken: "acct-token" });
    assert.equal(leads.length, 1);
    assert.ok(requests.some((request) => request.pathname.includes("/pg-pt/leadgen_forms")));
    const leadRequest = requests.find((request) => request.pathname.includes("/form-page-token/leads"));
    assert.ok(leadRequest);
    assert.equal(leadRequest?.searchParams.get("access_token"), "page-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchMetaLeads tolerates rate limit errors from ad creative fallback", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void) => {
    callback();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url);
    if (url.pathname.includes("/act_ratelimit/leads")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/act_ratelimit/leadgen_forms")) {
      return new Response(JSON.stringify({ error: { message: "forms unavailable" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.includes("/act_ratelimit/campaigns")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/me/accounts")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/act_ratelimit/ads")) {
      return new Response(
        JSON.stringify({ error: { message: "User request limit reached", code: 17, error_subcode: 2446079 } }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const leads = await fetchMetaLeads({ accountId: "act_ratelimit", accessToken: "acct-token" });
    assert.equal(leads.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("fetchMetaLeads retries ad creative fallback requests after transient rate limits", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void) => {
    callback();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  let adRequests = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url);
    if (url.pathname.includes("/act_ratelimit_success/leads")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/act_ratelimit_success/leadgen_forms")) {
      return new Response(JSON.stringify({ error: { message: "edge unavailable" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.includes("/act_ratelimit_success/campaigns")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/me/accounts")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/act_ratelimit_success/ads")) {
      adRequests += 1;
      if (adRequests === 1) {
        return new Response(
          JSON.stringify({ error: { message: "User request limit reached", code: 17, error_subcode: 2446079 } }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              creative: {
                object_story_spec: { link_data: { call_to_action: { value: { leadgen_form_id: "form-ads-retry" } } } },
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.pathname.includes("/form-ads-retry/leads")) {
      return new Response(
        JSON.stringify({ data: [{ id: "lead-after-retry", created_time: "2025-11-17T00:00:00Z", field_data: [] }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const leads = await fetchMetaLeads({ accountId: "act_ratelimit_success", accessToken: "acct-token" });
    assert.equal(leads.length, 1);
    assert.equal(leads[0]?.id, "lead-after-retry");
    assert.equal(adRequests, 2);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("fetchMetaLeads reuses cached forms when enumeration fails", async () => {
  const originalFetch = globalThis.fetch;
  const requests: URL[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url);
    requests.push(url);
    if (url.pathname.includes("/act_cache/leads")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/act_cache/leadgen_forms")) {
      return new Response(
        JSON.stringify({ error: { message: "User request limit reached", code: 17, error_subcode: 2446079 } }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    if (url.pathname.includes("/form-cache/leads")) {
      return new Response(
        JSON.stringify({ data: [{ id: "lead-cache", created_time: "2025-11-17T00:00:00Z", field_data: [] }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const leads = await fetchMetaLeads({
      accountId: "act_cache",
      accessToken: "token",
      cachedForms: [{ id: "form-cache" }],
    });
    assert.equal(leads.length, 1);
    assert.ok(requests.some((request) => request.pathname.includes("/form-cache/leads")));
    assert.ok(requests.some((request) => request.pathname.includes("/act_cache/leadgen_forms")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchMetaLeads skips enumeration when cached forms are marked authoritative", async () => {
  const originalFetch = globalThis.fetch;
  const requests: URL[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url);
    requests.push(url);
    if (url.pathname.includes("/act_cache_only/leadgen_forms")) {
      return new Response(JSON.stringify({ error: { message: "should not fetch" } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.includes("/form-cache-only/leads")) {
      return new Response(
        JSON.stringify({ data: [{ id: "lead-cache-only", created_time: "2025-11-17T00:00:00Z", field_data: [] }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const leads = await fetchMetaLeads({
      accountId: "act_cache_only",
      accessToken: "token",
      cachedForms: [{ id: "form-cache-only" }],
      useCachedFormsOnly: true,
    });
    assert.equal(leads.length, 1);
    assert.ok(!requests.some((request) => request.pathname.includes("/act_cache_only/leadgen_forms")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchMetaLeads invokes persistence callback when forms are enumerated", async () => {
  const originalFetch = globalThis.fetch;
  const persisted: string[][] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url);
    if (url.pathname.includes("/act_forms_cb/leads")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/act_forms_cb/leadgen_forms")) {
      return new Response(JSON.stringify({ data: [{ id: "form-callback" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.includes("/form-callback/leads")) {
      return new Response(
        JSON.stringify({ data: [{ id: "lead-from-callback", created_time: "2025-11-17T00:00:00Z", field_data: [] }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const leads = await fetchMetaLeads({
      accountId: "act_forms_cb",
      accessToken: "token",
      onFormsEnumerated: async (forms) => {
        persisted.push(forms.map((form) => form.id));
      },
    });
    assert.equal(leads.length, 1);
    assert.equal(persisted.length, 1);
    assert.deepEqual(persisted[0], ["form-callback"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("summariseMetaInsights does not double count duplicate lead actions", () => {
  const summary = summariseMetaInsights({
    data: [
      {
        spend: "10",
        impressions: "1000",
        clicks: "100",
        actions: [
          { action_type: "lead", value: "9" },
          { action_type: "leadgen_grouped", value: "9" },
          { action_type: "onsite_conversion.lead_grouped", value: "9" },
          { action_type: "submit_application", value: "9" },
        ],
      },
    ],
  });
  assert.equal(summary.leads, 9);
});

test("summariseMetaInsights keeps submit_application counts when lead metric is missing", () => {
  const summary = summariseMetaInsights({
    data: [
      {
        spend: "10",
        impressions: "1000",
        clicks: "100",
        actions: [
          { action_type: "submit_application", value: "7" },
        ],
      },
    ],
  });
  assert.equal(summary.leads, 7);
});

test("summariseMetaInsights prefers canonical lead metrics before generic lead matches", () => {
  const summary = summariseMetaInsights({
    data: [
      {
        spend: "12",
        impressions: "1200",
        clicks: "240",
        actions: [
          { action_type: "leadgen_grouped", value: "45" },
          { action_type: "lead", value: "9" },
          { action_type: "leadgen.custom_form", value: "30" },
        ],
      },
    ],
  });
  assert.equal(summary.leads, 9);
});

test("summariseMetaInsights still falls back to fuzzy lead matches when canonical metrics are missing", () => {
  const summary = summariseMetaInsights({
    data: [
      {
        spend: "7",
        impressions: "900",
        clicks: "30",
        actions: [
          { action_type: "custom_lead_signal", value: "5" },
          { action_type: "leadgen_callback", value: "12" },
        ],
      },
    ],
  });
  assert.equal(summary.leads, 12);
});
