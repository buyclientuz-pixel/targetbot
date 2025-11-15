import { ensureProjectSettings } from "../domain/project-settings";
import { filterLeadsByDateRange, listLeads } from "../domain/leads";
import { listProjectPayments } from "../domain/payments";
import { getProject } from "../domain/projects";
import { DataValidationError, EntityNotFoundError } from "../errors";
import { jsonResponse } from "../http/responses";
import type { Router } from "../worker/router";
import type { RequestContext } from "../worker/context";
import {
  loadProjectCampaigns,
  loadProjectSummary,
  mapCampaignRows,
  resolvePeriodRange,
} from "../services/project-insights";

const htmlResponse = (body: string): Response =>
  new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const badRequest = (message: string): Response => jsonResponse({ error: message }, { status: 400 });
const forbidden = (message: string): Response => jsonResponse({ error: message }, { status: 403 });
const notFound = (message: string): Response => jsonResponse({ error: message }, { status: 404 });
const unprocessable = (message: string): Response => jsonResponse({ error: message }, { status: 422 });

export const renderPortalHtml = (projectId: string): string => {
  const projectIdJson = JSON.stringify(projectId);
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Портал — ${projectId}</title>
    <style>
      :root {
        color-scheme: light dark;
        --portal-bg: #0f172a;
        --portal-card: rgba(15, 23, 42, 0.75);
        --portal-text: #e2e8f0;
        --portal-accent: #38bdf8;
        --portal-muted: #64748b;
        --portal-border: rgba(148, 163, 184, 0.2);
        --portal-error: #f87171;
        font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        background: radial-gradient(circle at top, #1e293b 0%, #0f172a 60%);
        min-height: 100vh;
        color: var(--portal-text);
      }
      .portal {
        position: relative;
        min-height: 100vh;
        padding: 32px 16px 64px;
        box-sizing: border-box;
      }
      @media (min-width: 960px) {
        .portal {
          padding: 48px 48px 96px;
        }
      }
      .portal__header {
        margin: 0 auto 24px;
        max-width: 1200px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .portal__title {
        font-size: clamp(24px, 4vw, 36px);
        font-weight: 600;
      }
      .portal__subtitle {
        font-size: 16px;
        color: var(--portal-muted);
      }
      .portal__preloader {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(15, 23, 42, 0.86);
        backdrop-filter: blur(12px);
        z-index: 10;
      }
      .portal__preloader-card {
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid var(--portal-border);
        border-radius: 20px;
        padding: 32px 40px;
        text-align: center;
        box-shadow: 0 20px 50px rgba(15, 23, 42, 0.5);
      }
      .portal__preloader-title {
        font-size: 22px;
        font-weight: 600;
        margin-bottom: 8px;
      }
      .portal__preloader-text {
        font-size: 16px;
        color: var(--portal-muted);
      }
      .portal__preloader--hidden {
        display: none;
      }
      .portal__error {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(15, 23, 42, 0.9);
        backdrop-filter: blur(10px);
        z-index: 20;
      }
      .portal__error-card {
        background: rgba(15, 23, 42, 0.96);
        border: 1px solid var(--portal-border);
        border-radius: 20px;
        padding: 32px 40px;
        max-width: 420px;
        box-shadow: 0 30px 60px rgba(15, 23, 42, 0.55);
        text-align: center;
      }
      .portal__error--hidden {
        display: none;
      }
      .portal__error-title {
        font-size: 22px;
        font-weight: 600;
        margin-bottom: 8px;
      }
      .portal__error-text {
        color: var(--portal-muted);
        margin-bottom: 24px;
      }
      .portal__button {
        background: var(--portal-accent);
        color: #0f172a;
        border: none;
        border-radius: 999px;
        padding: 12px 24px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.15s ease;
      }
      .portal__button:active {
        transform: scale(0.98);
      }
      .portal__content {
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s ease;
      }
      .portal__content--visible {
        opacity: 1;
        pointer-events: auto;
      }
      .portal-section {
        max-width: 1200px;
        margin: 0 auto 32px;
        background: var(--portal-card);
        border: 1px solid var(--portal-border);
        border-radius: 24px;
        padding: 24px;
        box-shadow: 0 30px 80px rgba(15, 23, 42, 0.45);
      }
      .portal-section__header {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 24px;
      }
      .portal-section__title {
        font-size: 20px;
        font-weight: 600;
      }
      .portal-section__subtitle {
        color: var(--portal-muted);
        font-size: 14px;
      }
      .portal-tabs {
        display: inline-flex;
        gap: 8px;
        border-radius: 999px;
        padding: 4px;
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid var(--portal-border);
      }
      .portal-tabs__button {
        border: none;
        background: transparent;
        color: var(--portal-muted);
        font-weight: 600;
        padding: 10px 18px;
        border-radius: 999px;
        cursor: pointer;
        transition: background 0.2s ease, color 0.2s ease;
      }
      .portal-tabs__button--active {
        background: var(--portal-accent);
        color: #0f172a;
      }
      .portal-metrics {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 16px;
      }
      .portal-metric {
        background: rgba(15, 23, 42, 0.6);
        border-radius: 20px;
        padding: 20px;
        border: 1px solid rgba(148, 163, 184, 0.1);
      }
      .portal-metric__label {
        color: var(--portal-muted);
        font-size: 14px;
        margin-bottom: 8px;
      }
      .portal-metric__value {
        font-size: 24px;
        font-weight: 600;
      }
      .portal-metric__delta {
        font-size: 14px;
        color: var(--portal-muted);
        margin-top: 4px;
      }
      .portal-table-wrapper {
        position: relative;
        overflow: hidden;
        border-radius: 18px;
        border: 1px solid rgba(148, 163, 184, 0.14);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        background: rgba(15, 23, 42, 0.45);
      }
      th, td {
        padding: 14px 16px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.1);
        text-align: left;
        font-size: 14px;
      }
      th {
        color: var(--portal-muted);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      tr:last-child td {
        border-bottom: none;
      }
      .portal-table__status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
      }
      .portal-table__status-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: var(--portal-accent);
      }
      .portal-empty {
        padding: 32px;
        text-align: center;
        color: var(--portal-muted);
      }
      .portal-empty--hidden {
        display: none;
      }
      .portal-skeleton {
        display: grid;
        gap: 12px;
        padding: 24px;
      }
      .portal-skeleton--hidden {
        display: none;
      }
      .portal-skeleton__row {
        height: 16px;
        border-radius: 999px;
        background: linear-gradient(90deg, rgba(148, 163, 184, 0.15), rgba(148, 163, 184, 0.3), rgba(148, 163, 184, 0.15));
        background-size: 200% 100%;
        animation: portal-skeleton 1.6s infinite;
      }
      @keyframes portal-skeleton {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      .portal-section__actions {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .portal-retry {
        border: 1px solid var(--portal-border);
        background: transparent;
        color: var(--portal-muted);
        border-radius: 999px;
        padding: 8px 16px;
        cursor: pointer;
      }
      a.portal-link {
        color: var(--portal-accent);
        text-decoration: none;
      }
      a.portal-link:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <div class="portal" data-root>
      <div class="portal__preloader" data-preloader>
        <div class="portal__preloader-card">
          <div class="portal__preloader-title">Готовим данные…</div>
          <div class="portal__preloader-text">Это может занять 3–5 секунд.</div>
        </div>
      </div>
      <div class="portal__error portal__error--hidden" data-error>
        <div class="portal__error-card">
          <div class="portal__error-title">Не удалось загрузить данные</div>
          <div class="portal__error-text" data-error-message>Проверьте подключение и попробуйте снова.</div>
          <button class="portal__button" type="button" data-retry>Повторить попытку</button>
        </div>
      </div>
      <div class="portal__content" data-content>
        <header class="portal__header">
          <div class="portal__title" data-project-title>Проект ${projectId}</div>
          <div class="portal__subtitle" data-project-description>Загружаем актуальные показатели рекламных кампаний Meta.</div>
        </header>
        <section class="portal-section">
          <div class="portal-section__header">
            <div>
              <div class="portal-section__title">Ключевые показатели</div>
              <div class="portal-section__subtitle" data-summary-period>—</div>
            </div>
            <div class="portal-section__actions">
              <div class="portal-tabs">
                <button class="portal-tabs__button" data-period-button="today">Сегодня</button>
                <button class="portal-tabs__button" data-period-button="yesterday">Вчера</button>
                <button class="portal-tabs__button" data-period-button="week">Неделя</button>
                <button class="portal-tabs__button" data-period-button="month">Месяц</button>
                <button class="portal-tabs__button" data-period-button="max">Максимум</button>
              </div>
            </div>
          </div>
          <div class="portal-metrics" data-metrics>
            <div class="portal-metric" data-metric="spend">
              <div class="portal-metric__label">Расход</div>
              <div class="portal-metric__value" data-metric-value>—</div>
            </div>
            <div class="portal-metric" data-metric="impressions">
              <div class="portal-metric__label">Показы</div>
              <div class="portal-metric__value" data-metric-value>—</div>
            </div>
            <div class="portal-metric" data-metric="clicks">
              <div class="portal-metric__label">Клики</div>
              <div class="portal-metric__value" data-metric-value>—</div>
            </div>
            <div class="portal-metric" data-metric="leads">
              <div class="portal-metric__label">Лиды</div>
              <div class="portal-metric__value" data-metric-value>—</div>
            </div>
            <div class="portal-metric" data-metric="cpa">
              <div class="portal-metric__label">CPL</div>
              <div class="portal-metric__value" data-metric-value>—</div>
            </div>
            <div class="portal-metric" data-metric="leads-total">
              <div class="portal-metric__label">Лиды (всего)</div>
              <div class="portal-metric__value" data-metric-value>—</div>
            </div>
            <div class="portal-metric" data-metric="leads-today">
              <div class="portal-metric__label">Новые лиды (сегодня)</div>
              <div class="portal-metric__value" data-metric-value>—</div>
            </div>
            <div class="portal-metric" data-metric="cpa-today">
              <div class="portal-metric__label">CPA (сегодня)</div>
              <div class="portal-metric__value" data-metric-value>—</div>
            </div>
          </div>
        </section>
        <section class="portal-section" data-section="leads">
          <div class="portal-section__header">
            <div>
              <div class="portal-section__title">Лиды</div>
              <div class="portal-section__subtitle" data-leads-period>—</div>
            </div>
            <button class="portal-retry" type="button" data-retry-leads>Обновить</button>
          </div>
          <div class="portal-table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Имя</th>
                  <th>Телефон</th>
                  <th>Кампания</th>
                  <th>Дата</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody data-leads-body></tbody>
            </table>
            <div class="portal-skeleton portal-skeleton--hidden" data-leads-skeleton>
              <div class="portal-skeleton__row"></div>
              <div class="portal-skeleton__row"></div>
              <div class="portal-skeleton__row"></div>
              <div class="portal-skeleton__row"></div>
              <div class="portal-skeleton__row"></div>
            </div>
            <div class="portal-empty portal-empty--hidden" data-leads-empty>За выбранный период лидов нет.</div>
          </div>
        </section>
        <section class="portal-section" data-section="campaigns">
          <div class="portal-section__header">
            <div>
              <div class="portal-section__title">Кампании Meta</div>
              <div class="portal-section__subtitle" data-campaigns-period>—</div>
            </div>
            <button class="portal-retry" type="button" data-retry-campaigns>Обновить</button>
          </div>
          <div class="portal-table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Кампания</th>
                  <th>Расход</th>
                  <th>Показы</th>
                  <th>Клики</th>
                  <th>Лиды</th>
                  <th>CPL</th>
                </tr>
              </thead>
              <tbody data-campaigns-body></tbody>
            </table>
            <div class="portal-skeleton portal-skeleton--hidden" data-campaigns-skeleton>
              <div class="portal-skeleton__row"></div>
              <div class="portal-skeleton__row"></div>
              <div class="portal-skeleton__row"></div>
              <div class="portal-skeleton__row"></div>
            </div>
            <div class="portal-empty portal-empty--hidden" data-campaigns-empty>Нет данных по кампаниям.</div>
          </div>
        </section>
        <section class="portal-section" data-section="payments">
          <div class="portal-section__header">
            <div>
              <div class="portal-section__title">Оплаты</div>
              <div class="portal-section__subtitle" data-payments-subtitle>Последние операции биллинга проекта.</div>
            </div>
            <button class="portal-retry" type="button" data-retry-payments>Обновить</button>
          </div>
          <div class="portal-table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Сумма</th>
                  <th>Период</th>
                  <th>Статус</th>
                  <th>Оплачено</th>
                  <th>Комментарий</th>
                </tr>
              </thead>
              <tbody data-payments-body></tbody>
            </table>
            <div class="portal-skeleton portal-skeleton--hidden" data-payments-skeleton>
              <div class="portal-skeleton__row"></div>
              <div class="portal-skeleton__row"></div>
              <div class="portal-skeleton__row"></div>
              <div class="portal-skeleton__row"></div>
            </div>
            <div class="portal-empty portal-empty--hidden" data-payments-empty>Записей об оплатах пока нет.</div>
          </div>
        </section>
      </div>
    </div>
    <script>
      (() => {
        const PROJECT_ID = ${projectIdJson};
        const state = {
          period: 'yesterday',
          currency: 'USD',
          summaryLoaded: false,
        };
        const elements = {
          preloader: document.querySelector('[data-preloader]'),
          error: document.querySelector('[data-error]'),
          errorMessage: document.querySelector('[data-error-message]'),
          retryButtons: document.querySelectorAll('[data-retry]'),
          content: document.querySelector('[data-content]'),
          projectTitle: document.querySelector('[data-project-title]'),
          projectDescription: document.querySelector('[data-project-description]'),
          summaryPeriod: document.querySelector('[data-summary-period]'),
          metrics: document.querySelectorAll('[data-metric]'),
          periodButtons: document.querySelectorAll('[data-period-button]'),
          leadsSection: document.querySelector('[data-section="leads"]'),
          leadsBody: document.querySelector('[data-leads-body]'),
          leadsEmpty: document.querySelector('[data-leads-empty]'),
          leadsSkeleton: document.querySelector('[data-leads-skeleton]'),
          leadsPeriod: document.querySelector('[data-leads-period]'),
          campaignsSection: document.querySelector('[data-section="campaigns"]'),
          campaignsBody: document.querySelector('[data-campaigns-body]'),
          campaignsEmpty: document.querySelector('[data-campaigns-empty]'),
          campaignsSkeleton: document.querySelector('[data-campaigns-skeleton]'),
          campaignsPeriod: document.querySelector('[data-campaigns-period]'),
          retryLeads: document.querySelector('[data-retry-leads]'),
          retryCampaigns: document.querySelector('[data-retry-campaigns]'),
          paymentsSection: document.querySelector('[data-section="payments"]'),
          paymentsBody: document.querySelector('[data-payments-body]'),
          paymentsEmpty: document.querySelector('[data-payments-empty]'),
          paymentsSkeleton: document.querySelector('[data-payments-skeleton]'),
          paymentsSubtitle: document.querySelector('[data-payments-subtitle]'),
          retryPayments: document.querySelector('[data-retry-payments]'),
        };

        const numberFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
        const moneyFormatter = (currency) =>
          new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 2 });
        const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        const formatMoneyWithCurrency = (value, currency) => {
          if (value == null) return '—';
          const unit = currency || state.currency;
          try {
            return moneyFormatter(unit).format(value);
          } catch (error) {
            const amount = value.toFixed ? value.toFixed(2) : String(value);
            return amount + ' ' + unit;
          }
        };
        const formatMoney = (value) => formatMoneyWithCurrency(value, state.currency);
        const formatNumber = (value) => {
          if (value == null) return '—';
          return numberFormatter.format(value);
        };
        const formatDateRange = (period) => {
          if (!period || !period.from || !period.to) return '—';
          if (period.from === period.to) {
            return dateFormatter.format(new Date(period.from));
          }
          const from = dateFormatter.format(new Date(period.from));
          const to = dateFormatter.format(new Date(period.to));
          return from + ' — ' + to;
        };
        const formatDateTime = (value) => {
          if (!value) return '—';
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) return '—';
          return dateTimeFormatter.format(date);
        };
        const escapeHtml = (value) => {
          if (value == null) return '';
          return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        };
        const formatPhone = (value) => {
          if (!value) return '—';
          const cleaned = String(value);
          const href = cleaned.replace(/[^0-9+]/g, '');
          const label = escapeHtml(cleaned);
          if (!href) return label;
          return '<a class="portal-link" href="tel:' + href + '">' + label + '</a>';
        };

        const setPreloaderVisible = (visible) => {
          if (!elements.preloader) return;
          elements.preloader.classList.toggle('portal__preloader--hidden', !visible);
        };
        const setContentVisible = (visible) => {
          if (!elements.content) return;
          elements.content.classList.toggle('portal__content--visible', visible);
        };
        const showError = (message) => {
          if (elements.errorMessage) {
            elements.errorMessage.textContent = message || 'Не удалось загрузить данные.';
          }
          if (elements.error) {
            elements.error.classList.remove('portal__error--hidden');
          }
        };
        const hideError = () => {
          if (elements.error) {
            elements.error.classList.add('portal__error--hidden');
          }
        };

        const markActivePeriod = (period) => {
          elements.periodButtons.forEach((button) => {
            const value = button.getAttribute('data-period-button');
            button.classList.toggle('portal-tabs__button--active', value === period);
          });
        };

        const toggleSkeleton = (container, skeleton, body, empty, isLoading) => {
          if (skeleton) skeleton.classList.toggle('portal-skeleton--hidden', !isLoading);
          if (body) body.style.opacity = isLoading ? '0.3' : '1';
          if (empty) empty.classList.add('portal-empty--hidden');
        };

        const fetchJson = async (url) => {
          const response = await fetch(url, { headers: { accept: 'application/json' } });
          if (!response.ok) {
            const text = await response.text();
            const error = new Error(text || 'Request failed');
            error.status = response.status;
            throw error;
          }
          return response.json();
        };

        const loadProject = async () => {
          const data = await fetchJson('/api/projects/' + encodeURIComponent(PROJECT_ID));
          if (data?.project) {
            document.title = 'Портал — ' + data.project.name;
            if (elements.projectTitle) {
              elements.projectTitle.textContent = 'Проект ' + data.project.name;
            }
            if (elements.projectDescription) {
              const account = data.project.adsAccountId ? data.project.adsAccountId : '—';
              elements.projectDescription.textContent = 'Статистика по кабинету ' + account;
            }
          }
          if (data?.settings) {
            state.currency = data.settings.billing?.currency || 'USD';
          }
          return data;
        };

        const renderMetrics = (metrics) => {
          const values = {
            spend: formatMoney(metrics?.spend ?? null),
            impressions: formatNumber(metrics?.impressions ?? null),
            clicks: formatNumber(metrics?.clicks ?? null),
            leads: formatNumber(metrics?.leads ?? null),
            cpa: metrics?.cpa != null ? formatMoney(metrics.cpa) : '—',
            'leads-total': formatNumber(metrics?.leadsTotal ?? null),
            'leads-today': formatNumber(metrics?.leadsToday ?? null),
            'cpa-today': metrics?.cpaToday != null ? formatMoney(metrics.cpaToday) : '—',
          };
          elements.metrics.forEach((element) => {
            const key = element.getAttribute('data-metric');
            const target = element.querySelector('[data-metric-value]');
            if (!key || !target) return;
            if (key === 'spend') {
              target.textContent = values.spend;
            } else {
              target.textContent = values[key] ?? '—';
            }
          });
        };

        const loadSummary = async (period) => {
          const summaryUrl = '/api/projects/' + encodeURIComponent(PROJECT_ID) + '/summary?period=' + encodeURIComponent(period);
          const data = await fetchJson(summaryUrl);
          state.summaryLoaded = true;
          if (elements.summaryPeriod) {
            elements.summaryPeriod.textContent = formatDateRange(data.period);
          }
          renderMetrics(data.metrics);
          return data;
        };

        const renderLeads = (payload) => {
          const leads = payload?.leads || [];
          if (elements.leadsPeriod) {
            elements.leadsPeriod.textContent = formatDateRange(payload?.period);
          }
          if (elements.leadsBody) {
            elements.leadsBody.innerHTML = leads
              .map((lead) => {
                const name = escapeHtml(lead.name || 'Без имени');
                const campaign = escapeHtml(lead.campaign || '—');
                const created = formatDateTime(lead.createdAt);
                const status = escapeHtml(lead.status);
                return (
                  '<tr>' +
                  '<td>' + name + '</td>' +
                  '<td>' + formatPhone(lead.phone) + '</td>' +
                  '<td>' + campaign + '</td>' +
                  '<td>' + created + '</td>' +
                  '<td><span class="portal-table__status"><span class="portal-table__status-dot"></span>' + status + '</span></td>' +
                  '</tr>'
                );
              })
              .join('');
          }
          if (elements.leadsEmpty) {
            elements.leadsEmpty.classList.toggle('portal-empty--hidden', leads.length !== 0);
          }
        };

        const loadLeads = async (period) => {
          toggleSkeleton(elements.leadsSection, elements.leadsSkeleton, elements.leadsBody, elements.leadsEmpty, true);
          try {
            const leadsUrl = '/api/projects/' + encodeURIComponent(PROJECT_ID) + '/leads?period=' + encodeURIComponent(period);
            const data = await fetchJson(leadsUrl);
            renderLeads(data);
            return data;
          } finally {
            toggleSkeleton(elements.leadsSection, elements.leadsSkeleton, elements.leadsBody, elements.leadsEmpty, false);
          }
        };

        const renderCampaigns = (payload) => {
          const campaigns = payload?.campaigns || [];
          if (elements.campaignsPeriod) {
            elements.campaignsPeriod.textContent = formatDateRange(payload?.period);
          }
          if (elements.campaignsBody) {
            elements.campaignsBody.innerHTML = campaigns
              .map((campaign) => {
                const name = escapeHtml(campaign.name);
                const cpa = campaign.cpa != null ? formatMoney(campaign.cpa) : '—';
                return (
                  '<tr>' +
                  '<td>' + name + '</td>' +
                  '<td>' + formatMoney(campaign.spend) + '</td>' +
                  '<td>' + formatNumber(campaign.impressions) + '</td>' +
                  '<td>' + formatNumber(campaign.clicks) + '</td>' +
                  '<td>' + formatNumber(campaign.leads) + '</td>' +
                  '<td>' + cpa + '</td>' +
                  '</tr>'
                );
              })
              .join('');
          }
          if (elements.campaignsEmpty) {
            elements.campaignsEmpty.classList.toggle('portal-empty--hidden', campaigns.length !== 0);
          }
        };

        const loadCampaigns = async (period) => {
          toggleSkeleton(elements.campaignsSection, elements.campaignsSkeleton, elements.campaignsBody, elements.campaignsEmpty, true);
          try {
            const campaignsUrl = '/api/projects/' + encodeURIComponent(PROJECT_ID) + '/campaigns?period=' + encodeURIComponent(period);
            const data = await fetchJson(campaignsUrl);
            renderCampaigns(data);
            return data;
          } finally {
            toggleSkeleton(elements.campaignsSection, elements.campaignsSkeleton, elements.campaignsBody, elements.campaignsEmpty, false);
          }
        };

        const paymentStatusLabels = {
          PLANNED: 'Запланировано',
          PAID: 'Оплачено',
          CANCELLED: 'Отменено',
        };

        const formatPaymentPeriod = (start, end) => {
          if (!start && !end) return '—';
          const from = start ? dateFormatter.format(new Date(start)) : '—';
          const to = end ? dateFormatter.format(new Date(end)) : '—';
          return from === to ? from : from + ' — ' + to;
        };

        const renderPayments = (payload) => {
          const payments = payload?.payments || [];
          if (elements.paymentsBody) {
            elements.paymentsBody.innerHTML = payments
              .map((payment) => {
                const amount = formatMoneyWithCurrency(payment.amount, payment.currency);
                const period = formatPaymentPeriod(payment.periodStart, payment.periodEnd);
                const status = escapeHtml(paymentStatusLabels[payment.status] || payment.status);
                const paidAt = payment.paidAt ? formatDateTime(payment.paidAt) : '—';
                const comment = escapeHtml(payment.comment || '—');
                return (
                  '<tr>' +
                  '<td>' + amount + '</td>' +
                  '<td>' + period + '</td>' +
                  '<td>' + status + '</td>' +
                  '<td>' + paidAt + '</td>' +
                  '<td>' + comment + '</td>' +
                  '</tr>'
                );
              })
              .join('');
          }
          if (elements.paymentsEmpty) {
            elements.paymentsEmpty.classList.toggle('portal-empty--hidden', payments.length !== 0);
          }
          if (elements.paymentsSubtitle) {
            elements.paymentsSubtitle.textContent = payments.length
              ? 'Всего платежей: ' + payments.length
              : 'Записей об оплатах пока нет.';
          }
        };

        const loadPayments = async () => {
          toggleSkeleton(elements.paymentsSection, elements.paymentsSkeleton, elements.paymentsBody, elements.paymentsEmpty, true);
          try {
            const paymentsUrl = '/api/projects/' + encodeURIComponent(PROJECT_ID) + '/payments';
            const data = await fetchJson(paymentsUrl);
            renderPayments(data);
            return data;
          } finally {
            toggleSkeleton(elements.paymentsSection, elements.paymentsSkeleton, elements.paymentsBody, elements.paymentsEmpty, false);
          }
        };

        const loadAll = async (period, { initial } = { initial: false }) => {
          state.summaryLoaded = false;
          const summaryPromise = loadSummary(period);
          const leadsPromise = loadLeads(period);
          const campaignsPromise = loadCampaigns(period);
          const paymentsPromise = loadPayments();

          if (initial) {
            const timeout = setTimeout(() => {
              if (!state.summaryLoaded) {
                setPreloaderVisible(false);
                showError('Не удалось загрузить данные.');
              }
            }, 9000);
            try {
              await summaryPromise;
            } catch (error) {
              console.error(error);
              throw error;
            } finally {
              clearTimeout(timeout);
            }
          } else {
            await summaryPromise;
          }

          await Promise.allSettled([leadsPromise, campaignsPromise, paymentsPromise]);
        };

        const reloadAll = () => {
          state.summaryLoaded = false;
          hideError();
          setPreloaderVisible(true);
          loadProject()
            .then(() => loadAll(state.period, { initial: true }))
            .then(() => {
              setPreloaderVisible(false);
              setContentVisible(true);
            })
            .catch((error) => {
              console.error(error);
              showError('Не удалось загрузить данные.');
            });
        };

        elements.periodButtons.forEach((button) => {
          button.addEventListener('click', () => {
            const period = button.getAttribute('data-period-button');
            if (!period || period === state.period) return;
            state.period = period;
            markActivePeriod(period);
            loadAll(period).catch((error) => console.error(error));
          });
        });

        elements.retryButtons.forEach((button) => {
          button.addEventListener('click', () => {
            reloadAll();
          });
        });
        if (elements.retryLeads) {
          elements.retryLeads.addEventListener('click', () => {
            loadLeads(state.period).catch((error) => console.error(error));
          });
        }
        if (elements.retryCampaigns) {
          elements.retryCampaigns.addEventListener('click', () => {
            loadCampaigns(state.period).catch((error) => console.error(error));
          });
        }
        if (elements.retryPayments) {
          elements.retryPayments.addEventListener('click', () => {
            loadPayments().catch((error) => console.error(error));
          });
        }

        reloadAll();
      })();
    </script>
  </body>
