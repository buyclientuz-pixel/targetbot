import { escapeHtml } from "./html";
import {
  EnvBindings,
  listLeadReminders,
  listLeads,
  listPaymentReminders,
  listProjects,
  listSettings,
  loadProjectSettingsRecord,
  saveLeadReminders,
  savePaymentReminders,
  updateProjectRecord,
} from "./storage";
import { sendTelegramMessage, TelegramEnv } from "./telegram";
import {
  LeadRecord,
  LeadReminderRecord,
  PaymentReminderRecord,
  PaymentReminderStatus,
  ProjectRecord,
  ProjectSettingsRecord,
  SettingRecord,
} from "../types";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const DEFAULT_LEAD_THRESHOLD_MINUTES = 60;
const DEFAULT_PAYMENT_DAYS_BEFORE = 1;
const DEFAULT_PAYMENT_OVERDUE_HOURS = 24;

const PAYMENT_TRANSFER_RATE = 12_000;

const LEAD_THRESHOLD_ENV_KEYS = ["LEAD_REMINDER_MINUTES", "REMINDERS_LEAD_MINUTES"];
const PAYMENT_DAYS_ENV_KEYS = ["PAYMENT_REMINDER_DAYS", "REMINDERS_PAYMENT_DAYS"];
const PAYMENT_OVERDUE_ENV_KEYS = ["PAYMENT_REMINDER_OVERDUE_HOURS", "REMINDERS_PAYMENT_OVERDUE_HOURS"];

const LEAD_THRESHOLD_SETTING_KEYS = [
  "reminders.leads.threshold",
  "reminders.leads.thresholdMinutes",
  "bot.reminders.leads.minutes",
];
const PAYMENT_DAYS_SETTING_KEYS = [
  "reminders.payments.daysBefore",
  "bot.reminders.payments.days",
];
const PAYMENT_OVERDUE_SETTING_KEYS = [
  "reminders.payments.overdueHours",
  "bot.reminders.payments.overdue",
];

const BILLING_STATUS_LABELS: Record<string, string> = {
  active: "🟢 Активен",
  pending: "🟡 Ожидает",
  overdue: "🔴 Просрочен",
  blocked: "⛔ Заблокирован",
};

const ensureChatId = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
};

const resolveAdminChatId = (project: ProjectRecord): string | null => {
  return ensureChatId(project.chatId);
};

const resolveClientChatId = (project: ProjectRecord): string | null => {
  const candidates = [project.telegramChatId, project.chatId];
  for (const candidate of candidates) {
    const resolved = ensureChatId(candidate);
    if (resolved) {
      return resolved;
    }
  }
  return null;
};

const resolveAutoOffDisableAt = (project: ProjectRecord): number | null => {
  if (!project.autoOff) {
    return null;
  }
  if (project.nextPaymentDate) {
    const due = Date.parse(project.nextPaymentDate);
    if (!Number.isNaN(due)) {
      return due + DAY_MS;
    }
  }
  if (project.autoOffAt) {
    const flagged = Date.parse(project.autoOffAt);
    if (!Number.isNaN(flagged)) {
      return flagged + DAY_MS;
    }
  }
  return 0;
};

