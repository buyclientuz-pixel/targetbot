import { listProjects, type Project } from "../domain/projects";
import { ensureProjectSettings, type ProjectSettings } from "../domain/project-settings";
import type { KvClient } from "../infra/kv";
import {
  getReportScheduleState,
  markReportSlotDispatched,
} from "../domain/report-state";
import { loadProjectSummary } from "./project-insights";
import type { MetaSummaryMetrics } from "../domain/meta-summary";
import { dispatchProjectMessage } from "./project-messaging";
import { DataValidationError } from "../errors";

const SLOT_WINDOW_MS = 5 * 60 * 1000;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatCurrency = (value: number, currency: string, fractionDigits = 2): string => {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
};

const formatNumber = (value: number): string => {
  return new Intl.NumberFormat("ru-RU").format(value);
};

const formatOptionalCurrency = (value: number | null, currency: string): string => {
  if (value == null) {
    return "—";
  }
  return formatCurrency(value, currency);
};

const parseSlot = (slot: string): { hours: number; minutes: number } | null => {
  const match = /^([0-9]{1,2}):([0-9]{2})$/.exec(slot.trim());
  if (!match) {
    return null;
  }
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return { hours, minutes };
};

const isSlotDue = (
  slot: string,
  now: Date,
  lastSentAt: string | null,
): { due: boolean; scheduledAt: Date | null } => {
  const parsed = parseSlot(slot);
  if (!parsed) {
    return { due: false, scheduledAt: null };
  }

  const scheduled = new Date(now);
  scheduled.setUTCHours(parsed.hours, parsed.minutes, 0, 0);

  const diff = now.getTime() - scheduled.getTime();
  if (diff < 0 || diff > SLOT_WINDOW_MS) {
    return { due: false, scheduledAt: scheduled };
  }

  if (lastSentAt) {
    const lastSent = new Date(lastSentAt);
    if (!Number.isNaN(lastSent.getTime()) && lastSent.getTime() >= scheduled.getTime()) {
      return { due: false, scheduledAt: scheduled };
    }
  }

  return { due: true, scheduledAt: scheduled };
};

const resolvePeriodKeys = (mode: string, now: Date): string[] => {
  if (mode === "yesterday+week") {
    if (now.getUTCDay() === 1) {
      return ["yesterday", "week"];
    }
    return ["yesterday"];
  }
  switch (mode) {
    case "today":
    case "yesterday":
    case "week":
    case "month":
    case "max":
      return [mode];
    default:
      return ["yesterday"];
  }
};

const periodLabel = (key: string): string => {
  switch (key) {
    case "today":
      return "Сегодня";
    case "yesterday":
      return "Вчера";
    case "week":
      return "Неделя";
    case "month":
      return "Месяц";
    case "max":
      return "Весь период";
    default:
      return key;
  }
};

const buildReportMessage = (
  project: Project,
  settings: ProjectSettings,
  slot: string,
  metricsByPeriod: Map<string, MetaSummaryMetrics>,
): string => {
  const lines: string[] = [];
  lines.push(`📊 Автоотчёт — ${escapeHtml(project.name)}`);
  lines.push(`Слот: ${slot} (UTC)`);
  lines.push("");

  for (const [periodKey, metrics] of metricsByPeriod) {
    lines.push(`Период: ${periodLabel(periodKey)}`);
    lines.push(`Расход: ${formatCurrency(metrics.spend, settings.billing.currency)}`);
    lines.push(`Показы: ${formatNumber(metrics.impressions)}`);
    lines.push(`Клики: ${formatNumber(metrics.clicks)}`);
    lines.push(`Лиды: ${formatNumber(metrics.leads)}`);
    lines.push(`CPL: ${formatOptionalCurrency(metrics.cpa, settings.billing.currency)}`);
    lines.push(`CPA (сегодня): ${formatOptionalCurrency(metrics.cpaToday, settings.billing.currency)}`);
    lines.push(`Лиды сегодня: ${formatNumber(metrics.leadsToday)}`);
    lines.push(`Лиды всего: ${formatNumber(metrics.leadsTotal)}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
};

const loadMetricsForPeriods = async (
  kv: KvClient,
  projectId: string,
  periods: string[],
  initial?: { project: Project; settings: ProjectSettings },
): Promise<{ project: Project; settings: ProjectSettings; metrics: Map<string, MetaSummaryMetrics> }> => {
  const metrics = new Map<string, MetaSummaryMetrics>();
  let context = initial;

  for (const period of periods) {
    const result = await loadProjectSummary(kv, projectId, period, {
      project: context?.project,
      settings: context?.settings,
    });
    context = { project: result.project, settings: result.settings };
    metrics.set(period, result.entry.payload.metrics);
  }

  if (!context) {
    throw new Error("Failed to load project summary for auto-report");
  }

  return { project: context.project, settings: context.settings, metrics };
};

export const runAutoReports = async (
  kv: KvClient,
  token: string | undefined,
  now = new Date(),
): Promise<void> => {
  const projects = await listProjects(kv);
  if (!token || projects.length === 0) {
    return;
  }

  for (const project of projects) {
    try {
      const settings = await ensureProjectSettings(kv, project.id);
      if (!settings.reports.autoReportsEnabled || settings.alerts.route === "NONE") {
        continue;
      }

      const state = await getReportScheduleState(kv, project.id);
      const dueSlots: Array<{ slot: string; scheduledAt: Date }> = [];
      for (const slot of settings.reports.timeSlots) {
        const { due, scheduledAt } = isSlotDue(slot, now, state.slots[slot] ?? null);
        if (due && scheduledAt) {
          dueSlots.push({ slot, scheduledAt });
        }
      }

      if (dueSlots.length === 0) {
        continue;
      }

      const periodKeys = resolvePeriodKeys(settings.reports.mode, now);
      let metricsContext;
      try {
        metricsContext = await loadMetricsForPeriods(kv, project.id, periodKeys);
      } catch (error) {
        if (error instanceof DataValidationError) {
          continue;
        }
        throw error;
      }

      for (const { slot } of dueSlots) {
        const message = buildReportMessage(
          metricsContext.project,
          metricsContext.settings,
          slot,
          metricsContext.metrics,
        );
        const result = await dispatchProjectMessage({
          kv,
          token,
          project: metricsContext.project,
          settings: metricsContext.settings,
          text: message,
          parseMode: "HTML",
        });
        await markReportSlotDispatched(kv, project.id, slot, new Date().toISOString());

        metricsContext = {
          ...metricsContext,
          settings: result.settings,
        };
      }
    } catch (error) {
      console.error("auto-report failure", { projectId: project.id, error });
    }
  }
};
