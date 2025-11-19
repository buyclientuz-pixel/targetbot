import { listProjects, type Project } from "../domain/projects";
import { ensureProjectSettings, type ProjectSettings } from "../domain/project-settings";
import type { KvClient } from "../infra/kv";
import {
  getReportScheduleState,
  markReportSlotDispatched,
} from "../domain/report-state";
import {
  loadProjectSummary,
  loadProjectCampaigns,
  mapCampaignRows,
  resolvePeriodRange,
  type CampaignRow,
  type PeriodRange,
} from "./project-insights";
import type { MetaSummaryMetrics } from "../domain/meta-summary";
import { dispatchProjectMessage } from "./project-messaging";
import { DataValidationError } from "../errors";
import { getAutoreportsRecord, type AutoreportsRecord } from "../domain/spec/autoreports";
import { requireProjectRecord, type ProjectRecord, type KpiType } from "../domain/spec/project";
import { maybeDispatchPaymentAlert } from "./payment-alerts";

const DEFAULT_AUTOREPORT_TIMEZONE = "Asia/Tashkent";
const SLOT_WINDOW_MS = 5 * 60 * 1000;
const REPORT_DAY_OFFSET_DAYS = 1;

const shiftDateByDays = (date: Date, days: number): Date => {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
};

type AutoGoalKey =
  | "leads"
  | "messages"
  | "traffic"
  | "purchases"
  | "add_to_cart"
  | "calls"
  | "registrations"
  | "engagement";

const GOAL_METADATA: Record<AutoGoalKey, { label: string; plural: string }> = {
  leads: { label: "Лиды", plural: "лидов" },
  messages: { label: "Сообщения", plural: "сообщений" },
  traffic: { label: "Клики", plural: "кликов" },
  purchases: { label: "Покупки", plural: "покупок" },
  add_to_cart: { label: "Корзина", plural: "добавлений" },
  calls: { label: "Звонки", plural: "звонков" },
  registrations: { label: "Подписки", plural: "подписок" },
  engagement: { label: "Вовлечённость", plural: "событий" },
};

const GOAL_KEYS = Object.keys(GOAL_METADATA) as AutoGoalKey[];
const PRIORITY_GOALS: AutoGoalKey[] = ["leads", "messages"];
const DEFAULT_AUTO_GOAL: AutoGoalKey = PRIORITY_GOALS[0] ?? "leads";

const KPI_GOAL_MAP: Record<KpiType, AutoGoalKey> = {
  LEAD: "leads",
  MESSAGE: "messages",
  CLICK: "traffic",
  VIEW: "engagement",
  PURCHASE: "purchases",
};

const OBJECTIVE_RULES: Array<{ match: (objective: string) => boolean; goal: AutoGoalKey }> = [
  { match: (objective) => objective.includes("LEAD") || objective.includes("FORM"), goal: "leads" },
  { match: (objective) => objective.includes("MESSAGE") || objective.includes("MESSENG"), goal: "messages" },
  { match: (objective) => objective.includes("TRAFFIC") || objective.includes("CLICK"), goal: "traffic" },
  { match: (objective) =>
      objective.includes("PURCHASE") ||
      objective.includes("CONVERSION") ||
      objective.includes("SALE"),
    goal: "purchases",
  },
  { match: (objective) => objective.includes("ADD_TO_CART") || objective.includes("CATALOG"), goal: "add_to_cart" },
  { match: (objective) => objective.includes("CALL"), goal: "calls" },
  { match: (objective) =>
      objective.includes("SUBSCRIBE") ||
      objective.includes("REGISTRATION") ||
      objective.includes("QUESTION"),
    goal: "registrations",
  },
  {
    match: (objective) =>
      objective.includes("ENGAGEMENT") ||
      objective.includes("AWARENESS") ||
      objective.includes("REACH") ||
      objective.includes("VIDEO"),
    goal: "engagement",
  },
];

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

