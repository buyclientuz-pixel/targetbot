import { AdminDashboardData, ProjectCard, MetaAccountInfo, DashboardLogEntry } from "../types";
import { escapeHtml, joinHtml } from "../utils/html";
import { renderLayout } from "./layout";
import { formatCurrency, formatDateTime } from "../utils/format";

const renderMetaStatus = (status: AdminDashboardData["meta_status"]): string => {
  const icon = status.ok ? "🟢" : "🔴";
  const issues = status.issues && status.issues.length > 0
    ? '<ul class="mt-2 space-y-1 text-sm text-red-400">' +
      status.issues.map((issue) => '<li>• ' + escapeHtml(issue) + '</li>').join("") +
      '</ul>'
    : '<p class="mt-2 text-sm text-slate-400">Подключение стабильно</p>';

  return (
    '<section class="rounded-xl border border-slate-800 bg-slate-950 p-6">' +
    '<div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">' +
    '<div>' +
    '<h2 class="text-lg font-semibold">Статус Facebook</h2>' +
    '<p class="text-sm text-slate-400">' + icon + ' ' + (status.account_name ? escapeHtml(status.account_name) : 'Неизвестно') + '</p>' +
    '</div>' +
    '<div class="text-sm text-slate-400">Обновлено: ' + escapeHtml(status.last_refresh || '—') + '</div>' +
    '</div>' +
    issues +
    '</section>'
  );
};

const renderAccounts = (accounts: MetaAccountInfo[]): string => {
  if (!accounts || accounts.length === 0) {
    return '<section class="rounded-xl border border-slate-800 bg-slate-950 p-6"><h2 class="text-lg font-semibold">Рекламные аккаунты</h2><p class="mt-2 text-sm text-slate-400">Нет данных об аккаунтах</p></section>';
  }

  const rows = accounts
    .map((account) => {
      return (
        '<tr class="hover:bg-slate-900/70">' +
        '<td class="px-4 py-3 font-medium">' + escapeHtml(account.name) + '</td>' +
        '<td class="px-4 py-3 text-sm text-slate-300">' + escapeHtml(account.status || '—') + '</td>' +
        '<td class="px-4 py-3 text-right">' + formatCurrency(account.balance ?? null, account.currency || 'USD') + '</td>' +
        '<td class="px-4 py-3 text-right">' + formatCurrency(account.spend_cap ?? null, account.currency || 'USD') + '</td>' +
        '<td class="px-4 py-3 text-sm text-slate-400">' + escapeHtml(account.payment_method || '—') + '</td>' +
        '<td class="px-4 py-3 text-sm text-slate-400">' + escapeHtml(account.last_update || '—') + '</td>' +
        '</tr>'
      );
    })
    .join("");

  return (
    '<section class="rounded-xl border border-slate-800 bg-slate-950 p-6">' +
    '<div class="flex items-center justify-between">' +
    '<h2 class="text-lg font-semibold">Рекламные аккаунты</h2>' +
    '<a class="text-sm text-emerald-400 hover:text-emerald-300" href="/api/meta/status">Обновить</a>' +
    '</div>' +
    '<div class="mt-4 overflow-x-auto">' +
    '<table class="min-w-full text-sm">' +
    '<thead class="bg-slate-900 text-xs uppercase text-slate-400">' +
    '<tr>' +
    '<th class="px-4 py-3 text-left">Название</th>' +
    '<th class="px-4 py-3 text-left">Статус</th>' +
    '<th class="px-4 py-3 text-right">Баланс</th>' +
    '<th class="px-4 py-3 text-right">Лимит</th>' +
    '<th class="px-4 py-3 text-left">Оплата</th>' +
    '<th class="px-4 py-3 text-left">Обновление</th>' +
    '</tr>' +
    '</thead>' +
    '<tbody class="divide-y divide-slate-800 text-slate-100">' +
    rows +
    '</tbody>' +
    '</table>' +
    '</div>' +
    '</section>'
  );
};

