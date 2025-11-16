import { KV_KEYS } from "../config/kv";
import type { KvClient } from "../infra/kv";
import { DataValidationError, EntityNotFoundError } from "../errors";
import {
  assertBoolean,
  assertIsoDate,
  assertNumber,
  assertOptionalNumber,
  assertOptionalString,
  assertString,
  assertStringArray,
} from "./validation";
import { getProjectRecord } from "./spec/project";
import { getBillingRecord } from "./spec/billing";
import { getAlertsRecord, type AlertsRecord } from "./spec/alerts";
import { getAutoreportsRecord } from "./spec/autoreports";

export type ProjectAlertRoute = "CHAT" | "ADMIN" | "BOTH" | "NONE";

export interface ProjectBillingSettings {
  tariff: number;
  currency: string;
  nextPaymentDate: string | null;
  autobillingEnabled: boolean;
}

export interface ProjectKpiSettings {
  targetCpl: number | null;
  targetLeadsPerDay: number | null;
}

export interface ProjectReportSettings {
  autoReportsEnabled: boolean;
  timeSlots: string[];
  mode: string;
}

export interface ProjectAlertSettings {
  leadNotifications: boolean;
  billingAlerts: boolean;
  budgetAlerts: boolean;
  metaApiAlerts: boolean;
  pauseAlerts: boolean;
  route: ProjectAlertRoute;
}

export interface ProjectMetaSettings {
  facebookUserId: string | null;
}

export interface ProjectSettings {
  projectId: string;
  chatId: number | null;
  topicId: number | null;
  portalEnabled: boolean;
  billing: ProjectBillingSettings;
  kpi: ProjectKpiSettings;
  reports: ProjectReportSettings;
  alerts: ProjectAlertSettings;
  meta: ProjectMetaSettings;
  createdAt: string;
  updatedAt: string;
}

const ALERT_ROUTES: ProjectAlertRoute[] = ["CHAT", "ADMIN", "BOTH", "NONE"];

const parseAlertRoute = (value: unknown, fallback: ProjectAlertRoute): ProjectAlertRoute => {
  if (value == null) {
    return fallback;
  }
  const str = assertString(value, "projectSettings.alerts.route");
  if (!ALERT_ROUTES.includes(str as ProjectAlertRoute)) {
    throw new DataValidationError(`Unsupported alert route '${str}'`);
  }
  return str as ProjectAlertRoute;
};

const parseBilling = (
  value: unknown,
  defaults: ProjectBillingSettings,
): ProjectBillingSettings => {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    tariff: assertNumber(record.tariff ?? defaults.tariff, "projectSettings.billing.tariff"),
    currency: assertString(record.currency ?? defaults.currency, "projectSettings.billing.currency"),
    nextPaymentDate: assertOptionalString(
      record.nextPaymentDate ?? defaults.nextPaymentDate,
      "projectSettings.billing.nextPaymentDate",
    ),
    autobillingEnabled: assertBoolean(
      record.autobillingEnabled ?? defaults.autobillingEnabled,
      "projectSettings.billing.autobillingEnabled",
    ),
  };
};

const parseKpi = (value: unknown, defaults: ProjectKpiSettings): ProjectKpiSettings => {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    targetCpl: assertOptionalNumber(
      record.targetCpl ?? defaults.targetCpl,
      "projectSettings.kpi.targetCpl",
    ),
    targetLeadsPerDay: assertOptionalNumber(
      record.targetLeadsPerDay ?? defaults.targetLeadsPerDay,
      "projectSettings.kpi.targetLeadsPerDay",
    ),
  };
};

const parseReports = (value: unknown, defaults: ProjectReportSettings): ProjectReportSettings => {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    autoReportsEnabled: assertBoolean(
      record.autoReportsEnabled ?? defaults.autoReportsEnabled,
      "projectSettings.reports.autoReportsEnabled",
    ),
    timeSlots: assertStringArray(record.timeSlots ?? defaults.timeSlots, "projectSettings.reports.timeSlots"),
    mode: assertString(record.mode ?? defaults.mode, "projectSettings.reports.mode"),
  };
};

