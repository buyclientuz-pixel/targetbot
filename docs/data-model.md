# TargetBot Data Model

Документ фиксирует актуальные доменные модели, реализованные на итерации 3 рефакторинга. Форматы совпадают со спецификацией из технического задания и дополнительно описывают поведение CRUD-helpers.

## Project (KV: `project:{projectId}`)

```json
{
  "id": "birlash",
  "name": "birlash",
  "adsAccountId": "act_813372877848888",
  "ownerTelegramId": 123456789,
  "createdAt": "2025-11-01T10:00:00.000Z",
  "updatedAt": "2025-11-15T10:00:00.000Z"
}
```

* `createdAt`/`updatedAt` валидируются как ISO-даты; `touchProjectUpdatedAt` обновляет `updatedAt`.
* `createProject` формирует корректные таймстемпы и нормализует пустой `adsAccountId` в `null`.

## Project Settings (KV: `project-settings:{projectId}`)

```json
{
  "projectId": "birlash",
  "chatId": -1003269756488,
  "topicId": 123,
  "portalEnabled": true,
  "billing": {
    "tariff": 500,
    "currency": "USD",
    "nextPaymentDate": "2025-12-15",
    "autobillingEnabled": true
  },
  "kpi": {
    "targetCpl": 3.5,
    "targetLeadsPerDay": 10
  },
  "reports": {
    "autoReportsEnabled": true,
    "timeSlots": ["10:00"],
    "mode": "yesterday+week"
  },
  "alerts": {
    "leadNotifications": true,
    "billingAlerts": true,
    "budgetAlerts": true,
    "metaApiAlerts": true,
    "pauseAlerts": true,
    "route": "CHAT"
  },
  "meta": {
    "facebookUserId": "1234567890"
  },
  "createdAt": "2025-11-01T10:00:00.000Z",
  "updatedAt": "2025-11-15T10:00:00.000Z"
}
```

* `parseProjectSettings` заполняет отсутствующие поля значениями из `createDefaultProjectSettings`.
* `ensureProjectSettings` создаёт дефолтный JSON при первом запросе и сохраняет его в KV.
* PUT `/api/projects/:id/settings` делает безопасный merge вложенных секций и повторно валидирует payload.
* `meta.facebookUserId` используется порталом и Meta-прокси. Если значение не задано, API возвращает 422.

## Portal Session (KV: `portal-session:{sessionId}`)

```json
{
  "id": "sess_c1d6f3d8",
  "projectId": "birlash",
  "userId": "telegram:123456789",
  "createdAt": "2025-11-15T09:00:00.000Z",
  "expiresAt": "2025-11-16T09:00:00.000Z",
  "lastSeenAt": "2025-11-15T10:15:00.000Z",
  "ipAddress": "203.0.113.10",
  "userAgent": "Mozilla/5.0"
}
```

* `createPortalSession` выставляет TTL по умолчанию 24 часа и синхронизирует `expiresAt`/`lastSeenAt`.
* `savePortalSession` передаёт TTL в KV (`expirationTtl`), `touchPortalSession` продлевает TTL и обновляет `lastSeenAt`.
* POST `/api/projects/:id/sessions` создаёт новую сессию и возвращает её в ответе (`201 Created`).

## Meta Token (KV: `meta-token:{facebookUserId}`)

```json
{
  "facebookUserId": "1234567890",
  "accessToken": "EAAGm0PX4ZCpsBA...",
  "refreshToken": "AQABAAIAAAAGV2Z...",
  "expiresAt": "2025-11-30T12:00:00.000Z",
  "createdAt": "2025-11-01T10:00:00.000Z",
  "updatedAt": "2025-11-15T10:00:00.000Z"
}
```

* `createMetaToken` формирует запись со свежими таймстемпами и нормализует опциональные поля в `null`.
* `getMetaToken`/`upsertMetaToken` обеспечивают строгую валидацию ISO-дат и обязательного `accessToken`.
* PUT `/api/meta/tokens/:facebookUserId` обновляет токен, возвращая `201 Created` при первом сохранении.

## Meta Cache (KV: `meta-cache:{projectId}:{scope}`)

```json
{
  "projectId": "birlash",
  "scope": "summary:today",
  "fetchedAt": "2025-11-15T11:00:00.000Z",
  "ttlSeconds": 60,
  "period": {
    "from": "2025-11-15",
    "to": "2025-11-15"
  },
  "payload": {
    "periodKey": "today",
    "metrics": {
      "spend": 16.15,
      "impressions": 1000,
      "clicks": 100,
      "leads": 5,
      "leadsToday": 5,
      "leadsTotal": 168,
      "cpa": 3.23,
      "spendToday": 16.15,
      "cpaToday": 3.23
    },
    "source": { "data": [...] }
  }
}
```

* `createMetaCacheEntry` выставляет `fetchedAt` и TTL, а `saveMetaCache` дублирует TTL в `expirationTtl`.
* `isMetaCacheEntryFresh` проверяет свежесть без повторной десериализации.
* Ключевые scope’ы: `insights:{period}` (сырые данные Graph API), `summary:{period}`/`campaigns:{period}` для подготовленных ответов портала и `campaign-status` для кеша статусов кампаний при отправке алертов.

