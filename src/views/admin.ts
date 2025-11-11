import {
  AdminDashboardData,
  DashboardLogEntry,
  MetaAccountInfo,
  ProjectCard,
  StorageOverview,
  TokenStatus,
} from "../types";
import { escapeHtml, joinHtml } from "../utils/html";
import { renderLayout } from "./layout";
import { formatCurrency, formatDateTime } from "../utils/format";

const statusIcon = (status?: string | null): string => {
  const normalized = (status || "").toLowerCase();
  if (normalized.startsWith("active")) {
    return "🟢";
  }
  if (normalized.startsWith("pend") || normalized.includes("review")) {
    return "🟡";
  }
  if (!normalized) {
    return "⚪️";
  }
  return "⚪️";
};

const safe = (value: string | null | undefined, fallback = "—"): string => {
  if (value === null || value === undefined) {
    return fallback;
  }
  const text = String(value).trim();
  return text ? escapeHtml(text) : fallback;
};

const renderProjectCard = (project: ProjectCard): string => {
  const icon = statusIcon(project.status);
  const chatLink = project.chat_link
    ? '<a class="text-emerald-400 hover:text-emerald-300" href="' + escapeHtml(project.chat_link) + '">Чат</a>'
    : project.chat_username
    ? '<span class="text-slate-400">@' + escapeHtml(project.chat_username.replace(/^@/, "")) + '</span>'
    : '<span class="text-slate-500">Чат не настроен</span>';
  const portalLink = project.portal_url
    ? '<a class="rounded-lg border border-emerald-500 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10" href="' +
      escapeHtml(project.portal_url) +
      '" target="_blank" rel="noopener">Портал</a>'
    : '<span class="text-xs text-slate-500">Портал отключён</span>';
  const alerts = project.alerts_enabled === false
    ? '<span class="inline-flex items-center rounded-full bg-red-900/40 px-2 py-0.5 text-xs text-red-300">Алерты выкл.</span>'
    : '<span class="inline-flex items-center rounded-full bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-300">Алерты вкл.</span>';
  const silent = project.silent_weekends
    ? '<span class="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">Тихие выходные</span>'
    : '';
  const nextPayment = project.billing?.next_payment || project.billing?.next_payment_date || null;
  const billingRow = nextPayment
    ? '<div class="text-sm text-slate-300">💳 Следующая оплата: ' + safe(nextPayment) + '</div>'
    : '';
  const managerRow = project.manager
    ? '<div class="text-sm text-slate-300">Менеджер: ' + safe(project.manager) + '</div>'
    : '';
  const lastSync = project.last_sync || project.updated_at || null;
  const infoRows = joinHtml([
    '<div class="text-sm text-slate-300">' + icon + ' ' + safe(project.status || "") + '</div>',
    project.account_name
      ? '<div class="text-sm text-slate-400">Аккаунт: ' + safe(project.account_name) + '</div>'
      : '',
    billingRow,
    managerRow,
    lastSync
      ? '<div class="text-xs text-slate-500">Синхронизировано: ' + escapeHtml(lastSync) + '</div>'
      : '',
  ]);

  const summary = project.summary
    ? '<div class="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">' +
      '<div><div class="text-slate-500">Потрачено</div><div class="font-semibold">' +
      escapeHtml(formatCurrency(project.summary.spend, project.currency || "USD")) +
      '</div></div>' +
      '<div><div class="text-slate-500">Лиды</div><div class="font-semibold">' +
      escapeHtml(String(project.summary.leads ?? "—")) +
      '</div></div>' +
      '<div><div class="text-slate-500">Клики</div><div class="font-semibold">' +
      escapeHtml(String(project.summary.clicks ?? "—")) +
      '</div></div>' +
      '<div><div class="text-slate-500">CTR</div><div class="font-semibold">' +
      escapeHtml(String(project.summary.ctr ?? "—")) +
      '</div></div>' +
      '</div>'
    : '<p class="mt-4 text-sm text-slate-500">Нет свежей сводки</p>';

  const badgeRow = joinHtml([
    alerts,
    silent,
  ]);

  return (
    '<div class="rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-lg shadow-slate-950/40">' +
    '<div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">' +
    '<div>' +
    '<h3 class="text-xl font-semibold">' + escapeHtml(project.name) + '</h3>' +
    '<div class="mt-1 flex flex-wrap items-center gap-3 text-sm">' +
    infoRows +
    '</div>' +
    '</div>' +
    '<div class="flex flex-col items-end gap-2 text-sm">' +
    portalLink +
    chatLink +
    '</div>' +
    '</div>' +
    (badgeRow ? '<div class="mt-3 flex flex-wrap gap-2">' + badgeRow + '</div>' : '') +
    summary +
    '</div>'
  );
};

