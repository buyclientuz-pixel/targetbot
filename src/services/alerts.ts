import { listProjects, type Project } from "../domain/projects";
import { ensureProjectSettings, type ProjectSettings } from "../domain/project-settings";
import { getMetaToken } from "../domain/meta-tokens";
import type { KvClient } from "../infra/kv";
import {
  markAlertSent,
  getAlertState,
  shouldSendAlert,
} from "../domain/alert-state";
import { dispatchProjectMessage } from "./project-messaging";
import { loadProjectCampaignStatuses, type CampaignStatus } from "./project-insights";
import { DataValidationError, EntityNotFoundError } from "../errors";
import { getAlertsRecord, type AlertsRecord } from "../domain/spec/alerts";
import { getProjectLeadsList } from "../domain/spec/project-leads";
import type { R2Client } from "../infra/r2";

const DAY_MS = 24 * 60 * 60 * 1000;

const safeTimestamp = (value: string): number => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

interface AlertContext {
  kv: KvClient;
  token: string;
  project: Project;
  settings: ProjectSettings;
  now: Date;
}

interface AlertExecutionResult {
  settings: ProjectSettings;
  dispatched: boolean;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatCurrency = (value: number, currency: string): string => {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
};

const formatDate = (value: Date): string => {
  const day = `${value.getUTCDate()}`.padStart(2, "0");
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  const year = value.getUTCFullYear();
  return `${day}.${month}.${year}`;
};

const formatDuration = (diffMs: number): string => {
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${minutes} мин`;
  }
  if (minutes === 0) {
    return `${hours} ч`;
  }
  return `${hours} ч ${minutes} мин`;
};

const attemptAlert = async (
  context: AlertContext,
  type: "billing" | "budget" | "meta-api" | "pause" | "lead-queue",
  eventKey: string,
  windowMs: number,
  message: string,
  routeOverride?: ProjectSettings["alerts"]["route"],
): Promise<AlertExecutionResult> => {
  const state = await getAlertState(context.kv, context.project.id, type);
  if (!shouldSendAlert(state, eventKey, windowMs, context.now)) {
    return { settings: context.settings, dispatched: false };
  }

  const result = await dispatchProjectMessage({
    kv: context.kv,
    token: context.token,
    project: context.project,
    settings: context.settings,
    text: message,
    parseMode: "HTML",
    route: routeOverride,
  });

  await markAlertSent(
    context.kv,
    context.project.id,
    type,
    eventKey,
    context.now.toISOString(),
  );

  return { settings: result.settings, dispatched: result.delivered.chat || result.delivered.admin };
};

const parseNextPaymentDate = (value: string | null): Date | null => {
  if (!value) {
    return null;
  }
  const iso = value.includes("T") ? value : `${value}T00:00:00.000Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

const maybeSendBillingAlert = async (
  context: AlertContext,
  profile: AlertsProfile,
): Promise<AlertExecutionResult> => {
  const dueDate = parseNextPaymentDate(context.settings.billing.nextPaymentDate);
  if (!dueDate) {
    return { settings: context.settings, dispatched: false };
  }

  const diff = dueDate.getTime() - context.now.getTime();
  const tariff = context.settings.billing.tariff;
  const currency = context.settings.billing.currency;

  if (diff <= 0) {
    const overdueDays = Math.max(1, Math.ceil(Math.abs(diff) / DAY_MS));
    const message = [
      "⛔️ Оплата просрочена",
      `Проект: ${escapeHtml(context.project.name)}`,
      `Дата оплаты: ${formatDate(dueDate)} (просрок ${overdueDays} дн.)`,
      `Тариф: ${formatCurrency(tariff, currency)}`,
    ].join("\n");
    return attemptAlert(
      context,
      "billing",
      `overdue:${dueDate.toISOString()}`,
      12 * 60 * 60 * 1000,
      message,
      profile.route,
    );
  }

  const remainingDays = Math.max(1, Math.ceil(diff / DAY_MS));
  const thresholds = [...profile.paymentReminderDays].sort((a, b) => a - b);
  if (thresholds.some((days) => remainingDays <= days)) {
    const message = [
      "📄 Напоминание об оплате",
      `Проект: ${escapeHtml(context.project.name)}`,
      `Дата оплаты: ${formatDate(dueDate)} (через ${remainingDays} дн.)`,
      `Тариф: ${formatCurrency(tariff, currency)}`,
    ].join("\n");
    return attemptAlert(
      context,
      "billing",
      `due:${dueDate.toISOString()}`,
      DAY_MS,
      message,
      profile.route,
    );
  }

  return { settings: context.settings, dispatched: false };
};

const maybeSendMetaTokenAlert = async (
  context: AlertContext,
): Promise<AlertExecutionResult> => {
  const facebookUserId = context.settings.meta.facebookUserId;
  if (!facebookUserId) {
    return { settings: context.settings, dispatched: false };
  }

  try {
    const token = await getMetaToken(context.kv, facebookUserId);
    if (!token.expiresAt) {
      return { settings: context.settings, dispatched: false };
    }
    const expiresAt = new Date(token.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      return { settings: context.settings, dispatched: false };
    }

    const diff = expiresAt.getTime() - context.now.getTime();
    if (diff <= 0) {
      const message = [
        "⛔️ Meta токен истёк",
        `Проект: ${escapeHtml(context.project.name)}`,
        `Токен пользователя ${escapeHtml(facebookUserId)} недействителен с ${formatDate(expiresAt)}`,
      ].join("\n");
      return attemptAlert(
        context,
        "meta-api",
        `expired:${facebookUserId}`,
        6 * 60 * 60 * 1000,
        message,
      );
    }

    if (diff <= 3 * DAY_MS) {
      const remainingDays = Math.max(1, Math.ceil(diff / DAY_MS));
      const message = [
        "⚠️ Meta токен скоро истечёт",
        `Проект: ${escapeHtml(context.project.name)}`,
        `Токен пользователя ${escapeHtml(facebookUserId)} истечёт ${formatDate(expiresAt)} (через ${remainingDays} дн.)`,
      ].join("\n");
      return attemptAlert(
        context,
        "meta-api",
        `expiring:${facebookUserId}:${remainingDays}`,
        6 * 60 * 60 * 1000,
        message,
      );
    }
  } catch (error) {
    if (error instanceof EntityNotFoundError) {
      return { settings: context.settings, dispatched: false };
    }
    throw error;
  }

  return { settings: context.settings, dispatched: false };
};

const computeTargetDailyBudget = (settings: ProjectSettings): number | null => {
  if (settings.kpi.targetCpl == null || settings.kpi.targetLeadsPerDay == null) {
    return null;
  }
  return settings.kpi.targetCpl * settings.kpi.targetLeadsPerDay;
};

const isPausedStatus = (status: string | null): boolean => {
  if (!status) {
    return false;
  }
  const normalised = status.toUpperCase();
  if (normalised === "ARCHIVED") {
    return false;
  }
  return normalised.includes("PAUSED") || normalised === "INACTIVE";
};

const maybeSendBudgetAlert = async (
  context: AlertContext,
  campaigns: CampaignStatus[],
): Promise<AlertExecutionResult> => {
  const targetDaily = computeTargetDailyBudget(context.settings);
  const currency = context.settings.billing.currency;

  const issues = campaigns
    .map((campaign) => {
      if (isPausedStatus(campaign.effectiveStatus ?? campaign.status)) {
        return null;
      }
      if (!campaign.dailyBudget || campaign.dailyBudget <= 0) {
        return { campaign, reason: "не задан дневной бюджет" };
      }
      if (targetDaily != null && campaign.dailyBudget < targetDaily) {
        return {
          campaign,
          reason: `бюджет ${formatCurrency(campaign.dailyBudget, currency)} ниже KPI ${formatCurrency(targetDaily, currency)}`,
        };
      }
      return null;
    })
    .filter((issue): issue is { campaign: CampaignStatus; reason: string } => issue !== null);

  if (issues.length === 0) {
    return { settings: context.settings, dispatched: false };
  }

  const header = "⚠️ Бюджет кампаний ниже KPI";
  const lines = issues.map((issue) => `• ${escapeHtml(issue.campaign.name)} — ${escapeHtml(issue.reason)}`);
  if (targetDaily != null) {
    lines.push(`Целевой дневной бюджет: ${formatCurrency(targetDaily, currency)}`);
  }
  const message = [header, ...lines].join("\n");
  const eventKey = `budget:${issues
    .map((issue) => issue.campaign.id)
    .sort()
    .join("|")}`;
  return attemptAlert(context, "budget", eventKey, 6 * 60 * 60 * 1000, message);
};

const maybeSendPauseAlert = async (
  context: AlertContext,
  campaigns: CampaignStatus[],
  profile: AlertsProfile,
): Promise<AlertExecutionResult> => {
  const pauseThresholdMs = Math.max(1, profile.pauseThresholdHours) * 60 * 60 * 1000;
  const paused = campaigns.filter((campaign) => {
    if (!isPausedStatus(campaign.effectiveStatus ?? campaign.status)) {
      return false;
    }
    if (!campaign.updatedTime) {
      return true;
    }
    const updatedAt = new Date(campaign.updatedTime);
    if (Number.isNaN(updatedAt.getTime())) {
      return true;
    }
    return context.now.getTime() - updatedAt.getTime() >= pauseThresholdMs;
  });

  if (paused.length === 0) {
    return { settings: context.settings, dispatched: false };
  }

  const header =
    paused.length === campaigns.length
      ? "⛔️ Весь рекламный кабинет на паузе"
      : "⚠️ Кампании на паузе";
  const lines = paused.map((campaign) => {
    let duration = "дольше 2 часов";
    if (campaign.updatedTime) {
      const updatedAt = new Date(campaign.updatedTime);
      if (!Number.isNaN(updatedAt.getTime())) {
        duration = formatDuration(context.now.getTime() - updatedAt.getTime());
      }
    }
    return `• ${escapeHtml(campaign.name)} — пауза ${duration}`;
  });
  const message = [header, ...lines].join("\n");
  const eventKey = `pause:${paused
    .map((campaign) => campaign.id)
    .sort()
    .join("|")}`;
  return attemptAlert(context, "pause", eventKey, 6 * 60 * 60 * 1000, message, profile.route);
};

const formatDateTime = (value: Date): string => {
  const day = `${value.getUTCDate()}`.padStart(2, "0");
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  const year = value.getUTCFullYear();
  const hours = `${value.getUTCHours()}`.padStart(2, "0");
  const minutes = `${value.getUTCMinutes()}`.padStart(2, "0");
  return `${day}.${month}.${year}, ${hours}:${minutes}`;
};

const maybeSendLeadQueueAlert = async (
  context: AlertContext,
  r2: R2Client,
  profile: AlertsProfile,
): Promise<AlertExecutionResult> => {
  if (!profile.types.leadQueue) {
    return { settings: context.settings, dispatched: false };
  }
  const list = await getProjectLeadsList(r2, context.project.id);
  if (!list || list.leads.length === 0) {
    return { settings: context.settings, dispatched: false };
  }
  const threshold = context.now.getTime() - profile.leadQueueThresholdHours * 60 * 60 * 1000;
  const stale = list.leads
    .filter((lead) => lead.status === "new" && safeTimestamp(lead.createdAt) <= threshold)
    .sort((a, b) => safeTimestamp(a.createdAt) - safeTimestamp(b.createdAt));
  if (stale.length === 0) {
    return { settings: context.settings, dispatched: false };
  }
  const lead = stale[0]!;
  const createdAt = new Date(lead.createdAt);
  const waitMs = Math.max(0, context.now.getTime() - createdAt.getTime());
  const message = [
    "🔔 Лид ожидает ответа",
    `Имя: ${escapeHtml(lead.name)}`,
    `Телефон: ${escapeHtml(lead.phone)}`,
    `Получен: ${formatDateTime(createdAt)}`,
    `В ожидании: ${formatDuration(waitMs)}`,
    `Проект: ${escapeHtml(context.project.name)}`,
    "",
    "Откройте список лидов в боте, чтобы обновить статус.",
  ].join("\n");
  return attemptAlert(
    context,
    "lead-queue",
    `lead:${lead.id}`,
    profile.leadQueueThresholdHours * 60 * 60 * 1000,
    message,
    profile.route,
  );
};

interface AlertsProfile {
  enabled: boolean;
  route: ProjectSettings["alerts"]["route"];
  leadQueueThresholdHours: number;
  pauseThresholdHours: number;
  paymentReminderDays: number[];
  types: { leadQueue: boolean; pause: boolean; payment: boolean };
}

const mapAlertChannel = (channel: AlertsRecord["channel"]): ProjectSettings["alerts"]["route"] => {
  switch (channel) {
    case "chat":
      return "CHAT";
    case "admin":
      return "ADMIN";
    case "both":
      return "BOTH";
    default:
      return "CHAT";
  }
};

const buildAlertsProfile = (
  settings: ProjectSettings,
  record: AlertsRecord | null,
): AlertsProfile => {
  if (!record) {
    return {
      enabled: true,
      route: settings.alerts.route,
      leadQueueThresholdHours: 1,
      pauseThresholdHours: 24,
      paymentReminderDays: [7, 1],
      types: {
        leadQueue: settings.alerts.leadNotifications,
        pause: settings.alerts.pauseAlerts,
        payment: settings.alerts.billingAlerts,
      },
    };
  }
  return {
    enabled: record.enabled,
    route: mapAlertChannel(record.channel),
    leadQueueThresholdHours: record.leadQueueThresholdHours,
    pauseThresholdHours: record.pauseThresholdHours,
    paymentReminderDays: record.paymentReminderDays,
    types: {
      leadQueue: record.types.leadInQueue,
      pause: record.types.pause24h,
      payment: record.types.paymentReminder,
    },
  };
};

export const runAlerts = async (
  kv: KvClient,
  r2: R2Client,
  token: string | undefined,
  now = new Date(),
): Promise<void> => {
  if (!token) {
    return;
  }

  const projects = await listProjects(kv);
  for (const project of projects) {
    try {
      let settings = await ensureProjectSettings(kv, project.id);
      const alertsRecord = await getAlertsRecord(kv, project.id);
      const profile = buildAlertsProfile(settings, alertsRecord);
      settings = { ...settings, alerts: { ...settings.alerts, route: profile.route } };
      if (!profile.enabled || settings.alerts.route === "NONE") {
        continue;
      }

      const contextBase: Omit<AlertContext, "settings"> = { kv, token, project, now };

      if (profile.types.payment) {
        const result = await maybeSendBillingAlert({ ...contextBase, settings }, profile);
        settings = result.settings;
      }

      if (settings.alerts.metaApiAlerts) {
        const result = await maybeSendMetaTokenAlert({ ...contextBase, settings });
        settings = result.settings;
      }

      const leadQueueResult = await maybeSendLeadQueueAlert({ ...contextBase, settings }, r2, profile);
      settings = leadQueueResult.settings;

      let campaigns: CampaignStatus[] | null = null;
      if ((settings.alerts.budgetAlerts || profile.types.pause) && project.adsAccountId) {
        try {
          const response = await loadProjectCampaignStatuses(kv, project.id, { project, settings });
          campaigns = response.entry.payload.campaigns;
          settings = response.settings;
        } catch (error) {
          if (error instanceof DataValidationError || error instanceof EntityNotFoundError) {
            campaigns = null;
          } else {
            throw error;
          }
        }
      }

      if (campaigns && settings.alerts.budgetAlerts) {
        const result = await maybeSendBudgetAlert({ ...contextBase, settings }, campaigns);
        settings = result.settings;
      }

      if (campaigns && profile.types.pause) {
        const result = await maybeSendPauseAlert({ ...contextBase, settings }, campaigns, profile);
        settings = result.settings;
      }
    } catch (error) {
      console.error("alert dispatch failure", { projectId: project.id, error });
    }
  }
};
