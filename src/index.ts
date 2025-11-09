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

type TargetStatus = "draft" | "active" | "paused" | "completed";

interface TargetMetrics {
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  conversions: number;
}

interface TargetRecord {
  id: string;
  name: string;
  platform: string;
  objective: string;
  dailyBudget: number;
  status: TargetStatus;
  owner?: string;
  tags: string[];
  metrics: TargetMetrics;
  createdAt: string;
  updatedAt: string;
}

interface TargetFilters {
  status?: TargetStatus;
  platform?: string;
  owner?: string;
  tag?: string;
  search?: string;
}

type TargetPayload = Partial<Omit<TargetRecord, "metrics">> & {
  id?: string;
  metrics?: Partial<TargetMetrics>;
};

const DEFAULT_REPORT_LIMIT = 50;
const DEFAULT_LOG_LIMIT = 10;
const DEFAULT_TARGET_LIMIT = 25;
const MAX_LIST_LIMIT = 100;
const TARGET_PREFIX = "target:";
const METRIC_LOG_PREFIX = "metric:";
const ALLOWED_TARGET_STATUSES: TargetStatus[] = [
  "draft",
  "active",
  "paused",
  "completed",
];

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    switch (pathname) {
      case "/":
        return new Response("ok");
      case "/reports":
        return handleGetReports(request, env, url);
      case "/reports/summary":
        return handleReportSummary(request, env, url);
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
      case "/portal/link":
        return handlePortalLink(request, env, url);
      case "/portal/new":
        return handlePortalNew(request, env, url);
      case "/targets":
        return handleTargetsCollection(request, env, url);
      default:
        if (pathname.startsWith("/targets/")) {
          return handleTargetRoute(request, env, url);
        }

        if (pathname.startsWith("/webhook")) {
          return handleWebhook(request, env);
        }

        return new Response("not found", { status: 404 });
    }
  },
};

async function handleGetReports(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const reportId = url.searchParams.get("id");
  const limit = parseLimit(url.searchParams.get("limit"), DEFAULT_REPORT_LIMIT);
  const prefix = url.searchParams.get("prefix") ?? undefined;
  const cursor = url.searchParams.get("cursor");

  if (reportId) {
    const record = await loadRecordById(env.REPORTS_NAMESPACE, reportId);

    if (!record) {
      return errorResponse(`Report "${reportId}" not found.`, 404);
    }

    return jsonResponse(record);
  }

  const list = await loadRecords(env.REPORTS_NAMESPACE, {
    limit,
    prefix,
    cursor,
  });

  return jsonResponse({ reports: list.records, cursor: list.cursor });
}

async function handleReportSummary(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const statusParam = url.searchParams.get("status");
  const status = statusParam ? normalizeTargetStatus(statusParam) : undefined;
  if (statusParam && !status) {
    return errorResponse("Invalid status filter supplied.");
  }

  const filters: TargetFilters = {
    status: status ?? undefined,
    platform: sanitizeQueryValue(url.searchParams.get("platform")),
    owner: sanitizeQueryValue(url.searchParams.get("owner")),
  };

  const targets = await getAllTargets(env);
  const filtered = targets.filter((target) => matchesTargetFilters(target, filters));
  const summary = summarizeTargets(filtered);

  return jsonResponse(summary);
}

