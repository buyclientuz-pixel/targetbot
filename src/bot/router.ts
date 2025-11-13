import { createContext } from "./context";
import { acknowledgeCommand } from "./menu";
import {
  runCommand,
  resolveCommand,
  handleProjectCallback,
  handleAutoReportCallback,
  handleMetaCallback,
  handlePendingBillingInput,
  handlePendingProjectEditInput,
  handlePendingUserInput,
  handleUserCallback,
  handleAnalyticsCallback,
} from "./commands";
import { handleReportCallback, isReportCallbackData, handleSpecKpiCallback, isSpecKpiCallback } from "./reports";
import { BotContext, TelegramUpdate } from "./types";
import { jsonResponse } from "../utils/http";
import { EnvBindings, listProjects, listSettings } from "../utils/storage";
import { TelegramEnv, answerCallbackQuery, sendTelegramMessage } from "../utils/telegram";
import { ProjectRecord } from "../types";
import { escapeHtml } from "../utils/html";

const ensureEnv = (env: unknown): (EnvBindings & TelegramEnv) | null => {
  if (!env || typeof env !== "object") {
    return null;
  }
  if (!("DB" in env) || !("R2" in env)) {
    return null;
  }
  return env as EnvBindings & TelegramEnv;
};

const ADMIN_CHAT_ENV_KEYS = [
  "ADMIN_CHAT_ID",
  "ADMIN_CHAT_IDS",
  "BOT_ADMIN_CHAT",
  "BOT_ADMIN_CHATS",
  "TELEGRAM_ADMIN_CHAT_ID",
  "TELEGRAM_ADMIN_CHAT_IDS",
  "ADMIN_CHAT",
  "ADMIN_CHATS",
];

const ADMIN_CHAT_SETTING_KEYS = [
  "bot.adminChats",
  "bot.adminChatIds",
  "bot.admin.chatIds",
  "bot.admin.chatId",
];

const collectChatIds = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string" && item.trim()) {
          return item.trim();
        }
        if (typeof item === "number" && Number.isFinite(item)) {
          return item.toString();
        }
        return null;
      })
      .filter((item): item is string => Boolean(item));
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return [value.toString()];
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (value && typeof value === "object") {
    const maybeList = (value as { chatIds?: unknown; value?: unknown }).chatIds ?? (value as { value?: unknown }).value;
    if (maybeList !== undefined) {
      return collectChatIds(maybeList);
    }
  }
  return [];
};

const resolveAdminChatIds = async (env: EnvBindings & TelegramEnv): Promise<Set<string>> => {
  const ids = new Set<string>();
  for (const key of ADMIN_CHAT_ENV_KEYS) {
    if (key in env) {
      collectChatIds((env as Record<string, unknown>)[key]).forEach((id) => ids.add(id));
    }
  }
  try {
    const settings = await listSettings(env);
    ADMIN_CHAT_SETTING_KEYS.forEach((key) => {
      const entry = settings.find((item) => item.key === key);
      if (entry) {
        collectChatIds(entry.value).forEach((id) => ids.add(id));
      }
    });
  } catch (error) {
    console.warn("Failed to load settings for admin chat detection", error);
  }
  return ids;
};

const findProjectByChatId = async (
  env: EnvBindings,
  chatId: string,
): Promise<ProjectRecord | null> => {
  try {
    const projects = await listProjects(env);
    return projects.find((project) => project.telegramChatId === chatId) ?? null;
  } catch (error) {
    console.warn("Failed to list projects while resolving chat policy", error);
    return null;
  }
};

type ChatRole = "admin" | "client" | "unregistered" | "unknown";

interface ChatPolicy {
  role: ChatRole;
  project?: ProjectRecord | null;
}

const resolveChatPolicy = async (context: BotContext): Promise<ChatPolicy> => {
  if (!context.chatId) {
    return { role: "unknown" };
  }
  const adminIds = await resolveAdminChatIds(context.env);
  const chatType = context.chatType;
  if (!chatType || chatType === "private" || adminIds.has(context.chatId)) {
    return { role: "admin" };
  }
  const project = await findProjectByChatId(context.env, context.chatId);
  if (project) {
    return { role: "client", project };
  }
  return { role: "unregistered" };
};

