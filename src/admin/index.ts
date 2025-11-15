import {
  CommandLogRecord,
  MetaAdAccount,
  MetaStatusResponse,
  ProjectSummary,
  ReportRecord,
  SettingRecord,
} from "../types";
import { renderAdminLayout } from "../components/layout";
import { escapeAttribute, escapeHtml } from "../utils/html";

export interface AdminDashboardProps {
  meta: MetaStatusResponse | null;
  accounts: MetaAdAccount[];
  projects: ProjectSummary[];
  reports: ReportRecord[];
  settings: SettingRecord[];
  commandLogs: CommandLogRecord[];
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
    project.leadStats.today > 0
      ? `<span class="badge warning">Лидов сегодня: ${project.leadStats.today}</span>`
      : '<span class="badge success">Лидов сегодня нет</span>';
  const leadSummary = `
    <div class="muted">
      Сегодня: ${project.leadStats.today} · Всего: ${project.leadStats.total} · Закрыто: ${project.leadStats.done} · Последний лид: ${latestLead}
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

const previewJsonValue = (value: SettingRecord["value"], limit = 120): string => {
  if (value === null) {
    return '<span class="muted">null</span>';
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return '<span class="muted">пустая строка</span>';
    }
    const text = trimmed.length > limit ? `${trimmed.slice(0, limit - 1)}…` : trimmed;
    return escapeHtml(text);
  }
  try {
    const json = JSON.stringify(value);
    const text = json.length > limit ? `${json.slice(0, limit - 1)}…` : json;
    return escapeHtml(text);
  } catch (error) {
    return '<span class="muted">[не удалось отобразить]</span>';
  }
};

const renderSettingsPreview = (settings: SettingRecord[]): string => {
  if (!settings.length) {
    return '<p class="muted">Настройки ещё не заданы.</p>';
  }
  const preview = settings
    .slice(0, 5)
    .map((setting) => {
      const updated = new Date(setting.updatedAt).toLocaleString("ru-RU");
      return `
        <tr>
          <td>${escapeHtml(setting.key)}</td>
          <td>${escapeHtml(setting.scope)}</td>
          <td>${previewJsonValue(setting.value)}</td>
          <td>${escapeHtml(updated)}</td>
        </tr>
      `;
    })
    .join("\n");
  return `
    <table>
      <thead>
        <tr>
          <th>Ключ</th>
          <th>Область</th>
          <th>Значение</th>
          <th>Обновлено</th>
        </tr>
      </thead>
      <tbody>
        ${preview}
      </tbody>
    </table>
  `;
};

const renderCommandLogsTable = (logs: CommandLogRecord[]): string => {
  if (!logs.length) {
    return '<p class="muted">Команд ещё не выполняли.</p>';
  }
  const rows = logs.slice(0, 15).map((entry) => {
    const created = new Date(entry.createdAt).toLocaleString("ru-RU");
    let payload = "<span class=\"muted\">—</span>";
    if (entry.payload !== undefined) {
      try {
        const json = typeof entry.payload === "string" ? entry.payload : JSON.stringify(entry.payload);
        const normalized = json.length > 160 ? `${json.slice(0, 159)}…` : json;
        payload = escapeHtml(normalized);
      } catch (error) {
        payload = '<span class="muted">[ошибка]</span>';
      }
    }
    return `
      <tr>
        <td>${escapeHtml(created)}</td>
        <td><strong>${escapeHtml(entry.command)}</strong><div class="muted">${escapeHtml(entry.id)}</div></td>
        <td>${payload}</td>
        <td>${entry.userId ? escapeHtml(entry.userId) : '<span class="muted">—</span>'}</td>
        <td>${entry.chatId ? escapeHtml(entry.chatId) : '<span class="muted">—</span>'}</td>
      </tr>
    `;
  });
  return `
    <table>
      <thead>
        <tr>
          <th>Время</th>
          <th>Команда</th>
          <th>Детали</th>
          <th>User</th>
          <th>Chat</th>
        </tr>
      </thead>
      <tbody id="commandLogsBody">
        ${rows.join("\n")}
      </tbody>
    </table>
  `;
};

export const renderAdminDashboard = ({
  meta,
  accounts,
  projects,
  reports,
  settings,
  commandLogs,
  flash,
}: AdminDashboardProps): string => {
  const flashBlock = flash
    ? `<div class="alert ${flash.type}">${escapeHtml(flash.message)}</div>`
    : "";
  const spendPeriodLabel = accounts.find((account) => account.spendPeriod)?.spendPeriod;
  const body = `
    ${flashBlock}
    <section class="card">
      <h2>Вебхуки Telegram</h2>
      <p class="muted">Переподключите бота после обновления URL воркера или токена.</p>
      <div class="actions">
        <button class="btn btn-secondary" id="refreshWebhooks">🔄 Обновить вебхуки</button>
      </div>
    </section>
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
    <section class="card">
      <h2>Системные настройки</h2>
      <p class="muted">Настройки синхронизируются через KV и доступны Telegram-боту и веб-панели.</p>
      ${renderSettingsPreview(settings)}
      <div class="actions">
        <a class="btn btn-secondary" href="/admin/settings">Управлять настройками</a>
      </div>
    </section>
    <section class="card">
      <div class="actions" style="justify-content: space-between; align-items: center; margin-top:0;">
        <h2 style="margin:0;">Журнал команд</h2>
        <button class="btn btn-secondary" id="refreshCommandLogs">Обновить</button>
      </div>
      ${renderCommandLogsTable(commandLogs)}
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

