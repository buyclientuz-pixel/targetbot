# Cloudflare Worker Dashboard

This repository содержит Cloudflare Worker `th-reports`, который теперь выдаёт обновлённую HTML-панель. На главном экране вы видите карточки проектов с чатами Telegram и агрегированный статус биллинга Meta.

## Краткий обзор

- ✅ `wrangler.toml` по‑прежнему нацелен на Worker `th-reports` в аккаунте `02e61f874be22f0f3a6ee8f97ccccb1d`.
- ✅ `src/index.ts` рендерит UI: карточки проектов формируются по данным из KV (`chat.title`, `accountName`, `tgTopicLink`), статус биллинга нормализуется по мета‑полям.
- ⏭️ Следующий шаг: убедитесь, что в KV есть актуальные данные, затем задеплойте изменения через `wrangler deploy`.

## Этапы работы

### Этап 1. Подготовить данные в KV

1. В Cloudflare Dashboard откройте **Workers & Pages → th-reports → Settings → Variables and bindings → KV Namespace bindings**.
2. Проверьте, что указаны namespace ID для `REPORTS_NAMESPACE`, `BILLING_NAMESPACE` и `LOGS_NAMESPACE`. При необходимости обновите их в `wrangler.toml`.
3. Для карточек проектов создайте записи в `REPORTS_NAMESPACE`. Каждое значение — JSON со структурой:
   ```json
   {
     "projectName": "Название проекта",
     "accountName": "Meta Business Account",
     "description": "(опционально) краткое описание",
     "chats": [
       {
         "title": "Чат менеджеров",
         "tgTopicLink": "https://t.me/c/...."
       }
     ]
   }
   ```
   Поля `title` и `tgTopicLink` используются для списка чатов и кнопки «Перейти в чат» внутри карточки.
4. В `BILLING_NAMESPACE` добавьте ключи `account_status`, `disable_reason`, `balance`, `spend_cap` (строки). Worker автоматически превращает их в нормализованную строку состояния.

### Этап 2. Проверить биллинг Meta

1. Откройте главную страницу Worker (`/`).
2. Убедитесь, что блок «Статус биллинга» корректно описывает состояние: учитывается `account_status`, причина блокировки (если есть), текущий `balance` и лимит `spend_cap`, а также внутренние показатели `limit` и `spent`.
3. При необходимости отредактируйте данные в KV и обновите страницу.

### Этап 3. Деплой и тестирование

1. Установите [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/):
   ```bash
   npm install -g wrangler
   ```
2. Аутентифицируйтесь: `wrangler login` или задайте переменные окружения `CLOUDFLARE_API_TOKEN` и `CLOUDFLARE_ACCOUNT_ID`.
3. Локальный предпросмотр: `wrangler dev`.
4. Деплой в облако: `wrangler deploy`. Worker соберёт код из `src/index.ts` и опубликует обновлённый UI на `https://th-reports.obe1kanobe25.workers.dev`.

## Автоматизация (опционально)

Настройте CI (например, GitHub Actions), чтобы запускать `wrangler deploy` при каждом push в `main`. Храните API-токен и account ID в секретах пайплайна.
