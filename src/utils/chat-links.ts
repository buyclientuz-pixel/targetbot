const DEFAULT_PRIVATE_CHAT_MESSAGE_ID = 2;

const extractChatIdFromOpenMessage = (value: string): string | undefined => {
  const match = value.match(/chat_id=([^&]+)/i);
  if (!match) {
    return undefined;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
};

const buildPrivateChatUrl = (raw: string): string | undefined => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^-100\d+$/.test(trimmed)) {
    const channelId = trimmed.slice(4);
    if (channelId) {
      return `https://t.me/c/${channelId}/${DEFAULT_PRIVATE_CHAT_MESSAGE_ID}`;
    }
  }
  if (/^-[0-9]+$/.test(trimmed)) {
    const channelId = trimmed.slice(1);
    if (channelId) {
      return `https://t.me/c/${channelId}/${DEFAULT_PRIVATE_CHAT_MESSAGE_ID}`;
    }
  }
  return undefined;
};

export const ensureTelegramUrl = (value?: string | number): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = String(value).trim();
  if (!text) {
    return undefined;
  }
  const lower = text.toLowerCase();
  if (lower.startsWith("tg://openmessage")) {
    const chatId = extractChatIdFromOpenMessage(text);
    return ensureTelegramUrlFromId(chatId ?? undefined);
  }
  if (text.startsWith("tg://")) {
    return text;
  }
  if (/^-?\d+$/.test(text)) {
    if (text.startsWith("-")) {
      const privateLink = buildPrivateChatUrl(text);
      if (privateLink) {
        return privateLink;
      }
    }
    return `tg://user?id=${encodeURIComponent(text)}`;
  }
  if (lower.startsWith("http://")) {
    return `https://${text.slice(7)}`;
  }
  if (lower.startsWith("https://")) {
    return text;
  }
  if (text.startsWith("//")) {
    return `https:${text}`;
  }
  if (lower.startsWith("t.me/") || lower.startsWith("telegram.me/")) {
    return `https://${text.replace(/^\/+/, "")}`;
  }
  if (text.startsWith("@")) {
    return `https://t.me/${text.slice(1)}`;
  }
  if (text.startsWith("+")) {
    return `https://t.me/${text}`;
  }
  return `https://t.me/${text.replace(/^\/+/, "")}`;
};

export const ensureTelegramUrlFromId = (
  value?: string | number,
): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = String(value).trim();
  if (!text) {
    return undefined;
  }
  if (/^-?\d+$/.test(text)) {
    if (text.startsWith("-")) {
      const privateLink = buildPrivateChatUrl(text);
      if (privateLink) {
        return privateLink;
      }
    }
    return `tg://user?id=${encodeURIComponent(text)}`;
  }
  return ensureTelegramUrl(text);
};

export const resolveChatLink = (
  link?: string | number | null,
  chatId?: string | number | null,
): string | undefined => {
  const fromLink = ensureTelegramUrl(link ?? undefined);
  if (fromLink) {
    return fromLink;
  }
  return ensureTelegramUrlFromId(chatId ?? undefined);
};
