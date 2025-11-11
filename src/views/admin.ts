import {
  AdminDashboardData,
  CronStatusMap,
  DashboardLogEntry,
  MetaAccountInfo,
  ProjectCard,
  StorageOverview,
  TokenStatus,
} from "../types";
import { escapeHtml, joinHtml } from "../utils/html";
import { renderLayout } from "./layout";
import { formatCurrency, formatDateTime, metaAccountStatusIcon } from "../utils/format";

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

const inputValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value).trim();
  return text ? escapeHtml(text) : "";
};

const renderProjectCard = (project: ProjectCard): string => {
  const icon = statusIcon(project.status);
  const chatLink = project.chat_link
    ? `<a class="text-emerald-400 hover:text-emerald-300" href="${escapeHtml(project.chat_link)}">Чат</a>`
    : project.chat_username
    ? `<span class="text-slate-400">@${escapeHtml(project.chat_username.replace(/^@/, ""))}</span>`
    : '<span class="text-slate-500">Чат не настроен</span>';
  const portalLink = project.portal_url
    ? `<a class="rounded-lg border border-emerald-500 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10" href="${escapeHtml(project.portal_url)}" target="_blank" rel="noopener">Портал</a>`
    : '<span class="text-xs text-slate-500">Портал отключён</span>';
  const alerts = project.alerts_enabled === false
    ? '<span class="inline-flex items-center rounded-full bg-red-900/40 px-2 py-0.5 text-xs text-red-300">Алерты выкл.</span>'
    : '<span class="inline-flex items-center rounded-full bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-300">Алерты вкл.</span>';
  const silent = project.silent_weekends
    ? '<span class="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">Тихие выходные</span>'
    : '';
  const nextPayment = project.billing?.next_payment || project.billing?.next_payment_date || null;
  const billingRow = nextPayment
    ? `<div class="text-sm text-slate-300">💳 Следующая оплата: ${safe(nextPayment)}</div>`
    : '';
  const managerRow = project.manager
    ? `<div class="text-sm text-slate-300">Менеджер: ${safe(project.manager)}</div>`
    : '';
  const lastSync = project.last_sync || project.updated_at || null;
  const infoRows = joinHtml([
    `<div class="text-sm text-slate-300">${icon} ${safe(project.status || "")}</div>`,
    project.account_name
      ? `<div class="text-sm text-slate-400">Аккаунт: ${safe(project.account_name)}</div>`
      : '',
    billingRow,
    managerRow,
    lastSync
      ? `<div class="text-xs text-slate-500">Синхронизировано: ${escapeHtml(lastSync)}</div>`
      : '',
  ]);

  const summary = project.summary
    ? `<div class="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4"><div><div class="text-slate-500">Потрачено</div><div class="font-semibold">${escapeHtml(formatCurrency(project.summary.spend, project.currency || "USD"))}</div></div><div><div class="text-slate-500">Лиды</div><div class="font-semibold">${escapeHtml(String(project.summary.leads ?? "—"))}</div></div><div><div class="text-slate-500">Клики</div><div class="font-semibold">${escapeHtml(String(project.summary.clicks ?? "—"))}</div></div><div><div class="text-slate-500">CTR</div><div class="font-semibold">\${escapeHtml(String(project.summary.ctr ?? "—"))}</div></div>\${'</div>'
    : '<p class="mt-4 text-sm text-slate-500">Нет свежей сводки</p>'}`;

  const badgeRow = joinHtml([
    alerts,
    silent,
  ]);

  const projectIdAttr = escapeHtml(project.id);
  const alertsEnabled = project.alerts_enabled === undefined || project.alerts_enabled === null
    ? true
    : Boolean(project.alerts_enabled);
  const silentEnabled = Boolean(project.silent_weekends);
  const toggleAlertsText = alertsEnabled
    ? "🔕 Выключить алерты"
    : "🔔 Включить алерты";
  const toggleSilentText = silentEnabled
    ? "🔔 Включить уведомления в выходные"
    : "😴 Включить тихие выходные";
  const formInputClass =
    "rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none";
  const actions =
    `<div class="mt-4 flex flex-wrap gap-2 text-xs sm:text-sm"><button type="button" data-admin-action="toggle-alerts" data-project="${projectIdAttr}" class="rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-slate-200 hover:bg-slate-700">${escapeHtml(toggleAlertsText)}</button><button type="button" data-admin-action="toggle-silent" data-project="${projectIdAttr}" class="rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-slate-200 hover:bg-slate-700">${escapeHtml(toggleSilentText)}</button><button type="button" data-admin-action="edit-project" data-project="${projectIdAttr}" class="rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-slate-200 hover:bg-slate-700">✏️ Редактировать</button><button type="button" data-admin-action="edit-billing" data-project="${projectIdAttr}" class="rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-slate-200 hover:bg-slate-700">💳 Настроить оплату</button><button type="button" data-admin-action="refresh-project" data-project="\${projectIdAttr}" class="rounded-lg bg-emerald-500 px-3 py-1.5 font-semibold text-slate-950 hover:bg-emerald-400">🔄 Обновить отчёт</button>\${'</div>'}`;

  const editForm =
    `<form data-admin-form="update-project" data-project="${projectIdAttr}" data-admin-form-section="project" class="mt-4 hidden space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4"><div class="grid gap-3 sm:grid-cols-2"><label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Название<input name="name" type="text" value="${inputValue(project.name)}" class="${formInputClass}" placeholder="Название проекта"></label><label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Статус<input name="status" type="text" value="${inputValue(project.status || "")}" class="${formInputClass}" placeholder="active"></label><label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Chat ID<input name="chat_id" type="text" value="${inputValue(project.chat_id || "")}" class="${formInputClass}" placeholder="-100123456"></label><label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Telegram<input name="chat_username" type="text" value="${inputValue(project.chat_username || "")}" class="${formInputClass}" placeholder="@username"></label><label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Ссылка на чат<input name="chat_link" type="text" value="${inputValue(project.chat_link || "")}" class="${formInputClass}" placeholder="https://t.me/..."></label><label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Аккаунт Facebook<input name="account_name" type="text" value="${inputValue(project.account_name || "")}" class="${formInputClass}" placeholder="Ad Account"></label><label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">День оплаты<input name="billing_day" type="number" value="${inputValue(project.billing_day ?? "")}" class="${formInputClass}" min="1" max="31"></label><label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Менеджер<input name="manager" type="text" value="${inputValue(project.manager || "")}" class="${formInputClass}" placeholder="Имя менеджера"></label><label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Портал<input name="portal_url" type="text" value="\${inputValue(project.portal_url || "")}" class="\${formInputClass}" placeholder="https://.../portal"></label>\${'</div>'}<div class="flex flex-wrap gap-2">\${'<button type="submit" class="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400">💾 Сохранить</button>'}<button type="button" data-admin-action="cancel-edit" data-project="\${projectIdAttr}" class="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-slate-200 hover:bg-slate-700">Отмена</button>\${'</div>'}</form>`;

  const billing = project.billing || {};
  const billingForm =
    `<form data-admin-form="update-billing" data-project="${projectIdAttr}" data-admin-form-section="billing" class="mt-4 hidden space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4"><div class="grid gap-3 sm:grid-cols-2"><label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Сумма<input name="amount" type="number" step="0.01" value="${inputValue(billing.amount ?? "")}" class="${formInputClass}" placeholder="1200000"></label><label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Валюта<input name="currency" type="text" value="${inputValue(billing.currency || project.currency || "")}" class="${formInputClass}" placeholder="USD"></label><label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Последняя оплата<input name="last_payment" type="date" value="${inputValue(billing.last_payment || "")}" class="${formInputClass}"></label><label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Следующая оплата<input name="next_payment" type="date" value="${inputValue(billing.next_payment || billing.next_payment_date || "")}" class="${formInputClass}"></label><label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Статус<input name="status" type="text" value="\${inputValue(billing.status || "")}" class="\${formInputClass}" placeholder="paid"></label>\${'</div>'}<div class="flex flex-wrap gap-2">\${'<button type="submit" class="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400">💾 Сохранить оплату</button>'}<button type="button" data-admin-action="cancel-edit" data-project="\${projectIdAttr}" class="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-slate-200 hover:bg-slate-700">Отмена</button>\${'</div>'}</form>`;

  return (
    `<div class="rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-lg shadow-slate-950/40" data-project-card="${projectIdAttr}"><div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><h3 class="text-xl font-semibold">${escapeHtml(project.name)}</h3><div class="mt-1 flex flex-wrap items-center gap-3 text-sm">${infoRows}</div></div><div class="flex flex-col items-end gap-2 text-sm">${portalLink}${chatLink}</div></div>${(badgeRow ? `<div class="mt-3 flex flex-wrap gap-2">${badgeRow}</div>` : '')}${summary}${actions}${editForm}${billingForm}</div>`
  );
};

