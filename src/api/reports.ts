import { jsonResponse } from "../utils/http";
import { createId } from "../utils/ids";
import { EnvBindings, listReports, saveReports } from "../utils/storage";
import { generateReport } from "../utils/reports";
import { ApiError, ApiSuccess, JsonObject, ReportRecord, ReportType } from "../types";

const ensureEnv = (env: unknown): (EnvBindings & Record<string, unknown>) => {
  if (!env || typeof env !== "object" || !("DB" in env) || !("R2" in env)) {
    throw new Error("Env bindings are not configured");
  }
  return env as EnvBindings & Record<string, unknown>;
};

const parseReportType = (value: unknown): ReportType => {
  if (value === "summary" || value === "detailed" || value === "finance" || value === "custom") {
    return value;
  }
  return "summary";
};

const parseFormat = (value: unknown): ReportRecord["format"] => {
  if (value === "pdf" || value === "xlsx" || value === "csv" || value === "html") {
    return value;
  }
  return "pdf";
};

const parseChannel = (value: unknown): ReportRecord["channel"] | undefined => {
  if (value === "telegram" || value === "web" || value === "api") {
    return value;
  }
  return undefined;
};

const parseStringArray = (value: unknown): string[] => {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item.trim() : String(item))).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,\n\r\t ]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const parseTotals = (value: unknown): ReportRecord["totals"] | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const toNumber = (key: string): number => {
    const numeric = Number(record[key]);
    return Number.isFinite(numeric) ? Number(numeric) : 0;
  };
  return {
    projects: toNumber("projects"),
    leadsTotal: toNumber("leadsTotal"),
    leadsNew: toNumber("leadsNew"),
    leadsDone: toNumber("leadsDone"),
  };
};

const ensureTitle = (value: unknown, fallback: string): string => {
  if (typeof value === "string" && value.trim()) {
    return value.trim().slice(0, 120);
  }
  return fallback;
};

const ensureProjectId = (value: unknown): string => {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  throw new Error("projectId is required");
};

const ensureIsoDate = (value: unknown, fallback: string): string => {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return fallback;
};

export const handleReportsList = async (request: Request, env: unknown): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    const type = url.searchParams.get("type");
    const reports = await listReports(bindings);
    const filtered = reports.filter((report) => {
      if (projectId && report.projectId !== projectId) {
        if (!report.projectIds || !report.projectIds.includes(projectId)) {
          return false;
        }
      }
      if (type && report.type !== type) {
        return false;
      }
      return true;
    });
    const sorted = filtered.sort((a, b) => {
      const aTime = Date.parse(a.generatedAt || a.createdAt);
      const bTime = Date.parse(b.generatedAt || b.createdAt);
      if (Number.isNaN(aTime) && Number.isNaN(bTime)) {
        return 0;
      }
      if (Number.isNaN(aTime)) {
        return 1;
      }
      if (Number.isNaN(bTime)) {
        return -1;
      }
      return bTime - aTime;
    });
    const payload: ApiSuccess<ReportRecord[]> = { ok: true, data: sorted };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 500 });
  }
};

export const handleReportsCreate = async (request: Request, env: unknown): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const body = (await request.json()) as Record<string, unknown>;
    const now = new Date().toISOString();
    const projectId = ensureProjectId(body.projectId);
    const projectIds = parseStringArray(body.projectIds);
    const report: ReportRecord = {
      id: typeof body.id === "string" && body.id.trim() ? body.id.trim() : createId(),
      projectId,
      type: parseReportType(body.type),
      title: ensureTitle(body.title, `Report ${now.slice(0, 10)}`),
      format: parseFormat(body.format),
      url: typeof body.url === "string" && body.url.trim() ? body.url.trim() : undefined,
      generatedAt: ensureIsoDate(body.generatedAt, now),
      createdAt: now,
      updatedAt: now,
      projectIds: projectIds.length ? projectIds : undefined,
      filters:
        typeof body.filters === "object" && body.filters
          ? {
              datePreset:
                typeof (body.filters as Record<string, unknown>).datePreset === "string"
                  ? ((body.filters as Record<string, unknown>).datePreset as string)
                  : undefined,
              since:
                typeof (body.filters as Record<string, unknown>).since === "string"
                  ? ((body.filters as Record<string, unknown>).since as string)
                  : undefined,
              until:
                typeof (body.filters as Record<string, unknown>).until === "string"
                  ? ((body.filters as Record<string, unknown>).until as string)
                  : undefined,
            }
          : undefined,
      summary: typeof body.summary === "string" ? body.summary : undefined,
      totals: parseTotals(body.totals),
      channel: parseChannel(body.channel),
      generatedBy: typeof body.generatedBy === "string" ? body.generatedBy : undefined,
      metadata:
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? (body.metadata as JsonObject)
          : undefined,
    };
    const reports = await listReports(bindings);
    if (reports.some((item) => item.id === report.id)) {
      throw new Error("Report with this id already exists");
    }
    reports.push(report);
    await saveReports(bindings, reports);
    const payload: ApiSuccess<ReportRecord> = { ok: true, data: report };
    return jsonResponse(payload, { status: 201 });
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 400 });
  }
};

export const handleReportsGenerate = async (request: Request, env: unknown): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const body = (await request.json()) as Record<string, unknown>;
    const projectIds = parseStringArray(body.projectIds);
    const result = await generateReport(bindings, {
      type: parseReportType(body.type),
      title: typeof body.title === "string" ? body.title : undefined,
      projectIds: projectIds.length ? projectIds : undefined,
      format: parseFormat(body.format),
      datePreset: typeof body.datePreset === "string" ? body.datePreset : undefined,
      since: typeof body.since === "string" ? body.since : undefined,
      until: typeof body.until === "string" ? body.until : undefined,
      includeMeta: body.includeMeta === undefined ? true : Boolean(body.includeMeta),
      channel: parseChannel(body.channel) ?? "api",
      triggeredBy: typeof body.triggeredBy === "string" ? body.triggeredBy : undefined,
      command: typeof body.command === "string" ? body.command : undefined,
    });
    const payload: ApiSuccess<{ report: ReportRecord; summary: string; html: string }> = {
      ok: true,
      data: { report: result.record, summary: result.text, html: result.html },
    };
    return jsonResponse(payload, { status: 201 });
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 400 });
  }
};

export const handleReportGet = async (
  _request: Request,
  env: unknown,
  reportId: string,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const reports = await listReports(bindings);
    const report = reports.find((entry) => entry.id === reportId);
    if (!report) {
      return jsonResponse({ ok: false, error: "Report not found" }, { status: 404 });
    }
    const payload: ApiSuccess<ReportRecord> = { ok: true, data: report };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 500 });
  }
};

export const handleReportDelete = async (
  _request: Request,
  env: unknown,
  reportId: string,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const reports = await listReports(bindings);
    const filtered = reports.filter((entry) => entry.id !== reportId);
    if (filtered.length === reports.length) {
      return jsonResponse({ ok: false, error: "Report not found" }, { status: 404 });
    }
    await saveReports(bindings, filtered);
    const payload: ApiSuccess<{ id: string }> = { ok: true, data: { id: reportId } };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 400 });
  }
};
