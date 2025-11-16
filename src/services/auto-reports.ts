import { listProjects, type Project } from "../domain/projects";
import { ensureProjectSettings, type ProjectSettings } from "../domain/project-settings";
import type { KvClient } from "../infra/kv";
import {
  getReportScheduleState,
  markReportSlotDispatched,
} from "../domain/report-state";
import { loadProjectSummary, loadProjectCampaigns, mapCampaignRows, type CampaignRow } from "./project-insights";
import type { MetaSummaryMetrics } from "../domain/meta-summary";
import { dispatchProjectMessage } from "./project-messaging";
import { DataValidationError } from "../errors";
import { getAutoreportsRecord, type AutoreportsRecord } from "../domain/spec/autoreports";
import { requireProjectRecord, type ProjectRecord, type KpiType } from "../domain/spec/project";

const SLOT_WINDOW_MS = 5 * 60 * 1000;

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

const mapKpiTypeToGoal = (type?: KpiType): AutoGoalKey => {
  if (!type) {
    return "leads";
  }
  return KPI_GOAL_MAP[type] ?? "leads";
};

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

const determinePrimaryGoal = (rows: CampaignRow[], fallback: AutoGoalKey): AutoGoalKey => {
  if (rows.length === 0) {
    return fallback;
  }
  const totals = new Map<AutoGoalKey, number>();
  for (const row of rows) {
    const detected = detectGoalFromObjective(row.objective) ?? fallback;
    const value = getRowMetricValue(row, detected);
    totals.set(detected, (totals.get(detected) ?? 0) + value);
  }
  let bestGoal: AutoGoalKey = fallback;
  let bestValue = totals.get(bestGoal) ?? 0;
  for (const goal of Object.keys(GOAL_METADATA) as AutoGoalKey[]) {
    const total = totals.get(goal) ?? 0;
    if (total > bestValue) {
      bestGoal = goal;
      bestValue = total;
    }
  }
  if (bestValue === 0) {
    for (const goal of Object.keys(GOAL_METADATA) as AutoGoalKey[]) {
      const total = rows.reduce((acc, row) => acc + getRowMetricValue(row, goal), 0);
      if (total > 0) {
        return goal;
      }
    }
    return fallback;
  }
  return bestGoal;
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
    return "⬆️ рост (не было данных вчера)";
  }
  if (previous > 0) {
    const delta = ((current - previous) / previous) * 100;
    if (Math.abs(delta) < 5) {
      return "≈ без изменений";
    }
    const arrow = delta > 0 ? "⬆️" : "⬇️";
    const formatted = delta > 0 ? `+${delta.toFixed(0)}` : delta.toFixed(0);
    return `${arrow} ${formatted}% к вчера`;
  }
  return "—";
};