    const refreshWebhooksBtn = document.getElementById('refreshWebhooks');
    if (refreshWebhooksBtn) {
      const originalLabel = refreshWebhooksBtn.textContent;
      refreshWebhooksBtn.addEventListener('click', async () => {
        refreshWebhooksBtn.setAttribute('disabled', 'true');
        refreshWebhooksBtn.textContent = 'Переподключаем...';
        try {
          const url = new URL('/manage/telegram/webhook', window.location.origin);
          url.searchParams.set('action', 'refresh');
          url.searchParams.set('drop', '1');
          const response = await fetch(url.toString(), { method: 'GET' });
          let payload;
          try {
            payload = await response.clone().json();
          } catch (error) {
            payload = await response.text();
          }
          const isJson = payload && typeof payload === 'object';
          if (response.ok && isJson && payload.ok) {
            const description =
              typeof payload.data?.description === 'string' ? payload.data.description : 'успех';
            alert('Вебхуки обновлены: ' + description);
          } else {
            const errorMessage =
              isJson && typeof payload.error === 'string'
                ? payload.error
                : response.statusText || 'Неизвестная ошибка';
            const details = isJson && typeof payload.details === 'string' ? '\n' + payload.details : '';
            throw new Error(errorMessage + details);
          }
        } catch (error) {
          alert('Ошибка обновления вебхуков: ' + error.message);
        } finally {
          refreshWebhooksBtn.removeAttribute('disabled');
          refreshWebhooksBtn.textContent = originalLabel || '🔄 Обновить вебхуки';
        }
      });
    }

    const refreshLogsBtn = document.getElementById('refreshCommandLogs');
    const logsBody = document.getElementById('commandLogsBody');
    if (refreshLogsBtn && logsBody) {
      refreshLogsBtn.addEventListener('click', async () => {
        refreshLogsBtn.setAttribute('disabled', 'true');
        refreshLogsBtn.textContent = 'Обновляем…';
        try {
          const response = await fetch('/api/logs/commands?limit=20');
          const data = await response.json();
          if (!data.ok || !Array.isArray(data.data)) {
            throw new Error(data.error || 'неизвестная ошибка');
          }
          const rows = data.data.map((entry) => {
            const created = new Date(entry.createdAt).toLocaleString('ru-RU');
            let payload = '—';
            if (entry.payload !== undefined && entry.payload !== null) {
              try {
                const raw = typeof entry.payload === 'string' ? entry.payload : JSON.stringify(entry.payload);
                payload = raw.length > 160 ? raw.slice(0, 159) + '…' : raw;
              } catch (error) {
                payload = '[ошибка]';
              }
            }
            const escape = (value) => {
              const element = document.createElement('span');
              element.textContent = String(value ?? '');
              return element.innerHTML;
            };
            return \`
              <tr>
                <td>\${escape(created)}</td>
                <td><strong>\${escape(entry.command)}</strong><div class="muted">\${escape(entry.id)}</div></td>
                <td>\${escape(payload)}</td>
                <td>\${entry.userId ? escape(entry.userId) : '<span class="muted">—</span>'}</td>
                <td>\${entry.chatId ? escape(entry.chatId) : '<span class="muted">—</span>'}</td>
              </tr>
            \`;
          });
          logsBody.innerHTML = rows.join('');
        } catch (error) {
          alert('Не удалось обновить журнал: ' + error.message);
        } finally {
          refreshLogsBtn.removeAttribute('disabled');
          refreshLogsBtn.textContent = 'Обновить';
        }
      });
    }
  `;

  return renderAdminLayout({ title: "Targetbot Admin", body, scripts, activeNav: "dashboard" });
};
