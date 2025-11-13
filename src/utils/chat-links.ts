export const ensureTelegramUrl = (value?: string | number): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = String(value).trim();
  if (!text) {
    return undefined;
  }
  const lower = text.toLowerCase();
  if (text.startsWith("tg://")) {
    return text;
  }
  if (/^-?\d+$/.test(text)) {
    if (text.startsWith("-")) {
      return `tg://openmessage?chat_id=${encodeURIComponent(text)}`;
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
      return `tg://openmessage?chat_id=${encodeURIComponent(text)}`;
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
