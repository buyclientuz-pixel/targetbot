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