const renderProjectsTab = (projects: ProjectCard[]): string => {
  if (!projects.length) {
    return '<div class="rounded-2xl border border-slate-800 bg-slate-950 p-8 text-center text-slate-400">Проекты не найдены.</div>';
  }
  return '<div class="grid gap-5 lg:grid-cols-2">' + projects.map(renderProjectCard).join("") + '</div>';
};

const renderBillingRow = (project: ProjectCard): string => {
  const billing = project.billing || {};
  const amount = billing.amount !== undefined && billing.amount !== null
    ? formatCurrency(billing.amount, billing.currency || project.currency || "USD")
    : "—";
  const status = billing.status
    ? '<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs ' +
      (billing.status === "overdue"
        ? 'bg-red-900/40 text-red-300'
        : billing.status === "due"
        ? 'bg-yellow-900/30 text-yellow-200'
        : 'bg-emerald-900/30 text-emerald-200') +
      '">' + escapeHtml(billing.status) + '</span>'
    : '<span class="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">—</span>';
  const nextPayment = billing.next_payment || billing.next_payment_date || "—";
  const lastPayment = billing.last_payment || "—";

  return (
    '<tr class="border-b border-slate-800/60 hover:bg-slate-900/60">' +
    '<td class="px-4 py-3 font-medium">' + escapeHtml(project.name) + '</td>' +
    '<td class="px-4 py-3 text-sm text-slate-300">' + escapeHtml(String(project.billing_day ?? "—")) + '</td>' +
    '<td class="px-4 py-3 text-sm text-slate-300">' + escapeHtml(lastPayment) + '</td>' +
    '<td class="px-4 py-3 text-sm text-slate-300">' + escapeHtml(nextPayment) + '</td>' +
    '<td class="px-4 py-3 text-sm text-slate-300">' + escapeHtml(amount) + '</td>' +
    '<td class="px-4 py-3 text-right">' + status + '</td>' +
    '</tr>'
  );
};

const renderBillingTab = (projects: ProjectCard[]): string => {
  const rows = projects.map(renderBillingRow).join("");
  return (
    '<div class="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">' +
    '<div class="overflow-x-auto">' +
    '<table class="min-w-full text-sm">' +
    '<thead class="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">' +
    '<tr>' +
    '<th class="px-4 py-3 text-left">Проект</th>' +
    '<th class="px-4 py-3 text-left">День оплаты</th>' +
    '<th class="px-4 py-3 text-left">Последняя оплата</th>' +
    '<th class="px-4 py-3 text-left">Следующая оплата</th>' +
    '<th class="px-4 py-3 text-left">Сумма</th>' +
    '<th class="px-4 py-3 text-right">Статус</th>' +
    '</tr>' +
    '</thead>' +
    '<tbody class="divide-y divide-slate-800">' + (rows || '<tr><td colspan="6" class="px-4 py-6 text-center text-slate-400">Нет данных по оплатам</td></tr>') + '</tbody>' +
    '</table>' +
    '</div>' +
    '</div>'
  );
};

const renderMetaStatus = (status: AdminDashboardData["meta_status"]): string => {
  const hasIssues = Boolean(status.issues && status.issues.length > 0);
  const icon = !status.ok ? "🔴" : hasIssues ? "🟡" : "🟢";
  const issues = hasIssues
    ? '<ul class="mt-3 space-y-1 text-sm text-red-400">' +
      status.issues!.map((issue) => '<li>• ' + escapeHtml(issue) + '</li>').join("") +
      '</ul>'
    : '<p class="mt-3 text-sm text-slate-400">Подключение стабильно</p>';
  return (
    '<div class="rounded-2xl border border-slate-800 bg-slate-950 p-6">' +
    '<div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">' +
    '<div>' +
    '<h2 class="text-lg font-semibold">Статус Facebook</h2>' +
    '<p class="text-sm text-slate-300">' + icon + ' ' + safe(status.account_name || "Неизвестно") + '</p>' +
    '</div>' +
    '<div class="text-sm text-slate-400">Обновлено: ' + safe(status.last_refresh || "—") + '</div>' +
    '</div>' +
    issues +
    '</div>'
  );
};

