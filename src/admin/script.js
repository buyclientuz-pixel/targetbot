const api = window.TargetBotAdminAPI;

const dashboard = document.querySelector("#dashboard");
const usersPanel = document.querySelector("#users");
const leadsPanel = document.querySelector("#leads");
const integrationsPanel = document.querySelector("#integrations");
const settingsPanel = document.querySelector("#settings");
const tabs = document.querySelectorAll(".tab-button");

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
  dashboard.innerHTML = `<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
    <article class="card">
      <h2 class="card-title">Лиды сегодня</h2>
      <p class="card-value" id="leads-today">—</p>
    </article>
    <article class="card">
      <h2 class="card-title">Spend Meta</h2>
      <p class="card-value" id="meta-spend">—</p>
    </article>
    <article class="card">
      <h2 class="card-title">Средний CPL</h2>
      <p class="card-value" id="meta-cpl">—</p>
    </article>
    <article class="card">
      <h2 class="card-title">Webhook</h2>
      <p class="card-value" id="telegram-webhook">—</p>
    </article>
  </div>`;
  const [leads, settings] = await Promise.all([api.getLeads(), api.getSettings()]);
  const leadsToday = leads.leads?.filter((lead) => new Date(lead.createdAt).toDateString() === new Date().toDateString()) ?? [];
  document.querySelector("#leads-today").textContent = String(leadsToday.length);
  document.querySelector("#meta-spend").textContent = settings.metaToken?.spend ?? "—";
  document.querySelector("#meta-cpl").textContent = settings.metaToken?.cpl ?? "—";
  document.querySelector("#telegram-webhook").textContent = settings.telegramTokenConfigured ? "Активен" : "Не подключён";
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
  const data = await api.getLeads();
  leadsPanel.innerHTML = `<div class="overflow-x-auto">
    <table class="table">
      <thead><tr><th>ID</th><th>Имя</th><th>Контакт</th><th>Статус</th><th>Обновлено</th></tr></thead>
      <tbody>
        ${data.leads
          .map(
            (lead) => `<tr>
              <td>${lead.id}</td>
              <td>${lead.name}</td>
              <td>${lead.contact}</td>
              <td><span class="badge">${lead.status}</span></td>
              <td>${new Date(lead.updatedAt).toLocaleString()}</td>
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  </div>`;
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
  settingsPanel.innerHTML = `<div class="grid gap-4">
    <article class="card">
      <h2 class="card-title">Общие настройки</h2>
      <dl class="grid gap-2 text-sm text-slate-300">
        <div class="flex justify-between"><dt>Worker URL</dt><dd>${settings.workerUrl ?? "—"}</dd></div>
        <div class="flex justify-between"><dt>Telegram Token</dt><dd>${settings.telegramTokenConfigured ? "скрыт" : "—"}</dd></div>
        <div class="flex justify-between"><dt>Facebook App</dt><dd>${settings.facebookAppId ?? "—"}</dd></div>
      </dl>
    </article>
  </div>`;
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