const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const takeNumberFromEnv = (env: Record<string, unknown>, keys: string[]): number | null => {
  for (const key of keys) {
    const candidate = env[key];
    const parsed = parseNumber(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
};

const takeNumberFromSettings = (settings: SettingRecord[], keys: string[]): number | null => {
  for (const key of keys) {
    const setting = settings.find((entry) => entry.key === key);
    if (!setting) {
      continue;
    }
    const parsed = parseNumber(setting.value);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
};

export interface ReminderSettings {
  leadThresholdMinutes: number;
  paymentDaysBefore: number;
  paymentOverdueHours: number;
}

export const loadReminderSettings = async (
  env: EnvBindings & Record<string, unknown>,
): Promise<{ settings: SettingRecord[]; values: ReminderSettings }> => {
  const settings = await listSettings(env).catch(() => [] as SettingRecord[]);

  const leadThreshold =
    takeNumberFromEnv(env, LEAD_THRESHOLD_ENV_KEYS) ??
    takeNumberFromSettings(settings, LEAD_THRESHOLD_SETTING_KEYS) ??
    DEFAULT_LEAD_THRESHOLD_MINUTES;

  const paymentDaysBefore =
    takeNumberFromEnv(env, PAYMENT_DAYS_ENV_KEYS) ??
    takeNumberFromSettings(settings, PAYMENT_DAYS_SETTING_KEYS) ??
    DEFAULT_PAYMENT_DAYS_BEFORE;

  const paymentOverdueHours =
    takeNumberFromEnv(env, PAYMENT_OVERDUE_ENV_KEYS) ??
    takeNumberFromSettings(settings, PAYMENT_OVERDUE_SETTING_KEYS) ??
    DEFAULT_PAYMENT_OVERDUE_HOURS;

  return {
    settings,
    values: {
      leadThresholdMinutes: Math.max(0, Math.floor(leadThreshold)),
      paymentDaysBefore: Math.max(0, Math.floor(paymentDaysBefore)),
      paymentOverdueHours: Math.max(0, Math.floor(paymentOverdueHours)),
    },
  };
};

const formatDateTime = (value: string): string => {
  try {
    return new Date(value).toLocaleString("ru-RU", { hour12: false });
  } catch (error) {
    return value;
  }
};

const formatDate = (value: string): string => {
  try {
    return new Date(value).toLocaleDateString("ru-RU");
  } catch (error) {
    return value;
  }
};

export const formatDurationMinutes = (minutesTotal: number): string => {
  const minutes = Math.max(1, Math.round(minutesTotal));
  if (minutes >= 1440) {
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    if (hours > 0) {
      return `${days} дн ${hours} ч`;
    }
    return `${days} дн`;
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (rest > 0) {
      return `${hours} ч ${rest} мин`;
    }
    return `${hours} ч`;
  }
  return `${minutes} мин`;
};

const buildLeadReminderMessage = (
  project: ProjectRecord,
  lead: LeadRecord,
  waitMinutes: number,
): string => {
  const lines = [
    "⏰ <b>Напоминание по лиду</b>",
    `Проект: <b>${escapeHtml(project.name)}</b>`,
    `Заявка: <b>${escapeHtml(lead.name)}</b>`,
  ];
  if (lead.phone) {
    lines.push(`Телефон: <code>${escapeHtml(lead.phone)}</code>`);
  }
  lines.push(`Источник: ${escapeHtml(lead.source)}`);
  lines.push(`Создан: ${escapeHtml(formatDateTime(lead.createdAt))}`);
  lines.push(`Ожидает: ${escapeHtml(formatDurationMinutes(waitMinutes))}`);
  lines.push("", "Обновите статус лида, чтобы снять напоминание.");
  return lines.join("\n");
};

const buildLeadReminderMarkup = (projectId: string) => ({
  inline_keyboard: [
    [{ text: "💬 Обработать лиды", callback_data: `proj:leads:${projectId}` }],
    [{ text: "🏗 Карточка проекта", callback_data: `proj:view:${projectId}` }],
  ],
});

export const formatUsdAmount = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return "—";
  }
  return value % 1 === 0 ? `${value}$` : `${value.toFixed(2)}$`;
};

const formatUzsAmount = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return "—";
  }
  return new Intl.NumberFormat("ru-RU").format(Math.round(value));
};

export const buildAdminPaymentReminderMessage = (
  project: ProjectRecord,
  status: PaymentReminderStatus,
  dueDate: string,
): string => {
  const lines = ["🧾 Напоминание об оплате", "", `Оплата запланирована: ${escapeHtml(formatDate(dueDate))}`];
  const amount = project.billingAmountUsd ?? project.tariff;
  if (amount > 0) {
    lines.push(`Тариф: ${escapeHtml(formatUsdAmount(amount))}`);
  }
  if (status === "overdue") {
    lines.push("Статус: просрочено.");
  }
  lines.push("", "Продлеваем?");
  return lines.join("\n");
};

export const buildAdminPaymentReminderMarkup = (projectId: string) => ({
  inline_keyboard: [
    [
      { text: "Продлеваем", callback_data: `payments:renew_yes:${projectId}` },
      { text: "Не продлеваю", callback_data: `payments:renew_no:${projectId}` },
    ],
  ],
});

