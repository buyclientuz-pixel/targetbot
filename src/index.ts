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
      return handleSetBillingLimit(request, env);
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

async function handleSetBillingLimit(request: Request, env: Env): Promise<Response> {
  const allowedMethods = new Set(["POST", "PUT", "PATCH"]);
  const method = typeof request.method === "string" ? request.method.toUpperCase() : "GET";
  if (!allowedMethods.has(method)) {
    return new Response("method not allowed", {
      status: 405,
      headers: { Allow: Array.from(allowedMethods).join(", ") },
    });
  }

  const limitResult = await extractLimitFromRequest(request);
  if (limitResult.error) {
    return new Response(limitResult.error, { status: limitResult.status });
  }

  const namespace = env.BILLING_NAMESPACE;
  await namespace.put("limit", String(limitResult.limit));
  return new Response("ok");
}

async function extractLimitFromRequest(
  request: Request,
): Promise<{ limit: number; error?: undefined; status?: undefined } | { error: string; status: number; limit?: undefined }> {
  const url = new URL(request.url);
  const queryValue = url.searchParams.get("limit");
  if (queryValue !== null) {
    return normalizeLimit(queryValue);
  }

  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const limitValue =
        body && typeof body === "object" ? (body as Record<string, unknown>).limit : undefined;
      return normalizeLimit(limitValue);
    }

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      const entry = formData.get("limit");
      if (entry && typeof entry === "object" && "text" in entry && typeof (entry as any).text === "function") {
        const textValue = await (entry as any).text();
        return normalizeLimit(textValue);
      }
      return normalizeLimit(entry);
    }

    if (contentType.includes("text/plain")) {
      const text = (await request.text()).trim();
      if (text) {
        return normalizeLimit(text);
      }
    }

    if (!contentType) {
      const text = (await request.text()).trim();
      if (text) {
        return normalizeLimit(text);
      }
    }
  } catch (error) {
    return { error: "invalid request body", status: 400 };
  }

  return { error: "limit is required", status: 400 };
}

function normalizeLimit(value: unknown): { limit: number } | { error: string; status: number } {
  let normalized = value;
  if (typeof normalized === "string") {
    normalized = normalized.trim();
  }

  if (normalized === null || normalized === undefined || normalized === "") {
    return { error: "limit is required", status: 400 };
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: "invalid limit", status: 400 };
  }

  return { limit: amount };
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
