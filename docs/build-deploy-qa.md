# Build & Deploy Verification Checklist

Дата последнего обновления: 2025-02-12 (UTC)

## Предусловия
- Рабочая станция с доступом к npm registry (`registry.npmjs.org`).
- Установлены Node.js 22.x и npm 10.x или более новые.
- Авторизованная утилита Wrangler (`npx wrangler login`) с нужными Cloudflare правами.
- В локальном репозитории присутствуют актуальные секреты (`wrangler login` или `wrangler whoami` подтверждает доступ).

## Шаги проверки
1. Выполнить очистку и установку зависимостей:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```
   Ожидаемый результат: npm устанавливает `wrangler@4.47.0` и dev-зависимости без ошибок.

2. Запустить dry-run деплоя:
   ```bash
   npm run build
   ```
   Ожидаемый результат: команда `wrangler deploy --dry-run` завершится успешно с выводом предварительного плана ("Previewing update..."), без реального обновления версии.

3. Выполнить настоящий деплой:
   ```bash
   npm run deploy
   ```
   Ожидаемый результат: Wrangler публикует новую версию воркера, вывод содержит `Success: Finished deploying worker` и URL новой версии.

4. Задокументировать результаты в README (раздел «Логи команд сборки/деплоя») с датой и ключевыми строками вывода.

## Типичные проблемы
- `wrangler: not found` — не установлены dev-зависимости, повторите шаг 1 в окружении с доступом к npm registry.
- Ошибки авторизации Cloudflare — выполните `npx wrangler login` и убедитесь, что выбран правильный аккаунт.
- Конфликтующие изменения в воркере — используйте `wrangler deployments` для просмотра активных версий перед повторным деплоем.

## Подтверждение
После успешного прохождения шагов приложите к README блок с командами и статусом (пример):
```bash
$ npm run build
> wrangler deploy --dry-run
✅ Preview successful

$ npm run deploy
> wrangler deploy
Success: Uploaded worker scripts
Success: Finished deploying worker "th-reports"
```

Зафиксируйте дату/время прогона, инициалы исполнителя и ссылку на dashboard Cloudflare с новой версией.
