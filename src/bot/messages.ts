import type { MetaSummaryMetrics } from "../domain/meta-summary";
import type { ProjectSettings } from "../domain/project-settings";
import type { Project } from "../domain/projects";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatMoney = (value: number, currency: string, fractionDigits = 2): string => {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
};

const formatTariff = (value: number, currency: string): string => {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
};

const formatDate = (value: string | null): string => {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}.${month}.${year}`;
};

const formatBoolean = (value: boolean, labels: { true: string; false: string }): string => {
  return value ? labels.true : labels.false;
};

const mapAlertRoute = (route: ProjectSettings["alerts"]["route"]): string => {
  switch (route) {
    case "CHAT":
      return "в чат";
    case "ADMIN":
      return "админу";
    case "BOTH":
      return "в чат и админу";
    default:
      return "—";
  }
};

export const buildMenuMessage = (): string => {
  return [
    "Главное меню",
    "Выберите раздел: авторизация, проекты, аналитика или финансовые настройки.",
  ].join("\n");
};

export const buildProjectsListMessage = (count: number): string => {
  if (count === 0) {
    return "У вас пока нет проектов. Добавьте их через портал или админ-панель.";
  }
  return `Выберите проект (${count}):`;
};

export interface ProjectCardMetrics {
  spendToday: number | null;
  cpaToday: number | null;
  leadsToday: number | null;
  leadsTotal: number | null;
}

const extractMetrics = (metrics: MetaSummaryMetrics | undefined | null): ProjectCardMetrics => {
  if (!metrics) {
    return { spendToday: null, cpaToday: null, leadsToday: null, leadsTotal: null };
  }
  return {
    spendToday: metrics.spend ?? null,
    cpaToday: metrics.cpa ?? null,
    leadsToday: metrics.leadsToday ?? null,
    leadsTotal: metrics.leadsTotal ?? null,
  };
};

const formatMetric = (value: number | null, formatter: (input: number) => string): string => {
  if (value == null) {
    return "—";
  }
  return formatter(value);
};

const pluralLeads = (value: number | null): string => {
  if (value == null) {
    return "—";
  }
  return `${value}`;
};

export const buildProjectCardMessage = (
  project: Project,
  settings: ProjectSettings,
  metrics?: MetaSummaryMetrics | null,
): string => {
  const { spendToday, cpaToday, leadsToday, leadsTotal } = extractMetrics(metrics);
  const metaStatus = project.adsAccountId
    ? `подключено — ${escapeHtml(project.name)} (${escapeHtml(project.adsAccountId)})`
    : "не подключено";

  const billing = settings.billing;
  const reports = settings.reports;
  const alerts = settings.alerts;

  const lines: string[] = [];
  lines.push(`Проект: ${escapeHtml(project.name)}`);
  lines.push(`Meta: ${metaStatus}`);
  lines.push(
    `CPA (сегодня): ${formatMetric(cpaToday, (value) => formatMoney(value, billing.currency))} | ` +
      `Затраты: ${formatMetric(spendToday, (value) => formatMoney(value, billing.currency))}`,
  );
  lines.push(`Лиды: сегодня ${pluralLeads(leadsToday)} | всего ${pluralLeads(leadsTotal)}`);
  lines.push(
    `Оплата: ${formatTariff(billing.tariff, billing.currency)} (${billing.tariff > 0 ? "настроена" : "тариф не задан"})`,
  );
  lines.push(`Оплата: следующая дата ${formatDate(billing.nextPaymentDate)}`);
  lines.push(`Автобиллинг: ${formatBoolean(billing.autobillingEnabled, { true: "включен", false: "выключен" })}`);

  if (reports.autoReportsEnabled) {
    const slots = reports.timeSlots.length > 0 ? reports.timeSlots.join(", ") : "—";
    lines.push(`Автоотчёты: ${slots} (вкл, режим: ${escapeHtml(reports.mode)})`);
  } else {
    lines.push("Автоотчёты: выключены");
  }

  const alertsEnabled =
    alerts.leadNotifications || alerts.billingAlerts || alerts.budgetAlerts || alerts.metaApiAlerts || alerts.pauseAlerts;
  if (alertsEnabled && alerts.route !== "NONE") {
    lines.push(`Алерты: включены (${mapAlertRoute(alerts.route)})`);
  } else {
    lines.push("Алерты: выключены");
  }

  if (settings.chatId != null) {
    const topic = settings.topicId != null ? `, тема ${settings.topicId}` : "";
    lines.push(`Чат-группа: Перейти (ID: ${settings.chatId}${topic})`);
  } else {
    lines.push("Чат-группа: не привязана");
  }

  lines.push(
    settings.portalEnabled ? "Портал: Открыть клиентский портал" : "Портал: отключен",
  );

  return lines.join("\n");
};
