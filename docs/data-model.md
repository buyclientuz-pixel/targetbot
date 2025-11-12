# ER-диаграмма TargetBot

```
┌────────────┐       ┌─────────────┐       ┌───────────────┐       ┌──────────────┐
│  User      │1     *│   Lead      │       │ MetaToken     │       │ Report       │
│────────────│-------│─────────────│       │───────────────│       │──────────────│
│ id (PK)    │       │ id (PK)     │       │ accessToken   │       │ id (PK)      │
│ role       │       │ userId (FK) │──────▶│ accountId     │       │ filename     │
│ username   │       │ name        │       │ campaignId    │       │ periodFrom   │
│ firstName  │       │ contact     │       │ expiresAt     │       │ periodTo     │
│ lastName   │       │ status      │       │ updatedAt     │       │ createdAt    │
│ token      │       │ notes       │       │ refreshToken? │       │ url (R2)     │
│ createdAt  │       │ source      │       │               │       │             │
└────────────┘       │ createdAt   │       └───────────────┘       └──────────────┘
                     │ updatedAt   │
                     └─────────────┘
```

## Таблицы и ключевые поля

### Пользователи (`KV_USERS`)
- `id` — Telegram ID пользователя (число).
- `role` — одна из ролей `client`, `manager`, `admin`.
- `token` — UUID для доступа к порталу.
- `createdAt` — время регистрации.

### Лиды (`KV_LEADS`)
- `id` — UUID лид-заявки.
- `userId` — ссылка на пользователя (FK к `User.id`).
- `status` — `new`, `in_progress`, `closed`.
- `source` — канал получения (`telegram`, `facebook`, `manual`).
- `notes` — комментарии менеджеров.
- `createdAt` / `updatedAt` — временные метки.

### Meta Token (`KV_META`)
- `accessToken` — long-lived token Facebook Graph API.
- `accountId`, `campaignId` — актуальные идентификаторы.
- `expiresAt`, `updatedAt` — контроль жизненного цикла.

### Отчёты (`R2_REPORTS`)
- `id` — имя отчёта (например, дата).
- `filename` — ключ в бакете R2 (`reports/<id>`).
- `period.from` / `period.to` — границы выгрузки.
- `createdAt` — дата загрузки файла в R2.
