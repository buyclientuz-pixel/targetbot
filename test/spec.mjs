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
    const { prefix, limit, reverse, cursor } = options;
    let entries = Array.from(this.#store.entries()).filter(([name]) =>
      prefix ? name.startsWith(prefix) : true
    );

    if (reverse) {
      entries = entries.reverse();
    }

    let startIndex = 0;
    if (typeof cursor === "string" && cursor.length > 0) {
      const parsed = Number.parseInt(cursor, 10);
      if (Number.isFinite(parsed) && parsed >= 0) {
        startIndex = parsed;
      }
    }

    const sliced = entries.slice(startIndex);
    const limited =
      typeof limit === "number" ? sliced.slice(0, limit) : sliced.slice();

    const nextIndex = startIndex + limited.length;
    const hasMore = nextIndex < entries.length;

    return {
      keys: limited.map(([name, record]) => ({
        name,
        metadata: record.metadata,
        expiration: record.expiration,
      })),
      list_complete: !hasMore,
      cursor: hasMore ? String(nextIndex) : "",
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
  assert.equal(body.cursor, null);
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

  const logsResponse = await worker.fetch(
    createRequest("https://example.com/logs?limit=1"),
    env,
    ctx
  );
  const logs = await logsResponse.json();
  assert.equal(logs.logs.length, 1);
  assert.equal(logs.cursor, null);
  assert.equal(logs.logs[0].id, id);
});

test("creates, lists, updates, and deletes targets", async () => {
  const env = createEnv();

  const createResponse = await worker.fetch(
    createRequest("https://example.com/targets", {
      method: "POST",
      body: JSON.stringify({
        name: "Spring launch",
        platform: "facebook",
        objective: "leads",
        dailyBudget: 120,
        tags: ["finance", "spring"],
        owner: "alyona",
      }),
    }),
    env,
    ctx
  );

  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.ok(created.id);
  assert.equal(created.status, "draft");
  assert.equal(created.metrics.impressions, 0);

  const listResponse = await worker.fetch(
    createRequest("https://example.com/targets?limit=10"),
    env,
    ctx
  );
  const listBody = await listResponse.json();
  assert.equal(listBody.targets.length, 1);
  assert.equal(listBody.cursor, null);
  assert.equal(listBody.targets[0].name, "Spring launch");

  const updateResponse = await worker.fetch(
    createRequest(`https://example.com/targets/${created.id}`, {
      method: "PUT",
      body: JSON.stringify({ status: "active", dailyBudget: 200 }),
    }),
    env,
    ctx
  );
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json();
  assert.equal(updated.status, "active");
  assert.equal(updated.dailyBudget, 200);

  const metricsResponse = await worker.fetch(
    createRequest(`https://example.com/targets/${created.id}/metrics`, {
      method: "POST",
      body: JSON.stringify({ impressions: 1000, clicks: 45, spend: 320.5, leads: 5 }),
    }),
    env,
    ctx
  );
  assert.equal(metricsResponse.status, 200);
  const metricsUpdate = await metricsResponse.json();
  assert.equal(metricsUpdate.metrics.impressions, 1000);
  assert.equal(metricsUpdate.metrics.clicks, 45);

  const metricsFetchResponse = await worker.fetch(
    createRequest(`https://example.com/targets/${created.id}/metrics`),
    env,
    ctx
  );
  const metricsBody = await metricsFetchResponse.json();
  assert.equal(metricsBody.metrics.leads, 5);
  assert.ok(metricsBody.kpis.ctr > 0);

  const summaryResponse = await worker.fetch(
    createRequest("https://example.com/reports/summary"),
    env,
    ctx
  );
  const summary = await summaryResponse.json();
  assert.equal(summary.totals.targets, 1);
  assert.equal(summary.totals.impressions, 1000);
  assert.equal(summary.byStatus.active.impressions, 1000);

  const deleteResponse = await worker.fetch(
    createRequest(`https://example.com/targets/${created.id}`, { method: "DELETE" }),
    env,
    ctx
  );
  assert.equal(deleteResponse.status, 204);

  const missingResponse = await worker.fetch(
    createRequest(`https://example.com/targets/${created.id}`),
    env,
    ctx
  );
  assert.equal(missingResponse.status, 404);
});

test("supports filtering and pagination for targets", async () => {
  const env = createEnv();

  async function create(name, status, platform) {
    const response = await worker.fetch(
      createRequest("https://example.com/targets", {
        method: "POST",
        body: JSON.stringify({
          name,
          platform,
          objective: "sales",
          dailyBudget: 50,
          status,
          tags: [platform],
        }),
      }),
      env,
      ctx
    );
    return response.json();
  }

  await create("Alpha", "active", "facebook");
  await create("Beta", "paused", "instagram");
  await create("Gamma", "active", "facebook");
  await create("Delta", "active", "facebook");

  const firstPage = await worker.fetch(
    createRequest("https://example.com/targets?limit=2&status=active"),
    env,
    ctx
  );
  const firstPageBody = await firstPage.json();
  assert.equal(firstPageBody.targets.length, 2);
  assert.ok(firstPageBody.cursor);

  const secondPage = await worker.fetch(
    createRequest(
      `https://example.com/targets?limit=2&status=active&cursor=${firstPageBody.cursor}`
    ),
    env,
    ctx
  );
  const secondPageBody = await secondPage.json();
  assert.equal(secondPageBody.targets.length, 1);
  assert.equal(secondPageBody.cursor, null);

  const instagramTargets = await worker.fetch(
    createRequest("https://example.com/targets?platform=instagram"),
    env,
    ctx
  );
  const instagramBody = await instagramTargets.json();
  assert.equal(instagramBody.targets.length, 1);
  assert.equal(instagramBody.targets[0].name, "Beta");
});

test("validates target payloads", async () => {
  const env = createEnv();

  const createResponse = await worker.fetch(
    createRequest("https://example.com/targets", {
      method: "POST",
      body: JSON.stringify({ objective: "awareness" }),
    }),
    env,
    ctx
  );

  assert.equal(createResponse.status, 400);
  const error = await createResponse.json();
  assert.match(error.error, /name/i);

  const env2 = createEnv();
  const createValid = await worker.fetch(
    createRequest("https://example.com/targets", {
      method: "POST",
      body: JSON.stringify({
        name: "Delta",
        platform: "facebook",
        objective: "sales",
        dailyBudget: 70,
      }),
    }),
    env2,
    ctx
  );
  const validBody = await createValid.json();

  const invalidUpdate = await worker.fetch(
    createRequest(`https://example.com/targets/${validBody.id}`, {
      method: "PUT",
      body: JSON.stringify({ dailyBudget: -10 }),
    }),
    env2,
    ctx
  );

  assert.equal(invalidUpdate.status, 400);
});