const parseMetaSettings = (value: unknown, defaults: ProjectMetaSettings): ProjectMetaSettings => {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    facebookUserId: assertOptionalString(
      record.facebookUserId ?? defaults.facebookUserId,
      "projectSettings.meta.facebookUserId",
    ),
  };
};

const parseAlerts = (value: unknown, defaults: ProjectAlertSettings): ProjectAlertSettings => {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    leadNotifications: assertBoolean(
      record.leadNotifications ?? defaults.leadNotifications,
      "projectSettings.alerts.leadNotifications",
    ),
    billingAlerts: assertBoolean(
      record.billingAlerts ?? defaults.billingAlerts,
      "projectSettings.alerts.billingAlerts",
    ),
    budgetAlerts: assertBoolean(
      record.budgetAlerts ?? defaults.budgetAlerts,
      "projectSettings.alerts.budgetAlerts",
    ),
    metaApiAlerts: assertBoolean(
      record.metaApiAlerts ?? defaults.metaApiAlerts,
      "projectSettings.alerts.metaApiAlerts",
    ),
    pauseAlerts: assertBoolean(
      record.pauseAlerts ?? defaults.pauseAlerts,
      "projectSettings.alerts.pauseAlerts",
    ),
    route: parseAlertRoute(record.route, defaults.route),
  };
};

const coerceTimestamp = (value: unknown, field: string, fallback: string): string => {
  if (!value) {
    return fallback;
  }
  try {
    return assertIsoDate(value, field);
  } catch (error) {
    throw new DataValidationError((error as Error).message);
  }
};

export const parseProjectSettings = (raw: unknown, projectId: string): ProjectSettings => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("Project settings payload must be an object");
  }
  const record = raw as Record<string, unknown>;
  const defaults = createDefaultProjectSettings(projectId);
  const createdAt = coerceTimestamp(
    record.createdAt,
    "projectSettings.createdAt",
    defaults.createdAt,
  );
  const updatedAt = coerceTimestamp(record.updatedAt, "projectSettings.updatedAt", createdAt);

  return {
    projectId: assertString(record.projectId ?? projectId, "projectSettings.projectId"),
    chatId: assertOptionalNumber(record.chatId ?? defaults.chatId, "projectSettings.chatId"),
    topicId: assertOptionalNumber(record.topicId ?? defaults.topicId, "projectSettings.topicId"),
    portalEnabled: assertBoolean(
      record.portalEnabled ?? defaults.portalEnabled,
      "projectSettings.portalEnabled",
    ),
    billing: parseBilling(record.billing, defaults.billing),
    kpi: parseKpi(record.kpi, defaults.kpi),
    reports: parseReports(record.reports, defaults.reports),
    alerts: parseAlerts(record.alerts, defaults.alerts),
    meta: parseMetaSettings(record.meta, defaults.meta),
    createdAt,
    updatedAt,
  };
};

export const serialiseProjectSettings = (settings: ProjectSettings): Record<string, unknown> => ({
  projectId: settings.projectId,
  chatId: settings.chatId,
  topicId: settings.topicId,
  portalEnabled: settings.portalEnabled,
  billing: settings.billing,
  kpi: settings.kpi,
  reports: settings.reports,
  alerts: settings.alerts,
  meta: settings.meta,
  createdAt: settings.createdAt,
  updatedAt: settings.updatedAt,
});

export const createDefaultProjectSettings = (projectId: string): ProjectSettings => {
  const now = new Date().toISOString();
  return {
    projectId,
    chatId: null,
    topicId: null,
    portalEnabled: true,
    billing: {
      tariff: 0,
      currency: "USD",
      nextPaymentDate: null,
      autobillingEnabled: false,
    },
    kpi: {
      targetCpl: null,
      targetLeadsPerDay: null,
    },
    reports: {
      autoReportsEnabled: false,
      timeSlots: [],
      mode: "yesterday",
    },
    alerts: {
      leadNotifications: true,
      billingAlerts: true,
      budgetAlerts: true,
      metaApiAlerts: true,
      pauseAlerts: true,
      route: "CHAT",
    },
    meta: {
      facebookUserId: null,
    },
    createdAt: now,
    updatedAt: now,
  };
};

