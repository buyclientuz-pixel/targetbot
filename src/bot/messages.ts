import type { BillingRecord } from "../domain/spec/billing";
import type { AlertsRecord } from "../domain/spec/alerts";
import type { AutoreportsRecord } from "../domain/spec/autoreports";
import type { ProjectRecord } from "../domain/spec/project";
import type { ProjectLeadsListRecord } from "../domain/spec/project-leads";
import type { MetaCampaignsDocument } from "../domain/spec/meta-campaigns";
import type { PaymentsHistoryDocument } from "../domain/spec/payments-history";

import type { ProjectBundle } from "./data";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatMoney = (value: number | null | undefined, currency: string, fractionDigits = 2): string => {
  if (value == null) {
    return "—";
  }
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

const formatDate = (value: string | null | undefined): string => {
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

const formatBoolean = (value: boolean, labels: { true: string; false: string }): string =>
  value ? labels.true : labels.false;

const formatChatLink = (chatId: number | null): string | null => {
  if (!chatId) {
    return null;
  }
  if (chatId < 0) {
    const absolute = Math.abs(chatId);
    const channelId = absolute > 1000000000000 ? absolute - 1000000000000 : absolute;
    return `https://t.me/c/${channelId}`;
  }
  return `tg://user?id=${chatId}`;
};

const mapAlertsChannel = (alerts: AlertsRecord): string => {
  if (!alerts.enabled) {
    return "выключены";
  }
  switch (alerts.channel) {
    case "chat":
      return "включены (в чат)";
    case "admin":
      return "включены (админу)";
    case "both":
      return "включены (в чат и админу)";
    default:
      return "включены";
  }
};

const mapAutoreportSendTo = (autoreports: AutoreportsRecord): string => {
  switch (autoreports.sendTo) {
    case "chat":
      return "в чат";
    case "admin":
      return "админу";
    case "both":
      return "в чат и админу";
    default:
      return "—";
  }
};

const formatKpi = (project: ProjectRecord): string => {
  const mode = project.settings.kpi.mode === "auto" ? "авто" : "ручной";
  return `${mode}, ${escapeHtml(project.settings.kpi.label)}`;
};

const computeCpa = (spend: number | null, leadsToday: number | null): number | null => {
  if (spend == null || leadsToday == null || leadsToday === 0) {
    return null;
  }
  return spend / leadsToday;
};

const formatLeadsLine = (stats: ProjectLeadsListRecord["stats"]): string => {
  return `💬 Лиды: <b>${stats.today}</b> (сегодня) | <b>${stats.total}</b> (всего)`;
};

const buildChatGroupLine = (project: ProjectRecord): string => {
  if (!project.chatId) {
    return "💬 Чат-группа: не привязана";
  }
  const link = formatChatLink(project.chatId);
  const anchor = link ? `<a href="${link}">Перейти</a>` : "Перейти";
  return `💬 Чат-группа: ${anchor} (ID: ${project.chatId})`;
};

const buildPortalLine = (project: ProjectRecord): string => {
  if (!project.portalUrl) {
    return "🌐 Портал: не задан";
  }
  return `🌐 Портал: <a href="${project.portalUrl}">Открыть клиентский портал</a>`;
};

export interface ProjectListItem {
  id: string;
  name: string;
  spend: number | null;
  currency: string;
}

export const buildMenuMessage = (): string =>
  [
    "Главное меню",
    "Выберите раздел: авторизация, проекты, аналитика или финансовые настройки.",
  ].join("\n");

export const buildProjectsListMessage = (projects: ProjectListItem[]): string => {
  if (projects.length === 0) {
    return "У вас пока нет проектов. Добавьте их через портал или админ-панель.";
  }
  const lines: string[] = ["Ваши проекты:"];
  projects.forEach((project, index) => {
    const spend = formatMoney(project.spend, project.currency);
    lines.push(`${index + 1}️⃣ ${escapeHtml(project.name)} [${spend}]`);
  });
  return lines.join("\n");
};

export const buildProjectCardMessage = (bundle: ProjectBundle): string => {
  const { project, billing, leads, campaigns, alerts, autoreports } = bundle;
  const spend = campaigns.summary.spend ?? null;
  const leadsToday = leads.stats.today ?? null;
  const cpa = computeCpa(spend, leadsToday);

  const lines: string[] = [];
  lines.push(`🏗 Проект: <b>${escapeHtml(project.name)}</b>`);
  lines.push(
    project.adAccountId
      ? `🧩 Meta: подключено — <b>${escapeHtml(project.name)} (${escapeHtml(project.adAccountId)})</b>`
      : "🧩 Meta: не подключено",
  );
  lines.push(
    `📈 CPA (сегодня): <b>${formatMoney(cpa, billing.currency)}</b> | ` +
      `Затраты: <b>${formatMoney(spend, billing.currency)}</b>`,
  );
  lines.push("");
  lines.push(formatLeadsLine(leads.stats));
  lines.push("");
  lines.push(`💳 Оплата: <b>${formatTariff(billing.tariff, billing.currency)}</b> / мес`);
  lines.push(`📅 Оплата: следующий платёж <b>${formatDate(billing.nextPaymentDate)}</b>`);
  lines.push(`🤖 Автобиллинг: ${formatBoolean(billing.autobilling, { true: "включен", false: "выключен" })}`);
  lines.push("");
  if (autoreports.enabled) {
    lines.push(
      `🕒 Автоотчёты: <b>${autoreports.time}</b> (вкл, режим: вчера + неделя, ${mapAutoreportSendTo(
        autoreports,
      )})`,
    );
  } else {
    lines.push("🕒 Автоотчёты: выключены");
  }
  lines.push(`🚨 Алерты: ${mapAlertsChannel(alerts)}`);
  lines.push("");
  lines.push(buildChatGroupLine(project));
  lines.push(buildPortalLine(project));
  lines.push(`🎯 KPI: ${formatKpi(project)}`);

  return lines.join("\n");
};

export const buildBillingScreenMessage = (
  project: ProjectRecord,
  billing: BillingRecord,
  payments: PaymentsHistoryDocument,
): string => {
  const lines: string[] = [];
  lines.push(`💳 Оплата — <b>${escapeHtml(project.name)}</b>`);
  lines.push("");
  lines.push(`Тариф: <b>${formatTariff(billing.tariff, billing.currency)}</b>`);
  lines.push(`Следующий платёж: <b>${formatDate(billing.nextPaymentDate)}</b>`);
  lines.push(`Автобиллинг: ${formatBoolean(billing.autobilling, { true: "включён", false: "выключен" })}`);
  lines.push("");
  if (payments.payments.length === 0) {
    lines.push("Платежи ещё не зафиксированы. Настройте тариф и дату следующего платежа кнопками ниже.");
  } else {
    lines.push("История оплат:");
    payments.payments.slice(0, 5).forEach((payment, index) => {
      const paidAt = payment.paidAt ? `, оплачен ${formatDate(payment.paidAt)}` : "";
      lines.push(
        `${index + 1}. ${formatMoney(payment.amount, payment.currency)} — ` +
          `${formatDate(payment.periodFrom)} → ${formatDate(payment.periodTo)} (${payment.status})${paidAt}`,
      );
    });
  }
  return lines.join("\n");
};

const formatLeadDuration = (createdAt: string): string => {
  const created = new Date(createdAt);
  const diff = Date.now() - created.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff - hours * 60 * 60 * 1000) / (1000 * 60));
  return `${hours} ч ${minutes} мин`;
};