const sendRestrictedNotice = async (context: BotContext, policy: ChatPolicy): Promise<void> => {
  if (!context.chatId) {
    return;
  }
  const parts: string[] = [];
  if (policy.role === "client" && policy.project) {
    parts.push(`Чат привязан к проекту <b>${escapeHtml(policy.project.name)}</b>.`);
    parts.push("Управление доступно только администраторам TargetBot.");
  } else if (policy.role === "client") {
    parts.push("Чат уже привязан к проекту. Команды отключены.");
  } else {
    parts.push("Чат ещё не зарегистрирован. Добавьте TargetBot в группу и отправьте /reg для привязки.");
  }
  await sendTelegramMessage(context.env, {
    chatId: context.chatId,
    threadId: context.threadId,
    text: parts.join("\n"),
  });
};

const handleUpdate = async (context: BotContext): Promise<void> => {
  const command = resolveCommand(context.text);
  if (command === "register_chat") {
    const handled = await runCommand(command, context);
    if (handled) {
      return;
    }
  }

  const policy = await resolveChatPolicy(context);

  if (policy.role !== "admin") {
    if (context.update.callback_query?.id) {
      await answerCallbackQuery(context.env, context.update.callback_query.id, "Команды отключены в этом чате");
    }
    if (command) {
      await sendRestrictedNotice(context, policy);
    }
    return;
  }

  if (!context.update.callback_query && !command) {
    const pendingBillingHandled = await handlePendingBillingInput(context);
    if (pendingBillingHandled) {
      return;
    }
    const pendingProjectEditHandled = await handlePendingProjectEditInput(context);
    if (pendingProjectEditHandled) {
      return;
    }
    const pendingHandled = await handlePendingUserInput(context);
    if (pendingHandled) {
      return;
    }
  }

  const callbackData = context.update.callback_query?.data;
  if (isSpecKpiCallback(callbackData)) {
    const handled = await handleSpecKpiCallback(context, callbackData!);
    if (handled) {
      return;
    }
  }
  if (isReportCallbackData(callbackData)) {
    const handled = await handleReportCallback(context, callbackData!);
    if (handled) {
      return;
    }
  }
  if (callbackData) {
    const handledAnalytics = await handleAnalyticsCallback(context, callbackData);
    if (handledAnalytics) {
      if (context.update.callback_query?.id) {
        await answerCallbackQuery(context.env, context.update.callback_query.id);
      }
      return;
    }
    const handledUser = await handleUserCallback(context, callbackData);
    if (handledUser) {
      if (context.update.callback_query?.id) {
        await answerCallbackQuery(context.env, context.update.callback_query.id);
      }
      return;
    }
    const handledMeta = await handleMetaCallback(context, callbackData);
    if (handledMeta) {
      if (context.update.callback_query?.id) {
        await answerCallbackQuery(context.env, context.update.callback_query.id);
      }
      return;
    }
    const handledAuto = await handleAutoReportCallback(context, callbackData);
    if (handledAuto) {
      if (context.update.callback_query?.id) {
        await answerCallbackQuery(context.env, context.update.callback_query.id);
      }
      return;
    }
    const handled = await handleProjectCallback(context, callbackData);
    if (handled) {
      if (context.update.callback_query?.id) {
        await answerCallbackQuery(context.env, context.update.callback_query.id);
      }
      return;
    }
  }
  if (command) {
    const handled = await runCommand(command, context);
    if (handled) {
      return;
    }
  }
  if (context.update.callback_query?.id) {
    await answerCallbackQuery(context.env, context.update.callback_query.id, "Команда пока недоступна");
  }
  await acknowledgeCommand(context);
};

export const handleTelegramUpdate = async (request: Request, env: unknown): Promise<Response> => {
  const bindings = ensureEnv(env);
  if (!bindings) {
    return jsonResponse({ ok: false, error: "Worker bindings are missing" }, { status: 500 });
  }
  try {
    const update = (await request.json()) as TelegramUpdate;
    const context = createContext(bindings, update);
    await handleUpdate(context);
    return jsonResponse({ ok: true, data: { handled: true } });
  } catch (error) {
    console.error("telegram update error", error);
    return jsonResponse({ ok: false, error: (error as Error).message }, { status: 500 });
  }
};