async function handleTargetsCollection(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  if (request.method === "GET") {
    const limit = parseLimit(url.searchParams.get("limit"), DEFAULT_TARGET_LIMIT);
    const cursor = url.searchParams.get("cursor");

    const statusParam = url.searchParams.get("status");
    const status = statusParam ? normalizeTargetStatus(statusParam) : undefined;
    if (statusParam && !status) {
      return errorResponse("Invalid status filter supplied.");
    }

    const filters: TargetFilters = {
      status: status ?? undefined,
      platform: sanitizeQueryValue(url.searchParams.get("platform")),
      owner: sanitizeQueryValue(url.searchParams.get("owner")),
      tag: sanitizeQueryValue(url.searchParams.get("tag")),
      search: sanitizeQueryValue(url.searchParams.get("search")),
    };

    const list = await listTargets(env, { limit, cursor, filters });
    return jsonResponse(list);
  }

  if (request.method === "POST") {
    const payload = await safeJson<unknown>(request);
    if (payload === null) {
      return errorResponse("Invalid JSON body.");
    }

    const validation = validateTargetPayload(payload, { requireAllFields: true });
    if (!validation.ok) {
      return errorResponse(validation.error);
    }

    const input = validation.value;
    const targetId = input.id ?? crypto.randomUUID();
    const existing = await loadTarget(env, targetId);
    if (existing) {
      return errorResponse(`Target "${targetId}" already exists.`, 409);
    }

    const now = new Date().toISOString();
    const record: TargetRecord = {
      id: targetId,
      name: input.name!,
      platform: input.platform!,
      objective: input.objective!,
      dailyBudget: input.dailyBudget!,
      status: input.status ?? "draft",
      owner: input.owner,
      tags: input.tags ?? [],
      metrics: input.metrics
        ? mergeMetrics(createEmptyMetrics(), input.metrics)
        : createEmptyMetrics(),
      createdAt: now,
      updatedAt: now,
    };

    await saveTarget(env, record);
    return jsonResponse(record, { status: 201 });
  }

  return methodNotAllowed(["GET", "POST"]);
}

async function handleTargetRoute(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    return new Response("not found", { status: 404 });
  }

  const targetId = decodeURIComponent(segments[1]);

  if (segments.length === 2) {
    return handleTargetDetail(request, env, targetId);
  }

  if (segments[2] === "metrics") {
    return handleTargetMetrics(request, env, targetId);
  }

  return new Response("not found", { status: 404 });
}

async function handleTargetDetail(
  request: Request,
  env: Env,
  targetId: string
): Promise<Response> {
  if (request.method === "GET") {
    const target = await loadTarget(env, targetId);
    if (!target) {
      return errorResponse(`Target "${targetId}" not found.`, 404);
    }

    return jsonResponse(target);
  }

  if (request.method === "PUT" || request.method === "PATCH") {
    const payload = await safeJson<unknown>(request);
    if (payload === null) {
      return errorResponse("Invalid JSON body.");
    }

    const validation = validateTargetPayload(payload, { requireAllFields: false });
    if (!validation.ok) {
      return errorResponse(validation.error);
    }

    const updates = validation.value;
    if (Object.keys(updates).length === 0) {
      return errorResponse("No updatable fields supplied.");
    }

    const existing = await loadTarget(env, targetId);
    if (!existing) {
      return errorResponse(`Target "${targetId}" not found.`, 404);
    }

    const now = new Date().toISOString();
    const next: TargetRecord = {
      ...existing,
      name: updates.name ?? existing.name,
      platform: updates.platform ?? existing.platform,
      objective: updates.objective ?? existing.objective,
      dailyBudget: updates.dailyBudget ?? existing.dailyBudget,
      status: updates.status ?? existing.status,
      owner: updates.owner ?? existing.owner,
      tags: updates.tags ?? existing.tags,
      metrics: updates.metrics
        ? mergeMetrics(existing.metrics, updates.metrics)
        : existing.metrics,
      updatedAt: now,
    };

    await saveTarget(env, next);
    return jsonResponse(next);
  }

  if (request.method === "DELETE") {
    const existing = await loadTarget(env, targetId);
    if (!existing) {
      return errorResponse(`Target "${targetId}" not found.`, 404);
    }

    await env.REPORTS_NAMESPACE.delete(TARGET_PREFIX + targetId);
    return new Response(null, { status: 204 });
  }

  return methodNotAllowed(["GET", "PUT", "PATCH", "DELETE"]);
}

