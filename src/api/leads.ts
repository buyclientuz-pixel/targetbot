import type { RouteHandler } from "../core/types";
import { createLead, getLead, listLeads, updateLead } from "../core/db";
import { fail, ok, readJsonBody } from "../core/utils";
import { requireAdmin, requirePortalSignature } from "../core/auth";

const DEFAULT_STATUSES = ["new", "in_progress", "closed"] as const;
const DEFAULT_SOURCES = ["telegram", "facebook", "manual"];

export const listLeadsHandler: RouteHandler = async (context) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;
  const allLeads = await listLeads(context.env);
  const url = new URL(context.request.url);
  const statusRaw = url.searchParams.get("status");
  const sourceRaw = url.searchParams.get("source");
  const statusParam = normalizeFilterValue(statusRaw, "all");
  const sourceParam = normalizeFilterValue(sourceRaw, "all");
  const fromParam = (url.searchParams.get("from") ?? "").trim();
  const toParam = (url.searchParams.get("to") ?? "").trim();

  const fromTimestamp = parseDateBoundary(fromParam, "start");
  const toTimestamp = parseDateBoundary(toParam, "end");

  const filtered = allLeads.filter((lead) => {
    if (statusParam !== "all" && lead.status.toLowerCase() !== statusParam) {
      return false;
    }
    if (sourceParam !== "all" && (lead.source ?? "").toLowerCase() !== sourceParam) {
      return false;
    }

    const createdTime = Date.parse(lead.createdAt);
    if (Number.isNaN(createdTime)) {
      return false;
    }
    if (fromTimestamp !== null && createdTime < fromTimestamp) {
      return false;
    }
    if (toTimestamp !== null && createdTime > toTimestamp) {
      return false;
    }
    return true;
  });

  const statuses = uniqueWithDefaults(DEFAULT_STATUSES, allLeads.map((lead) => lead.status));
  const sources = uniqueWithDefaults(DEFAULT_SOURCES, allLeads.map((lead) => lead.source ?? ""));

  return ok({
    leads: filtered,
    filters: {
      status: statusParam,
      source: sourceParam,
      from: fromTimestamp !== null ? normalizeDateInput(fromParam, "start") : "",
      to: toTimestamp !== null ? normalizeDateInput(toParam, "end") : "",
    },
    available: {
      statuses,
      sources,
    },
  });
};

export const createLeadHandler: RouteHandler = async (context) => {
  const authError = await requirePortalSignature(context, { roles: ["admin", "manager", "partner", "service"] });
  if (authError) return authError;
  const payload = await readJsonBody<{
    name?: string;
    contact?: string;
    notes?: string;
    userId?: number;
    source?: string;
  }>(context.request);
  if (!payload?.name || !payload.contact) {
    return fail("Missing lead name or contact", 400);
  }
  const authData = context.data?.auth as { owner?: string | number } | undefined;
  const ownerId = authData?.owner !== undefined ? Number(authData.owner) : undefined;
  const lead = await createLead(context.env, {
    name: payload.name,
    contact: payload.contact,
    notes: payload.notes,
    source: payload.source ?? "manual",
    status: "new",
    userId: Number.isFinite(ownerId) ? Number(ownerId) : payload.userId ?? 0,
  });
  return ok({ lead });
};

export const getLeadHandler: RouteHandler = async (context) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;
  const lead = await getLead(context.env, context.params.id);
  if (!lead) return fail("Lead not found", 404);
  return ok({ lead });
};

export const updateLeadHandler: RouteHandler = async (context) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;
  const payload = await readJsonBody<Partial<{ status: string; notes: string }>>(context.request);
  if (!payload) return fail("Missing body", 400);
  const updated = await updateLead(context.env, context.params.id, payload);
  if (!updated) return fail("Lead not found", 404);
  return ok({ lead: updated });
};

function normalizeFilterValue(value: string | null, fallback: string) {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : fallback;
}

function parseDateBoundary(value: string, boundary: "start" | "end") {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let candidate = trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    candidate =
      boundary === "start"
        ? `${trimmed}T00:00:00.000Z`
        : `${trimmed}T23:59:59.999Z`;
  }
  const timestamp = Date.parse(candidate);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function normalizeDateInput(value: string, boundary: "start" | "end") {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const date = new Date(parseDateBoundary(value, boundary) ?? NaN);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function uniqueWithDefaults(defaults: readonly string[], values: string[]) {
  const result = new Map<string, string>();
  defaults.forEach((item) => result.set(item.toLowerCase(), item));
  values
    .map((value) => value?.toString())
    .filter((value): value is string => Boolean(value))
    .forEach((value) => {
      const normalized = value.toLowerCase();
      if (!result.has(normalized)) {
        result.set(normalized, value);
      }
    });
  return Array.from(result.values());
}
