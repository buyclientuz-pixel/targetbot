# Callback schema

Стандартизированные `callback_data` Telegram-бота TargetBot. Все значения кодируются в UTF-8 и не превышают лимит 64 байта.

## Навигационные команды (`cmd:*`)

| Callback | Назначение |
| --- | --- |
| `cmd:menu` | Вернуться в главное меню. |
| `cmd:auth` | Раздел «Авторизация Facebook». |
| `cmd:projects` | Список проектов. |
| `cmd:users` | Раздел «Пользователи». |
| `cmd:meta` | Список Meta-аккаунтов. |
| `cmd:analytics` | Раздел «Аналитика». |
| `cmd:finance` | Раздел «Финансы». |
| `cmd:settings` | Раздел «Настройки». |
| `cmd:webhooks` | Обновление вебхуков Telegram. |

## Проекты (`proj:*`)

| Callback шаблон | Описание |
| --- | --- |
| `proj:new` | Старт создания нового проекта. |
| `proj:view:{projectId}` | Открыть карточку проекта. |
| `proj:chat:{projectId}` | Информация о Telegram-группе проекта. |
| `proj:leads:{projectId}` | Последние лиды проекта. |
| `proj:report:{projectId}` | Быстрый переход в отчёты по проекту. |
| `proj:campaigns:{projectId}` | Просмотр рекламных кампаний Meta. |
| `proj:export:{projectId}` | Экспорт данных проекта. |
| `proj:portal:{projectId}` | Ссылка на клиентский портал. |
| `proj:billing:{projectId}` | Статус оплаты и платежей. |
| `proj:settings:{projectId}` | Настройки проекта. |
| `proj:delete:{projectId}` | Запрос удаления проекта. |

## Meta-аккаунты (`meta:*`)

| Callback шаблон | Описание |
| --- | --- |
| `meta:account:{metaAccountId}` | Выбор рекламного аккаунта Meta в мастере привязки. |
| `meta:group:{chatId}` | Выбор Telegram-группы для привязки Meta-аккаунта. |
| `meta:confirm` | Подтверждение создания проекта и привязки. |
| `meta:cancel` | Отмена текущего мастера привязки. |
| `meta:project:{projectId}` | Переход к карточке проекта, связанного с Meta-аккаунтом. |

## Отчёты (`report:*`)

| Callback шаблон | Описание |
| --- | --- |
| `report:toggle:{sessionId}:{projectId}` | Включить/выключить проект в отчёте. |
| `report:select:{sessionId}:all` | Выбрать все проекты. |
| `report:select:{sessionId}:none` | Очистить выбор проектов. |
| `report:confirm:{sessionId}` | Сформировать отчёт и отправить сводку. |
| `report:cancel:{sessionId}` | Отменить сессию отчёта и закрыть меню. |

## Общие правила

- Первичный токен до первого двоеточия определяет пространство команд (`cmd`, `proj`, `meta`, `report`).
- Идентификаторы (`{projectId}`, `{metaAccountId}`, `{chatId}`) передаются в виде строк без дополнительных разделителей.
- Любые новые сценарии обязаны следовать этой схеме, чтобы избежать конфликтов и обеспечить обратную совместимость.
