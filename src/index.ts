interface Env {
  REPORTS_NAMESPACE: KVNamespace;
  BILLING_NAMESPACE: KVNamespace;
  LOGS_NAMESPACE: KVNamespace;
}

interface StoredRecord {
  id: string;
  value: unknown;
  metadata: unknown;
}

const DEFAULT_REPORT_LIMIT = 50;
const DEFAULT_LOG_LIMIT = 10;
const MAX_LIST_LIMIT = 100;

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case "/":
        return new Response("ok");
      case "/reports":
        return handleGetReports(request, env, url);
      case "/billing":
        return handleGetBilling(request, env);
      case "/billing/update":
        return handleUpdateBilling(request, env);
      case "/billing/set_limit":
        return handleSetBillingLimit(request, env);
      case "/billing/balance":
        return handleBalance(request, env);
      case "/logs":
        return handleGetLogs(request, env, url);
      default:
        if (url.pathname.startsWith("/webhook")) {
          return handleWebhook(request, env);
        }

        return new Response("not found", { status: 404 });
    }
  },
};

async function handleGetReports(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const reportId = url.searchParams.get("id");
  const limit = parseLimit(url.searchParams.get("limit"), DEFAULT_REPORT_LIMIT);
  const prefix = url.searchParams.get("prefix") ?? undefined;

  if (reportId) {
    const record = await loadRecordById(env.REPORTS_NAMESPACE, reportId);

    if (!record) {
      return errorResponse(`Report \"${reportId}\" not found.`, 404);
    }

    return jsonResponse(record);
  }

  const reports = await loadRecords(env.REPORTS_NAMESPACE, {
    limit,
    prefix,
  });

  return jsonResponse({ reports });
}

async function handleGetBilling(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const billing = await loadBillingData(env);
  return jsonResponse(billing);
}

async function handleUpdateBilling(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const payload = await safeJson<{ amount?: unknown; spent?: unknown }>(request);
  if (payload === null) {
    return errorResponse("Invalid JSON body.");
  }

  const { amount, spent } = payload;
  const namespace = env.BILLING_NAMESPACE;
  const current = await loadBillingData(env);

  if (typeof spent === "number" && Number.isFinite(spent) && spent >= 0) {
    await namespace.put("spent", String(spent));
    return jsonResponse({ spent });
  }

  if (typeof amount === "number" && Number.isFinite(amount)) {
    const nextValue = Math.max(0, current.spent + amount);
    await namespace.put("spent", String(nextValue));
    return jsonResponse({ spent: nextValue });
  }

  return errorResponse("Body must include a numeric 'amount' or 'spent' field.");
}

async function handleSetBillingLimit(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const payload = await safeJson<{ limit?: unknown }>(request);
  if (payload === null) {
    return errorResponse("Invalid JSON body.");
  }

  const { limit } = payload;

  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    return errorResponse("Body must include a positive numeric 'limit'.");
  }

  const namespace = env.BILLING_NAMESPACE;
  await namespace.put("limit", String(limit));

  return jsonResponse({ limit });
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const payload = await safeJson<unknown>(request);
  if (payload === null) {
    return errorResponse("Invalid JSON body.");
  }

  const namespace = env.LOGS_NAMESPACE;
  const proposedId = typeof (payload as { id?: unknown })?.id === "string" ? (payload as { id?: string }).id : undefined;
  const id = proposedId && proposedId.trim().length > 0 ? proposedId : crypto.randomUUID();

  const record = {
    id,
    payload,
    receivedAt: new Date().toISOString(),
  };

  await namespace.put(id, JSON.stringify(record));

  return jsonResponse(record, { status: 201 });
}

async function handleBalance(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const { limit, spent } = await loadBillingData(env);
  const balance = limit - spent;
  return jsonResponse({ limit, spent, balance });
}

async function handleGetLogs(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const limit = parseLimit(url.searchParams.get("limit"), DEFAULT_LOG_LIMIT);
  const prefix = url.searchParams.get("prefix") ?? undefined;

  const logs = await loadRecords(env.LOGS_NAMESPACE, {
    limit,
    prefix,
  });

  return jsonResponse({ logs });
}

async function loadBillingData(env: Env): Promise<{ limit: number; spent: number }> {
  const namespace = env.BILLING_NAMESPACE;
  const [limitValue, spentValue] = await Promise.all([
    namespace.get("limit"),
    namespace.get("spent"),
  ]);

  return {
    limit: parseNumber(limitValue),
    spent: parseNumber(spentValue),
  };
}

async function loadRecordById(namespace: KVNamespace, id: string): Promise<StoredRecord | null> {
  const result = await namespace.get(id);

  if (result === null) {
    return null;
  }

  return {
    id,
    value: parseStoredValue(result),
    metadata: null,
  };
}

async function loadRecords(
  namespace: KVNamespace,
  options: { limit: number; prefix?: string }
): Promise<StoredRecord[]> {
  const list = await namespace.list({
    limit: options.limit,
    prefix: options.prefix,
    reverse: true,
  });

  return Promise.all(
    list.keys.map(async (key) => ({
      id: key.name,
      value: parseStoredValue(await namespace.get(key.name)),
      metadata: key.metadata ?? null,
    }))
  );
}

function parseNumber(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function parseStoredValue(value: string | null): unknown {
  if (value === null) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (_error) {
    return value;
  }
}

function parseLimit(rawLimit: string | null, fallback: number): number {
  if (rawLimit === null) {
    return fallback;
  }

  const parsed = Math.floor(Number(rawLimit));

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, MAX_LIST_LIMIT);
}

async function safeJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch (_error) {
    return null;
  }
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, { status });
}

function methodNotAllowed(allowed: string[]): Response {
  return new Response("method not allowed", {
    status: 405,
    headers: {
      Allow: allowed.join(", "),
    },
  });
}

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return new Response(JSON.stringify(value), {
    ...init,
    headers,
  });
}
