# TargetBot — Cloudflare Worker refactor

TargetBot объединяет Telegram-бота, клиентский портал и интеграцию с Meta Ads в рамках единого Cloudflare Worker приложения. Переписываем наследованный проект, переходя на KV + R2 и унифицированные API/портал/бот сценарии.

## Implementation Status
- [x] Итерация 1 — Аудит и планирование Cloudflare-рефакторинга
- [x] Итерация 2 — Базовая инфраструктура Worker (entrypoint, KV/R2 клиенты)
- [x] Итерация 3 — Модель данных и хранилища (projects, settings, sessions)
- [x] Итерация 4 — Meta API и KV-кеш (meta-cache:*, meta-token:*)
- [ ] Итерация 5 — Meta Webhook → лиды в R2 + уведомления
- [ ] Итерация 6 — Telegram-бот: меню, карточка проекта, биллинг
- [ ] Итерация 7 — Клиентский портал: прелоадер, метрики, лиды, кампании
- [ ] Итерация 8 — Автоотчёты и алерты (cron, маршрутизация, темы)
- [ ] Итерация 9 — Очистка лидов и кешей, ревизия устаревшего кода
- [ ] Итерация 10 — Автотесты и финальная документация

## Refactor 2025 Progress

- **Выполнено:**
  - Итерация 1 — подготовлен документ `docs/refactor-plan.md` с дорожной картой перехода на новую архитектуру.
  - Итерация 2 — развёрнут новый Cloudflare Worker entrypoint, добавлены типизированные клиенты KV/R2, единый роутер и CORS-инфраструктура.
  - Итерация 3 — собраны доменные модели и CRUD-helpers для проектов, настроек и сессий портала, добавлены REST-эндпоинты `/api/projects/*`.
  - Итерация 4 — внедрён Meta API-прокси с кешированием KV (`meta-cache:*`), CRUD для `meta-token:{fbUserId}` и отчётами по проектам/кампаниям.
- **Следующее:** Итерация 5 — реализовать Meta webhook, запись лидов в R2 и новые уведомления Telegram.

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

На данный момент выполняется заглушка (истинные автотесты будут реализованы на итерации 9 вместе с моделью данных и e2e-проверками).

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
  services/
    meta-api.ts  # запросы к Graph API и нормализация данных
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