const renderCreateProjectForm = (): string => {
  const inputClass =
    "rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none";
  return (
    `<div class="mb-6 rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-lg shadow-slate-950/30"><h3 class="text-lg font-semibold text-slate-100">Добавить проект</h3><p class="mt-2 text-sm text-slate-400">Укажите основные параметры проекта. Остальные настройки можно обновить позже из карточки проекта.</p><form data-admin-form="create-project" class="mt-4 space-y-4"><div class="grid gap-3 sm:grid-cols-2"><label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">ID проекта<input name="id" type="text" required class="${inputClass}" placeholder="beznds"></label><label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Название<input name="name" type="text" class="${inputClass}" placeholder="Без НДС"></label><label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Chat ID<input name="chat_id" type="text" class="${inputClass}" placeholder="-100123456"></label><label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Telegram<input name="chat_username" type="text" class="${inputClass}" placeholder="@username"></label><label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Аккаунт Facebook<input name="account_name" type="text" class="${inputClass}" placeholder="Ad Account"></label><label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">День оплаты<input name="billing_day" type="number" min="1" max="31" class="${inputClass}" placeholder="11"></label><label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Менеджер<input name="manager" type="text" class="\${inputClass}" placeholder="Имя менеджера"></label>\${'</div>'}<div class="flex flex-wrap gap-2">\${'<button type="submit" class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">➕ Создать проект</button>'}</div>\${'</form>'}</div>`
  );
};

const renderProjectsTab = (projects: ProjectCard[]): string => {
  const list = projects.length
    ? `<div class="grid gap-5 lg:grid-cols-2">${projects.map(renderProjectCard).join("")}</div>`
    : '<div class="rounded-2xl border border-slate-800 bg-slate-950 p-8 text-center text-slate-400">Проекты не найдены.</div>';
  return renderCreateProjectForm() + list;
};

