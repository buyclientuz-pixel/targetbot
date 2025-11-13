import { jsonResponse } from "../utils/http";
import { createId } from "../utils/ids";
import { calculateNextRunAt } from "../utils/report-scheduler";
import { EnvBindings, listReportSchedules, saveReportSchedules } from "../utils/storage";
import { ApiError, ApiSuccess, JsonObject, ReportScheduleFrequency, ReportScheduleRecord, ReportScheduleType } from "../types";

const ensureEnv = (env: unknown): (EnvBindings & Record<string, unknown>) => {
  if (!env || typeof env !== "object" || !("DB" in env) || !("R2" in env)) {
    throw new Error("Env bindings are not configured");
  }
  return env as EnvBindings & Record<string, unknown>;
};

const ensureTitle = (value: unknown, fallback: string): string => {
  if (typeof value === "string" && value.trim()) {
    return value.trim().slice(0, 120);
  }
  return fallback;
};

const parseScheduleType = (value: unknown): ReportScheduleType => {
  if (value === "summary" || value === "detailed" || value === "finance" || value === "sla") {
    return value;
  }
  return "summary";
};

const parseFrequency = (value: unknown): ReportScheduleFrequency => {
  if (value === "weekly") {
    return "weekly";
  }
  return "daily";
};

const ensureTime = (value: unknown): string => {
  if (typeof value === "string" && /^\d{1,2}:\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  throw new Error("time must be in HH:MM format");
};

const ensureChatId = (value: unknown): string => {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value).toString();
  }
  throw new Error("chatId is required");
};

const parseProjectIds = (value: unknown): string[] => {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    const set = new Set<string>();
    value.forEach((item) => {
      if (typeof item === "string" && item.trim()) {
        set.add(item.trim());
      } else if (typeof item === "number" && Number.isFinite(item)) {
        set.add(Math.trunc(item).toString());
      }
    });
    return Array.from(set);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const parseWeekdays = (value: unknown): number[] | undefined => {
  const values = parseProjectIds(value);
  if (!values.length) {
    return undefined;
  }
  const result = new Set<number>();
  values.forEach((entry) => {
    const numeric = Number(entry);
    if (Number.isFinite(numeric)) {
      const day = Math.max(0, Math.min(6, Math.floor(numeric)));
      result.add(day);
    }
  });
  return result.size ? Array.from(result).sort((a, b) => a - b) : undefined;
};

const ensureBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }
    return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "enabled";
  }
  return fallback;
};

const parseFormat = (value: unknown): ReportScheduleRecord["format"] => {
  if (value === "csv" || value === "html") {
    return value;
  }
  return undefined;
};

const parseMetadata = (value: unknown): JsonObject | undefined => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return undefined;
};

export const handleReportSchedulesList = async (_request: Request, env: unknown): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const schedules = await listReportSchedules(bindings);
    const payload: ApiSuccess<ReportScheduleRecord[]> = { ok: true, data: schedules };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 500 });
  }
};

export const handleReportSchedulesCreate = async (request: Request, env: unknown): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const body = (await request.json()) as Record<string, unknown>;
    const now = new Date();
    const projectIds = parseProjectIds(body.projectIds);
    const schedule: ReportScheduleRecord = {
      id: typeof body.id === "string" && body.id.trim() ? body.id.trim() : createId(),
      title: ensureTitle(body.title, "Автоотчёт"),
      type: parseScheduleType(body.type),
      frequency: parseFrequency(body.frequency),
      time: ensureTime(body.time ?? "09:00"),
      timezone: typeof body.timezone === "string" ? body.timezone.trim() || undefined : undefined,
      weekdays: parseWeekdays(body.weekdays),
      projectIds,
      chatId: ensureChatId(body.chatId),
      format: parseFormat(body.format),
      enabled: ensureBoolean(body.enabled, true),
      lastRunAt: null,
      nextRunAt: undefined,
      lastStatus: undefined,
      lastError: null,
      metadata: parseMetadata(body.metadata),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    const schedules = await listReportSchedules(bindings);
    if (schedules.some((entry) => entry.id === schedule.id)) {
      throw new Error("Schedule with this id already exists");
    }
    schedule.nextRunAt = calculateNextRunAt(schedule, now);
    schedules.push(schedule);
    await saveReportSchedules(bindings, schedules);
    const payload: ApiSuccess<ReportScheduleRecord> = { ok: true, data: schedule };
    return jsonResponse(payload, { status: 201 });
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 400 });
  }
};

export const handleReportSchedulesUpdate = async (
  request: Request,
  env: unknown,
  scheduleId: string,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const body = (await request.json()) as Record<string, unknown>;
    const schedules = await listReportSchedules(bindings);
    const index = schedules.findIndex((entry) => entry.id === scheduleId);
    if (index === -1) {
      return jsonResponse({ ok: false, error: "Schedule not found" }, { status: 404 });
    }
    const schedule = { ...schedules[index] };
    let requiresRecalculate = false;

    if (body.title !== undefined) {
      schedule.title = ensureTitle(body.title, schedule.title);
    }
    if (body.type !== undefined) {
      schedule.type = parseScheduleType(body.type);
    }
    if (body.frequency !== undefined) {
      const next = parseFrequency(body.frequency);
      if (next !== schedule.frequency) {
        schedule.frequency = next;
        requiresRecalculate = true;
      }
    }
    if (body.time !== undefined) {
      const nextTime = ensureTime(body.time);
      if (nextTime !== schedule.time) {
        schedule.time = nextTime;
        requiresRecalculate = true;
      }
    }
    if (body.timezone !== undefined) {
      const nextZone = typeof body.timezone === "string" ? body.timezone.trim() || undefined : undefined;
      if (nextZone !== schedule.timezone) {
        schedule.timezone = nextZone;
        requiresRecalculate = true;
      }
    }
    if (body.weekdays !== undefined) {
      schedule.weekdays = parseWeekdays(body.weekdays);
      requiresRecalculate = true;
    }
    if (body.chatId !== undefined) {
      schedule.chatId = ensureChatId(body.chatId);
    }
    if (body.projectIds !== undefined) {
      schedule.projectIds = parseProjectIds(body.projectIds);
    }
    if (body.enabled !== undefined) {
      schedule.enabled = ensureBoolean(body.enabled, schedule.enabled);
      requiresRecalculate = true;
    }
    if (body.format !== undefined) {
      schedule.format = parseFormat(body.format);
    }
    if (body.metadata !== undefined) {
      schedule.metadata = parseMetadata(body.metadata);
    }

    schedule.updatedAt = new Date().toISOString();
    if (requiresRecalculate) {
      schedule.nextRunAt = calculateNextRunAt(schedule);
    } else if (!schedule.nextRunAt) {
      schedule.nextRunAt = calculateNextRunAt(schedule);
    }

    schedules[index] = schedule;
    await saveReportSchedules(bindings, schedules);
    const payload: ApiSuccess<ReportScheduleRecord> = { ok: true, data: schedule };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 400 });
  }
};

export const handleReportSchedulesDelete = async (
  _request: Request,
  env: unknown,
  scheduleId: string,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const schedules = await listReportSchedules(bindings);
    const filtered = schedules.filter((entry) => entry.id !== scheduleId);
    if (filtered.length === schedules.length) {
      return jsonResponse({ ok: false, error: "Schedule not found" }, { status: 404 });
    }
    await saveReportSchedules(bindings, filtered);
    const payload: ApiSuccess<{ id: string }> = { ok: true, data: { id: scheduleId } };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 400 });
  }
};
