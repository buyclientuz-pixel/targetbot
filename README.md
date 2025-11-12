# Targetbot — Cloudflare Worker для Facebook Ads

## Implementation Status
- [x] 1. Чистка кода и структуры
- [x] 2. Роутер Worker’а
- [x] 3. Meta OAuth + статус
- [x] 4. Рекламные кабинеты
- [x] 5. Проекты
- [x] 6. Лиды и отчётность
- [x] 7. Пользователи
- [x] 8. Финальные проверки

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
```
# локально
npm install
npm run dev

# деплой
npm run deploy
```

## Архитектура
```
src/
  api/
    meta.ts       # OAuth, статус и рекламные кабинеты
    projects.ts   # CRUD проектов и привязки чатов/кабинетов
    leads.ts      # Приём лидов и смена статусов
    users.ts      # Управление пользователями и ролями
  admin/
    index.ts      # HTML админ-панели
    users.ts      # Страница /admin/users
  components/
    layout.ts     # Общий HTML-шаблон
  utils/
    http.ts       # Формирование ответов
    ids.ts        # Генерация идентификаторов
    meta.ts       # Клиент Graph API
    storage.ts    # Обёртки над KV/R2
    telegram.ts   # Отправка сообщений в Telegram
  views/
    portal.ts     # Клиентский портал проекта
  index.ts        # Роутер и входная точка Worker’а
```

### Потоки данных
```mermaid
flowchart LR
  U[Пользователь в админке/портале] -- действия --> W[Cloudflare Worker]
  W -- /api/meta/* --> META[(Meta Graph API)]
  W -- /api/projects/* --> KV[(KV/R2 Storage)]
  W -- /api/leads/* --> KV
  META -- Webhook Leads --> W
  W -- send message --> TG[Telegram Group]
  U -- просматривает --> Portal[/Portal: /portal/:id/]
  U -- админит --> Admin[/Admin: /admin, /admin/users/]
```

### ER-диаграмма
```mermaid
erDiagram
  USERS ||--o{ PROJECTS : owns
  PROJECTS ||--o| AD_ACCOUNTS : binds
  PROJECTS ||--o{ LEADS : has
  USERS {
    string id PK
    string name
    string username
    string role "client|manager|admin"
    datetime created_at
  }
  PROJECTS {
    string id PK
    string name
    string user_id FK
    string tg_chat_link
    string ad_account_id
    datetime created_at
    datetime updated_at
  }
  AD_ACCOUNTS {
    string id PK
    string name
    string currency
    string status
    string meta_owner_user_id
  }
  LEADS {
    string id PK
    string project_id FK
    string name
    string phone
    string source
    string status "new|done"
    datetime created_at
  }
  META_TOKENS {
    string user_id PK
    string access_token
    datetime expires_at
    string status "valid|expired|missing"
  }
```

## API кратко
- `GET /api/meta/status` — статус OAuth токена.
- `GET /api/meta/adaccounts` — рекламные кабинеты с именем, ID, валютой и статусом.
- `GET /api/meta/oauth/start` → редирект в Meta OAuth.
- `GET /api/meta/oauth/callback` — завершение OAuth, сохранение токена.
- `POST /api/meta/refresh` — обновление long-lived токена.
- `GET /api/projects` / `POST /api/projects` — список и создание проектов.
- `GET|PATCH|DELETE /api/projects/:id` — управление проектом.
- `GET /api/projects/:id/leads` — лиды по проекту.
- `POST /api/leads` — приём лидов из webhook.
- `PATCH /api/leads/:id` — смена статуса лида.
- `GET /api/leads?projectId=` — лиды по projectId.
- `GET /api/users` / `POST /api/users` — список и создание пользователей.
- `PATCH|DELETE /api/users/:id` — обновление роли или удаление пользователя.

## Настройка Meta и рекламных кабинетов
- `FB_APP_ID`, `FB_APP_SECRET` — параметры приложения Facebook для OAuth.
- `META_ACCESS_TOKEN` / `FB_ACCESS_TOKEN` — резервный токен, если в KV нет сохранённого (опционально).
- `META_ACCESS_TOKEN_EXPIRES` (`META_TOKEN_EXPIRES_AT`, `FB_ACCESS_TOKEN_EXPIRES`) — дата/время истечения токена в ISO или Unix-формате (секунды/миллисекунды).
- `META_AD_ACCOUNTS`, `META_AD_ACCOUNT_IDS`, `FB_AD_ACCOUNTS` — список кабинетов (JSON-массив, строки через запятую или перенос строки). Допускается ID без префикса `act_` — он добавится автоматически.
- `META_BUSINESS_IDS`, `FB_BUSINESS_IDS` — ID бизнес-менеджеров, из которых будут подгружены `owned_ad_accounts` и `client_ad_accounts`.

