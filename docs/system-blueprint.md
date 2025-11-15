# TargetBot Functional Blueprint and Implementation Plan

This document collects the end-to-end logic that must be delivered for the unified Cloudflare Worker application and breaks it into concrete rollout phases. It serves two purposes:

1. **Functional specification** — describes how each subsystem (Telegram bot, portal, Meta integration, billing, maintenance, etc.) is expected to behave, which storage surfaces it uses, and the key success criteria.
2. **Implementation roadmap** — provides an actionable, sequential plan so we can restore the missing functionality step by step without leaving gaps between the bot, admin flows, and the client portal.

## 1. System Overview

TargetBot is a single Cloudflare Worker that coordinates:

- **Telegram bot** for operators and admins (menu navigation, project cards, billing adjustments, chat routing, webhook processing).
- **Client portal** served as static HTML + API endpoints for analytics, leads, campaigns, payments, and billing state.
- **Meta integrations** including proxy APIs, lead webhooks, token storage, and insights caching.
- **Admin / back-office tools** to create and manage projects, settings, Meta tokens, and portal sessions.
- **Scheduled jobs** that deliver auto-reports, alerting, and maintenance tasks (cleanup of stale leads and caches).

The Worker communicates with:

- **Cloudflare KV** — primary store for projects, settings, sessions, cache, tokens, configuration flags.
- **Cloudflare R2** — append-only storage for leads, campaign stats, payment history, and large logs.
- **Telegram Bot API** — outbound messages and callback handling for user interactions.
- **Meta Graph API** — inbound webhooks (leadgen) and outbound insight polling routed through the Worker.

## 2. Functional Logic by Module

### 2.1 Projects & Settings

- **Creation**: Admin requests create `project:{id}` records in KV and seed `project-settings:{id}` with defaults (billing zeroed, alerts enabled, portal on).
- **Retrieval**: All consumers (`/api/projects/:id`, bot menu, portal API) rely on the same CRUD helpers to keep shape consistent.
- **Updates**: Billing, alerts, KPI, and chat routing are merged into the existing record, validated, and timestamped. Touching a project updates `updatedAt` to aid scheduling and audits.
- **Sessions**: Portal sessions are minted via `/api/projects/:id/sessions` with TTLs and stored in KV for stateless auth.

### 2.2 Meta Integration

- **Tokens**: Stored under `meta-token:{fbUserId}` with access/refresh pair, rotation timestamp, and expiry. Admin panel exposes CRUD so operators can reconnect accounts without code deploys.
- **Cache**: `meta-cache:{projectId}:{type}:{period}` retains last insight pulls for 60 seconds. Scheduled maintenance purges stale caches (>3 days) daily.
- **Proxy**: `/api/meta/...` endpoints validate project, read tokens, check cache, hit Graph API when needed, and normalise metrics for portal + bot.
- **Webhook**: `/api/meta/webhook` ingests lead payloads, deduplicates R2 objects, updates `lastStatusUpdate`, and routes alerts respecting chat/topic settings.

### 2.3 Telegram Bot

- **Webhook**: `/tg-webhook` + `/api/telegram/webhook` share controller logic. Token resolved from `TELEGRAM_BOT_TOKEN` or legacy `BOT_TOKEN`.
- **Menu flow**: `/start` and "Меню" display entry keyboard. Options branch into Facebook auth (token state), projects list, analytics, billing, portal links, webhook health.
- **Project card**: Combines project info, Meta metrics (today + totals), billing status, alerts state, and quick links (portal, chat thread). Buttons provide billing actions.
- **Billing actions**: Inline callbacks adjust tariff, extend payment window, or request manual inputs. Free-form replies stored via session state in KV to complete updates and create payment records in R2.
- **Chat routing**: Bot finds chat topics named "Таргет"; caches IDs in settings; supports detach/attach flows.

### 2.4 Client Portal

- **HTML**: `/portal/{projectId}` serves static shell with global preload overlay, per-section skeletons, and failure fallback.
- **Data Fetching**: Front-end fetches summary, leads, campaigns APIs with `?period=` switchers. On >8s summary delay, preloader hides and error block appears.
- **Tabs**: Today/Yesterday/Week/Month/Max share API; UI indicates active tab and reloads sections with mini spinners instead of full reset.
- **Payments**: Portal fetches R2 payments list, allows POST/PUT via Worker to sync with billing settings; updates propagate to bot.

### 2.5 Alerts & Auto Reports

- **Scheduler**: Worker `scheduled` handler triggers every 5 minutes to check projects with auto reports enabled and due times (including special Monday range logic).
- **Alerts**: Billing reminders, budget anomalies, token expiry, and pause detection track last alert timestamps in KV to prevent spam. Routing respects `alerts.route` options (CHAT / ADMIN / BOTH / NONE).

### 2.6 Maintenance

