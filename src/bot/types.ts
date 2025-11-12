import { EnvBindings } from "../utils/storage";
import { TelegramEnv } from "../utils/telegram";

type NumericString = string;

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number | NumericString;
  type: string;
  title?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  data?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  edited_message?: TelegramMessage;
}

export interface BotContext {
  env: EnvBindings & TelegramEnv;
  update: TelegramUpdate;
  chatId?: string;
  chatType?: string;
  chatTitle?: string;
  threadId?: number;
  userId?: string;
  username?: string;
  text?: string;
}