async function handleTargetMetrics(
  request: Request,
  env: Env,
  targetId: string
): Promise<Response> {
  const target = await loadTarget(env, targetId);
  if (!target) {
    return errorResponse(`Target "${targetId}" not found.`, 404);
  }

  if (request.method === "GET") {
    return jsonResponse(buildTargetMetricsResponse(target));
  }

  if (request.method === "POST") {
    const payload = await safeJson<unknown>(request);
    if (payload === null) {
      return errorResponse("Invalid JSON body.");
    }

    const normalization = normalizeMetricsPayload(payload);
    if (!normalization.ok) {
      return errorResponse(normalization.error);
    }

    const { updates, mode, note } = normalization;
    if (Object.keys(updates).length === 0) {
      return errorResponse("No metrics provided for update.");
    }

    const updatedMetrics = { ...target.metrics };
    for (const key of Object.keys(updates) as (keyof TargetMetrics)[]) {
      const value = updates[key]!;
      if (mode === "replace") {
        updatedMetrics[key] = ensurePositiveNumber(value);
      } else {
        updatedMetrics[key] = Math.max(0, updatedMetrics[key] + value);
      }
    }

    const now = new Date().toISOString();
    const next: TargetRecord = {
      ...target,
      metrics: updatedMetrics,
      updatedAt: now,
    };

    await saveTarget(env, next);

    const logId = `${METRIC_LOG_PREFIX}${target.id}:${Date.now()}:${crypto.randomUUID()}`;
    const logEntry = {
      id: logId,
      targetId: target.id,
      type: "target.metric",
      mode,
      updates,
      note: note ?? null,
      createdAt: now,
    };
    await env.LOGS_NAMESPACE.put(logId, JSON.stringify(logEntry), {
      metadata: {
        type: "target.metric",
        targetId: target.id,
        mode,
      },
    });

    return jsonResponse({
      targetId: target.id,
      metrics: updatedMetrics,
      mode,
      logId,
    });
  }

  return methodNotAllowed(["GET", "POST"]);
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

async function handleGetLogs(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const limit = parseLimit(url.searchParams.get("limit"), DEFAULT_LOG_LIMIT);
  const prefix = url.searchParams.get("prefix") ?? undefined;
  const cursor = url.searchParams.get("cursor");

  const logs = await loadRecords(env.LOGS_NAMESPACE, {
    limit,
    prefix,
    cursor,
  });

  return jsonResponse({ logs: logs.records, cursor: logs.cursor });
}

async function handlePortalLink(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const projectId = url.searchParams.get("project");
  if (!projectId) {
    return errorResponse("Missing project parameter", 400);
  }

  const projectKey = `project:${projectId}`;
  const project = await env.REPORTS_NAMESPACE.get(projectKey);
  if (!project) {
    return errorResponse(`Project "${projectId}" not found.`, 404);
  }

  const sigKey = `portal:${projectId}:sig`;
  const signature = await env.REPORTS_NAMESPACE.get(sigKey);
  if (!signature) {
    return errorResponse(`Portal link for project "${projectId}" not issued.`, 404);
  }

  const link = buildPortalUrl(url, projectId, signature);
  return jsonResponse({ url: link });
}

async function handlePortalNew(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const projectId = url.searchParams.get("project");
  if (!projectId) {
    return errorResponse("Missing project parameter", 400);
  }

  const projectKey = `project:${projectId}`;
  const project = await env.REPORTS_NAMESPACE.get(projectKey);
  if (!project) {
    return errorResponse(`Project "${projectId}" not found.`, 404);
  }

  const signature = crypto.randomUUID().replace(/-/g, "");
  await env.REPORTS_NAMESPACE.put(`portal:${projectId}:sig`, signature);

  const link = buildPortalUrl(url, projectId, signature);
  return jsonResponse({ url: link });
}

function buildPortalUrl(url: URL, projectId: string, signature: string): string {
  const base = new URL(url.origin);
  base.pathname = `/p/${projectId}`;
  base.search = new URLSearchParams({ sig: signature }).toString();
  return base.toString();
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
  options: { limit: number; prefix?: string; cursor?: string | null }
): Promise<{ records: StoredRecord[]; cursor: string | null }> {
  const list = await namespace.list({
    limit: options.limit,
    prefix: options.prefix,
    reverse: true,
    cursor: options.cursor ?? undefined,
  });

  const records = await Promise.all(
    list.keys.map(async (key) => ({
      id: key.name,
      value: parseStoredValue(await namespace.get(key.name)),
      metadata: key.metadata ?? null,
    }))
  );

  const nextCursor = list.cursor && list.cursor.length > 0 ? list.cursor : null;
  return { records, cursor: nextCursor };
}

async function listTargets(
  env: Env,
  options: { limit: number; cursor: string | null; filters: TargetFilters }
): Promise<{ targets: TargetRecord[]; cursor: string | null }> {
  const targets = await getAllTargets(env);
  const filtered = targets
    .filter((target) => matchesTargetFilters(target, options.filters))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const start = parseCursor(options.cursor);
  const slice = filtered.slice(start, start + options.limit);
  const nextCursor = start + slice.length < filtered.length ? String(start + slice.length) : null;

  return { targets: slice, cursor: nextCursor };
}

async function loadTarget(env: Env, targetId: string): Promise<TargetRecord | null> {
  const raw = await env.REPORTS_NAMESPACE.get(TARGET_PREFIX + targetId);
  if (!raw) {
    return null;
  }

  const parsed = parseTargetRecord(raw, targetId);
  return parsed;
}

async function saveTarget(env: Env, target: TargetRecord): Promise<void> {
  await env.REPORTS_NAMESPACE.put(
    TARGET_PREFIX + target.id,
    JSON.stringify(target)
  );
}

async function getAllTargets(env: Env): Promise<TargetRecord[]> {
  const namespace = env.REPORTS_NAMESPACE;
  const collected: TargetRecord[] = [];
  let cursor: string | undefined;

  do {
    const list = await namespace.list({
      prefix: TARGET_PREFIX,
      limit: MAX_LIST_LIMIT,
      cursor,
    });

    for (const key of list.keys) {
      const raw = await namespace.get(key.name);
      if (!raw) {
        continue;
      }

      const record = parseTargetRecord(raw, key.name.slice(TARGET_PREFIX.length));
      if (record) {
        collected.push(record);
      }
    }

    cursor = !list.list_complete && list.cursor ? list.cursor : undefined;
  } while (cursor);

  return collected;
}

function parseTargetRecord(raw: string, fallbackId: string): TargetRecord | null {
  try {
    const value = JSON.parse(raw) as Partial<TargetRecord> & Record<string, unknown>;
    if (!value || typeof value !== "object") {
      return null;
    }

    const id = typeof value.id === "string" && value.id.length > 0 ? value.id : fallbackId;
    const name = typeof value.name === "string" ? value.name : undefined;
    const platform = typeof value.platform === "string" ? value.platform : undefined;
    const objective = typeof value.objective === "string" ? value.objective : undefined;
    const dailyBudget = typeof value.dailyBudget === "number" && Number.isFinite(value.dailyBudget)
      ? value.dailyBudget
      : undefined;
    const status = typeof value.status === "string" ? normalizeTargetStatus(value.status) ?? "draft" : "draft";
    const owner = typeof value.owner === "string" ? value.owner : undefined;
    const tags = Array.isArray(value.tags) ? sanitizeTags(value.tags) : [];
    const createdAt = typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString();
    const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : createdAt;

    if (!name || !platform || !objective || dailyBudget === undefined) {
      return null;
    }

    const metrics = value.metrics ? sanitizeMetrics(value.metrics) : createEmptyMetrics();

    return {
      id,
      name,
      platform,
      objective,
      dailyBudget,
      status,
      owner,
      tags,
      metrics,
      createdAt,
      updatedAt,
    };
  } catch (_error) {
    return null;
  }
}

function matchesTargetFilters(target: TargetRecord, filters: TargetFilters): boolean {
  if (filters.status && target.status !== filters.status) {
    return false;
  }

  if (filters.platform && target.platform.toLowerCase() !== filters.platform.toLowerCase()) {
    return false;
  }

  if (filters.owner && (target.owner ?? "").toLowerCase() !== filters.owner.toLowerCase()) {
    return false;
  }

  if (filters.tag) {
    const tagMatch = target.tags.some((tag) => tag.toLowerCase() === filters.tag!.toLowerCase());
    if (!tagMatch) {
      return false;
    }
  }

  if (filters.search) {
    const needle = filters.search.toLowerCase();
    const haystack = `${target.name} ${target.objective}`.toLowerCase();
    if (!haystack.includes(needle)) {
      return false;
    }
  }

  return true;
}

function sanitizeTags(tags: unknown[]): string[] {
  const seen = new Set<string>();
  for (const tag of tags) {
    if (typeof tag !== "string") {
      continue;
    }
    const trimmed = tag.trim();
    if (!trimmed) {
      continue;
    }
    seen.add(trimmed);
  }
  return Array.from(seen);
}

function createEmptyMetrics(): TargetMetrics {
  return {
    impressions: 0,
    clicks: 0,
    spend: 0,
    leads: 0,
    conversions: 0,
  };
}

function mergeMetrics(base: TargetMetrics, updates: Partial<TargetMetrics>): TargetMetrics {
  const next = { ...base };
  for (const key of Object.keys(updates) as (keyof TargetMetrics)[]) {
    const value = updates[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      next[key] = value;
    }
  }
  return next;
}

function sanitizeMetricsPartial(
  input: unknown
): { ok: true; value: Partial<TargetMetrics> } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Field 'metrics' must be an object." };
  }

  const allowedKeys: (keyof TargetMetrics)[] = [
    "impressions",
    "clicks",
    "spend",
    "leads",
    "conversions",
  ];

  const metrics: Partial<TargetMetrics> = {};

  for (const key of allowedKeys) {
    if (!(key in (input as Record<string, unknown>))) {
      continue;
    }

    const value = (input as Record<string, unknown>)[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return { ok: false, error: `Field 'metrics.${key}' must be a non-negative number.` };
    }

    metrics[key] = value;
  }

  return { ok: true, value: metrics };
}

