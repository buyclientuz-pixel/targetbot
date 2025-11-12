import { ProjectCard, ProjectReport, ProjectAlertState } from "../types";
import { readJsonFromR2, writeJsonToR2, appendLogEntry } from "./r2";
import { sendTelegramMessage } from "./telegram";
import { formatCurrency } from "./format";

const ALERT_STATE_PREFIX = "meta/alerts/";

const getStateKey = (projectId: string): string => ALERT_STATE_PREFIX + projectId + ".json";

const loadState = async (env: unknown, projectId: string): Promise<ProjectAlertState> => {
  const existing = await readJsonFromR2<ProjectAlertState>(env as any, getStateKey(projectId));
  if (existing && typeof existing === "object") {
    return existing;
  }
  return {};
};

const saveState = async (env: unknown, projectId: string, state: ProjectAlertState): Promise<void> => {
  await writeJsonToR2(env as any, getStateKey(projectId), state);
};

const resolveChatId = (env: Record<string, unknown>, project: ProjectCard): string | null => {
  const alerts = project.alerts || null;
  const direct = alerts && alerts.chat_id ? String(alerts.chat_id) : null;
  if (direct) {
    return direct;
  }
  const admin = alerts && alerts.admin_chat_id ? String(alerts.admin_chat_id) : null;
  if (admin) {
    return admin;
  }
  if (typeof env.ALERT_CHAT_ID === "string" && env.ALERT_CHAT_ID) {
    return env.ALERT_CHAT_ID;
  }
  if (typeof env.ADMIN_CHAT_ID === "string" && env.ADMIN_CHAT_ID) {
    return env.ADMIN_CHAT_ID;
  }
  return null;
};

const portalUrl = (env: Record<string, unknown>, projectId: string): string => {
  const base = typeof env.WORKER_URL === "string" ? env.WORKER_URL : "";
  if (base) {
    const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
    return trimmed + "/portal/" + projectId;
  }
  return "/portal/" + projectId;
};