const formatLeadEntry = (lead: ProjectLeadsListRecord["leads"][number]): string => {
  const lines: string[] = [];
  lines.push("🔔 Лид ожидает ответа");
  lines.push(`Имя: <b>${escapeHtml(lead.name)}</b>`);
  lines.push(`Телефон: ${escapeHtml(lead.phone)}`);
  lines.push(`Получен: ${formatDate(lead.createdAt)}`);
  lines.push(`Реклама: ${escapeHtml(lead.campaignName)}`);
  if (lead.status === "new") {
    lines.push(`В очереди уже ${formatLeadDuration(lead.createdAt)}`);
  } else {
    lines.push(`Статус: ${lead.status}`);
  }
  return lines.join("\n");
};

export const buildLeadsMessage = (
  project: ProjectRecord,
  leads: ProjectLeadsListRecord,
  status: ProjectLeadsListRecord["leads"][number]["status"],
): string => {
  const filtered = leads.leads.filter((lead) => lead.status === status).slice(0, 5);
  const lines: string[] = [];
  lines.push(`Лиды проекта <b>${escapeHtml(project.name)}</b>`);
  lines.push(`Всего: <b>${leads.stats.total}</b> | Сегодня: <b>${leads.stats.today}</b>`);
  lines.push("");
  if (filtered.length === 0) {
    lines.push("В этом статусе заявок нет.");
  } else {
    filtered.forEach((lead, index) => {
      if (index > 0) {
        lines.push("");
      }
      lines.push(formatLeadEntry(lead));
    });
  }
  return lines.join("\n");
};