## Report State (KV: `report-state:{projectId}`)

```json
{
  "projectId": "birlash",
  "lastRunAt": "2025-11-15T06:00:00.000Z",
  "slots": {
    "10:00": "2025-11-15T10:00:12.000Z",
    "18:00": "2025-11-15T18:00:07.000Z"
  },
  "updatedAt": "2025-11-15T18:00:07.000Z"
}
```

* Состояние автоотчётов: `slots` хранит последний запуск каждого таймслота.
* `markReportSlotDispatched` обновляет `slots[slot]` и `lastRunAt` при успешной отправке отчёта, предотвращая дубликаты.

## Alert State (KV: `alert-state:{projectId}:{type}`)

```json
{
  "projectId": "birlash",
  "type": "billing",
  "lastSentAt": "2025-11-15T08:00:00.000Z",
  "lastEventKey": "due:2025-12-15T00:00:00.000Z",
  "updatedAt": "2025-11-15T08:00:00.000Z"
}
```

* `type` принимает значения `billing`, `budget`, `meta-api`, `pause`.
* `shouldSendAlert` сравнивает `eventKey` и таймаут для подавления повторных уведомлений.
* `markAlertSent` обновляет запись после успешного пуша в Telegram.

## Lead (R2: `leads/{projectId}/{leadId}.json`)

```json
{
  "id": "343782",
  "projectId": "birlash",
  "name": "Sharofat Ona",
  "phone": "+998902867999",
  "source": "facebook",
  "campaign": "Лиды - тест",
  "adset": "Женщины 25-45",
  "ad": "Креатив №3",
  "createdAt": "2025-11-14T21:54:26.000Z",
  "status": "NEW",
  "lastStatusUpdate": "2025-11-14T21:54:26.000Z",
  "metaRaw": { "leadgen_id": "343782", "campaign_name": "Лиды - тест" }
}
```

* `parseMetaWebhookPayload` извлекает projectId, имя, телефон и UTM-поля из webhook Meta, дедуплицируя лиды по `leadgen_id`.
* `createLead` заполняет обязательные поля, нормализует имя/телефон и выставляет `status = "NEW"`, `lastStatusUpdate = createdAt`.
* `saveLead` складывает JSON в R2, а `/api/meta/webhook` вызывает `dispatchLeadNotifications` для отправки уведомлений в Telegram.

## Payment (R2: `payments/{projectId}/{paymentId}.json`)

```json
{
  "id": "pay_birlash_20251215_ab12cd",
  "projectId": "birlash",
  "amount": 500,
  "currency": "USD",
  "periodStart": "2025-11-15",
  "periodEnd": "2025-12-15",
  "status": "PLANNED",
  "paidAt": null,
  "comment": null,
  "createdBy": 123456789,
  "createdAt": "2025-11-15T10:05:00.000Z",
  "updatedAt": "2025-11-15T10:05:00.000Z"
}
```

* `createPayment` нормализует суммы и даты, генерирует `pay_{projectId}_{periodEnd}_{suffix}` при отсутствии `id`.
* `savePayment` сериализует запись в R2; биллинг-операции бота создают платежи со статусом `PLANNED`.
* `listProjectPayments` читает последние записи по префиксу `payments/{projectId}/`.

## Bot Session (KV: `bot-session:{telegramUserId}`)

```json
{
  "userId": 123456789,
  "state": { "type": "billing:manual", "projectId": "birlash" },
  "updatedAt": "2025-11-15T10:05:00.000Z"
}
```

* `getBotSession` создаёт запись по умолчанию (`state.type = "idle"`) при первом обращении.
* `saveBotSession` фиксирует состояние ожидания (ручная дата/сумма) перед продолжением диалога.
* `clearBotSession` возвращает пользователя в `idle` после успешного обновления настроек биллинга.

## REST API поверхности

| Method & Path                          | Описание                                        |
| -------------------------------------- | ------------------------------------------------ |
| `GET /api/projects/:projectId`         | Возвращает проект + актуальные настройки         |
| `PUT /api/projects/:projectId/settings`| Обновляет настройки проекта с валидацией         |
| `POST /api/projects/:projectId/sessions` | Создаёт сессию портала с настраиваемым TTL     |
| `PUT /api/meta/tokens/:facebookUserId` | Сохраняет access/refresh токены Meta Ads        |
| `GET /api/meta/projects/:projectId/summary` | Возвращает кешированный summary по показателям |
| `GET /api/meta/projects/:projectId/campaigns` | Отдаёт сырые данные кампаний (level=campaign) |
| `GET /api/projects/:projectId/leads`  | Лиды за период для клиентского портала         |
| `GET /api/projects/:projectId/campaigns` | Нормализованные кампании для портала          |
| `GET /portal/:projectId`              | HTML-портал с прелоадером и табами периодов    |
| `POST /api/meta/webhook` | Принимает webhook Meta Ads, импортирует лиды и запускает уведомления |
| `POST /api/telegram/webhook`            | Обрабатывает команды Telegram-бота (меню, карточки, биллинг) |

Эти роуты подключены в `registerCoreRoutes`: проектные операции обслуживает `registerProjectRoutes`, а Meta-прокси — `registerMetaRoutes` с общей обвязкой валидации и кеширования.