const buildFindings = (options: {
  goalLabel: string;
  goalPlural: string;
  currency: string;
  targetCpl: number | null;
  todayMetrics: MetaSummaryMetrics;
  yesterdayMetrics: MetaSummaryMetrics;
  todayValue: number;
  yesterdayValue: number;
  todayCost: number | null;
  yesterdayCost: number | null;
}) => {
  const findings: string[] = [];
  const todaySpend = options.todayMetrics.spend;
  const yesterdaySpend = options.yesterdayMetrics.spend;
  if (
    options.targetCpl != null &&
    options.todayCost != null &&
    options.todayCost > options.targetCpl * 1.2
  ) {
    findings.push(
      `❗ Стоимость результата ${formatCurrency(options.todayCost, options.currency)} выше цели ${formatCurrency(options.targetCpl, options.currency)}.`,
    );
  }
  const ctrToday = computeCtr(options.todayMetrics);
  const ctrYesterday = computeCtr(options.yesterdayMetrics);
  if (ctrToday != null && ctrToday < 0.5) {
    findings.push(`⚠️ CTR ${formatPercent(ctrToday)} слишком низкий — обновите креативы.`);
  }
  if (
    ctrToday != null &&
    ctrYesterday != null &&
    ctrYesterday > 0 &&
    ctrToday < ctrYesterday * 0.7
  ) {
    const drop = ((ctrToday - ctrYesterday) / ctrYesterday) * 100;
    findings.push(`⚠️ CTR упал на ${Math.abs(drop).toFixed(0)}% к вчера.`);
  }
  if (options.yesterdayValue > 0) {
    const diff = ((options.todayValue - options.yesterdayValue) / options.yesterdayValue) * 100;
    if (diff <= -30) {
      findings.push(`⚠️ ${options.goalLabel} снизились на ${Math.abs(diff).toFixed(0)}%.`);
    }
  } else if (options.todayValue === 0 && options.yesterdayValue > 0) {
    findings.push(`⚠️ Нет ${options.goalPlural} сегодня — проверьте кампании.`);
  }
  if (todaySpend > yesterdaySpend && options.todayValue <= options.yesterdayValue) {
    findings.push("⚠️ Расход растёт без роста результатов.");
  }
  if (
    options.todayCost != null &&
    options.yesterdayCost != null &&
    options.todayCost > options.yesterdayCost * 1.3
  ) {
    findings.push("⚠️ CPA вырос по сравнению со вчерашним днём.");
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
  switch (normalised) {
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

const mapAutoreportRoute = (
  sendTo: AutoreportsRecord["sendTo"],
): ProjectSettings["alerts"]["route"] => {
  switch (sendTo) {
    case "chat":
      return "CHAT";
    case "admin":
      return "ADMIN";
    case "both":
    default:
      return "BOTH";
  }
};

const resolveAutoreportProfile = async (
  kv: KvClient,
  projectId: string,
  settings: ProjectSettings,
): Promise<{ enabled: boolean; slots: string[]; mode: string; route: ProjectSettings["alerts"]["route"] }> => {
  const record = await getAutoreportsRecord(kv, projectId);
  if (!record) {
    return {
      enabled: settings.reports.autoReportsEnabled,
      slots: [...settings.reports.timeSlots],
      mode: settings.reports.mode,
      route: settings.alerts.route,
    };
  }
  return {
    enabled: record.enabled,
    slots: record.enabled && record.time ? [record.time] : [],
    mode: record.mode,
    route: mapAutoreportRoute(record.sendTo),
  };
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

const buildReportMessage = (options: {
  project: Project;
  projectRecord: ProjectRecord;
  settings: ProjectSettings;
  slot: string;
  now: Date;
  metricsByPeriod: Map<string, MetaSummaryMetrics>;
  goal: AutoGoalKey;
  campaigns: CampaignRow[];
  topPeriod: string;
}): string => {
  const { project, projectRecord, settings, slot, now, metricsByPeriod, goal, campaigns, topPeriod } = options;
  const goalMeta = getGoalMetadata(goal);
  const currency = settings.billing.currency;
  const todayMetrics = getMetricsOrDefault(metricsByPeriod.get("today"));
  const yesterdayMetrics = getMetricsOrDefault(metricsByPeriod.get("yesterday"));
  const weekMetrics = getMetricsOrDefault(metricsByPeriod.get("week"));
  const monthMetrics = getMetricsOrDefault(metricsByPeriod.get("month"));
  const todayValue = getSummaryMetricValue(todayMetrics, goal);
  const yesterdayValue = getSummaryMetricValue(yesterdayMetrics, goal);
  const weekValue = getSummaryMetricValue(weekMetrics, goal);
  const monthValue = getSummaryMetricValue(monthMetrics, goal);
  const todayCost = computeCostPerResult(todayMetrics.spend, todayValue);
  const yesterdayCost = computeCostPerResult(yesterdayMetrics.spend, yesterdayValue);
  const ctrToday = computeCtr(todayMetrics);
  const reportDate = formatReportDate(now, projectRecord.settings.timezone ?? "UTC");
  const topCampaignLines = formatTopCampaigns(campaigns, goal, currency);
  const findings = buildFindings({
    goalLabel: goalMeta.label,
    goalPlural: goalMeta.plural,
    currency,
    targetCpl: settings.kpi.targetCpl ?? null,
    todayMetrics,
    yesterdayMetrics,
    todayValue,
    yesterdayValue,
    todayCost,
    yesterdayCost,
  });

  const lines: string[] = [];
  lines.push(`📊 Отчёт | ${reportDate}`);
  lines.push(`Проект: ${escapeHtml(project.name)}`);
  lines.push(`Цель: ${goalMeta.label}`);
  lines.push(`Слот: ${slot} (UTC)`);
  lines.push(`Период топа: ${periodLabel(topPeriod)}`);
  lines.push("──────────");
  lines.push("Топ кампании:");
  lines.push(...topCampaignLines);
  lines.push("──────────");
  lines.push(
    `Сегодня: ${formatNumber(todayValue)} ${goalMeta.plural} · расход ${formatCurrency(
      todayMetrics.spend,
      currency,
    )} · цена ${formatOptionalCurrency(todayCost, currency)}`,
  );
  lines.push(
    `Вчера: ${formatNumber(yesterdayValue)} ${goalMeta.plural} · цена ${formatOptionalCurrency(
      yesterdayCost,
      currency,
    )}`,
  );
  lines.push(`Неделя: ${formatNumber(weekValue)} ${goalMeta.plural}`);
  lines.push(`Месяц: ${formatNumber(monthValue)} ${goalMeta.plural}`);
  lines.push(`CTR сегодня: ${formatPercent(ctrToday)}`);
  lines.push(`Динамика: ${describeTrend(todayValue, yesterdayValue)}`);
  lines.push("");
  lines.push(`Вывод: ${findings}`);
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
      const projectRecord = await requireProjectRecord(kv, project.id);
      const profile = await resolveAutoreportProfile(kv, project.id, settings);
      if (!profile.enabled || profile.slots.length === 0 || profile.route === "NONE") {
        continue;
      }

      const state = await getReportScheduleState(kv, project.id);
      const dueSlots: Array<{ slot: string; scheduledAt: Date }> = [];
      for (const slot of profile.slots) {
        const { due, scheduledAt } = isSlotDue(slot, now, state.slots[slot] ?? null);
        if (due && scheduledAt) {
          dueSlots.push({ slot, scheduledAt });
        }
      }

      if (dueSlots.length === 0) {
        continue;
      }

      const periodKeys = collectPeriodKeys(profile.mode, now);
      let metricsContext;
      try {
        metricsContext = await loadMetricsForPeriods(kv, project.id, periodKeys);
      } catch (error) {
        if (error instanceof DataValidationError) {
          continue;
        }
        throw error;
      }

      const topPeriod = resolveTopPeriod(profile.mode);
      let campaigns: CampaignRow[] = [];
      try {
        const campaignsResult = await loadProjectCampaigns(kv, project.id, topPeriod, {
          project: metricsContext.project,
          settings: metricsContext.settings,
        });
        campaigns = mapCampaignRows(campaignsResult.entry.payload);
      } catch (error) {
        if (!(error instanceof DataValidationError)) {
          throw error;
        }
      }

      const fallbackGoal = mapKpiTypeToGoal(projectRecord.settings.kpi.type);
      const goal = determinePrimaryGoal(campaigns, fallbackGoal);
      const replyMarkup =
        projectRecord.portalUrl && projectRecord.portalUrl.trim().length > 0
          ? { inline_keyboard: [[{ text: "Открыть портал", url: projectRecord.portalUrl }]] }
          : undefined;

      for (const { slot } of dueSlots) {
        const message = buildReportMessage(
          {
            project: metricsContext.project,
            projectRecord,
            settings: metricsContext.settings,
            slot,
            now,
            metricsByPeriod: metricsContext.metrics,
            goal,
            campaigns,
            topPeriod,
          },
        );
        const result = await dispatchProjectMessage({
          kv,
          token,
          project: metricsContext.project,
          settings: metricsContext.settings,
          text: message,
          parseMode: "HTML",
          route: profile.route,
          replyMarkup,
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