export const buildReportMessage = (
  project: ProjectRecord,
  campaigns: MetaCampaignsDocument,
): string => {
  const lines: string[] = [];
  lines.push(`Отчёт по рекламе — <b>${escapeHtml(project.name)}</b>`);
  lines.push(`Период: ${campaigns.period.from} — ${campaigns.period.to}`);
  lines.push("");
  lines.push(`💰 Затраты: <b>${formatMoney(campaigns.summary.spend, project.settings.currency)}</b>`);
  lines.push(`👀 Показов: <b>${campaigns.summary.impressions}</b>`);
  lines.push(`👆 Кликов: <b>${campaigns.summary.clicks}</b>`);
  lines.push(`🎯 KPI: <b>${campaigns.summary.leads}</b>`);
  const cpa = computeCpa(campaigns.summary.spend, campaigns.summary.leads) ?? null;
  lines.push(`📊 CPA: <b>${cpa ? formatMoney(cpa, project.settings.currency) : "—"}</b>`);
  lines.push("");
  if (campaigns.campaigns.length === 0) {
    lines.push("Нет данных по кампаниям.");
  } else {
    lines.push("Топ-3 кампании по KPI:");
    campaigns.campaigns
      .slice(0, 3)
      .forEach((campaign, index) =>
        lines.push(
          `${index + 1}️⃣ <b>${escapeHtml(campaign.name)}</b> — ${campaign.leads} ` +
            `${campaign.objective} за ${formatMoney(campaign.spend, project.settings.currency, 2)}`,
        ),
      );
  }
  return lines.join("\n");
};

export const buildCampaignsMessage = (
  project: ProjectRecord,
  campaigns: MetaCampaignsDocument,
): string => {
  const lines: string[] = [];
  lines.push(`Рекламные кампании — <b>${escapeHtml(project.name)}</b>`);
  lines.push(`Всего кампаний: ${campaigns.campaigns.length}`);
  lines.push("");
  if (campaigns.campaigns.length === 0) {
    lines.push("Данные по кампаниям пока не загружены.");
  } else {
    campaigns.campaigns.slice(0, 5).forEach((campaign, index) => {
      if (index > 0) {
        lines.push("");
      }
      lines.push(`• <b>${escapeHtml(campaign.name)}</b> (${campaign.objective})`);
      lines.push(
        `  Показатель: ${campaign.leads} | Расход: ${formatMoney(
          campaign.spend,
          project.settings.currency,
          2,
        )}`,
      );
      lines.push(`  Показов: ${campaign.impressions} | Клики: ${campaign.clicks}`);
    });
  }
  return lines.join("\n");
};

export const buildPortalMessage = (project: ProjectRecord): string => {
  return `Портал проекта: <a href="${project.portalUrl}">${project.portalUrl}</a>`;
};
