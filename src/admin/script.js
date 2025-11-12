const api = window.TargetBotAdminAPI;

const dashboard = document.querySelector("#dashboard");
const usersPanel = document.querySelector("#users");
const leadsPanel = document.querySelector("#leads");
const integrationsPanel = document.querySelector("#integrations");
const settingsPanel = document.querySelector("#settings");
const tabs = document.querySelectorAll(".tab-button");
const leadFilters = {
  status: "all",
  source: "all",
  from: "",
  to: "",
};

function humanize(value) {
  return value
    .toString()
    .split(/[\s_-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const integerFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function formatInteger(value) {
  return typeof value === "number" && Number.isFinite(value) ? integerFormatter.format(value) : "—";
}

function formatDecimal(value) {
  return typeof value === "number" && Number.isFinite(value) ? decimalFormatter.format(value) : "—";
}

function formatPercentage(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
}

function activateTab(targetId) {
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === targetId);
  });
  tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.target === targetId);
  });
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => activateTab(tab.dataset.target));
});

async function renderDashboard() {
  dashboard.innerHTML = `<div class="space-y-4">
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <article class="card">
        <h2 class="card-title">Лиды</h2>
        <p class="card-value" id="leads-today">—</p>
        <p class="card-subvalue" id="leads-yesterday">Вчера: —</p>
      </article>
      <article class="card">
        <h2 class="card-title">Spend Meta</h2>
        <p class="card-value" id="meta-spend">—</p>
        <p class="card-subvalue" id="meta-ctr">CTR: —</p>
      </article>
      <article class="card">
        <h2 class="card-title">Средний CPL</h2>
        <p class="card-value" id="meta-cpl">—</p>
        <p class="card-subvalue" id="meta-leads">Лиды: —</p>
      </article>
      <article class="card">
        <h2 class="card-title">Webhook</h2>
        <p class="card-value" id="telegram-webhook">—</p>
        <p class="card-subvalue" id="telegram-webhook-note"></p>
      </article>
    </div>
    <p class="text-xs text-slate-500" id="dashboard-updated">Обновлено: —</p>
  </div>`;

  const data = await api.getDashboard();
  const snapshot = data.snapshot ?? data;
  const leads = snapshot.leads ?? {};
  const metaTotals = snapshot.meta?.totals ?? {};
  const webhook = snapshot.telegramWebhook ?? {};

  document.querySelector("#leads-today").textContent = formatInteger(leads.today);
  document.querySelector("#leads-yesterday").textContent = `Вчера: ${formatInteger(leads.yesterday)}`;
  document.querySelector("#meta-spend").textContent = formatDecimal(metaTotals.spend);
  document.querySelector("#meta-cpl").textContent = formatDecimal(metaTotals.cpl ?? undefined);
  document.querySelector("#meta-ctr").textContent = `CTR: ${formatPercentage(metaTotals.ctr ?? undefined)}`;
  document.querySelector("#meta-leads").textContent = `Лиды: ${formatInteger(metaTotals.leads)}`;

  const webhookStatus = webhook.configured
    ? webhook.url
      ? "Активен"
      : "Ожидает URL"
    : "Не подключён";
  document.querySelector("#telegram-webhook").textContent = webhookStatus;

  const webhookNotes = [];
  if (webhook.url) webhookNotes.push(webhook.url);
  if (typeof webhook.pendingUpdateCount === "number") {
    webhookNotes.push(`Очередь: ${formatInteger(webhook.pendingUpdateCount)}`);
  }
  if (webhook.lastErrorMessage) webhookNotes.push(`Ошибка: ${webhook.lastErrorMessage}`);
  if (webhook.error && !webhook.lastErrorMessage) webhookNotes.push(webhook.error);
  document.querySelector("#telegram-webhook-note").textContent = webhookNotes.join(" · ") || "Без ошибок";

  const updatedAt = snapshot.generatedAt ? new Date(snapshot.generatedAt).toLocaleString() : "—";
  const metaUpdated = snapshot.meta?.updatedAt ? new Date(snapshot.meta.updatedAt).toLocaleString() : "—";
  document.querySelector("#dashboard-updated").textContent = `Обновлено: ${updatedAt} · Meta: ${metaUpdated}`;
}

