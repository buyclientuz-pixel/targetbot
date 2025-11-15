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

export interface TelegramEditMessageOptions {
  chatId: string;
  messageId: number;
  text: string;
  replyMarkup?: unknown;
}

export const sendTelegramMessage = async (
  env: TelegramEnv,
  options: TelegramMessageOptions,
): Promise<number | null> => {
  const token = resolveToken(env);
  if (!token) {
    console.warn("Telegram token is missing");
    return null;
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
    return null;
  }
  try {
    const data = (await response.json()) as { result?: { message_id?: number } };
    if (data?.result && typeof data.result.message_id === "number") {
      return data.result.message_id;
    }
  } catch (error) {
    console.warn("Failed to parse Telegram sendMessage response", error);
  }
  return null;
};

export const editTelegramMessage = async (
  env: TelegramEnv,
  options: TelegramEditMessageOptions,
): Promise<void> => {
  const token = resolveToken(env);
  if (!token) {
    console.warn("Telegram token is missing");
    return;
  }
  const url = new URL(`${TELEGRAM_BASE}/bot${token}/editMessageText`);
  const payload: Record<string, unknown> = {
    chat_id: options.chatId,
    message_id: options.messageId,
    text: options.text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (options.replyMarkup) {
    payload.reply_markup = options.replyMarkup;
  }
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    console.error("Failed to edit Telegram message", await response.text());
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

export interface TelegramDocumentOptions {
  chatId: string;
  data: string | ArrayBuffer | Uint8Array;
  fileName: string;
  contentType?: string;
  caption?: string;
  threadId?: number;
  replyMarkup?: unknown;
}

export const sendTelegramDocument = async (
  env: TelegramEnv,
  options: TelegramDocumentOptions,
): Promise<void> => {
  const token = resolveToken(env);
  if (!token) {
    console.warn("Telegram token is missing");
    return;
  }
  const url = new URL(`${TELEGRAM_BASE}/bot${token}/sendDocument`);
  const form = new FormData();
  form.append("chat_id", options.chatId);
  if (typeof options.threadId === "number") {
    form.append("message_thread_id", String(options.threadId));
  }
  if (options.caption) {
    form.append("caption", options.caption);
    form.append("parse_mode", "HTML");
  }
  if (options.replyMarkup) {
    form.append("reply_markup", JSON.stringify(options.replyMarkup));
  }

  let blob: Blob;
  if (typeof options.data === "string") {
    blob = new Blob([options.data], { type: options.contentType || "text/plain; charset=utf-8" });
  } else if (options.data instanceof ArrayBuffer) {
    blob = new Blob([options.data], { type: options.contentType || "application/octet-stream" });
  } else {
    const copy = new Uint8Array(options.data.byteLength);
    copy.set(options.data);
    blob = new Blob([copy.buffer], { type: options.contentType || "application/octet-stream" });
  }

  form.append("document", blob, options.fileName);

  const response = await fetch(url.toString(), {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    console.error("Failed to send Telegram document", await response.text());
  }
};
