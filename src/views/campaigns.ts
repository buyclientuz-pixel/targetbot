import { ProjectReport, CampaignMetric } from "../types";
import { escapeHtml, joinHtml } from "../utils/html";
import { renderLayout } from "./layout";
import { formatCurrency, formatNumber, formatPercent, formatDate } from "../utils/format";

const STATUS_ICONS: Record<string, string> = {
  ACTIVE: "🟢",
  PAUSED: "⚪️",
  ARCHIVED: "⚪️",
  DELETED: "⚪️",
  PENDING_REVIEW: "🟡",
  IN_REVIEW: "🟡",
};

const renderFilters = (projectId: string, period: string, onlyActive: boolean): string => {
  const options = [
    { value: "today", label: "Сегодня" },
    { value: "yesterday", label: "Вчера" },
    { value: "week", label: "Неделя" },
    { value: "month", label: "Месяц" },
    { value: "all", label: "Всё время" },
  ];

  const optionsHtml = options
    .map((option) =>
      `<option value="${option.value}"${(option.value === period ? ' selected' : '')}>${option.label}</option>`,
    )
    .join("");

  return (
    `<form method="get" class="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4 md:flex-row md:items-end"><div class="flex flex-col"><label class="text-sm text-slate-400">Период</label><select name="period" class="mt-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">${optionsHtml}</select></div><label class="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" name="onlyActive" value="1"${(onlyActive ? ' checked' : '')} class="h-4 w-4 rounded border-slate-700 bg-slate-900" /><span>Только активные</span>\${'</label>'}<div class="flex gap-3">\${'<button type="submit" class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">Фильтр</button>'}<a href="/api/project/\${escapeHtml(projectId)}/refresh" class="rounded-lg border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/10">Обновить</a>\${'</div>'}</form>`
  );
};

const renderTable = (campaigns: CampaignMetric[], currency: string): string => {
  const header =
    `<table class="min-w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-sm">${'<thead class="bg-slate-900 text-xs uppercase text-slate-400">'}<tr>${'<th class="px-4 py-3 text-left">Статус</th>'}<th class="px-4 py-3 text-left">Название</th>${'<th class="px-4 py-3 text-right">Потрачено</th>'}<th class="px-4 py-3 text-right">Лиды</th>${'<th class="px-4 py-3 text-right">Клики</th>'}<th class="px-4 py-3 text-right">Показы</th>${'<th class="px-4 py-3 text-right">CPA</th>'}<th class="px-4 py-3 text-right">CPC</th>${'<th class="px-4 py-3 text-right">CTR</th>'}<th class="px-4 py-3 text-right">Последняя активность</th>${'</tr>'}</thead>${'<tbody class="divide-y divide-slate-800 text-slate-100">'}`;

  const rows = campaigns
    .map((campaign) => {
      const statusIcon = STATUS_ICONS[campaign.status] || "⚪️";
      return (
        `<tr class="hover:bg-slate-900/70"><td class="px-4 py-3">${statusIcon}</td><td class="px-4 py-3 font-medium">${escapeHtml(campaign.name)}</td><td class="px-4 py-3 text-right">${formatCurrency(campaign.spend, currency)}</td><td class="px-4 py-3 text-right">${formatNumber(campaign.leads)}</td><td class="px-4 py-3 text-right">${formatNumber(campaign.clicks)}</td><td class="px-4 py-3 text-right">${formatNumber(campaign.impressions)}</td><td class="px-4 py-3 text-right">${formatCurrency(campaign.cpa, currency)}</td><td class="px-4 py-3 text-right">${formatCurrency(campaign.cpc, currency)}</td><td class="px-4 py-3 text-right">${formatPercent(campaign.ctr)}</td><td class="px-4 py-3 text-right">\${formatDate(campaign.last_active || campaign.status_updated_at || null)}</td>\${'</tr>'}`);
    })
    .join("");

  return `${header}${rows}</tbody></table>`;
};

export const renderCampaignsPage = (
  report: ProjectReport,
  options: { period: string; onlyActive: boolean },
): string => {
  const filtered = report.campaigns.filter((campaign) =>
    options.onlyActive ? campaign.status === "ACTIVE" : true,
  );

  const content = joinHtml([
    '<div class="space-y-6">',
    '<div class="flex items-center justify-between">',
    `<h1 class="text-2xl font-semibold">Кампании — ${escapeHtml(report.project_name)}</h1>`,
    `<a href="/portal/${escapeHtml(report.project_id)}" class="text-sm text-emerald-400 hover:text-emerald-300">← Назад к сводке</a>`,
    '</div>',
    renderFilters(report.project_id, options.period, options.onlyActive),
    filtered.length > 0
      ? renderTable(filtered, report.currency)
      : '<div class="rounded-xl border border-slate-800 bg-slate-950 p-6 text-center text-sm text-slate-400">Нет кампаний по выбранным фильтрам</div>',
    '</div>',
  ]);

  const sidebar = `<div class="p-6 space-y-6"><div class="text-sm font-semibold uppercase text-slate-500">Навигация</div><nav class="space-y-2"><a class="block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-900" href="/portal/${escapeHtml(report.project_id)}">Сводка</a><a class="block rounded-lg px-3 py-2 text-sm font-medium bg-slate-900 text-emerald-400" href="/portal/\${escapeHtml(report.project_id)}/campaigns">Кампании</a>\${'</nav>'}</div>`;

  return renderLayout(content, { title: `${report.project_name} — кампании`, sidebar });
};
