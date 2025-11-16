const EXACT_LABELS: Record<string, string> = {
  LEAD_GENERATION: "Лиды",
  OUTCOME_LEADS: "Лиды",
  LEADS: "Лиды",
  MESSAGES: "Сообщения",
  OUTCOME_MESSAGES: "Сообщения",
  MESSAGING_CONVERSATIONS: "Сообщения",
  TRAFFIC: "Трафик",
  OUTCOME_TRAFFIC: "Трафик",
  CONVERSIONS: "Конверсии",
  OUTCOME_CONVERSIONS: "Конверсии",
  SALES: "Продажи",
  OUTCOME_SALES: "Продажи",
  PURCHASES: "Покупки",
  BRAND_AWARENESS: "Узнаваемость",
  AWARENESS: "Узнаваемость",
  REACH: "Охват",
  ENGAGEMENT: "Вовлечённость",
  OUTCOME_ENGAGEMENT: "Вовлечённость",
  APP_PROMOTION: "Продвижение приложений",
  VIDEO_VIEWS: "Просмотры видео",
  LINK_CLICKS: "Переходы",
  STORE_VISITS: "Оффлайн визиты",
  CATALOG_SALES: "Продажи каталога",
};

const KEYWORD_LABELS: Array<{ match: (value: string) => boolean; label: string }> = [
  { match: (value) => value.includes("LEAD"), label: "Лиды" },
  { match: (value) => value.includes("MESSAGE") || value.includes("MESSENG"), label: "Сообщения" },
  { match: (value) => value.includes("TRAFFIC") || value.includes("CLICK"), label: "Трафик" },
  { match: (value) => value.includes("CONVERSION") || value.includes("SALE"), label: "Конверсии" },
  { match: (value) => value.includes("PURCHASE"), label: "Покупки" },
  { match: (value) => value.includes("AWARENESS") || value.includes("REACH"), label: "Узнаваемость" },
  { match: (value) => value.includes("ENGAGEMENT"), label: "Вовлечённость" },
  { match: (value) => value.includes("APP"), label: "Продвижение приложений" },
  { match: (value) => value.includes("VIDEO") || value.includes("VIEW"), label: "Видео" },
];

const capitaliseWords = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[_\.\-]+/g, " ")
    .replace(/(^|\s)([\p{L}\p{N}])/gu, (match) => match.toUpperCase())
    .trim();

export const translateMetaObjective = (value: string | null | undefined): string => {
  if (!value) {
    return "—";
  }
  const upper = value.trim().toUpperCase();
  if (!upper) {
    return "—";
  }
  if (EXACT_LABELS[upper]) {
    return EXACT_LABELS[upper];
  }
  for (const rule of KEYWORD_LABELS) {
    if (rule.match(upper)) {
      return rule.label;
    }
  }
  return capitaliseWords(upper);
};
