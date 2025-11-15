import {
  EnvBindings,
  listProjects,
  listReportDeliveries,
  listReportSchedules,
  saveReportDeliveries,
  saveReportSchedules,
} from "./storage";
import { generateReport } from "./reports";
import { createSlaReport } from "./sla";
import { createId } from "./ids";
import { ProjectRecord, ReportDeliveryRecord, ReportScheduleRecord } from "../types";
import { sendTelegramMessage, TelegramEnv } from "./telegram";
import { escapeHtml } from "./html";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const parseTimeOfDay = (value: string): { hours: number; minutes: number } => {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return { hours: 9, minutes: 0 };
  }
  const hours = Math.min(23, Math.max(0, Number(match[1])));
  const minutes = Math.min(59, Math.max(0, Number(match[2])));
  return { hours, minutes };
};

const parseTimezoneOffset = (value?: string): number => {
  if (!value) {
    return 0;
  }
  if (/^(Z|UTC)$/i.test(value)) {
    return 0;
  }
  const match = value.trim().match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) {
    console.warn("Unsupported timezone offset", value);
    return 0;
  }
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = match[3] ? Number(match[3]) : 0;
  return sign * (hours * 60 + minutes);
};

const normalizeWeekdays = (weekdays?: number[]): number[] => {
  if (!weekdays || !weekdays.length) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  const set = new Set<number>();
  weekdays.forEach((day) => {
    if (Number.isFinite(day)) {
      const normalized = Math.max(0, Math.min(6, Math.floor(day)));
      set.add(normalized);
    }
  });
  return Array.from(set).sort((a, b) => a - b);
};

export const calculateNextRunAt = (schedule: ReportScheduleRecord, now = new Date()): string => {
  const offset = parseTimezoneOffset(schedule.timezone);
  const time = parseTimeOfDay(schedule.time);
  const localNow = new Date(now.getTime() + offset * MINUTE_MS);
  const baseLocal = new Date(
    Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate(), time.hours, time.minutes),
  );
  let candidate = new Date(baseLocal.getTime() - offset * MINUTE_MS);

  if (schedule.frequency === "weekly") {
    const weekdays = normalizeWeekdays(schedule.weekdays);
    const startDay = localNow.getUTCDay();
    let selected: Date | null = null;
    for (let i = 0; i <= 7; i += 1) {
      const dayIndex = (startDay + i) % 7;
      if (!weekdays.includes(dayIndex)) {
        continue;
      }
      const localTarget = new Date(baseLocal.getTime() + i * DAY_MS);
      const target = new Date(localTarget.getTime() - offset * MINUTE_MS);
      if (target.getTime() <= now.getTime()) {
        continue;
      }
      selected = target;
      break;
    }
    if (!selected) {
      const firstDay = weekdays[0];
      let delta = (7 - startDay + firstDay) % 7;
      if (delta <= 0) {
        delta += 7;
      }
      const localTarget = new Date(baseLocal.getTime() + delta * DAY_MS);
      selected = new Date(localTarget.getTime() - offset * MINUTE_MS);
    }
    return selected.toISOString();
  }

  if (candidate.getTime() <= now.getTime()) {
    const nextLocal = new Date(baseLocal.getTime() + DAY_MS);
    candidate = new Date(nextLocal.getTime() - offset * MINUTE_MS);
  }
  return candidate.toISOString();
};

const resolveReportLink = (env: Record<string, unknown>, reportId: string): string => {
  const base =
    typeof env.PUBLIC_WEB_URL === "string"
      ? env.PUBLIC_WEB_URL
      : typeof env.PUBLIC_BASE_URL === "string"
        ? env.PUBLIC_BASE_URL
        : typeof env.WORKER_BASE_URL === "string"
          ? env.WORKER_BASE_URL
          : typeof env.ADMIN_BASE_URL === "string"
            ? env.ADMIN_BASE_URL
            : null;
  if (base) {
    const normalized = base.endsWith("/") ? base.slice(0, -1) : base;
    return `${normalized}/api/reports/${reportId}/content`;
  }
  return `/api/reports/${reportId}/content`;
};

export interface ReportScheduleRunResult {
  totalSchedules: number;
  triggered: number;
  slaReports: number;
  errors: number;
}

