import type { AutoreportsRecord } from "../domain/spec/autoreports";
import type { ProjectLeadsListRecord } from "../domain/spec/project-leads";
import type { ProjectLeadNotificationSettings } from "../domain/project-settings";
import type { UserSettingsRecord } from "../domain/spec/user-settings";
import type { FreeChatRecord } from "../domain/project-chats";
import type { FbAuthRecord } from "../domain/spec/fb-auth";
import type { ProjectLeadsViewPayload } from "../services/project-leads-view";

import type { AccountBindingOverview, AccountSpendSnapshot } from "./data";
import type { InlineKeyboardMarkup } from "./types";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  RUB: "₽",
  UZS: "сум",
  KZT: "₸",
};

const getCurrencySymbol = (currency: string): string => {
  const upper = currency?.toUpperCase?.() ?? "";
  return CURRENCY_SYMBOLS[upper] ?? (upper || "$");
};

const formatAccountSpend = (snapshot: AccountSpendSnapshot, fallbackCurrency: string): string => {
  const symbol = getCurrencySymbol(snapshot.currency || fallbackCurrency);
  if (snapshot.amount == null) {
    return `—${symbol}`;
  }
  const formatter = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const amountText = formatter.format(snapshot.amount).replace(/\u00a0/g, " ");
  return `${amountText}${symbol}`;
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
      [facebookButton],
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

export const buildProjectCreationKeyboard = (
  accounts: FbAuthRecord["adAccounts"],
  options: {
    hasProjects: boolean;
    accountSpends?: Record<string, AccountSpendSnapshot>;
    accountBindings?: Record<string, AccountBindingOverview>;
  },
): InlineKeyboardMarkup => {
  const spendMap = options.accountSpends ?? {};
  const bindings = options.accountBindings ?? {};
  return {
    inline_keyboard: [
      ...accounts.map((account) => {
        const binding = bindings[account.id];
        const icon = binding?.hasChat ? "✅" : "⚙️";
        const callback = binding
          ? binding.hasChat
            ? `project:card:${binding.projectId}`
            : `project:chat-change:${binding.projectId}`
          : `project:add:${account.id}`;
        return [
          {
            text: `${icon} ${account.name} — ${formatAccountSpend(
              spendMap[account.id] ?? { amount: null, currency: account.currency },
              account.currency,
            )}`,
            callback_data: callback,
          },
        ];
      }),
      [{ text: "🏠 Меню", callback_data: "project:menu" }],
    ],
  };
};

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
      { text: "⬅️ К списку", callback_data: "cmd:projects" },
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
  view: ProjectLeadsViewPayload,
  status: ProjectLeadsListRecord["leads"][number]["status"],
  leadSettings: ProjectLeadNotificationSettings,
): InlineKeyboardMarkup => {
  const buildPeriodSuffix = (periodKey: string): string => {
    if (periodKey === "custom") {
      return `:${view.period.from}:${view.period.to}`;
    }
    return "";
  };
  const buildStatusCallback = (
    nextStatus: ProjectLeadsListRecord["leads"][number]["status"],
    periodKey = view.periodKey,
  ) => `project:leads:${nextStatus}:${projectId}:${periodKey}${buildPeriodSuffix(periodKey)}`;
  const formatStatusButton = (
    label: string,
    icon: string,
    target: ProjectLeadsListRecord["leads"][number]["status"],
  ) => {
    const count = view.countsByStatus[target] ?? 0;
    const suffix = count > 0 ? ` (${count})` : "";
    return {
      text: `${icon} ${label}${suffix}`,
      callback_data: buildStatusCallback(target),
    };
  };
  const buildPeriodButton = (label: string, periodKey: string) => {
    const isActive = view.periodKey === periodKey;
    const prefix = isActive ? "• " : "";
    return {
      text: `${prefix}${label}`,
      callback_data: buildStatusCallback(status, periodKey),
    };
  };
  const encodeTargetToggle = (channel: "chat" | "admin") =>
    `project:leads-target:${status}:${projectId}:${channel}:${view.periodKey}${buildPeriodSuffix(view.periodKey)}`;
  const exportCallback = `project:export-leads:${projectId}:${view.periodKey}${buildPeriodSuffix(view.periodKey)}`;
  return {
    inline_keyboard: [
      [
        formatStatusButton("Новые", "🆕", "new"),
        formatStatusButton("В обработке", "⏳", "processing"),
      ],
      [
        formatStatusButton("Завершённые", "✅", "done"),
        formatStatusButton("В корзине", "🗑", "trash"),
      ],
      [buildPeriodButton("Сегодня", "today"), buildPeriodButton("Неделя", "week")],
      [buildPeriodButton("Месяц", "month"), buildPeriodButton("Все время", "all")],
      [
        {
          text: view.periodKey === "custom" ? "📅 Период: свой" : "📅 Указать даты",
          callback_data: `project:leads-range:${status}:${projectId}`,
        },
      ],
      ...view.leads
        .filter((lead) => lead.status === status)
        .slice(0, 5)
        .map((lead) => [
          {
            text: `🔎 ${lead.name}`,
            callback_data: `lead:view:${projectId}:${lead.id}`,
          },
        ]),
      [
        {
          text: leadSettings.sendToChat ? "👥 Чат — вкл" : "👥 Чат — выкл",
          callback_data: encodeTargetToggle("chat"),
        },
        {
          text: leadSettings.sendToAdmin ? "👤 Админ — вкл" : "👤 Админ — выкл",
          callback_data: encodeTargetToggle("admin"),
        },
      ],
      [{ text: "📤 Экспорт лидов", callback_data: exportCallback }],
      [{ text: "⬅️ Назад", callback_data: `project:card:${projectId}` }],
    ],
  };
};

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
    [{ text: "⬅️ Назад", callback_data: "cmd:projects" }],
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
      {
        text: autoreports.sendToChat ? "👥 Чат — вкл" : "👥 Чат — выкл",
        callback_data: `project:autoreports-target:${projectId}:chat`,
      },
      {
        text: autoreports.sendToAdmin ? "👤 Админ — вкл" : "👤 Админ — выкл",
        callback_data: `project:autoreports-target:${projectId}:admin`,
      },
    ],
    [
      { text: "📤 Отправить сейчас", callback_data: `auto_send_now:${projectId}` },
    ],
    [{ text: "⬅️ Назад", callback_data: `project:card:${projectId}` }],
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
