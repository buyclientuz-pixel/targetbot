import type { BillingRecord } from "../domain/spec/billing";
import type { AutoreportsRecord } from "../domain/spec/autoreports";
import type { ProjectRecord } from "../domain/spec/project";
import type { ProjectLeadsListRecord } from "../domain/spec/project-leads";
import type { MetaCampaignsDocument } from "../domain/spec/meta-campaigns";
import type { PaymentsHistoryDocument } from "../domain/spec/payments-history";
import type { UserSettingsRecord } from "../domain/spec/user-settings";
import type { FbAuthRecord } from "../domain/spec/fb-auth";
import type { FreeChatRecord } from "../domain/project-chats";
import type { ProjectLeadNotificationSettings } from "../domain/project-settings";

import type { AnalyticsOverview, FinanceOverview, ProjectBundle } from "./data";
import { translateMetaObjective } from "../services/meta-objectives";
import type { LeadViewEntry, ProjectLeadsViewPayload } from "../services/project-leads-view";
import type { LeadsPanelContext } from "./leads-panel-state";

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

const formatDateTime = (value: string | null | undefined): string => {
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
  const hours = `${date.getUTCHours()}`.padStart(2, "0");
  const minutes = `${date.getUTCMinutes()}`.padStart(2, "0");
  return `${day}.${month}.${year}, ${hours}:${minutes}`;
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

const describeAutoreportTargets = (autoreports: AutoreportsRecord): string => {
  const segments: string[] = [];
  segments.push(`👥 чат — ${autoreports.sendToChat ? "вкл" : "выкл"}`);
  segments.push(`👤 админ — ${autoreports.sendToAdmin ? "вкл" : "выкл"}`);
  return segments.join(", ");
};

const describePaymentAlertTargets = (alerts: AutoreportsRecord["paymentAlerts"]): string => {
  const segments: string[] = [];
  segments.push(`👥 чат — ${alerts.sendToChat ? "вкл" : "выкл"}`);
  segments.push(`👤 админ — ${alerts.sendToAdmin ? "вкл" : "выкл"}`);
  return segments.join(", ");
};

const describeLeadNotificationTargets = (settings: ProjectLeadNotificationSettings): string => {
  const segments: string[] = [];
  segments.push(`👥 чат — ${settings.sendToChat ? "вкл" : "выкл"}`);
  segments.push(`👤 админ — ${settings.sendToAdmin ? "вкл" : "выкл"}`);
  return segments.join(", ");
};

const summariseAutoreportRecipients = (autoreports: AutoreportsRecord): string => {
  const targets: string[] = [];
  if (autoreports.sendToChat) {
    targets.push("чат");
  }
  if (autoreports.sendToAdmin) {
    targets.push("админ");
  }
  if (targets.length === 0) {
    return "каналы: отключены";
  }
  return `каналы: ${targets.join(" + ")}`;
};

const describeAutoreportMode = (mode: string): string => {
  switch (mode) {
    case "today":
      return "сегодня";
    case "yesterday":
      return "вчера";
    case "week":
      return "неделя";
    case "month":
      return "месяц";
    case "all":
    case "max":
      return "максимум";
    case "yesterday_plus_week":
      return "вчера + неделя";
    default:
      return mode;
  }
};

const formatKpi = (project: ProjectRecord): string => {
  const mode = project.settings.kpi.mode === "auto" ? "авто" : "ручной";
  return `${mode}, ${escapeHtml(project.settings.kpi.label)}`;
};

type KpiType = ProjectRecord["settings"]["kpi"]["type"];

const computeCpa = (spend: number | null, kpiValue: number | null): number | null => {
  if (spend == null || kpiValue == null || kpiValue === 0) {
    return null;
  }
  return spend / kpiValue;
};

const resolveCampaignKpiValue = (
  campaign: MetaCampaignsDocument["campaigns"][number],
  fallbackType: KpiType,
): number => {
  const kpiType = campaign.kpiType ?? fallbackType;
  switch (kpiType) {
    case "MESSAGE":
      return campaign.messages;
    case "CLICK":
      return campaign.clicks;
    case "VIEW":
      return campaign.impressions;
    case "PURCHASE":
      return campaign.leads;
    case "LEAD":
    default:
      return campaign.leads;
  }
};

const resolveSummaryKpiValue = (summary: MetaCampaignsDocument["summary"], kpiType: KpiType): number => {
  switch (kpiType) {
    case "MESSAGE":
      return summary.messages;
    case "CLICK":
      return summary.clicks;
    case "VIEW":
      return summary.impressions;
    case "PURCHASE":
      return summary.leads;
    case "LEAD":
    default:
      return summary.leads;
  }
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

export const buildMenuMessage = (options: { fbAuth: FbAuthRecord | null }): string => {
  const lines: string[] = [];
  if (options.fbAuth) {
    lines.push("Facebook: ✅ Подключено");
    lines.push(`Аккаунт: <b>${options.fbAuth.userId}</b>`);
    lines.push(`Токен действителен до: <b>${formatDateTime(options.fbAuth.expiresAt)}</b>`);
    lines.push("Все разделы доступны через кнопки ниже.");
  } else {
    lines.push("Facebook: ⚠️ Не подключено");
    lines.push("Нажмите «Авторизация Facebook», чтобы подключить рекламный кабинет.");
    lines.push("После получения токена пришлите его в этот чат.");
  }
  lines.push("");
  lines.push("Главное меню");
  lines.push("Выберите раздел: авторизация, проекты, аналитика или финансовые настройки.");
  return lines.join("\n");
};

export const buildProjectCreationMessage = (options: {
  accounts: { id: string; name: string; currency: string }[];
  hasProjects: boolean;
}): string => {
  const lines: string[] = [];
  if (options.accounts.length === 0) {
    lines.push("Не найдено рекламных аккаунтов.");
    lines.push("Подключите Facebook в разделе «Авторизация Facebook».\n");
  } else {
    lines.push("Выберите рекламный аккаунт через кнопки ниже.");
    lines.push("Бот показывает текущие расходы и статус чата прямо в кнопках.");
    lines.push("✅ — чат подключён, нажатие откроет карточку проекта.");
    lines.push("⚙️ — чат не привязан, нажатие откроет выбор свободной группы.");
  }
  if (!options.hasProjects) {
    lines.push("");
    lines.push("У вас пока нет проектов. Добавьте их через портал или админ-панель.");
  }
  return lines.join("\n");
};

export const buildChatBindingMessage = (options: { accountName: string }): string =>
  [
    `Выбран рекламный аккаунт <b>${escapeHtml(options.accountName)}</b>.`,
    "Теперь выберите свободную чат-группу для этого проекта.",
    "1️⃣ Выберите чат из списка доступных, где бот уже зарегистрирован через /reg.",
    "2️⃣ Или нажмите «Отправить ссылку вручную» и пришлите ссылку / @username / ID.",
    "Бот автоматически найдёт или создаст тему «Таргет» и обновит привязку.",
  ].join("\n");

export const buildNoFreeChatsMessage = (): string =>
  [
    "У вас нет свободных чат-групп.",
    "Добавьте новые, отправив команду /reg в нужной Telegram-группе.",
  ].join("\n");

export const buildChatAlreadyUsedMessage = (): string =>
  "❌ Эта чат-группа уже используется другим проектом. Выберите другую.";

export const buildProjectCardMessage = (bundle: ProjectBundle): string => {
  const { project, billing, leads, campaigns, autoreports } = bundle;
  const spend = campaigns.summary.spend ?? null;
  const kpiType = project.settings.kpi.type;
  const kpiValue = resolveSummaryKpiValue(campaigns.summary, kpiType);
  const todaysValue = (kpiType === "MESSAGE" ? campaigns.summary.messages : leads.stats.today) ?? null;
  const cpa = computeCpa(spend, todaysValue ?? kpiValue);

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
      `🕒 Автоотчёты: <b>${autoreports.time}</b> (вкл, режим: ${describeAutoreportMode(
        autoreports.mode,
      )}, ${summariseAutoreportRecipients(autoreports)})`,
    );
  } else {
    lines.push("🕒 Автоотчёты: выключены");
  }
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

const formatLeadSnippet = (lead: LeadViewEntry): string => {
  const contact = lead.phone && lead.phone.trim().length > 0 ? lead.phone : "—";
  return `• <b>${escapeHtml(lead.name)}</b> — ${escapeHtml(contact)}`;
};

const describeFormName = (
  view: ProjectLeadsViewPayload,
  formId: string | null,
): string => {
  const summary = view.forms.find((form) => (form.formId ?? null) === (formId ?? null));
  if (summary) {
    return summary.name;
  }
  if (formId && formId.length > 0) {
    return `Форма ${formId}`;
  }
  return "Без формы";
};

const findFormSummary = (view: ProjectLeadsViewPayload, formId: string | null) =>
  view.forms.find((form) => (form.formId ?? null) === (formId ?? null)) ?? null;

export const buildLeadsMessage = (
  project: ProjectRecord,
  view: ProjectLeadsViewPayload,
  context: LeadsPanelContext,
  leadSettings: ProjectLeadNotificationSettings,
): string => {
  const lines: string[] = [];
  lines.push(`Лиды проекта <b>${escapeHtml(project.name)}</b>`);
  lines.push(`Период: ${view.period.from} — ${view.period.to}`);
  lines.push(`За период: <b>${view.periodStats.total}</b> (сегодня: <b>${view.periodStats.today}</b>)`);
  if (view.stats.total !== view.periodStats.total || view.stats.today !== view.periodStats.today) {
    lines.push(`Всего в базе: <b>${view.stats.total}</b> (сегодня: <b>${view.stats.today}</b>)`);
  }
  lines.push("");
  lines.push(`🔔 Уведомления: ${describeLeadNotificationTargets(leadSettings)}`);
  lines.push("");

  if (context.mode === "form") {
    const targetFormId = context.formId ?? null;
    const formSummary = findFormSummary(view, targetFormId);
    const leadsForForm = view.leads.filter((lead) => (lead.formId ?? null) === targetFormId);
    const maxPage = Math.max(Math.ceil(leadsForForm.length / 5) - 1, 0);
    const safePage = Math.min(context.page, maxPage);
    const startIndex = safePage * 5;
    const pageLeads = leadsForForm.slice(startIndex, startIndex + 5);
    const formName = describeFormName(view, targetFormId);
    lines.push(`Форма: <b>${escapeHtml(formName)}</b>`);
    lines.push(
      `За период: <b>${formSummary?.periodTotal ?? leadsForForm.length}</b> (всего: <b>${
        formSummary?.total ?? leadsForForm.length
      }</b>)`,
    );
    lines.push("");
    lines.push("Последние контакты:");
    if (leadsForForm.length === 0) {
      lines.push("В этой форме нет лидов за выбранный период.");
    } else {
      lines.push(`Страница ${safePage + 1} из ${Math.max(maxPage + 1, 1)}.`);
      pageLeads.forEach((lead, index) => {
        const ordinal = startIndex + index + 1;
        lines.push(`${ordinal}. ${formatLeadSnippet(lead)}`);
        lines.push(`   ${formatDateTime(lead.createdAt)}`);
      });
    }
  } else {
    if (view.forms.length === 0) {
      lines.push("Лиды ещё не загружены. Нажмите обновление портала и попробуйте снова.");
    } else {
      lines.push("Формы и лиды за выбранный период:");
      view.forms.forEach((form, index) => {
        const totalHint = form.total !== form.periodTotal ? ` (всего: ${form.total})` : "";
        lines.push(`${index + 1}. <b>${escapeHtml(form.name)}</b> — ${form.periodTotal}${totalHint}`);
      });
      lines.push("");
      lines.push("Нажмите на форму, чтобы открыть список лидов.");
    }
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
  const kpiType = project.settings.kpi.type;
  const kpiLabel = project.settings.kpi.label;
  const summaryKpiValue = resolveSummaryKpiValue(campaigns.summary, kpiType);
  const summaryMessages = campaigns.summary.messages ?? 0;
  lines.push(`💰 Затраты: <b>${formatMoney(campaigns.summary.spend, project.settings.currency)}</b>`);
  lines.push(`👀 Показов: <b>${campaigns.summary.impressions}</b>`);
  lines.push(`👆 Кликов: <b>${campaigns.summary.clicks}</b>`);
  lines.push(`🎯 ${escapeHtml(kpiLabel)}: <b>${summaryKpiValue}</b>`);
  lines.push(`💬 Сообщений: <b>${summaryMessages}</b>`);
  const cpa = computeCpa(campaigns.summary.spend, summaryKpiValue) ?? null;
  lines.push(`📊 CPA: <b>${cpa ? formatMoney(cpa, project.settings.currency) : "—"}</b>`);
  lines.push("");
  if (campaigns.campaigns.length === 0) {
    lines.push("Нет данных по кампаниям.");
  } else {
    lines.push("Топ-3 кампании по KPI:");
    campaigns.campaigns
      .slice(0, 3)
      .forEach((campaign, index) => {
        const objectiveLabel = translateMetaObjective(campaign.objective);
        const kpiValue = resolveCampaignKpiValue(campaign, kpiType);
        lines.push(
          `${index + 1}️⃣ <b>${escapeHtml(campaign.name)}</b> — ${kpiValue} ${escapeHtml(kpiLabel)} ` +
            `${objectiveLabel} за ${formatMoney(campaign.spend, project.settings.currency, 2)}`,
        );
      });
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
      lines.push(`• <b>${escapeHtml(campaign.name)}</b> (${translateMetaObjective(campaign.objective)})`);
      const kpiValue = resolveCampaignKpiValue(campaign, project.settings.kpi.type);
      lines.push(
        `  ${escapeHtml(project.settings.kpi.label)}: ${kpiValue} | Расход: ${formatMoney(
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
  if (!project.portalUrl) {
    return `Портал проекта <b>${escapeHtml(project.name)}</b> пока не настроен.`;
  }
  return `Портал проекта: <a href="${project.portalUrl}">${project.portalUrl}</a>`;
};

export const buildExportMessage = (project: ProjectRecord): string => {
  return (
    `Экспорт данных проекта <b>${escapeHtml(project.name)}</b>\n` +
    "Выберите, что выгрузить: лиды, кампании или оплаты."
  );
};

const formatSpendMap = (map: Record<string, number>): string => {
  const entries = Object.entries(map);
  if (entries.length === 0) {
    return "—";
  }
  return entries
    .map(([currency, amount]) => formatMoney(amount, currency))
    .join(" / ");
};

export const buildAnalyticsOverviewMessage = (overview: AnalyticsOverview): string => {
  const lines: string[] = [];
  lines.push("📊 Сводная аналитика по проектам");
  lines.push(`Всего проектов: ${overview.projects.length}`);
  lines.push(`Расход сегодня: ${formatSpendMap(overview.spendByCurrency)}`);
  lines.push(`Лиды: ${overview.totalLeads}`);
  lines.push(`Сообщения: ${overview.totalMessages}`);
  lines.push("");
  if (overview.projects.length === 0) {
    lines.push("У вас пока нет подключённых проектов. Добавьте их через портал или админ-панель.");
  } else {
    lines.push("По проектам:");
    overview.projects.forEach((project, index) => {
      lines.push(
        `${index + 1}. <b>${escapeHtml(project.name)}</b> — ${formatMoney(project.spend, project.currency)} | ` +
          `Лиды: ${project.leads}, Сообщения: ${project.messages}`,
      );
    });
  }
  return lines.join("\n");
};

export const buildUsersMessage = (
  projects: ProjectRecord[],
  adminIds: number[],
  telegramId: number,
): string => {
  const lines: string[] = [];
  lines.push("👥 Пользователи и доступы");
  lines.push(`Ваш Telegram ID: <code>${telegramId}</code>`);
  if (adminIds.length > 0) {
    lines.push(`Администраторы: ${adminIds.map((id) => `<code>${id}</code>`).join(", ")}`);
  }
  lines.push("");
  if (projects.length === 0) {
    lines.push("Нет проектов, привязанных к вашему профилю.");
  } else {
    lines.push("Доступы по проектам:");
    projects.forEach((project) => {
      lines.push(
        `• <b>${escapeHtml(project.name)}</b> — владелец <code>${project.ownerId}</code>, рекл. кабинет ${
          project.adAccountId ?? "не назначен"
        }`,
      );
    });
  }
  lines.push("");
  lines.push("Чтобы добавить пользователя к проекту, используйте портал или обратитесь к администратору.");
  return lines.join("\n");
};

export const buildFinanceOverviewMessage = (overview: FinanceOverview): string => {
  const lines: string[] = [];
  lines.push("💳 Финансы (все проекты)");
  lines.push(`Сумма тарифов: ${formatSpendMap(overview.spendByCurrency)}`);
  lines.push("");
  if (overview.projects.length === 0) {
    lines.push("Нет проектов для отображения биллинга.");
  } else {
    overview.projects.forEach((project, index) => {
      lines.push(
        `${index + 1}. <b>${escapeHtml(project.name)}</b> — тариф ${formatTariff(
          project.tariff,
          project.currency,
        )}, следующий платёж ${formatDate(project.nextPaymentDate)}`,
      );
      lines.push(`   Автобиллинг: ${project.autobilling ? "включён" : "выключен"}`);
      if (project.payments.length > 0) {
        const lastPayment = project.payments[0];
        lines.push(
          `   Последняя оплата: ${formatMoney(lastPayment.amount, lastPayment.currency)} (${formatDate(
            lastPayment.periodFrom,
          )} → ${formatDate(lastPayment.periodTo)})`,
        );
      }
    });
  }
  return lines.join("\n");
};

export interface WebhookStatusMessage {
  currentUrl: string | null;
  expectedUrl: string;
  pendingUpdates: number;
  lastError?: string | null;
  lastErrorDate?: string | null;
}

export const buildWebhookStatusMessage = (status: WebhookStatusMessage): string => {
  const lines: string[] = [];
  lines.push("🤖 Telegram Webhook");
  lines.push(`Ожидаемый URL: <code>${escapeHtml(status.expectedUrl)}</code>`);
  lines.push(
    `Текущий URL: ${
      status.currentUrl ? `<code>${escapeHtml(status.currentUrl)}</code>` : "не установлен"
    }`,
  );
  lines.push(`Ожидающих обновлений: ${status.pendingUpdates}`);
  if (status.lastError) {
    lines.push("");
    lines.push(`⚠️ Последняя ошибка: ${escapeHtml(status.lastError)}`);
    if (status.lastErrorDate) {
      lines.push(`Время: ${status.lastErrorDate}`);
    }
  }
  lines.push("");
  lines.push("Нажмите «🔄 Обновить вебхук», чтобы переустановить адрес автоматически.");
  return lines.join("\n");
};

export const buildSettingsMessage = (settings: UserSettingsRecord): string => {
  const lines: string[] = [];
  lines.push("⚙ Настройки профиля");
  lines.push(`Язык интерфейса: <b>${settings.language.toUpperCase()}</b>`);
  lines.push(`Часовой пояс: <b>${escapeHtml(settings.timezone)}</b>`);
  lines.push("");
  lines.push("Используйте кнопки ниже, чтобы изменить язык или таймзону.");
  return lines.join("\n");
};

export const buildChatInfoMessage = (project: ProjectRecord): string => {
  if (!project.chatId) {
    return (
      `Для проекта <b>${escapeHtml(project.name)}</b> пока не настроен чат.\n` +
      "Привяжите чат, чтобы отправлять туда лиды, отчёты и алерты."
    );
  }
  const link = formatChatLink(project.chatId);
  const anchor = link ? `<a href="${link}">Перейти</a>` : "Перейти";
  return (
    `Текущая чат-группа проекта <b>${escapeHtml(project.name)}</b>: ${anchor} (ID: ${project.chatId}).\n` +
    "Используйте кнопки ниже, чтобы изменить или отвязать чат."
  );
};

export const buildChatChangeMessage = (
  project: ProjectRecord,
  chats: FreeChatRecord[],
): string => {
  const lines: string[] = [];
  lines.push(`Изменить чат-группу — <b>${escapeHtml(project.name)}</b>`);
  lines.push(
    "1️⃣ Выберите чат из списка доступных, где бот уже добавлен админом, или\n2️⃣ Нажмите «Отправить ссылку вручную» и пришлите ссылку/@username/ID.",
  );
  if (chats.length === 0) {
    lines.push("");
    lines.push("Свободных чатов пока нет — добавьте бота в группу и попробуйте снова.");
  }
  return lines.join("\n");
};

export const buildAutoreportsMessage = (
  project: ProjectRecord,
  autoreports: AutoreportsRecord,
): string => {
  const lines: string[] = [];
  lines.push(`Авто-отчёты — <b>${escapeHtml(project.name)}</b>`);
  lines.push(`Статус: ${autoreports.enabled ? "включены" : "выключены"}`);
  lines.push(`Время: ${autoreports.time}`);
  lines.push(`Формат: ${describeAutoreportMode(autoreports.mode)}`);
  lines.push(`Получатели: ${describeAutoreportTargets(autoreports)}`);
  lines.push(
    `💳 Аллерт оплат: ${autoreports.paymentAlerts.enabled ? "включён" : "выключен"} (${describePaymentAlertTargets(
      autoreports.paymentAlerts,
    )})`,
  );
  return lines.join("\n");
};

export const buildKpiMessage = (project: ProjectRecord): string => {
  const lines: string[] = [];
  lines.push(`🎯 KPI проекта — <b>${escapeHtml(project.name)}</b>`);
  lines.push(`Режим: ${project.settings.kpi.mode === "auto" ? "авто" : "ручной"}`);
  lines.push(`Тип: ${project.settings.kpi.type} (${escapeHtml(project.settings.kpi.label)})`);
  return lines.join("\n");
};

export const buildProjectEditMessage = (project: ProjectRecord): string => {
  const lines: string[] = [];
  lines.push(`Изменить данные проекта — <b>${escapeHtml(project.name)}</b>`);
  lines.push("Выберите, что изменить: название, рекламный кабинет или владельца.");
  return lines.join("\n");
};

export const buildDeleteConfirmationMessage = (project: ProjectRecord): string => {
  return (
    `Вы уверены, что хотите удалить проект <b>${escapeHtml(project.name)}</b>?\n` +
    "Это действие необратимо. Все данные по проекту, лидам и оплатам будут удалены."
  );
};

export const buildLeadDetailMessage = (
  project: ProjectRecord,
  lead: ProjectLeadsListRecord["leads"][number],
): string => {
  const lines: string[] = [];
  lines.push(`Лид проекта <b>${escapeHtml(project.name)}</b>`);
  lines.push(`Имя: <b>${escapeHtml(lead.name)}</b>`);
  lines.push(`Телефон: ${escapeHtml(lead.phone)}`);
  lines.push(`Получен: ${formatDate(lead.createdAt)}`);
  lines.push(`Источник: ${escapeHtml(lead.source)}`);
  lines.push(`Кампания: ${escapeHtml(lead.campaignName)}`);
  lines.push(`Текущий статус: ${lead.status}`);
  return lines.join("\n");
};
