# Telegram Webhook Setup Guide

Эта инструкция описывает, как подключить Telegram Bot API к TargetBot Worker'у, где находится обработчик вебхука и как вручную задать URL.

## 1. Где находится обработчик

- **Файл:** `src/routes/telegram.ts`
- **Регистрация маршрутов:** функция `registerTelegramRoutes` вызывается из `src/routes/index.ts`, которая подключается в `src/index.ts` — основной entrypoint Cloudflare Worker'а.
- **Точки входа:**
  - `POST /tg-webhook` — основной публичный URL, который необходимо указать в Telegram.
  - `POST /api/telegram/webhook` — внутренний alias для обратной совместимости.

Оба пути обрабатывают JSON с обновлениями Telegram, загружают контроллер бота (`src/bot/controller.ts`) и передают события в доменную логику.

## 2. Пример входящего JSON

Webhook получает стандартные Telegram updates. Пример запроса, который приходит на Worker:

```json
{
  "update_id": 123456789,
  "message": {
    "message_id": 42,
    "date": 1700000000,
    "chat": {
      "id": 123456789,
      "type": "private",
      "username": "target_client",
      "first_name": "Target",
      "last_name": "Client"
    },
    "from": {
      "id": 123456789,
      "is_bot": false,
      "first_name": "Target",
      "last_name": "Client",
      "username": "target_client",
      "language_code": "ru"
    },
    "text": "/start"
  }
}
```

## 3. Как вручную задать webhook

### 3.1 Подготовить токен

1. Получите Bot Token у `@BotFather` и убедитесь, что секрет сохранён в Cloudflare Worker как `TELEGRAM_BOT_TOKEN` **или** (для обратной совместимости) `BOT_TOKEN`. Используйте одну из команд:
   ```bash
   wrangler secret put TELEGRAM_BOT_TOKEN
   # или, если в продакшене уже используется BOT_TOKEN:
   wrangler secret put BOT_TOKEN
   ```
2. Для команд ниже замените `<token>` на фактический токен бота.

### 3.2 Указать URL вебхука

Выполните запрос `setWebhook`, указав публичный URL воркера:

```bash
curl "https://api.telegram.org/bot<token>/setWebhook?url=https://targetbot-worker.buyclientuz.workers.dev/tg-webhook"
```

> Если используется иное доменное имя, замените `https://targetbot-worker.buyclientuz.workers.dev` на фактический хост.

### 3.3 Ожидаемый ответ Telegram

При успешной установке Telegram вернёт JSON вида:

```json
{
  "ok": true,
  "result": true,
  "description": "Webhook was set"
}
```

Если `ok = false`, проверьте корректность токена и доступность URL (должен отвечать с кодом 200). Сообщение вида `{"error":"Telegram bot token is not configured ..."}` в логах воркера означает, что переменная `TELEGRAM_BOT_TOKEN`/`BOT_TOKEN` не задана.

### 3.4 Проверка статуса вебхука

1. Запросите информацию о текущем вебхуке:

   ```bash
   curl "https://api.telegram.org/bot<token>/getWebhookInfo"
   ```

2. В ответе поле `url` должно совпадать с `https://targetbot-worker.buyclientuz.workers.dev/tg-webhook`, а `last_error_message` быть пустым.

3. Дополнительно отправьте сообщение боту и убедитесь, что в логах Cloudflare Worker (или через `wrangler tail`) появляются события без ошибок `Invalid Telegram payload`. Если бот не отвечает, проверьте, что `wrangler secret list` показывает `TELEGRAM_BOT_TOKEN` или `BOT_TOKEN` и что значение соответствует тому, что использовалось при вызове `setWebhook`.

После этих шагов бот начнёт получать все входящие обновления через указанный вебхук.
