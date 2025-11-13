import { BotContext } from "./types";
import { appendQueryParameter, buildAuthState, resolveAuthUrl, resolveManageWebhookUrl } from "./environment";
import { editTelegramMessage, sendTelegramMessage } from "../utils/telegram";
import { loadMetaToken } from "../utils/storage";
import { resolveMetaStatus } from "../utils/meta";
import { escapeHtml } from "../utils/html";

const formatDateTime = (value?: string): string => {
  if (!value) {
    return "—";
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return "—";
  }
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(parsed));
};

const buildMetaStatusBlock = (status: Awaited<ReturnType<typeof resolveMetaStatus>>): string => {
  const lines: string[] = [];
  switch (status.status) {
    case "valid":
      lines.push("🧩 Facebook: ✅ Подключено");
      if (status.accountName) {
        lines.push(`Аккаунт: <b>${escapeHtml(status.accountName)}</b>`);
      }
      if (status.expiresAt) {
        lines.push(`Токен действует до: <b>${escapeHtml(formatDateTime(status.expiresAt))}</b>`);
      }
      break;
    case "expired":
      lines.push("🧩 Facebook: ⚠️ Токен истёк");
      lines.push("Обновите авторизацию, чтобы продолжить работу с Meta.");
      break;
    case "missing":
    default:
      lines.push("🧩 Facebook: ❌ Не подключено");
      lines.push("Нажмите «Авторизация Facebook», чтобы войти.");
      break;
  }
  if (status.issues?.length) {
    lines.push(`⚠️ ${escapeHtml(status.issues[0])}`);
    if (status.issues.length > 1) {
      lines.push(`… ещё ${status.issues.length - 1} предупреждений.`);
    }
  }
  return lines.join("\n");
};

const buildMenuMarkup = (authUrl: string, webhookUrl: string | null) => {
  const webhookButton = { text: "🔄 Вебхуки Telegram", url: webhookUrl };
  return {
    inline_keyboard: [
      [
        { text: "🔐 Авторизация Facebook", url: authUrl },
        { text: "🔗 Meta-аккаунты", callback_data: "cmd:meta" },
      ],
      [
        { text: "📊 Проекты", callback_data: "cmd:projects" },
        { text: "📈 Аналитика", callback_data: "cmd:analytics" },
      ],
      [
        { text: "👥 Пользователи", callback_data: "cmd:users" },
        { text: "💰 Финансы", callback_data: "cmd:finance" },
      ],
      [
        { text: "⚙ Настройки", callback_data: "cmd:settings" },
        webhookButton,
      ],
    ],
  };
};

const deliverMenuMessage = async (
  context: BotContext,
  text: string,
  replyMarkup: ReturnType<typeof buildMenuMarkup>,
): Promise<void> => {
  if (!context.chatId) {
    console.warn("Cannot render menu without chatId");
    return;
  }
  if (context.update.callback_query?.message && typeof context.messageId === "number") {
    await editTelegramMessage(context.env, {
      chatId: context.chatId,
      messageId: context.messageId,
      text,
      replyMarkup,
    });
    return;
  }
  await sendTelegramMessage(context.env, {
    chatId: context.chatId,
    threadId: context.threadId,
    text,
    replyMarkup,
  });
};

interface MenuOptions {
  message?: string;
}

const renderMenu = async (context: BotContext, options: MenuOptions = {}): Promise<void> => {
  const token = await loadMetaToken(context.env).catch(() => null);
  let status;
  try {
    status = await resolveMetaStatus(context.env, token);
  } catch (error) {
    console.warn("Failed to resolve Meta status", error);
    status = { ok: false, status: "missing" as const, issues: ["Meta API недоступен"] };
  }
  const statusBlock = buildMetaStatusBlock(status);

  let authUrl = resolveAuthUrl(context.env);
  const state = await buildAuthState(context);
  if (state) {
    authUrl = appendQueryParameter(authUrl, "state", state);
  }
  const webhookUrl = resolveManageWebhookUrl(context.env);
  const replyMarkup = buildMenuMarkup(authUrl, webhookUrl);

  const intro = options.message ?? "🏠 Главное меню";
  const lines = [intro, "", statusBlock, "", "Все разделы доступны через кнопки ниже."].filter(Boolean);
  await deliverMenuMessage(context, lines.join("\n"), replyMarkup);
};

export const sendMainMenu = async (context: BotContext): Promise<void> => {
  await renderMenu(context);
};

export const acknowledgeCommand = async (context: BotContext): Promise<void> => {
  const trimmed = context.text?.trim();
  const message = trimmed
    ? `Команда «${escapeHtml(trimmed)}» пока не поддерживается. Используйте кнопки ниже.`
    : "Команда пока не поддерживается. Используйте кнопки ниже.";
  await renderMenu(context, { message });
};
