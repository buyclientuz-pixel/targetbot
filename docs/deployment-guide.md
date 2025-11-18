# TargetBot — Деплой и операционная памятка

Этот документ описывает, как собрать, задеплоить и поддерживать обновлённый TargetBot на Cloudflare Workers.

## 1. Предварительные требования
- Node.js 20+
- Wrangler CLI 3.x с авторизацией в вашем Cloudflare аккаунте (`npx wrangler login`).
- Доступ к Cloudflare KV и R2 (права Read/Write).
- Telegram Bot Token с включённым webhook-доступом.
- Meta Graph API App ID/Secret и разрешения на чтение маркетинговых данных.

## 2. Подготовка окружения
1. Склонируйте репозиторий и установите зависимости:
   ```bash
   git clone <repo-url>
   cd targetbot
   npm install
   ```
2. Скопируйте файл `wrangler.toml` и заполните биндинги:
   ```toml
   name = "th-reports"
   main = "src/index.ts"

   [vars]
   TELEGRAM_BOT_TOKEN = "..." # или используйте BOT_TOKEN для обратной совместимости
   TELEGRAM_ADMIN_ID = "123456789"

   [[kv_namespaces]]
   binding = "KV"
   id = "<kv-namespace-id>"

   [[r2_buckets]]
   binding = "R2"
   bucket_name = "targetbot-data"
   ```
   > Продакшн-домен Cloudflare Workers: `https://th-reports.buyclientuz.workers.dev`.
3. Добавьте защищённые секреты:
   ```bash
   # основной вариант
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   # если в текущем продакшене используется старое имя
   npx wrangler secret put BOT_TOKEN
   npx wrangler secret put META_APP_ID
   npx wrangler secret put META_APP_SECRET
   npx wrangler secret put META_APP_SYSTEM_USER_TOKEN
   ```
4. Проверьте наличие планировщика:
   ```bash
   npx wrangler deploy --dry-run
   npx wrangler dispatch-logs th-reports
   ```

## 3. Конфигурация KV
| Ключ | Назначение |
| --- | --- |
| `config:lead-retention-days` | Срок хранения лидов в R2 (по умолчанию 14). |
| `config:meta-cache-retention-days` | TTL кешей Meta (по умолчанию 3). |
| `config:report-scan-window` | Окно проверки автоотчётов (в минутах, по умолчанию 5). |
| `project:{projectId}` | Данные проекта. |
| `project-settings:{projectId}` | Настройки проекта (чаты, биллинг, автоотчёты). |
| `meta-token:{fbUserId}` | OAuth-токены Meta. |
| `meta-cache:{projectId}:{scope}` | Кешы статистики. |
| `portal-session:{sessionId}` | Сессии клиентского портала. |
| `bot-session:{telegramUserId}` | Состояния диалогов бота. |
| `report-state:{projectId}:{slot}` | Состояния автоотчётов. |

## 4. Конфигурация R2
```
leads/{projectId}/{leadId}.json
payments/{projectId}/{paymentId}.json
campaign-stats/{projectId}/{date}.json
logs/{date}/... (опционально)
```

## 5. Локальная разработка
1. Запустите дев-сервер:
   ```bash
   npm run dev
   ```
2. Прогоните тесты перед коммитом:
   ```bash
   npm run lint
   npm run typecheck
   npm run test
   ```
3. Для ручной проверки webhook’ов используйте `wrangler dev --remote`.

## 6. Деплой
1. Соберите проект:
   ```bash
   npm run build
   ```
2. Выполните деплой:
   ```bash
   npm run deploy
   ```
3. Убедитесь, что планировщик активен:
   ```bash
   npx wrangler deployments list
   ```
4. Проверьте логи:
   ```bash
   npx wrangler tail
   ```

## 7. Релизы и откаты
- Каждый релиз сопровождайте запуском `npm run qa` и фиксацией версии в git тегом.
- Для отката используйте `npx wrangler deployments rollback <deployment-id>`.
- Храните архивы конфигурации KV/R2 (`wrangler kv:namespace export`, `wrangler r2 object list`).

## 8. Мониторинг
- Подключите Cloudflare Analytics или Workers Metrics для слежения за ошибками и latency.
- Включите оповещения о неудачных Cron-триггерах.
- Для Meta токенов настройте напоминания о ротации (раз в 50 дней).

## 9. Контроль качества
- Перед каждым релизом проверяйте портал на 2 последних проектах (ручная дымовая проверка).
- Для регрессионных сценариев используйте snapshot данных в R2 (предпрод с тестовыми проектами).
- Ведите чек-лист: лид → уведомление → портал → оплата → автоотчёт.

## 10. Экстренные действия
- При сбое Meta API временно отключите auto-sync или снижайте частоту запросов через `config:meta-cache-retention-days`, чтобы подавить шум.
- При подозрении на утечку токена — отозвать Meta System User token и обновить `meta-token:*`.
- При поломке бота — перевести `project-settings.portalEnabled = false`, чтобы скрыть ссылки на портал.

