import { KV_KEYS, KV_PREFIXES } from "../config/kv";
import { resolveTelegramToken } from "../config/telegram";
import {
  createDefaultProjectSettings,
  ensureProjectSettings,
  parseProjectSettings,
  upsertProjectSettings,
} from "../domain/project-settings";
import { getProject, parseProject } from "../domain/projects";
import { getMetaToken, parseMetaToken, upsertMetaToken, deleteMetaToken } from "../domain/meta-tokens";
import { putFbAuthRecord, type FbAdAccount, type FbAuthRecord } from "../domain/spec/fb-auth";
import { getBillingRecord, putBillingRecord } from "../domain/spec/billing";
import {
  appendPaymentRecord,
  getPaymentsHistoryDocument,
  type PaymentRecord,
} from "../domain/spec/payments-history";
import { requireProjectRecord, putProjectRecord } from "../domain/spec/project";
import { getPortalSyncState, deletePortalSyncState, type PortalSyncState } from "../domain/portal-sync";
import { DataValidationError, EntityConflictError, EntityNotFoundError } from "../errors";
import { jsonResponse } from "../http/responses";
import type { KvClient } from "../infra/kv";
import type { Router } from "../worker/router";
import type { TargetBotEnv } from "../worker/types";
import {
  listAdminProjectSummaries,
  loadAdminProjectDetail,
  buildAdminAnalyticsOverview,
  buildAdminFinanceOverview,
  listAdminUsers,
  listAdminProjectLeads,
} from "../services/admin-dashboard";
import { getWebhookInfo, setWebhook } from "../services/telegram";
import { deleteProjectCascade } from "../services/project-lifecycle";
import { PORTAL_PERIOD_KEYS, syncPortalMetrics, type PortalSyncResult } from "../services/portal-sync";
import { buildAdminClientScript } from "./admin-client";

const ADMIN_CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
};

const withCors = (headers: HeadersInit = {}): HeadersInit => ({
  ...ADMIN_CORS_HEADERS,
  ...(headers as Record<string, string>),
});

const optionsResponse = (): Response =>
  new Response(null, {
    status: 204,
    headers: withCors({ "cache-control": "no-store" }),
  });

const htmlResponse = (body: string): Response =>
  new Response(body, {
    status: 200,
    headers: withCors({
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    }),
  });

const jsonOk = (data: unknown, init?: ResponseInit): Response =>
  jsonResponse(
    { ok: true, data },
    {
      ...init,
      headers: withCors({ "cache-control": "no-store", ...(init?.headers ?? {}) }),
    },
  );

const jsonError = (status: number, message: string): Response =>
  jsonResponse(
    { ok: false, error: message },
    {
      status,
      headers: withCors({ "cache-control": "no-store" }),
    },
  );

const badRequest = (message: string): Response => jsonError(400, message);
const notFound = (message: string): Response => jsonError(404, message);
const conflict = (message: string): Response => jsonError(409, message);
const unprocessable = (message: string): Response => jsonError(422, message);
const created = (body: unknown): Response => jsonOk(body, { status: 201 });
const DEFAULT_PROJECT_CURRENCY = "USD";
const DEFAULT_PROJECT_TIMEZONE = "Asia/Tashkent";
const DEFAULT_PROJECT_KPI = { mode: "auto", type: "LEAD", label: "Лиды" } as const;

const resolvePortalUrl = (env: TargetBotEnv, projectId: string): string => {
  if (env.WORKER_URL) {
    return `https://${env.WORKER_URL}/p/${projectId}`;
  }
  return `/p/${projectId}`;
};

const SYNC_KEY_LABELS: Record<string, string> = {
  today: "сегодня",
  yesterday: "вчера",
  week: "неделя",
  month: "месяц",
  max: "максимум",
  leads: "лиды",
};

const describePortalSyncResult = (result: PortalSyncResult): string | null => {
  const failed = result.periods.filter((entry) => !entry.ok);
  if (failed.length === 0) {
    return null;
  }
  const successful = result.periods.length - failed.length;
  const issues = failed
    .map((entry) => `${SYNC_KEY_LABELS[entry.periodKey] ?? entry.periodKey}: ${entry.error ?? "ошибка"}`)
    .join(", ");
  return `Обновлено ${successful}/${result.periods.length}. Проблемы: ${issues}`;
};

interface PortalStatusPayload {
  projectId: string;
  portalUrl: string;
  enabled: boolean;
  sync: PortalSyncState;
}