const renderAccountsTab = (projects: ProjectCard[], accounts: MetaAccountInfo[]): string => {
  if (!accounts.length) {
    return '<div class="rounded-2xl border border-slate-800 bg-slate-950 p-6 text-sm text-slate-400">Нет данных об аккаунтах. Проверьте подключение к Facebook.</div>';
  }

  const availableChats = projects
    .filter((project) => !project.account_id && (project.chat_link || project.chat_username || project.chat_id))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  const buildChatButtons = (): string => {
    if (!availableChats.length) {
      return '<p class="text-sm text-slate-400">Свободных чат-групп нет. Добавьте проект с чатами в разделе «Проекты».</p>';
    }
    return (
      `<div class="flex flex-wrap gap-2" data-account-chat-list>${availableChats
        .map(
          (chat) =>
            `<button type="button" data-account-chat data-project="${escapeHtml(chat.id)}" data-project-name="${escapeHtml(chat.name)}" class="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:border-emerald-400 hover:text-emerald-300">${escapeHtml(chat.name)}</button>`,
        )
        .join("")}</div>`
    );
  };

  const cards = accounts
    .map((account) => {
      const project = projects.find((item) => item.account_id && item.account_id === account.id) || null;
      const hasChat = Boolean(project && (project.chat_link || project.chat_username || project.chat_id));
      const spend = project && typeof project.summary?.spend === "number"
        ? formatCurrency(project.summary.spend, project.currency || "USD")
        : "—";
      const icon = hasChat ? metaAccountStatusIcon(account.status) : "🔘";
      const chatLabel = project
        ? project.chat_link
          ? `<a class="text-emerald-400 hover:text-emerald-300" href="${escapeHtml(project.chat_link)}">Чат проекта</a>`
          : project.chat_username
          ? `<span class="text-slate-400">@${escapeHtml(project.chat_username.replace(/^@/, ""))}</span>`
          : project.chat_id
          ? `<span class="text-slate-400">ID: ${escapeHtml(String(project.chat_id))}</span>`
          : '<span class="text-slate-400">Чат не указан</span>'
        : '<span class="text-slate-400">Чат не подключён</span>';

      const cardClasses = hasChat
        ? 'rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-lg shadow-emerald-500/10'
        : 'rounded-2xl border border-slate-800 bg-slate-950 p-5';

      const projectNameRow = project
        ? `<div class="mt-2 text-sm text-slate-300">Проект: <span class="font-semibold text-slate-100">${escapeHtml(project.name)}</span></div>`
        : '<div class="mt-2 text-sm text-slate-400">Проект не подключён</div>';

      const chatRow = `<div class="mt-1 text-sm text-slate-400">${chatLabel}</div>`;
      const spendLabel = project && project.summary && (project.summary as any).period_label
        ? ` (${escapeHtml(String((project.summary as any).period_label))})`
        : '';
      const spendRow =
        `<div class="mt-3 text-sm text-slate-300">💰 Потрачено: <span class="font-semibold text-emerald-300">${escapeHtml(spend)}</span>${spendLabel}</div>`;

      const lastUpdate = project?.updated_at || project?.last_sync || account.last_update || null;
      const lastUpdateRow =
        `<div class="mt-1 text-xs text-slate-500">Обновлено: ${escapeHtml(formatDateTime(lastUpdate))}</div>`;

      const linkedControls = hasChat && project
        ? `<div class="mt-4 flex flex-wrap gap-2"><button type="button" data-account-action="open-project" data-project="${escapeHtml(project.id)}" class="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400">Открыть проект</button>${project.portal_url
            ? `<a class="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-emerald-400 hover:text-emerald-300" href="${escapeHtml(project.portal_url)}" target="_blank" rel="noreferrer">Портал</a>`
            : ''}</div>`
        : '';

      const selector = !hasChat
        ? `<div class="mt-4 hidden" data-account-selector><p class="text-sm text-slate-300">Выберите чат-группу для подвязки:</p>${buildChatButtons()}<div class="mt-3 hidden space-y-3" data-account-confirm>${'<p class="text-sm text-slate-300" data-account-confirm-text></p>'}<div class="flex flex-wrap gap-2">${'<button type="button" data-account-action="change" class="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-emerald-400 hover:text-emerald-300">Изменить</button>'}<button type="button" data-account-action="confirm" data-account="${escapeHtml(account.id)}" class="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400">Подвязать ✅</button>${'</div>'}</div>${'</div>'}</div>`
        : '';

      const connectButton = hasChat
        ? ''
        : `<div class="mt-4"><button type="button" data-account-action="link" data-account="${escapeHtml(account.id)}" class="rounded-lg border border-emerald-400 px-3 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/10">Подключить</button></div>`;

      return (
        `<div class="${cardClasses}" data-account-card="${escapeHtml(account.id)}" data-account-name="${escapeHtml(account.name || account.id)}"><div class="flex flex-col gap-1 md:flex-row md:items-start md:justify-between"><div><div class="text-lg font-semibold text-slate-100">${icon} ${escapeHtml(account.name || account.id)}</div><div class="text-sm text-slate-400">ID: ${escapeHtml(account.id)}</div></div><div class="text-sm text-slate-400">Статус: ${escapeHtml(account.status || '—')}</div></div>${projectNameRow}${chatRow}${spendRow}${lastUpdateRow}${linkedControls}${connectButton}${selector}</div>`
      );
    })
    .join('<div class="h-px bg-slate-800"></div>');

  return `<div class="space-y-4">${cards}</div>`;
};

const renderBillingRow = (project: ProjectCard): string => {
  const billing = project.billing || {};
  const amount = billing.amount !== undefined && billing.amount !== null
    ? formatCurrency(billing.amount, billing.currency || project.currency || "USD")
    : "—";
  const status = billing.status
    ? `<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs ${(billing.status === "overdue"
        ? 'bg-red-900/40 text-red-300'
        : billing.status === "due"
        ? 'bg-yellow-900/30 text-yellow-200'
        : 'bg-emerald-900/30 text-emerald-200')}">${escapeHtml(billing.status)}</span>`
    : '<span class="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">—</span>';
  const nextPayment = billing.next_payment || billing.next_payment_date || "—";
  const lastPayment = billing.last_payment || "—";

  return (
    `<tr class="border-b border-slate-800/60 hover:bg-slate-900/60"><td class="px-4 py-3 font-medium">${escapeHtml(project.name)}</td><td class="px-4 py-3 text-sm text-slate-300">${escapeHtml(String(project.billing_day ?? "—"))}</td><td class="px-4 py-3 text-sm text-slate-300">${escapeHtml(lastPayment)}</td><td class="px-4 py-3 text-sm text-slate-300">${escapeHtml(nextPayment)}</td><td class="px-4 py-3 text-sm text-slate-300">${escapeHtml(amount)}</td><td class="px-4 py-3 text-right">\${status}</td>\${'</tr>'}`);
};

const renderBillingTab = (projects: ProjectCard[]): string => {
  const rows = projects.map(renderBillingRow).join("");
  return `<div class="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950"><div class="overflow-x-auto">${'<table class="min-w-full text-sm">'}<thead class="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">${'<tr>'}<th class="px-4 py-3 text-left">Проект</th>${'<th class="px-4 py-3 text-left">День оплаты</th>'}<th class="px-4 py-3 text-left">Последняя оплата</th>${'<th class="px-4 py-3 text-left">Следующая оплата</th>'}<th class="px-4 py-3 text-left">Сумма</th>${'<th class="px-4 py-3 text-right">Статус</th>'}</tr>${'</thead>'}<tbody class="divide-y divide-slate-800">${rows || '<tr><td colspan="6" class="px-4 py-6 text-center text-slate-400">Нет данных по оплатам</td></tr>'}</tbody>${'</table>'}</div>${'</div>'}`;
};