function sanitizeMetrics(input: unknown): TargetMetrics {
  const base = createEmptyMetrics();
  if (!input || typeof input !== "object") {
    return base;
  }

  for (const key of Object.keys(base) as (keyof TargetMetrics)[]) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      base[key] = value;
    }
  }

  return base;
}

function buildTargetMetricsResponse(target: TargetRecord) {
  const metrics = target.metrics;
  return {
    targetId: target.id,
    metrics,
    kpis: {
      ctr: roundMetric(computeRate(metrics.clicks, metrics.impressions)),
      cpc: roundMetric(computeCost(metrics.spend, metrics.clicks), 4),
      cpm: roundMetric(computeCpm(metrics.spend, metrics.impressions), 4),
      cpl: roundMetric(computeCost(metrics.spend, metrics.leads), 4),
      conversionRate: roundMetric(computeRate(metrics.conversions, metrics.clicks)),
    },
    updatedAt: target.updatedAt,
  };
}

function summarizeTargets(targets: TargetRecord[]) {
  const totals = createEmptyMetrics();
  const statusBreakdown = new Map<TargetStatus, TargetMetrics & { count: number }>();
  const platformBreakdown = new Map<string, TargetMetrics & { count: number }>();

  for (const status of ALLOWED_TARGET_STATUSES) {
    statusBreakdown.set(status, { ...createEmptyMetrics(), count: 0 });
  }

  for (const target of targets) {
    accumulateMetrics(totals, target.metrics);

    const statusEntry = statusBreakdown.get(target.status)!;
    accumulateMetrics(statusEntry, target.metrics);
    statusEntry.count += 1;

    const platformKey = target.platform.toLowerCase();
    const platformEntry = platformBreakdown.get(platformKey) ?? {
      ...createEmptyMetrics(),
      count: 0,
    };
    accumulateMetrics(platformEntry, target.metrics);
    platformEntry.count += 1;
    platformBreakdown.set(platformKey, platformEntry);
  }

  const totalsWithDerived = {
    targets: targets.length,
    impressions: totals.impressions,
    clicks: totals.clicks,
    leads: totals.leads,
    conversions: totals.conversions,
    spend: roundMetric(totals.spend, 2),
    ctr: roundMetric(computeRate(totals.clicks, totals.impressions)),
    cpc: roundMetric(computeCost(totals.spend, totals.clicks), 4),
    cpl: roundMetric(computeCost(totals.spend, totals.leads), 4),
    cpm: roundMetric(computeCpm(totals.spend, totals.impressions), 4),
    conversionRate: roundMetric(computeRate(totals.conversions, totals.clicks)),
  };

  const byStatus: Record<string, unknown> = {};
  for (const [status, metrics] of statusBreakdown.entries()) {
    byStatus[status] = buildBreakdownEntry(metrics);
  }

  const byPlatform: Record<string, unknown> = {};
  for (const [platform, metrics] of platformBreakdown.entries()) {
    byPlatform[platform] = buildBreakdownEntry(metrics);
  }

  return {
    totals: totalsWithDerived,
    byStatus,
    byPlatform,
  };
}