const loadPortalStatus = async (kv: KvClient, projectId: string): Promise<PortalStatusPayload> => {
  const [project, settings, sync] = await Promise.all([
    requireProjectRecord(kv, projectId),
    ensureProjectSettings(kv, projectId),
    getPortalSyncState(kv, projectId),
  ]);
  return {
    projectId,
    portalUrl: project.portalUrl,
    enabled: settings.portalEnabled,
    sync,
  } satisfies PortalStatusPayload;
};

const buildStoredProjectPayload = (
  body: Required<Pick<CreateProjectBody, "id" | "name" | "ownerTelegramId">> & { adsAccountId?: string | null },
  env: TargetBotEnv,
): Record<string, unknown> => {
  const now = new Date().toISOString();
  return {
    id: body.id,
    name: body.name,
    adsAccountId: body.adsAccountId ?? null,
    adAccountId: body.adsAccountId ?? null,
    ownerTelegramId: body.ownerTelegramId,
    ownerId: body.ownerTelegramId,
    createdAt: now,
    updatedAt: now,
    owner_id: body.ownerTelegramId,
    ad_account_id: body.adsAccountId ?? null,
    chat_id: null,
    chatId: null,
    portal_url: resolvePortalUrl(env, body.id),
    portalUrl: resolvePortalUrl(env, body.id),
    settings: {
      currency: DEFAULT_PROJECT_CURRENCY,
      timezone: env.DEFAULT_TZ ?? DEFAULT_PROJECT_TIMEZONE,
      kpi: { ...DEFAULT_PROJECT_KPI },
    },
  };
};
const renderAdminHtml = (workerUrl: string | null): string => {
  const script = buildAdminClientScript(workerUrl);
  return `<!DOCTYPE html>
  <html lang="ru">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>TargetBot Admin</title>
      <style>
        :root {
          color-scheme: dark;
          --bg: #05070d;
          --surface: #0d111a;
          --panel: #141a26;
          --border: rgba(255, 255, 255, 0.08);
          --muted: #9aa6bf;
          --text: #f8f9ff;
          --accent: #4cf1c0;
          --danger: #ff6b6b;
        }
        * {
          box-sizing: border-box;
        }
        body {
          margin: 0;
          min-height: 100vh;
          font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: var(--bg);
          color: var(--text);
        }
        a {
          color: var(--accent);
        }
        button {
          font: inherit;
        }
        .admin-shell {
          display: flex;
          min-height: 100vh;
        }
        .admin-shell__sidebar {
          width: 260px;
          background: var(--surface);
          border-right: 1px solid var(--border);
          padding: 24px 20px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .admin-logo {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .admin-logo__title {
          font-weight: 600;
          letter-spacing: 0.04em;
        }
        .admin-logo__subtitle {
          font-size: 0.85rem;
          color: var(--muted);
        }
        .admin-nav {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .admin-nav__item {
          border: 1px solid transparent;
          border-radius: 10px;
          padding: 10px 14px;
          background: transparent;
          color: inherit;
          text-align: left;
          cursor: pointer;
          transition: background 0.2s, border 0.2s;
        }
        .admin-nav__item:hover,
        .admin-nav__item--active {
          background: rgba(76, 241, 192, 0.15);
          border-color: rgba(76, 241, 192, 0.35);
        }
        .admin-sidebar__actions {
          margin-top: auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .admin-shell__content {
          flex: 1;
          padding: 32px clamp(16px, 4vw, 48px);
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .admin-header {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-end;
        }
        .admin-header h1 {
          margin: 4px 0 0;
          font-size: clamp(1.4rem, 2vw, 1.8rem);
        }
        .admin-status {
          margin: 0;
          color: var(--muted);
        }
        .admin-section {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: clamp(16px, 3vw, 28px);
        }
        .admin-section + .admin-section {
          margin-top: 16px;
        }
        .admin-panel__header {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
        }
        .admin-panel__header h2,
        .admin-panel__header h3 {
          margin: 0;
        }
        .admin-btn {
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 8px 14px;
          background: transparent;
          color: inherit;
          cursor: pointer;
          transition: border 0.2s, transform 0.2s;
        }
        .admin-btn:hover:not(:disabled) {
          border-color: var(--accent);
          transform: translateY(-1px);
        }
        .admin-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .admin-btn--ghost {
          border-color: rgba(255, 255, 255, 0.2);
        }
        .admin-btn--danger {
          border-color: rgba(255, 107, 107, 0.6);
          color: var(--danger);
        }
        .muted {
          color: var(--muted);
        }
        .table-wrapper {
          overflow-x: auto;
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          margin: 12px 0 0;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 520px;
        }
        th,
        td {
          padding: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          text-align: left;
        }
        th {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--muted);
        }
        .form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 14px 18px;
          margin-top: 16px;
        }
        .form-grid label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 0.85rem;
          color: var(--muted);
        }
        .form-grid input,
        .form-grid select,
        .form-grid textarea {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          padding: 9px 11px;
          color: inherit;
          font: inherit;
        }
        .grid-full {
          grid-column: 1 / -1;
        }
        .portal-panel {
          margin-top: 24px;
          border: 1px dashed rgba(255, 255, 255, 0.2);
          border-radius: 16px;
          padding: 18px;
          background: rgba(255, 255, 255, 0.02);
        }
        .portal-panel--disabled {
          opacity: 0.7;
        }
        .portal-status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px 18px;
          margin-top: 12px;
        }
        .portal-status-grid strong {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--muted);
        }
        .portal-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 16px;
        }
        .projects-grid {
          display: grid;
          grid-template-columns: minmax(320px, 1fr) minmax(360px, 2fr);
          gap: 24px;
          margin-top: 24px;
        }
        [data-project-detail][hidden] {
          display: none;
        }
        hr {
          border: none;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          margin: 28px 0;
        }
        ul {
          padding-left: 18px;
        }
        @media (max-width: 960px) {
          .admin-shell {
            flex-direction: column;
          }
          .admin-shell__sidebar {
            width: 100%;
            border-right: none;
            border-bottom: 1px solid var(--border);
          }
          .admin-sidebar__actions {
            flex-direction: row;
            flex-wrap: wrap;
          }
          .projects-grid {
            grid-template-columns: 1fr;
          }
          table {
            min-width: 100%;
          }
        }
      </style>
    </head>
    <body>
      <div class="admin-shell" data-app>
        <aside class="admin-shell__sidebar">
          <div class="admin-logo">
            <span class="admin-logo__title">TargetBot</span>
            <span class="admin-logo__subtitle">Панель администратора</span>
          </div>
          <nav class="admin-nav">
            <button class="admin-nav__item admin-nav__item--active" data-nav="projects">Проекты</button>
            <button class="admin-nav__item" data-nav="analytics">Аналитика</button>
            <button class="admin-nav__item" data-nav="finance">Финансы</button>
            <button class="admin-nav__item" data-nav="users">Пользователи</button>
            <button class="admin-nav__item" data-nav="webhooks">Webhook</button>
            <button class="admin-nav__item" data-nav="settings">Настройки</button>
          </nav>
            <div class="admin-sidebar__actions">
              <button class="admin-btn admin-btn--ghost" data-action="refresh">Обновить</button>
            </div>
          </aside>
        <main class="admin-shell__content">
          <header class="admin-header">
            <div>
              <p class="admin-status" data-status>Готово</p>
              <h1 data-view-title>Проекты</h1>
            </div>
            <div class="admin-header__actions">
              <button class="admin-btn admin-btn--ghost" data-action="refresh">↻ Обновить</button>
            </div>
          </header>
          <section class="admin-section" data-section="projects">
            <div class="admin-panel__header">
              <div>
                <h2>Проекты</h2>
                <p class="muted">Создавайте и управляйте проектами TargetBot</p>
              </div>
            </div>
            <form class="form-grid" data-project-create>
              <label>ID проекта<input name="projectId" placeholder="proj_example" required /></label>
              <label>Название<input name="projectName" placeholder="Название" required /></label>
              <label>ID владельца<input type="number" name="ownerTelegramId" placeholder="123456" required /></label>
              <label>Ad account<input name="adsAccountId" placeholder="act_123" /></label>
              <button class="admin-btn" type="submit">Создать проект</button>
            </form>
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Название</th>
                    <th>Владелец</th>
                    <th>Кабинет</th>
                    <th>Портал</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody data-projects-body></tbody>
              </table>
            </div>
            <div class="projects-grid">
              <div class="project-detail" data-project-detail hidden>
                <div class="admin-panel__header">
                  <div>
                    <h3 data-project-detail-title>Выберите проект</h3>
                    <p class="muted" data-project-detail-meta>Метрики, лиды и оплаты появятся после выбора</p>
                  </div>
                </div>
                <div class="portal-panel portal-panel--disabled" data-portal-panel>
                  <div>
                    <p class="muted" data-portal-description>Выберите проект, чтобы управлять порталом.</p>
                    <a data-portal-link href="#" target="_blank" rel="noopener noreferrer">—</a>
                  </div>
                  <div class="portal-status-grid">
                    <div><strong>Автообновление</strong><div data-portal-auto>—</div></div>
                    <div><strong>Последний запуск</strong><div data-portal-run>—</div></div>
                    <div><strong>Успешно</strong><div data-portal-success>—</div></div>
                    <div><strong>Ошибка</strong><div data-portal-error>—</div></div>
                  </div>
                  <div class="portal-actions" data-portal-actions>
                    <button class="admin-btn" type="button" data-portal-create>Создать портал</button>
                    <button class="admin-btn" type="button" data-portal-open>Открыть</button>
                    <button class="admin-btn" type="button" data-portal-toggle>Остановить автообновление</button>
                    <button class="admin-btn" type="button" data-portal-sync>Синхронизировать</button>
                    <button class="admin-btn admin-btn--danger" type="button" data-portal-delete>Удалить</button>
                  </div>
                </div>
                <h4>Лиды</h4>
                <div class="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Имя</th>
                        <th>Контакт</th>
                        <th>Статус</th>
                        <th>Дата</th>
                        <th>Кампания</th>
                      </tr>
                    </thead>
                    <tbody data-leads-body></tbody>
                  </table>
                </div>
                <h4>Кампании</h4>
                <div class="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Название</th>
                        <th>Цель</th>
                        <th>Статус</th>
                        <th>KPI</th>
                        <th>Расход</th>
                        <th>Результат</th>
                        <th>Клики</th>
                      </tr>
                    </thead>
                    <tbody data-campaigns-body></tbody>
                  </table>
                </div>
                <h4>Оплаты</h4>
                <p class="muted" data-payments-subtitle>—</p>
                <div class="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Период</th>
                        <th>Сумма</th>
                        <th>Статус</th>
                        <th>Оплачено</th>
                        <th>Комментарий</th>
                      </tr>
                    </thead>
                    <tbody data-payments-body></tbody>
                  </table>
                </div>
                <form class="form-grid" data-payment-form>
                  <label>Сумма<input name="amount" type="number" min="0" step="0.01" required /></label>
                  <label>Валюта<input name="currency" value="USD" required /></label>
                  <label>Период с<input name="periodFrom" type="date" required /></label>
                  <label>Период до<input name="periodTo" type="date" required /></label>
                  <label>Дата оплаты<input name="paidAt" type="datetime-local" /></label>
                  <label>Статус<select name="status"><option value="planned">Запланирован</option><option value="paid">Оплачен</option><option value="cancelled">Отменён</option></select></label>
                  <label class="grid-full">Комментарий<textarea name="comment" rows="2"></textarea></label>
                  <button class="admin-btn" type="submit">Добавить платёж</button>
                </form>
                <hr />
                <form class="form-grid" data-settings-form>
                  <label>Режим KPI<select name="kpiMode"><option value="auto">Авто</option><option value="manual">Ручной</option></select></label>
                  <label>Тип KPI<select name="kpiType"><option value="LEAD">Лиды</option><option value="MESSAGE">Сообщения</option><option value="CLICK">Клики</option><option value="VIEW">Просмотры</option><option value="PURCHASE">Покупки</option></select></label>
                  <label>Название KPI<input name="kpiLabel" /></label>
                  <label>Автоотчёты<select name="autoreportsSendTo"><option value="chat">В чат</option><option value="admin">Админу</option><option value="both">Оба</option></select><span><input type="checkbox" name="autoreportsEnabled" /> Включить</span></label>
                  <label>Время отчёта<input type="time" name="autoreportsTime" value="10:00" /></label>
                  <button class="admin-btn" type="submit">Сохранить настройки</button>
                </form>
              </div>
            </div>
          </section>
          <section class="admin-section" data-section="analytics" hidden>
            <div class="admin-panel__header">
              <div>
                <h2>Аналитика</h2>
                <p class="muted" data-analytics-totals></p>
              </div>
            </div>
            <h4>ТОП проектов</h4>
            <ul data-analytics-projects></ul>
            <h4>ТОП кампаний</h4>
            <ul data-analytics-campaigns></ul>
          </section>
          <section class="admin-section" data-section="finance" hidden>
            <div class="admin-panel__header">
              <div>
                <h2>Финансы</h2>
                <p class="muted" data-finance-totals></p>
              </div>
            </div>
            <ul data-finance-projects></ul>
          </section>
          <section class="admin-section" data-section="users" hidden>
            <div class="admin-panel__header">
              <h2>Пользователи</h2>
            </div>
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Проекты</th>
                    <th>Язык</th>
                    <th>Таймзона</th>
                    <th>Список</th>
                  </tr>
                </thead>
                <tbody data-users-body></tbody>
              </table>
            </div>
          </section>
          <section class="admin-section" data-section="webhooks" hidden>
            <div class="admin-panel__header">
              <div>
                <h2>Telegram Webhook</h2>
                <p class="muted" data-webhook-info></p>
              </div>
              <button class="admin-btn" data-webhook-reset>Пересоздать webhook</button>
            </div>
          </section>
          <section class="admin-section" data-section="settings" hidden>
            <div class="admin-panel__header">
              <div>
                <h2>Настройки</h2>
                <p class="muted" data-settings-info></p>
              </div>
            </div>
          </section>
        </main>
      </div>
      <script>${script}</script>
    </body>
  </html>`;
};
interface CreateProjectBody {
  id?: string;
  name?: string;
  adsAccountId?: string | null;
  ownerTelegramId?: number;
}