const mapAlertChannelToRoute = (channel: AlertsRecord["channel"]): ProjectAlertRoute => {
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

const mapAutoreportMode = (mode: string): string => {
  if (mode === "yesterday_plus_week") {
    return "yesterday+week";
  }
  return mode;
};

const loadProjectRecordSafe = async (
  kv: KvClient,
  projectId: string,
): Promise<Awaited<ReturnType<typeof getProjectRecord>>> => {
  try {
    return await getProjectRecord(kv, projectId);
  } catch {
    return null;
  }
};

const hydrateFromSpec = async (kv: KvClient, settings: ProjectSettings): Promise<ProjectSettings> => {
  const [projectRecord, billingRecord, alertsRecord, autoreportsRecord] = await Promise.all([
    loadProjectRecordSafe(kv, settings.projectId),
    getBillingRecord(kv, settings.projectId),
    getAlertsRecord(kv, settings.projectId),
    getAutoreportsRecord(kv, settings.projectId),
  ]);

  let hydrated: ProjectSettings = { ...settings };

  if (projectRecord) {
    hydrated = {
      ...hydrated,
      chatId: projectRecord.chatId ?? hydrated.chatId,
    };
  }

  if (billingRecord) {
    hydrated = {
      ...hydrated,
      billing: {
        tariff: billingRecord.tariff,
        currency: billingRecord.currency,
        nextPaymentDate: billingRecord.nextPaymentDate ?? null,
        autobillingEnabled: billingRecord.autobilling,
      },
    };
  }

  if (alertsRecord) {
    hydrated = {
      ...hydrated,
      alerts: {
        ...hydrated.alerts,
        leadNotifications: alertsRecord.types.leadInQueue,
        billingAlerts: alertsRecord.types.paymentReminder,
        pauseAlerts: alertsRecord.types.pause24h,
        route: mapAlertChannelToRoute(alertsRecord.channel),
      },
    };
  }

  if (autoreportsRecord) {
    hydrated = {
      ...hydrated,
      reports: {
        autoReportsEnabled: autoreportsRecord.enabled,
        timeSlots:
          autoreportsRecord.enabled && autoreportsRecord.time
            ? [autoreportsRecord.time]
            : [],
        mode: mapAutoreportMode(autoreportsRecord.mode),
      },
    };
  }

  return hydrated;
};

export const getProjectSettings = async (kv: KvClient, projectId: string): Promise<ProjectSettings> => {
  const key = KV_KEYS.projectSettings(projectId);
  const raw = await kv.getJson<Record<string, unknown>>(key);
  if (!raw) {
    throw new EntityNotFoundError("project-settings", projectId);
  }
  return parseProjectSettings(raw, projectId);
};

export const upsertProjectSettings = async (kv: KvClient, settings: ProjectSettings): Promise<void> => {
  const key = KV_KEYS.projectSettings(settings.projectId);
  await kv.putJson(key, serialiseProjectSettings(settings));
};

export const ensureProjectSettings = async (kv: KvClient, projectId: string): Promise<ProjectSettings> => {
  try {
    const current = await getProjectSettings(kv, projectId);
    if (current.chatId == null) {
      const projectRecord = await loadProjectRecordSafe(kv, projectId);
      if (projectRecord?.chatId != null) {
        const patched: ProjectSettings = { ...current, chatId: projectRecord.chatId };
        await upsertProjectSettings(kv, patched);
        return patched;
      }
    }
    return current;
  } catch (error) {
    if (error instanceof EntityNotFoundError) {
      const defaults = createDefaultProjectSettings(projectId);
      const hydrated = await hydrateFromSpec(kv, defaults);
      await upsertProjectSettings(kv, hydrated);
      return hydrated;
    }
    throw error;
  }
};
