import {
  EnvBindings,
  listMetaAccountLinks,
  loadMetaToken,
  loadProjectSettingsRecord,
  saveMetaAccountLinks,
  saveProjectSettingsRecord,
} from "./storage";
import { summarizeProjects } from "./projects";
import { fetchAdAccounts } from "./meta";
import { sendTelegramMessage, TelegramEnv } from "./telegram";
import { generateReport } from "./reports";
import { detectSpendAnomalies, mergeMetaAccountLinks } from "./meta-accounts";
import {
  MetaAccountLinkRecord,
  MetaAdAccount,
  MetaCampaign,
  ProjectAutoReportSettings,
  ProjectSettingsRecord,
  ProjectSummary,
  ReportRoutingTarget,
} from "../types";
import { escapeHtml } from "./html";

const MINUTE_MS = 60 * 1000;
const AUTO_WINDOW_MINUTES = 5;
const AUTO_COOLDOWN_MS = 4 * MINUTE_MS;
const PAUSE_THRESHOLD_MS = 2 * 60 * MINUTE_MS;

const ensureChatId = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
};

const parseTimeValue = (value: string): { minutes: number } | null => {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hours = Math.max(0, Math.min(23, Number(match[1])));
  const minutes = Math.max(0, Math.min(59, Number(match[2])));
  return { minutes: hours * 60 + minutes };
};

const minutesSinceMidnightUtc = (date: Date): number => {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
};

const isWithinWindow = (targetMinutes: number, nowMinutes: number): boolean => {
  return nowMinutes >= targetMinutes && nowMinutes < targetMinutes + AUTO_WINDOW_MINUTES;
};

const isCooldownActive = (lastSent: string | null | undefined, now: Date): boolean => {
  if (!lastSent) {
    return false;
  }
  const last = Date.parse(lastSent);
  if (Number.isNaN(last)) {
    return false;
  }
  return now.getTime() - last < AUTO_COOLDOWN_MS;
};

const shouldSendDaily = (
  settings: ProjectAutoReportSettings,
  now: Date,
): string | null => {
  if (!settings.enabled || !settings.times.length) {
    return null;
  }
  if (isCooldownActive(settings.lastSentDaily, now)) {
    return null;
  }
  const nowMinutes = minutesSinceMidnightUtc(now);
  for (const time of settings.times) {
    const parsed = parseTimeValue(time);
    if (!parsed) {
      continue;
    }
    if (isWithinWindow(parsed.minutes, nowMinutes)) {
      return time;
    }
  }
  return null;
};

const shouldSendMondayWeekly = (
  settings: ProjectAutoReportSettings,
  now: Date,
): string | null => {
  if (!settings.enabled || !settings.mondayDoubleReport) {
    return null;
  }
  if (now.getUTCDay() !== 1) {
    return null;
  }
  if (isCooldownActive(settings.lastSentMonday, now)) {
    return null;
  }
  const nowMinutes = minutesSinceMidnightUtc(now);
  for (const time of settings.times) {
    const parsed = parseTimeValue(time);
    if (!parsed) {
      continue;
    }
    if (isWithinWindow(parsed.minutes, nowMinutes)) {
      return time;
    }
  }
  return null;
};

export interface AutoReportTriggerEvaluation {
  daily?: string | null;
  weekly?: string | null;
}

export const evaluateAutoReportTrigger = (
  settings: ProjectAutoReportSettings,
  now: Date,
): AutoReportTriggerEvaluation => ({
  daily: shouldSendDaily(settings, now),
  weekly: shouldSendMondayWeekly(settings, now),
});

interface RoutingContext {
  adminChatId: string | null;
  clientChatId: string | null;
}

const resolveRoutingContext = (project: ProjectSummary): RoutingContext => {
  const adminChatId = ensureChatId(project.chatId);
  const clientChatId = ensureChatId(project.telegramChatId ?? project.chatId);
  return { adminChatId, clientChatId };
};

