import { BotContext } from "./types";
import { sendTelegramMessage } from "../utils/telegram";

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

export const sendMainMenu = async (context: BotContext): Promise<void> => {
  if (!context.chatId) {
    console.warn("Cannot render menu without chatId");
    return;
  }
  await sendTelegramMessage(context.env, {
    chatId: context.chatId,
    threadId: context.threadId,
    text: MAIN_MENU_TEXT,
    replyMarkup: buildReplyMarkup(),
  });
};

export const acknowledgeCommand = async (context: BotContext): Promise<void> => {
  if (!context.chatId) {
    return;
  }
  const text = context.text || "Команда принята. Меню будет расширено в следующих итерациях.";
  await sendTelegramMessage(context.env, {
    chatId: context.chatId,
    threadId: context.threadId,
    text,
  });
};

export const buildMenuMarkup = buildReplyMarkup;
