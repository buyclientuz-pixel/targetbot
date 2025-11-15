import assert from "node:assert/strict";
import test from "node:test";

import { fetchFacebookAdAccounts } from "../../src/services/facebook-auth.ts";

test("fetchFacebookAdAccounts aggregates paginated ad accounts", async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    {
      data: [
        { id: "act_1", name: "Account 1", currency: "USD" },
        { id: "act_2", name: "Account 2", currency: "eur" },
      ],
      paging: { next: "https://graph.facebook.com/v18.0/me/adaccounts?after=cursor-2" },
    },
    {
      data: [{ id: "act_3", name: "Account 3", currency: "UZS" }],
      paging: {},
    },
  ];
  let call = 0;
  globalThis.fetch = (async () => {
    const body = responses[call++];
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    const accounts = await fetchFacebookAdAccounts("EAAG");
    assert.equal(accounts.length, 3);
    assert.deepEqual(accounts[0], { id: "act_1", name: "Account 1", currency: "USD" });
    assert.deepEqual(accounts[1], { id: "act_2", name: "Account 2", currency: "EUR" });
    assert.deepEqual(accounts[2], { id: "act_3", name: "Account 3", currency: "UZS" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchFacebookAdAccounts throws when Graph API responds with an error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("unauthorised", { status: 401 })) as typeof fetch;
  try {
    await assert.rejects(() => fetchFacebookAdAccounts(""), /access token is required/i);
    await assert.rejects(() => fetchFacebookAdAccounts("bad-token"), /Facebook API error 401/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