const formatPercent = (value: number | null): string => {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `${value.toFixed(value >= 1 ? 1 : 2)}%`;
};

const computeCostPerResult = (spend: number, result: number): number | null => {
  if (result <= 0) {
    return null;
  }
  return spend / result;
};

const computeCtr = (metrics?: MetaSummaryMetrics): number | null => {
  if (!metrics || metrics.impressions <= 0) {
    return null;
  }
  return (metrics.clicks / metrics.impressions) * 100;
};

const formatReportDate = (date: Date, timezone: string): string => {
  const dateFormatter = new Intl.DateTimeFormat("ru-RU", { timeZone: timezone, day: "2-digit", month: "2-digit" });
  const dayLabel = dateFormatter.format(date);
  const weekday = new Intl.DateTimeFormat("ru-RU", { timeZone: timezone, weekday: "short" })
    .format(date)
    .replace(".", "")
    .trim();
  return `${dayLabel} [${weekday}]`;
};

const formatManualSlotLabel = (date: Date, timezone: string): string => {
  const timeLabel = new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `ручной запуск ${timeLabel}`;
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

const resolveTimezoneContext = (
  now: Date,
  timezone: string,
): { year: number; month: number; day: number; offsetMs: number } => {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const parts = formatter.formatToParts(now);
    const pick = (type: Intl.DateTimeFormatPartTypes): string | null =>
      parts.find((part) => part.type === type)?.value ?? null;
    const year = pick("year");
    const month = pick("month");
    const day = pick("day");
    const hour = pick("hour") ?? "00";
    const minute = pick("minute") ?? "00";
    const second = pick("second") ?? "00";
    if (!year || !month || !day) {
      throw new Error("missing date parts");
    }
    const isoLocal = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    const timezoneDate = new Date(`${isoLocal}Z`);
    if (Number.isNaN(timezoneDate.getTime())) {
      throw new Error("invalid timezone date");
    }
    return {
      year: Number.parseInt(year, 10),
      month: Number.parseInt(month, 10),
      day: Number.parseInt(day, 10),
      offsetMs: timezoneDate.getTime() - now.getTime(),
    };
  } catch {
    return {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      day: now.getUTCDate(),
      offsetMs: 0,
    };
  }
};

