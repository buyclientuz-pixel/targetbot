# Деплой Targetbot

Этот документ описывает, как подготовить окружение и деплоить Cloudflare Worker вручную. Проект не использует CI-пайплайны и выполняет сборку только из локальной среды разработчика или админа.

## Предварительные требования

- Node.js 18+ и npm 9+.
- Установленный `wrangler` (используется локально через `npm install`).
- Доступ к аккаунту Cloudflare с правами на деплой воркера.
- Переменные окружения `CLOUDFLARE_API_TOKEN` и `CLOUDFLARE_ACCOUNT_ID`.
- Telegram токен (`BOT_TOKEN` либо `TELEGRAM_BOT_TOKEN`) для отправки уведомлений о лидах.
- Пара Facebook/Meta (`FB_APP_ID`, `FB_APP_SECRET`) для OAuth.

## Настройка зависимостей

```bash
npm install
```

> В офлайн-средах установка пакетов может завершиться ошибкой 403. Выполните команду в окружении с доступом к npm-регистри, затем закоммитьте обновлённый `package-lock.json` или скопируйте папку `node_modules` в нужную машину.

## Локальная разработка

1. Экспортируйте переменные окружения в терминале или создайте `.dev.vars` (используется Wrangler):
   ```bash
   export BOT_TOKEN="<telegram-token>"
   export FB_APP_ID="<meta-app-id>"
   export FB_APP_SECRET="<meta-app-secret>"
   export CLOUDFLARE_ACCOUNT_ID="<account>"
   export CLOUDFLARE_API_TOKEN="<api-token>"
   ```
2. Запустите дев-сервер Cloudflare Workers:
   ```bash
   npm run dev
   ```
3. Откройте `http://127.0.0.1:8787/admin` для админки или вызывайте API ручками (`/api/meta/status`, `/api/projects`, `/api/users`).

## Подготовка к деплою

1. Убедитесь, что в README отмечен актуальный прогресс и описаны изменения.
2. Проверьте, что в Cloudflare Dashboard → Workers → Settings → Variables заданы все токены.
3. Выполните сухой прогон сборки (Wrangler выполняет бандлинг и статическую проверку):
   ```bash
   npm run build
   ```
   Команда использует `wrangler deploy --dry-run` и не публикует воркер.

## Деплой

1. Выполните команду:
   ```bash
   npm run deploy
   ```
2. Дождитесь успешного завершения (`Success: Finished deploying worker`).
3. Перейдите в Cloudflare Dashboard → Workers → выбранный воркер → **Deployments** и убедитесь, что новая версия активна.

Если Cloudflare запрашивает подтверждение прав, перейдите по ссылке в терминале Wrangler и авторизуйтесь через браузер.

## Постдеплойная проверка

После публикации вручную выполните smoke-тесты:

```bash
curl -i https://<worker>/health
curl -i https://<worker>/api/meta/status
curl -i https://<worker>/api/meta/adaccounts
curl -i https://<worker>/api/projects
curl -i https://<worker>/api/users
```

Дополнительно откройте `/admin` и `/portal/<projectId>` в браузере (если `PORTAL_BASE_URL` не задан, ссылка должна открыться на workers.dev домене по умолчанию).

При ошибках:
- Проверьте логи в Cloudflare Dashboard → Workers → Logs.
- Убедитесь, что токены Meta и Telegram заданы и не истекли.
- Перезапустите `npm run build` локально, чтобы воспроизвести проблему.

## Управление секретами

- **Через Cloudflare Dashboard**: Workers & Pages → ваш воркер → Settings → Variables.
- **Через Wrangler**:
  ```bash
  echo "<value>" | npx wrangler secret put BOT_TOKEN
  ```
  Повторите команду для `FB_APP_ID`, `FB_APP_SECRET` и других секретов.

Все переменные читаются напрямую из `env`, поэтому пересоздавать воркер или KV не требуется.

## Откат

1. Откройте Cloudflare Dashboard → Workers → нужный воркер → Versions.
2. Выберите стабильную версию и нажмите **Promote**.
3. Задокументируйте откат в README (раздел Progress) и заведите задачу на устранение причины.

## Полезные ссылки

- Документация Wrangler: https://developers.cloudflare.com/workers/wrangler/
- Graph API Meta: https://developers.facebook.com/docs/graph-api/
- Telegram Bot API: https://core.telegram.org/bots/api
