import { escapeAttribute, escapeHtml } from "./html";
import { sendTelegramMessage } from "./telegram";
import { LeadRecord, MetaLeadDetails, ProjectRecord, JsonObject } from "../types";
import { EnvBindings } from "./storage";

interface PhoneFormat {
  raw: string;
  tel: string;
  display: string;
}

interface LeadNotificationContent {
  kind: "contact" | "message";
  name: string;
  phone?: PhoneFormat;
  profileUrl?: string;
}

interface LeadNotificationOptions {
  details?: MetaLeadDetails | null;
  payload?: JsonObject | null;
}

const sanitizePhone = (value: string | undefined | null): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const digits = trimmed.replace(/[^+\d]/g, "");
  if (!digits) {
    return null;
  }
  if (digits.startsWith("+")) {
    return digits;
  }
  if (trimmed.startsWith("+")) {
    return `+${digits.replace(/^\+/, "")}`;
  }
  return digits.startsWith("8") && digits.length === 11 ? `+7${digits.slice(1)}` : `+${digits}`;
};

const formatUzbekPhone = (digits: string): string => {
  const country = digits.slice(0, 3);
  const rest = digits.slice(3);
  const segments = [rest.slice(0, 2), rest.slice(2, 5), rest.slice(5, 7), rest.slice(7, 9)].filter((segment) => segment.length > 0);
  return `+${country} ${segments.join(" ")}`;
};

const formatDefaultPhone = (digits: string): string => {
  const country = digits.slice(0, 1);
  const rest = digits.slice(1);
  const segments: string[] = [];
  let index = 0;
  while (index < rest.length) {
    const take = index === 0 ? 3 : index < 4 ? 2 : 2;
    segments.push(rest.slice(index, index + take));
    index += take;
  }
  return `+${country} ${segments.filter(Boolean).join(" ")}`;
};

const formatPhone = (raw: string): PhoneFormat => {
  const normalized = sanitizePhone(raw) ?? raw.trim();
  const digits = normalized.replace(/[^\d]/g, "");
  let display: string;
  if (digits.length === 12 && digits.startsWith("998")) {
    display = formatUzbekPhone(digits);
  } else if (digits.length >= 11) {
    display = formatDefaultPhone(digits);
  } else {
    display = normalized.startsWith("+") ? normalized : `+${digits}`;
  }
  const tel = normalized.startsWith("tel:") ? normalized : `tel:${normalized.startsWith("+") ? normalized : `+${digits}`}`;
  return {
    raw: raw.trim(),
    tel,
    display,
  };
};

const flattenAnswerValues = (answers: JsonObject | undefined | null): string[] => {
  if (!answers) {
    return [];
  }
  const values: string[] = [];
  for (const value of Object.values(answers)) {
    if (Array.isArray(value)) {
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : typeof entry === "number" || typeof entry === "boolean" ? String(entry) : null))
        .filter((entry): entry is string => Boolean(entry && entry.length))
        .forEach((entry) => values.push(entry));
    } else if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        values.push(trimmed);
      }
    }
  }
  return values;
};

const ensureInstagramUrl = (value: string): string => {
  const normalized = value.replace(/^@/, "").trim();
  if (!normalized) {
    return "https://instagram.com";
  }
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized.replace(/^http:\/\//, "https://");
  }
  return `https://instagram.com/${normalized}`;
};

const ensureFacebookUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "https://facebook.com";
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.replace(/^http:\/\//, "https://");
  }
  if (/^\d+$/.test(trimmed)) {
    return `https://facebook.com/messages/t/${trimmed}`;
  }
  if (trimmed.startsWith("@")) {
    return `https://facebook.com/${trimmed.slice(1)}`;
  }
  return `https://facebook.com/${trimmed}`;
};

