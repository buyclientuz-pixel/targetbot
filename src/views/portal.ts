import { ProjectReport } from "../types";
import { escapeHtml, joinHtml } from "../utils/html";
import { renderLayout } from "./layout";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatFrequency,
  formatDateTime,
} from "../utils/format";

const STATUS_ICONS: Record<string, string> = {
  active: "🟢",
  pending: "🟡",
  paused: "⚪️",
  unknown: "⚪️",
};

const renderSummaryCard = (report: ProjectReport, timeZone: string): string => {
  const summary = report.summary;
  const statusIcon = STATUS_ICONS[report.status || "unknown"] || "⚪️";
  const paymentInfo = report.billing || {};
  const cardText = paymentInfo.card_last4 ? "•••• " + paymentInfo.card_last4 : "—";
  const lastUpdated = formatDateTime(report.updated_at, timeZone);
  const daysToPay = paymentInfo.days_to_pay;
  const progress = typeof daysToPay === "number" && daysToPay >= 0 ? Math.min(daysToPay, 30) : null;

  const header = joinHtml([
    '<div class="rounded-xl border border-slate-800 bg-slate-950 p-6 shadow-lg">',
    '<div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">',
    '<div class="text-2xl font-semibold">',
    statusIcon + " " + escapeHtml(report.project_name),
    '</div>',
    '<div class="text-sm text-slate-400">Последнее обновление: ' + escapeHtml(lastUpdated) + '</div>',
    '</div>',
    '<div class="mt-4 grid gap-4 md:grid-cols-2">',
    '<div class="space-y-2">',
    '<div class="text-sm uppercase text-slate-400">Карта</div>',
    '<div class="text-lg">' + escapeHtml(cardText) + '</div>',
    '</div>',
    '<div class="space-y-2">',
    '<div class="text-sm uppercase text-slate-400">Оплата через</div>',
    '<div class="text-lg">' + (daysToPay !== null && daysToPay !== undefined ? daysToPay + 'д' : '—') + '</div>',
    progress !== null
      ? '<div class="h-2 rounded-full bg-slate-800"><div class="h-2 rounded-full bg-emerald-500" style="width: ' +
        Math.max(0, (30 - progress) * 100 / 30) +
        '%"></div></div>'
      : '',
    '</div>',
    '</div>',
    '<hr class="my-6 border-slate-800" />',
    '<div class="grid gap-4 md:grid-cols-3">',
    '<div class="space-y-1">',
    '<div class="text-sm text-slate-400">Активные кампании</div>',
    '<div class="text-2xl font-semibold">' + formatNumber(summary.active_campaigns || 0) + '</div>',
    '</div>',
    '<div class="space-y-1">',
    '<div class="text-sm text-slate-400">Потрачено</div>',
    '<div class="text-2xl font-semibold">' + formatCurrency(summary.spend, report.currency) + '</div>',
    '</div>',
    '<div class="space-y-1">',
    '<div class="text-sm text-slate-400">Лиды</div>',
    '<div class="text-2xl font-semibold">' + formatNumber(summary.leads) + '</div>',
    '</div>',
    '</div>',
    '<div class="mt-6 grid gap-4 md:grid-cols-2">',
    metricRow('Клики', formatNumber(summary.clicks)),
    metricRow('Показы', formatNumber(summary.impressions)),
    metricRow('Частота', formatFrequency(summary.frequency)),
    metricRow('CPA', formatCurrency(summary.cpa, report.currency)),
    metricRow('CPC', formatCurrency(summary.cpc, report.currency)),
    metricRow('CTR', formatPercent(summary.ctr)),
    '</div>',
    '<hr class="my-6 border-slate-800" />',
    '<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">',
    '<a href="/portal/' + escapeHtml(report.project_id) + '/campaigns" class="inline-flex items-center justify-center rounded-lg border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/10">Все кампании</a>',
    report.chat_link
      ? '<a href="' + escapeHtml(report.chat_link) + '" class="inline-flex items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800">Чат клиента</a>'
      : '<span class="text-sm text-slate-500">Чат клиента не назначен</span>',
    '</div>',
    '</div>',
  ]);

  return header;
};

const metricRow = (label: string, value: string): string => {
  return '<div class="flex items-center justify-between rounded-lg bg-slate-900 px-4 py-3">' +
    '<span class="text-sm text-slate-400">' + escapeHtml(label) + '</span>' +
    '<span class="text-lg font-semibold">' + escapeHtml(value) + '</span>' +
    '</div>';
};

export const renderPortalPage = (report: ProjectReport, timeZone: string): string => {
  const content = joinHtml([
    '<div class="space-y-6">',
    renderSummaryCard(report, timeZone),
    '</div>',
  ]);

  const sidebar = '<div class="p-6 space-y-6">' +
    '<div class="text-sm font-semibold uppercase text-slate-500">Навигация</div>' +
    '<nav class="space-y-2">' +
    '<a class="block rounded-lg px-3 py-2 text-sm font-medium bg-slate-900 text-emerald-400" href="/portal/' +
    escapeHtml(report.project_id) + '">Сводка</a>' +
    '<a class="block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-900" href="/portal/' +
    escapeHtml(report.project_id) + '/campaigns">Кампании</a>' +
    '<a class="block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-900" href="/admin?project=' +
    escapeHtml(report.project_id) + '">Админ-панель</a>' +
    '</nav>' +
    '</div>';

  return renderLayout(content, { title: report.project_name + ' — портал', sidebar });
};
