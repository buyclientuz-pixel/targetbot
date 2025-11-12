# Manual Deployment FAQ

Справочник по распространённым ошибкам при ручном деплое TargetBot на Cloudflare Workers. Перед началом релиза можно быстро пробежаться по [Manual Deployment Quickstart](./manual-deploy-quickstart.md), а затем вернуться сюда при возникновении ошибок.

## 1. `Error: Failed to fetch environment` при `wrangler dev`

**Причина:** Wrangler не смог авторизоваться или найти `.dev.vars`.

**Решение:**
- Убедитесь, что выполнен `wrangler login` либо настроен `CLOUDFLARE_API_TOKEN`.
- Проверьте, что в корне репозитория есть файл `.dev.vars` с актуальными значениями (можно скопировать из `.env`).
- Перезапустите `wrangler dev` после сохранения файла.

## 2. `KV namespace not found`

**Причина:** Указанные в `wrangler.toml` пространства KV отсутствуют в аккаунте Cloudflare.

**Решение:**
1. Откройте Cloudflare Dashboard → Workers & Queues → KV.
2. Создайте пространства с идентификаторами из `wrangler.toml` (`kv_users_targetbot`, `kv_leads_targetbot`, `kv_meta_targetbot`, `kv_logs_targetbot`).
3. Повторите деплой: `npx wrangler deploy`.

## 3. Ошибка авторизации Telegram webhook (`403 Invalid bot id`)

**Причина:** Запрос приходит на `/telegram/:botId` с идентификатором, отличным от ID токена в `.env`.

**Решение:**
- Убедитесь, что переменные `BOT_TOKEN` и `TELEGRAM_BOT_TOKEN` заполнены корректно.
- В тестовых запросах используйте `https://.../telegram/<BOT_ID>` с числовым идентификатором до двоеточия.
- Если токен был обновлён в BotFather, замените его в `.env` и `.dev.vars`.

## 4. `HTTP 403` при вызове REST API

**Причина:** Отсутствует заголовок `X-Auth-Key` или `Authorization`.

**Решение:**
- Передавайте `X-Auth-Key: !Lyas123` (или другой действующий ключ) во всех защищённых запросах.
- Создайте и скопируйте новый ключ в админке (вкладка «Settings → API ключи»), если стандартный ключ был отозван.

## 5. Ошибка `Unsupported protocol scheme` при обращении к R2

**Причина:** Неверный `R2_ENDPOINT` или пропущенный `https://`.

**Решение:**
- Проверьте значение `R2_ENDPOINT` в `.env` и `.dev.vars`.
- Убедитесь, что оно соответствует формату `https://<accountid>.r2.cloudflarestorage.com`.

## 6. `TypeError: Cannot read properties of undefined (reading 'put')`

**Причина:** В окружении воркера отсутствует биндинг KV или R2 из-за опечатки в имени переменной.

**Решение:**
- Сверьте названия биндингов в коде (`env.KV_LEADS`, `env.R2_REPORTS` и т.д.) с блоком `wrangler.toml`.
- После правки конфигурации перезапустите `wrangler dev` или выполните `npx wrangler deploy`.

## 7. `npx wrangler deploy` зависает на загрузке

**Причина:** Отсутствие сети или блокировка Cloudflare API.

**Решение:**
- Проверьте соединение и повторите команду.
- Если используете прокси/VPN, добавьте исключение для `cloudflare.com`.
- В крайнем случае выполните деплой с другого окружения.

## 8. `npm ERR! 403 Forbidden` при установке зависимостей

**Причина:** В корпоративной сети или изолированной среде может быть запрещён доступ к `registry.npmjs.org`, либо `npm` настроен
на прокси без разрешения скачивать пакеты `@cloudflare/*`.

**Решение:**
- Проверьте значения `npm config get registry`, `npm config get proxy` и `npm config get https-proxy`.
- Если используется приватный регистр, добавьте mirror для пакетов `@cloudflare/*` или временно выполните `npm config set registry https://registry.npmjs.org/`.
- При невозможности изменить политики доступа выполните `npm install` в окружении с разрешённым интернетом и перенесите подготовленный каталог `node_modules` (или собранный бандл) в рабочее окружение перед запуском `wrangler dev`.

## 9. `npm ci can only install packages when your package.json and package-lock.json are in sync`

**Причина:** В аккаунте всё ещё мог остаться lock-файл из старого CI/CD, который не совпадает с текущим `package.json`. При ручном деплое мы не используем `npm ci`, но Cloudflare Dashboard или локальные скрипты могли сохранить устаревший `package-lock.json`.

**Решение:**
- Удалите старый lock-файл: `rm -f package-lock.json`.
- Выполните `npm install`, чтобы npm пересоздал lock-файл под текущий список зависимостей.
- Зафиксируйте изменения (`git add package.json package-lock.json`) и сделайте коммит, чтобы все участники использовали одну и ту же версию зависимостей.
- Повторите `npm run build` и `npx wrangler deploy`.

## 10. Cloudflare Dashboard продолжает запускать `npm ci`

**Причина:** В настройках Workers осталась дефолтная build-команда `npm ci`, которая конфликтует с ручным сценарием.

**Решение:**
- Перейдите в Cloudflare Dashboard → Workers → *targetbot* → **Settings → Build**.
- В поле **Build command** замените значение на `npm install && npm run build` (или просто `npm install`, если билд не требуется).
- Очистите поле **Build output directory**, чтобы воркер не искал статический артефакт.
- Повторите деплой через панель или используйте `npx wrangler deploy` — `npm ci` больше запускаться не будет.

---

Если ошибка не описана в этом списке, зафиксируйте полное сообщение об ошибке и обратитесь к документации Cloudflare Workers или внутреннему runbook команды TargetBot.