const renderAccounts = (accounts: MetaAccountInfo[]): string => {
  if (!accounts.length) {
    return '<div class="rounded-2xl border border-slate-800 bg-slate-950 p-6 text-sm text-slate-400">Нет данных об аккаунтах</div>';
  }
  const rows = accounts
    .map((account) =>
      '<tr class="border-b border-slate-800/60 hover:bg-slate-900/60">' +
      '<td class="px-4 py-3 font-medium">' + safe(account.name) + '</td>' +
      '<td class="px-4 py-3 text-sm text-slate-300">' + safe(account.status) + '</td>' +
      '<td class="px-4 py-3 text-right">' + escapeHtml(formatCurrency(account.balance ?? null, account.currency || "USD")) + '</td>' +
      '<td class="px-4 py-3 text-right">' + escapeHtml(formatCurrency(account.spend_cap ?? null, account.currency || "USD")) + '</td>' +
      '<td class="px-4 py-3 text-sm text-slate-400">' + safe(account.payment_method) + '</td>' +
      '<td class="px-4 py-3 text-sm text-slate-400">' + safe(account.last_update) + '</td>' +
      '</tr>',
    )
    .join("");
  return (
    '<div class="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">' +
    '<div class="overflow-x-auto">' +
    '<table class="min-w-full text-sm">' +
    '<thead class="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">' +
    '<tr>' +
    '<th class="px-4 py-3 text-left">Название</th>' +
    '<th class="px-4 py-3 text-left">Статус</th>' +
    '<th class="px-4 py-3 text-right">Баланс</th>' +
    '<th class="px-4 py-3 text-right">Лимит</th>' +
    '<th class="px-4 py-3 text-left">Оплата</th>' +
    '<th class="px-4 py-3 text-left">Обновление</th>' +
    '</tr>' +
    '</thead>' +
    '<tbody class="divide-y divide-slate-800">' + rows + '</tbody>' +
    '</table>' +
    '</div>' +
    '</div>'
  );
};

const renderTokens = (tokens: TokenStatus[]): string => {
  const rows = tokens
    .map((token) => {
      const icon = token.configured ? "🟢" : "🔴";
      const statusText = token.configured ? "Настроено" : "Отсутствует";
      const hint = token.hint ? '<span class="text-slate-500">(' + escapeHtml(token.hint) + ')</span>' : '';
      return (
        '<div class="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">' +
        '<div>' +
        '<div class="text-sm font-semibold">' + icon + ' ' + escapeHtml(token.name) + '</div>' +
        hint +
        '</div>' +
        '<div class="text-sm ' + (token.configured ? 'text-emerald-400' : 'text-red-400') + '">' + statusText + '</div>' +
        '</div>'
      );
    })
    .join("");
  return (
    '<div class="space-y-3">' + (rows || '<p class="text-sm text-slate-400">Нет данных</p>') + '</div>'
  );
};

const renderLogs = (logs: DashboardLogEntry[]): string => {
  const rows = logs
    .slice(-30)
    .reverse()
    .map((log) =>
      '<div class="rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs">' +
      '<div class="flex justify-between">' +
      '<span class="font-semibold">' + escapeHtml(log.level.toUpperCase()) + '</span>' +
      '<span class="text-slate-400">' + escapeHtml(formatDateTime(log.timestamp)) + '</span>' +
      '</div>' +
      '<p class="mt-1 text-slate-100">' + escapeHtml(log.message) + '</p>' +
      '</div>',
    )
    .join("");
  return rows || '<p class="text-sm text-slate-400">Пока пусто</p>';
};

const renderStorage = (storage: StorageOverview): string => {
  const cells = [
    { label: "Отчёты", value: storage.reports },
    { label: "Проекты", value: storage.projects },
    { label: "Оплаты", value: storage.billing },
    { label: "Алерты", value: storage.alerts },
  ];
  const stats = cells
    .map(
      (cell) =>
        '<div class="rounded-xl border border-slate-800 bg-slate-900 p-4 text-center">' +
        '<div class="text-2xl font-bold text-emerald-300">' + escapeHtml(String(cell.value)) + '</div>' +
        '<div class="mt-1 text-xs uppercase tracking-wide text-slate-400">' + escapeHtml(cell.label) + '</div>' +
        '</div>',
    )
    .join("");
  const fallback = storage.kvFallbacks === null || storage.kvFallbacks === undefined
    ? ''
    : '<p class="mt-3 text-xs text-slate-400">Fallback KV записей: ' + escapeHtml(String(storage.kvFallbacks)) + '</p>';
  return (
    '<div class="rounded-2xl border border-slate-800 bg-slate-950 p-6">' +
    '<h2 class="text-lg font-semibold">Хранилище</h2>' +
    '<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">' + stats + '</div>' +
    fallback +
    '</div>'
  );
};

