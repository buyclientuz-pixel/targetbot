# Manual Deployment Quickstart

Краткая памятка по ручному обновлению TargetBot на Cloudflare Workers. Используйте её как шпаргалку перед каждым релизом.

## 1. Подготовьте окружение
- Обновите `.env` и `.dev.vars` актуальными токенами и ключами.
- При необходимости выполните `wrangler login` или убедитесь, что `CLOUDFLARE_API_TOKEN` доступен в окружении.
- В Cloudflare Dashboard → Workers → **Settings → Build** замените `npm ci` на `npm install && npm run build`, чтобы панель деплоя
  не запускала запрещённую команду.

## 2. Обновите админ-панель (если правили UI)
```bash
node scripts/embed-admin.mjs
```

## 3. Установите зависимости
```bash
npm install
```

## 4. Соберите TypeScript-источники
```bash
npm run build
```

## 5. Проверьте воркер локально
```bash
npx wrangler dev --local
```
- Откройте `http://127.0.0.1:8787/admin?key=!Lyas123` и выполните короткий смоук-тест.
- При необходимости выполните curl-запросы к `/api/health` и `/api/leads`.

## 6. Выполните деплой
```bash
npx wrangler deploy
```

## 7. Зафиксируйте результат
- Запишите используемый commit hash и время деплоя.
- Проверьте публичные эндпоинты воркера и убедитесь, что ответы совпадают с локальными тестами.

> Если на любом шаге возникли ошибки, обратитесь к [Manual Deployment FAQ](./manual-deploy-faq.md) и [Cloudflare Manual Verification Guide](./cloudflare-manual-check.md).