const tokenStatusLabel = (status: string): string => {
  const normalized = status.toLowerCase();
  if (normalized === "ok") {
    return "Активен";
  }
  if (normalized === "missing") {
    return "Не настроен";
  }
  if (normalized === "expired") {
    return "Истёк";
  }
  if (normalized === "invalid") {
    return "Недействителен";
  }
  return status;
};

const renderMetaStatus = (
  status: AdminDashboardData["meta_status"],
  token: AdminDashboardData["meta_token"],
): string => {
  const hasIssues = Boolean(status.issues && status.issues.length > 0);
  const icon = !status.ok ? "🔴" : hasIssues ? "🟡" : "🟢";
  const issues = hasIssues
    ? `<ul class="mt-3 space-y-1 text-sm text-red-400">${status.issues!.map((issue) => `<li>• ${escapeHtml(issue)}</li>`).join("")}</ul>`
    : '<p class="mt-3 text-sm text-slate-400">Подключение стабильно</p>';

  const tokenStatus = token.status || (token.ok ? "ok" : "invalid");
  const tokenIcon = tokenStatus === "ok" ? "🟢" : tokenStatus === "expired" || tokenStatus === "missing" ? "🔴" : "🟡";
  const tokenIssues = token.issues && token.issues.length
    ? `<ul class="mt-3 space-y-1 text-xs text-red-300">${token.issues.map((issue) => `<li>• ${escapeHtml(issue)}</li>`).join("")}</ul>`
    : '<p class="mt-3 text-xs text-slate-400">Ошибок не обнаружено</p>';
  const snippetRow = token.token_snippet
    ? `<div class="text-xs text-slate-400">🔑 Токен: ${escapeHtml(token.token_snippet)}</div>`
    : '<div class="text-xs text-red-400">🔑 Токен отсутствует</div>';
  const expiryParts: string[] = [];
  if (token.expires_at) {
    expiryParts.push(`⏳ Истекает: ${escapeHtml(formatDateTime(token.expires_at))}`);
  }
  if (typeof token.expires_in_hours === "number" && Number.isFinite(token.expires_in_hours)) {
    expiryParts.push(`≈ ${escapeHtml(String(token.expires_in_hours))} ч`);
  }
  const expiryRow = expiryParts.length
    ? `<div class="text-xs text-slate-400">${expiryParts.join(' • ')}</div>`
    : '<div class="text-xs text-slate-500">⏳ Срок действия не определён</div>';
  const refreshedRow = token.refreshed_at
    ? `<div class="text-xs text-slate-400">♻️ Обновлён: ${escapeHtml(formatDateTime(token.refreshed_at))}</div>`
    : status.last_refresh
    ? `<div class="text-xs text-slate-500">♻️ Данные обновлены: ${escapeHtml(formatDateTime(status.last_refresh))}</div>`
    : '';
  const refreshHint = token.should_refresh
    ? '<span class="inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">Требуется обновить</span>'
    : '';
  const tokenControls =
    `<div class="mt-4 flex flex-wrap gap-2">${'<button type="button" data-tech-action="refresh-meta-token" data-confirm="Обновить Meta токен вручную?" class="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">🔄 Обновить токен</button>'}<button type="button" data-tech-action="clear-meta-cache" data-confirm="Очистить кэш статуса Facebook?" class="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700">🧹 Очистить кэш</button>${'</div>'}`;

  return (
    `<div class="space-y-4"><div class="rounded-2xl border border-slate-800 bg-slate-950 p-6"><div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><h2 class="text-lg font-semibold">Статус Facebook</h2><p class="text-sm text-slate-300">${icon} ${safe(status.account_name || "Неизвестно")}</p></div><div class="text-sm text-slate-400">Обновлено: ${safe(status.last_refresh || "—")}</div></div>${issues}</div><div class="rounded-2xl border border-slate-800 bg-slate-950 p-6"><div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><h3 class="text-base font-semibold">Токен доступа</h3><p class="text-sm text-slate-300">${tokenIcon} ${escapeHtml(tokenStatusLabel(tokenStatus))}</p>${refreshHint || ''}</div><div class="text-right text-xs text-slate-500">${token.account_name ? `${escapeHtml(token.account_name)}<br>` : ''}${token.account_id ? `ID: ${escapeHtml(token.account_id)}` : ''}</div></div>${snippetRow}${expiryRow}${refreshedRow}${tokenIssues}${tokenControls}</div>\${'</div>'}`);
};

const renderAccounts = (accounts: MetaAccountInfo[]): string => {
  if (!accounts.length) {
    return '<div class="rounded-2xl border border-slate-800 bg-slate-950 p-6 text-sm text-slate-400">Нет данных об аккаунтах</div>';
  }
  const rows = accounts
    .map((account) =>
      `<tr class="border-b border-slate-800/60 hover:bg-slate-900/60"><td class="px-4 py-3 font-medium">${safe(account.name)}</td><td class="px-4 py-3 text-sm text-slate-300">${safe(account.status)}</td><td class="px-4 py-3 text-right">${escapeHtml(formatCurrency(account.balance ?? null, account.currency || "USD"))}</td><td class="px-4 py-3 text-right">${escapeHtml(formatCurrency(account.spend_cap ?? null, account.currency || "USD"))}</td><td class="px-4 py-3 text-sm text-slate-400">${safe(account.payment_method)}</td><td class="px-4 py-3 text-sm text-slate-400">\${safe(account.last_update)}</td>\${'</tr>'}`,
    )
    .join("");
  return `<div class="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950"><div class="overflow-x-auto">${'<table class="min-w-full text-sm">'}<thead class="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">${'<tr>'}<th class="px-4 py-3 text-left">Название</th>${'<th class="px-4 py-3 text-left">Статус</th>'}<th class="px-4 py-3 text-right">Баланс</th>${'<th class="px-4 py-3 text-right">Лимит</th>'}<th class="px-4 py-3 text-left">Оплата</th>${'<th class="px-4 py-3 text-left">Обновление</th>'}</tr>${'</thead>'}<tbody class="divide-y divide-slate-800">${rows}</tbody>${'</table>'}</div>${'</div>'}`;
};

