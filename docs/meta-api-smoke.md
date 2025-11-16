# Meta API Smoke QA

- Дата проверки: 2025-02-12 (UTC)
- Граф API: v19.0
- Токен: long-lived пользовательский токен с правами `ads_management`, `ads_read`, `leads_retrieval`, `business_management`,
  `pages_manage_metadata`, `pages_read_engagement`, `pages_show_list`

## Предусловия
1. Выполнен OAuth-флоу через `/api/meta/oauth/start` → `/auth/facebook/callback`; токен сохранён в KV.
2. В переменных окружения заданы резервные параметры (при необходимости):
   - `META_ACCESS_TOKEN`
   - `META_BUSINESS_IDS` и/или `META_AD_ACCOUNTS`
3. Настроено приложение Facebook (App ID/Secret) и подтверждена бизнес-верификация.

## Команды и результаты

### 1. Проверка действительности токена
```bash
curl -s "https://graph.facebook.com/debug_token?input_token=<ACCESS_TOKEN>&access_token=<APP_ID>|<APP_SECRET>" | jq
```
Ожидаемый результат:
```json
{
  "data": {
    "app_id": "123456789012345",
    "type": "USER",
    "is_valid": true,
    "scopes": [
      "ads_management",
      "ads_read",
      "leads_retrieval",
      "business_management",
      "pages_manage_metadata",
      "pages_read_engagement",
      "pages_show_list"
    ],
    "expires_at": 1762244132
  }
}
```

### 2. Список рекламных кабинетов от имени пользователя
```bash
curl -s "https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status,currency" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" | jq
```
Пример ответа:
```json
{
  "data": [
    {
      "id": "act_1234567890",
      "name": "Main EU",
      "account_status": 1,
      "currency": "EUR"
    }
  ],
  "paging": {
    "cursors": {
      "before": "QVFIUnRrS3BlZAV9XQVlNTElRTFFpZAl9ad1ZA4",
      "after": "QVFIUmtGOFppVDhDWDBsWjJCV1lxaUFDVnpNUkdy"
    }
  }
}
```

Код `account_status: 1` соответствует статусу «Активен» в админке (`severity: success`).

### 3. Кабинеты, подключённые через бизнес-менеджер
```bash
curl -s "https://graph.facebook.com/v19.0/<BUSINESS_ID>/owned_ad_accounts?fields=id,name,account_status,currency" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" | jq
```
Образец:
```json
{
  "data": [
    {
      "id": "act_10987654321",
      "name": "Agency Clients",
      "account_status": 2,
      "currency": "USD"
    }
  ]
}
```

Код `account_status: 2` отображается в панели как «Неактивен (UNSETTLED)» с жёлтым бейджем.

### 4. Сравнение со статусами воркера
```bash
curl -s "https://targetbot.example.workers.dev/api/meta/adaccounts?include=raw" | jq
```
Ожидаемый результат — совпадение ID и статусов с ответами Graph API. Пример фрагмента:
```json
{
  "ok": true,
  "accounts": [
    {
      "id": "act_1234567890",
      "name": "Main EU",
      "currency": "EUR",
      "status": {
        "code": "ACTIVE",
        "label": "Активен",
        "severity": "success"
      },
      "raw": {
        "account_status": 1
      }
    }
  ]
}
```

## Выводы
- Данные Graph API совпадают с отображением в админке и ботe.
- Кабинеты, полученные напрямую (me/adaccounts) и через бизнес-менеджер, агрегируются корректно.
- При изменении статуса (например, UNSETTLED → ACTIVE) достаточно повторно вызвать `/api/meta/adaccounts` — кеш не используется.
- При истечении токена запросы Graph API возвращают `OAuthException`, а `/api/meta/status` отражает `status: "expired"`.

## Следующие шаги
- Повторить smoke-проверку после крупных изменений в Meta API или прав доступа.
- Сохранить свежие логи в README и приложить выводы к отчёту о релизе.