const sendAlert = async (
  env: Record<string, unknown>,
  chatId: string,
  message: string,
  logMessage: string,
): Promise<boolean> => {
  try {
    await sendTelegramMessage(env, chatId, message);
    await appendLogEntry(env as any, {
      level: "warn",
      message: logMessage,
      timestamp: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    await appendLogEntry(env as any, {
      level: "error",
      message: "Failed to deliver alert: " + (error as Error).message,
      timestamp: new Date().toISOString(),
    });
    return false;
  }
};

const normalizeThreshold = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const extractCpaThreshold = (project: ProjectCard): number | null => {
  const alerts = project.alerts || null;
  const fromAlerts = normalizeThreshold(alerts ? alerts.cpa_threshold : null);
  if (fromAlerts !== null) {
    return fromAlerts;
  }
  const kpi = project.kpi || null;
  const fromKpi = kpi ? normalizeThreshold(kpi.target_cpa) : null;
  return fromKpi;
};

const extractSpendLimit = (project: ProjectCard, report: ProjectReport): number | null => {
  const alerts = project.alerts || null;
  const fromAlerts = normalizeThreshold(alerts ? alerts.spend_limit : null);
  if (fromAlerts !== null) {
    return fromAlerts;
  }
  const billing = report.billing || project.billing;
  const fromBilling = billing ? normalizeThreshold(billing.spend_limit) : null;
  if (fromBilling !== null) {
    return fromBilling;
  }
  const kpi = project.kpi || null;
  return kpi ? normalizeThreshold(kpi.planned_spend) : null;
};

const getModerationThresholdHours = (project: ProjectCard): number => {
  const alerts = project.alerts || null;
  const configured = alerts && alerts.moderation_hours !== undefined ? Number(alerts.moderation_hours) : NaN;
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return 2;
};

const pickNewModeration = (
  campaigns: ProjectReport["campaigns"],
  thresholdHours: number,
): string[] => {
  const thresholdMs = thresholdHours * 60 * 60 * 1000;
  const now = Date.now();
  const overdue: string[] = [];
  for (const campaign of campaigns) {
    const status = campaign.status ? campaign.status.toUpperCase() : "";
    if (status !== "PENDING_REVIEW" && status !== "IN_REVIEW") {
      continue;
    }
    if (!campaign.status_updated_at) {
      continue;
    }
    const updated = new Date(campaign.status_updated_at).getTime();
    if (!Number.isFinite(updated)) {
      continue;
    }
    if (now - updated >= thresholdMs) {
      overdue.push(campaign.id);
    }
  }
  return overdue;
};

const buildModerationMessage = (
  project: ProjectCard,
  report: ProjectReport,
  overdueIds: string[],
  thresholdHours: number,
  env: Record<string, unknown>,
): string => {
  const lines: string[] = [];
  lines.push("⏱ Кампании на модерации более " + thresholdHours + " ч. для проекта " + report.project_name);
  for (const campaign of report.campaigns) {
    if (overdueIds.indexOf(campaign.id) === -1) {
      continue;
    }
    const row = "• " + campaign.name + " — статус " + campaign.status;
    lines.push(row);
  }
  lines.push("Портал: " + portalUrl(env, report.project_id));
  return lines.join("\n");
};

export const processAutoAlerts = async (
  env: unknown,
  project: ProjectCard,
  report: ProjectReport,
): Promise<void> => {
  const runtimeEnv = env as Record<string, unknown>;
  const chatId = resolveChatId(runtimeEnv, project);
  if (!chatId) {
    return;
  }

  const state = await loadState(env, project.id);
  const nextState: ProjectAlertState = {
    cpa_exceeded: state.cpa_exceeded || false,
    spend_exceeded: state.spend_exceeded || false,
    moderation_alerts: state.moderation_alerts ? state.moderation_alerts.slice() : [],
  };
  let stateChanged = false;

  const cpaThreshold = extractCpaThreshold(project);
  const currentCpa = normalizeThreshold(report.summary ? report.summary.cpa : null);
  if (cpaThreshold !== null && currentCpa !== null) {
    if (currentCpa > cpaThreshold) {
      if (!nextState.cpa_exceeded) {
        const message = "⚠️ CPA превышен для проекта " + report.project_name + "\n" +
          "Значение: " + formatCurrency(currentCpa, report.currency) + " при лимите " +
          formatCurrency(cpaThreshold, report.currency) + "\n" +
          "Портал: " + portalUrl(runtimeEnv, report.project_id);
        const delivered = await sendAlert(runtimeEnv, chatId, message, "CPA threshold exceeded for " + project.id);
        if (delivered) {
          nextState.cpa_exceeded = true;
          stateChanged = true;
        }
      }
    } else if (nextState.cpa_exceeded) {
      nextState.cpa_exceeded = false;
      stateChanged = true;
    }
  }

  const spendLimit = extractSpendLimit(project, report);
  const currentSpend = normalizeThreshold(report.summary ? report.summary.spend : null);
  if (spendLimit !== null && currentSpend !== null) {
    if (currentSpend > spendLimit) {
      if (!nextState.spend_exceeded) {
        const message = "⚠️ Расход превысил лимит для проекта " + report.project_name + "\n" +
          "Потрачено: " + formatCurrency(currentSpend, report.currency) + " при лимите " +
          formatCurrency(spendLimit, report.currency) + "\n" +
          "Портал: " + portalUrl(runtimeEnv, report.project_id);
        const delivered = await sendAlert(runtimeEnv, chatId, message, "Spend limit exceeded for " + project.id);
        if (delivered) {
          nextState.spend_exceeded = true;
          stateChanged = true;
        }
      }
    } else if (nextState.spend_exceeded) {
      nextState.spend_exceeded = false;
      stateChanged = true;
    }
  }

  const thresholdHours = getModerationThresholdHours(project);
  const overdue = pickNewModeration(report.campaigns, thresholdHours);
  const previous = nextState.moderation_alerts || [];
  const newOnes = overdue.filter((id) => previous.indexOf(id) === -1);
  let moderationSnapshot = previous.slice();
  if (newOnes.length > 0) {
    const message = buildModerationMessage(project, report, newOnes, thresholdHours, runtimeEnv);
    const delivered = await sendAlert(runtimeEnv, chatId, message, "Moderation delay alert for " + project.id);
    if (delivered) {
      moderationSnapshot = overdue;
    }
  } else {
    moderationSnapshot = overdue;
  }
  if (JSON.stringify(previous) !== JSON.stringify(moderationSnapshot)) {
    nextState.moderation_alerts = moderationSnapshot;
    stateChanged = true;
  }

  if (stateChanged) {
    nextState.updated_at = new Date().toISOString();
    await saveState(env, project.id, nextState);
  }
};