const collectTargets = (
  project: ProjectSummary,
  target: ReportRoutingTarget,
): string[] => {
  const { adminChatId, clientChatId } = resolveRoutingContext(project);
  const chats = new Set<string>();
  if (target === "admin" || target === "both") {
    if (adminChatId) {
      chats.add(adminChatId);
    }
  }
  if (target === "chat" || target === "both") {
    if (clientChatId) {
      chats.add(clientChatId);
    }
  }
  return Array.from(chats);
};

const sendMessageToTargets = async (
  env: TelegramEnv,
  chatIds: string[],
  text: string,
  replyMarkup?: unknown,
): Promise<number> => {
  await Promise.all(
    chatIds.map((chatId) =>
      sendTelegramMessage(env, {
        chatId,
        text,
        replyMarkup,
      }),
    ),
  );
  return chatIds.length;
};

const sendAutoReportForProject = async (
  env: EnvBindings & TelegramEnv & Record<string, unknown>,
  project: ProjectSummary,
  settings: ProjectSettingsRecord,
  datePreset: string,
  now: Date,
  fallbackReason?: string | null,
): Promise<{ delivered: number; fallback: boolean; reportId?: string }> => {
  const targets = collectTargets(project, settings.autoReport.sendTarget);
  if (!targets.length) {
    return { delivered: 0, fallback: false };
  }

  const baseOptions = {
    type: "summary" as const,
    projectIds: [project.id],
    includeMeta: true,
    channel: "telegram" as const,
    triggeredBy: "auto-engine",
    command: "schedule:auto", // reuse label for tracking
    datePreset,
  };

  if (fallbackReason) {
    try {
      const fallback = await generateReport(env, { ...baseOptions, includeMeta: false });
      const reason = `⚠️ ${fallbackReason}\n\n`;
      const message = `${reason}${fallback.html}\n\nID отчёта: <code>${escapeHtml(fallback.record.id)}</code>`;
      const delivered = await sendMessageToTargets(env, targets, message, {
        inline_keyboard: [[{ text: "⬇️ Скачать отчёт", callback_data: `report:download:${fallback.record.id}` }]],
      });
      return { delivered, fallback: true, reportId: fallback.record.id };
    } catch (error) {
      console.error("Fallback report generation failed", project.id, error);
      return { delivered: 0, fallback: true };
    }
  }

  try {
    const result = await generateReport(env, baseOptions);
    const message = `${result.html}\n\nID отчёта: <code>${escapeHtml(result.record.id)}</code>`;
    const delivered = await sendMessageToTargets(env, targets, message, {
      inline_keyboard: [[{ text: "⬇️ Скачать отчёт", callback_data: `report:download:${result.record.id}` }]],
    });
    return { delivered, fallback: false, reportId: result.record.id };
  } catch (error) {
    console.warn("Auto report failed, switching to fallback", project.id, (error as Error).message);
    try {
      const fallback = await generateReport(env, { ...baseOptions, includeMeta: false });
      const message = `⚠️ Meta API недоступен.\n\n${fallback.html}\n\nID отчёта: <code>${escapeHtml(fallback.record.id)}</code>`;
      const delivered = await sendMessageToTargets(env, targets, message, {
        inline_keyboard: [[{ text: "⬇️ Скачать отчёт", callback_data: `report:download:${fallback.record.id}` }]],
      });
      return { delivered, fallback: true, reportId: fallback.record.id };
    } catch (fallbackError) {
      console.error("Fallback report generation failed", project.id, fallbackError);
      return { delivered: 0, fallback: true };
    }
  }
};

const detectPausedCampaigns = (
  accounts: MetaAdAccount[] | null,
  now: Date,
): Map<string, MetaCampaign[]> => {
  const result = new Map<string, MetaCampaign[]>();
  if (!accounts?.length) {
    return result;
  }
  const nowMs = now.getTime();
  for (const account of accounts) {
    if (!account.campaigns?.length) {
      continue;
    }
    const paused = account.campaigns.filter((campaign) => {
      const status = (campaign.effectiveStatus || campaign.status || "").toUpperCase();
      if (!status || (status !== "PAUSED" && status !== "INACTIVE" && status !== "ARCHIVED")) {
        return false;
      }
      if (!campaign.updatedTime) {
        return false;
      }
      const updated = Date.parse(campaign.updatedTime);
      if (Number.isNaN(updated)) {
        return false;
      }
      return nowMs - updated > PAUSE_THRESHOLD_MS;
    });
    if (paused.length) {
      result.set(account.id, paused);
    }
  }
  return result;
};

