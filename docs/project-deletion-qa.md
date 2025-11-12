# Project Deletion QA

Дата проверки: 2025-02-12 (UTC)

## Предусловия
- Существующий проект `prj_demo` с привязанным чат-линком и рекламным кабинетом.
- В KV хранится запись проекта (`projects:prj_demo`), в R2 — архив лидов `leads/prj_demo.json`.
- У пользователя есть доступ к административным API и интерфейсам `/admin`.

## Шаги и наблюдения

1. **Запрос текущего состояния проекта**
   ```bash
   curl -s https://targetbot.example.workers.dev/api/projects/prj_demo | jq
   ```
   Ожидается `ok: true` и объект проекта с `id: "prj_demo"`.

2. **Удаление проекта через API**
   ```bash
   curl -s -X DELETE \
     https://targetbot.example.workers.dev/api/projects/prj_demo \
     | jq
   ```
   Ответ: `{ "ok": true }`. В логах Wrangler видно, что KV ключ `projects:prj_demo` удалён, а файл `leads/prj_demo.json` в R2 очищен.

3. **Проверка отсутствия артефактов**
   ```bash
   curl -s https://targetbot.example.workers.dev/api/projects/prj_demo | jq
   ```
   Ответ: `{ "ok": false, "error": "NOT_FOUND" }`.

   ```bash
   wrangler r2 object get targetbot-leads/leads/prj_demo.json
   ```
   Команда возвращает код `NoSuchKey`.

4. **Повторное создание проекта**
   ```bash
   curl -s -X POST https://targetbot.example.workers.dev/api/projects \
     -H 'content-type: application/json' \
     -d '{
       "name": "Demo Portal",
       "tgChatLink": "https://t.me/+demo",
       "adAccountId": "act_1234567890"
     }' | jq
   ```
   Ответ: `{ "ok": true, "project": { ... } }`, новый `id` записан в KV.

5. **Проверка чистого архива лидов**
   ```bash
   curl -s "https://targetbot.example.workers.dev/api/leads?projectId=<newId>" | jq
   ```
   Ответ: `{ "ok": true, "leads": [] }` — архив создан заново без старых лидов.

6. **UI валидация**
   - `/admin`: карточка проекта отображается с нулевыми счётчиками лидов.
   - `/portal/<newId>`: таблица пустая, кнопки фильтров активны, при создании нового лида запись появляется корректно.

## Выводы
- Удаление проекта очищает KV и R2 артефакты.
- Повторное создание запускает новый архив лидов и корректно отображается в UI.
- Дополнительных ручных очисток не требуется.