- **Lead cleanup**: Weekly job scans `leads/{projectId}/*` removing entries older than configurable retention (default 14 days) to avoid stale notifications.
- **Cache cleanup**: Daily job deletes `meta-cache:*` older than 3 days for safety.

## 3. Implementation Plan

The following phases bring the system back to a fully working state. Each phase has clear deliverables and can be validated independently.

| Phase | Scope | Key Tasks | Outputs |
| --- | --- | --- | --- |
| 0. Planning | Align on functional blueprint (this document) and update README progress. | Document logic, confirm worker domain, list verification steps. | `docs/system-blueprint.md`, README progress note. |
| 1. Admin Foundations | Restore ability to create/manage projects/settings/tokens via Worker APIs. | Implement `/api/admin/*` routes, seed defaults, add integration tests, document endpoints. | Working CRUD for projects/settings/tokens; tests verifying lifecycle. |
| 2. Telegram Bot Validation | Ensure webhook + menu flows surface live data. | Smoke-test webhook with seeded project, verify menu/project card/billing updates, add troubleshooting notes. | Bot responds to `/start`, lists projects, updates billing. |
| 3. Portal Restoration | Confirm `/portal/:id` + APIs deliver live metrics/leads/payments. | Seed R2 leads/payments, validate summary caches, ensure error fallbacks. | Functional portal with skeleton loaders and data switching. |
| 4. Meta/Webhook Pipeline | Run end-to-end lead ingestion & alerts. | Replay sample webhook payload, confirm R2 storage and Telegram alert. | Documented webhook verification checklist. |
| 5. Alerts & Maintenance | Validate cron jobs, retention, and alert dedupe. | Simulate due auto report, check cleanup sweeps. | Logs or test assertions confirming scheduler behaviour. |
| 6. QA & Ops | Dry-run pipeline, update runbooks, align staging/prod domains. | `npm run dry-run`, update checklists with new endpoints. | Verified release steps with admin coverage. |

Each phase should conclude with README updates ("Выполнено" + "Следующее"), Git commits, and where applicable documentation cross-links (deployment guide, webhook guide, etc.).

## Rollout Progress

- ✅ **Phase 1 — Admin Foundations.** `/api/admin/*` маршруты задействованы, интеграционные тесты `tests/integration/admin-routes.test.ts` подтверждают CRUD-поток.
- ✅ **Phase 2 — Telegram Bot Validation.** Интеграционные тесты `tests/integration/telegram-bot-controller.test.ts` покрывают меню, карточки проектов и сценарии биллинга (включая +30 дней и ручной ввод дат).
- ✅ **Phase 3 — Portal Restoration.** Интеграционный тест `tests/integration/portal-routes.test.ts` подтверждает работу HTML-портала и API summary/leads/campaigns/payments.
- ⏭️ **Phase 4 — Meta/Webhook Pipeline.** Следующим шагом валидируем ingest от webhook до Telegram-уведомлений и документируем проверку.

## 4. Verification Checklist

Before marking the system fully restored we must:

1. **Admin API**
   - `POST /api/admin/projects` creates a project and auto-seeds settings.
   - `GET /api/admin/projects` returns created record.
   - `PUT /api/admin/projects/{id}` updates owner/name.
   - `PUT /api/admin/projects/{id}/settings` modifies billing/alerts.
   - `PUT /api/admin/meta-tokens/{fbUserId}` stores tokens retrievable via GET.

2. **Telegram Bot**
   - `/tg-webhook` acknowledges updates with HTTP 200 and writes logs on failure.
   - `/start` shows keyboard; "Проекты" lists available entries; selecting renders project card with metrics/billing.
   - Billing callbacks update settings and emit confirmation messages.

3. **Portal**
   - `GET /portal/{id}` renders HTML with skeletons and handles summary timeout fallback.
   - `GET /api/projects/{id}/summary?period=yesterday` returns metrics (cached 60s).
   - `GET /api/projects/{id}/leads?period=yesterday` and `/campaigns` deliver filtered data.
   - Payments page reflects R2 records after bot updates.
   - Интеграционный тест `tests/integration/portal-routes.test.ts` фиксирует все четыре API и HTML-роут.

4. **Meta/Webhook**
   - `GET /api/meta/webhook` handshake returns verify token.
   - `POST /api/meta/webhook` stores leads, dispatches Telegram alert respecting route/topic.
   - Meta cache respects 60-second freshness.

5. **Scheduler & Maintenance**
   - Cron tick triggers auto-report when window due.
   - Old leads (> retention) deleted; logs confirm count.
   - Meta cache older than retention removed.

6. **Operations**
   - README + docs reference correct worker domain `th-reports.buyclientuz.workers.dev`.
   - Telegram webhook guide covers domain verification and troubleshooting.
   - Dry-run pipeline passes in CI/local.

Delivering the phases in order ensures we always have a working slice before moving to the next subsystem and can deploy incrementally if needed.