const detectProfileUrl = (
  details?: MetaLeadDetails | null,
  payload?: JsonObject | null,
): string | undefined => {
  const answers = flattenAnswerValues(details?.answers);
  const candidates = [...answers];
  if (payload) {
    for (const value of Object.values(payload)) {
      if (typeof value === "string" && value.trim()) {
        candidates.push(value.trim());
      }
      if (value && typeof value === "object") {
        for (const entry of Object.values(value)) {
          if (typeof entry === "string" && entry.trim()) {
            candidates.push(entry.trim());
          }
        }
      }
    }
  }
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    if (lower.includes("instagram")) {
      return ensureInstagramUrl(candidate);
    }
    if (lower.includes("fb.com")) {
      return ensureFacebookUrl(candidate);
    }
    if (lower.includes("facebook.com")) {
      return ensureFacebookUrl(candidate);
    }
    if (lower.startsWith("@")) {
      return ensureInstagramUrl(candidate);
    }
    if (/^instagram\b/.test(lower)) {
      return ensureInstagramUrl(candidate.replace(/^instagram\s*/i, ""));
    }
    if (/^fb\b/.test(lower) || lower.includes("facebook")) {
      return ensureFacebookUrl(candidate.replace(/^facebook\s*/i, ""));
    }
  }
  const messengerId = answers.find((value) => /^\d+$/.test(value));
  if (messengerId) {
    return ensureFacebookUrl(messengerId);
  }
  return undefined;
};

export const metaLeadParser = (
  lead: LeadRecord,
  options: LeadNotificationOptions = {},
): LeadNotificationContent => {
  const phone = options.details?.phone || lead.phone || null;
  if (phone) {
    return {
      kind: "contact",
      name: lead.name,
      phone: formatPhone(phone),
    };
  }
  const profileUrl = detectProfileUrl(options.details, options.payload);
  return {
    kind: "message",
    name: lead.name,
    profileUrl,
  };
};

const buildLeadMessage = (content: LeadNotificationContent): { text: string; replyMarkup?: unknown } => {
  const lines: string[] = [];
  if (content.kind === "contact") {
    const phone = content.phone!;
    lines.push("🔔 Новый лид (контакт)");
    lines.push(`Имя: ${escapeHtml(content.name)}`);
    lines.push(`Телефон: <a href=\"${escapeAttribute(phone.tel)}\">${escapeHtml(phone.display)}</a>`);
    return { text: lines.join("\n") };
  }
  lines.push("🔔 Новый лид (сообщение)");
  lines.push(`Имя: ${escapeHtml(content.name)}`);
  lines.push("Сообщение: открыть диалог");
  const markup = content.profileUrl
    ? {
        inline_keyboard: [[{ text: "Открыть профиль", url: content.profileUrl }]],
      }
    : undefined;
  return { text: lines.join("\n"), replyMarkup: markup };
};

export const projectTopicRouter = (project: ProjectRecord): { chatId: string; threadId: number } | null => {
  const chatId = project.telegramChatId || project.chatId;
  const threadId = project.telegramThreadId;
  if (!chatId || typeof chatId !== "string" || !chatId.trim()) {
    console.warn("Project chat is missing", project.id);
    return null;
  }
  if (typeof threadId !== "number") {
    console.warn("Project thread is missing", project.id);
    return null;
  }
  return { chatId: chatId.trim(), threadId };
};

export const sendLeadToTelegram = async (
  env: EnvBindings & Record<string, unknown>,
  project: ProjectRecord,
  content: LeadNotificationContent,
): Promise<void> => {
  const route = projectTopicRouter(project);
  if (!route) {
    return;
  }
  const message = buildLeadMessage(content);
  await sendTelegramMessage(env, {
    chatId: route.chatId,
    threadId: route.threadId,
    text: message.text,
    replyMarkup: message.replyMarkup,
  });
};

export const leadReceiveHandler = async (
  env: EnvBindings & Record<string, unknown>,
  project: ProjectRecord,
  lead: LeadRecord,
  options: LeadNotificationOptions = {},
): Promise<void> => {
  const content = metaLeadParser(lead, options);
  await sendLeadToTelegram(env, project, content);
};
