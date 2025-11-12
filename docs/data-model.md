# ER-диаграмма TargetBot

```
┌────────────┐       ┌─────────────┐       ┌───────────────┐       ┌──────────────┐       ┌──────────────┐
│  User      │1     *│   Lead      │       │ MetaToken     │       │ Report       │       │ PortalKey     │
│────────────│-------│─────────────│       │───────────────│       │──────────────│       │──────────────│
│ id (PK)    │       │ id (PK)     │       │ accessToken   │       │ id (PK)      │       │ key (PK)      │
│ role       │       │ userId (FK) │──────▶│ accountId     │       │ filename     │       │ role          │
│ username   │       │ name        │       │ campaignId    │       │ periodFrom   │       │ label         │
│ firstName  │       │ contact     │       │ expiresAt     │       │ periodTo     │       │ owner         │
│ lastName   │       │ status      │       │ updatedAt     │       │ createdAt    │       │ createdAt     │
│ token      │       │ notes       │       │ refreshToken? │       │ url (R2)     │       │ lastUsedAt    │
│ createdAt  │       │ source      │       │               │       │              │       │ scopes?       │
└────────────┘       │ createdAt   │       └───────────────┘       └──────────────┘       └──────────────┘
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

### Meta Stats Summary (`KV_META`)
- `meta:stats:last` — агрегированный снимок CPL/CTR для дашборда.
- `totals` — сумма spend/leads/clicks/impressions, вычисленные CPL и CTR.
- `insights[]` — нормализованные записи по кампаниям.

### Portal Keys (`KV_META`)
- `key` — уникальный UUID-ключ, используемый в заголовке `X-Auth-Key`.
- `role` — уровень доступа (`admin`, `manager`, `partner`, `service`).
- `label` — произвольное описание / название интеграции.
- `owner` — ID связанного пользователя или партнёра (опционально).
- `lastUsedAt` — последняя отметка использования ключа.

### Отчёты (`R2_REPORTS`)
- `id` — имя отчёта (например, дата).
- `filename` — ключ в бакете R2 (`reports/<id>`).
- `period.from` / `period.to` — границы выгрузки.
- `createdAt` — дата загрузки файла в R2.
