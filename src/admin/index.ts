import { MetaAdAccount, MetaStatusResponse, ProjectSummary, ReportRecord } from "../types";
import { renderLayout } from "../components/layout";
import { escapeAttribute, escapeHtml } from "../utils/html";

export interface AdminDashboardProps {
  meta: MetaStatusResponse | null;
  accounts: MetaAdAccount[];
  projects: ProjectSummary[];
  reports: ReportRecord[];
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
  const billing = project.billing;
  const billingStatusLabel = (() => {
    if (billing.status === "missing") {
      return '<span class="badge warning">Оплата не настроена</span>';
    }
    const severityClass = billing.overdue ? "badge error" : billing.active ? "badge success" : "badge warning";
    const statusMap: Record<string, string> = {
      active: "Активен",
      pending: "Ожидает оплаты",
      overdue: "Просрочен",
      cancelled: "Отменён",
    };
    const statusLabel = statusMap[billing.status] ?? billing.status;
    return `<span class="${severityClass}">Биллинг: ${escapeHtml(statusLabel)}</span>`;
  })();

  const billingMeta = (() => {
    if (billing.status === "missing") {
      return '<span class="muted">Создайте запись оплаты, чтобы разблокировать портал и отчёты.</span>';
    }
    const parts: string[] = [];
    if (billing.amountFormatted) {
      parts.push(billing.amountFormatted);
    } else if (billing.amount !== undefined) {
      parts.push(`${billing.amount.toFixed(2)} ${escapeHtml(billing.currency || "USD")}`);
    }
    if (billing.periodLabel) {
      parts.push(billing.periodLabel);
    }
    if (billing.paidAt) {
      const paidAt = new Date(billing.paidAt).toLocaleString("ru-RU");
      parts.push(`Оплачен: ${escapeHtml(paidAt)}`);
    }
    if (billing.overdue) {
      parts.push("⚠️ Требуется внимание");
    }
    return parts.length ? `<span class="muted">${parts.map(escapeHtml).join(" · ")}</span>` : "";
  })();

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
        ${billingStatusLabel}
      </div>
      ${leadSummary}
      ${billingMeta ? `<div class="muted" style="margin-top:8px;">${billingMeta}</div>` : ""}
      <div class="actions" style="margin-top:16px;">
        ${chat}
        ${account}
        <a class="btn btn-secondary" href="/admin/projects/${escapeAttribute(project.id)}">Редактировать</a>
        <a class="btn btn-secondary" href="/admin/payments?project=${escapeAttribute(project.id)}">Платежи</a>
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

const formatReportDate = (value?: string): string => {
  if (!value) {
    return "—";
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return escapeHtml(value);
  }
  return escapeHtml(new Date(timestamp).toLocaleString("ru-RU"));
};

const reportPeriodLabel = (report: ReportRecord): string => {
  const metadata =
    report.metadata && typeof report.metadata === "object" && !Array.isArray(report.metadata)
      ? (report.metadata as Record<string, unknown>)
      : null;
  const metaPeriod = metadata && typeof metadata.periodLabel === "string" ? metadata.periodLabel.trim() : "";
  if (metaPeriod) {
    return metaPeriod;
  }
  const filters = report.filters;
  if (filters?.datePreset) {
    return filters.datePreset;
  }
  if (filters?.since || filters?.until) {
    const since = filters?.since ?? "";
    const until = filters?.until ?? "";
    if (since && until && since !== until) {
      return `${since} → ${until}`;
    }
    return since || until;
  }
  return "—";
};

const reportProjectLabel = (report: ReportRecord): string => {
  if (report.projectIds && report.projectIds.length > 1) {
    return `Несколько (${report.projectIds.length})`;
  }
  if (report.projectIds && report.projectIds.length === 1) {
    return report.projectIds[0];
  }
  return report.projectId || "—";
};

const previewSummary = (summary?: string): string => {
  if (!summary) {
    return '<span class="muted">—</span>';
  }
  const normalized = summary.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return '<span class="muted">—</span>';
  }
  const limit = 160;
  const text = normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
  return escapeHtml(text);
};

const renderReportsTable = (reports: ReportRecord[]): string => {
  if (!reports.length) {
    return '<p class="muted">Отчёты ещё не сформированы. Используйте Telegram-команды /auto_report или /summary.</p>';
  }
  const rows = reports
    .map((report) => {
      const channel = report.channel ? escapeHtml(report.channel) : '<span class="muted">—</span>';
      return `
        <tr>
          <td><strong>${escapeHtml(report.title)}</strong><div class="muted">${formatReportDate(report.generatedAt)}</div></td>
          <td>${escapeHtml(report.type)}</td>
          <td>${escapeHtml(reportProjectLabel(report))}</td>
          <td>${escapeHtml(reportPeriodLabel(report))}</td>
          <td>${previewSummary(report.summary)}</td>
          <td>${channel}</td>
        </tr>
      `;
    })
    .join("\n");
  return `
    <table>
      <thead>
        <tr>
          <th>Название</th>
          <th>Тип</th>
          <th>Проекты</th>
          <th>Период</th>
          <th>Краткое содержание</th>
          <th>Канал</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
};

export const renderAdminDashboard = ({ meta, accounts, projects, reports, flash }: AdminDashboardProps): string => {
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
    <section class="card">
      <h2>Последние отчёты</h2>
      ${renderReportsTable(reports)}
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