const formatCampaignList = (campaigns: MetaCampaign[]): string => {
  return campaigns
    .map((campaign) => `• ${escapeHtml(campaign.name)} (${campaign.id})`)
    .slice(0, 10)
    .join("\n");
};

export interface AutoReportEngineStats {
  processed: number;
  reportsSent: number;
  weeklyReports: number;
  alertsSent: number;
  errors: number;
  metaStatus: "ok" | "missing" | "error";
}

export const runAutoReportEngine = async (
  env: (EnvBindings & TelegramEnv & Record<string, unknown>),
): Promise<AutoReportEngineStats> => {
  const now = new Date();
  const stats: AutoReportEngineStats = {
    processed: 0,
    reportsSent: 0,
    weeklyReports: 0,
    alertsSent: 0,
    errors: 0,
    metaStatus: "ok",
  };

  const [projects, storedAccounts, token] = await Promise.all([
    summarizeProjects(env).catch(() => [] as ProjectSummary[]),
    listMetaAccountLinks(env).catch(() => [] as MetaAccountLinkRecord[]),
    loadMetaToken(env).catch(() => null),
  ]);

  let fetchedAccounts: MetaAdAccount[] | null = null;
  let metaError: string | null = null;

  if (!token || token.status !== "valid") {
    stats.metaStatus = "missing";
    metaError = "Meta OAuth не настроен";
  } else {
    try {
      fetchedAccounts = await fetchAdAccounts(env, token, {
        includeSpend: true,
        includeCampaigns: true,
        campaignsLimit: 25,
        datePreset: "today",
      });
    } catch (error) {
      stats.metaStatus = "error";
      metaError = (error as Error).message || "Meta API недоступен";
    }
  }

  const { records: mergedAccounts, changed } = mergeMetaAccountLinks(storedAccounts, fetchedAccounts);
  if (changed) {
    await saveMetaAccountLinks(env, mergedAccounts);
  }

  const anomalies = detectSpendAnomalies(storedAccounts, fetchedAccounts);
  const pausedCampaigns = detectPausedCampaigns(fetchedAccounts, now);
  const accountByProject = new Map<string, MetaAccountLinkRecord>();
  const accountDetails = new Map<string, MetaAdAccount>();

  for (const record of mergedAccounts) {
    if (record.linkedProjectId) {
      accountByProject.set(record.linkedProjectId, record);
    }
    const detail = fetchedAccounts?.find((acc) => acc.id === record.accountId);
    if (detail) {
      accountDetails.set(record.accountId, detail);
    }
  }

  for (const project of projects) {
    stats.processed += 1;
    const settings = await loadProjectSettingsRecord(env, project.id);
    const draft: ProjectSettingsRecord = JSON.parse(JSON.stringify(settings));
    let settingsChanged = false;

    const linkedAccount = accountByProject.get(project.id);
    const accountDetail = linkedAccount ? accountDetails.get(linkedAccount.accountId) ?? null : null;

    const routing = collectTargets(project, draft.alerts.target);

    const billingStatus = project.billing?.status ?? "missing";
    const billingDate = project.nextPaymentDate ?? null;

    if (draft.billing.status !== billingStatus) {
      draft.billing.status = billingStatus;
      settingsChanged = true;
    }
    if (draft.billing.nextPaymentDate !== billingDate) {
      draft.billing.nextPaymentDate = billingDate;
      settingsChanged = true;
    }

    draft.autoReport.alertsTarget = draft.alerts.target;

    const evaluation = evaluateAutoReportTrigger(draft.autoReport, now);

    if (evaluation.daily) {
      const sendResult = await sendAutoReportForProject(env, project, draft, "today", now, metaError);
      if (sendResult.delivered > 0) {
        draft.autoReport.lastSentDaily = now.toISOString();
        settingsChanged = true;
        stats.reportsSent += sendResult.delivered;
      }
    }

    if (evaluation.weekly) {
      const sendResult = await sendAutoReportForProject(env, project, draft, "last_7d", now, metaError);
      if (sendResult.delivered > 0) {
        draft.autoReport.lastSentMonday = now.toISOString();
        settingsChanged = true;
        stats.weeklyReports += sendResult.delivered;
      }
    }

    const needsBillingAlert =
      draft.alerts.payment && (billingStatus === "overdue" || billingStatus === "cancelled");
    if (needsBillingAlert && routing.length) {
      const previousStatus = settings.billing.status;
      if (previousStatus !== billingStatus) {
        const text = `‼️ Проблема оплаты Meta\nСтатус: ${escapeHtml(billingStatus)}`;
        stats.alertsSent += await sendMessageToTargets(env, routing, text);
      }
    }

    if (linkedAccount) {
      const anomaly = anomalies.get(linkedAccount.accountId);
      if (anomaly && draft.alerts.budget && routing.length) {
        const currency = anomaly.currency ?? "USD";
        const text =
          `⚠️ Аномальный расход\nСегодня: ${anomaly.current.toFixed(2)} ${currency} ` +
          `(↑${anomaly.percent.toFixed(0)}% к прошлому замеру)`;
        stats.alertsSent += await sendMessageToTargets(env, routing, text);
      }
    }

    let nextMetaStatus: ProjectSettingsRecord["meta"]["status"] = linkedAccount
      ? pausedCampaigns.has(linkedAccount.accountId)
        ? "paused"
        : "ok"
      : "missing";
    if (metaError) {
      nextMetaStatus = stats.metaStatus === "missing" ? "missing" : "error";
    }

    if (draft.meta.adAccountId !== (linkedAccount?.accountId ?? project.metaAccountId ?? "")) {
      draft.meta.adAccountId = linkedAccount?.accountId ?? project.metaAccountId ?? "";
      settingsChanged = true;
    }
    if (draft.meta.name !== (linkedAccount?.accountName ?? project.metaAccountName)) {
      draft.meta.name = linkedAccount?.accountName ?? project.metaAccountName;
      settingsChanged = true;
    }
    if (draft.meta.currency !== (linkedAccount?.currency ?? accountDetail?.currency ?? "USD")) {
      draft.meta.currency = linkedAccount?.currency ?? accountDetail?.currency ?? "USD";
      settingsChanged = true;
    }
    if (draft.meta.status !== nextMetaStatus) {
      draft.meta.status = nextMetaStatus;
      settingsChanged = true;
      if (nextMetaStatus === "error" && draft.alerts.metaApi && routing.length && settings.meta.status !== "error") {
        const text = `⚠️ Ошибка Meta API — ${escapeHtml(metaError || "неизвестная ошибка")}`;
        stats.alertsSent += await sendMessageToTargets(env, routing, text);
      }
      if (nextMetaStatus === "missing" && draft.alerts.metaApi && routing.length && settings.meta.status !== "missing") {
        const text = `⚠️ Meta OAuth не настроен`;
        stats.alertsSent += await sendMessageToTargets(env, routing, text);
      }
      if (nextMetaStatus === "paused" && draft.alerts.pause && routing.length) {
        const paused = linkedAccount ? pausedCampaigns.get(linkedAccount.accountId) ?? [] : [];
        if (paused.length) {
          const body = formatCampaignList(paused);
          const text = `🚸 Кампании на паузе >2ч\n${body}`;
          stats.alertsSent += await sendMessageToTargets(env, routing, text);
        }
      }
    }

    if (settingsChanged) {
      try {
        await saveProjectSettingsRecord(env, project.id, draft);
      } catch (error) {
        console.error("Failed to persist project settings", project.id, error);
        stats.errors += 1;
      }
    }
  }

  return stats;
};
