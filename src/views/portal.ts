import {
  LeadRecord,
  MetaCampaign,
  PortalMetricKey,
  PortalMode,
  ProjectBillingSummary,
  ProjectRecord,
} from "../types";
import { renderLayout } from "../components/layout";
import { escapeHtml } from "../utils/html";

interface PortalMetricEntry {
  key: PortalMetricKey;
  label: string;
  value: string;
}

interface PortalViewProps {
  project: ProjectRecord;
  leads: LeadRecord[];
  billing: ProjectBillingSummary;
  campaigns: MetaCampaign[];
  metrics: PortalMetricEntry[];
  mode: PortalMode;
}

const statusBadge = (status: LeadRecord["status"]): string => {
  const meta =
    status === "done"
      ? { label: "Завершён", variant: "success" }
      : { label: "Новый", variant: "warning" };
  return `<span class="badge ${meta.variant}">${meta.label}</span>`;
};

const leadRow = (lead: LeadRecord): string => {
  const action =
    lead.status === "done"
      ? `<button class="btn btn-secondary" data-action="new" data-id="${lead.id}">↩️</button>`
      : `<button class="btn btn-primary" data-action="done" data-id="${lead.id}">✔</button>`;
  return `
    <tr data-status="${lead.status}">
      <td>${lead.name}</td>
      <td>${lead.phone || "—"}</td>
      <td>${lead.source}</td>
      <td>${new Date(lead.createdAt).toLocaleString("ru-RU")}</td>
      <td data-role="status">${statusBadge(lead.status)}</td>
      <td data-role="action">${action}</td>
    </tr>
  `;
};

const billingSection = (billing: ProjectBillingSummary): string => {
  if (billing.status === "missing") {
    return '<p class="muted">Платежи не настроены. Добавьте оплату, чтобы разблокировать отчёты и портал.</p>';
  }

  const statusMap: Record<string, { label: string; className: string }> = {
    active: { label: "Активный период", className: "badge success" },
    pending: { label: "Ожидает оплаты", className: "badge warning" },
    overdue: { label: "Просрочено", className: "badge error" },
    cancelled: { label: "Отменено", className: "badge warning" },
  };
  const meta = statusMap[billing.status] ?? { label: billing.status, className: "badge warning" };
  const lines: string[] = [];
  if (billing.amountFormatted) {
    lines.push(`Сумма: <strong>${escapeHtml(billing.amountFormatted)}</strong>`);
  } else if (billing.amount !== undefined) {
    const amountLabel = `${billing.amount.toFixed(2)} ${billing.currency || "USD"}`;
    lines.push(`Сумма: <strong>${escapeHtml(amountLabel)}</strong>`);
  }
  if (billing.periodLabel) {
    lines.push(`Период: ${escapeHtml(billing.periodLabel)}`);
  }
  if (billing.paidAt) {
    const formatted = new Date(billing.paidAt).toLocaleString("ru-RU");
    lines.push(`Оплачен: ${escapeHtml(formatted)}`);
  }
  if (billing.notes) {
    lines.push(`Заметки: ${escapeHtml(billing.notes)}`);
  }
  if (billing.overdue) {
    lines.push("⚠️ Портал ограничен до обновления оплаты.");
  }
  return `
    <div class="billing-status">
      <span class="${meta.className}">${meta.label}</span>
      ${lines.length ? `<p class="muted">${lines.map((line) => line).join(" · ")}</p>` : ""}
    </div>
  `;
};

const renderMetrics = (metrics: PortalMetricEntry[]): string => {
  if (!metrics.length) {
    return '';
  }
  const cards = metrics
    .map(
      (metric) => `
        <div class="metric">
          <span class="metric-label">${escapeHtml(metric.label)}</span>
          <span class="metric-value">${escapeHtml(metric.value)}</span>
        </div>
      `,
    )
    .join("\n");
  return `
    <section class="card">
      <h2>Ключевые показатели</h2>
      <div class="metrics-grid">
        ${cards}
      </div>
    </section>
  `;
};

