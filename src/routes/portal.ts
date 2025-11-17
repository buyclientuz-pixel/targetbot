import { loadProjectBundle, type ProjectBundle } from "../bot/data";
import {
  loadProjectSummary,
  loadProjectCampaignStatuses,
  resolvePeriodRange,
  syncProjectCampaignDocument,
  type CampaignStatus,
} from "../services/project-insights";
import { DataValidationError, EntityNotFoundError } from "../errors";
import { jsonResponse } from "../http/responses";
import { applyCors, preflight } from "../http/cors";
import { requireProjectRecord } from "../domain/spec/project";
import { listLeads, type Lead, type LeadStatus } from "../domain/leads";
import { getProjectLeadsList, type ProjectLeadsListRecord } from "../domain/spec/project-leads";
import type { R2Client } from "../infra/r2";
import type { Router } from "../worker/router";
import type { RequestContext } from "../worker/context";
import { translateMetaObjective } from "../services/meta-objectives";
import { refreshProjectLeads } from "../services/project-leads-sync";

const htmlResponse = (body: string): Response =>
  new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const withNoStore = (headers?: HeadersInit): HeadersInit => {
  const merged = new Headers(headers);
  merged.set("cache-control", "no-store");
  return merged;
};

const jsonOk = (data: unknown, init?: ResponseInit): Response =>
  applyCors(jsonResponse({ ok: true, data }, { ...init, headers: withNoStore(init?.headers) }));

const jsonError = (status: number, message: string): Response =>
  applyCors(jsonResponse({ ok: false, error: message }, { status, headers: withNoStore() }));

const badRequest = (message: string): Response => jsonError(400, message);
const forbidden = (message: string): Response => jsonError(403, message);
const notFound = (message: string): Response => jsonError(404, message);
const unprocessable = (message: string): Response => jsonError(422, message);

const computeCpa = (spend: number, value: number): number | null => {
  if (!Number.isFinite(spend) || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return spend / value;
};

const buildSummaryPayload = (
  bundle: ProjectBundle,
  requestedPeriod: string,
  options?: {
    summaryEntry?: import("../domain/meta-cache").MetaCacheEntry<import("../domain/meta-summary").MetaSummaryPayload> | null;
    campaigns?: import("../domain/spec/meta-campaigns").MetaCampaignsDocument;
  },
) => {
  const campaignsDoc = options?.campaigns ?? bundle.campaigns;
  const summaryMetrics = options?.summaryEntry?.payload.metrics;
  const summary = summaryMetrics
    ? {
        spend: summaryMetrics.spend,
        impressions: summaryMetrics.impressions,
        clicks: summaryMetrics.clicks,
        leads: summaryMetrics.leads,
        messages: summaryMetrics.messages ?? campaignsDoc.summary.messages,
      }
    : campaignsDoc.summary;
  const spend = summary.spend ?? 0;
  const leads = summary.leads ?? 0;
  const leadsToday = bundle.leads.stats.today ?? 0;
  return {
    project: {
      id: bundle.project.id,
      name: bundle.project.name,
      portalUrl: bundle.project.portalUrl,
    },
    period: options?.summaryEntry?.period ?? campaignsDoc.period,
    periodKey: options?.summaryEntry?.payload.periodKey ?? campaignsDoc.periodKey ?? requestedPeriod,
    metrics: {
      spend,
      impressions: summary.impressions ?? 0,
      clicks: summary.clicks ?? 0,
      leads,
      messages: summary.messages ?? 0,
      cpa: computeCpa(spend, leads),
      leadsTotal: bundle.leads.stats.total ?? 0,
      leadsToday,
      cpaToday: summaryMetrics?.cpaToday ?? computeCpa(summaryMetrics?.spendToday ?? spend, leadsToday),
      spendToday: summaryMetrics?.spendToday ?? (requestedPeriod === "today" ? spend : summaryMetrics?.spendToday ?? 0),
      currency: bundle.project.settings.currency,
      kpiLabel: bundle.project.settings.kpi.label,
      kpiType: bundle.project.settings.kpi.type,
    },
  };
};

const mapLeadStatusForPortal = (
  status: ProjectLeadsListRecord["leads"][number]["status"] | LeadStatus,
): ProjectLeadsListRecord["leads"][number]["status"] => {
  if (typeof status === "string") {
    const normalised = status.toLowerCase();
    if (normalised === "new" || normalised === "processing" || normalised === "done" || normalised === "trash") {
      return normalised;
    }
  }
  return "new";
};

const normaliseLeadContact = (lead: Lead): string => {
  if (lead.contact && lead.contact.trim().length > 0) {
    return lead.contact.trim();
  }
  if (lead.phone) {
    return lead.phone;
  }
  if (lead.message) {
    return "Сообщение";
  }
  return "—";
};

const loadPortalLeadsPayload = async (
  r2: R2Client,
  projectId: string,
  periodKey: string,
): Promise<{
  period: ReturnType<typeof resolvePeriodRange>["period"];
  periodKey: string;
  leads: Array<{
    id: string;
    name: string;
    contact: string;
    phone: string | null;
    message: string | null;
    createdAt: string;
    campaignName: string;
    campaignId: string | null;
    status: ProjectLeadsListRecord["leads"][number]["status"];
    type: string;
    source: string;
  }>;
  stats: ProjectLeadsListRecord["stats"];
  syncedAt: string | null;
}> => {
  const range = resolvePeriodRange(periodKey);
  const fromTime = range.from.getTime();
  const toTime = range.to.getTime();
  const leads = await listLeads(r2, projectId);
  const filtered = leads
    .filter((lead) => {
      const created = Date.parse(lead.createdAt);
      return Number.isFinite(created) && created >= fromTime && created <= toTime;
    })
    .map((lead) => ({
      id: lead.id,
      name: lead.name,
      contact: normaliseLeadContact(lead),
      phone: lead.phone,
      message: lead.message,
      createdAt: lead.createdAt,
      campaignName: lead.campaign ?? "—",
      campaignId: lead.campaignId,
      status: mapLeadStatusForPortal(lead.status as LeadStatus),
      type: lead.phone ? "lead" : "message",
      source: lead.source,
    }))
    .sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt > b.createdAt ? -1 : 1));
  const summary = (await getProjectLeadsList(r2, projectId)) ?? null;
  const todayKey = new Date().toISOString().slice(0, 10);
  const stats = summary?.stats ?? {
    total: leads.length,
    today: leads.filter((lead) => lead.createdAt.slice(0, 10) === todayKey).length,
  };
  return { period: range.period, periodKey, leads: filtered, stats, syncedAt: summary?.syncedAt ?? null };
};

