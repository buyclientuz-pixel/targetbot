import { LeadRecord, NormalizedCampaign, PortalMetricKey, ProjectBillingSummary, ProjectRecord } from "../types";
import { renderLayout } from "../components/layout";
import { escapeAttribute, escapeHtml } from "../utils/html";

interface PortalMetricEntry {
  key: PortalMetricKey;
  label: string;
  value: string;
}

interface PortalPeriodOption {
  key: string;
  label: string;
  url: string;
  active: boolean;
}

interface PortalPagination {
  page: number;
  totalPages: number;
  prevUrl?: string | null;
  nextUrl?: string | null;
}

interface PortalStatusCounts {
  all: number;
  new: number;
  done: number;
}

interface PortalViewProps {
  project: ProjectRecord;
  leads: LeadRecord[];
  billing: ProjectBillingSummary;
  campaigns: NormalizedCampaign[];
  metrics: PortalMetricEntry[];
  periodOptions: PortalPeriodOption[];
  periodLabel: string;
  pagination: PortalPagination;
  statusCounts: PortalStatusCounts;
}

const resolveConversionType = (lead: LeadRecord): string => {
  if (lead.phone && lead.phone.trim()) {
    return "Контакт";
  }
  const objective = lead.campaignObjective ? lead.campaignObjective.toUpperCase() : "";
  if (objective.includes("MESSAGE")) {
    return "Сообщение";
  }
  return "Сообщение";
};

const formatLeadDate = (value: string): string => {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "—";
  }
  return new Date(timestamp).toLocaleString("ru-RU");
};

const leadRow = (lead: LeadRecord, conversionType: string): string => {
  const adLabel = lead.adName && lead.adName.trim() ? lead.adName.trim() : "—";
  return `
    <tr data-status="${lead.status}">
      <td>${escapeHtml(lead.name)}</td>
      <td>${lead.phone ? escapeHtml(lead.phone) : "—"}</td>
      <td>${escapeHtml(conversionType)}</td>
      <td>${escapeHtml(formatLeadDate(lead.createdAt))}</td>
      <td>${escapeHtml(adLabel)}</td>
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
      ${lines.length ? `<p class="muted">${lines.join(" · ")}</p>` : ""}
    </div>
  `;
};

