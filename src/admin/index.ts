import { MetaAdAccount, MetaStatusResponse, ProjectSummary } from "../types";
import { renderLayout } from "../components/layout";
import { escapeAttribute, escapeHtml } from "../utils/html";

export interface AdminDashboardProps {
  meta: MetaStatusResponse | null;
  accounts: MetaAdAccount[];
  projects: ProjectSummary[];
  flash?: AdminFlashMessage;
}

export interface AdminFlashMessage {
  type: "success" | "error" | "info";
  message: string;
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

const accountStatusBadge = (account: MetaAdAccount): string => {
  if (!account.status && account.statusCode === undefined) {
    return '<span class="muted">—</span>';
  }
  const parts: string[] = [];
  if (account.status) {
    parts.push(escapeHtml(account.status));
  }
  if (account.statusCode !== undefined) {
    parts.push(`код ${account.statusCode}`);
  }
  const label = parts.join(" · ");
  const severity = account.statusSeverity;
  const badgeClass = severity ? `badge ${severity}` : "badge warning";
  return `<span class="${badgeClass}">${label}</span>`;
};

const accountSpendCell = (account: MetaAdAccount): string => {
  if (!account.spendFormatted && account.spend === undefined) {
    return '<span class="muted">—</span>';
  }
  const spendValue = account.spendFormatted
    ? `<strong>${escapeHtml(account.spendFormatted)}</strong>`
    : account.spend !== undefined
      ? `<strong>${escapeHtml(account.spend.toFixed(2))}</strong>`
      : '<span class="muted">—</span>';
  const period = account.spendPeriod
    ? `<div class="muted">${escapeHtml(account.spendPeriod)}</div>`
    : "";
  const metricsParts: string[] = [];
  if (account.impressions !== undefined) {
    metricsParts.push(`Импр.: ${account.impressions.toLocaleString("ru-RU")}`);
  }
  if (account.clicks !== undefined) {
    metricsParts.push(`Клики: ${account.clicks.toLocaleString("ru-RU")}`);
  }
  const metricsLine = metricsParts.length
    ? `<div class="muted">${escapeHtml(metricsParts.join(" · "))}</div>`
    : "";
  const topCampaign = account.campaigns?.[0];
  const campaignLine = topCampaign
    ? `<div class="muted">Топ: ${escapeHtml(topCampaign.name)}${
        topCampaign.spendFormatted ? ` — ${escapeHtml(topCampaign.spendFormatted)}` : ""
      }</div>`
    : "";
  return `<div>${spendValue}${period}${metricsLine}${campaignLine}</div>`;
};

const projectCard = (project: ProjectSummary): string => {
  const chat = project.telegramLink
    ? `<a class="btn btn-secondary" href="${escapeAttribute(project.telegramLink)}" target="_blank">Перейти в чат</a>`
    : project.telegramChatId
    ? `<span class="muted">Чат: ${escapeHtml(project.telegramChatId)}</span>`
    : '<span class="muted">Чат не подключён</span>';
  const account = project.adAccountId
    ? `<span class="muted">Рекламный кабинет: ${escapeHtml(project.adAccountId)}</span>`
    : '<span class="muted">Кабинет не выбран</span>';
  const latestLead = project.leadStats.latestAt
    ? new Date(project.leadStats.latestAt).toLocaleString("ru-RU")
    : "—";
  const leadBadge =
    project.leadStats.new > 0
      ? `<span class="badge warning">Новых лидов: ${project.leadStats.new}</span>`
      : '<span class="badge success">Новых лидов нет</span>';
  const leadSummary = `
    <div class="muted">
      Всего: ${project.leadStats.total} · Завершено: ${project.leadStats.done} · Последний лид: ${latestLead}
    </div>
  `;
  return `
    <div class="card">
      <h3>${escapeHtml(project.name)}</h3>
      <div class="muted">Обновлено: ${new Date(project.updatedAt).toLocaleString("ru-RU")}</div>
      <div class="actions" style="margin-top:12px;">
        ${leadBadge}
      </div>
      ${leadSummary}
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
          <td>${accountSpendCell(account)}</td>
          <td>${accountStatusBadge(account)}</td>
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
          <th>Расход</th>
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

const campaignsTable = (accounts: MetaAdAccount[]): string => {
  const entries = accounts.flatMap((account) =>
    (account.campaigns || []).map((campaign) => ({ account, campaign })),
  );
  if (!entries.length) {
    return '<p class="muted">Нет данных по кампаниям Meta за выбранный период</p>';
  }
  const top = entries
    .sort((a, b) => (b.campaign.spend ?? 0) - (a.campaign.spend ?? 0))
    .slice(0, 10);
  const rows = top
    .map(({ account, campaign }) => {
      const spend = campaign.spendFormatted
        ? escapeHtml(campaign.spendFormatted)
        : campaign.spend !== undefined
          ? escapeHtml(campaign.spend.toFixed(2))
          : "—";
      const period = campaign.spendPeriod
        ? `<div class="muted">${escapeHtml(campaign.spendPeriod)}</div>`
        : "";
      const statusParts = [campaign.status, campaign.effectiveStatus].filter(Boolean);
      const status = statusParts.length ? escapeHtml(statusParts.join(" · ")) : "—";
      return `
        <tr>
          <td>${escapeHtml(campaign.name)}</td>
          <td>${escapeHtml(account.name)}<div class="muted">${escapeHtml(account.id)}</div></td>
          <td><div><strong>${spend}</strong>${period}</div></td>
          <td>${status}</td>
        </tr>
      `;
    })
    .join("\n");
  return `
    <table>
      <thead>
        <tr>
          <th>Кампания</th>
          <th>Аккаунт</th>
          <th>Расход</th>
          <th>Статус</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
};

export const renderAdminDashboard = ({ meta, accounts, projects, flash }: AdminDashboardProps): string => {
  const flashBlock = flash
    ? `<div class="alert ${flash.type}">${escapeHtml(flash.message)}</div>`
    : "";
  const spendPeriodLabel = accounts.find((account) => account.spendPeriod)?.spendPeriod;
  const body = `
    ${flashBlock}
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
      ${spendPeriodLabel ? `<p class="muted">Период: ${escapeHtml(spendPeriodLabel)}</p>` : ""}
      ${accountsTable(accounts)}
    </section>
    <section class="card">
      <h2>Кампании Meta (топ 10)</h2>
      ${campaignsTable(accounts)}
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
    (function () {
      const params = new URLSearchParams(window.location.search);
      if (params.has('meta') || params.has('metaMessage')) {
        params.delete('meta');
        params.delete('metaMessage');
        const nextSearch = params.toString();
        const nextUrl = window.location.pathname + (nextSearch ? '?' + nextSearch : '') + window.location.hash;
        history.replaceState({}, document.title, nextUrl);
      }
    })();

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