interface UpdateProjectBody {
  name?: string;
  adsAccountId?: string | null;
  ownerTelegramId?: number;
}

interface UpdateSettingsBody extends Record<string, unknown> {}

interface UpsertMetaTokenBody {
  accessToken?: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
}

interface CreatePaymentBody {
  amount?: number;
  currency?: string;
  periodFrom?: string;
  periodTo?: string;
  paidAt?: string | null;
  status?: PaymentRecord["status"];
  comment?: string | null;
}

interface UpdateFbAuthBody {
  userId?: number;
  accessToken?: string;
  expiresAt?: string;
  accounts?: FbAdAccount[];
  facebookUserId?: string | null;
  facebookName?: string | null;
}

const registerAdminRoute = (
  router: Router,
  method: string,
  paths: string[],
  handler: (context: Parameters<Parameters<Router["on"]>[2]>[0]) => Promise<Response> | Response,
): void => {
  for (const pathname of paths) {
    router.on("OPTIONS", pathname, () => optionsResponse());
    router.on(method, pathname, async (context) => handler(context));
  }
};

const parsePaymentPayload = (body: CreatePaymentBody, projectId: string): PaymentRecord => {
  if (typeof body.amount !== "number" || body.amount <= 0) {
    throw new DataValidationError("amount must be a positive number");
  }
  if (!body.currency) {
    throw new DataValidationError("currency is required");
  }
  if (!body.periodFrom || !body.periodTo) {
    throw new DataValidationError("periodFrom and periodTo are required");
  }
  const status = body.status ?? "planned";
  if (!["planned", "paid", "cancelled"].includes(status)) {
    throw new DataValidationError("status must be planned, paid or cancelled");
  }
  return {
    id: `pay_${projectId}_${Date.now()}`,
    amount: body.amount,
    currency: body.currency,
    periodFrom: body.periodFrom,
    periodTo: body.periodTo,
    paidAt: body.paidAt ?? null,
    status,
    comment: body.comment ?? null,
  } satisfies PaymentRecord;
};

