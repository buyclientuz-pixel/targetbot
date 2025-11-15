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

## REST API поверхности

| Method & Path                          | Описание                                        |
| -------------------------------------- | ------------------------------------------------ |
| `GET /api/projects/:projectId`         | Возвращает проект + актуальные настройки         |
| `PUT /api/projects/:projectId/settings`| Обновляет настройки проекта с валидацией         |
| `POST /api/projects/:projectId/sessions` | Создаёт сессию портала с настраиваемым TTL     |

Эти роуты подключены через `registerProjectRoutes` и защищены проверками существования проекта, корректности JSON и доменной валидацией.
