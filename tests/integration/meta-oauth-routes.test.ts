import assert from "node:assert/strict";
import test from "node:test";

import { MemoryKVNamespace, MemoryR2Bucket, TestExecutionContext } from "../utils/mocks.ts";
import "../utils/url-pattern.ts";

const { createRouter } = await import("../../src/worker/router.ts");
const { registerMetaRoutes } = await import("../../src/routes/meta.ts");
const { registerAuthRoutes } = await import("../../src/routes/auth.ts");
const { KvClient } = await import("../../src/infra/kv.ts");
const { R2Client } = await import("../../src/infra/r2.ts");
const { getFbAuthRecord } = await import("../../src/domain/spec/fb-auth.ts");
const { getMetaToken } = await import("../../src/domain/meta-tokens.ts");

test("/api/meta/oauth/start redirects to Facebook", async () => {
  const kvNamespace = new MemoryKVNamespace();
  const r2Bucket = new MemoryR2Bucket();
  const env = {
    KV: kvNamespace,
    R2: r2Bucket,
    FB_APP_ID: "123",
    WORKER_URL: "https://th-reports.buyclientuz.workers.dev",
  } satisfies import("../../src/worker/types.ts").TargetBotEnv;

  const router = createRouter();
  registerMetaRoutes(router);

  const request = new Request("https://example.com/api/meta/oauth/start?tid=100");
  const response = await router.dispatch(request, env, new TestExecutionContext());

  assert.equal(response.status, 302);
  const location = response.headers.get("Location");
  assert.ok(location);
  assert.match(location, /facebook\.com\/v18\.0\/dialog\/oauth/);
  const redirectUrl = new URL(location);
  assert.equal(redirectUrl.searchParams.get("state"), "100");
  assert.equal(redirectUrl.searchParams.get("client_id"), "123");
});

test("/auth/facebook/callback exchanges tokens and stores accounts", async () => {
  const originalFetch = globalThis.fetch;
  const kvNamespace = new MemoryKVNamespace();
  const r2Bucket = new MemoryR2Bucket();
  const env = {
    KV: kvNamespace,
    R2: r2Bucket,
    FB_APP_ID: "123",
    FB_APP_SECRET: "secret",
    WORKER_URL: "https://th-reports.buyclientuz.workers.dev",
    TELEGRAM_BOT_TOKEN: "bot-token",
  } satisfies import("../../src/worker/types.ts").TargetBotEnv;

  const router = createRouter();
  registerMetaRoutes(router);
  registerAuthRoutes(router);

  const kv = new KvClient(kvNamespace);

  const responses: Response[] = [
    new Response(JSON.stringify({ access_token: "short", token_type: "bearer", expires_in: 600 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    new Response(JSON.stringify({ access_token: "long", token_type: "bearer", expires_in: 5184000 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    new Response(JSON.stringify({
      data: [{ id: "act_1", name: "BirLash", currency: "USD", account_status: 1 }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    new Response(JSON.stringify({ id: "fb_user_1", name: "Meta User" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ];
  let call = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? new URL(input) : new URL(input.url ?? String(input));
    if (url.host.includes("api.telegram.org")) {
      return responses[4]!;
    }
    if (url.pathname.includes("oauth/access_token")) {
      return responses[call++]!;
    }
    if (url.pathname.includes("/me/adaccounts")) {
      return responses[2]!;
    }
    if (url.pathname.endsWith("/me")) {
      return responses[3]!;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const request = new Request("https://example.com/auth/facebook/callback?code=abc&state=100");
    const exec = new TestExecutionContext();
    const response = await router.dispatch(request, env, exec);
    await exec.flush();

    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(body.includes("Facebook подключён"));

    const record = await getFbAuthRecord(kv, 100);
    assert.ok(record);
    assert.equal(record.accessToken, "long");
    assert.equal(record.adAccounts[0]?.id, "act_1");
    assert.equal(record.facebookUserId, "fb_user_1");

    const raw = await kvNamespace.get("facebook-auth:100");
    assert.ok(raw);
    const parsed = JSON.parse(raw);
    assert.equal(parsed.longToken, "long");
    assert.equal(parsed.accounts[0]?.id, "act_1");

    const metaToken = await getMetaToken(kv, "fb_user_1");
    assert.equal(metaToken.accessToken, "long");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
