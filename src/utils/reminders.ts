import { escapeHtml } from "./html";
import {
  EnvBindings,
  listLeadReminders,
  listLeads,
  listPaymentReminders,
  listPayments,
  listProjects,
  listSettings,
  saveLeadReminders,
  savePaymentReminders,
} from "./storage";
import { sendTelegramMessage, TelegramEnv } from "./telegram";
import {
  LeadRecord,
  LeadReminderRecord,
  PaymentRecord,
  PaymentReminderRecord,
  PaymentReminderStatus,
  ProjectRecord,
  SettingRecord,
} from "../types";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const DEFAULT_LEAD_THRESHOLD_MINUTES = 60;
const DEFAULT_PAYMENT_DAYS_BEFORE = 1;
const DEFAULT_PAYMENT_OVERDUE_HOURS = 24;

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

const resolveProjectChatId = (project: ProjectRecord): string | null => {
  const candidates = [project.telegramChatId, project.chatId];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return String(candidate);
    }
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
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

const formatCurrency = (amount: number, currency = "USD"): string => {
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    return `${amount.toFixed(2)} ${currency}`;
  }
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

const buildPaymentReminderMessage = (
  project: ProjectRecord,
  status: PaymentReminderStatus,
  dueDate: string,
  diffMs: number,
  payment?: PaymentRecord,
): string => {
  const lines = ["💰 <b>Напоминание об оплате</b>"];
  lines.push(`Проект: <b>${escapeHtml(project.name)}</b>`);
  lines.push(`Оплата запланирована на: <b>${escapeHtml(formatDate(dueDate))}</b>`);
  if (status === "upcoming") {
    const remaining = Math.max(1, Math.ceil(diffMs / DAY_MS));
    lines.push(`До оплаты осталось: ${escapeHtml(`${remaining} дн`)}.`);
  } else {
    const overdueDays = Math.max(1, Math.ceil(Math.abs(diffMs) / DAY_MS));
    lines.push(`Просрочка: ${escapeHtml(`${overdueDays} дн`)}.`);
  }
  const billingLabel = BILLING_STATUS_LABELS[project.billingStatus] ?? project.billingStatus;
  lines.push(`Биллинг: ${escapeHtml(billingLabel)}`);
  if (project.tariff > 0) {
    lines.push(`Тариф: ${escapeHtml(formatCurrency(project.tariff))}`);
  }
  if (payment) {
    const amount = formatCurrency(payment.amount, payment.currency);
    lines.push(`Последний платёж: ${escapeHtml(amount)} (${escapeHtml(formatDate(payment.periodEnd))}).`);
  }
  lines.push("", "Подтвердите оплату или обновите дату следующего платежа.");
  return lines.join("\n");
};

const buildPaymentReminderMarkup = (projectId: string) => ({
  inline_keyboard: [
    [{ text: "💳 Статус оплаты", callback_data: `proj:billing:${projectId}` }],
    [{ text: "🏗 Карточка проекта", callback_data: `proj:view:${projectId}` }],
  ],
});

const sendLeadReminder = async (
  env: ReminderEnv,
  project: ProjectRecord,
  lead: LeadRecord,
  waitMinutes: number,
): Promise<boolean> => {
  const chatId = resolveProjectChatId(project);
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

const sendPaymentReminder = async (
  env: ReminderEnv,
  project: ProjectRecord,
  status: PaymentReminderStatus,
  dueDate: string,
  diffMs: number,
  payment?: PaymentRecord,
): Promise<boolean> => {
  const chatId = resolveProjectChatId(project);
  if (!chatId) {
    return false;
  }
  try {
    await sendTelegramMessage(env, {
      chatId,
      threadId: project.telegramThreadId,
      text: buildPaymentReminderMessage(project, status, dueDate, diffMs, payment),
      replyMarkup: buildPaymentReminderMarkup(project.id),
    });
    return true;
  } catch (error) {
    console.error("Failed to send payment reminder", project.id, error);
    return false;
  }
};

const groupPaymentsByProject = (payments: PaymentRecord[]): Map<string, PaymentRecord> => {
  const result = new Map<string, PaymentRecord>();
  for (const payment of payments) {
    if (!payment.projectId) {
      continue;
    }
    const existing = result.get(payment.projectId);
    if (!existing) {
      result.set(payment.projectId, payment);
      continue;
    }
    const existingTime = Date.parse(existing.updatedAt ?? existing.createdAt);
    const currentTime = Date.parse(payment.updatedAt ?? payment.createdAt);
    if (Number.isNaN(existingTime) || currentTime > existingTime) {
      result.set(payment.projectId, payment);
    }
  }
  return result;
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
    const chatId = resolveProjectChatId(project);
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
  const [projects, payments, existingRecords] = await Promise.all([
    listProjects(env),
    listPayments(env).catch(() => [] as PaymentRecord[]),
    listPaymentReminders(env).catch(() => [] as PaymentReminderRecord[]),
  ]);
  const reminderMap = new Map(existingRecords.map((record) => [record.projectId, record]));
  const nextRecords: PaymentReminderRecord[] = [];
  const paymentsByProject = groupPaymentsByProject(payments);
  const now = Date.now();
  let sent = 0;

  for (const project of projects) {
    const chatId = resolveProjectChatId(project);
    if (!chatId || !project.nextPaymentDate) {
      reminderMap.delete(project.id);
      continue;
    }
    const dueMs = Date.parse(project.nextPaymentDate);
    if (Number.isNaN(dueMs)) {
      reminderMap.delete(project.id);
      continue;
    }
    const diffMs = dueMs - now;
    const status = resolvePaymentStatus(diffMs, daysBefore);
    if (status === "pending") {
      reminderMap.delete(project.id);
      continue;
    }

    const existing = reminderMap.get(project.id);
    let shouldSend = false;

    if (!existing) {
      shouldSend = true;
    } else if (existing.dueDate !== project.nextPaymentDate) {
      shouldSend = true;
    } else if (existing.status !== status) {
      shouldSend = true;
    } else if (status === "overdue" && overdueHours > 0) {
      const last = existing.lastNotifiedAt ? Date.parse(existing.lastNotifiedAt) : NaN;
      if (Number.isNaN(last) || now - last >= overdueHours * HOUR_MS) {
        shouldSend = true;
      }
    }

    let record: PaymentReminderRecord | null = existing
      ? { ...existing, updatedAt: new Date().toISOString(), status, dueDate: project.nextPaymentDate }
      : null;

    if (shouldSend) {
      const delivered = await sendPaymentReminder(
        env,
        project,
        status,
        project.nextPaymentDate,
        diffMs,
        paymentsByProject.get(project.id),
      );
      if (delivered) {
        sent += 1;
        const timestamp = new Date().toISOString();
        record = {
          id: existing?.id ?? project.id,
          projectId: project.id,
          status,
          dueDate: project.nextPaymentDate,
          notifiedCount: (existing?.notifiedCount ?? 0) + 1,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
          lastNotifiedAt: timestamp,
        };
      } else if (record) {
        record.updatedAt = new Date().toISOString();
      }
    }

    if (record) {
      nextRecords.push(record);
      reminderMap.delete(project.id);
    }
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
