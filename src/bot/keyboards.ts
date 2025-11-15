import type { ProjectListItem } from "./messages";
import type { InlineKeyboardMarkup, ReplyKeyboardMarkup } from "./types";

const formatMoney = (value: number | null, currency: string): string => {
  if (value == null) {
    return "—";
  }
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
};

export const buildMainMenuKeyboard = (): ReplyKeyboardMarkup => ({
  resize_keyboard: true,
  keyboard: [
    [
      { text: "Авторизация Facebook" },
      { text: "Проекты" },
    ],
    [
      { text: "Аналитика" },
      { text: "Пользователи" },
    ],
    [
      { text: "Финансы" },
      { text: "Вебхуки Telegram" },
    ],
    [{ text: "Настройки" }],
  ],
});

export const buildProjectListKeyboard = (projects: ProjectListItem[]): InlineKeyboardMarkup => ({
  inline_keyboard: projects.map((project, index) => [
    {
      text: `${index + 1}️⃣ ${project.name} [${formatMoney(project.spend, project.currency)}]`,
      callback_data: `project:card:${project.id}`,
    },
  ]),
});

export const buildProjectActionsKeyboard = (projectId: string): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      { text: "✏️ Изменить данные", callback_data: `project:edit:${projectId}` },
      { text: "📲 Чат-группа", callback_data: `project:chat:${projectId}` },
    ],
    [
      { text: "🔁 Изменить чат-группу", callback_data: `project:chat-change:${projectId}` },
      { text: "🚫 Отвязать чат", callback_data: `project:chat-unlink:${projectId}` },
    ],
    [
      { text: "💬 Лиды", callback_data: `project:leads:new:${projectId}` },
      { text: "📈 Отчёт по рекламе", callback_data: `project:report:${projectId}` },
    ],
    [
      { text: "👀 Рекламные кампании", callback_data: `project:campaigns:${projectId}` },
      { text: "📤 Экспорт данных", callback_data: `project:export:${projectId}` },
    ],
    [
      { text: "🧩 Портал", callback_data: `project:portal:${projectId}` },
      { text: "💳 Оплата", callback_data: `project:billing:${projectId}` },
    ],
    [
      { text: "🕒 Авто-отчёты", callback_data: `project:autoreports:${projectId}` },
      { text: "⚙ Изменить KPI проекта", callback_data: `project:kpi:${projectId}` },
    ],
    [
      { text: "🧨 Удалить", callback_data: `project:delete:${projectId}` },
    ],
    [
      { text: "⬅️ К списку", callback_data: "project:list" },
      { text: "🏠 Меню", callback_data: "project:menu" },
    ],
  ],
});

export const buildBillingKeyboard = (projectId: string): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      { text: "+30 дней", callback_data: `billing:add30:${projectId}` },
      { text: "350 $", callback_data: `billing:tariff:${projectId}:350` },
      { text: "500 $", callback_data: `billing:tariff:${projectId}:500` },
    ],
    [
      { text: "📅 Указать дату", callback_data: `billing:set-date:${projectId}` },
      { text: "✏️ Ввести вручную", callback_data: `billing:manual:${projectId}` },
    ],
    [{ text: "⬅️ Назад", callback_data: `project:card:${projectId}` }],
  ],
});

export const buildLeadsFilterKeyboard = (projectId: string): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      { text: "🆕 Новые", callback_data: `project:leads:new:${projectId}` },
      { text: "⏳ В обработке", callback_data: `project:leads:processing:${projectId}` },
    ],
    [
      { text: "✅ Завершённые", callback_data: `project:leads:done:${projectId}` },
      { text: "🗑 В корзине", callback_data: `project:leads:trash:${projectId}` },
    ],
    [
      { text: "📤 Экспорт лидов", callback_data: `project:export-leads:${projectId}` },
    ],
    [{ text: "⬅️ Назад", callback_data: `project:card:${projectId}` }],
  ],
});

export const buildExportKeyboard = (projectId: string): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      { text: "💬 Лиды (CSV)", callback_data: `project:export-leads:${projectId}` },
      { text: "📈 Кампании (CSV)", callback_data: `project:export-campaigns:${projectId}` },
    ],
    [
      { text: "💳 Оплаты (CSV)", callback_data: `project:export-payments:${projectId}` },
    ],
    [{ text: "⬅️ Назад", callback_data: `project:card:${projectId}` }],
  ],
});
