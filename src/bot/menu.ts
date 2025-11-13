import { BotContext } from "./types";
import { editTelegramMessage, sendTelegramMessage } from "../utils/telegram";

const MAIN_MENU_TEXT = `🏠 Главное меню\n\nВыберите раздел, чтобы продолжить работу с TargetBot.`;

const MAIN_MENU_BUTTONS = [
  ["🔐 Авторизация Facebook", "cmd:auth"],
  ["📊 Проекты", "cmd:projects"],
  ["👥 Пользователи", "cmd:users"],
  ["🔗 Meta-аккаунты", "cmd:meta"],
  ["📈 Аналитика", "cmd:analytics"],
  ["💰 Финансы", "cmd:finance"],
  ["⚙ Настройки", "cmd:settings"],
];

const buildReplyMarkup = () => ({
  inline_keyboard: MAIN_MENU_BUTTONS.map(([label, data]) => [
    {
      text: label,
      callback_data: data,
    },
  ]),
});

const deliverMenuMessage = async (
  context: BotContext,
  text: string,
): Promise<void> => {
  if (!context.chatId) {
    console.warn("Cannot render menu without chatId");
    return;
  }
  const replyMarkup = buildReplyMarkup();
  if (context.update.callback_query?.message && typeof context.messageId === "number") {
    await editTelegramMessage(context.env, {
      chatId: context.chatId,
      messageId: context.messageId,
      text,
      replyMarkup,
    });
    return;
  }
  await sendTelegramMessage(context.env, {
    chatId: context.chatId,
    threadId: context.threadId,
    text,
    replyMarkup,
  });
};

export const sendMainMenu = async (context: BotContext): Promise<void> => {
  await deliverMenuMessage(context, MAIN_MENU_TEXT);
};

export const acknowledgeCommand = async (context: BotContext): Promise<void> => {
  const text =
    context.text && context.text.trim()
      ? `Команда «${context.text.trim()}» пока недоступна. Используйте кнопки ниже.`
      : "Команда пока недоступна. Используйте кнопки ниже.";
  await deliverMenuMessage(context, text);
};

export const buildMenuMarkup = buildReplyMarkup;
