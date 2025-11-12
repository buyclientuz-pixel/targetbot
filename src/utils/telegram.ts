export type TelegramEnv = Record<string, unknown> & {
  BOT_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TG_API_TOKEN?: string;
};

const TELEGRAM_BASE = "https://api.telegram.org";

const resolveToken = (env: TelegramEnv): string | null => {
  return (
    env.BOT_TOKEN ||
    env.TELEGRAM_BOT_TOKEN ||
    env.TG_API_TOKEN ||
    null
  );
};

export interface TelegramMessageOptions {
  chatId: string;
  text: string;
  threadId?: number;
  replyMarkup?: unknown;
}

export const sendTelegramMessage = async (
  env: TelegramEnv,
  options: TelegramMessageOptions,
): Promise<void> => {
  const token = resolveToken(env);
  if (!token) {
    console.warn("Telegram token is missing");
    return;
  }
  const url = new URL(`${TELEGRAM_BASE}/bot${token}/sendMessage`);
  const payload: Record<string, unknown> = {
    chat_id: options.chatId,
    text: options.text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (typeof options.threadId === "number") {
    payload.message_thread_id = options.threadId;
  }
  if (options.replyMarkup) {
    payload.reply_markup = options.replyMarkup;
  }
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    console.error("Failed to send Telegram message", await response.text());
  }
};

export const answerCallbackQuery = async (
  env: TelegramEnv,
  callbackId: string,
  text?: string,
): Promise<void> => {
  const token = resolveToken(env);
  if (!token) {
    return;
  }
  const url = new URL(`${TELEGRAM_BASE}/bot${token}/answerCallbackQuery`);
  const payload: Record<string, unknown> = { callback_query_id: callbackId };
  if (text) {
    payload.text = text;
  }
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    console.error("Failed to answer callback query", await response.text());
  }
};
