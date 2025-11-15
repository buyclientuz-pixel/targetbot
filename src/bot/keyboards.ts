import type { InlineKeyboardMarkup, ReplyKeyboardMarkup } from "./types";

export const buildMainMenuKeyboard = (): ReplyKeyboardMarkup => ({
  resize_keyboard: true,
  keyboard: [
    [
      { text: "Авторизация Facebook" },
      { text: "Проекты" },
    ],
    [
      { text: "Пользователи" },
      { text: "Аналитика" },
    ],
    [
      { text: "Финансы" },
      { text: "Вебхуки Telegram" },
    ],
    [{ text: "Настройки" }],
  ],
});

export const buildProjectListKeyboard = (projects: { id: string; name: string }[]): InlineKeyboardMarkup => ({
  inline_keyboard: projects.map((project) => [{ text: project.name, callback_data: `project:${project.id}` }]),
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
  ],
});
