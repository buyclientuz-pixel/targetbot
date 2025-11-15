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
  "createdAt": "2025-11-01T10:00:00.000Z",
  "updatedAt": "2025-11-15T10:00:00.000Z"
}
```

* `parseProjectSettings` заполняет отсутствующие поля значениями из `createDefaultProjectSettings`.
* `ensureProjectSettings` создаёт дефолтный JSON при первом запросе и сохраняет его в KV.
* PUT `/api/projects/:id/settings` делает безопасный merge вложенных секций и повторно валидирует payload.

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
      "cpa": 3.23
    },
    "source": { "data": [...] }
  }
}
```

* `createMetaCacheEntry` выставляет `fetchedAt` и TTL, а `saveMetaCache` дублирует TTL в `expirationTtl`.
* `isMetaCacheEntryFresh` проверяет свежесть без повторной десериализации.
* Ключевые scope’ы: `insights:{period}` (сырые данные Graph API) и `summary:{period}`/`campaigns:{period}` для подготовленных ответов портала.

## REST API поверхности

| Method & Path                          | Описание                                        |
| -------------------------------------- | ------------------------------------------------ |
| `GET /api/projects/:projectId`         | Возвращает проект + актуальные настройки         |
| `PUT /api/projects/:projectId/settings`| Обновляет настройки проекта с валидацией         |
| `POST /api/projects/:projectId/sessions` | Создаёт сессию портала с настраиваемым TTL     |
| `PUT /api/meta/tokens/:facebookUserId` | Сохраняет access/refresh токены Meta Ads        |
| `GET /api/meta/projects/:projectId/summary` | Возвращает кешированный summary по показателям |
| `GET /api/meta/projects/:projectId/campaigns` | Отдаёт сырые данные кампаний (level=campaign) |

Эти роуты подключены в `registerCoreRoutes`: проектные операции обслуживает `registerProjectRoutes`, а Meta-прокси — `registerMetaRoutes` с общей обвязкой валидации и кеширования.
