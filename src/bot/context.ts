import { BotContext, TelegramMessage, TelegramUpdate } from "./types";
import { EnvBindings } from "../utils/storage";
import { TelegramEnv } from "../utils/telegram";

const extractMessage = (update: TelegramUpdate): TelegramMessage | undefined => {
  if (update.message) {
    return update.message;
  }
  if (update.edited_message) {
    return update.edited_message;
  }
  if (update.callback_query?.message) {
    return update.callback_query.message;
  }
  return undefined;
};

const toChatId = (chatId: number | string | undefined): string | undefined => {
  if (typeof chatId === "number") {
    return chatId.toString();
  }
  if (typeof chatId === "string" && chatId.trim()) {
    return chatId.trim();
  }
  return undefined;
};

const toChatType = (message: TelegramMessage | undefined): string | undefined => {
  if (!message?.chat?.type) {
    return undefined;
  }
  const type = message.chat.type.trim();
  return type || undefined;
};

const toChatTitle = (message: TelegramMessage | undefined): string | undefined => {
  if (!message?.chat) {
    return undefined;
  }
  const { title, username } = message.chat;
  if (title && title.trim()) {
    return title.trim();
  }
  if (username && username.trim()) {
    return username.trim();
  }
  return undefined;
};

const toThreadId = (message: TelegramMessage | undefined): number | undefined => {
  if (!message) {
    return undefined;
  }
  const maybeThread = (message as unknown as { message_thread_id?: number }).message_thread_id;
  if (typeof maybeThread === "number") {
    return maybeThread;
  }
  return undefined;
};

const toUserId = (message: TelegramMessage | undefined, update: TelegramUpdate): string | undefined => {
  const from = message?.from || update.callback_query?.from;
  if (!from) {
    return undefined;
  }
  return from.id.toString();
};

const toUsername = (message: TelegramMessage | undefined, update: TelegramUpdate): string | undefined => {
  const from = message?.from || update.callback_query?.from;
  if (!from) {
    return undefined;
  }
  if (from.username) {
    return from.username;
  }
  const parts = [from.first_name, from.last_name].filter(Boolean).join(" ");
  return parts || undefined;
};

const toText = (update: TelegramUpdate, message: TelegramMessage | undefined): string | undefined => {
  if (update.callback_query?.data) {
    return update.callback_query.data;
  }
  if (message?.text) {
    return message.text;
  }
  return undefined;
};

export const createContext = (
  env: EnvBindings & TelegramEnv,
  update: TelegramUpdate,
): BotContext => {
  const message = extractMessage(update);
  return {
    env,
    update,
    chatId: toChatId(message?.chat.id),
    chatType: toChatType(message),
    chatTitle: toChatTitle(message),
    threadId: toThreadId(message),
    messageId: message?.message_id,
    userId: toUserId(message, update),
    username: toUsername(message, update),
    text: toText(update, message),
  };
};