const isSlotDue = (
  slot: string,
  now: Date,
  lastSentAt: string | null,
  timezone: string,
): { due: boolean; scheduledAt: Date | null } => {
  const parsed = parseSlot(slot);
  if (!parsed) {
    return { due: false, scheduledAt: null };
  }

  const tzContext = resolveTimezoneContext(now, timezone);
  const scheduledTimestamp = Date.UTC(
    tzContext.year,
    tzContext.month - 1,
    tzContext.day,
    parsed.hours,
    parsed.minutes,
    0,
    0,
  );
  if (Number.isNaN(scheduledTimestamp)) {
    return { due: false, scheduledAt: null };
  }
  const scheduled = new Date(scheduledTimestamp - tzContext.offsetMs);

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

const mapKpiTypeToGoal = (type?: KpiType): AutoGoalKey => {
  if (!type) {
    return "leads";
  }
  return KPI_GOAL_MAP[type] ?? "leads";
};

const isTrafficGoal = (goal: AutoGoalKey): boolean => goal === "traffic";

const detectGoalFromObjective = (objective?: string | null): AutoGoalKey | null => {
  if (!objective) {
    return null;
  }
  const upper = objective.toUpperCase();
  for (const rule of OBJECTIVE_RULES) {
    if (rule.match(upper)) {
      return rule.goal;
    }
  }
  return null;
};

const getGoalMetadata = (goal: AutoGoalKey): { label: string; plural: string } => GOAL_METADATA[goal];

const getRowMetricValue = (row: CampaignRow, goal: AutoGoalKey): number => {
  switch (goal) {
    case "messages":
      return row.messages;
    case "traffic":
      return row.clicks;
    case "purchases":
      return row.purchases;
    case "add_to_cart":
      return row.addToCart;
    case "calls":
      return row.calls;
    case "registrations":
      return row.registrations;
    case "engagement":
      return row.engagement;
    case "leads":
    default:
      return row.leads;
  }
};

const getSummaryMetricValue = (metrics: MetaSummaryMetrics | undefined, goal: AutoGoalKey): number => {
  if (!metrics) {
    return 0;
  }
  switch (goal) {
    case "messages":
      return metrics.messages;
    case "traffic":
      return metrics.clicks;
    case "purchases":
      return metrics.purchases;
    case "add_to_cart":
      return metrics.addToCart;
    case "calls":
      return metrics.calls;
    case "registrations":
      return metrics.registrations;
    case "engagement":
      return metrics.engagement;
    case "leads":
    default:
      return metrics.leads;
  }
};

const sumGoalMetrics = (rows: CampaignRow[]): Map<AutoGoalKey, number> => {
  const totals = new Map<AutoGoalKey, number>();
  for (const goal of GOAL_KEYS) {
    totals.set(goal, 0);
  }
  for (const row of rows) {
    for (const goal of GOAL_KEYS) {
      const next = (totals.get(goal) ?? 0) + getRowMetricValue(row, goal);
      totals.set(goal, next);
    }
  }
  return totals;
};

const pickFirstNonZeroGoal = (totals: Map<AutoGoalKey, number>, order: AutoGoalKey[]): AutoGoalKey | null => {
  for (const goal of order) {
    if ((totals.get(goal) ?? 0) > 0) {
      return goal;
    }
  }
  return null;
};

const pickGoalFromSummary = (metrics?: MetaSummaryMetrics): AutoGoalKey | null => {
  if (!metrics) {
    return null;
  }
  for (const goal of PRIORITY_GOALS) {
    if (getSummaryMetricValue(metrics, goal) > 0) {
      return goal;
    }
  }
  return null;
};

const determinePrimaryGoal = (
  rows: CampaignRow[],
  summary: MetaSummaryMetrics | undefined,
  options: { defaultGoal: AutoGoalKey; fallbackGoal: AutoGoalKey },
): AutoGoalKey => {
  const summaryGoal = pickGoalFromSummary(summary);
  if (summaryGoal) {
    return summaryGoal;
  }

  if (rows.length === 0) {
    return options.defaultGoal ?? options.fallbackGoal;
  }

  const metricTotals = sumGoalMetrics(rows);
  const preferredGoal = pickFirstNonZeroGoal(metricTotals, PRIORITY_GOALS);
  if (preferredGoal) {
    return preferredGoal;
  }

  const detectedTotals = new Map<AutoGoalKey, number>();
  for (const row of rows) {
    const detected = detectGoalFromObjective(row.objective) ?? options.fallbackGoal;
    const value = getRowMetricValue(row, detected);
    detectedTotals.set(detected, (detectedTotals.get(detected) ?? 0) + value);
  }

  let bestGoal: AutoGoalKey = options.fallbackGoal;
  let bestValue = detectedTotals.get(bestGoal) ?? 0;
  for (const goal of GOAL_KEYS) {
    const total = detectedTotals.get(goal) ?? 0;
    if (total > bestValue) {
      bestGoal = goal;
      bestValue = total;
    }
  }

  if (bestValue > 0 && !isTrafficGoal(bestGoal)) {
    return bestGoal;
  }

  const fallbackGoal = pickFirstNonZeroGoal(
    metricTotals,
    GOAL_KEYS.filter((goal) => !isTrafficGoal(goal)),
  );
  return fallbackGoal ?? options.defaultGoal ?? options.fallbackGoal;
};

const DEFAULT_METRICS: MetaSummaryMetrics = {
  spend: 0,
  impressions: 0,
  clicks: 0,
  leads: 0,
  messages: 0,
  purchases: 0,
  addToCart: 0,
  calls: 0,
  registrations: 0,
  engagement: 0,
  leadsToday: 0,
  leadsTotal: 0,
  cpa: null,
  spendToday: 0,
  cpaToday: null,
};

const getMetricsOrDefault = (metrics?: MetaSummaryMetrics): MetaSummaryMetrics => metrics ?? DEFAULT_METRICS;

const describeTrend = (current: number, previous: number): string => {
  if (previous <= 0 && current <= 0) {
    return "—";
  }
  if (previous <= 0 && current > 0) {
    return "⬆️ рост (не было данных позавчера)";
  }
  if (previous > 0) {
    const delta = ((current - previous) / previous) * 100;
    if (Math.abs(delta) < 5) {
      return "≈ без изменений";
    }
    const arrow = delta > 0 ? "⬆️" : "⬇️";
    const formatted = delta > 0 ? `+${delta.toFixed(0)}` : delta.toFixed(0);
    return `${arrow} ${formatted}% к позавчера`;
  }
  return "—";
};

const buildFindings = (options: {
  goalLabel: string;
  goalPlural: string;
  currency: string;
  targetCpl: number | null;
  reportMetrics: MetaSummaryMetrics;
  previousMetrics: MetaSummaryMetrics;
  reportValue: number;
  previousValue: number;
  reportCost: number | null;
  previousCost: number | null;
}) => {
  const findings: string[] = [];
  const reportSpend = options.reportMetrics.spend;
  const previousSpend = options.previousMetrics.spend;
  if (
    options.targetCpl != null &&
    options.reportCost != null &&
    options.reportCost > options.targetCpl * 1.2
  ) {
    findings.push(
      `❗ Стоимость результата ${formatCurrency(options.reportCost, options.currency)} за вчера выше цели ${formatCurrency(options.targetCpl, options.currency)}.`,
    );
  }
  const ctrReport = computeCtr(options.reportMetrics);
  const ctrPrevious = computeCtr(options.previousMetrics);
  if (ctrReport != null && ctrReport < 0.5) {
    findings.push(`⚠️ CTR ${formatPercent(ctrReport)} вчера слишком низкий — обновите креативы.`);
  }
  if (
    ctrReport != null &&
    ctrPrevious != null &&
    ctrPrevious > 0 &&
    ctrReport < ctrPrevious * 0.7
  ) {
    const drop = ((ctrReport - ctrPrevious) / ctrPrevious) * 100;
    findings.push(`⚠️ CTR упал на ${Math.abs(drop).toFixed(0)}% к позавчера.`);
  }
  if (options.previousValue > 0) {
    const diff = ((options.reportValue - options.previousValue) / options.previousValue) * 100;
    if (diff <= -30) {
      findings.push(`⚠️ ${options.goalLabel} снизились на ${Math.abs(diff).toFixed(0)}%.`);
    }
  } else if (options.reportValue === 0 && options.previousValue > 0) {
    findings.push(`⚠️ Нет ${options.goalPlural} вчера — проверьте кампании.`);
  }
  if (reportSpend > previousSpend && options.reportValue <= options.previousValue) {
    findings.push("⚠️ Расход растёт без роста результатов.");
  }
  if (
    options.reportCost != null &&
    options.previousCost != null &&
    options.reportCost > options.previousCost * 1.3
  ) {
    findings.push("⚠️ CPA вырос по сравнению с позавчерашним днём.");
  }
  if (findings.length === 0) {
    return "🟢 Всё стабильно, держим курс.";
  }
  return findings.join("\n");
};

const formatTopCampaigns = (
  rows: CampaignRow[],
  goal: AutoGoalKey,
  currency: string,
): string[] => {
  if (rows.length === 0) {
    return ["Данных по кампаниям нет."];
  }
  const sorted = [...rows].sort((a, b) => {
    const aValue = getRowMetricValue(a, goal);
    const bValue = getRowMetricValue(b, goal);
    if (bValue === aValue) {
      return b.spend - a.spend;
    }
    return bValue - aValue;
  });
  const top = sorted.slice(0, 3);
  return top.map((row, index) => {
    const value = getRowMetricValue(row, goal);
    const cost = computeCostPerResult(row.spend, value);
    const humanValue = value > 0 ? `${formatNumber(value)} ${getGoalMetadata(goal).plural}` : "нет данных";
    const costLabel = cost != null ? formatCurrency(cost, currency) : formatCurrency(row.spend, currency);
    return `${index + 1}) ${escapeHtml(row.name)} — ${humanValue} (${costLabel})`;
  });
};

const BASE_PERIODS: string[] = ["today", "yesterday", "week", "month"];

const collectPeriodKeys = (mode: string, now: Date): string[] => {
  const keys = new Set<string>(BASE_PERIODS);
  for (const key of resolvePeriodKeys(mode, now)) {
    keys.add(key);
  }
  return Array.from(keys);
};

const resolveTopPeriod = (mode: string): string => {
  switch (mode) {
    case "yesterday":
      return "yesterday";
    case "week":
      return "week";
    case "month":
      return "month";
    default:
      return "today";
  }
};

const resolvePeriodKeys = (mode: string, now: Date): string[] => {
  const normalised = mode === "yesterday_plus_week" ? "yesterday+week" : mode;
  if (normalised === "yesterday+week") {
    if (now.getUTCDay() === 1) {
      return ["yesterday", "week"];
    }
    return ["yesterday"];
  }
  const canonical = normalised === "max" ? "all" : normalised;
  switch (canonical) {
    case "today":
    case "yesterday":
    case "week":
    case "month":
    case "all":
      return [canonical];
    default:
      return ["yesterday"];
  }
};

interface AutoreportProfile {
  enabled: boolean;
  slots: string[];
  mode: string;
  recipients: { chat: boolean; admin: boolean };
}

interface AutoreportProfileResult {
  profile: AutoreportProfile;
  record: AutoreportsRecord | null;
}

const resolveAutoreportProfile = async (
  kv: KvClient,
  projectId: string,
  settings: ProjectSettings,
): Promise<AutoreportProfileResult> => {
  const record = await getAutoreportsRecord(kv, projectId);
  if (!record) {
    return {
      record: null,
      profile: {
        enabled: settings.reports.autoReportsEnabled,
        slots: [...settings.reports.timeSlots],
        mode: settings.reports.mode,
        recipients: { chat: true, admin: false },
      },
    };
  }
  return {
    record,
    profile: {
      enabled: record.enabled,
      slots: record.enabled && record.time ? [record.time] : [],
      mode: record.mode,
      recipients: { chat: record.sendToChat, admin: record.sendToAdmin },
    },
  };
};

const periodLabel = (key: string): string => {
  switch (key) {
    case "today":
      return "Вчера";
    case "yesterday":
      return "Позавчера";
    case "week":
      return "Неделя";
    case "month":
      return "Месяц";
    case "all":
    case "max":
      return "Весь период";
    default:
      return key;
  }
};

const buildReportMessage = (options: {
  project: Project;
  projectRecord: ProjectRecord;
  settings: ProjectSettings;
  slot: string;
  reportDate: Date;
  metricsByPeriod: Map<string, MetaSummaryMetrics>;
  goal: AutoGoalKey;
  campaigns: CampaignRow[];
  topPeriod: string;
  includeFindings?: boolean;
}): string => {
  const {
    project,
    projectRecord,
    settings,
    slot,
    reportDate,
    metricsByPeriod,
    goal,
    campaigns,
    topPeriod,
    includeFindings = true,
  } = options;
  const goalMeta = getGoalMetadata(goal);
  const currency = settings.billing.currency;
  const reportMetrics = getMetricsOrDefault(metricsByPeriod.get("today"));
  const previousMetrics = getMetricsOrDefault(metricsByPeriod.get("yesterday"));
  const weekMetrics = getMetricsOrDefault(metricsByPeriod.get("week"));
  const monthMetrics = getMetricsOrDefault(metricsByPeriod.get("month"));
  const reportValue = getSummaryMetricValue(reportMetrics, goal);
  const previousValue = getSummaryMetricValue(previousMetrics, goal);
  const weekValue = getSummaryMetricValue(weekMetrics, goal);
  const monthValue = getSummaryMetricValue(monthMetrics, goal);
  const reportCost = computeCostPerResult(reportMetrics.spend, reportValue);
  const previousCost = computeCostPerResult(previousMetrics.spend, previousValue);
  const ctrReport = computeCtr(reportMetrics);
  const reportDateLabel = formatReportDate(reportDate, projectRecord.settings.timezone ?? DEFAULT_AUTOREPORT_TIMEZONE);
  const topCampaignLines = formatTopCampaigns(campaigns, goal, currency);
  const findings = includeFindings
    ? buildFindings({
        goalLabel: goalMeta.label,
        goalPlural: goalMeta.plural,
        currency,
        targetCpl: settings.kpi.targetCpl ?? null,
        reportMetrics,
        previousMetrics,
        reportValue,
        previousValue,
        reportCost,
        previousCost,
      })
    : null;

  const lines: string[] = [];
  lines.push(`📊 Отчёт | ${reportDateLabel}`);
  lines.push(`Проект: ${escapeHtml(project.name)}`);
  lines.push(`Цель: ${goalMeta.label}`);
  lines.push(`Слот: ${slot}`);
  lines.push(`Период топа: ${periodLabel(topPeriod)}`);
  lines.push("──────────");
  lines.push("Топ кампании:");
  lines.push(...topCampaignLines);
  lines.push("──────────");
  lines.push(
    `Вчера: ${formatNumber(reportValue)} ${goalMeta.plural} · расход ${formatCurrency(
      reportMetrics.spend,
      currency,
    )} · цена ${formatOptionalCurrency(reportCost, currency)}`,
  );
  lines.push(
    `Позавчера: ${formatNumber(previousValue)} ${goalMeta.plural} · цена ${formatOptionalCurrency(
      previousCost,
      currency,
    )}`,
  );
  lines.push(`Неделя: ${formatNumber(weekValue)} ${goalMeta.plural}`);
  lines.push(`Месяц: ${formatNumber(monthValue)} ${goalMeta.plural}`);
  lines.push(`CTR вчера: ${formatPercent(ctrReport)}`);
  lines.push(`Динамика: ${describeTrend(reportValue, previousValue)}`);
  if (includeFindings && findings) {
    lines.push("");
    lines.push(`Вывод: ${findings}`);
  }
  if (projectRecord.portalUrl && projectRecord.portalUrl.trim().length > 0) {
    lines.push("------");
    lines.push("👇 Для просмотра всех кампаний");
  }
  return lines.join("\n").trimEnd();
};

const loadMetricsForPeriods = async (
  kv: KvClient,
  projectId: string,
  periods: string[],
  initial?: { project: Project; settings: ProjectSettings },
  options?: { periodRanges?: Map<string, PeriodRange> },
): Promise<{ project: Project; settings: ProjectSettings; metrics: Map<string, MetaSummaryMetrics> }> => {
  const metrics = new Map<string, MetaSummaryMetrics>();
  let context = initial;

  for (const period of periods) {
    const periodRange = options?.periodRanges?.get(period);
    const result = await loadProjectSummary(kv, projectId, period, {
      project: context?.project,
      settings: context?.settings,
      periodRange,
    });
    context = { project: result.project, settings: result.settings };
    metrics.set(period, result.entry.payload.metrics);
  }

  if (!context) {
    throw new Error("Failed to load project summary for auto-report");
  }

  return { project: context.project, settings: context.settings, metrics };
};

interface AutoReportTemplate {
  project: Project;
  projectRecord: ProjectRecord;
  settings: ProjectSettings;
  metricsByPeriod: Map<string, MetaSummaryMetrics>;
  goal: AutoGoalKey;
  campaigns: CampaignRow[];
  topPeriod: string;
  reportDate: Date;
  replyMarkup?: { inline_keyboard: Array<Array<{ text: string; url: string }>> };
}

const loadAutoReportTemplate = async (options: {
  kv: KvClient;
  projectId: string;
  projectRecord: ProjectRecord;
  mode: string;
  now: Date;
  project?: Project;
  settings?: ProjectSettings;
}): Promise<AutoReportTemplate> => {
  const { kv, projectId, projectRecord, mode, now, project, settings } = options;
  const periodKeys = collectPeriodKeys(mode, now);
  const initialContext = project && settings ? { project, settings } : undefined;
  const timezone = projectRecord.settings.timezone ?? DEFAULT_AUTOREPORT_TIMEZONE;
  const reportDate = shiftDateByDays(now, -REPORT_DAY_OFFSET_DAYS);
  const periodRanges = new Map<string, PeriodRange>();
  for (const period of periodKeys) {
    periodRanges.set(period, resolvePeriodRange(period, timezone, { now: reportDate }));
  }
  const metricsContext = await loadMetricsForPeriods(kv, projectId, periodKeys, initialContext, {
    periodRanges,
  });
  const topPeriod = resolveTopPeriod(mode);

  let campaigns: CampaignRow[] = [];
  try {
    const campaignsResult = await loadProjectCampaigns(kv, projectId, topPeriod, {
      project: metricsContext.project,
      settings: metricsContext.settings,
      periodRange: periodRanges.get(topPeriod),
    });
    campaigns = mapCampaignRows(campaignsResult.entry.payload);
  } catch (error) {
    if (!(error instanceof DataValidationError)) {
      throw error;
    }
  }

  const kpiSettings = projectRecord.settings.kpi;
  const manualGoal = mapKpiTypeToGoal(kpiSettings.type);
  const topPeriodMetrics = metricsContext.metrics.get(topPeriod);
  const goal =
    kpiSettings.mode === "manual"
      ? manualGoal
      : determinePrimaryGoal(campaigns, topPeriodMetrics, {
          defaultGoal: DEFAULT_AUTO_GOAL,
          fallbackGoal: manualGoal,
        });
  const replyMarkup =
    projectRecord.portalUrl && projectRecord.portalUrl.trim().length > 0
      ? { inline_keyboard: [[{ text: "Открыть портал", url: projectRecord.portalUrl }]] }
      : undefined;

  return {
    project: metricsContext.project,
    projectRecord,
    settings: metricsContext.settings,
    metricsByPeriod: metricsContext.metrics,
    goal,
    campaigns,
    topPeriod,
    reportDate,
    replyMarkup,
  };
};

const renderAutoReportMessage = (
  template: AutoReportTemplate,
  slot: string,
  options?: { includeFindings?: boolean },
): string =>
  buildReportMessage({
    project: template.project,
    projectRecord: template.projectRecord,
    settings: template.settings,
    slot,
    reportDate: template.reportDate,
    metricsByPeriod: template.metricsByPeriod,
    goal: template.goal,
    campaigns: template.campaigns,
    topPeriod: template.topPeriod,
    includeFindings: options?.includeFindings ?? true,
  });

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
      const projectRecord = await requireProjectRecord(kv, project.id);
      const { profile, record: autoreportsRecord } = await resolveAutoreportProfile(kv, project.id, settings);
      await maybeDispatchPaymentAlert({
        kv,
        token,
        project,
        settings,
        autoreports: autoreportsRecord,
        now,
      });
      if (!profile.enabled || profile.slots.length === 0) {
        continue;
      }

      const state = await getReportScheduleState(kv, project.id);
      const dueSlots: Array<{ slot: string; scheduledAt: Date }> = [];
      for (const slot of profile.slots) {
        const { due, scheduledAt } = isSlotDue(
          slot,
          now,
          state.slots[slot] ?? null,
          projectRecord.settings.timezone ?? DEFAULT_AUTOREPORT_TIMEZONE,
        );
        if (due && scheduledAt) {
          dueSlots.push({ slot, scheduledAt });
        }
      }

      if (dueSlots.length === 0) {
        continue;
      }

      const hasRecipients = profile.recipients.chat || profile.recipients.admin;
      if (!hasRecipients) {
        for (const { slot, scheduledAt } of dueSlots) {
          await markReportSlotDispatched(kv, project.id, slot, scheduledAt.toISOString());
        }
        continue;
      }

      let template: AutoReportTemplate;
      try {
        template = await loadAutoReportTemplate({
          kv,
          projectId: project.id,
          projectRecord,
          mode: profile.mode,
          now,
          project,
          settings,
        });
      } catch (error) {
        if (error instanceof DataValidationError) {
          continue;
        }
        throw error;
      }

      const timezone = projectRecord.settings.timezone ?? DEFAULT_AUTOREPORT_TIMEZONE;
      for (const { slot, scheduledAt } of dueSlots) {
        if (profile.recipients.chat) {
          const chatMessage = renderAutoReportMessage(template, `${slot} (${timezone})`, {
            includeFindings: false,
          });
          const result = await dispatchProjectMessage({
            kv,
            token,
            project: template.project,
            settings: template.settings,
            text: chatMessage,
            parseMode: "HTML",
            route: "CHAT",
            replyMarkup: template.replyMarkup,
          });
          template.settings = result.settings;
        }
        if (profile.recipients.admin) {
          const adminMessage = renderAutoReportMessage(template, `${slot} (${timezone})`, {
            includeFindings: true,
          });
          const result = await dispatchProjectMessage({
            kv,
            token,
            project: template.project,
            settings: template.settings,
            text: adminMessage,
            parseMode: "HTML",
            route: "ADMIN",
            replyMarkup: template.replyMarkup,
          });
          template.settings = result.settings;
        }
        await markReportSlotDispatched(kv, project.id, slot, scheduledAt.toISOString());
      }
    } catch (error) {
      console.error("auto-report failure", { projectId: project.id, error });
    }
  }
};