const TAB_CONFIG = [
  { id: "projects", label: "Проекты" },
  { id: "billing", label: "Оплаты" },
  { id: "facebook", label: "Facebook" },
  { id: "tech", label: "Тех.панель" },
];

const renderTabs = (): string => {
  return (
    '<div class="mb-6 flex flex-wrap gap-2">' +
    TAB_CONFIG.map(
      (tab, index) =>
        '<button data-tab-target="' + tab.id + '" class="tab-button rounded-full px-4 py-2 text-sm font-medium ' +
        (index === 0 ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30' : 'bg-slate-800 text-slate-200 hover:bg-slate-700') +
        '">' + tab.label + '</button>',
    ).join("") +
    '</div>'
  );
};

const renderTabContent = (dashboard: AdminDashboardData): string => {
  return (
    '<div>' +
    '<section data-tab-content="projects" class="tab-panel">' + renderProjectsTab(dashboard.projects) + '</section>' +
    '<section data-tab-content="billing" class="tab-panel hidden">' + renderBillingTab(dashboard.projects) + '</section>' +
    '<section data-tab-content="facebook" class="tab-panel hidden space-y-5">' +
    renderMetaStatus(dashboard.meta_status) +
    renderAccounts(dashboard.accounts) +
    '</section>' +
    '<section data-tab-content="tech" class="tab-panel hidden space-y-5">' +
    renderStorage(dashboard.storage) +
    '<div class="rounded-2xl border border-slate-800 bg-slate-950 p-6">' +
    '<h2 class="text-lg font-semibold">Токены и ключи</h2>' +
    '<div class="mt-4">' + renderTokens(dashboard.tokens) + '</div>' +
    '</div>' +
    '<div class="rounded-2xl border border-slate-800 bg-slate-950 p-6">' +
    '<div class="flex items-center justify-between">' +
    '<h2 class="text-lg font-semibold">Логи</h2>' +
    '<form method="post" action="/api/project/refresh-all">' +
    '<button class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">Refresh All</button>' +
    '</form>' +
    '</div>' +
    '<div class="mt-4 space-y-3">' + renderLogs(dashboard.logs) + '</div>' +
    '</div>' +
    '</section>' +
    '</div>'
  );
};

const TAB_SCRIPT = `
(function(){
  const buttons = Array.from(document.querySelectorAll('[data-tab-target]'));
  const panels = Array.from(document.querySelectorAll('[data-tab-content]'));
  const activate = (id) => {
    panels.forEach((panel) => {
      if (panel.getAttribute('data-tab-content') === id) {
        panel.classList.remove('hidden');
      } else {
        panel.classList.add('hidden');
      }
    });
    buttons.forEach((button) => {
      if (button.getAttribute('data-tab-target') === id) {
        button.classList.add('bg-emerald-500','text-slate-950','shadow-lg','shadow-emerald-500/30');
        button.classList.remove('bg-slate-800','text-slate-200');
      } else {
        button.classList.remove('bg-emerald-500','text-slate-950','shadow-lg','shadow-emerald-500/30');
        button.classList.add('bg-slate-800','text-slate-200');
      }
    });
  };
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.getAttribute('data-tab-target');
      if (id) {
        activate(id);
      }
    });
  });
})();
`;

export const renderAdminPage = (data: AdminDashboardData): string => {
  const content = joinHtml([
    renderTabs(),
    renderTabContent(data),
  ]);

  const sidebar = '<div class="p-6 space-y-6">' +
    '<div class="text-sm font-semibold uppercase text-slate-500">Навигация</div>' +
    '<nav class="space-y-2 text-sm">' +
    '<a class="block rounded-lg bg-slate-900 px-3 py-2 text-emerald-400" href="/admin">Админ-панель</a>' +
    '<a class="block rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-900" href="/api/projects">Список проектов (API)</a>' +
    '<a class="block rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-900" href="/api/meta/status">Статус Meta (API)</a>' +
    '<a class="block rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-900" href="/api/ping">Проверка воркера</a>' +
    '</nav>' +
    '</div>';

  return renderLayout(content, { title: "Админ-панель", sidebar, scripts: '<script>' + TAB_SCRIPT + '</script>' });
};