const sendLeadReminder = async (
  env: ReminderEnv,
  project: ProjectRecord,
  lead: LeadRecord,
  waitMinutes: number,
): Promise<boolean> => {
  const chatId = resolveClientChatId(project);
  if (!chatId) {
    return false;
  }
  try {
    await sendTelegramMessage(env, {
      chatId,
      threadId: project.telegramThreadId,
      text: buildLeadReminderMessage(project, lead, waitMinutes),
      replyMarkup: buildLeadReminderMarkup(project.id),
    });
    return true;
  } catch (error) {
    console.error("Failed to send lead reminder", project.id, lead.id, error);
    return false;
  }
};

const sendAdminPaymentReminder = async (
  env: ReminderEnv,
  project: ProjectRecord,
  status: PaymentReminderStatus,
  dueDate: string,
): Promise<boolean> => {
  const chatId = resolveAdminChatId(project);
  if (!chatId) {
    return false;
  }
  try {
    await sendTelegramMessage(env, {
      chatId,
      text: buildAdminPaymentReminderMessage(project, status, dueDate),
      replyMarkup: buildAdminPaymentReminderMarkup(project.id),
    });
    return true;
  } catch (error) {
    console.error("Failed to send admin payment reminder", project.id, error);
    return false;
  }
};

export const buildAdminPaymentReviewMessage = (
  project: ProjectRecord,
  method: PaymentReminderRecord["method"],
  dueDate: string | null,
  reminder?: boolean,
  options?: { exchangeRate?: number | null; amountUsd?: number | null },
): string => {
  const lines: string[] = [];
  if (reminder) {
    lines.push("⏰ Напоминание: проверьте оплату.");
  }
  if (method === "transfer") {
    lines.push("Проверь оплату переводом");
  } else if (method === "cash") {
    lines.push("Клиент выбрал оплату наличными.");
  } else {
    lines.push("Проверь оплату");
  }
  lines.push(`Проект: <b>${escapeHtml(project.name)}</b>`);
  const baseAmount = options?.amountUsd ?? project.billingAmountUsd ?? project.tariff;
  if (baseAmount > 0) {
    const usdLabel = formatUsdAmount(baseAmount);
    if (method === "transfer") {
      const rate = options?.exchangeRate ?? PAYMENT_TRANSFER_RATE;
      const uzsLabel = formatUzsAmount(baseAmount * rate);
      lines.push(`Тариф: ${escapeHtml(`${usdLabel} / ${uzsLabel} сум`)}`);
    } else {
      lines.push(`Тариф: ${escapeHtml(usdLabel)}`);
    }
  }
  if (dueDate) {
    lines.push(`Оплата запланирована: ${escapeHtml(formatDate(dueDate))}`);
  }
  lines.push("", "Подтвердите статус оплаты.");
  return lines.join("\n");
};

export const buildAdminPaymentReviewMarkup = (projectId: string) => ({
  inline_keyboard: [
    [
      { text: "Подтвердить", callback_data: `payments:confirm:${projectId}` },
      { text: "Ошибочно", callback_data: `payments:error:${projectId}` },
    ],
    [{ text: "Ожидаю поступления", callback_data: `payments:wait:${projectId}` }],
  ],
});

const sendAdminPaymentReview = async (
  env: ReminderEnv,
  project: ProjectRecord,
  record: PaymentReminderRecord,
  reminder = false,
): Promise<boolean> => {
  const chatId = resolveAdminChatId(project);
  if (!chatId) {
    return false;
  }
  try {
    await sendTelegramMessage(env, {
      chatId,
      text: buildAdminPaymentReviewMessage(project, record.method ?? null, record.dueDate ?? null, reminder, {
        exchangeRate: record.exchangeRate ?? undefined,
        amountUsd: project.billingAmountUsd ?? project.tariff,
      }),
      replyMarkup: buildAdminPaymentReviewMarkup(project.id),
    });
    return true;
  } catch (error) {
    console.error("Failed to send admin payment review", project.id, error);
    return false;
  }
};