const buildCampaignsPayload = (
  bundle: ProjectBundle,
  requestedPeriod: string,
  document?: import("../domain/spec/meta-campaigns").MetaCampaignsDocument,
  statuses?: CampaignStatus[] | null,
) => {
  const campaignsDoc = document ?? bundle.campaigns;
  const statusMap = new Map((statuses ?? []).map((entry) => [entry.id, entry] as const));
  const campaigns = campaignsDoc.campaigns.map((campaign) => {
    const status = statusMap.get(campaign.id);
    const resolvedStatus = status?.status ?? status?.effectiveStatus ?? status?.configuredStatus ?? null;
    const objectiveValue = status?.objective ?? campaign.objective;
    return {
      ...campaign,
      objective: objectiveValue,
      objectiveLabel: translateMetaObjective(objectiveValue),
      status: resolvedStatus,
      effectiveStatus: status?.effectiveStatus ?? null,
      configuredStatus: status?.configuredStatus ?? null,
      dailyBudget: status?.dailyBudget ?? null,
      budgetRemaining: status?.budgetRemaining ?? null,
      updatedTime: status?.updatedTime ?? null,
    };
  });
  return {
    period: campaignsDoc.period,
    periodKey: campaignsDoc.periodKey ?? requestedPeriod,
    summary: campaignsDoc.summary,
    campaigns,
    kpi: bundle.project.settings.kpi,
  };
};

const buildPaymentsPayload = (bundle: ProjectBundle) => ({
  billing: bundle.billing,
  payments: bundle.payments.payments,
});

const respondWithProjectLeads = async (
  context: RequestContext,
  projectId: string,
  periodKey: string,
  options?: { refresh?: boolean },
): Promise<Response> => {
  try {
    if (options?.refresh) {
      await refreshProjectLeads(context.kv, context.r2, projectId);
    }
    const payload = await loadPortalLeadsPayload(context.r2, projectId, periodKey);
    return jsonOk({ projectId, ...payload });
  } catch (error) {
    if (error instanceof EntityNotFoundError) {
      return notFound(error.message);
    }
    if (error instanceof DataValidationError) {
      return unprocessable(error.message);
    }
    throw error;
  }
};