export const runReportSchedules = async (
  env: (EnvBindings & TelegramEnv & Record<string, unknown>),
): Promise<ReportScheduleRunResult> => {
  const now = new Date();
  const nowMs = now.getTime();
  const schedules = await listReportSchedules(env);
  if (!schedules.length) {
    return { totalSchedules: 0, triggered: 0, slaReports: 0, errors: 0 };
  }
  const projects: ProjectRecord[] = await listProjects(env).catch(() => [] as ProjectRecord[]);
  const threadIndex = new Map<string, number>();
  projects.forEach((project) => {
    const chatId = typeof project.telegramChatId === "string" ? project.telegramChatId.trim() : "";
    if (chatId && typeof project.telegramThreadId === "number") {
      threadIndex.set(chatId, project.telegramThreadId);
    }
  });
  let changed = false;
  const deliveries = await listReportDeliveries(env).catch(() => [] as ReportDeliveryRecord[]);
  const nextDeliveries = [...deliveries];

  let triggered = 0;
  let slaReports = 0;
  let errors = 0;

  for (const schedule of schedules) {
    if (!schedule.enabled) {
      if (!schedule.nextRunAt) {
        schedule.nextRunAt = calculateNextRunAt(schedule, now);
        changed = true;
      }
      continue;
    }
    let nextAt = schedule.nextRunAt ? Date.parse(schedule.nextRunAt) : Number.NaN;
    if (Number.isNaN(nextAt)) {
      schedule.nextRunAt = calculateNextRunAt(schedule, now);
      nextAt = Date.parse(schedule.nextRunAt);
      changed = true;
    }
    if (Number.isNaN(nextAt) || nextAt > nowMs) {
      continue;
    }

    try {
      let reportId: string | undefined;
      let message: string;

      if (schedule.type === "sla") {
        const result = await createSlaReport(env, {
          projectIds: schedule.projectIds,
          title: schedule.title,
          triggeredBy: `schedule:${schedule.id}`,
          channel: "telegram",
          scheduleId: schedule.id,
        });
        message = `${escapeHtml(result.text)}\n\nID отчёта: <code>${escapeHtml(result.record.id)}</code>`;
        reportId = result.record.id;
        slaReports += 1;
      } else {
        const reportType = schedule.type === "detailed" ? "detailed" : schedule.type === "finance" ? "finance" : "summary";
        const result = await generateReport(env, {
          type: reportType,
          projectIds: schedule.projectIds.length ? schedule.projectIds : undefined,
          title: schedule.title,
          channel: "telegram",
          triggeredBy: `schedule:${schedule.id}`,
          command: `schedule:${schedule.type}`,
          format: schedule.format === "csv" ? "csv" : "text",
        });
        message = `${escapeHtml(result.text)}\n\nID отчёта: <code>${escapeHtml(result.record.id)}</code>`;
        reportId = result.record.id;
      }

      const rawChatId =
        typeof schedule.chatId === "number" && Number.isFinite(schedule.chatId)
          ? String(schedule.chatId)
          : String(schedule.chatId ?? "");
      const chatId = rawChatId.trim();
      if (!chatId) {
        throw new Error(`Schedule ${schedule.id} is missing chatId`);
      }
      const threadId = threadIndex.get(chatId);
      if (threadId === undefined && schedule.projectIds.length) {
        console.warn("Schedule thread missing", schedule.id, chatId, schedule.projectIds);
      }

      await sendTelegramMessage(env, {
        chatId,
        threadId,
        text: message,
      });

      triggered += 1;
      schedule.lastRunAt = now.toISOString();
      schedule.lastStatus = "success";
      schedule.lastError = null;
      schedule.nextRunAt = calculateNextRunAt(schedule, new Date(nowMs + MINUTE_MS));
      changed = true;

      nextDeliveries.unshift({
        id: createId(),
        scheduleId: schedule.id,
        reportId,
        type: schedule.type,
        channel: "telegram",
        status: "success",
        deliveredAt: now.toISOString(),
        details: { chatId, projectIds: schedule.projectIds },
      });
    } catch (error) {
      errors += 1;
      schedule.lastRunAt = now.toISOString();
      schedule.lastStatus = "error";
      schedule.lastError = (error as Error).message;
      schedule.nextRunAt = calculateNextRunAt(schedule, new Date(nowMs + MINUTE_MS));
      changed = true;
      nextDeliveries.unshift({
        id: createId(),
        scheduleId: schedule.id,
        type: schedule.type,
        channel: "telegram",
        status: "error",
        deliveredAt: now.toISOString(),
        error: (error as Error).message,
      });
      console.error("report schedule error", schedule.id, error);
    }
  }

  if (changed) {
    await saveReportSchedules(env, schedules);
  }
  if (triggered || errors) {
    await saveReportDeliveries(env, nextDeliveries);
  }

  return { totalSchedules: schedules.length, triggered, slaReports, errors };
};
