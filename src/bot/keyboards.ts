import type { AutoreportsRecord } from "../domain/spec/autoreports";
import type { ProjectLeadNotificationSettings } from "../domain/project-settings";
import type { UserSettingsRecord } from "../domain/spec/user-settings";
import type { FreeChatRecord } from "../domain/project-chats";
import type { FbAuthRecord } from "../domain/spec/fb-auth";
import type { ProjectLeadsListRecord } from "../domain/spec/project-leads";
import type { ProjectLeadsViewPayload } from "../services/project-leads-view";
import { buildLeadsPanelId, buildLeadsPayloadSegment, type LeadsPanelContext } from "./leads-panel-state";

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
      { text: "💬 Лиды", callback_data: buildLeadsPanelId(projectId) },
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
  context: LeadsPanelContext,
  leadSettings: ProjectLeadNotificationSettings,
): InlineKeyboardMarkup => {
  const inline_keyboard: InlineKeyboardMarkup["inline_keyboard"] = [];
  const buildPeriodButton = (label: string, periodKey: string) => {
    const isActive = view.periodKey === periodKey;
    const targetContext: LeadsPanelContext = {
      ...context,
      periodKey,
      from: periodKey === "custom" ? context.from : null,
      to: periodKey === "custom" ? context.to : null,
      page: 0,
    };
    return {
      text: `${isActive ? "• " : ""}${label}`,
      callback_data: buildLeadsPanelId(projectId, targetContext),
    };
  };
  inline_keyboard.push([
    buildPeriodButton("Сегодня", "today"),
    buildPeriodButton("Неделя", "week"),
  ]);
  inline_keyboard.push([
    buildPeriodButton("Месяц", "month"),
    buildPeriodButton("Все время", "all"),
  ]);
  inline_keyboard.push([
    {
      text: context.periodKey === "custom" ? "📅 Период: свой" : "📅 Указать даты",
      callback_data: `project:leads-range:${buildLeadsPayloadSegment(projectId, context)}`,
    },
  ]);

  if (context.mode === "form") {
    const targetFormId = context.formId ?? null;
    const leadsForForm = view.leads.filter((lead) => (lead.formId ?? null) === targetFormId);
    const maxPage = Math.max(Math.ceil(leadsForForm.length / 5) - 1, 0);
    const safePage = Math.min(context.page, maxPage);
    const prevContext: LeadsPanelContext = { ...context, page: Math.max(safePage - 1, 0) };
    const nextContext: LeadsPanelContext = { ...context, page: Math.min(safePage + 1, maxPage) };
    const navRow: InlineKeyboardMarkup["inline_keyboard"][number] = [];
    if (safePage > 0) {
      navRow.push({ text: "⬅️ Назад", callback_data: buildLeadsPanelId(projectId, prevContext) });
    }
    if (safePage < maxPage) {
      navRow.push({ text: "➡️ Далее", callback_data: buildLeadsPanelId(projectId, nextContext) });
    }
    if (navRow.length > 0) {
      inline_keyboard.push(navRow);
    }
    inline_keyboard.push([
      {
        text: "↩️ К формам",
        callback_data: buildLeadsPanelId(projectId, { ...context, mode: "forms", formId: null, page: 0 }),
      },
    ]);
  } else if (view.forms.length > 0) {
    view.forms.forEach((form) => {
      inline_keyboard.push([
        {
          text: `${form.periodTotal} — ${form.name}`,
          callback_data: buildLeadsPanelId(projectId, { ...context, mode: "form", formId: form.formId ?? null, page: 0 }),
        },
      ]);
    });
  } else {
    inline_keyboard.push([
      { text: "Лиды появятся после синхронизации", callback_data: buildLeadsPanelId(projectId, context) },
    ]);
  }

  const encodeTargetToggle = (channel: "chat" | "admin") =>
    `project:leads-target:${channel}:${buildLeadsPayloadSegment(projectId, context)}`;
  inline_keyboard.push([
    {
      text: leadSettings.sendToChat ? "👥 Чат — вкл" : "👥 Чат — выкл",
      callback_data: encodeTargetToggle("chat"),
    },
    {
      text: leadSettings.sendToAdmin ? "👤 Админ — вкл" : "👤 Админ — выкл",
      callback_data: encodeTargetToggle("admin"),
    },
  ]);

  const periodSuffix =
    context.periodKey === "custom" ? `:${context.from ?? ""}:${context.to ?? ""}` : "";
  const exportCallback = `project:export-leads:${projectId}:${context.periodKey}${periodSuffix}`;
  inline_keyboard.push([{ text: "📤 Экспорт лидов", callback_data: exportCallback }]);
  inline_keyboard.push([{ text: "⬅️ Назад", callback_data: `project:card:${projectId}` }]);

  return { inline_keyboard };
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
      {
        text: autoreports.paymentAlerts.enabled ? "💳 Аллерт оплат — вкл" : "💳 Аллерт оплат — выкл",
        callback_data: `project:autoreports-payment-toggle:${projectId}`,
      },
    ],
    [
      {
        text: autoreports.paymentAlerts.sendToChat ? "👥 Аллерт: чат" : "👥 Аллерт: выкл",
        callback_data: `project:autoreports-payment-target:${projectId}:chat`,
      },
      {
        text: autoreports.paymentAlerts.sendToAdmin ? "👤 Аллерт: админ" : "👤 Аллерт: выкл",
        callback_data: `project:autoreports-payment-target:${projectId}:admin`,
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