function buildBreakdownEntry(metrics: TargetMetrics & { count: number }) {
  return {
    count: metrics.count,
    impressions: metrics.impressions,
    clicks: metrics.clicks,
    leads: metrics.leads,
    conversions: metrics.conversions,
    spend: roundMetric(metrics.spend, 2),
    ctr: roundMetric(computeRate(metrics.clicks, metrics.impressions)),
    cpc: roundMetric(computeCost(metrics.spend, metrics.clicks), 4),
    cpl: roundMetric(computeCost(metrics.spend, metrics.leads), 4),
    cpm: roundMetric(computeCpm(metrics.spend, metrics.impressions), 4),
    conversionRate: roundMetric(computeRate(metrics.conversions, metrics.clicks)),
  };
}

function accumulateMetrics(
  accumulator: TargetMetrics & { count?: number },
  metrics: TargetMetrics
) {
  accumulator.impressions += metrics.impressions;
  accumulator.clicks += metrics.clicks;
  accumulator.spend += metrics.spend;
  accumulator.leads += metrics.leads;
  accumulator.conversions += metrics.conversions;
}

function normalizeTargetStatus(value: string): TargetStatus | null {
  const normalized = value.toLowerCase();
  return ALLOWED_TARGET_STATUSES.find((status) => status === normalized) ?? null;
}

