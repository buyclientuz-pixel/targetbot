# Meta OAuth UX Verification

Дата проверки: 2025-02-12 (UTC).

## Preconditions
- В KV уже сохранён рабочий токен после предыдущей авторизации (`metaToken` ключ в namespace `DB`).
- В `.dev.vars` или секрете Cloudflare заданы `FB_APP_ID`, `FB_APP_SECRET`.
- В браузере открыт `https://targetbot.example.workers.dev/admin` под учётной записью администратора.

## Steps
1. Нажать кнопку **«Авторизоваться в Facebook»** на панели Meta.
2. Пройти редирект на `https://www.facebook.com/v19.0/dialog/oauth` и подтвердить доступ приложения к `ads_management`,
   `ads_read`, `leads_retrieval`, `business_management`, `pages_manage_metadata`, `pages_read_engagement`, `pages_show_list`.
3. После редиректа на `/auth/facebook/callback?code=...` дождаться ответа воркера:
   - В KV появляется запись `metaToken` с новым `access_token` и `expires_at`.
   - `GET /api/meta/status` возвращает `{"ok":true,"data":{"status":"valid"...}}`.
4. Завершение флоу возвращает пользователя на `/admin?meta=success`.
5. Флеш-баннер «Meta OAuth успешно подключён.» отображается в верхней части админки.
6. Через `history.replaceState` параметры `meta` и `metaMessage` очищаются из адресной строки без перезагрузки.
7. Нажать **«Обновить токен»** — воркер отвечает 200/JSON, страница перезагружается и флеш-баннер исчезает.

## Observations
- При отсутствии `code` в callback воркер редиректит на `/admin?meta=error&metaMessage=...` с флеш-баннером об ошибке.
- При запросе с `Accept: application/json` callback возвращает JSON: `{ "ok": true, "data": { ... } }`.
- Повторный запуск OAuth обновляет таймстамп `refreshedAt` в блоке Meta статуса.

## Follow-up
- При каждой смене токена рекомендуется фиксировать отметку времени в разделе README → «Smoke-проверка API».
