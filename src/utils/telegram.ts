export const getBotToken = (env: Record<string, unknown>): string | null => {
  const token = env.BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || env.TG_API_TOKEN;
  if (typeof token === "string" && token) {
    return token;
  }
  return null;
};

export const sendTelegramMessage = async (
  env: Record<string, unknown>,
  chatId: string,
  text: string,
  options: { parseMode?: string } = {},
): Promise<void> => {
  const token = getBotToken(env);
  if (!token) {
    throw new Error("Telegram token is not configured");
  }

  const url = "https://api.telegram.org/bot" + token + "/sendMessage";
  const payload: Record<string, unknown> = { chat_id: chatId, text };
  if (options.parseMode) {
    payload.parse_mode = options.parseMode;
  }

  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
};
