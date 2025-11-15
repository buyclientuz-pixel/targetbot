import {
  PortalMetricEntry,
  PortalPagination,
  PortalSnapshotPayload,
  ProjectBillingSummary,
  ProjectRecord,
} from "../types";
import { renderLayout } from "../components/layout";
import { escapeAttribute, escapeHtml } from "../utils/html";

interface PortalPeriodOption {
  key: string;
  label: string;
  url: string;
  active: boolean;
}

interface PortalViewProps {
  project: ProjectRecord;
  billing: ProjectBillingSummary;
  periodOptions: PortalPeriodOption[];
  snapshot: PortalSnapshotPayload;
  snapshotUrl: string;
  periodKey: string;
}

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
  const cards = metrics
    .map(
      (metric) => `
        <div class="kpi-card" data-metric="${escapeAttribute(metric.key)}">
          <span class="kpi-label">${escapeHtml(metric.label)}</span>
          <span class="kpi-value">${escapeHtml(metric.value)}</span>
        </div>
      `,
    )
    .join("\n");
  const emptyClass = metrics.length ? "hidden" : "";
  return `
    <section class="card card-compact">
      <h2>Ключевые показатели</h2>
      <div class="kpi-grid" data-role="metrics-grid">
        ${cards}
      </div>
      <p class="muted ${emptyClass}" data-role="metrics-empty">Метрики обновляются…</p>
    </section>
  `;
};