export const renderPortalHtml = (projectId: string): string => {
  const projectIdJson = JSON.stringify(projectId);
  const portalScriptSource = String.raw`
      (() => {
        const PROJECT_ID = PROJECT_ID_PLACEHOLDER;
        const API_BASE = '/api/projects/' + encodeURIComponent(PROJECT_ID);
        const TOKEN = new URLSearchParams(window.location.search).get('token');
        const REQUEST_TIMEOUT = 12000;
        const LEADS_REFRESH_WINDOW_MS = 10 * 60 * 1000;
        const elements = {
          preloader: document.querySelector('[data-preloader]'),
          error: document.querySelector('[data-error]'),
          errorMessage: document.querySelector('[data-error-message]'),
          content: document.querySelector('[data-content]'),
          projectTitle: document.querySelector('[data-project-title]'),
          projectDescription: document.querySelector('[data-project-description]'),
          summaryPeriod: document.querySelector('[data-summary-period]'),
          metrics: document.querySelectorAll('[data-metric]'),
          focusTarget: document.querySelector('[data-focus-target]'),
          focusCpa: document.querySelector('[data-focus-cpa]'),
          focusCpl: document.querySelector('[data-focus-cpl]'),
          periodButtons: document.querySelectorAll('[data-period-button]'),
          leadsBody: document.querySelector('[data-leads-body]'),
          leadsEmpty: document.querySelector('[data-leads-empty]'),
          leadsSkeleton: document.querySelector('[data-leads-skeleton]'),
          leadsPeriod: document.querySelector('[data-leads-period]'),
          campaignsBody: document.querySelector('[data-campaigns-body]'),
          campaignsEmpty: document.querySelector('[data-campaigns-empty]'),
          campaignsSkeleton: document.querySelector('[data-campaigns-skeleton]'),
          campaignsPeriod: document.querySelector('[data-campaigns-period]'),
          paymentsBody: document.querySelector('[data-payments-body]'),
          paymentsEmpty: document.querySelector('[data-payments-empty]'),
          paymentsSkeleton: document.querySelector('[data-payments-skeleton]'),
          paymentsSubtitle: document.querySelector('[data-payments-subtitle]'),
          retryButtons: document.querySelectorAll('[data-retry]'),
          retryLeads: document.querySelector('[data-retry-leads]'),
          retryCampaigns: document.querySelector('[data-retry-campaigns]'),
          retryPayments: document.querySelector('[data-retry-payments]'),
          exportLeads: document.querySelector('[data-export-leads]'),
          exportCampaigns: document.querySelector('[data-export-campaigns]'),
          exportSummary: document.querySelector('[data-export-summary]'),
        };
        const state = {
          period: 'today',
          project: null,
          summary: null,
          leads: null,
          campaigns: null,
          payments: null,
        };
        const appendToken = (url) => {
          if (!TOKEN) return url;
          const separator = url.includes('?') ? '&' : '?';
          return url + separator + 'token=' + encodeURIComponent(TOKEN);
        };
        const formatNumber = (value) => {
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            return '—';
          }
          return new Intl.NumberFormat('ru-RU').format(value);
        };
        const formatMoney = (value, currency = 'USD') => {
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            return '—';
          }
          try {
            return new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).format(value);
          } catch {
            return value.toFixed(2) + ' ' + currency;
          }
        };
        const formatDate = (value) => {
          if (!value) return '—';
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) return '—';
          return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
        };
        const formatDateTime = (value) => {
          if (!value) return '—';
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) return '—';
          return new Intl.DateTimeFormat('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }).format(date);
        };
        const formatDateRange = (range) => {
          if (!range || !range.from || !range.to) {
            return '—';
          }
          return formatDate(range.from) + ' — ' + formatDate(range.to);
        };
        const escapeHtml = (value) => {
          if (typeof value !== 'string') return '';
          return value.replace(/[&<>"']/g, (char) => {
            switch (char) {
              case '&':
                return '&amp;';
              case '<':
                return '&lt;';
              case '>':
                return '&gt;';
              case '"':
                return '&quot;';
              case "'":
                return '&#39;';
              default:
                return char;
            }
          });
        };
        const showPreloader = (visible) => {
          if (!elements.preloader) return;
          elements.preloader.classList.toggle('portal__preloader--hidden', !visible);
        };
        const toggleContent = (visible) => {
          if (!elements.content) return;
          elements.content.classList.toggle('portal__content--visible', visible);
        };
        const showError = (message) => {
          if (elements.errorMessage) {
            elements.errorMessage.textContent = message || 'Не удалось загрузить данные. Попробуйте снова.';
          }
          elements.error?.classList.remove('portal__error--hidden');
        };
        const hideError = () => {
          elements.error?.classList.add('portal__error--hidden');
        };
        const markActivePeriod = (period) => {
          elements.periodButtons?.forEach?.((button) => {
            const value = button.getAttribute('data-period-button');
            button.classList.toggle('portal-tabs__button--active', value === period);
          });
        };
        const toggleSkeleton = (skeleton, body, empty, isLoading) => {
          skeleton?.classList.toggle('portal-skeleton--hidden', !isLoading);
          if (body) {
            body.style.opacity = isLoading ? '0.3' : '1';
          }
          if (isLoading) {
            empty?.classList.add('portal-empty--hidden');
          }
        };
        const fetchWithTimeout = async (path, options = {}) => {
          const controller = typeof AbortController === 'function' ? new AbortController() : null;
          const timeoutMs = options.timeout ?? REQUEST_TIMEOUT;
          let timeoutId = null;
          if (controller) {
            timeoutId = setTimeout(() => controller.abort(), timeoutMs);
          }
          try {
            return await fetch(appendToken(path), {
              ...options,
              signal: controller?.signal ?? options.signal,
              headers: {
                accept: 'application/json',
                ...(options.headers || {}),
              },
            });
          } finally {
            if (timeoutId !== null) {
              clearTimeout(timeoutId);
            }
          }
        };
        const requestJson = async (path, options = {}) => {
          try {
            const response = await fetchWithTimeout(path, options);
            const payload = await response
              .clone()
              .json()
              .catch(() => null);
            if (!response.ok || !payload?.ok) {
              const text = (payload && payload.error) || (await response.text()) || 'Request failed';
              const error = new Error(text);
              error.status = response.status;
              throw error;
            }
            return payload.data;
          } catch (error) {
            if (error?.name === 'AbortError') {
              const timeoutError = new Error('Превышено время ожидания ответа. Попробуйте ещё раз.');
              timeoutError.code = 'timeout';
              throw timeoutError;
            }
            throw error;
          }
        };
        const fetchJson = (path) => requestJson(path);
        const postJson = (path) => requestJson(path, { method: 'POST' });
        const portalClient = {
          project: () => fetchJson(API_BASE),
          summary: (period) => fetchJson(API_BASE + '/summary?period=' + encodeURIComponent(period)),
        leads: (period) => fetchJson(API_BASE + '/leads/' + encodeURIComponent(period)),
        refreshLeads: (period) => postJson(API_BASE + '/leads/' + encodeURIComponent(period) + '/refresh'),
          campaigns: (period) => fetchJson(API_BASE + '/campaigns?period=' + encodeURIComponent(period)),
          payments: () => fetchJson(API_BASE + '/payments'),
        };
        const KPI_LABELS = {
          LEAD: 'Лиды',
          MESSAGE: 'Сообщения',
          CLICK: 'Клики',
          VIEW: 'Показы',
          PURCHASE: 'Продажи',
        };
        const PAYMENT_STATUS_LABELS = {
          paid: 'Оплачено',
          planned: 'Просрочено',
          overdue: 'Просрочено',
          cancelled: 'Отказ',
          declined: 'Отказ',
        };
        const PAYMENT_STATUS_STATES = {
          paid: 'success',
          planned: 'warning',
          overdue: 'warning',
          cancelled: 'danger',
          declined: 'danger',
        };
        const renderProject = (project) => {
          if (!project) return;
          document.title = 'Портал — ' + project.name;
          if (elements.projectTitle) {
            elements.projectTitle.textContent = 'Проект ' + project.name;
          }
          if (elements.projectDescription) {
            elements.projectDescription.textContent = project.portalUrl || 'Актуальные показатели по проекту';
          }
        };
        const renderMetrics = (summary) => {
          const metrics = summary?.metrics || {};
          elements.summaryPeriod && (elements.summaryPeriod.textContent = formatDateRange(summary?.period));
          const values = {
            spend: formatMoney(metrics.spend, metrics.currency || 'USD'),
            impressions: formatNumber(metrics.impressions),
            clicks: formatNumber(metrics.clicks),
            leads: formatNumber(metrics.leads),
            messages: formatNumber(metrics.messages),
            cpa: metrics.cpa != null ? formatMoney(metrics.cpa, metrics.currency || 'USD') : '—',
            'leads-today': formatNumber(metrics.leadsToday),
            'cpa-today': metrics.cpaToday != null ? formatMoney(metrics.cpaToday, metrics.currency || 'USD') : '—',
          };
          const metricNodes = Array.from(elements.metrics ?? []);
          metricNodes.forEach((metric) => {
            const key = metric.getAttribute('data-metric');
            const target = metric.querySelector('[data-metric-value]');
            metric.classList.remove('portal-metric--primary');
            if (key && target) {
              target.textContent = values[key] ?? '—';
            }
          });
          const highlightKey = (metrics.kpiType || '').toUpperCase() === 'MESSAGE' ? 'messages' : 'leads';
          const highlighted = metricNodes.find((metric) => metric.getAttribute('data-metric') === highlightKey);
          highlighted?.classList.add('portal-metric--primary');
          const targetLabel = metrics.kpiLabel || (highlightKey === 'messages' ? 'Сообщения' : 'Лиды');
          const targetValue = highlightKey === 'messages' ? formatNumber(metrics.messages) : formatNumber(metrics.leads);
          if (elements.focusTarget) {
            elements.focusTarget.textContent = targetLabel + ': ' + targetValue;
          }
          const spendValue = typeof metrics.spend === 'number' ? metrics.spend : 0;
          const cpaTarget =
            highlightKey === 'messages'
              ? metrics.messages > 0
                ? formatMoney(spendValue / metrics.messages, metrics.currency || 'USD')
                : '—'
              : values.cpa;
          const cplValue =
            metrics.leads > 0 ? formatMoney(spendValue / metrics.leads, metrics.currency || 'USD') : '—';
          if (elements.focusCpa) {
            elements.focusCpa.textContent = cpaTarget ?? '—';
          }
          if (elements.focusCpl) {
            elements.focusCpl.textContent = cplValue ?? '—';
          }
        };
        const renderLeads = (payload) => {
          if (elements.leadsPeriod) {
            elements.leadsPeriod.textContent = formatDateRange(payload?.period);
          }
          const leads = payload?.leads || [];
          if (elements.leadsBody) {
            elements.leadsBody.innerHTML = leads
              .map((lead) => {
                const name = escapeHtml(lead.name || 'Без имени');
                const contactText = (lead.contact || lead.phone || '').trim();
                const isMessage = !contactText || contactText.toLowerCase() === 'сообщение';
                const contact = isMessage
                  ? '<span class="portal-tag">Сообщение</span>'
                  : escapeHtml(contactText);
                const campaign = escapeHtml(lead.campaignName || lead.campaign || '—');
                return (
                  '<tr>' +
                  '<td>' + name + '</td>' +
                  '<td>' + contact + '</td>' +
                  '<td>' + formatDateTime(lead.createdAt) + '</td>' +
                  '<td>' + campaign + '</td>' +
                  '</tr>'
                );
              })
              .join('');
          }
          if (elements.leadsEmpty) {
            elements.leadsEmpty.classList.toggle('portal-empty--hidden', leads.length > 0);
            if (leads.length === 0) {
              elements.leadsEmpty.textContent = 'За выбранный период лидов нет.';
            }
          }
        };
        const shouldAutoRefreshLeads = (payload) => {
          if (!payload) {
            return true;
          }
          const syncedAt = payload.syncedAt ? Date.parse(payload.syncedAt) : NaN;
          if (!Number.isFinite(syncedAt)) {
            return true;
          }
          return Date.now() - syncedAt > LEADS_REFRESH_WINDOW_MS;
        };
        const campaignKpiValue = (campaign, type) => {
          switch (type) {
            case 'LEAD':
              return campaign.leads;
            case 'MESSAGE':
              return campaign.messages;
            case 'CLICK':
              return campaign.clicks;
            case 'VIEW':
              return campaign.impressions;
            case 'PURCHASE':
              return campaign.leads;
            default:
              return campaign.leads;
          }
        };
        const renderCampaigns = (payload) => {
          if (elements.campaignsPeriod) {
            elements.campaignsPeriod.textContent = formatDateRange(payload?.period);
          }
          const campaigns = payload?.campaigns || [];
          const currency = state.summary?.metrics?.currency || 'USD';
          if (elements.campaignsBody) {
            elements.campaignsBody.innerHTML = campaigns
              .map((campaign) => {
                const kpiValue = campaignKpiValue(campaign, campaign.kpiType);
                const cpa = kpiValue && Number(kpiValue) > 0 ? campaign.spend / kpiValue : null;
                const objectiveLabel = escapeHtml(campaign.objectiveLabel || campaign.objective || '—');
                const kpiLabel = KPI_LABELS[campaign.kpiType] || 'Результат';
                return (
                  '<tr>' +
                  '<td>' + escapeHtml(campaign.name) + '<span class="portal-table__note">' + objectiveLabel + '</span></td>' +
                  '<td>' + formatMoney(campaign.spend, currency) + '</td>' +
                  '<td>' + formatNumber(campaign.impressions) + '</td>' +
                  '<td>' + formatNumber(campaign.clicks) + '</td>' +
                  '<td>' +
                  formatNumber(kpiValue) +
                  '<span class="portal-table__note">' + kpiLabel + '</span>' +
                  '</td>' +
                  '<td>' + (cpa != null ? formatMoney(cpa, currency) : '—') + '</td>' +
                  '</tr>'
                );
              })
              .join('');
          }
          if (elements.campaignsEmpty) {
            elements.campaignsEmpty.classList.toggle('portal-empty--hidden', campaigns.length > 0);
            if (campaigns.length === 0) {
              elements.campaignsEmpty.textContent = 'Нет данных по кампаниям.';
            }
          }
        };
        const renderPayments = (payload) => {
          const billing = payload?.billing;
          if (elements.paymentsSubtitle && billing) {
            elements.paymentsSubtitle.textContent =
              'Тариф: ' +
              billing.tariff +
              ' ' +
              billing.currency +
              ' · Следующая оплата: ' +
              formatDate(billing.nextPaymentDate);
          }
          const payments = payload?.payments || [];
          if (elements.paymentsBody) {
            elements.paymentsBody.innerHTML = payments
              .map((payment) => {
                const statusKey = (payment.status || '').toLowerCase();
                const rawLabel = PAYMENT_STATUS_LABELS[statusKey] || payment.status || '—';
                const statusLabel = escapeHtml(rawLabel);
                const statusClass = PAYMENT_STATUS_STATES[statusKey] || 'muted';
                return (
                  '<tr>' +
                  '<td>' + formatMoney(payment.amount, payment.currency || 'USD') + '</td>' +
                  '<td>' + formatDate(payment.paidAt || payment.periodTo) + '</td>' +
                  '<td><span class="portal-table__status portal-table__status--' + statusClass + '"><span class="portal-table__status-dot"></span>' +
                  statusLabel +
                  '</span></td>' +
                  '</tr>'
                );
              })
              .join('');
          }
          if (elements.paymentsEmpty) {
            elements.paymentsEmpty.classList.toggle('portal-empty--hidden', payments.length > 0);
            if (payments.length === 0) {
              elements.paymentsEmpty.textContent = 'Оплаты ещё не зафиксированы.';
            }
          }
        };
        const setSectionLoading = (section, isLoading) => {
          switch (section) {
            case 'leads':
              toggleSkeleton(elements.leadsSkeleton, elements.leadsBody, elements.leadsEmpty, isLoading);
              break;
            case 'campaigns':
              toggleSkeleton(elements.campaignsSkeleton, elements.campaignsBody, elements.campaignsEmpty, isLoading);
              break;
            case 'payments':
              toggleSkeleton(elements.paymentsSkeleton, elements.paymentsBody, elements.paymentsEmpty, isLoading);
              break;
            default:
              break;
          }
        };
        const handleSectionError = (section, message) => {
          const text = message || 'Не удалось загрузить данные.';
          if (section === 'leads' && elements.leadsEmpty) {
            elements.leadsEmpty.textContent = text;
            elements.leadsEmpty.classList.remove('portal-empty--hidden');
          }
          if (section === 'campaigns' && elements.campaignsEmpty) {
            elements.campaignsEmpty.textContent = text;
            elements.campaignsEmpty.classList.remove('portal-empty--hidden');
          }
          if (section === 'payments' && elements.paymentsEmpty) {
            elements.paymentsEmpty.textContent = text;
            elements.paymentsEmpty.classList.remove('portal-empty--hidden');
          }
        };
        const updateExportButtons = () => {
          if (elements.exportLeads) {
            elements.exportLeads.disabled = !state.leads || !state.leads.leads?.length;
          }
          if (elements.exportCampaigns) {
            elements.exportCampaigns.disabled = !state.campaigns || !state.campaigns.campaigns?.length;
          }
          if (elements.exportSummary) {
            elements.exportSummary.disabled = !state.summary;
          }
        };
        const toCsvRow = (values) =>
          values
            .map((value) => {
              const text = value == null ? '' : String(value);
              if (/[";\n]/.test(text)) {
                return '"' + text.replace(/"/g, '""') + '"';
              }
              return text;
            })
            .join(';');
        const downloadFile = (filename, content, mime) => {
          if (typeof document.createElement !== 'function' || typeof URL === 'undefined') {
            console.warn('Экспорт недоступен в этом окружении');
            return;
          }
          const blob = new Blob([content], { type: mime });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = filename;
          document.body?.appendChild?.(link);
          link.click();
          document.body?.removeChild?.(link);
          setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        };
        const exportLeads = () => {
          if (!state.leads?.leads?.length) return;
          const header = toCsvRow(['ID', 'Имя', 'Контакт', 'Кампания', 'Статус', 'Дата']);
          const rows = state.leads.leads.map((lead) => {
            const contact = (lead.contact || lead.phone || '').trim() || 'Сообщение';
            return toCsvRow([lead.id, lead.name, contact, lead.campaignName, lead.status, lead.createdAt]);
          });
          downloadFile('leads-' + state.period + '.csv', [header, ...rows].join('\n'), 'text/csv');
        };
        const exportCampaigns = () => {
          if (!state.campaigns?.campaigns?.length) return;
          const header = toCsvRow(['ID', 'Название', 'Цель', 'Расход', 'Показы', 'Клики', 'KPI', 'CPA']);
          const rows = state.campaigns.campaigns.map((campaign) => {
            const kpiValue = campaignKpiValue(campaign, campaign.kpiType);
            const cpa = kpiValue && Number(kpiValue) > 0 ? campaign.spend / kpiValue : '';
            return toCsvRow([
              campaign.id,
              campaign.name,
              campaign.objectiveLabel || campaign.objective,
              campaign.spend,
              campaign.impressions,
              campaign.clicks,
              kpiValue,
              cpa,
            ]);
          });
          downloadFile('campaigns-' + state.period + '.csv', [header, ...rows].join('\n'), 'text/csv');
        };
        const exportSummary = () => {
          if (!state.summary) return;
          downloadFile('summary-' + state.period + '.json', JSON.stringify(state.summary, null, 2), 'application/json');
        };
        const loadProject = async () => {
          const data = await portalClient.project();
          state.project = data.project;
          renderProject(data.project);
        };
        const loadSummary = async (period) => {
          state.period = period;
          markActivePeriod(period);
          const summary = await portalClient.summary(period);
          state.summary = summary;
          renderMetrics(summary);
          updateExportButtons();
        };
        const loadLeads = async (period, options = {}) => {
          const { refresh = false, skipAuto = false } = options;
          setSectionLoading('leads', true);
          try {
            const leads = refresh ? await portalClient.refreshLeads(period) : await portalClient.leads(period);
            state.leads = leads;
            renderLeads(leads);
            if (!refresh && !skipAuto && shouldAutoRefreshLeads(leads)) {
              await loadLeads(period, { refresh: true, skipAuto: true });
            }
          } catch (error) {
            handleSectionError('leads', error?.message);
          } finally {
            setSectionLoading('leads', false);
            updateExportButtons();
          }
        };
        const loadCampaigns = async (period) => {
          setSectionLoading('campaigns', true);
          try {
            const campaigns = await portalClient.campaigns(period);
            state.campaigns = campaigns;
            renderCampaigns(campaigns);
          } catch (error) {
            handleSectionError('campaigns', error?.message);
          } finally {
            setSectionLoading('campaigns', false);
            updateExportButtons();
          }
        };
        const loadPayments = async () => {
          setSectionLoading('payments', true);
          try {
            const payments = await portalClient.payments();
            state.payments = payments;
            renderPayments(payments);
          } catch (error) {
            handleSectionError('payments', error?.message);
          } finally {
            setSectionLoading('payments', false);
          }
        };
        const refreshPeriodData = async (period) => {
          try {
            await Promise.all([loadSummary(period), loadLeads(period), loadCampaigns(period)]);
          } catch (error) {
            showError(error?.message || 'Не удалось загрузить данные.');
          }
        };
        const bootstrap = async () => {
          showPreloader(true);
          hideError();
          toggleContent(false);
          try {
            await Promise.all([loadProject(), loadSummary(state.period)]);
            toggleContent(true);
            showPreloader(false);
            loadLeads(state.period);
            loadCampaigns(state.period);
            loadPayments();
          } catch (error) {
            showPreloader(false);
            showError(error?.message || 'Не удалось загрузить данные.');
          }
        };
        elements.retryButtons?.forEach?.((button) => {
          button.addEventListener('click', () => bootstrap());
        });
        elements.retryLeads?.addEventListener('click', () => loadLeads(state.period, { refresh: true }));
        elements.retryCampaigns?.addEventListener('click', () => loadCampaigns(state.period));
        elements.retryPayments?.addEventListener('click', () => loadPayments());
        elements.periodButtons?.forEach?.((button) => {
          button.addEventListener('click', () => {
            const period = button.getAttribute('data-period-button');
            if (period && period !== state.period) {
              refreshPeriodData(period);
            }
          });
        });
        elements.exportLeads?.addEventListener('click', exportLeads);
        elements.exportCampaigns?.addEventListener('click', exportCampaigns);
        elements.exportSummary?.addEventListener('click', exportSummary);
        bootstrap();
        window.PortalApp = { reload: bootstrap };
      })();
  `;
  const portalScript = portalScriptSource
    .replace(/PROJECT_ID_PLACEHOLDER/g, projectIdJson)
    .replace(/\$\{/g, "\\${");
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Портал — ${projectId}</title>
    <style>
      :root {
        font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        --portal-bg: #f4f6fb;
        --portal-card: #ffffff;
        --portal-text: #0f172a;
        --portal-muted: #64748b;
        --portal-border: rgba(15, 23, 42, 0.08);
        --portal-accent: #2563eb;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background: var(--portal-bg);
        color: var(--portal-text);
        line-height: 1.5;
      }
      .portal {
        min-height: 100vh;
        background: var(--portal-bg);
      }
      .portal__content {
        max-width: 1160px;
        margin: 0 auto;
        padding: 32px 16px 48px;
        display: flex;
        flex-direction: column;
        gap: 24px;
        opacity: 0;
        transform: translateY(16px);
        transition: opacity 0.2s ease, transform 0.2s ease;
      }
      .portal__content--visible {
        opacity: 1;
        transform: none;
      }
      .portal__header {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .portal__title {
        font-size: 28px;
        font-weight: 700;
        margin: 0;
      }
      .portal__subtitle {
        font-size: 15px;
        color: var(--portal-muted);
      }
      .portal-section {
        background: var(--portal-card);
        border-radius: 24px;
        padding: 24px;
        border: 1px solid var(--portal-border);
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
      }
      .portal-section__header {
        display: flex;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
      }
      .portal-section__actions {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .portal-section__title {
        font-size: 20px;
        font-weight: 600;
        margin: 0;
      }
      .portal-section__subtitle {
        color: var(--portal-muted);
        font-size: 14px;
      }
      .portal-metrics {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
        margin-top: 20px;
      }
      .portal-metric {
        background: #f8fafc;
        border-radius: 18px;
        padding: 16px;
        border: 1px solid var(--portal-border);
        transition: transform 0.15s ease;
      }
      .portal-metric--primary {
        border-color: rgba(37, 99, 235, 0.4);
        box-shadow: 0 12px 30px rgba(37, 99, 235, 0.12);
      }
      .portal-metric__label {
        color: var(--portal-muted);
        font-size: 14px;
        margin-bottom: 6px;
      }
      .portal-metric__value {
        font-size: 24px;
        font-weight: 700;
      }
      .portal-focus {
        margin-top: 12px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }
      .portal-focus__item {
        background: rgba(37, 99, 235, 0.08);
        border: 1px solid rgba(37, 99, 235, 0.2);
        border-radius: 16px;
        padding: 14px 16px;
      }
      .portal-focus__label {
        color: #1d4ed8;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: 4px;
      }
      .portal-focus__value {
        font-size: 18px;
        font-weight: 600;
        color: #0f172a;
      }
      .portal-tabs {
        display: inline-flex;
        border-radius: 999px;
        background: #e2e8f0;
        padding: 4px;
      }
      .portal-tabs__button {
        border: none;
        background: transparent;
        color: var(--portal-muted);
        padding: 8px 16px;
        border-radius: 999px;
        font-weight: 600;
        cursor: pointer;
      }
      .portal-tabs__button--active {
        background: var(--portal-card);
        color: var(--portal-text);
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th,
      td {
        padding: 14px 12px;
        border-bottom: 1px solid var(--portal-border);
        text-align: left;
        font-size: 14px;
      }
      .portal-table__note {
        display: block;
        font-size: 12px;
        color: var(--portal-muted);
        margin-top: 4px;
      }
      th {
        font-weight: 600;
        color: var(--portal-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      tbody tr:hover {
        background: rgba(15, 23, 42, 0.02);
      }
      .portal-table__status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        color: #059669;
      }
      .portal-table__status--success {
        color: #059669;
      }
      .portal-table__status--warning {
        color: #d97706;
      }
      .portal-table__status--danger {
        color: #dc2626;
      }
      .portal-table__status--muted {
        color: var(--portal-muted);
      }
      .portal-table__status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: currentColor;
      }
      .portal-retry {
        border: 1px solid var(--portal-border);
        background: transparent;
        color: var(--portal-text);
        padding: 8px 16px;
        border-radius: 12px;
        cursor: pointer;
        font-weight: 600;
      }
      .portal-empty {
        padding: 20px;
        text-align: center;
        color: var(--portal-muted);
        border: 1px dashed var(--portal-border);
        border-radius: 16px;
        margin-top: 16px;
      }
      .portal-empty--hidden {
        display: none;
      }
      .portal-skeleton {
        display: grid;
        gap: 12px;
        margin-top: 16px;
      }
      .portal-tag {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 13px;
        background: rgba(37, 99, 235, 0.12);
        color: #1d4ed8;
        font-weight: 600;
      }
      .portal-skeleton__row {
        height: 48px;
        border-radius: 10px;
        background: linear-gradient(90deg, #e2e8f0, #f8fafc, #e2e8f0);
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
        margin-bottom: 12px;
      }
      .portal-skeleton--hidden {
        display: none;
      }
      @keyframes shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }
      .portal__preloader,
      .portal__error {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(244, 246, 251, 0.92);
        z-index: 20;
        padding: 16px;
      }
      .portal__preloader-card,
      .portal__error-card {
        background: var(--portal-card);
        border-radius: 24px;
        padding: 32px;
        text-align: center;
        border: 1px solid var(--portal-border);
        box-shadow: 0 30px 70px rgba(15, 23, 42, 0.15);
        color: var(--portal-text);
      }
      .portal__preloader-title,
      .portal__error-title {
        font-size: 22px;
        font-weight: 700;
        margin-bottom: 12px;
      }
      .portal__preloader-text,
      .portal__error-text {
        color: var(--portal-muted);
        margin-bottom: 20px;
      }
      .portal__error--hidden,
      .portal__preloader--hidden {
        display: none;
      }
      .portal__button {
        border: none;
        background: var(--portal-accent);
        color: #fff;
        padding: 12px 24px;
        border-radius: 14px;
        cursor: pointer;
        font-weight: 600;
        box-shadow: 0 12px 30px rgba(37, 99, 235, 0.25);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      .portal__button:hover {
        transform: translateY(-1px);
        box-shadow: 0 18px 34px rgba(37, 99, 235, 0.2);
      }
      .portal-export {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      .portal-export__button {
        border: 1px solid var(--portal-border);
        background: var(--portal-card);
        color: var(--portal-text);
        border-radius: 14px;
        padding: 12px 18px;
        font-weight: 600;
        cursor: pointer;
        flex: 1 1 200px;
        text-align: center;
      }
      .portal-export__button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .portal-table-wrapper {
        margin-top: 16px;
        overflow-x: auto;
      }
      @media (max-width: 768px) {
        .portal__content {
          padding: 20px 12px 32px;
        }
        .portal-section {
          padding: 18px;
          border-radius: 18px;
        }
        .portal-metrics {
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        }
        .portal-metric__value {
          font-size: 20px;
        }
        .portal-focus {
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        }
        th,
        td {
          padding: 12px 8px;
        }
        .portal-tabs__button {
          padding: 6px 10px;
        }
        .portal-section__title {
          font-size: 18px;
        }
        .portal-export__button {
          flex: 1 1 100%;
        }
      }
      @media (max-width: 520px) {
        .portal-tabs {
          flex-wrap: wrap;
          width: 100%;
        }
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
                <button class="portal-tabs__button" data-period-button="all">Всё время</button>
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
            <div class="portal-metric" data-metric="messages">
              <div class="portal-metric__label">Сообщения</div>
              <div class="portal-metric__value" data-metric-value>—</div>
            </div>
            <div class="portal-metric" data-metric="cpa">
              <div class="portal-metric__label">CPA</div>
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
          <div class="portal-focus">
            <div class="portal-focus__item">
              <div class="portal-focus__label">Целевая метрика</div>
              <div class="portal-focus__value" data-focus-target>—</div>
            </div>
            <div class="portal-focus__item">
              <div class="portal-focus__label">CPA</div>
              <div class="portal-focus__value" data-focus-cpa>—</div>
            </div>
            <div class="portal-focus__item">
              <div class="portal-focus__label">CPL</div>
              <div class="portal-focus__value" data-focus-cpl>—</div>
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
                  <th>Контакт</th>
                  <th>Дата</th>
                  <th>Кампания</th>
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
                  <th>Целевая метрика</th>
                  <th>CPA</th>
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
                  <th>Дата оплаты</th>
                  <th>Статус</th>
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
        <section class="portal-section" data-section="export">
          <div class="portal-section__header">
            <div>
              <div class="portal-section__title">Экспорт данных</div>
              <div class="portal-section__subtitle">Скачайте лиды, кампании или сводку по выбранному периоду.</div>
            </div>
          </div>
          <div class="portal-export">
            <button class="portal-export__button" type="button" data-export-leads>
              💬 Лиды (CSV)
            </button>
            <button class="portal-export__button" type="button" data-export-campaigns>
              📈 Кампании (CSV)
            </button>
            <button class="portal-export__button" type="button" data-export-summary>
              📦 Сводка (JSON)
            </button>
          </div>
        </section>
      </div>
    </div>
    <script>
${portalScript}
    </script>
  </body>
</html>`;
};

const renderPortalPage = async (context: RequestContext): Promise<Response> => {
  const projectId = context.state.params.projectId;
  if (!projectId) {
    return badRequest("Project ID is required");
  }
  try {
    await requireProjectRecord(context.kv, projectId);
    return htmlResponse(renderPortalHtml(projectId));
  } catch (error) {
    if (error instanceof EntityNotFoundError) {
      return notFound(error.message);
    }
    throw error;
  }
};

export const registerPortalRoutes = (router: Router): void => {
  router.on("GET", "/portal/:projectId", renderPortalPage);
  router.on("GET", "/p/:projectId", renderPortalPage);

  router.on("GET", "/api/projects/:projectId/summary", async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    const url = new URL(context.request.url);
    const periodKey = url.searchParams.get("period") ?? "today";
    try {
      const bundle = await loadProjectBundle(context.kv, context.r2, projectId);
      let summaryEntry: import("../domain/meta-cache").MetaCacheEntry<import("../domain/meta-summary").MetaSummaryPayload> | null =
        null;
      try {
        const summaryResult = await loadProjectSummary(context.kv, projectId, periodKey);
        summaryEntry = summaryResult.entry;
      } catch (error) {
        if (error instanceof EntityNotFoundError || error instanceof DataValidationError) {
          console.warn(`[portal] Meta summary fallback for ${projectId}: ${(error as Error).message}`);
        } else {
          throw error;
        }
      }
      let campaignsDoc = bundle.campaigns;
      if (!campaignsDoc || campaignsDoc.periodKey !== periodKey || campaignsDoc.campaigns.length === 0) {
        try {
          campaignsDoc = await syncProjectCampaignDocument(context.kv, context.r2, projectId, periodKey, {
            projectRecord: bundle.project,
          });
        } catch (error) {
          if (error instanceof EntityNotFoundError || error instanceof DataValidationError) {
            console.warn(`[portal] Meta campaigns fallback for ${projectId}: ${(error as Error).message}`);
          } else {
            throw error;
          }
        }
      }
      return jsonOk(buildSummaryPayload(bundle, periodKey, { summaryEntry, campaigns: campaignsDoc }));
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
  router.on("OPTIONS", "/api/projects/:projectId/summary", (context) => preflight(context.request));

  router.on("GET", "/api/projects/:projectId/leads", async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    const url = new URL(context.request.url);
    const periodKey = url.searchParams.get("period") ?? "today";
    return respondWithProjectLeads(context, projectId, periodKey);
  });
  router.on("OPTIONS", "/api/projects/:projectId/leads", (context) => preflight(context.request));

  router.on("GET", "/api/projects/:projectId/leads/:period", async (context) => {
    const projectId = context.state.params.projectId;
    const periodKey = context.state.params.period ?? "today";
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    return respondWithProjectLeads(context, projectId, periodKey);
  });
  router.on("OPTIONS", "/api/projects/:projectId/leads/:period", (context) => preflight(context.request));

  router.on("POST", "/api/projects/:projectId/leads/sync", async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    const url = new URL(context.request.url);
    const periodKey = url.searchParams.get("period") ?? "today";
    return respondWithProjectLeads(context, projectId, periodKey, { refresh: true });
  });
  router.on("OPTIONS", "/api/projects/:projectId/leads/sync", (context) => preflight(context.request));

  router.on("POST", "/api/projects/:projectId/leads/:period/refresh", async (context) => {
    const projectId = context.state.params.projectId;
    const periodKey = context.state.params.period ?? "today";
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    return respondWithProjectLeads(context, projectId, periodKey, { refresh: true });
  });
  router.on("OPTIONS", "/api/projects/:projectId/leads/:period/refresh", (context) => preflight(context.request));

  router.on("GET", "/api/projects/:projectId/campaigns", async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    const url = new URL(context.request.url);
    const periodKey = url.searchParams.get("period") ?? "today";
    try {
      const bundle = await loadProjectBundle(context.kv, context.r2, projectId);
      let campaignsDoc = bundle.campaigns;
      let campaignStatuses: CampaignStatus[] | null = null;
      if (!campaignsDoc || campaignsDoc.periodKey !== periodKey || campaignsDoc.campaigns.length === 0) {
        try {
          campaignsDoc = await syncProjectCampaignDocument(context.kv, context.r2, projectId, periodKey, {
            projectRecord: bundle.project,
          });
        } catch (error) {
          if (error instanceof EntityNotFoundError || error instanceof DataValidationError) {
            console.warn(`[portal] Meta campaigns fallback for ${projectId}: ${(error as Error).message}`);
          } else {
            throw error;
          }
        }
      }
      try {
        const statusResult = await loadProjectCampaignStatuses(context.kv, projectId);
        campaignStatuses = statusResult.entry.payload.campaigns;
      } catch (error) {
        if (error instanceof EntityNotFoundError || error instanceof DataValidationError) {
          console.warn(`[portal] Campaign status fallback for ${projectId}: ${(error as Error).message}`);
        } else {
          throw error;
        }
      }
      return jsonOk(buildCampaignsPayload(bundle, periodKey, campaignsDoc, campaignStatuses));
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
  router.on("OPTIONS", "/api/projects/:projectId/campaigns", (context) => preflight(context.request));

  router.on("GET", "/api/projects/:projectId/payments", async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    try {
      const bundle = await loadProjectBundle(context.kv, context.r2, projectId);
      return jsonOk(buildPaymentsPayload(bundle));
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
  router.on("OPTIONS", "/api/projects/:projectId/payments", (context) => preflight(context.request));
};