const clearMetaCache = async (
  context: Parameters<Parameters<Router["on"]>[2]>[0],
  projectId: string,
): Promise<void> => {
  const prefix = `${KV_PREFIXES.metaCache}${projectId}:`;
  let cursor: string | undefined;
  do {
    const { keys, cursor: next } = await context.kv.list(prefix, { cursor });
    for (const key of keys) {
      await context.kv.delete(key);
    }
    cursor = next;
  } while (cursor);
};

const buildWebhookUrl = (env: TargetBotEnv): string | null => {
  if (!env.WORKER_URL || !env.TELEGRAM_SECRET) {
    return null;
  }
  return `https://${env.WORKER_URL}/tg-webhook?secret=${env.TELEGRAM_SECRET}`;
};
export const registerAdminRoutes = (router: Router): void => {
  router.on("GET", "/admin", (context) => htmlResponse(renderAdminHtml(context.env.WORKER_URL ?? null)));
  router.on("GET", "/admin/:path*", (context) => htmlResponse(renderAdminHtml(context.env.WORKER_URL ?? null)));

  registerAdminRoute(router, "GET", ["/api/admin/ping"], async () => jsonOk({ status: "ok" }));

  registerAdminRoute(router, "GET", ["/api/admin/projects", "/api/projects"], async (context) => {
    const projects = await listAdminProjectSummaries(context.kv, context.r2);
    return jsonOk({ projects });
  });

  registerAdminRoute(router, "GET", ["/api/admin/projects/:projectId"], async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    try {
      const project = await loadAdminProjectDetail(context.kv, context.r2, projectId);
      return jsonOk({ project });
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        return notFound(error.message);
      }
      throw error;
    }
  });

  registerAdminRoute(router, "GET", ["/api/admin/projects/:projectId/leads"], async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    const leads = await listAdminProjectLeads(context.r2, projectId);
    return jsonOk({ leads: leads.leads, stats: leads.stats, syncedAt: leads.syncedAt });
  });

  registerAdminRoute(router, "GET", ["/api/admin/projects/:projectId/payments"], async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    const billing = await getBillingRecord(context.kv, projectId);
    const payments = await getPaymentsHistoryDocument(context.r2, projectId);
    return jsonOk({ billing, payments: payments?.payments ?? [] });
  });

  registerAdminRoute(router, "POST", ["/api/admin/projects/:projectId/payments/add"], async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    let body: CreatePaymentBody;
    try {
      body = await context.json<CreatePaymentBody>();
    } catch {
      return badRequest("Invalid JSON body");
    }
    try {
      const record = parsePaymentPayload(body, projectId);
      const payments = await appendPaymentRecord(context.r2, projectId, record);
      if (body.periodTo) {
        const billing = (await getBillingRecord(context.kv, projectId)) ?? {
          tariff: body.amount ?? 0,
          currency: body.currency ?? "USD",
          nextPaymentDate: body.periodTo,
          autobilling: false,
        };
        billing.nextPaymentDate = body.periodTo;
        await putBillingRecord(context.kv, projectId, billing);
      }
      return jsonOk({ payments });
    } catch (error) {
      if (error instanceof DataValidationError) {
        return unprocessable(error.message);
      }
      throw error;
    }
  });

  registerAdminRoute(router, "POST", ["/api/admin/projects/:projectId/refresh"], async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    await clearMetaCache(context, projectId);
    return jsonOk({ ok: true });
  });

  registerAdminRoute(router, "POST", ["/api/admin/projects/:projectId/portal/create"], async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    try {
      let project = await requireProjectRecord(context.kv, projectId);
      if (!project.portalUrl) {
        const portalUrl = resolvePortalUrl(context.env, projectId);
        project = { ...project, portalUrl };
        await putProjectRecord(context.kv, project);
      }
      const settings = await ensureProjectSettings(context.kv, projectId);
      if (!settings.portalEnabled) {
        await upsertProjectSettings(context.kv, {
          ...settings,
          portalEnabled: true,
          updatedAt: new Date().toISOString(),
        });
      }
      let message = "Портал включён";
      try {
        const result = await syncPortalMetrics(context.kv, context.r2, projectId, { allowPartial: true });
        message = describePortalSyncResult(result);
      } catch (error) {
        message = `Портал включён, но не удалось обновить данные: ${(error as Error).message}`;
      }
      const portal = await loadPortalStatus(context.kv, projectId);
      return jsonOk({ portal, message });
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

  registerAdminRoute(router, "POST", ["/api/admin/projects/:projectId/portal/toggle"], async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    try {
      const project = await requireProjectRecord(context.kv, projectId);
      if (!project.portalUrl) {
        return unprocessable("Сначала создайте портал");
      }
      const settings = await ensureProjectSettings(context.kv, projectId);
      const nextValue = !settings.portalEnabled;
      await upsertProjectSettings(context.kv, {
        ...settings,
        portalEnabled: nextValue,
        updatedAt: new Date().toISOString(),
      });
      const portal = await loadPortalStatus(context.kv, projectId);
      return jsonOk({
        portal,
        message: nextValue ? "Автообновление портала включено." : "Автообновление портала остановлено.",
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

  registerAdminRoute(router, "POST", ["/api/admin/projects/:projectId/portal/sync"], async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    try {
      const project = await requireProjectRecord(context.kv, projectId);
      if (!project.portalUrl) {
        return unprocessable("Сначала создайте портал");
      }
      const result = await syncPortalMetrics(context.kv, context.r2, projectId, {
        allowPartial: true,
        periods: PORTAL_PERIOD_KEYS,
      });
      const portal = await loadPortalStatus(context.kv, projectId);
      return jsonOk({ portal, message: describePortalSyncResult(result) });
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

  registerAdminRoute(router, "DELETE", ["/api/admin/projects/:projectId/portal"], async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    try {
      const project = await requireProjectRecord(context.kv, projectId);
      if (!project.portalUrl) {
        const portal = await loadPortalStatus(context.kv, projectId);
        return jsonOk({ portal, message: "Портал уже удалён." });
      }
      await putProjectRecord(context.kv, { ...project, portalUrl: "" });
      const settings = await ensureProjectSettings(context.kv, projectId);
      if (settings.portalEnabled) {
        await upsertProjectSettings(context.kv, {
          ...settings,
          portalEnabled: false,
          updatedAt: new Date().toISOString(),
        });
      }
      await deletePortalSyncState(context.kv, projectId).catch(() => {});
      const portal = await loadPortalStatus(context.kv, projectId);
      return jsonOk({ portal, message: "Портал отключён и ссылка удалена." });
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

  registerAdminRoute(router, "GET", ["/api/admin/analytics", "/api/analytics"], async (context) => {
    const analytics = await buildAdminAnalyticsOverview(context.kv, context.r2);
    return jsonOk(analytics);
  });

  registerAdminRoute(router, "GET", ["/api/admin/finance", "/api/finance"], async (context) => {
    const finance = await buildAdminFinanceOverview(context.kv, context.r2);
    return jsonOk(finance);
  });

  registerAdminRoute(router, "GET", ["/api/admin/users", "/api/users"], async (context) => {
    const users = await listAdminUsers(context.kv);
    return jsonOk({ users });
  });

  registerAdminRoute(router, "POST", ["/api/admin/update-facebook-token"], async (context) => {
    let body: UpdateFbAuthBody;
    try {
      body = await context.json<UpdateFbAuthBody>();
    } catch {
      return badRequest("Invalid JSON body");
    }
    if (typeof body.userId !== "number" || !body.accessToken || !body.expiresAt) {
      return badRequest("userId, accessToken and expiresAt are required");
    }
    const record: FbAuthRecord = {
      userId: body.userId,
      accessToken: body.accessToken,
      expiresAt: body.expiresAt,
      adAccounts: body.accounts ?? [],
      facebookUserId: body.facebookUserId ?? null,
      facebookName: body.facebookName ?? null,
    };
    await putFbAuthRecord(context.kv, record);
    return jsonOk({ ok: true });
  });

  registerAdminRoute(router, "GET", ["/api/admin/webhook-status"], async (context) => {
    const token = resolveTelegramToken(context.env);
    if (!token) {
      return jsonError(500, "TELEGRAM_BOT_TOKEN is not configured");
    }
    const info = await getWebhookInfo(token);
    const expectedUrl = buildWebhookUrl(context.env);
    return jsonOk({ info, expectedUrl });
  });

  registerAdminRoute(router, "POST", ["/api/admin/webhook-reset"], async (context) => {
    const token = resolveTelegramToken(context.env);
    if (!token) {
      return jsonError(500, "TELEGRAM_BOT_TOKEN is not configured");
    }
    const url = buildWebhookUrl(context.env);
    if (!url) {
      return jsonError(500, "WORKER_URL или TELEGRAM_SECRET не настроены");
    }
    await setWebhook(token, url);
    return jsonOk({ ok: true, url });
  });
  registerAdminRoute(router, "POST", ["/api/admin/projects"], async (context) => {
    let body: CreateProjectBody;
    try {
      body = await context.json<CreateProjectBody>();
    } catch {
      return badRequest("Invalid JSON body");
    }

    if (!body.id || !body.name || typeof body.ownerTelegramId !== "number") {
      return badRequest("Fields id, name and ownerTelegramId are required");
    }

    try {
      const existing = await context.kv.getJson<Record<string, unknown>>(KV_KEYS.project(body.id));
      if (existing) {
        throw new EntityConflictError("project", body.id);
      }
    } catch (error) {
      if (error instanceof EntityConflictError) {
        return conflict(error.message);
      }
    }

    try {
      const storedRecord = buildStoredProjectPayload(
        {
          id: body.id,
          name: body.name,
          ownerTelegramId: body.ownerTelegramId,
          adsAccountId: body.adsAccountId ?? null,
        },
        context.env,
      );

      await context.kv.putJson(KV_KEYS.project(body.id), storedRecord);

      const project = parseProject(storedRecord);
      const settings = createDefaultProjectSettings(project.id);
      await upsertProjectSettings(context.kv, settings);

      return created({ project, settings });
    } catch (error) {
      if (error instanceof DataValidationError) {
        return unprocessable(error.message);
      }
      throw error;
    }
  });

  registerAdminRoute(router, "PUT", ["/api/admin/projects/:projectId"], async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }

    let body: UpdateProjectBody;
    try {
      body = await context.json<UpdateProjectBody>();
    } catch {
      return badRequest("Invalid JSON body");
    }

    try {
      const rawRecord = await context.kv.getJson<Record<string, unknown>>(KV_KEYS.project(projectId));
      if (!rawRecord) {
        throw new EntityNotFoundError("project", projectId);
      }
      const current = parseProject(rawRecord);
      const nextOwnerId = typeof body.ownerTelegramId === "number" ? body.ownerTelegramId : current.ownerTelegramId;
      const nextAdsAccountId = body.adsAccountId ?? current.adsAccountId ?? null;
      const nextName = body.name ?? current.name;
      const merged = {
        ...rawRecord,
        name: nextName,
        adsAccountId: nextAdsAccountId,
        ownerTelegramId: nextOwnerId,
        updatedAt: new Date().toISOString(),
        owner_id: nextOwnerId,
        ad_account_id: nextAdsAccountId,
      } satisfies Record<string, unknown>;
      await context.kv.putJson(KV_KEYS.project(projectId), merged);
      const updated = parseProject(merged);
      return jsonResponse({ project: updated });
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

  registerAdminRoute(router, "DELETE", ["/api/admin/projects/:projectId"], async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }
    try {
      await deleteProjectCascade(context.kv, context.r2, projectId);
      return jsonOk({ ok: true });
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        return notFound(error.message);
      }
      throw error;
    }
  });

  registerAdminRoute(router, "GET", ["/api/admin/projects/:projectId/settings"], async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }

    try {
      await getProject(context.kv, projectId);
      const settings = await ensureProjectSettings(context.kv, projectId);
      return jsonResponse({ settings });
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

  registerAdminRoute(router, "PUT", ["/api/admin/projects/:projectId/settings"], async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }

    let body: UpdateSettingsBody;
    try {
      body = await context.json<UpdateSettingsBody>();
    } catch {
      return badRequest("Invalid JSON body");
    }

    try {
      await getProject(context.kv, projectId);
      const existing = await ensureProjectSettings(context.kv, projectId);
      const merged = {
        ...existing,
        ...body,
        billing: {
          ...existing.billing,
          ...(body.billing as Record<string, unknown> | undefined),
        },
        kpi: {
          ...existing.kpi,
          ...(body.kpi as Record<string, unknown> | undefined),
        },
        reports: {
          ...existing.reports,
          ...(body.reports as Record<string, unknown> | undefined),
        },
        meta: {
          ...existing.meta,
          ...(body.meta as Record<string, unknown> | undefined),
        },
        updatedAt: new Date().toISOString(),
        projectId,
      } satisfies Record<string, unknown>;
      const validated = parseProjectSettings(merged, projectId);
      await upsertProjectSettings(context.kv, validated);
      return jsonResponse({ settings: validated });
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

  registerAdminRoute(router, "GET", ["/api/admin/meta-tokens/:facebookUserId"], async (context) => {
    const facebookUserId = context.state.params.facebookUserId;
    if (!facebookUserId) {
      return badRequest("facebookUserId is required");
    }

    try {
      const token = await getMetaToken(context.kv, facebookUserId);
      return jsonResponse({ token });
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

  registerAdminRoute(router, "PUT", ["/api/admin/meta-tokens/:facebookUserId"], async (context) => {
    const facebookUserId = context.state.params.facebookUserId;
    if (!facebookUserId) {
      return badRequest("facebookUserId is required");
    }

    let body: UpsertMetaTokenBody;
    try {
      body = await context.json<UpsertMetaTokenBody>();
    } catch {
      return badRequest("Invalid JSON body");
    }

    if (!body.accessToken) {
      return badRequest("accessToken is required");
    }

    try {
      let createdAt = new Date().toISOString();
      try {
        const existing = await getMetaToken(context.kv, facebookUserId);
        createdAt = existing.createdAt;
      } catch (error) {
        if (!(error instanceof EntityNotFoundError)) {
          throw error;
        }
      }

      const token = parseMetaToken({
        facebookUserId,
        accessToken: body.accessToken,
        refreshToken: body.refreshToken ?? null,
        expiresAt: body.expiresAt ?? null,
        createdAt,
        updatedAt: new Date().toISOString(),
      });
      await upsertMetaToken(context.kv, token);
      return jsonResponse({ token });
    } catch (error) {
      if (error instanceof DataValidationError) {
        return unprocessable(error.message);
      }
      throw error;
    }
  });

  registerAdminRoute(router, "DELETE", ["/api/admin/meta-tokens/:facebookUserId"], async (context) => {
    const facebookUserId = context.state.params.facebookUserId;
    if (!facebookUserId) {
      return badRequest("facebookUserId is required");
    }

    await deleteMetaToken(context.kv, facebookUserId);
    return jsonResponse({ ok: true });
  });
};
