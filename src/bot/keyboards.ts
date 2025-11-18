import type { AutoreportsRecord } from "../domain/spec/autoreports";
import type { ProjectLeadsListRecord } from "../domain/spec/project-leads";
import type { UserSettingsRecord } from "../domain/spec/user-settings";
import type { FreeChatRecord } from "../domain/project-chats";
import type { FbAuthRecord } from "../domain/spec/fb-auth";

import type { ProjectListItem } from "./messages";
import type { InlineKeyboardMarkup } from "./types";

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

interface MainMenuKeyboardOptions {
  facebookAuthUrl?: string | null;
}

export const buildMainMenuKeyboard = (options: MainMenuKeyboardOptions): InlineKeyboardMarkup => {
  const facebookButton = options.facebookAuthUrl
    ? { text: "Авторизация Facebook", url: options.facebookAuthUrl }
    : { text: "Авторизация Facebook", callback_data: "cmd:auth" };
  return {
    inline_keyboard: [
      [facebookButton, { text: "Meta-аккаунты", callback_data: "cmd:meta" }],
      [
        { text: "Проекты", callback_data: "cmd:projects" },
        { text: "Аналитика", callback_data: "cmd:analytics" },
      ],
      [
        { text: "Пользователи", callback_data: "cmd:users" },
        { text: "Финансы", callback_data: "cmd:finance" },
      ],
      [
        { text: "Настройки", callback_data: "cmd:settings" },
        { text: "Вебхуки Telegram", callback_data: "cmd:webhooks" },
      ],
    ],
  };
};

export const buildProjectListKeyboard = (projects: ProjectListItem[]): InlineKeyboardMarkup => ({
  inline_keyboard: projects.map((project, index) => [
    {
      text: `${index + 1}️⃣ ${project.name} [${formatMoney(project.spend, project.currency)}]`,
      callback_data: `project:card:${project.id}`,
    },
  ]),
});

export const buildProjectCreationKeyboard = (
  accounts: FbAuthRecord["adAccounts"],
  options: { hasProjects: boolean },
): InlineKeyboardMarkup => ({
  inline_keyboard: [
    ...accounts.map((account) => [
      {
        text: `${account.name} (${account.id}) — ${account.currency}`,
        callback_data: `project:add:${account.id}`,
      },
    ]),
    ...(options.hasProjects ? [[{ text: "📂 Мои проекты", callback_data: "project:list" }]] : []),
    [{ text: "🏠 Меню", callback_data: "project:menu" }],
  ],
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
      { text: "📂 Настройки", callback_data: `project:edit:${projectId}` },
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

export const buildLeadsKeyboard = (
  projectId: string,
  leads: ProjectLeadsListRecord["leads"],
  status: ProjectLeadsListRecord["leads"][number]["status"],
): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      { text: "🆕 Новые", callback_data: `project:leads:new:${projectId}` },
      { text: "⏳ В обработке", callback_data: `project:leads:processing:${projectId}` },
    ],
    [
      { text: "✅ Завершённые", callback_data: `project:leads:done:${projectId}` },
      { text: "🗑 В корзине", callback_data: `project:leads:trash:${projectId}` },
    ],
    ...leads
      .filter((lead) => lead.status === status)
      .slice(0, 5)
      .map((lead) => [
        {
          text: `🔎 ${lead.name}`,
          callback_data: `lead:view:${projectId}:${lead.id}`,
        },
      ]),
    [{ text: "📤 Экспорт лидов", callback_data: `project:export-leads:${projectId}` }],
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

export const buildChatInfoKeyboard = (projectId: string, hasChat: boolean): InlineKeyboardMarkup => ({
  inline_keyboard: [
    hasChat
      ? { text: "🔁 Изменить чат-группу", callback_data: `project:chat-change:${projectId}` }
      : { text: "🔁 Привязать чат", callback_data: `project:chat-change:${projectId}` },
    hasChat ? { text: "🚫 Отвязать чат", callback_data: `project:chat-unlink:${projectId}` } : null,
  ]
    .filter((button): button is { text: string; callback_data: string } => button != null)
    .map((button) => [button])
    .concat([[{ text: "⬅️ Назад", callback_data: `project:card:${projectId}` }]]),
});

const formatChatButtonText = (chat: { chatTitle: string | null; chatId: number }, index: number): string => {
  const icons = ["🔥", "👥", "🛠", "💬", "✨", "🚀", "⭐️", "🎯"];
  const prefix = icons[index % icons.length] ?? "🔥";
  return chat.chatTitle ? `${prefix} ${chat.chatTitle}` : `${prefix} Чат ${chat.chatId}`;
};

export const buildChatBindingKeyboard = (
  accountId: string,
  chats: FreeChatRecord[],
): InlineKeyboardMarkup => ({
  inline_keyboard: [
    ...chats.slice(0, 8).map((chat, index) => [
      {
        text: `${formatChatButtonText(chat, index)} (${chat.chatId})`,
        callback_data: `project:bind:${accountId}:${chat.chatId}`,
      },
    ]),
    [{ text: "🔗 Отправить ссылку вручную", callback_data: `project:bind-manual:${accountId}` }],
    [{ text: "🏠 Меню", callback_data: "project:menu" }],
  ],
});

export const buildChatChangeKeyboard = (
  projectId: string,
  chats: FreeChatRecord[],
): InlineKeyboardMarkup => ({
  inline_keyboard: [
    ...chats.slice(0, 8).map((chat, index) => [
      {
        text: `${formatChatButtonText(chat, index)} (${chat.chatId})`,
        callback_data: `project:chat-select:${projectId}:${chat.chatId}`,
      },
    ]),
    [{ text: "🔗 Отправить ссылку вручную", callback_data: `project:chat-manual:${projectId}` }],
    [{ text: "⬅️ Назад", callback_data: `project:card:${projectId}` }],
  ],
});

export const buildAutoreportsKeyboard = (
  projectId: string,
  autoreports: AutoreportsRecord,
): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      {
        text: autoreports.enabled ? "⛔️ Выключить" : "✅ Включить",
        callback_data: `project:autoreports-toggle:${projectId}`,
      },
      { text: "🕒 Изменить время", callback_data: `project:autoreports-time:${projectId}` },
    ],
    [
      { text: "👥 Кому отправлять", callback_data: `project:autoreports-route:${projectId}` },
    ],
    [
      { text: "📤 Отправить сейчас", callback_data: `auto_send_now:${projectId}` },
    ],
    [{ text: "⬅️ Назад", callback_data: `project:card:${projectId}` }],
  ],
});