</html>`;
};

const ensurePortalAccess = async (context: RequestContext, projectId: string) => {
  const project = await getProject(context.kv, projectId);
  const settings = await ensureProjectSettings(context.kv, projectId);
  if (!settings.portalEnabled) {
    throw new DataValidationError("Portal is disabled for this project");
  }
  return { project, settings };
};

export const registerPortalRoutes = (router: Router): void => {
  router.on("GET", "/portal/:projectId", async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    try {
      await ensurePortalAccess(context, projectId);
      return htmlResponse(renderPortalHtml(projectId));
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        return notFound(error.message);
      }
      if (error instanceof DataValidationError) {
        return forbidden(error.message);
      }
      throw error;
    }
  });

  router.on("GET", "/api/projects/:projectId/summary", async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    const url = new URL(context.request.url);
    const period = url.searchParams.get("period") ?? "today";
    try {
      const { project, settings } = await ensurePortalAccess(context, projectId);
      const { entry } = await loadProjectSummary(context.kv, projectId, period, { project, settings });
      return jsonResponse({
        projectId,
        periodKey: entry.payload.periodKey,
        period: entry.period,
        fetchedAt: entry.fetchedAt,
        metrics: entry.payload.metrics,
      });
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        return notFound(error.message);
      }
      if (error instanceof DataValidationError) {
        return unprocessable(error.message);
      }
      throw error;
    }
  });

  router.on("GET", "/api/projects/:projectId/leads", async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    const url = new URL(context.request.url);
    const periodKey = url.searchParams.get("period") ?? "today";
    try {
      const { settings } = await ensurePortalAccess(context, projectId);
      const range = resolvePeriodRange(periodKey);
      const leads = await listLeads(context.r2, projectId);
      const filtered = filterLeadsByDateRange(leads, range.from, range.to).map((lead) => ({
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        campaign: lead.campaign,
        createdAt: lead.createdAt,
        status: lead.status,
      }));
      return jsonResponse({
        projectId,
        period: range.period,
        periodKey,
        leads: filtered,
        total: filtered.length,
        portalEnabled: settings.portalEnabled,
      });
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        return notFound(error.message);
      }
      if (error instanceof DataValidationError) {
        return unprocessable(error.message);
      }
      throw error;
    }
  });

  router.on("GET", "/api/projects/:projectId/campaigns", async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    const url = new URL(context.request.url);
    const periodKey = url.searchParams.get("period") ?? "today";
    try {
      const { project, settings } = await ensurePortalAccess(context, projectId);
      const { entry } = await loadProjectCampaigns(context.kv, projectId, periodKey, { project, settings });
      return jsonResponse({
        projectId,
        period: entry.period,
        periodKey,
        fetchedAt: entry.fetchedAt,
        campaigns: mapCampaignRows(entry.payload),
      });
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        return notFound(error.message);
      }
      if (error instanceof DataValidationError) {
        return unprocessable(error.message);
      }
      throw error;
    }
  });

  router.on("GET", "/api/projects/:projectId/payments", async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    try {
      const { settings } = await ensurePortalAccess(context, projectId);
      const payments = await listProjectPayments(context.r2, projectId);
      const sorted = payments.sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1));
      return jsonResponse({
        projectId,
        payments: sorted.map((payment) => ({
          id: payment.id,
          amount: payment.amount,
          currency: payment.currency,
          periodStart: payment.periodStart,
          periodEnd: payment.periodEnd,
          status: payment.status,
          paidAt: payment.paidAt,
          comment: payment.comment,
          createdAt: payment.createdAt,
        })),
        total: sorted.length,
        portalEnabled: settings.portalEnabled,
      });
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        return notFound(error.message);
      }
      if (error instanceof DataValidationError) {
        return unprocessable(error.message);
      }
      throw error;
    }
  });
};