function validateTargetPayload(
  payload: unknown,
  options: { requireAllFields: boolean }
): { ok: true; value: TargetPayload } | { ok: false; error: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Body must be a JSON object." };
  }

  const input = payload as Record<string, unknown>;
  const result: TargetPayload = {};
  const errors: string[] = [];

  if (input.id !== undefined) {
    if (typeof input.id !== "string" || input.id.trim().length === 0) {
      errors.push("Field 'id' must be a non-empty string if provided.");
    } else {
      result.id = input.id.trim();
    }
  }

  if (input.name !== undefined) {
    if (typeof input.name !== "string" || input.name.trim().length === 0) {
      errors.push("Field 'name' must be a non-empty string.");
    } else {
      result.name = input.name.trim();
    }
  } else if (options.requireAllFields) {
    errors.push("Field 'name' is required.");
  }

  if (input.platform !== undefined) {
    if (typeof input.platform !== "string" || input.platform.trim().length === 0) {
      errors.push("Field 'platform' must be a non-empty string.");
    } else {
      result.platform = input.platform.trim();
    }
  } else if (options.requireAllFields) {
    errors.push("Field 'platform' is required.");
  }

  if (input.objective !== undefined) {
    if (typeof input.objective !== "string" || input.objective.trim().length === 0) {
      errors.push("Field 'objective' must be a non-empty string.");
    } else {
      result.objective = input.objective.trim();
    }
  } else if (options.requireAllFields) {
    errors.push("Field 'objective' is required.");
  }

  if (input.dailyBudget !== undefined) {
    if (
      typeof input.dailyBudget !== "number" ||
      !Number.isFinite(input.dailyBudget) ||
      input.dailyBudget <= 0
    ) {
      errors.push("Field 'dailyBudget' must be a positive number.");
    } else {
      result.dailyBudget = input.dailyBudget;
    }
  } else if (options.requireAllFields) {
    errors.push("Field 'dailyBudget' is required.");
  }

  if (input.status !== undefined) {
    if (typeof input.status !== "string") {
      errors.push("Field 'status' must be a string.");
    } else {
      const status = normalizeTargetStatus(input.status);
      if (!status) {
        errors.push("Field 'status' must be one of draft, active, paused, completed.");
      } else {
        result.status = status;
      }
    }
  }

  if (input.owner !== undefined) {
    if (typeof input.owner !== "string" || input.owner.trim().length === 0) {
      errors.push("Field 'owner' must be a non-empty string when provided.");
    } else {
      result.owner = input.owner.trim();
    }
  }

  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags)) {
      errors.push("Field 'tags' must be an array of strings.");
    } else {
      result.tags = sanitizeTags(input.tags);
    }
  }

  if (input.metrics !== undefined) {
    const metricsResult = sanitizeMetricsPartial(input.metrics);
    if (!metricsResult.ok) {
      errors.push(metricsResult.error);
    } else if (Object.keys(metricsResult.value).length > 0) {
      result.metrics = metricsResult.value;
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: errors.join(" ") };
  }

  return { ok: true, value: result };
}

