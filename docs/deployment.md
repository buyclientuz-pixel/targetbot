# Деплой и управление секретами

Этот документ описывает, как обновлять секреты Cloudflare Workers и как проходит автоматический деплой из GitHub.

## Автодеплой из GitHub Actions

Workflow `.github/workflows/deploy.yml` запускается при пуше в ветку `main` или вручную через `workflow_dispatch`. Он выполняет:

1. Устанавливает зависимости (`npm install`).
2. Синхронизирует секреты из GitHub Actions secrets в Cloudflare Workers (`production` environment) с помощью скрипта `npm run sync:secrets -- --env production`.
3. Деплоит воркер командой `npm run deploy -- --env production` (требуются `CF_API_TOKEN` и `CF_ACCOUNT_ID`).

> Если какое-то значение не задано в secrets GitHub, шаг синхронизации просто пропустит его и продолжит выполнение.

### Ручная проверка сборки через Wrangler Versions

Для ситуаций, когда нужно прогнать сборку без промоута воркера (например, чтобы убедиться, что бандл собирается после обновления
зависимостей), добавлен workflow `.github/workflows/versions-upload.yml` и npm-скрипт `npm run versions:upload`.

1. Откройте вкладку **Actions** в GitHub и выберите workflow **Upload Worker Version**.
2. Нажмите **Run workflow**, при необходимости укажите окружение Wrangler (`production` по умолчанию).
3. Workflow выполнит `npm install`, а затем `npm run versions:upload -- --env <environment>`, используя `CF_API_TOKEN` и
   `CF_ACCOUNT_ID` из Secrets.
4. В логах появится вывод Wrangler; если сборка завершится ошибкой, деплой не продолжится и текущая активная версия останется
   без изменений.

Локально аналогичную проверку можно сделать командой `npm run versions:upload -- --env production` — она загрузит новую версию в
раздел Workers → Versions, но не активирует её автоматически.

### Какие secrets поддерживаются

Скрипт синхронизации передаёт в Cloudflare следующие ключи (если заданы):

- `BOT_TOKEN`, `ADMIN_IDS`, `DEFAULT_TZ`, `WORKER_URL`.
- `FB_APP_ID`, `FB_APP_SECRET`, `FB_LONG_TOKEN`, `META_LONG_TOKEN`.
- `META_MANAGE_TOKEN`, `PORTAL_TOKEN`, `GS_WEBHOOK`.
- `PROJECT_MANAGER_IDS`, `PROJECT_ACCOUNT_ACCESS`, `PROJECT_CHAT_PRESETS`.
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT`, `R2_ACCOUNT_ID`.

> Можно добавлять дополнительные переменные без модификации workflow: достаточно указать их в `secrets` и в списке `SECRET_DEFINITIONS` внутри `scripts/sync-secrets.mjs`.

## Локальная синхронизация секретов

Для обновления секретов в Cloudflare из локального окружения:

```bash
# Экспортируем значения в текущую сессию
export BOT_TOKEN="..."
export FB_APP_ID="..."
export FB_APP_SECRET="..."
export META_LONG_TOKEN="..."
export R2_ACCESS_KEY_ID="..."
export R2_SECRET_ACCESS_KEY="..."
export R2_BUCKET_NAME="botbucket"
export R2_ENDPOINT="https://<account>.r2.cloudflarestorage.com"
export R2_ACCOUNT_ID="..."

# Отправляем секреты в Cloudflare Workers (production)
npm run sync:secrets -- --env production
```

Опции команды:

- `--env <name>` — окружение Wrangler (`production`, `staging`, `dev`).
- `--config <path>` — путь к `wrangler.toml`, по умолчанию `wrangler.toml` в корне.
- `--dry-run` — показать, какие ключи будут синхронизированы, не отправляя их в Cloudflare.

Скрипт берёт значения только из переменных окружения процесса. Если ключ обязателен (например, `BOT_TOKEN`) и не найден, скрипт завершится с ошибкой.

## Ротация секретов через Cloudflare Dashboard

1. Откройте Cloudflare Dashboard → Workers & Pages → ваш воркер → **Settings → Variables**.
2. В разделе **Environment Variables** отредактируйте нужный секрет.
3. После сохранения запустите деплой (через GitHub Actions или `npm run deploy -- --env production`).

## Проверка деплоя

1. Выполните `npm run check:config -- --ping-telegram`, чтобы убедиться в валидности токенов.
2. Откройте `https://<worker>/health?ping=telegram` и проверьте статус вебхука.
3. Запустите `npm run test:integration -- --base https://<worker>.workers.dev`, чтобы проверить Meta OAuth, `/manage/meta` и клиентский портал.

## Troubleshooting

- **`wrangler secret put` требует интерактивного ввода** — используйте скрипт `sync-secrets`, он передаёт значение через stdin автоматически.
- **`Invalid access token` при авторизации Meta** — обновите `FB_APP_ID`, `FB_APP_SECRET` и выполните OAuth заново через кнопку «Авторизоваться» в админке.
- **`Illegal invocation` при запросах Meta** — убедитесь, что используете актуальную версию воркера (патч уже включён), либо выполните `npm run deploy` повторно.