export const buildAutoreportsRouteKeyboard = (projectId: string): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      { text: "В чат", callback_data: `project:autoreports-send:${projectId}:chat` },
      { text: "Админу", callback_data: `project:autoreports-send:${projectId}:admin` },
      { text: "В чат и админу", callback_data: `project:autoreports-send:${projectId}:both` },
    ],
    [{ text: "⬅️ Назад", callback_data: `project:autoreports:${projectId}` }],
  ],
});


export const buildKpiKeyboard = (projectId: string): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      { text: "🤖 Авто", callback_data: `project:kpi-mode:${projectId}:auto` },
      { text: "📝 Ручной", callback_data: `project:kpi-mode:${projectId}:manual` },
    ],
    [
      { text: "🎯 Лиды", callback_data: `project:kpi-type:${projectId}:LEAD` },
      { text: "💬 Сообщения", callback_data: `project:kpi-type:${projectId}:MESSAGE` },
      { text: "👆 Клики", callback_data: `project:kpi-type:${projectId}:CLICK` },
    ],
    [
      { text: "👀 Просмотры", callback_data: `project:kpi-type:${projectId}:VIEW` },
      { text: "🛒 Покупки", callback_data: `project:kpi-type:${projectId}:PURCHASE` },
    ],
    [{ text: "⬅️ Назад", callback_data: `project:card:${projectId}` }],
  ],
});

export const buildProjectEditKeyboard = (projectId: string): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      { text: "✏️ Название", callback_data: `project:edit-name:${projectId}` },
      { text: "📦 Рекламный кабинет", callback_data: `project:edit-ad:${projectId}` },
    ],
    [{ text: "👤 Владелец", callback_data: `project:edit-owner:${projectId}` }],
    [{ text: "⬅️ Назад", callback_data: `project:card:${projectId}` }],
  ],
});

export const buildDeleteConfirmKeyboard = (projectId: string): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [{ text: "🧨 Да, удалить проект", callback_data: `project:delete-confirm:${projectId}` }],
    [{ text: "⬅️ Отмена", callback_data: `project:card:${projectId}` }],
  ],
});

export const buildSettingsKeyboard = (settings: UserSettingsRecord): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      {
        text: settings.language === "ru" ? "Русский ✅" : "Русский",
        callback_data: `settings:language:ru`,
      },
      {
        text: settings.language === "en" ? "English ✅" : "English",
        callback_data: `settings:language:en`,
      },
    ],
    [
      {
        text: settings.timezone === "Asia/Tashkent" ? "Asia/Tashkent ✅" : "Asia/Tashkent",
        callback_data: `settings:tz:Asia/Tashkent`,
      },
      {
        text: settings.timezone === "Europe/Moscow" ? "Europe/Moscow ✅" : "Europe/Moscow",
        callback_data: `settings:tz:Europe/Moscow`,
      },
    ],
    [{ text: "⬅️ Меню", callback_data: "project:menu" }],
  ],
});

export const buildLeadDetailKeyboard = (
  projectId: string,
  leadId: string,
  status: ProjectLeadsListRecord["leads"][number]["status"],
): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      { text: "⏳ В обработку", callback_data: `lead:status:${projectId}:${leadId}:processing` },
      { text: "✅ Завершить", callback_data: `lead:status:${projectId}:${leadId}:done` },
    ],
    [
      { text: "🗑 В корзину", callback_data: `lead:status:${projectId}:${leadId}:trash` },
      { text: "🆕 Вернуть в новые", callback_data: `lead:status:${projectId}:${leadId}:new` },
    ],
    [{ text: "⬅️ Назад", callback_data: `project:leads:${status}:${projectId}` }],
  ],
});