const renderTokens = (tokens: TokenStatus[]): string => {
  const rows = tokens
    .map((token) => {
      const icon = token.configured ? "🟢" : "🔴";
      const statusText = token.configured ? "Настроено" : "Отсутствует";
      const hint = token.hint ? `<span class="text-slate-500">(${escapeHtml(token.hint)})</span>` : '';
      return (
        `<div class="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3"><div><div class="text-sm font-semibold">${icon} ${escapeHtml(token.name)}</div>${hint}</div><div class="text-sm \${(token.configured ? 'text-emerald-400' : 'text-red-400')}">\${statusText}</div>\${'</div>'}`);
    })
    .join("");
  return (
    `<div class="space-y-3">${(rows || '<p class="text-sm text-slate-400">Нет данных</p>')}</div>`
  );
};

const renderLogs = (logs: DashboardLogEntry[]): string => {
  const rows = logs
    .slice(-30)
    .reverse()
    .map((log) =>
      `<div class="rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs"><div class="flex justify-between"><span class="font-semibold">${escapeHtml(log.level.toUpperCase())}</span><span class="text-slate-400">\${escapeHtml(formatDateTime(log.timestamp))}</span>\${'</div>'}<p class="mt-1 text-slate-100">\${escapeHtml(log.message)}</p>\${'</div>'}`,
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
        `<div class="rounded-xl border border-slate-800 bg-slate-900 p-4 text-center"><div class="text-2xl font-bold text-emerald-300">${escapeHtml(String(cell.value))}</div><div class="mt-1 text-xs uppercase tracking-wide text-slate-400">\${escapeHtml(cell.label)}</div>\${'</div>'}`,
    )
    .join("");
  const fallback = storage.kvFallbacks === null || storage.kvFallbacks === undefined
    ? ''
    : `<p class="mt-3 text-xs text-slate-400">Fallback KV записей: ${escapeHtml(String(storage.kvFallbacks))}</p>`;
  return (
    `<div class="rounded-2xl border border-slate-800 bg-slate-950 p-6">${'<h2 class="text-lg font-semibold">Хранилище</h2>'}<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">${stats}</div>${fallback}</div>`
  );
};

const CRON_LABELS: Record<string, string> = {
  "projects-refresh": "Обновление отчётов",
  "meta-token": "Проверка Meta токена",
};

const renderCronStatus = (cron?: CronStatusMap | null): string => {
  const entries = cron ? Object.values(cron) : [];
  if (entries.length === 0) {
    return (
      `<div class="rounded-2xl border border-slate-800 bg-slate-950 p-6">${'<h2 class="text-lg font-semibold">Крон-задачи</h2>'}<p class="mt-2 text-sm text-slate-500">Отчёты о выполнении крон-задач появятся после первого запуска.</p>${'</div>'}`);
  }

  const rows = entries
    .sort((a, b) => a.job.localeCompare(b.job))
    .map((entry) => {
      const icon = entry.ok ? "🟢" : "🔴";
      const label = CRON_LABELS[entry.job] || entry.job;
      const lastRunIso = entry.last_run && entry.last_run !== "1970-01-01T00:00:00.000Z" ? entry.last_run : null;
      const lastRun = lastRunIso ? formatDateTime(lastRunIso) : "—";
      const lastSuccess =
        entry.last_success && entry.last_success !== "1970-01-01T00:00:00.000Z"
          ? formatDateTime(entry.last_success)
          : null;
      const failureBadge = entry.failure_count && entry.failure_count > 0
        ? `<span class="rounded-full bg-red-900/60 px-2 py-0.5 text-[11px] text-red-200">${escapeHtml(String(entry.failure_count))}× ошибок</span>`
        : '';
      const message = entry.message
        ? `<p class="mt-2 text-xs text-slate-400">${escapeHtml(entry.message)}</p>`
        : '';
      const lastSuccessRow = lastSuccess
        ? `<div class="text-xs text-slate-500">Последний успех: ${escapeHtml(lastSuccess)}</div>`
        : '';
      return (
        `<div class="rounded-xl border border-slate-800 bg-slate-900 p-4"><div class="flex items-center justify-between"><div class="text-sm font-semibold">${icon} ${escapeHtml(label)}</div><div class="space-x-2 text-xs text-slate-400">${failureBadge}</div></div><div class="mt-1 text-xs text-slate-400">Последний запуск: ${escapeHtml(lastRun)}</div>${lastSuccessRow}${message}</div>`
      );
    })
    .join("");

  return (
    `<div class="rounded-2xl border border-slate-800 bg-slate-950 p-6">${'<h2 class="text-lg font-semibold">Крон-задачи</h2>'}<div class="mt-4 space-y-3">${rows}</div>${'</div>'}`);
};

const renderTechTools = (): string => {
  return (
    `<div class="space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-6">${'<div>'}<h2 class="text-lg font-semibold">Системные инструменты</h2>${'<p class="mt-2 text-sm text-slate-400">Действия техподдержки: очистка кэшей, проверка вебхуков и массовые обновления.</p>'}</div>${'<div class="flex flex-wrap gap-2">'}<button type="button" data-tech-action="refresh-all" data-confirm="Запустить обновление всех отчётов? Это может занять несколько минут." class="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400">🔄 Обновить все отчёты</button>${'<button type="button" data-tech-action="clear-meta-cache" data-confirm="Очистить кэш статуса Facebook?" class="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700">🧹 Очистить кэш Facebook</button>'}<button type="button" data-tech-action="clear-cache-prefix" data-confirm="Удалить объекты с указанным префиксом? Действие необратимо." data-prompt="Укажите префикс для очистки" data-prompt-field="prefix" data-prompt-default="cache/" class="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700">🗂 Очистить cache/*</button>${'<button type="button" data-tech-action="clear-fallbacks" data-confirm="Очистить fallback-записи из KV?" class="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700">♻️ Очистить fallback</button>'}<button type="button" data-tech-action="clear-project-report" data-confirm="Удалить кэш отчёта выбранного проекта?" data-prompt="Введите ID проекта для очистки отчёта" data-prompt-field="project_id" class="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700">🧽 Очистить отчёт проекта</button>${'<button type="button" data-tech-action="check-telegram-webhook" data-prompt="Укажите токен бота (опционально) для проверки" data-prompt-field="token" data-prompt-optional="true" class="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700">🤖 Проверить вебхук Telegram</button>'}</div>${'<pre data-tech-output class="hidden whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900/80 p-3 text-xs text-slate-200"></pre>'}</div>`
  );
};

