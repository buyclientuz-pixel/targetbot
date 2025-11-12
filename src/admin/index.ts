import { MetaAdAccount, MetaStatusResponse, ProjectRecord } from "../types";
import { renderLayout } from "../components/layout";
import { escapeAttribute, escapeHtml } from "../utils/html";

export interface AdminDashboardProps {
  meta: MetaStatusResponse | null;
  accounts: MetaAdAccount[];
  projects: ProjectRecord[];
}

const statusBadge = (meta: MetaStatusResponse | null): string => {
  if (!meta) {
    return '<span class="badge warning">Нет токена</span>';
  }
  if (!meta.ok) {
    const message = meta.issues?.[0] ? escapeHtml(meta.issues[0]) : "Ошибка Meta";
    return `<span class="badge error">${message}</span>`;
  }
  const statusClass = meta.status === "valid" ? "success" : "warning";
  const label = meta.status === "valid" ? "Токен активен" : "Требуется обновление";
  return `<span class="badge ${statusClass}">${label}</span>`;
};

const projectCard = (project: ProjectRecord): string => {
  const chat = project.telegramLink
    ? `<a class="btn btn-secondary" href="${escapeAttribute(project.telegramLink)}" target="_blank">Перейти в чат</a>`
    : project.telegramChatId
    ? `<span class="muted">Чат: ${escapeHtml(project.telegramChatId)}</span>`
    : '<span class="muted">Чат не подключён</span>';
  const account = project.adAccountId
    ? `<span class="muted">Рекламный кабинет: ${escapeHtml(project.adAccountId)}</span>`
    : '<span class="muted">Кабинет не выбран</span>';
  return `
    <div class="card">
      <h3>${escapeHtml(project.name)}</h3>
      <div class="muted">Обновлено: ${new Date(project.updatedAt).toLocaleString("ru-RU")}</div>
      <div class="actions" style="margin-top:16px;">
        ${chat}
        ${account}
        <a class="btn btn-secondary" href="/admin/projects/${escapeAttribute(project.id)}">Редактировать</a>
        <a class="btn btn-primary" href="/portal/${escapeAttribute(project.id)}" target="_blank">Открыть портал</a>
      </div>
    </div>
  `;
};

const accountsTable = (accounts: MetaAdAccount[]): string => {
  if (!accounts.length) {
    return '<p class="muted">Нет доступных рекламных кабинетов</p>';
  }
  const rows = accounts
    .map(
      (account) => `
        <tr>
          <td>${escapeHtml(account.name || "—")}</td>
          <td>${escapeHtml(account.id || "—")}</td>
          <td>${escapeHtml(account.currency || "—")}</td>
          <td>${escapeHtml(account.status || "—")}</td>
          <td>${escapeHtml(account.business?.name || "—")}</td>
        </tr>
      `,
    )
    .join("\n");
  return `
    <table>
      <thead>
        <tr>
          <th>Название</th>
          <th>ID</th>
          <th>Валюта</th>
          <th>Статус</th>
          <th>Бизнес</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
};

export const renderAdminDashboard = ({ meta, accounts, projects }: AdminDashboardProps): string => {
  const body = `
    <section class="card">
      <h2>Meta OAuth</h2>
      <p>${statusBadge(meta)}</p>
      <div class="actions">
        <a class="btn btn-primary" href="/api/meta/oauth/start">Авторизоваться в Facebook</a>
        <button class="btn btn-secondary" id="refreshMeta">Обновить токен</button>
      </div>
      <p class="muted">Статус обновлён: ${meta?.refreshedAt || "—"}</p>
    </section>
    <section class="card">
      <h2>Рекламные кабинеты</h2>
      ${accountsTable(accounts)}
    </section>
    <section>
      <h2>Проекты</h2>
      <div class="actions">
        <a class="btn btn-primary" href="/admin/projects/new" id="createProject">Создать проект</a>
      </div>
      <div class="grid two" style="margin-top:16px;">
        ${projects.map(projectCard).join("\n")}
      </div>
    </section>
  `;

  const scripts = `
    const refreshBtn = document.getElementById('refreshMeta');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.setAttribute('disabled', 'true');
        refreshBtn.textContent = 'Обновляем...';
        try {
          const response = await fetch('/api/meta/refresh', { method: 'POST' });
          const data = await response.json();
          if (data.ok) {
            window.location.reload();
          } else {
            alert('Ошибка обновления токена: ' + data.error);
          }
        } catch (error) {
          alert('Ошибка сети: ' + error.message);
        } finally {
          refreshBtn.removeAttribute('disabled');
          refreshBtn.textContent = 'Обновить токен';
        }
      });
    }
  `;

  return renderLayout({ title: "Targetbot Admin", body, scripts });
};
