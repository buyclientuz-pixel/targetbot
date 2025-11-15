# TargetBot — Cloudflare Worker refactor

TargetBot объединяет Telegram-бота, клиентский портал и интеграцию с Meta Ads в рамках единого Cloudflare Worker приложения. Переписываем наследованный проект, переходя на KV + R2 и унифицированные API/портал/бот сценарии.

## Implementation Status
- [x] Итерация 1 — Аудит и планирование Cloudflare-рефакторинга
- [x] Итерация 2 — Базовая инфраструктура Worker (entrypoint, KV/R2 клиенты)
- [x] Итерация 3 — Модель данных и хранилища (projects, settings, sessions)
- [x] Итерация 4 — Meta API и KV-кеш (meta-cache:*, meta-token:*)
- [x] Итерация 5 — Meta Webhook → лиды в R2 + уведомления
- [x] Итерация 6 — Telegram-бот: меню, карточка проекта, биллинг
- [x] Итерация 7 — Клиентский портал: прелоадер, метрики, лиды, кампании
- [x] Итерация 8 — Автоотчёты и алерты (cron, маршрутизация, темы)
- [x] Итерация 9 — Очистка лидов и кешей, ревизия устаревшего кода
- [x] Итерация 10 — Автотесты и финальная документация
- [x] Итерация 11 — Операционные гайды и деплойная памятка
- [x] Итерация 12 — Dry-run деплоя и сбор фидбека

## Master-spec rollout (2026)
- [x] Итерация 1 — Базовые модели данных (KV/R2) и новая структура домена
- [ ] Итерация 2 — Telegram-бот по master-spec (меню, карточки, оплаты, чаты)
- [ ] Итерация 3 — Клиентский портал и API (прелоадер, ключевые метрики, оплаты)
- [ ] Итерация 4 — Вебхуки Meta/Telegram и алерты
- [ ] Итерация 5 — Автоотчёты, экспорт, финальный QA

## Refactor 2025 Progress

- **Выполнено:**
  - Итерация 1 — подготовлен документ `docs/refactor-plan.md` с дорожной картой перехода на новую архитектуру.
  - Итерация 2 — развёрнут новый Cloudflare Worker entrypoint, добавлены типизированные клиенты KV/R2, единый роутер и CORS-инфраструктура.
  - Итерация 3 — собраны доменные модели и CRUD-helpers для проектов, настроек и сессий портала, добавлены REST-эндпоинты `/api/projects/*`.
  - Итерация 4 — внедрён Meta API-прокси с кешированием KV (`meta-cache:*`), CRUD для `meta-token:{fbUserId}` и отчётами по проектам/кампаниям.
  - Итерация 5 — реализован webhook Meta с импортом лидов в R2, дедупликацией и уведомлениями в Telegram по маршрутам CHAT/ADMIN.
  - Итерация 6 — обновлён Telegram-бот: добавлены меню, карточки проектов, биллинг-меню и состояния бота в KV.
  - Итерация 7 — собран клиентский портал на Worker: HTML-роут `/portal/:projectId`, API для summary/leads/campaigns, скелетоны и обработка таймаута прелоадера.
  - Итерация 8 — реализованы cron-задачи автоотчётов и алертов: кеш статусов кампаний, дедупликация уведомлений, авто-создание тем «Таргет».
  - Итерация 9 — добавлена еженедельная зачистка лидов в R2, удаление устаревших кешей Meta и конфигурируемые пороги retention через KV.
  - Итерация 10 — собран набор автотестов (unit/integration/e2e) на `node --test` с кастомным TS-лоадером и зафиксирована процедура запуска QA.
  - Итерация 11 — подготовлена операционная памятка (`docs/deployment-guide.md`) с деплоем, релизами, мониторингом и экстренными сценариями.
  - Итерация 12 — добавлен чеклист dry-run деплоя (`docs/dry-run-checklist.md`) и автоматизированный скрипт `npm run dry-run`.