## UI сценарии
- `/admin` — панель с индикатором Meta, списком кабинетов и карточками проектов.
- `/admin/users` — таблица пользователей с кнопкой «Обновить», сменой роли и удалением.
- `/portal/:projectId` — портал проекта с таблицей лидов и сменой статуса без перезагрузки.

## Progress Log

### Progress 1
- Что сделано: Удалена устаревшая кодовая база, пересобрана структура `src/` под новые модули.
- Какая задача сейчас в работе: Роутер Worker’а.
- Следующие задачи: Настроить Meta OAuth и статус.

### Progress 2
- Что сделано: Собран централизованный роутер в `src/index.ts`, настроены ответы и CORS.
- Какая задача сейчас в работе: Meta OAuth + статус.
- Следующие задачи: Реализация API Meta и интеграция с KV/R2.

### Progress 3
- Что сделано: Реализован OAuth-флоу Meta, статус, refresh и сохранение токена в KV.
- Какая задача сейчас в работе: Рекламные кабинеты.
- Следующие задачи: Подключить выбор кабинетов и обновить админку.

### Remaining backlog (после 3 задач)
- [ ] 4. Рекламные кабинеты
- [ ] 5. Проекты
- [ ] 6. Лиды и отчётность
- [ ] 7. Пользователи
- [ ] 8. Финальные проверки

### Progress 4
- Что сделано: Добавлен запрос рекламных кабинетов и вывод в админке.
- Какая задача сейчас в работе: Проекты.
- Следующие задачи: CRUD проектов и портал.

### Progress 5
- Что сделано: Реализован CRUD проектов, привязка Telegram-чата и кабинета, портал на `/portal/:id`.
- Какая задача сейчас в работе: Лиды и отчётность.
- Следующие задачи: Приём лидов и отправка в чат.

### Progress 6
- Что сделано: Настроены webhook лидов, отправка уведомлений в Telegram и управление статусами.
- Какая задача сейчас в работе: Пользователи.
- Следующие задачи: Таблица пользователей и API ролей.

### Remaining backlog (после 6 задач)
- [ ] 7. Пользователи
- [ ] 8. Финальные проверки

### Progress 7
- Что сделано: Добавлена страница `/admin/users`, API GET/PATCH/DELETE, обновление ролей и удаление.
- Какая задача сейчас в работе: Финальные проверки.
- Следующие задачи: Smoke-тесты, валидация деплоя и документации.

### Progress 8
- Что сделано: Добавлены резервные источники токена и расширенный поиск рекламных кабинетов по бизнес-ID и вручную заданным ID.
- Какая задача сейчас в работе: Финальные проверки.
- Следующие задачи: Смоук-проверки конечных точек и фиксация результатов в README.

### Progress 9
- Что сделано: Перенесены типы Cloudflare в локальную декларацию, упрощена конфигурация TypeScript и удалена зависимость @cloudflare/workers-types для беспроблемной установки npm.
- Какая задача сейчас в работе: Финальные проверки.
- Следующие задачи: Пройти smoke-проверки и зафиксировать итоги деплоя.

### Remaining backlog (после 9 задач)
- [x] 8. Финальные проверки

### Progress 10
- Что сделано: Обновлены инструкции по деплою, runbook, postdeploy-валидатор и go-live чек-лист; README фиксирует закрытие финальных проверок.
- Какая задача сейчас в работе: Финальные проверки.
- Следующие задачи: Выполнить smoke-curl проверки на боевом воркере и зафиксировать результаты в журнале прогресса.

### Progress 11
- Что сделано: Добавлены формы создания и редактирования проектов в админке, обновлены карточки проектов и экранирование HTML-данных.
- Какая задача сейчас в работе: Финальные проверки.
- Следующие задачи: Провести smoke-проверки UI и сверить связку проектов с Telegram/Meta конфигурациями.

### Progress 12
- Что сделано: Исправлены ошибки TypeScript — добавлены DOM.Iterable типы и расширены Telegram-обёртки для совместимости с Worker env.
- Какая задача сейчас в работе: Финальные проверки.
- Следующие задачи: Пройти smoke-команды и зафиксировать результаты деплоя.

### Remaining backlog (после 12 задач)
- [x] 1. Чистка кода и структуры
- [x] 2. Роутер Worker’а
- [x] 3. Meta OAuth + статус
- [x] 4. Рекламные кабинеты
- [x] 5. Проекты
- [x] 6. Лиды и отчётность
- [x] 7. Пользователи
- [x] 8. Финальные проверки

### Progress 13
- Что сделано: Карточки проектов в админке показывают новые и завершённые лиды, добавлена сортировка по активным лидам.
- Какая задача сейчас в работе: Финальные проверки.
- Следующие задачи: Прогнать smoke-проверки обновлённого дашборда и уведомлений.

### Progress 14
- Что сделано: Портал проекта получил фильтры по статусу лидов и обновление строк без перезагрузки страницы.
- Какая задача сейчас в работе: Финальные проверки.
- Следующие задачи: Собрать обратную связь по обновлённому порталу и подготовить финальные UI-полировки.

