import assert from "node:assert/strict";
import test from "node:test";

import {
  exchangeLongLivedToken,
  exchangeOAuthCode,
  fetchFacebookAdAccounts,
} from "../../src/services/facebook-auth.ts";

test("fetchFacebookAdAccounts aggregates paginated ad accounts", async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    {
      data: [
        { id: "act_1", name: "Account 1", currency: "USD", account_status: 1 },
        { id: "act_2", name: "Account 2", currency: "eur", account_status: 2 },
      ],
      paging: { next: "https://graph.facebook.com/v18.0/me/adaccounts?after=cursor-2" },
    },
    {
      data: [{ id: "act_3", name: "Account 3", currency: "UZS", account_status: 3 }],
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
    assert.deepEqual(accounts[0], { id: "act_1", name: "Account 1", currency: "USD", status: 1 });
    assert.deepEqual(accounts[1], { id: "act_2", name: "Account 2", currency: "EUR", status: 2 });
    assert.deepEqual(accounts[2], { id: "act_3", name: "Account 3", currency: "UZS", status: 3 });
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

test("exchangeOAuthCode exchanges code for a short-lived token", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl: URL | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = new URL(String(input));
    return new Response(
      JSON.stringify({ access_token: "short", token_type: "bearer", expires_in: 600 }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const result = await exchangeOAuthCode({
      appId: "123",
      appSecret: "shh",
      redirectUri: "https://example.com/callback",
      code: "abc",
    });
    assert.equal(result.accessToken, "short");
    assert.equal(result.expiresIn, 600);
    assert.equal(requestedUrl?.searchParams.get("client_id"), "123");
    assert.equal(requestedUrl?.searchParams.get("code"), "abc");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("exchangeLongLivedToken upgrades short-lived token", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl: URL | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = new URL(String(input));
    return new Response(
      JSON.stringify({ access_token: "long", token_type: "bearer", expires_in: 5184000 }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const result = await exchangeLongLivedToken({
      appId: "123",
      appSecret: "shh",
      shortLivedToken: "short",
    });
    assert.equal(result.accessToken, "long");
    assert.equal(result.expiresIn, 5184000);
    assert.equal(requestedUrl?.searchParams.get("fb_exchange_token"), "short");
    assert.equal(requestedUrl?.searchParams.get("grant_type"), "fb_exchange_token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