const renderProjectCard = (project: ProjectCard): string => {
  return (
    '<div class="rounded-xl border border-slate-800 bg-slate-950 p-4">' +
    '<div class="flex items-center justify-between">' +
    '<div>' +
    '<h3 class="text-lg font-semibold">' + escapeHtml(project.name) + '</h3>' +
    '<p class="text-sm text-slate-400">' + escapeHtml(project.status || '—') + '</p>' +
    '</div>' +
    '<a href="/portal/' + escapeHtml(project.id) + '" class="rounded-lg border border-emerald-500 px-3 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10">Открыть портал</a>' +
    '</div>' +
    (project.summary
      ? '<div class="mt-4 grid grid-cols-3 gap-3 text-sm">' +
        '<div><div class="text-slate-400">Потрачено</div><div class="font-semibold">' +
        formatCurrency(project.summary.spend, project.currency || 'USD') +
        '</div></div>' +
        '<div><div class="text-slate-400">Лиды</div><div class="font-semibold">' +
        escapeHtml(String(project.summary.leads)) +
        '</div></div>' +
        '<div><div class="text-slate-400">CTR</div><div class="font-semibold">' +
        escapeHtml(String(project.summary.ctr || '—')) +
        '</div></div>' +
        '</div>'
      : '<p class="mt-4 text-sm text-slate-500">Нет свежей сводки</p>') +
    '<div class="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">' +
    '<span>Обновлено: ' + escapeHtml(project.updated_at || '—') + '</span>' +
    (project.chat_link
      ? '<a href="' + escapeHtml(project.chat_link) + '" class="text-emerald-400 hover:text-emerald-300">Чат</a>'
      : '') +
    '</div>' +
    '</div>'
  );
};

const renderProjects = (projects: ProjectCard[]): string => {
  const cards = projects.map(renderProjectCard).join('');
  return (
    '<section class="rounded-xl border border-slate-800 bg-slate-950 p-6">' +
    '<div class="flex items-center justify-between">' +
    '<h2 class="text-lg font-semibold">Проекты</h2>' +
    '<form method="post" action="/api/project/refresh-all">' +
    '<button class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">Refresh All</button>' +
    '</form>' +
    '</div>' +
    '<div class="mt-4 grid gap-4 md:grid-cols-2">' +
    (cards || '<p class="text-sm text-slate-400">Нет проектов</p>') +
    '</div>' +
    '</section>'
  );
};

const renderLogs = (logs: DashboardLogEntry[]): string => {
  const rows = logs
    .slice(-20)
    .reverse()
    .map((log) =>
      '<div class="rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs">' +
        '<div class="flex justify-between">' +
        '<span class="font-semibold">' + escapeHtml(log.level.toUpperCase()) + '</span>' +
        '<span class="text-slate-400">' + escapeHtml(formatDateTime(log.timestamp)) + '</span>' +
        '</div>' +
        '<p class="mt-1 text-slate-200">' + escapeHtml(log.message) + '</p>' +
        '</div>',
    )
    .join("");

  return (
    '<section class="rounded-xl border border-slate-800 bg-slate-950 p-6">' +
    '<h2 class="text-lg font-semibold">Логи</h2>' +
    '<div class="mt-4 space-y-2">' +
    (rows || '<p class="text-sm text-slate-400">Пока пусто</p>') +
    '</div>' +
    '</section>'
  );
};

export const renderAdminPage = (data: AdminDashboardData): string => {
  const content = joinHtml([
    '<div class="space-y-6">',
    renderMetaStatus(data.meta_status),
    renderAccounts(data.accounts),
    renderProjects(data.projects),
    renderLogs(data.logs),
    '</div>',
  ]);

  const sidebar = '<div class="p-6 space-y-6">' +
    '<div class="text-sm font-semibold uppercase text-slate-500">Навигация</div>' +
    '<nav class="space-y-2">' +
    '<a class="block rounded-lg px-3 py-2 text-sm font-medium bg-slate-900 text-emerald-400" href="/admin">Обзор</a>' +
    '<a class="block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-900" href="/api/projects">Проекты (JSON)</a>' +
    '<a class="block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-900" href="/api/meta/status">Meta статус</a>' +
    '</nav>' +
    '</div>';

  return renderLayout(content, { title: 'Админ-панель', sidebar });
};