async function renderUsers() {
  const data = await api.getUsers();
  usersPanel.innerHTML = `<div class="overflow-x-auto">
    <table class="table">
      <thead><tr><th>ID</th><th>Имя</th><th>Username</th><th>Роль</th></tr></thead>
      <tbody>
        ${data.users
          .map(
            (user) => `<tr>
              <td>${user.id}</td>
              <td>${user.firstName ?? "—"} ${user.lastName ?? ""}</td>
              <td>${user.username ? "@" + user.username : "—"}</td>
              <td><span class="badge">${user.role}</span></td>
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  </div>`;
}

async function renderLeads() {
  const data = await api.getLeads(leadFilters);
  const statuses = data.available?.statuses ?? ["new", "in_progress", "closed"];
  const sources = data.available?.sources ?? ["telegram", "facebook", "manual"];

  leadsPanel.innerHTML = `<div class="space-y-4">
    <section class="card space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="card-title">Фильтры</h2>
        <button type="button" class="btn-secondary" id="lead-filters-reset">Сбросить</button>
      </div>
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <label class="flex flex-col gap-2 text-sm text-slate-300">
          <span>Статус</span>
          <select id="lead-status-filter" class="rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-slate-100">
            <option value="all">Все статусы</option>
            ${statuses
              .map((status) => `<option value="${status}">${humanize(status)}</option>`)
              .join("")}
          </select>
        </label>
        <label class="flex flex-col gap-2 text-sm text-slate-300">
          <span>Источник</span>
          <select id="lead-source-filter" class="rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-slate-100">
            <option value="all">Все источники</option>
            ${sources
              .map((source) => `<option value="${source}">${humanize(source)}</option>`)
              .join("")}
          </select>
        </label>
        <label class="flex flex-col gap-2 text-sm text-slate-300">
          <span>С даты</span>
          <input type="date" id="lead-from-filter" class="rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-slate-100" />
        </label>
        <label class="flex flex-col gap-2 text-sm text-slate-300">
          <span>По дату</span>
          <input type="date" id="lead-to-filter" class="rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-slate-100" />
        </label>
      </div>
    </section>
    <div class="overflow-x-auto">
      <table class="table">
        <thead><tr><th>ID</th><th>Имя</th><th>Контакт</th><th>Источник</th><th>Статус</th><th>Создан</th><th>Обновлено</th></tr></thead>
        <tbody>
          ${data.leads
            .map(
              (lead) => `<tr>
                <td>${lead.id}</td>
                <td>${lead.name}</td>
                <td>${lead.contact}</td>
                <td>${lead.source ? humanize(lead.source) : "—"}</td>
                <td><span class="badge">${humanize(lead.status)}</span></td>
                <td>${new Date(lead.createdAt).toLocaleString()}</td>
                <td>${new Date(lead.updatedAt).toLocaleString()}</td>
              </tr>`,
            )
            .join("") || `<tr><td colspan="7" class="text-center text-slate-400">Заявок не найдено</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;

  const statusSelect = leadsPanel.querySelector("#lead-status-filter");
  const sourceSelect = leadsPanel.querySelector("#lead-source-filter");
  const fromInput = leadsPanel.querySelector("#lead-from-filter");
  const toInput = leadsPanel.querySelector("#lead-to-filter");
  const resetButton = leadsPanel.querySelector("#lead-filters-reset");

  if (statusSelect) statusSelect.value = leadFilters.status;
  if (sourceSelect) sourceSelect.value = leadFilters.source;
  if (fromInput) fromInput.value = leadFilters.from;
  if (toInput) toInput.value = leadFilters.to;

  statusSelect?.addEventListener("change", async (event) => {
    leadFilters.status = event.target.value;
    await renderLeads();
  });

  sourceSelect?.addEventListener("change", async (event) => {
    leadFilters.source = event.target.value;
    await renderLeads();
  });

  fromInput?.addEventListener("change", async (event) => {
    leadFilters.from = event.target.value;
    await renderLeads();
  });

  toInput?.addEventListener("change", async (event) => {
    leadFilters.to = event.target.value;
    await renderLeads();
  });

  resetButton?.addEventListener("click", async () => {
    leadFilters.status = "all";
    leadFilters.source = "all";
    leadFilters.from = "";
    leadFilters.to = "";
    await renderLeads();
  });
}

async function renderIntegrations() {
  integrationsPanel.innerHTML = `<div class="space-y-4">
    <section class="card">
      <h2 class="card-title">Facebook Meta</h2>
      <p class="text-sm text-slate-400">OAuth авторизация и синхронизация кампаний.</p>
      <a class="btn-primary inline-flex items-center" href="/auth/facebook">🔗 Подключить Meta</a>
    </section>
    <section class="card">
      <h2 class="card-title">Telegram Webhook</h2>
      <p class="text-sm text-slate-400">Проверка и обновление вебхука Telegram.</p>
      <button class="btn-secondary" id="refreshWebhook">🔁 Обновить</button>
    </section>
  </div>`;
  document.querySelector("#refreshWebhook").addEventListener("click", async () => {
    await api.refreshWebhook();
    alert("Вебхук обновлён");
  });
}

async function renderSettings() {
  const settings = await api.getSettings();
  const keys = settings.apiKeys ?? [];
  settingsPanel.innerHTML = `<div class="grid gap-4">
    <article class="card">
      <h2 class="card-title">Общие настройки</h2>
      <dl class="grid gap-2 text-sm text-slate-300">
        <div class="flex justify-between"><dt>Worker URL</dt><dd>${settings.workerUrl ?? "—"}</dd></div>
        <div class="flex justify-between"><dt>Telegram Token</dt><dd>${settings.telegramTokenConfigured ? "скрыт" : "—"}</dd></div>
        <div class="flex justify-between"><dt>Facebook App</dt><dd>${settings.facebookAppId ?? "—"}</dd></div>
      </dl>
    </article>
    <article class="card space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="card-title">API ключи</h2>
        <button class="btn-primary" id="createApiKey">➕ Создать</button>
      </div>
      <p class="text-sm text-slate-400">Используйте ключи для интеграции партнёров и сервисов через заголовок <code>X-Auth-Key</code>.</p>
      <div class="overflow-x-auto">
        <table class="table">
          <thead><tr><th>Ключ</th><th>Метка</th><th>Роль</th><th>Создан</th><th>Последнее использование</th><th></th></tr></thead>
          <tbody>
            ${keys
              .map(
                (key) => `<tr>
                  <td class="font-mono text-xs">${key.key}</td>
                  <td>${key.label ?? "—"}</td>
                  <td><span class="badge">${key.role}</span></td>
                  <td>${new Date(key.createdAt).toLocaleString()}</td>
                  <td>${key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "—"}</td>
                  <td class="text-right"><button class="btn-secondary delete-api-key" data-key="${key.key}">Удалить</button></td>
                </tr>`,
              )
              .join("") || `<tr><td colspan="6" class="text-center text-slate-400">Ключи ещё не созданы</td></tr>`}
          </tbody>
        </table>
      </div>
    </article>
  </div>`;

  document.querySelector("#createApiKey").addEventListener("click", async () => {
    const label = prompt("Название ключа", "Партнёр");
    if (label === null) return;
    const role = prompt("Роль для ключа (admin/manager/partner/service)", "partner");
    if (role === null) return;
    const owner = prompt("Идентификатор владельца (опционально)") || undefined;
    const response = await api.createApiKey({ label, role: role.trim().toLowerCase(), owner });
    alert(`Создан ключ: ${response.key.key}`);
    await renderSettings();
  });

  document.querySelectorAll(".delete-api-key").forEach((button) => {
    button.addEventListener("click", async () => {
      const keyValue = button.dataset.key;
      if (!keyValue) return;
      if (!confirm("Удалить ключ?")) return;
      await api.deleteApiKey(keyValue);
      await renderSettings();
    });
  });
}

async function bootstrap() {
  await renderDashboard();
  await renderUsers();
  await renderLeads();
  await renderIntegrations();
  await renderSettings();
}

document.querySelector("#refreshMeta").addEventListener("click", async () => {
  await api.syncMeta();
  await renderDashboard();
  alert("Синхронизация Meta выполнена");
});

document.querySelector("#checkWebhook").addEventListener("click", async () => {
  const status = await api.checkWebhook();
  alert(`Webhook: ${status.status}`);
});

bootstrap().catch((error) => {
  console.error(error);
  dashboard.innerHTML = `<div class="card">Не удалось загрузить данные: ${error.message}</div>`;
});
