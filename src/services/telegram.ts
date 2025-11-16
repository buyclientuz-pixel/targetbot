export class TelegramError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody: string,
  ) {
    super(message);
    this.name = "TelegramError";
  }
}

export interface SendTelegramMessageOptions {
  chatId: number;
  text: string;
  messageThreadId?: number | null;
  parseMode?: "MarkdownV2" | "Markdown" | "HTML";
  disableWebPagePreview?: boolean;
  replyMarkup?: unknown;
}

export interface SendTelegramDocumentOptions {
  chatId: number;
  filename: string;
  content: string | ArrayBuffer | Uint8Array;
  caption?: string;
  messageThreadId?: number | null;
  parseMode?: "MarkdownV2" | "Markdown" | "HTML";
  replyMarkup?: unknown;
  contentType?: string;
}

interface TelegramChatInfo {
  id: number;
  type: string;
  title?: string;
}

interface TelegramWebhookInfo {
  url?: string;
  has_custom_certificate?: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
}

export interface CreateForumTopicOptions {
  chatId: number;
  name: string;
  iconColor?: number;
}

interface TelegramForumTopic {
  message_thread_id: number;
  name: string;
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export const sendTelegramMessage = async <T = unknown>(
  token: string,
  options: SendTelegramMessageOptions,
): Promise<T | void> => {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const payload: Record<string, unknown> = {
    chat_id: options.chatId,
    text: options.text,
    parse_mode: options.parseMode ?? "HTML",
    disable_web_page_preview: options.disableWebPagePreview ?? true,
  };

  if (options.messageThreadId != null) {
    payload.message_thread_id = options.messageThreadId;
  }

  if (options.replyMarkup) {
    payload.reply_markup = options.replyMarkup;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await response.text();

  if (!response.ok) {
    throw new TelegramError(`Telegram sendMessage failed with status ${response.status}`, response.status, bodyText);
  }

  try {
    const data = JSON.parse(bodyText) as TelegramResponse<T>;
    if (!data.ok) {
      throw new TelegramError(`Telegram API error: ${data.description ?? "unknown"}`, response.status, bodyText);
    }
    return data.result;
  } catch (error) {
    if (error instanceof TelegramError) {
      throw error;
    }
    throw new TelegramError("Failed to parse Telegram response", response.status, bodyText);
  }
};

const toBlobPart = (value: string | ArrayBuffer | Uint8Array): string | ArrayBuffer => {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Uint8Array) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  }
  return value;
};

export const sendTelegramDocument = async <T = unknown>(
  token: string,
  options: SendTelegramDocumentOptions,
): Promise<T | void> => {
  const url = `https://api.telegram.org/bot${token}/sendDocument`;
  const form = new FormData();
  form.set("chat_id", options.chatId.toString());
  if (options.messageThreadId != null) {
    form.set("message_thread_id", options.messageThreadId.toString());
  }
  if (options.caption) {
    form.set("caption", options.caption);
  }
  if (options.parseMode) {
    form.set("parse_mode", options.parseMode);
  }
  if (options.replyMarkup) {
    form.set("reply_markup", JSON.stringify(options.replyMarkup));
  }
  const document = new File([toBlobPart(options.content)], options.filename, {
    type: options.contentType ?? "text/csv",
  });
  form.set("document", document);

  const response = await fetch(url, {
    method: "POST",
    body: form,
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new TelegramError(`Telegram sendDocument failed with status ${response.status}`, response.status, bodyText);
  }
  try {
    const data = JSON.parse(bodyText) as TelegramResponse<T>;
    if (!data.ok) {
      throw new TelegramError(`Telegram API error: ${data.description ?? "unknown"}`, response.status, bodyText);
    }
    return data.result;
  } catch (error) {
    if (error instanceof TelegramError) {
      throw error;
    }
    throw new TelegramError("Failed to parse Telegram response", response.status, bodyText);
  }
};

export const answerCallbackQuery = async (
  token: string,
  params: { id: string; text?: string; showAlert?: boolean },
): Promise<void> => {
  const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
  const payload: Record<string, unknown> = {
    callback_query_id: params.id,
  };
  if (params.text) {
    payload.text = params.text;
  }
  if (params.showAlert) {
    payload.show_alert = params.showAlert;
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new TelegramError(
      `Telegram answerCallbackQuery failed with status ${response.status}`,
      response.status,
      bodyText,
    );
  }
  try {
    const data = JSON.parse(bodyText) as TelegramResponse<unknown>;
    if (!data.ok) {
      throw new TelegramError(`Telegram API error: ${data.description ?? "unknown"}`, response.status, bodyText);
    }
  } catch (error) {
    if (error instanceof TelegramError) {
      throw error;
    }
    throw new TelegramError("Failed to parse Telegram response", response.status, bodyText);
  }
};

export const getTelegramChatInfo = async (token: string, identifier: string): Promise<TelegramChatInfo | null> => {
  const url = `https://api.telegram.org/bot${token}/getChat`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: identifier }),
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new TelegramError(`Telegram getChat failed with status ${response.status}`, response.status, bodyText);
  }
  try {
    const data = JSON.parse(bodyText) as TelegramResponse<TelegramChatInfo>;
    if (!data.ok) {
      throw new TelegramError(`Telegram API error: ${data.description ?? "unknown"}`, response.status, bodyText);
    }
    return data.result ?? null;
  } catch (error) {
    if (error instanceof TelegramError) {
      throw error;
    }
    throw new TelegramError("Failed to parse Telegram response", response.status, bodyText);
  }
};

export const getWebhookInfo = async (token: string): Promise<TelegramWebhookInfo | null> => {
  const url = `https://api.telegram.org/bot${token}/getWebhookInfo`;
  const response = await fetch(url);
  const bodyText = await response.text();
  if (!response.ok) {
    throw new TelegramError(`Telegram getWebhookInfo failed with status ${response.status}`, response.status, bodyText);
  }
  try {
    const data = JSON.parse(bodyText) as TelegramResponse<TelegramWebhookInfo>;
    if (!data.ok) {
      throw new TelegramError(`Telegram API error: ${data.description ?? "unknown"}`, response.status, bodyText);
    }
    return data.result ?? null;
  } catch (error) {
    if (error instanceof TelegramError) {
      throw error;
    }
    throw new TelegramError("Failed to parse Telegram response", response.status, bodyText);
  }
};

export const createForumTopic = async (
  token: string,
  options: CreateForumTopicOptions,
): Promise<TelegramForumTopic | null> => {
  const url = `https://api.telegram.org/bot${token}/createForumTopic`;
  const payload: Record<string, unknown> = {
    chat_id: options.chatId,
    name: options.name,
  };
  if (options.iconColor != null) {
    payload.icon_color = options.iconColor;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new TelegramError(
      `Telegram createForumTopic failed with status ${response.status}`,
      response.status,
      bodyText,
    );
  }

  try {
    const data = JSON.parse(bodyText) as TelegramResponse<TelegramForumTopic>;
    if (!data.ok) {
      throw new TelegramError(
        `Telegram API error: ${data.description ?? "unknown"}`,
        response.status,
        bodyText,
      );
    }
    return data.result ?? null;
  } catch (error) {
    if (error instanceof TelegramError) {
      throw error;
    }
    throw new TelegramError("Failed to parse Telegram response", response.status, bodyText);
  }
};