const formatCampaignStatus = (campaign: MetaCampaign): string => {
  const effective = campaign.effectiveStatus || campaign.status || "UNKNOWN";
  const label = effective.replace(/_/g, " ");
  const upper = effective.toUpperCase();
  if (upper.startsWith("ACTIVE")) {
    return `<span class="badge success">${escapeHtml(label)}</span>`;
  }
  if (upper.includes("PAUSED") || upper.includes("DISABLE")) {
    return `<span class="badge warning">${escapeHtml(label)}</span>`;
  }
  return `<span class="badge muted">${escapeHtml(label)}</span>`;
};

const renderCampaigns = (campaigns: MetaCampaign[]): string => {
  if (!campaigns.length) {
    return '';
  }
  const rows = campaigns
    .map((campaign) => {
      const spend = campaign.spendFormatted || (campaign.spend !== undefined ? `${campaign.spend.toFixed(2)} ${campaign.spendCurrency || ""}`.trim() : "—");
      const impressions = campaign.impressions !== undefined ? campaign.impressions.toLocaleString("ru-RU") : "—";
      const clicks = campaign.clicks !== undefined ? campaign.clicks.toLocaleString("ru-RU") : "—";
      return `
        <tr>
          <td>${escapeHtml(campaign.name)}</td>
          <td>${formatCampaignStatus(campaign)}</td>
          <td>${escapeHtml(spend)}</td>
          <td>${escapeHtml(impressions)}</td>
          <td>${escapeHtml(clicks)}</td>
        </tr>
      `;
    })
    .join("\n");
  return `
    <section class="card">
      <h2>Рекламные кампании</h2>
      <table>
        <thead>
          <tr>
            <th>Название</th>
            <th>Статус</th>
            <th>Расход</th>
            <th>Показы</th>
            <th>Клики</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
};

const modeLabel = (mode: PortalMode): string => {
  return mode === "manual" ? "Режим: ручной" : "Режим: автоматический";
};

export const renderPortal = ({ project, leads, billing, campaigns, metrics, mode }: PortalViewProps): string => {
  const rows = leads.map(leadRow).join("\n");
  const newCount = leads.filter((lead) => lead.status === "new").length;
  const doneCount = leads.filter((lead) => lead.status === "done").length;
  const emptyStateClass = leads.length === 0 ? "" : "hidden";
  const metricsBlock = renderMetrics(metrics);
  const campaignBlock = renderCampaigns(campaigns);
  const body = `
    <section class="card">
      <h2>${project.name}</h2>
      <p class="muted">Чат: ${project.telegramLink || project.telegramChatId || "—"}</p>
      <p class="muted">Рекламный кабинет: ${project.adAccountId || "—"}</p>
      <p class="muted">${escapeHtml(modeLabel(mode))}</p>
      ${billingSection(billing)}
    </section>
    ${metricsBlock}
    <section class="card">
      <h2>Лиды</h2>
      <div class="actions" id="leadFilters">
        <button class="btn btn-secondary active" data-filter="all">Все <span class="count" data-role="count">${leads.length}</span></button>
        <button class="btn btn-secondary" data-filter="new">Новые <span class="count" data-role="count">${newCount}</span></button>
        <button class="btn btn-secondary" data-filter="done">Завершённые <span class="count" data-role="count">${doneCount}</span></button>
      </div>
      <table id="leadsTable">
        <thead>
          <tr>
            <th>Имя</th>
            <th>Телефон</th>
            <th>Источник</th>
            <th>Дата</th>
            <th>Статус</th>
            <th>Действие</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <p id="leadsEmpty" class="empty-state ${emptyStateClass}">Лидов для выбранного фильтра пока нет.</p>
    </section>
    ${campaignBlock}
  `;

  const projectIdLiteral = JSON.stringify(project.id);

  const scripts = `
    (function () {
      const statusMap = {
        new: { label: 'Новый', badge: 'warning', action: { target: 'done', text: '✔', className: 'btn-primary' } },
        done: { label: 'Завершён', badge: 'success', action: { target: 'new', text: '↩️', className: 'btn-secondary' } },
      };

      const filters = Array.from(document.querySelectorAll('#leadFilters button'));
      const rows = Array.from(document.querySelectorAll('#leadsTable tbody tr'));
      const emptyState = document.getElementById('leadsEmpty');
      const countTargets = new Map(filters.map((button) => {
        const filter = button.getAttribute('data-filter') || 'all';
        const span = button.querySelector('[data-role="count"]');
        return [filter, span];
      }));
      let activeFilter = 'all';

      const recalcCounts = () => {
        let newCount = 0;
        let doneCount = 0;
        rows.forEach((row) => {
          const status = row.getAttribute('data-status');
          if (status === 'new') newCount += 1;
          else if (status === 'done') doneCount += 1;
        });
        const setCount = (filter, value) => {
          const target = countTargets.get(filter);
          if (target instanceof HTMLElement) {
            target.textContent = String(value);
          }
        };
        setCount('all', rows.length);
        setCount('new', newCount);
        setCount('done', doneCount);
      };

      const applyFilter = () => {
        let visibleCount = 0;
        rows.forEach((row) => {
          const status = row.getAttribute('data-status');
          const visible = activeFilter === 'all' || status === activeFilter;
          row.style.display = visible ? '' : 'none';
          if (visible) visibleCount += 1;
        });
        if (emptyState instanceof HTMLElement) {
          emptyState.classList.toggle('hidden', visibleCount > 0);
        }
      };

      filters.forEach((button) => {
        button.addEventListener('click', () => {
          filters.forEach((btn) => btn.classList.remove('active'));
          button.classList.add('active');
          activeFilter = button.getAttribute('data-filter') || 'all';
          applyFilter();
        });
      });

      const updateRow = (row, status) => {
        const meta = statusMap[status];
        if (!meta) return;
        row.setAttribute('data-status', status);
        const statusCell = row.querySelector('[data-role="status"]');
        if (statusCell) {
          statusCell.innerHTML = '<span class="badge ' + meta.badge + '">' + meta.label + '</span>';
        }
        const actionCell = row.querySelector('[data-role="action"]');
        const button = actionCell ? actionCell.querySelector('button') : null;
        if (button) {
          button.classList.remove('btn-primary', 'btn-secondary');
          button.classList.add(meta.action.className);
          button.setAttribute('data-action', meta.action.target);
          button.textContent = meta.action.text;
        }
      };

      document.querySelectorAll('#leadsTable button').forEach((button) => {
        button.addEventListener('click', async (event) => {
          const target = event.currentTarget;
          if (!(target instanceof HTMLButtonElement)) return;
          const row = target.closest('tr');
          const id = target.getAttribute('data-id');
          const action = target.getAttribute('data-action');
          if (!row || !id || !action) return;
          target.setAttribute('disabled', 'true');
          try {
            const response = await fetch('/api/leads/' + id, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ status: action === 'done' ? 'done' : 'new', projectId: ${projectIdLiteral} }),
            });
            const data = await response.json();
            if (!data.ok || !data.data || (data.data.status !== 'new' && data.data.status !== 'done')) {
              alert('Ошибка обновления статуса: ' + (data.error || 'неизвестная ошибка'));
              return;
            }
            updateRow(row, data.data.status);
            recalcCounts();
            applyFilter();
          } catch (error) {
            const message = error && error.message ? error.message : String(error);
            alert('Ошибка сети: ' + message);
          } finally {
            target.removeAttribute('disabled');
          }
        });
      });

      recalcCounts();
      applyFilter();
    })();
  `;

  const styles = `
    .metrics-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-top: 16px; }
    .metric { background: #f8fafc; border: 1px solid #d9e2ec; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
    .metric-label { color: #627d98; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
    .metric-value { font-size: 20px; font-weight: 700; color: #102a43; }
  `;

  return renderLayout({ title: `Портал — ${project.name}`, body, scripts, styles });
};