export const sendAutoReportNow = async (
  kv: KvClient,
  token: string | undefined,
  projectId: string,
  now = new Date(),
): Promise<void> => {
  if (!token) {
    throw new Error("Telegram token is required to send auto-reports");
  }
  const projectRecord = await requireProjectRecord(kv, projectId);
  const settings = await ensureProjectSettings(kv, projectId);
  const { profile } = await resolveAutoreportProfile(kv, projectId, settings);
  if (!profile.recipients.chat && !profile.recipients.admin) {
    return;
  }

  const template = await loadAutoReportTemplate({
    kv,
    projectId,
    projectRecord,
    mode: profile.mode,
    now,
  });
  const timezone = projectRecord.settings.timezone ?? DEFAULT_AUTOREPORT_TIMEZONE;
  const slotLabel = formatManualSlotLabel(now, timezone);
  if (profile.recipients.chat) {
    const chatMessage = renderAutoReportMessage(template, slotLabel, { includeFindings: false });
    const result = await dispatchProjectMessage({
      kv,
      token,
      project: template.project,
      settings: template.settings,
      text: chatMessage,
      parseMode: "HTML",
      route: "CHAT",
      replyMarkup: template.replyMarkup,
    });
    template.settings = result.settings;
  }
  if (profile.recipients.admin) {
    const adminMessage = renderAutoReportMessage(template, slotLabel, { includeFindings: true });
    const result = await dispatchProjectMessage({
      kv,
      token,
      project: template.project,
      settings: template.settings,
      text: adminMessage,
      parseMode: "HTML",
      route: "ADMIN",
      replyMarkup: template.replyMarkup,
    });
    template.settings = result.settings;
  }
};