const renderPeriodFilters = (options: PortalPeriodOption[]): string => {
  if (!options.length) {
    return "";
  }
  const buttons = options
    .map((option) => {
      const classes = ["btn", "btn-secondary"];
      if (option.active) {
        classes.push("active");
      }
      return `<a class="${classes.join(" ")}" href="${escapeAttribute(option.url)}">${escapeHtml(option.label)}</a>`;
    })
    .join("");
  return `<div class="period-filters">${buttons}</div>`;
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

const formatCampaignStatus = (campaign: NormalizedCampaign): string => {
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

const renderCampaigns = (campaigns: NormalizedCampaign[]): string => {
  if (!campaigns.length) {
    return '';
  }
  const sorted = campaigns
    .slice()
    .sort((a, b) => {
      const statusDiff = a.statusOrder - b.statusOrder;
      if (statusDiff !== 0) {
        return statusDiff;
      }
      const spendDiff = (b.spend ?? 0) - (a.spend ?? 0);
      if (spendDiff !== 0) {
        return spendDiff;
      }
      return a.name.localeCompare(b.name, "ru-RU");
    });
  const rows = sorted
    .map((campaign) => {
      const spend = campaign.spendFormatted
        || (campaign.spend !== undefined
          ? `${campaign.spend.toFixed(2)} ${campaign.spendCurrency || ""}`.trim()
          : "—");
      const impressions = campaign.impressions !== undefined
        ? campaign.impressions.toLocaleString("ru-RU")
        : "—";
      const clicks = campaign.clicks !== undefined
        ? campaign.clicks.toLocaleString("ru-RU")
        : "—";
      const objectiveLabel = campaign.objectiveLabel || "Не определено";
      const primaryValue = Number.isFinite(campaign.primaryMetricValue)
        ? Math.round(campaign.primaryMetricValue).toLocaleString("ru-RU")
        : "0";
      const primaryLabel = campaign.primaryMetricLabel || "—";
      const primary = campaign.primaryMetricLabel ? `${escapeHtml(primaryLabel)} — ${escapeHtml(primaryValue)}` : "—";
      return `
        <tr>
          <td>${escapeHtml(campaign.name)}</td>
          <td>${formatCampaignStatus(campaign)}</td>
          <td>${escapeHtml(objectiveLabel)}</td>
          <td>${primary}</td>
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
            <th>Название кампании</th>
            <th>Статус</th>
            <th>Цель</th>
            <th>Показатель</th>
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

const renderPagination = (pagination: PortalPagination): string => {
  if (pagination.totalPages <= 1) {
    return "";
  }
  const prev = pagination.prevUrl
    ? `<a class="btn btn-secondary" href="${escapeAttribute(pagination.prevUrl)}">← Назад</a>`
    : '<span class="btn btn-secondary disabled">← Назад</span>';
  const next = pagination.nextUrl
    ? `<a class="btn btn-secondary" href="${escapeAttribute(pagination.nextUrl)}">Вперёд →</a>`
    : '<span class="btn btn-secondary disabled">Вперёд →</span>';
  return `
    <div class="pagination">
      ${prev}
      <span class="muted">Страница ${pagination.page} из ${pagination.totalPages}</span>
      ${next}
    </div>
  `;
};

export const renderPortal = ({
  project,
  leads,
  billing,
  campaigns,
  metrics,
  periodOptions,
  periodLabel,
  pagination,
  statusCounts,
}: PortalViewProps): string => {
  const rows = leads.map((lead) => leadRow(lead, resolveConversionType(lead))).join("\n");
  const emptyStateClass = leads.length === 0 ? "" : "hidden";
  const metricsBlock = renderMetrics(metrics);
  const campaignBlock = renderCampaigns(campaigns);
  const periodFilters = renderPeriodFilters(periodOptions);
  const paginationBlock = renderPagination(pagination);

  const body = `
    <section class="card">
      <h2>${escapeHtml(project.name)}</h2>
      ${periodFilters}
      <p class="muted">Период: ${escapeHtml(periodLabel)}</p>
      ${billingSection(billing)}
    </section>
    ${metricsBlock}
    <section class="card">
      <h2>Лиды</h2>
      <div class="actions" id="leadFilters">
        <button class="btn btn-secondary active" data-filter="all">Все <span class="count" data-role="count">${statusCounts.all}</span></button>
        <button class="btn btn-secondary" data-filter="new">Новые <span class="count" data-role="count">${statusCounts.new}</span></button>
      </div>
      <table id="leadsTable">
        <thead>
          <tr>
            <th>Имя</th>
            <th>Телефон</th>
            <th>Тип</th>
            <th>Дата</th>
            <th>Реклама</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <p id="leadsEmpty" class="empty-state ${emptyStateClass}">Лидов для выбранного фильтра пока нет.</p>
      ${paginationBlock}
    </section>
    ${campaignBlock}
  `;

  const scripts = `
    (function () {
      const filters = Array.from(document.querySelectorAll('#leadFilters button'));
      const rows = Array.from(document.querySelectorAll('#leadsTable tbody tr'));
      const emptyState = document.getElementById('leadsEmpty');
      let activeFilter = 'all';

      const applyFilter = () => {
        let visibleCount = 0;
        rows.forEach((row) => {
          const status = row.getAttribute('data-status');
          const visible = activeFilter === 'all' || status === activeFilter;
          row.style.display = visible ? '' : 'none';
          if (visible) {
            visibleCount += 1;
          }
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

      applyFilter();
    })();
  `;

  const styles = `
    .metrics-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-top: 16px; }
    .metric { background: #f8fafc; border: 1px solid #d9e2ec; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
    .metric-label { color: #627d98; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
    .metric-value { font-size: 20px; font-weight: 700; color: #102a43; }
    .period-filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 8px; }
    .period-filters .btn { padding: 8px 14px; font-size: 13px; }
    .pagination { display: flex; align-items: center; gap: 12px; margin-top: 16px; }
    .pagination .btn { min-width: 120px; justify-content: center; }
    .btn.disabled { opacity: 0.6; pointer-events: none; }
  `;

  return renderLayout({ title: `Портал — ${project.name}`, body, scripts, styles });
};
