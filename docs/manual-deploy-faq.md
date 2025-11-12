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

---

Если ошибка не описана в этом списке, зафиксируйте полное сообщение об ошибке и обратитесь к документации Cloudflare Workers или внутреннему runbook команды TargetBot.
