import test from "node:test";
import assert from "node:assert/strict";

const workerModulePath = process.env.WORKER_MODULE_PATH;
if (!workerModulePath) {
  throw new Error("WORKER_MODULE_PATH environment variable is required");
}

const workerModule = await import(workerModulePath);
const worker = workerModule.default;

class MockKVNamespace {
  #store = new Map();

  async get(key) {
    return this.#store.get(key)?.value ?? null;
  }

  async put(key, value, options = {}) {
    this.#store.set(key, {
      value,
      metadata: options.metadata,
      expiration: options.expiration,
    });
  }

  async delete(key) {
    this.#store.delete(key);
  }

  async list(options = {}) {
    const { prefix, limit, reverse } = options;
    let entries = Array.from(this.#store.entries()).filter(([name]) =>
      prefix ? name.startsWith(prefix) : true
    );

    if (reverse) {
      entries = entries.reverse();
    }

    const limited = typeof limit === "number" ? entries.slice(0, limit) : entries;

    return {
      keys: limited.map(([name, record]) => ({
        name,
        metadata: record.metadata,
        expiration: record.expiration,
      })),
      list_complete: limited.length === entries.length,
      cursor: "",
    };
  }
}

const ctx = {
  waitUntil: () => undefined,
  passThroughOnException: () => undefined,
};

function createEnv() {
  return {
    REPORTS_NAMESPACE: new MockKVNamespace(),
    BILLING_NAMESPACE: new MockKVNamespace(),
    LOGS_NAMESPACE: new MockKVNamespace(),
  };
}

function createRequest(url, init) {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return new Request(url, { ...init, headers });
}

async function seedBilling(env, limit, spent) {
  await env.BILLING_NAMESPACE.put("limit", String(limit));
  await env.BILLING_NAMESPACE.put("spent", String(spent));
}

test("responds with ok on the root path", async () => {
  const env = createEnv();
  const response = await worker.fetch(createRequest("https://example.com/"), env, ctx);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "ok");
});

test("lists stored reports", async () => {
  const env = createEnv();
  await env.REPORTS_NAMESPACE.put(
    "report-2024-01",
    JSON.stringify({ total: 10 }),
    { metadata: { month: "2024-01" } }
  );
  await env.REPORTS_NAMESPACE.put(
    "report-2024-02",
    JSON.stringify({ total: 20 }),
    { metadata: { month: "2024-02" } }
  );

  const response = await worker.fetch(createRequest("https://example.com/reports"), env, ctx);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.reports.length, 2);
  assert.deepEqual(body.reports[0], {
    id: "report-2024-02",
    value: { total: 20 },
    metadata: { month: "2024-02" },
  });
});

test("returns a single report by id", async () => {
  const env = createEnv();
  await env.REPORTS_NAMESPACE.put(
    "report-2024-03",
    JSON.stringify({ total: 30 })
  );

  const response = await worker.fetch(
    createRequest("https://example.com/reports?id=report-2024-03"),
    env,
    ctx
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, {
    id: "report-2024-03",
    value: { total: 30 },
    metadata: null,
  });
});

test("returns 404 when a report is missing", async () => {
  const env = createEnv();
  const response = await worker.fetch(
    createRequest("https://example.com/reports?id=unknown"),
    env,
    ctx
  );

  assert.equal(response.status, 404);
  const body = await response.json();
  assert.match(body.error, /Report/);
});

test("rejects unsupported methods on reports", async () => {
  const env = createEnv();
  const response = await worker.fetch(
    createRequest("https://example.com/reports", { method: "POST", body: "{}" }),
    env,
    ctx
  );

  assert.equal(response.status, 405);
});

test("updates the billing limit", async () => {
  const env = createEnv();
  const response = await worker.fetch(
    createRequest("https://example.com/billing/set_limit", {
      method: "POST",
      body: JSON.stringify({ limit: 250 }),
    }),
    env,
    ctx
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { limit: 250 });

  const billingResponse = await worker.fetch(createRequest("https://example.com/billing"), env, ctx);
  const billing = await billingResponse.json();
  assert.equal(billing.limit, 250);
});

test("increments billing spend by amount", async () => {
  const env = createEnv();
  await seedBilling(env, 500, 100);

  const response = await worker.fetch(
    createRequest("https://example.com/billing/update", {
      method: "POST",
      body: JSON.stringify({ amount: 75 }),
    }),
    env,
    ctx
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { spent: 175 });

  const balanceResponse = await worker.fetch(createRequest("https://example.com/billing/balance"), env, ctx);
  const balance = await balanceResponse.json();
  assert.deepEqual(balance, { limit: 500, spent: 175, balance: 325 });
});

test("overrides billing spend when provided", async () => {
  const env = createEnv();
  await seedBilling(env, 500, 200);

  const response = await worker.fetch(
    createRequest("https://example.com/billing/update", {
      method: "POST",
      body: JSON.stringify({ spent: 50 }),
    }),
    env,
    ctx
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { spent: 50 });
});

test("stores webhook payloads and exposes them via logs", async () => {
  const env = createEnv();
  const webhookResponse = await worker.fetch(
    createRequest("https://example.com/webhook", {
      method: "POST",
      body: JSON.stringify({ type: "alert" }),
    }),
    env,
    ctx
  );

  assert.equal(webhookResponse.status, 201);
  const { id } = await webhookResponse.json();
  assert.ok(await env.LOGS_NAMESPACE.get(id));

  const logsResponse = await worker.fetch(createRequest("https://example.com/logs?limit=1"), env, ctx);
  const logs = await logsResponse.json();
  assert.equal(logs.logs.length, 1);
  assert.equal(logs.logs[0].id, id);
});
