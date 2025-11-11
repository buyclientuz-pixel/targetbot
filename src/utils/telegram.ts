export const getBotToken = (env: Record<string, unknown>): string | null => {
  const token = env.BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || env.TG_API_TOKEN;
  if (typeof token === "string" && token) {
    return token;
  }
  return null;
};

interface TelegramRequestOptions {
  parseMode?: string;
  replyMarkup?: Record<string, unknown>;
  disablePreview?: boolean;
}

const callTelegramMethod = async (
  env: Record<string, unknown>,
  method: string,
  payload: Record<string, unknown>,
): Promise<void> => {
  const token = getBotToken(env);
  if (!token) {
    throw new Error("Telegram token is not configured");
  }

  const url = "https://api.telegram.org/bot" + token + "/" + method;

  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
};

export const sendTelegramMessage = async (
  env: Record<string, unknown>,
  chatId: string,
  text: string,
  options: TelegramRequestOptions = {},
): Promise<void> => {
  const payload: Record<string, unknown> = { chat_id: chatId, text };

  if (options.parseMode) {
    payload.parse_mode = options.parseMode;
  }

  if (options.replyMarkup) {
    payload.reply_markup = options.replyMarkup;
  }

  if (options.disablePreview) {
    payload.disable_web_page_preview = true;
  }

  await callTelegramMethod(env, "sendMessage", payload);
};

export const editTelegramMessage = async (
  env: Record<string, unknown>,
  chatId: string,
  messageId: number,
  text: string,
  options: TelegramRequestOptions = {},
): Promise<void> => {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
  };

  if (options.parseMode) {
    payload.parse_mode = options.parseMode;
  }

  if (options.replyMarkup) {
    payload.reply_markup = options.replyMarkup;
  }

  if (options.disablePreview) {
    payload.disable_web_page_preview = true;
  }

  await callTelegramMethod(env, "editMessageText", payload);
};

export const answerCallbackQuery = async (
  env: Record<string, unknown>,
  callbackId: string,
  options: { text?: string; showAlert?: boolean } = {},
): Promise<void> => {
  const payload: Record<string, unknown> = {
    callback_query_id: callbackId,
  };

  if (options.text) {
    payload.text = options.text;
  }

  if (options.showAlert) {
    payload.show_alert = true;
  }

  await callTelegramMethod(env, "answerCallbackQuery", payload);
};
