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