const TAB_CONFIG = [
  { id: "projects", label: "Проекты" },
  { id: "accounts", label: "Рекламные аккаунты" },
  { id: "billing", label: "Оплаты" },
  { id: "facebook", label: "Facebook" },
  { id: "tech", label: "Тех.панель" },
];

const renderTabs = (): string => {
  return (
    `<div class="mb-6 flex flex-wrap gap-2">${TAB_CONFIG.map(
      (tab, index) =>
        `<button data-tab-target="${tab.id}" class="tab-button rounded-full px-4 py-2 text-sm font-medium ${(index === 0 ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30' : 'bg-slate-800 text-slate-200 hover:bg-slate-700')}">${tab.label}</button>`,
    ).join("")}</div>`
  );
};

const renderTabContent = (dashboard: AdminDashboardData): string => {
  return (
    `<div><section data-tab-content="projects" class="tab-panel">${renderProjectsTab(dashboard.projects)}</section><section data-tab-content="accounts" class="tab-panel hidden">${renderAccountsTab(dashboard.projects, dashboard.accounts)}</section><section data-tab-content="billing" class="tab-panel hidden">${renderBillingTab(dashboard.projects)}</section><section data-tab-content="facebook" class="tab-panel hidden space-y-5">${renderMetaStatus(dashboard.meta_status, dashboard.meta_token)}${renderAccounts(dashboard.accounts)}</section><section data-tab-content="tech" class="tab-panel hidden space-y-5">${renderStorage(dashboard.storage)}${renderCronStatus(dashboard.cron)}<div class="rounded-2xl border border-slate-800 bg-slate-950 p-6"><h2 class="text-lg font-semibold">Токены и ключи</h2><div class="mt-4">${renderTokens(dashboard.tokens)}</div></div>${renderTechTools()}<div class="rounded-2xl border border-slate-800 bg-slate-950 p-6"><h2 class="text-lg font-semibold">Логи</h2>\${'<p class="mt-1 text-xs text-slate-500">Сводка последних событий воркера.</p>'}<div class="mt-4 space-y-3">\${renderLogs(dashboard.logs)}</div>\${'</div>'}</section>\${'</div>'}`);
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

const ACTION_SCRIPT = [
  "(function(){",
  "  const params = new URLSearchParams(window.location.search);",
  "  const adminKey = params.get('key');",
  "  const buildUrl = function(path){",
  "    var url = new URL(path, window.location.origin);",
  "    if (adminKey) {",
  "      url.searchParams.set('key', adminKey);",
  "    }",
  "    return url.toString();",
  "  };",
  "  const techOutput = document.querySelector('[data-tech-output]');",
  "  const updateTechOutput = function(data, isError){",
  "    if (!techOutput) { return; }",
  "    techOutput.classList.remove('hidden');",
  "    ['border-emerald-600','text-emerald-200','border-red-600','text-red-300'].forEach(function(cls){ techOutput.classList.remove(cls); });",
  "    var content = '';",
  "    if (typeof data === 'string') {",
  "      content = data;",
  "    } else if (data) {",
  "      try {",
  "        content = JSON.stringify(data, null, 2);",
  "      } catch (_error) {",
  "        content = String(data);",
  "      }",
  "    } else {",
  "      content = isError ? 'Ошибка' : 'Операция выполнена';",
  "    }",
  "    techOutput.textContent = content;",
  "    var classes = isError ? ['border-red-600','text-red-300'] : ['border-emerald-600','text-emerald-200'];",
  "    classes.forEach(function(cls){ techOutput.classList.add(cls); });",
  "  };",
  "  const parseJsonSafe = function(text){",
  "    if (!text) { return null; }",
  "    try {",
  "      return JSON.parse(text);",
  "    } catch (_error) {",
  "      return { raw: text };",
  "    }",
  "  };",
  "  const toggleForm = function(card, selector){",
  "    if (!card) { return; }",
  "    var target = card.querySelector(selector);",
  "    card.querySelectorAll('form[data-admin-form]').forEach(function(form){",
  "      if (form !== target) { form.classList.add('hidden'); }",
  "    });",
  "    if (target) {",
  "      target.classList.toggle('hidden');",
  "    }",
  "  };",
  "  const resetAccountSelector = function(card){",
  "    if (!card) { return; }",
  "    card.removeAttribute('data-selected-project');",
  "    var selector = card.querySelector('[data-account-selector]');",
  "    if (selector) { selector.classList.remove('hidden'); }",
  "    var confirmBlock = card.querySelector('[data-account-confirm]');",
  "    if (confirmBlock) { confirmBlock.classList.add('hidden'); }",
  "    card.querySelectorAll('[data-account-chat]').forEach(function(btn){",
  "      btn.classList.remove('border-emerald-400','text-emerald-300','bg-emerald-500/10');",
  "      btn.classList.add('border-slate-700','text-slate-200');",
  "    });",
  "  };",
  "  const handleAccountChatSelect = function(button){",
  "    var card = button.closest('[data-account-card]');",
  "    if (!card) { return; }",
  "    var projectId = button.getAttribute('data-project');",
  "    var projectName = button.getAttribute('data-project-name') || '';",
  "    if (!projectId) { return; }",
  "    card.setAttribute('data-selected-project', projectId);",
  "    card.querySelectorAll('[data-account-chat]').forEach(function(btn){",
  "      btn.classList.remove('border-emerald-400','text-emerald-300','bg-emerald-500/10');",
  "      btn.classList.add('border-slate-700','text-slate-200');",
  "    });",
  "    button.classList.remove('border-slate-700','text-slate-200');",
  "    button.classList.add('border-emerald-400','text-emerald-300','bg-emerald-500/10');",
  "    var confirmBlock = card.querySelector('[data-account-confirm]');",
  "    if (confirmBlock) {",
  "      confirmBlock.classList.remove('hidden');",
  "      var text = confirmBlock.querySelector('[data-account-confirm-text]');",
  "      if (text) {",
  "        var accountName = card.getAttribute('data-account-name') || '';",
  "        text.textContent = `Подвязать «${accountName}» к «${projectName}»?`;",
  "      }",
  "      var confirmButton = confirmBlock.querySelector('[data-account-action=\"confirm\"]');",
  "      if (confirmButton) { confirmButton.setAttribute('data-project', projectId); }",
  "    }",
  "  };",
  "  const handleAccountAction = async function(button){",
  "    var action = button.getAttribute('data-account-action');",
  "    if (!action) { return; }",
  "    var card = button.closest('[data-account-card]');",
  "    if (!card) { return; }",
  "    if (action === 'open-project') {",
  "      var projectId = button.getAttribute('data-project');",
  "      if (!projectId) { return; }",
  "      activate('projects');",
  "      var projectCard = document.querySelector(`[data-project-card="${projectId}"]`);",
  "      if (projectCard) {",
  "        projectCard.scrollIntoView({ behavior: 'smooth', block: 'start' });",
  "        projectCard.classList.add('ring','ring-emerald-500');",
  "        window.setTimeout(function(){ projectCard.classList.remove('ring','ring-emerald-500'); }, 2000);",
  "      }",
  "      return;",
  "    }",
  "    if (action === 'link') {",
  "      var selector = card.querySelector('[data-account-selector]');",
  "      if (selector) { selector.classList.remove('hidden'); }",
  "      resetAccountSelector(card);",
  "      return;",
  "    }",
  "    if (action === 'change') {",
  "      resetAccountSelector(card);",
  "      return;",
  "    }",
  "    if (action === 'confirm') {",
  "      var projectId = button.getAttribute('data-project');",
  "      var accountId = card.getAttribute('data-account-card');",
  "      if (!projectId || !accountId) {",
  "        alert('Выберите чат перед подтверждением.');",
  "        return;",
  "      }",
  "      button.disabled = true;",
  "      button.classList.add('opacity-60');",
  "      try {",
  "        var response = await fetch(buildUrl(`/api/admin/account/${accountId}/link`), {",
  "          method: 'POST',",
  "          headers: { 'content-type': 'application/json' },",
  "          body: JSON.stringify({ project_id: projectId })",
  "        });",
  "        if (!response.ok) {",
  "          var text = await response.text();",
  "          throw new Error(text || 'Request failed');",
  "        }",
  "        window.location.reload();",
  "      } catch (error) {",
  "        console.error('Account link failed', error);",
  "        alert(`Не удалось подвязать аккаунт: ${error && error.message ? error.message : 'ошибка'}`);",
  "      } finally {",
  "        button.disabled = false;",
  "        button.classList.remove('opacity-60');",
  "      }",
  "      return;",
  "    }",
  "  };",
  "  const handleTechAction = async function(button){",
  "    var action = button.getAttribute('data-tech-action');",
  "    if (!action) {",
  "      return;",
  "    }",
  "    var confirmMessage = button.getAttribute('data-confirm');",
  "    if (confirmMessage && !window.confirm(confirmMessage)) {",
  "      return;",
  "    }",
  "    var payload = { action: action };",
  "    var promptField = button.getAttribute('data-prompt-field');",
  "    if (promptField) {",
  "      var promptMessage = button.getAttribute('data-prompt') || '';",
  "      var promptDefault = button.getAttribute('data-prompt-default') || '';",
  "      var optional = button.getAttribute('data-prompt-optional') === 'true';",
  "      var response = window.prompt(promptMessage || 'Введите значение', promptDefault);",
  "      if (response === null) {",
  "        return;",
  "      }",
  "      var trimmed = response.trim();",
  "      if (!trimmed) {",
  "        if (promptDefault && !optional) {",
  "          payload[promptField] = promptDefault.trim();",
  "        } else if (!optional) {",
  "          alert('Значение не указано');",
  "          return;",
  "        }",
  "      } else {",
  "        payload[promptField] = trimmed;",
  "      }",
  "    }",
  "    button.disabled = true;",
  "    button.classList.add('opacity-60');",
  "    try {",
  "      var response = await fetch(buildUrl('/api/admin/system'), {",
  "        method: 'POST',",
  "        headers: { 'content-type': 'application/json' },",
  "        body: JSON.stringify(payload)",
  "      });",
  "      var text = await response.text();",
  "      var data = parseJsonSafe(text);",
  "      if (!response.ok) {",
  "        updateTechOutput(data || text || 'Ошибка', true);",
  "        throw new Error(data && data.error ? data.error : (text || 'Request failed'));",
  "      }",
  "      updateTechOutput(data || { ok: true }, false);",
  "      if (action === 'refresh-all' || action === 'refresh-meta-token') {",
  "        window.setTimeout(function(){ window.location.reload(); }, 1500);",
  "      }",
  "    } catch (error) {",
  "      console.error('Tech action failed', error);",
  "      if (!techOutput) {",
  "        alert(`Ошибка: ${error && error.message ? error.message : 'неизвестная ошибка'}`);",
  "      }",
  "    } finally {",
  "      button.disabled = false;",
  "      button.classList.remove('opacity-60');",
  "    }",
  "  };",
  "  const handleAction = async function(button){",
  "    var action = button.getAttribute('data-admin-action');",
  "    if (!action) {",
  "      return;",
  "    }",
  "    if (action === 'edit-project' || action === 'edit-billing') {",
  "      var card = button.closest('[data-project-card]');",
  "      toggleForm(card, action === 'edit-project' ? 'form[data-admin-form=\"update-project\"]' : 'form[data-admin-form=\"update-billing\"]');",
  "      return;",
  "    }",
  "    if (action === 'cancel-edit') {",
  "      var cancelCard = button.closest('[data-project-card]');",
  "      if (cancelCard) {",
  "        cancelCard.querySelectorAll('form[data-admin-form]').forEach(function(form){ form.classList.add('hidden'); });",
  "      }",
  "      return;",
  "    }",
  "    var project = button.getAttribute('data-project');",
  "    if (!project) {",
  "      return;",
  "    }",
  "    var endpoint = '';",
  "    var options = { method: 'POST', headers: {} };",
  "    var body = null;",
  "    if (action === 'toggle-alerts') {",
  "      endpoint = `/api/admin/project/${project}/toggle`;",
  "      body = JSON.stringify({ field: 'alerts_enabled' });",
  "      options.headers['content-type'] = 'application/json';",
  "    } else if (action === 'toggle-silent') {",
  "      endpoint = `/api/admin/project/${project}/toggle`;",
  "      body = JSON.stringify({ field: 'silent_weekends' });",
  "      options.headers['content-type'] = 'application/json';",
  "    } else if (action === 'refresh-project') {",
  "      endpoint = `/api/project/${project}/refresh`;",
  "    } else {",
  "      return;",
  "    }",
  "    button.disabled = true;",
  "    button.classList.add('opacity-60');",
  "    try {",
  "      if (body !== null) {",
  "        options.body = body;",
  "      }",
  "      var response = await fetch(buildUrl(endpoint), options);",
  "      if (!response.ok) {",
  "        var text = await response.text();",
  "        throw new Error(text || 'Request failed');",
  "      }",
  "      window.location.reload();",
  "    } catch (error) {",
  "      console.error('Admin action failed', error);",
  "      alert(`Не удалось выполнить действие: ${error && error.message ? error.message : 'ошибка'}`);",
  "    } finally {",
  "      button.disabled = false;",
  "      button.classList.remove('opacity-60');",
  "    }",
  "  };",
  "  const handleFormSubmit = async function(form){",
  "    var type = form.getAttribute('data-admin-form');",
  "    if (!type) {",
  "      return;",
  "    }",
  "    var project = form.getAttribute('data-project') || '';",
  "    var endpoint = '';",
  "    if (type === 'create-project') {",
  "      endpoint = '/api/admin';",
  "    } else if (type === 'update-project') {",
  "      if (!project) { alert('Не выбран проект'); return; }",
  "      endpoint = `/api/admin/project/${project}`;",
  "    } else if (type === 'update-billing') {",
  "      if (!project) { alert('Не выбран проект'); return; }",
  "      endpoint = `/api/admin/project/${project}/billing`;",
  "    } else {",
  "      return;",
  "    }",
  "    var data = {};",
  "    var formData = new FormData(form);",
  "    formData.forEach(function(value, key){",
  "      if (typeof value === 'string') {",
  "        var trimmed = value.trim();",
  "        if (trimmed) {",
  "          data[key] = trimmed;",
  "        }",
  "      }",
  "    });",
  "    if (type === 'create-project' && !data.id) {",
  "      alert('Укажите ID проекта');",
  "      return;",
  "    }",
  "    var submitButton = form.querySelector('button[type=\"submit\"]');",
  "    if (submitButton) {",
  "      submitButton.disabled = true;",
  "      submitButton.classList.add('opacity-60');",
  "    }",
  "    try {",
  "      var response = await fetch(buildUrl(endpoint), {",
  "        method: 'POST',",
  "        headers: { 'content-type': 'application/json' },",
  "        body: JSON.stringify(data)",
  "      });",
  "      if (!response.ok) {",
  "        var text = await response.text();",
  "        throw new Error(text || 'Request failed');",
  "      }",
  "      window.location.reload();",
  "    } catch (error) {",
  "      console.error('Admin form submission failed', error);",
  "      alert(`Не удалось сохранить изменения: ${error && error.message ? error.message : 'ошибка'}`);",
  "    } finally {",
  "      if (submitButton) {",
  "        submitButton.disabled = false;",
  "        submitButton.classList.remove('opacity-60');",
  "      }",
  "    }",
  "  };",
  "  document.addEventListener('click', function(event){",
  "    var target = event.target instanceof HTMLElement ? event.target.closest('button') : null;",
  "    if (!target) {",
  "      return;",
  "    }",
  "    if (target.hasAttribute('data-account-chat')) {",
  "      event.preventDefault();",
  "      handleAccountChatSelect(target);",
  "      return;",
  "    }",
  "    if (target.hasAttribute('data-account-action')) {",
  "      event.preventDefault();",
  "      handleAccountAction(target);",
  "      return;",
  "    }",
  "    if (target.hasAttribute('data-tech-action')) {",
  "      event.preventDefault();",
  "      handleTechAction(target);",
  "      return;",
  "    }",
  "    if (target.hasAttribute('data-admin-action')) {",
  "      event.preventDefault();",
  "      handleAction(target);",
  "    }",
  "  });",
  "  document.addEventListener('submit', function(event){",
  "    var form = event.target;",
  "    if (form instanceof HTMLFormElement && form.hasAttribute('data-admin-form')) {",
  "      event.preventDefault();",
  "      handleFormSubmit(form);",
  "    }",
  "  });",
  "})();"
].join("\n");

export const renderAdminPage = (data: AdminDashboardData): string => {
  const content = joinHtml([
    renderTabs(),
    renderTabContent(data),
  ]);

  const sidebar = `<div class="p-6 space-y-6">${'<div class="text-sm font-semibold uppercase text-slate-500">Навигация</div>'}<nav class="space-y-2 text-sm">${'<a class="block rounded-lg bg-slate-900 px-3 py-2 text-emerald-400" href="/admin">Админ-панель</a>'}<a class="block rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-900" href="/api/projects">Список проектов (API)</a>${'<a class="block rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-900" href="/api/meta/status">Статус Meta (API)</a>'}<a class="block rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-900" href="/api/ping">Проверка воркера</a>${'</nav>'}</div>`;

  const scripts = `<script>${TAB_SCRIPT}</script><script>\${ACTION_SCRIPT}</script>`;

  return renderLayout(content, { title: "Админ-панель", sidebar, scripts });
};
