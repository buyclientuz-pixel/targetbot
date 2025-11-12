const app = document.querySelector('#app');

const tabs = [
  { id: 'dashboard', label: '📈 Статистика' },
  { id: 'users', label: '👤 Пользователи' },
  { id: 'leads', label: '💬 Заявки' },
  { id: 'integrations', label: '⚙️ Интеграции' },
  { id: 'settings', label: '🔒 Настройки' }
];

const storedKey = sessionStorage.getItem('targetbot:adminKey') ?? '';
let adminKey = new URLSearchParams(window.location.search).get('key') ?? storedKey;
if (!adminKey) {
  adminKey = prompt('Введите ключ администратора TargetBot') ?? '';
}
if (adminKey) {
  sessionStorage.setItem('targetbot:adminKey', adminKey);
}

const state = {
  activeTab: 'dashboard',
  snapshot: null,
  leads: [],
  users: [],
  integrations: null,
  settings: null,
  adminKey
};

async function fetchJSON(path, init = {}) {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(state.adminKey
        ? {
            'x-auth-key': state.adminKey
          }
        : {}),
      ...(init.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed ${res.status}: ${text}`);
  }
  return res.json();
}

function renderTabs() {
  return `
    <nav class="flex flex-wrap gap-2 mb-8">
      ${tabs
        .map(
          (tab) => `
            <button data-tab="${tab.id}" class="px-4 py-2 rounded-lg border border-slate-800 transition ${
              state.activeTab === tab.id
                ? 'bg-emerald-500 text-white shadow-lg'
                : 'bg-slate-900 hover:bg-slate-800'
            }">${tab.label}</button>
          `
        )
        .join('')}
    </nav>
  `;
}

function renderDashboard() {
  const metrics = state.snapshot?.metrics ?? {};
  return `
    <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      ${[
        { title: 'Лиды сегодня', value: metrics.leadsToday ?? '—' },
        { title: 'Лиды вчера', value: metrics.leadsYesterday ?? '—' },
        { title: 'CPL', value: metrics.cpl ?? '—' },
        { title: 'CTR', value: metrics.ctr ?? '—' }
      ]
        .map(
          (item) => `
            <article class="card">
              <h3 class="text-sm text-slate-400 uppercase tracking-wide">${item.title}</h3>
              <p class="text-3xl font-semibold mt-2">${item.value}</p>
            </article>
          `
        )
        .join('')}
    </section>
  `;
}

function renderLeads() {
  if (!state.leads?.length) {
    return '<p class="text-slate-400">Нет заявок</p>';
  }
  return `
    <section class="overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead class="text-slate-400 uppercase">
          <tr>
            <th class="px-3 py-2 text-left">Имя</th>
            <th class="px-3 py-2 text-left">Контакт</th>
            <th class="px-3 py-2 text-left">Источник</th>
            <th class="px-3 py-2 text-left">Статус</th>
            <th class="px-3 py-2 text-left">Создано</th>
          </tr>
        </thead>
        <tbody>
          ${state.leads
            .map(
              (lead) => `
                <tr class="border-t border-slate-800">
                  <td class="px-3 py-2">${lead.name ?? '—'}</td>
                  <td class="px-3 py-2">${lead.contact ?? '—'}</td>
                  <td class="px-3 py-2">${lead.source ?? '—'}</td>
                  <td class="px-3 py-2">${lead.status ?? '—'}</td>
                  <td class="px-3 py-2">${lead.createdAt ?? '—'}</td>
                </tr>
              `
            )
            .join('')}
        </tbody>
      </table>
    </section>
  `;
}

function renderUsers() {
  if (!state.users?.length) {
    return '<p class="text-slate-400">Нет пользователей</p>';
  }
  return `
    <section class="grid gap-4">
      ${state.users
        .map(
          (user) => `
            <article class="card">
              <h3 class="text-lg font-semibold">${user.firstName ?? '—'} ${user.lastName ?? ''}</h3>
              <p class="text-slate-400">ID: ${user.telegramId ?? '—'}</p>
              <p class="text-slate-400">Роль: ${user.role ?? '—'}</p>
            </article>
          `
        )
        .join('')}
    </section>
  `;
}

function renderIntegrations() {
  const meta = state.integrations?.meta ?? {};
  const telegram = state.integrations?.telegram ?? {};
  return `
    <section class="grid gap-4 md:grid-cols-2">
      <article class="card">
        <h3 class="text-lg font-semibold mb-2">Meta Ads</h3>
        <p class="text-slate-400">Статус: ${meta.status ?? 'unknown'}</p>
        <p class="text-slate-400">Кампания: ${meta.campaignId ?? '—'}</p>
        <button class="btn-primary mt-4" data-action="sync-meta">Обновить статистику</button>
      </article>
      <article class="card">
        <h3 class="text-lg font-semibold mb-2">Telegram Webhook</h3>
        <p class="text-slate-400">Статус: ${telegram.status ?? 'unknown'}</p>
        <button class="btn-primary mt-4" data-action="refresh-webhook">Проверить Webhook</button>
      </article>
    </section>
  `;
}

function renderSettings() {
  const settings = state.settings ?? {};
  return `
    <section class="card space-y-4">
      <div>
        <label class="block text-sm text-slate-400 mb-1">Worker URL</label>
        <input class="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2" value="${settings.workerUrl ?? ''}" readonly />
      </div>
      <div>
        <label class="block text-sm text-slate-400 mb-1">Admin Key</label>
        <input class="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2" value="${settings.adminKey ?? ''}" readonly />
      </div>
      <p class="text-sm text-slate-500">Настоящие секреты управляются через KV и не отображаются в интерфейсе.</p>
    </section>
  `;
}

const renderers = {
  dashboard: renderDashboard,
  leads: renderLeads,
  users: renderUsers,
  integrations: renderIntegrations,
  settings: renderSettings
};

function render() {
  app.innerHTML = `
    <header class="py-10 mb-10 text-center shadow-lg">
      <h1 class="text-3xl font-bold">TargetBot Admin Portal</h1>
      <p class="text-slate-100/80 mt-2">Управление лидами, пользователями и интеграциями</p>
    </header>
    <main class="max-w-6xl mx-auto px-6 pb-16">
      ${renderTabs()}
      <div id="tab-content">${renderers[state.activeTab]?.() ?? ''}</div>
    </main>
  `;

  document.querySelectorAll('button[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeTab = btn.dataset.tab;
      render();
    });
  });

  document.querySelector('[data-action="sync-meta"]')?.addEventListener('click', syncMeta);
  document.querySelector('[data-action="refresh-webhook"]')?.addEventListener('click', refreshWebhook);
}

async function bootstrap() {
  try {
    const [snapshot, leads, users, integrations, settings] = await Promise.all([
      fetchJSON('/api/dashboard'),
      fetchJSON('/api/leads'),
      fetchJSON('/api/users'),
      fetchJSON('/meta/status'),
      fetchJSON('/api/settings')
    ]);
    state.snapshot = snapshot;
    state.leads = leads.items ?? [];
    state.users = users.items ?? [];
    state.integrations = integrations;
    state.settings = settings;
  } catch (error) {
    console.error('Failed to bootstrap admin:', error);
  } finally {
    render();
  }
}

async function syncMeta() {
  try {
    await fetchJSON('/meta/sync', { method: 'POST', body: JSON.stringify({ refresh: true }) });
    const status = await fetchJSON('/meta/status');
    state.integrations = status;
    render();
  } catch (error) {
    alert(`Ошибка синхронизации Meta: ${error.message}`);
  }
}

async function refreshWebhook() {
  try {
    const res = await fetchJSON('/manage/telegram/webhook?refresh=1');
    alert(res?.status ?? 'Webhook refreshed');
  } catch (error) {
    alert(`Ошибка обновления Webhook: ${error.message}`);
  }
}

bootstrap();