const processLeadReminders = async (
  env: ReminderEnv,
  thresholdMinutes: number,
): Promise<number> => {
  if (thresholdMinutes <= 0) {
    await saveLeadReminders(env, []);
    return 0;
  }
  const projects = await listProjects(env);
  const existingRecords = await listLeadReminders(env).catch(() => [] as LeadReminderRecord[]);
  const reminderMap = new Map(existingRecords.map((record) => [record.leadId, record]));
  const nextRecords: LeadReminderRecord[] = [];
  const now = Date.now();
  let sent = 0;

  for (const project of projects) {
    const chatId = resolveClientChatId(project);
    if (!chatId) {
      continue;
    }
    const leads = await listLeads(env, project.id).catch(() => [] as LeadRecord[]);
    for (const lead of leads) {
      const existing = reminderMap.get(lead.id);
      if (lead.status === "done") {
        reminderMap.delete(lead.id);
        continue;
      }
      const created = Date.parse(lead.createdAt);
      if (Number.isNaN(created)) {
        if (existing) {
          nextRecords.push({ ...existing, updatedAt: new Date().toISOString() });
          reminderMap.delete(lead.id);
        }
        continue;
      }
      const waitMinutes = (now - created) / MINUTE_MS;
      if (waitMinutes < thresholdMinutes) {
        if (existing) {
          nextRecords.push({ ...existing, updatedAt: new Date().toISOString() });
          reminderMap.delete(lead.id);
        }
        continue;
      }

      let record = existing;
      if (!record || record.status === "pending") {
        const delivered = await sendLeadReminder(env, project, lead, waitMinutes);
        if (delivered) {
          sent += 1;
          const timestamp = new Date().toISOString();
          record = {
            id: existing?.id ?? lead.id,
            leadId: lead.id,
            projectId: project.id,
            status: "notified",
            notifiedCount: (existing?.notifiedCount ?? 0) + 1,
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: timestamp,
            lastNotifiedAt: timestamp,
          };
        } else if (existing) {
          record = { ...existing, updatedAt: new Date().toISOString() };
        }
      } else {
        record = { ...record, updatedAt: new Date().toISOString() };
      }

      if (record) {
        nextRecords.push(record);
        reminderMap.delete(lead.id);
      }
    }
  }

  await saveLeadReminders(env, nextRecords);
  return sent;
};

const resolvePaymentStatus = (
  diffMs: number,
  daysBefore: number,
): PaymentReminderStatus => {
  if (diffMs <= 0) {
    return "overdue";
  }
  if (daysBefore > 0 && diffMs <= daysBefore * DAY_MS) {
    return "upcoming";
  }
  return "pending";
};

