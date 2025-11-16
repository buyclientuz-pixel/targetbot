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
import { ensureAdminRequest } from "../services/admin-auth";
import {
  listAdminProjectSummaries,
  loadAdminProjectDetail,
  buildAdminAnalyticsOverview,
  buildAdminFinanceOverview,
  listAdminUsers,
  listAdminMetaAccounts,
  listAdminProjectLeads,
} from "../services/admin-dashboard";
import { getWebhookInfo, setWebhook } from "../services/telegram";
import { deleteProjectCascade } from "../services/project-lifecycle";
import { PORTAL_PERIOD_KEYS, syncPortalMetrics, type PortalSyncResult } from "../services/portal-sync";
import { buildAdminClientScript } from "./admin-client";

const ADMIN_CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization, x-admin-key",
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

const describePortalSyncResult = (result: PortalSyncResult): string => {
  const successful = result.periods.filter((entry) => entry.ok).length;
  const failed = result.periods.filter((entry) => !entry.ok);
  if (failed.length === 0) {
    return `Портал обновлён (${successful}/${result.periods.length}).`;
  }
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
          --bg: #0f1115;
          --panel: #191c24;
          --border: rgba(255, 255, 255, 0.08);
          --text: #f6f7fb;
          --muted: #99a2b4;
          --accent: #00a86b;
        }
        body {
          margin: 0;
          font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: var(--bg);
          color: var(--text);
        }
        .admin-app {
          display: flex;
          min-height: 100vh;
        }
        .admin-sidebar {
          width: 240px;
          background: #0b0d12;
          padding: 24px 16px;
          border-right: 1px solid var(--border);
        }
        .admin-logo {
          font-size: 1.1rem;
          font-weight: 600;
          margin-bottom: 24px;
        }
        .admin-nav {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .admin-nav__item {
          background: transparent;
          border: 1px solid transparent;
          border-radius: 8px;
          padding: 10px 14px;
          color: var(--text);
          text-align: left;
          cursor: pointer;
          transition: background 0.2s, border 0.2s;
        }
        .admin-nav__item:hover,
        .admin-nav__item--active {
          background: rgba(0, 168, 107, 0.15);
          border-color: rgba(0, 168, 107, 0.3);
        }
        .admin-main {
          flex: 1;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .admin-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .admin-header h1 {
          margin: 0;
          font-size: 1.5rem;
        }
        .admin-header p {
          margin: 4px 0 0;
          color: var(--muted);
          font-size: 0.9rem;
        }
        .admin-btn {
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: transparent;
          color: var(--text);
          padding: 8px 14px;
          border-radius: 8px;
          cursor: pointer;
          margin-left: 8px;
        }
        .admin-btn--ghost {
          border-color: var(--border);
        }
        .admin-section {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 24px;
        }
        .portal-panel {
          border: 1px dashed rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 24px;
          background: rgba(255, 255, 255, 0.02);
        }
        .portal-panel--disabled {
          opacity: 0.7;
        }
        .portal-status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 8px 16px;
          margin: 12px 0 16px;
        }
        .admin-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 16px;
          align-items: flex-end;
        }
        .admin-input,
        .admin-select {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          padding: 8px 10px;
          color: var(--text);
          font: inherit;
        }
        .admin-input::placeholder {
          color: var(--muted);
        }
        .admin-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .admin-btn--danger {
          border-color: rgba(255, 99, 132, 0.6);
          color: #ff6384;
        }
        .section-title {
          margin-top: 0;
          margin-bottom: 16px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th,
        td {
          padding: 10px 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          text-align: left;
          font-size: 0.9rem;
        }
        tr.is-selected {
          background: rgba(0, 168, 107, 0.12);
        }
        form label {
          display: flex;
          flex-direction: column;
          font-size: 0.85rem;
          color: var(--muted);
          gap: 6px;
        }
        form input,
        form select,
        form textarea {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          padding: 10px;
          color: var(--text);
          font-size: 0.95rem;
        }
        form .form-grid {
          display: grid;
          gap: 16px;
        }
        .grid-2 {
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        }
        .grid-full {
          grid-column: 1 / -1;
        }
        .admin-login {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.7);
          visibility: hidden;
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .admin-login--visible {
          visibility: visible;
          opacity: 1;
        }
        .admin-login__form {
          background: var(--panel);
          padding: 32px;
          border-radius: 16px;
          border: 1px solid var(--border);
          min-width: 320px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        ul {
          padding-left: 18px;
        }
        ul li {
          margin-bottom: 4px;
          color: var(--muted);
        }
      </style>
    </head>
    <body>
      <div class="admin-app" data-app>
        <aside class="admin-sidebar">
          <div class="admin-logo">TargetBot Admin</div>
          <nav class="admin-nav">
            <button class="admin-nav__item admin-nav__item--active" data-nav="projects">Проекты</button>
            <button class="admin-nav__item" data-nav="analytics">Аналитика</button>
            <button class="admin-nav__item" data-nav="finance">Финансы</button>
            <button class="admin-nav__item" data-nav="users">Пользователи</button>
            <button class="admin-nav__item" data-nav="meta">Meta-аккаунты</button>
            <button class="admin-nav__item" data-nav="webhooks">Webhooks</button>
            <button class="admin-nav__item" data-nav="settings">Настройки</button>
          </nav>
        </aside>
        <main class="admin-main">
          <header class="admin-header">
            <div>
              <h1 data-view-title>Проекты</h1>
              <p data-status>Готово</p>
            </div>
            <div>
              <button class="admin-btn admin-btn--ghost" data-action="refresh">Обновить</button>
              <button class="admin-btn admin-btn--ghost" data-action="logout">Выйти</button>
            </div>
          </header>
          <section class="admin-section" data-section="projects">
            <h2 class="section-title">Проекты</h2>
            <div class="admin-toolbar">
              <form data-project-create>
                <input class="admin-input" name="projectId" placeholder="ID проекта" required />
                <input class="admin-input" name="projectName" placeholder="Название" required />
                <input class="admin-input" name="ownerId" placeholder="ID владельца" type="number" required />
                <input class="admin-input" name="adAccountId" placeholder="act_... (опционально)" />
                <button class="admin-btn" type="submit">Создать</button>
              </form>
            </div>
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Название</th>
                    <th>Ad Account</th>
                    <th>Чат</th>
                    <th>Валюта</th>
                    <th>KPI</th>
                    <th>Создан</th>
                    <th>Статус</th>
                    <th>Лиды</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody data-projects-body></tbody>
              </table>
            </div>
            <div class="admin-section" data-project-detail hidden>
              <h3 data-project-detail-title></h3>
              <p data-project-detail-meta class="muted"></p>
              <div class="portal-panel" data-portal-panel>
                <h4>Клиентский портал</h4>
                <p data-portal-description class="muted">Создайте портал, чтобы делиться показателями с клиентом.</p>
                <div class="portal-status-grid">
                  <div><span class="muted">Ссылка:</span> <a data-portal-link target="_blank" rel="noreferrer noopener">—</a></div>
                  <div><span class="muted">Автообновление:</span> <span data-portal-auto>—</span></div>
                  <div><span class="muted">Последний запуск:</span> <span data-portal-run>—</span></div>
                  <div><span class="muted">Последний успех:</span> <span data-portal-success>—</span></div>
                  <div><span class="muted">Последняя ошибка:</span> <span data-portal-error>—</span></div>
                </div>
                <div class="admin-actions" data-portal-actions>
                  <button type="button" class="admin-btn" data-portal-action="create" data-portal-create>Создать портал</button>
                  <button type="button" class="admin-btn admin-btn--ghost" data-portal-action="open" data-portal-open>Открыть портал</button>
                  <button type="button" class="admin-btn admin-btn--ghost" data-portal-action="toggle" data-portal-toggle>Остановить автообновление</button>
                  <button type="button" class="admin-btn admin-btn--ghost" data-portal-action="sync" data-portal-sync>Обновить данные</button>
                  <button type="button" class="admin-btn admin-btn--danger" data-portal-action="delete" data-portal-delete>Удалить портал</button>
                </div>
              </div>
              <h4>Лиды</h4>
              <table>
                <thead>
                  <tr>
                    <th>Имя</th>
                    <th>Телефон</th>
                    <th>Тип</th>
                    <th>Дата</th>
                    <th>Реклама</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody data-leads-body></tbody>
              </table>
              <h4>Кампании</h4>
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
              <h4>Оплаты</h4>
              <p data-payments-subtitle class="muted"></p>
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
              <form class="form-grid grid-2" data-payment-form>
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
              <form class="form-grid grid-2" data-settings-form>
                <label>Режим KPI<select name="kpiMode"><option value="auto">Авто</option><option value="manual">Ручной</option></select></label>
                <label>Тип KPI<select name="kpiType"><option value="LEAD">Лиды</option><option value="MESSAGE">Сообщения</option><option value="CLICK">Клики</option><option value="VIEW">Просмотры</option><option value="PURCHASE">Покупки</option></select></label>
                <label>Название KPI<input name="kpiLabel" /></label>
                <label>Канал алертов<select name="alertsChannel"><option value="chat">В чат</option><option value="admin">Админу</option><option value="both">Оба</option></select><span><input type="checkbox" name="alertsEnabled" /> Включить</span></label>
                <label><input type="checkbox" name="alertLead" /> Напоминать о лидах</label>
                <label><input type="checkbox" name="alertPause" /> Кампании на паузе</label>
                <label><input type="checkbox" name="alertPayment" /> Напоминать об оплате</label>
                <label>Автоотчёты<select name="autoreportsSendTo"><option value="chat">В чат</option><option value="admin">Админу</option><option value="both">Оба</option></select><span><input type="checkbox" name="autoreportsEnabled" /> Включить</span></label>
                <label>Время отчёта<input type="time" name="autoreportsTime" value="10:00" /></label>
                <button class="admin-btn" type="submit">Сохранить настройки</button>
              </form>
            </div>
          </section>
          <section class="admin-section" data-section="analytics" hidden>
            <h2 class="section-title">Аналитика</h2>
            <p data-analytics-totals class="muted"></p>
            <h4>ТОП проектов</h4>
            <ul data-analytics-projects></ul>
            <h4>ТОП кампаний</h4>
            <ul data-analytics-campaigns></ul>
          </section>
          <section class="admin-section" data-section="finance" hidden>
            <h2 class="section-title">Финансы</h2>
            <p data-finance-totals class="muted"></p>
            <ul data-finance-projects></ul>
          </section>
          <section class="admin-section" data-section="users" hidden>
            <h2 class="section-title">Пользователи</h2>
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
          </section>
          <section class="admin-section" data-section="meta" hidden>
            <h2 class="section-title">Meta / Facebook</h2>
            <table>
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Токен до</th>
                  <th>Аккаунты</th>
                </tr>
              </thead>
              <tbody data-meta-body></tbody>
            </table>
          </section>
          <section class="admin-section" data-section="webhooks" hidden>
            <h2 class="section-title">Telegram Webhook</h2>
            <p data-webhook-info class="muted"></p>
            <button class="admin-btn" data-webhook-reset>Пересоздать webhook</button>
          </section>
          <section class="admin-section" data-section="settings" hidden>
            <h2 class="section-title">Настройки</h2>
            <p data-settings-info class="muted"></p>
          </section>
        </main>
      </div>
      <div class="admin-login admin-login--visible" data-login-panel>
        <form class="admin-login__form" data-login-form>
          <h2>Админ-доступ</h2>
          <p>Введите код доступа (по умолчанию 3590), чтобы открыть панель управления.</p>
          <input type="password" name="adminKey" data-admin-key placeholder="3590" required />
          <button class="admin-btn" type="submit">Войти</button>
        </form>
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
    router.on(method, pathname, async (context) => {
      const guard = ensureAdminRequest(context);
      if (guard) {
        return guard;
      }
      return handler(context);
    });
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
    return jsonOk(leads);
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

  registerAdminRoute(router, "GET", ["/api/admin/meta/accounts"], async (context) => {
    const accounts = await listAdminMetaAccounts(context.kv);
    return jsonOk({ accounts });
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
        alerts: {
          ...existing.alerts,
          ...(body.alerts as Record<string, unknown> | undefined),
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
