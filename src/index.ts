interface Env {
  REPORTS_NAMESPACE: KVNamespace;
  BILLING_NAMESPACE: KVNamespace;
  LOGS_NAMESPACE: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response("ok");
    }

    if (url.pathname === "/reports") {
      return handleGetReports(env);
    }

    if (url.pathname === "/billing") {
      return handleGetBilling(env);
    }

    if (url.pathname === "/billing/update") {
      return handleUpdateBilling(env);
    }

    if (url.pathname === "/billing/set_limit") {
      return handleSetBillingLimit(env);
    }

    if (url.pathname.startsWith("/webhook")) {
      return handleWebhook(request, env);
    }

    if (url.pathname === "/billing/balance") {
      return handleBalance(env);
    }

    if (url.pathname === "/logs") {
      return handleGetLogs(env);
    }

    return new Response("not found", { status: 404 });
  },
};

async function handleGetReports(env: Env): Promise<Response> {
  const reports = await loadReports(env);
  return jsonResponse(reports);
}

async function loadReports(env: Env): Promise<(string | null)[]> {
  const namespace = env.REPORTS_NAMESPACE;
  const list = await namespace.list();

  return Promise.all(list.keys.map((key) => namespace.get(key.name)));
}

async function handleGetBilling(env: Env): Promise<Response> {
  const billing = await loadBillingData(env);
  return jsonResponse(billing);
}

async function loadBillingData(env: Env): Promise<{ limit: number; spent: number }> {
  const namespace = env.BILLING_NAMESPACE;
  const [limit, spent] = await Promise.all([
    namespace.get("limit"),
    namespace.get("spent"),
  ]);

  return {
    limit: Number(limit ?? 0),
    spent: Number(spent ?? 0),
  };
}

async function handleUpdateBilling(env: Env): Promise<Response> {
  const namespace = env.BILLING_NAMESPACE;
  await namespace.put("spent", "0");
  return new Response("ok");
}

async function handleSetBillingLimit(env: Env): Promise<Response> {
  const namespace = env.BILLING_NAMESPACE;
  await namespace.put("limit", "100");
  return new Response("ok");
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const payload = await request.json<any>();
  const namespace = env.LOGS_NAMESPACE;
  const id = typeof payload?.id === "string" ? payload.id : crypto.randomUUID();

  await namespace.put(id, JSON.stringify(payload));
  return new Response("ok");
}

async function handleBalance(env: Env): Promise<Response> {
  const { limit, spent } = await loadBillingData(env);
  const balance = limit - spent;
  return jsonResponse({ balance });
}

async function handleGetLogs(env: Env): Promise<Response> {
  const namespace = env.LOGS_NAMESPACE;
  const list = await namespace.list({ limit: 10, reverse: true });
  const logs = await Promise.all(list.keys.map((key) => namespace.get(key.name)));
  return jsonResponse(logs);
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}