const processPaymentReminders = async (
  env: ReminderEnv,
  daysBefore: number,
  overdueHours: number,
): Promise<number> => {
  if (daysBefore <= 0 && overdueHours <= 0) {
    await savePaymentReminders(env, []);
    return 0;
  }
  const [projects, existingRecords] = await Promise.all([
    listProjects(env),
    listPaymentReminders(env).catch(() => [] as PaymentReminderRecord[]),
  ]);
  const reminderMap = new Map(existingRecords.map((record) => [record.projectId, record]));
  const nextRecords: PaymentReminderRecord[] = [];
  const now = Date.now();
  let sent = 0;
  const settingsCache = new Map<string, ProjectSettingsRecord | null>();

  for (const project of projects) {
    if (!settingsCache.has(project.id)) {
      const settings = await loadProjectSettingsRecord(env, project.id).catch((error) => {
        console.warn("Failed to load project settings for payment reminders", project.id, error);
        return null;
      });
      settingsCache.set(project.id, settings);
    }
    const settings = settingsCache.get(project.id);
    if (settings && settings.alerts.payment === false) {
      reminderMap.delete(project.id);
      continue;
    }
    const adminChatId = resolveAdminChatId(project);
    const clientChatId = resolveClientChatId(project);
    const dueIso = project.nextPaymentDate;
    if (!project.billingEnabled || !adminChatId || !dueIso) {
      reminderMap.delete(project.id);
      continue;
    }
    const disableAt = resolveAutoOffDisableAt(project);
    if (disableAt !== null && disableAt <= now) {
      if (project.billingStatus !== "blocked") {
        await updateProjectRecord(env, project.id, {
          autoOff: true,
          autoOffAt: project.autoOffAt ?? new Date().toISOString(),
          billingStatus: "blocked",
        }).catch((error) => {
          console.warn("Failed to enforce auto-off", project.id, error);
        });
        if (clientChatId) {
          await sendTelegramMessage(env, {
            chatId: clientChatId,
            threadId: typeof project.telegramThreadId === "number" ? project.telegramThreadId : undefined,
            text: "Подписка на отчёты по этому проекту не продлена. Отчёты и портал временно отключены.",
          }).catch((error) => {
            console.warn("Failed to notify project chat about auto-off", project.id, error);
          });
        }
      }
      reminderMap.delete(project.id);
      continue;
    }
    const dueMs = Date.parse(dueIso);
    if (Number.isNaN(dueMs)) {
      reminderMap.delete(project.id);
      continue;
    }
    const diffMs = dueMs - now;
    const status = resolvePaymentStatus(diffMs, daysBefore);

    const existing = reminderMap.get(project.id);
    const nowIso = new Date().toISOString();
    let record: PaymentReminderRecord =
      existing
        ? {
            ...existing,
            status,
            dueDate: dueIso,
            updatedAt: nowIso,
            adminChatId,
            clientChatId,
          }
        : {
            id: existing?.id ?? project.id,
            projectId: project.id,
            status,
            stage: "pending",
            method: null,
            dueDate: dueIso,
            notifiedCount: 0,
            createdAt: nowIso,
            updatedAt: nowIso,
            lastNotifiedAt: null,
            nextFollowUpAt: null,
            adminChatId,
            clientChatId,
            lastClientPromptAt: null,
          };

    const dueChanged = existing ? existing.dueDate !== dueIso : false;
    const statusChanged = existing ? existing.status !== status : false;

    if (dueChanged) {
      record = {
        ...record,
        stage: "pending",
        method: null,
        nextFollowUpAt: null,
        lastClientPromptAt: null,
      };
    }

    if (status === "pending") {
      if (record.stage === "pending" || record.stage === "declined" || record.stage === "completed") {
        reminderMap.delete(project.id);
        continue;
      }
    }

    let updatedRecord = record;

    const deliverReminder = async (): Promise<void> => {
      const delivered = await sendAdminPaymentReminder(env, project, status, dueIso);
      if (delivered) {
        sent += 1;
        const timestamp = new Date().toISOString();
        updatedRecord = {
          ...updatedRecord,
          stage: "admin_notified",
          notifiedCount: (updatedRecord.notifiedCount ?? 0) + 1,
          lastNotifiedAt: timestamp,
          updatedAt: timestamp,
        };
      }
    };

    const needInitialReminder =
      !existing ||
      updatedRecord.stage === "pending" ||
      updatedRecord.stage === "declined" ||
      updatedRecord.stage === "completed" ||
      dueChanged ||
      statusChanged;

    if (status !== "pending" && needInitialReminder) {
      await deliverReminder();
    } else if (
      status === "overdue" &&
      updatedRecord.stage === "admin_notified" &&
      overdueHours > 0
    ) {
      const last = updatedRecord.lastNotifiedAt ? Date.parse(updatedRecord.lastNotifiedAt) : NaN;
      if (Number.isNaN(last) || now - last >= overdueHours * HOUR_MS) {
        await deliverReminder();
      }
    } else if (updatedRecord.stage === "awaiting_admin_confirmation" && updatedRecord.nextFollowUpAt) {
      const followUpMs = Date.parse(updatedRecord.nextFollowUpAt);
      if (!Number.isNaN(followUpMs) && followUpMs <= now) {
        const delivered = await sendAdminPaymentReview(env, project, updatedRecord, true);
        if (delivered) {
          sent += 1;
          const timestamp = new Date().toISOString();
          updatedRecord = {
            ...updatedRecord,
            notifiedCount: (updatedRecord.notifiedCount ?? 0) + 1,
            lastNotifiedAt: timestamp,
            nextFollowUpAt: new Date(Date.now() + HOUR_MS).toISOString(),
            updatedAt: timestamp,
          };
        }
      }
    }

    if (updatedRecord.stage !== "completed") {
      nextRecords.push(updatedRecord);
    }
    reminderMap.delete(project.id);
  }

  await savePaymentReminders(env, nextRecords);
  return sent;
};

export interface ReminderRunResult {
  leadRemindersSent: number;
  paymentRemindersSent: number;
}

export type ReminderEnv = EnvBindings & TelegramEnv & Record<string, unknown>;

export const runReminderSweep = async (env: ReminderEnv): Promise<ReminderRunResult> => {
  const { values } = await loadReminderSettings(env);

  const [leadCount, paymentCount] = await Promise.all([
    processLeadReminders(env, values.leadThresholdMinutes),
    processPaymentReminders(env, values.paymentDaysBefore, values.paymentOverdueHours),
  ]);

  return { leadRemindersSent: leadCount, paymentRemindersSent: paymentCount };
};