const renderPaginationControls = (pagination: PortalPagination): string => {
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
    ${prev}
    <span class="muted">Страница ${pagination.page} из ${pagination.totalPages}</span>
    ${next}
  `;
};

const toScriptData = (value: unknown): string => {
  return JSON.stringify(value).replace(/</g, "\\u003c");
};

export const renderPortal = ({
  project,
  billing,
  periodOptions,
  snapshot,
  snapshotUrl,
  periodKey: _periodKey,
}: PortalViewProps): string => {
  const periodFilters = renderPeriodFilters(periodOptions);
  const metricsBlock = renderMetrics(snapshot.metrics);
  const paginationBlock = renderPaginationControls(snapshot.pagination);
  const leadsSkeletonClass = snapshot.leads.length ? " hidden" : "";
  const campaignsSkeletonClass = snapshot.campaigns.length ? " hidden" : "";

  const body = `
    <section class="card card-compact portal-header">
      <h2>${escapeHtml(project.name)}</h2>
      ${periodFilters}
      <p class="muted">Период: <span data-role="period-label">${escapeHtml(snapshot.periodLabel)}</span></p>
      ${billingSection(billing)}
    </section>
    ${metricsBlock}
    <section class="card card-compact">
      <h2>Лиды</h2>
      <div class="actions" id="leadFilters">
        <button class="btn btn-secondary active" data-filter="all">Все <span class="count" data-role="count-all">${snapshot.statusCounts.all}</span></button>
        <button class="btn btn-secondary" data-filter="new">Новые <span class="count" data-role="count-new">${snapshot.statusCounts.new}</span></button>
      </div>
      <div class="table-wrapper" data-role="leads-wrapper">
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
          <tbody></tbody>
        </table>
        <div class="table-skeleton shimmer${leadsSkeletonClass}" data-role="leads-skeleton">
          <div></div>
          <div></div>
          <div></div>
        </div>
      </div>
      <p id="leadsEmpty" class="empty-state hidden">Лидов для выбранного фильтра пока нет.</p>
      <div class="pagination" data-role="pagination">
        ${paginationBlock}
      </div>
    </section>
    <section class="card card-compact">
      <h2>Рекламные кампании</h2>
      <div class="table-wrapper" data-role="campaigns-wrapper">
        <table id="campaignsTable">
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
          <tbody></tbody>
        </table>
        <div class="table-skeleton shimmer${campaignsSkeletonClass}" data-role="campaigns-skeleton">
          <div></div>
          <div></div>
          <div></div>
        </div>
      </div>
      <p class="empty-state hidden" data-role="campaigns-empty">Кампании появятся после обновления данных.</p>
    </section>
  `;

  const script = `
    (function () {
      const snapshotUrl = ${toScriptData(snapshotUrl)};
      const initialSnapshot = ${toScriptData(snapshot)};
      const state = {
        snapshot: initialSnapshot,
        filter: 'all',
      };
      window.__portalSnapshot = initialSnapshot;

      const leadsTableBody = document.querySelector('#leadsTable tbody');
      const campaignsTableBody = document.querySelector('#campaignsTable tbody');
      const leadsSkeleton = document.querySelector('[data-role="leads-skeleton"]');
      const campaignsSkeleton = document.querySelector('[data-role="campaigns-skeleton"]');
      const leadsEmpty = document.getElementById('leadsEmpty');
      const campaignsEmpty = document.querySelector('[data-role="campaigns-empty"]');
      const paginationContainer = document.querySelector('[data-role="pagination"]');
      const periodLabel = document.querySelector('[data-role="period-label"]');
      const metricsGrid = document.querySelector('[data-role="metrics-grid"]');
      const metricsEmpty = document.querySelector('[data-role="metrics-empty"]');
      const countAll = document.querySelector('[data-role="count-all"]');
      const countNew = document.querySelector('[data-role="count-new"]');

      const formatDate = (value) => {
        const timestamp = Date.parse(value);
        if (Number.isNaN(timestamp)) {
          return '—';
        }
        return new Intl.DateTimeFormat('ru-RU', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(timestamp));
      };

      const sanitizeTel = (value) => {
        if (!value) {
          return '';
        }
        const trimmed = value.trim();
        const numeric = trimmed.replace(/[^0-9+]/g, '');
        if (numeric.startsWith('+')) {
          return numeric.startsWith('++') ? '+' + numeric.slice(2) : numeric;
        }
        return '+' + numeric.replace(/^\++/, '');
      };

      const formatPhone = (value) => {
        if (!value) {
          return '—';
        }
        const digits = value.replace(/[^0-9]/g, '');
        if (digits.length === 12 && digits.startsWith('998')) {
          return '+' + digits.slice(0, 3) + ' ' + digits.slice(3, 5) + ' ' + digits.slice(5, 8) + ' ' + digits.slice(8, 10) + ' ' + digits.slice(10, 12);
        }
        if (digits.length === 11 && digits.startsWith('7')) {
          return '+' + digits[0] + ' ' + digits.slice(1, 4) + ' ' + digits.slice(4, 7) + ' ' + digits.slice(7, 9) + ' ' + digits.slice(9, 11);
        }
        if (value.startsWith('+')) {
          return value;
        }
        return '+' + digits;
      };

      const formatNumber = (value) => {
        if (value === null || value === undefined) {
          return '—';
        }
        const number = Number(value);
        if (!Number.isFinite(number)) {
          return '—';
        }
        return number.toLocaleString('ru-RU');
      };

      const buildStatusBadge = (campaign) => {
        const badge = document.createElement('span');
        badge.classList.add('badge');
        const effective = (campaign.effectiveStatus || campaign.status || 'UNKNOWN').toString().toUpperCase();
        const label = (campaign.effectiveStatus || campaign.status || 'Неизвестно').replace(/_/g, ' ');
        if (effective.startsWith('ACTIVE')) {
          badge.classList.add('success');
        } else if (effective.includes('PAUSED') || effective.includes('DISABLE')) {
          badge.classList.add('warning');
        } else {
          badge.classList.add('muted');
        }
        badge.textContent = label;
        return badge;
      };

      const formatPrimaryMetric = (campaign) => {
        if (campaign.primaryMetricLabel) {
          const value = Number.isFinite(campaign.primaryMetricValue)
            ? Math.round(campaign.primaryMetricValue).toLocaleString('ru-RU')
            : '0';
          return campaign.primaryMetricLabel + ': ' + value;
        }
        return 'Показатель: —';
      };

      const formatSpend = (campaign) => {
        if (campaign.spendFormatted) {
          return campaign.spendFormatted;
        }
        if (typeof campaign.spend === 'number') {
          const currency = campaign.spendCurrency || 'USD';
          return campaign.spend.toFixed(2) + ' ' + currency;
        }
        return '—';
      };

      const toggleSkeleton = (target, show) => {
        if (!target) {
          return;
        }
        target.classList.toggle('hidden', !show);
      };

      const renderMetrics = () => {
        if (!metricsGrid || !state.snapshot) {
          return;
        }
        metricsGrid.innerHTML = '';
        const metrics = Array.isArray(state.snapshot.metrics) ? state.snapshot.metrics : [];
        metrics.forEach((metric) => {
          const card = document.createElement('div');
          card.className = 'kpi-card';
          card.dataset.metric = String(metric.key);
          const label = document.createElement('span');
          label.className = 'kpi-label';
          label.textContent = metric.label;
          const value = document.createElement('span');
          value.className = 'kpi-value';
          value.textContent = metric.value;
          card.appendChild(label);
          card.appendChild(value);
          metricsGrid.appendChild(card);
        });
        if (metricsEmpty instanceof HTMLElement) {
          metricsEmpty.classList.toggle('hidden', metrics.length > 0);
        }
      };

      const renderLeads = () => {
        if (!(leadsTableBody instanceof HTMLElement) || !state.snapshot) {
          return;
        }
        leadsTableBody.innerHTML = '';
        const leads = (state.snapshot.leads || []).filter((lead) => {
          return state.filter === 'all' || lead.status === state.filter;
        });
        if (leadsEmpty instanceof HTMLElement) {
          leadsEmpty.classList.toggle('hidden', leads.length > 0);
        }
        const fragment = document.createDocumentFragment();
        leads.forEach((lead) => {
          const row = document.createElement('tr');
          row.className = 'table-row';
          row.dataset.status = lead.status || 'new';

          const nameCell = document.createElement('td');
          nameCell.textContent = lead.name || '—';
          row.appendChild(nameCell);

          const phoneCell = document.createElement('td');
          if (lead.phone) {
            const link = document.createElement('a');
            link.href = 'tel:' + sanitizeTel(lead.phone);
            link.textContent = formatPhone(lead.phone);
            link.rel = 'noopener';
            phoneCell.appendChild(link);
          } else {
            phoneCell.textContent = '—';
          }
          row.appendChild(phoneCell);

          const typeCell = document.createElement('td');
          typeCell.textContent = lead.type || '—';
          row.appendChild(typeCell);

          const dateCell = document.createElement('td');
          dateCell.textContent = formatDate(lead.createdAt);
          row.appendChild(dateCell);

          const adCell = document.createElement('td');
          adCell.textContent = lead.adLabel || '—';
          row.appendChild(adCell);

          fragment.appendChild(row);
        });
        leadsTableBody.appendChild(fragment);
      };

      const renderCampaigns = () => {
        if (!(campaignsTableBody instanceof HTMLElement) || !state.snapshot) {
          return;
        }
        campaignsTableBody.innerHTML = '';
        const campaigns = Array.isArray(state.snapshot.campaigns) ? state.snapshot.campaigns : [];
        if (campaignsEmpty instanceof HTMLElement) {
          campaignsEmpty.classList.toggle('hidden', campaigns.length > 0);
        }
        const fragment = document.createDocumentFragment();
        campaigns.forEach((campaign) => {
          const row = document.createElement('tr');
          row.className = 'table-row';

          const nameCell = document.createElement('td');
          nameCell.className = 'campaign-main';

          const title = document.createElement('span');
          title.className = 'primary-title';
          title.textContent = campaign.name || '—';
          nameCell.appendChild(title);

          const mobileMeta = document.createElement('div');
          mobileMeta.className = 'mobile-meta';

          const mobileStatus = buildStatusBadge(campaign);
          mobileStatus.classList.add('status-mobile');
          mobileMeta.appendChild(mobileStatus);

          const mobileMetric = document.createElement('span');
          mobileMetric.className = 'primary-metric';
          mobileMetric.textContent = formatPrimaryMetric(campaign);
          mobileMeta.appendChild(mobileMetric);

          const mobileSpend = document.createElement('span');
          mobileSpend.className = 'spend';
          mobileSpend.textContent = 'Расход: ' + formatSpend(campaign);
          mobileMeta.appendChild(mobileSpend);

          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'toggle-details';
          toggle.textContent = 'Подробнее';
          mobileMeta.appendChild(toggle);

          nameCell.appendChild(mobileMeta);

          const extra = document.createElement('div');
          extra.className = 'extra-data';
          const extraItems = [
            { label: 'Цель', value: campaign.objectiveLabel || 'Не определено' },
            { label: 'Показы', value: formatNumber(campaign.impressions) },
            { label: 'Клики', value: formatNumber(campaign.clicks) },
          ];
          extraItems.forEach((item) => {
            const line = document.createElement('div');
            line.className = 'extra-line';
            const label = document.createElement('span');
            label.className = 'extra-label';
            label.textContent = item.label;
            const value = document.createElement('span');
            value.className = 'extra-value';
            value.textContent = item.value;
            line.appendChild(label);
            line.appendChild(value);
            extra.appendChild(line);
          });
          nameCell.appendChild(extra);

          row.appendChild(nameCell);

          const statusCell = document.createElement('td');
          statusCell.className = 'desktop-only';
          statusCell.appendChild(buildStatusBadge(campaign));
          row.appendChild(statusCell);

          const objectiveCell = document.createElement('td');
          objectiveCell.className = 'desktop-only';
          objectiveCell.textContent = campaign.objectiveLabel || 'Не определено';
          row.appendChild(objectiveCell);

          const metricCell = document.createElement('td');
          metricCell.className = 'desktop-only';
          metricCell.textContent = formatPrimaryMetric(campaign);
          row.appendChild(metricCell);

          const spendCell = document.createElement('td');
          spendCell.className = 'desktop-only';
          spendCell.textContent = formatSpend(campaign);
          row.appendChild(spendCell);

          const impressionsCell = document.createElement('td');
          impressionsCell.className = 'desktop-only';
          impressionsCell.textContent = formatNumber(campaign.impressions);
          row.appendChild(impressionsCell);

          const clicksCell = document.createElement('td');
          clicksCell.className = 'desktop-only';
          clicksCell.textContent = formatNumber(campaign.clicks);
          row.appendChild(clicksCell);

          fragment.appendChild(row);
        });
        campaignsTableBody.appendChild(fragment);
      };

      const renderPagination = () => {
        if (!(paginationContainer instanceof HTMLElement) || !state.snapshot) {
          return;
        }
        paginationContainer.innerHTML = '';
        const pagination = state.snapshot.pagination;
        if (!pagination || pagination.totalPages <= 1) {
          return;
        }
        const fragment = document.createDocumentFragment();
        const prev = document.createElement(pagination.prevUrl ? 'a' : 'span');
        prev.className = 'btn btn-secondary' + (pagination.prevUrl ? '' : ' disabled');
        prev.textContent = '← Назад';
        if (pagination.prevUrl) {
          prev.href = pagination.prevUrl;
        }
        fragment.appendChild(prev);

        const info = document.createElement('span');
        info.className = 'muted';
        info.textContent = 'Страница ' + pagination.page + ' из ' + pagination.totalPages;
        fragment.appendChild(info);

        const next = document.createElement(pagination.nextUrl ? 'a' : 'span');
        next.className = 'btn btn-secondary' + (pagination.nextUrl ? '' : ' disabled');
        next.textContent = 'Вперёд →';
        if (pagination.nextUrl) {
          next.href = pagination.nextUrl;
        }
        fragment.appendChild(next);

        paginationContainer.appendChild(fragment);
      };

      const updateCounts = () => {
        if (!state.snapshot) {
          return;
        }
        if (countAll instanceof HTMLElement) {
          countAll.textContent = String(state.snapshot.statusCounts?.all ?? 0);
        }
        if (countNew instanceof HTMLElement) {
          countNew.textContent = String(state.snapshot.statusCounts?.new ?? 0);
        }
      };

      const applySnapshot = (data) => {
        if (!data) {
          return;
        }
        state.snapshot = data;
        window.__portalSnapshot = data;
        renderMetrics();
        renderLeads();
        renderCampaigns();
        renderPagination();
        updateCounts();
        if (periodLabel instanceof HTMLElement) {
          periodLabel.textContent = data.periodLabel || '';
        }
        toggleSkeleton(leadsSkeleton, false);
        toggleSkeleton(campaignsSkeleton, false);
      };

      const filterButtons = Array.from(document.querySelectorAll('#leadFilters button'));
      filterButtons.forEach((button) => {
        button.addEventListener('click', () => {
          filterButtons.forEach((btn) => btn.classList.remove('active'));
          button.classList.add('active');
          state.filter = button.getAttribute('data-filter') || 'all';
          renderLeads();
        });
      });

      document.addEventListener('click', (event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.classList.contains('toggle-details')) {
          const row = target.closest('.table-row');
          if (row) {
            row.classList.toggle('open');
          }
        }
      });

      const fetchSnapshot = async (withSkeleton) => {
        if (withSkeleton) {
          toggleSkeleton(leadsSkeleton, true);
          toggleSkeleton(campaignsSkeleton, true);
        }
        try {
          const response = await fetch(snapshotUrl, { headers: { Accept: 'application/json' } });
          if (!response.ok) {
            throw new Error('HTTP ' + response.status);
          }
          const payload = await response.json();
          if (payload && payload.ok && payload.data) {
            applySnapshot(payload.data);
          } else if (payload && payload.error) {
            console.warn('portal:snapshot:error', payload.error);
          }
        } catch (error) {
          console.warn('portal:snapshot:fetch_failed', error);
        } finally {
          toggleSkeleton(leadsSkeleton, false);
          toggleSkeleton(campaignsSkeleton, false);
        }
      };

      if (state.snapshot) {
        applySnapshot(state.snapshot);
        fetchSnapshot(false);
      } else {
        fetchSnapshot(true);
      }
    })();
  `;

  const styles = `
    .period-filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 8px; }
    .period-filters .btn { padding: 8px 14px; font-size: 13px; }
    .portal-header h2 { margin-bottom: 8px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-top: 12px; }
    .kpi-card { padding: 12px; border-radius: 10px; background: #f8fafc; font-size: 14px; line-height: 1.2; box-shadow: 0 10px 18px rgba(15, 23, 42, 0.08); display: flex; flex-direction: column; gap: 6px; }
    .kpi-label { color: #627d98; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
    .kpi-value { font-size: 20px; font-weight: 700; color: #102a43; }
    .table-wrapper { position: relative; min-height: 140px; }
    .table-skeleton { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 10px; padding: 16px; background: linear-gradient(90deg, rgba(237, 242, 247, 0.9) 0%, rgba(255, 255, 255, 0.6) 50%, rgba(237, 242, 247, 0.9) 100%); background-size: 200% 100%; animation: shimmer 1.6s infinite; border-radius: 12px; }
    .table-skeleton.hidden { display: none; }
    .table-skeleton div { height: 14px; border-radius: 999px; background: rgba(255, 255, 255, 0.3); }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    .table-wrapper table { position: relative; z-index: 1; background: transparent; }
    .table-row { transition: background-color 0.2s ease; }
    .table-row.open { background-color: rgba(31, 117, 254, 0.05); }
    .table-row .extra-data { display: none; font-size: 13px; color: #334e68; }
    .table-row.open .extra-data { display: block; margin-top: 8px; }
    .table-row .extra-line { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; }
    .table-row .extra-label { color: #627d98; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
    .table-row .extra-value { font-weight: 600; }
    .mobile-meta { display: none; flex-direction: column; gap: 4px; margin-top: 6px; }
    .mobile-meta .status-mobile { align-self: flex-start; }
    .mobile-meta .primary-metric { font-weight: 600; }
    .mobile-meta .spend { font-weight: 600; }
    .toggle-details { font-size: 14px; color: #1f75fe; margin-top: 6px; background: none; border: none; padding: 0; cursor: pointer; }
    .toggle-details:hover { text-decoration: underline; }
    .empty-state { margin-top: 12px; font-size: 14px; color: #627d98; text-align: center; }
    .pagination { display: flex; align-items: center; gap: 12px; margin-top: 16px; flex-wrap: wrap; }
    .pagination .btn { min-width: 120px; justify-content: center; }
    .btn.disabled { opacity: 0.6; pointer-events: none; }
    @media (max-width: 768px) {
      table { display: block; overflow-x: auto; white-space: nowrap; }
      table thead { display: none; }
      table tbody { display: block; }
      table tbody tr.table-row { display: flex; flex-direction: column; border-bottom: 1px solid #e5e5e5; padding: 12px 0; }
      table tbody tr.table-row td { border: none; padding: 4px 0; }
      table tbody tr.table-row td.desktop-only { display: none; }
      .mobile-meta { display: flex; }
      .table-row .extra-data { display: none; }
      .table-row.open .extra-data { display: block; }
    }
  `;

  return renderLayout({ title: `Портал — ${project.name}`, body, scripts: script, styles });
};