function normalizeMetricsPayload(
  payload: unknown
):
  | { ok: true; updates: Partial<TargetMetrics>; mode: "increment" | "replace"; note?: string }
  | { ok: false; error: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Body must be a JSON object." };
  }

  const input = payload as Record<string, unknown>;
  const updates: Partial<TargetMetrics> = {};
  const mode = input.mode === "replace" ? "replace" : "increment";
  const allowedKeys: (keyof TargetMetrics)[] = [
    "impressions",
    "clicks",
    "spend",
    "leads",
    "conversions",
  ];

  for (const key of allowedKeys) {
    if (input[key] === undefined) {
      continue;
    }

    const value = input[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { ok: false, error: `Field '${key}' must be a finite number.` };
    }

    if (mode === "increment" && value === 0) {
      continue;
    }

    updates[key] = value;
  }

  const note = typeof input.note === "string" && input.note.trim().length > 0 ? input.note.trim() : undefined;

  return { ok: true, updates, mode, note };
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

function sanitizeQueryValue(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseCursor(cursor: string | null): number {
  if (!cursor) {
    return 0;
  }

  const parsed = Number.parseInt(cursor, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function ensurePositiveNumber(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

function computeRate(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }

  return part / total;
}

function computeCost(spend: number, divisor: number): number {
  if (!Number.isFinite(spend) || !Number.isFinite(divisor) || divisor <= 0) {
    return 0;
  }

  return spend / divisor;
}

function computeCpm(spend: number, impressions: number): number {
  if (!Number.isFinite(spend) || !Number.isFinite(impressions) || impressions <= 0) {
    return 0;
  }

  return (spend / impressions) * 1000;
}

function roundMetric(value: number, digits = 4): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