- Подготовлена и уточнена инструкция по подключению Telegram Webhook (`docs/telegram-webhook.md`) с проверкой фактического домена воркера.
- Сформирован функциональный blueprint с пошаговым планом восстановления системы (`docs/system-blueprint.md`).
- Собран полный пакет "жирного" ТЗ, текстов и мастер-промпта (`docs/master-spec.md`) для быстрого онбординга Codex/ИИ.
- Стартовал master-spec rollout: реализованы доменные модели и адаптеры KV/R2 под новые ключи `fb_auth:*`, `projects_by_user:*`, `billing:*`, `alerts:*`, `autoreports:*`, `project-leads/*`, `meta/campaigns/*`, `payments/*`.
- Реализованы административные API `/api/admin/*` для управления проектами, настройками и Meta-токенами, добавлены проверки в `tests/integration/admin-routes.test.ts`.
- Добавлены интеграционные тесты `tests/integration/telegram-bot-controller.test.ts`, покрывающие меню, карточку проекта и сценарии биллинга Telegram-бота.
  - Завершена фаза 3 плана восстановления — интеграционный тест `tests/integration/portal-routes.test.ts` подтверждает работу HTML-портала и API summary/leads/campaigns/payments.
  - Завершена фаза 4 плана восстановления — тест `tests/integration/meta-webhook-route.test.ts` покрывает ingest лида, запись в R2, проверку verify token и уведомление в Telegram.
  - Завершена фаза 5 плана восстановления — тест `tests/integration/scheduler-tasks.test.ts` подтверждает автоотчёты, алерты и очистку maintenance-задач.
  - Завершена фаза 6 плана восстановления — прогон `npm run dry-run -- --skip-deploy` подтверждает, что линтер, typecheck, тесты и деплойная проверка проходят в едином пайплайне; гайды QA/ops обновлены.
  - **Следующее:** Итерация 2 master-spec rollout — перенос Telegram-бота на новые модели (проекты, биллинг, лиды, чаты) и ручная приёмка на стенде.

## How to run

### Локальная разработка
```bash
npm install
npm run dev
```

### Деплой из локальной среды
```bash
npm run deploy
```

## Build / Deploy commands
```bash
# локально
npm install
npm run dev

# деплой
npm run deploy
```

## QA & Regression

```bash
npm run qa
```

Команда `npm run qa` запускает `node --test` через кастомный TypeScript loader (`scripts/ts-loader.mjs`), покрывая unit, integration и e2e сценарии.

### Dry-run деплоя

```bash
npm run dry-run
```

Скрипт последовательно выполняет линт, typecheck, тесты и `wrangler deploy --dry-run`. Для локальных прогонов без токена Cloudflare добавьте флаг `--skip-deploy`.

## Архитектура

```text
src/
  config/
    kv.ts        # ключи и префиксы KV
    r2.ts        # структура ключей в R2
  domain/
    meta-cache.ts       # кеш Meta insights
    meta-tokens.ts      # хранение и обновление Meta access/refresh токенов
    project-settings.ts # валидация и CRUD настроек проекта
    projects.ts         # доменная модель проекта
    portal-sessions.ts  # управление сессиями портала
    validation.ts       # общие валидаторы доменных сущностей
  http/
    cors.ts      # CORS middleware
    responses.ts # стандартные HTTP ответы
  infra/
    kv.ts        # обёртка над Workers KV
    r2.ts        # обёртка над R2
  routes/
    index.ts     # регистрация базовых маршрутов (health/meta/projects)
    meta.ts      # Meta API proxy + кеш summary/campaigns
    portal.ts    # HTML-портал + API summary/leads/campaigns
  services/
    meta-api.ts  # запросы к Graph API и нормализация данных
    project-insights.ts # кеширование summary/campaigns для портала и API
    project-messaging.ts # отправка сообщений в Telegram с автосозданием тем
    auto-reports.ts # cron-отчёты по таймслотам и форматирование сообщений
    alerts.ts # биллинг/бюджет/паузa/Meta алерты с дедупликацией
    scheduler.ts # запуск автоотчётов и алертов из Scheduled events
  worker/
    context.ts   # RequestContext (env, KV, R2, body helpers)
    router.ts    # URLPattern-роутер + CORS
    types.ts     # типы окружения
  index.ts       # точка входа Worker’a
```

## Дорожная карта (сокращённо)

Полное описание — в `docs/refactor-plan.md`. Ниже ключевые ориентиры:

1. База (entrypoint + KV/R2 клиенты) ✅
2. Модель данных и CRUD-helpers ✅
3. Meta API + кеш
4. Webhook лидов + Telegram уведомления
5. Telegram-бот (меню, карточка, биллинг)
6. Клиентский портал (прелоадер, метрики, табы)
7. Автоотчёты и алерты
8. Очистка лидов/кешей и удаление легаси-кода
9. Автотесты (unit/integration/e2e)
10. Документация деплоя и эксплуатации

## Дополнительная документация

- [Telegram Webhook Setup Guide](docs/telegram-webhook.md)
- [Functional Blueprint & Rollout Plan](docs/system-blueprint.md)
- [Full Spec, Templates & Master Prompt](docs/master-spec.md)
