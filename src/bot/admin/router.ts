import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../types";
import {
  adminHomeKeyboard,
  chatDetailKeyboard,
  chatsListKeyboard,
  makePayload,
  projectChatsKeyboard,
  projectDetailKeyboard,
  projectsListKeyboard,
} from "./keyboards";
import { decodeCallbackPayload } from "../../utils/secure";
import {
  deleteChat,
  deleteProject,
  getChat,
  getProject,
  listChats,
  listProjects,
  saveChat,
  upsertProject,
} from "../../services/storage";
import { Role } from "../../types/domain";

interface CallbackPayload {
  action: string;
  data?: unknown;
}

function hasRole(ctx: BotContext, allowed: Role[]): boolean {
  const role = ctx.session.role;
  return !!role && allowed.includes(role);
}

async function replyOrEdit(
  ctx: BotContext,
  text: string,
  keyboard?: InlineKeyboard
): Promise<void> {
  const message = ctx.callbackQuery?.message;
  const options = keyboard ? { reply_markup: keyboard } : undefined;
  if (message) {
    try {
      await ctx.editMessageText(text, options);
      return;
    } catch (error) {
      if (error instanceof Error && /message is not modified/i.test(error.message)) {
        return;
      }
    }
  }
  await ctx.reply(text, options);
}

export const adminRouter = new Composer<BotContext>();

async function showHome(ctx: BotContext, notice?: string): Promise<void> {
  const message = notice ? `${notice}\n\n` : "";
  await replyOrEdit(ctx, `${message}Админ-панель:`, adminHomeKeyboard());
}

adminRouter.command("admin", async (ctx) => {
  await showHome(ctx);
});

adminRouter.callbackQuery(/.*/, async (ctx, next) => {
  const raw = ctx.callbackQuery.data;
  if (!raw) {
    return next();
  }

  let payload: CallbackPayload;
  try {
    payload = decodeCallbackPayload<CallbackPayload>(raw);
  } catch (error) {
    await ctx.answerCallbackQuery({ text: "Неверная кнопка", show_alert: true });
    return;
  }

  ctx.session.lastAdminCommandAt = Date.now();
  let answered = false;
  const answer = async (
    params?: Parameters<typeof ctx.answerCallbackQuery>[0]
  ): Promise<void> => {
    if (answered) return;
    await ctx.answerCallbackQuery(params);
    answered = true;
  };

  switch (payload.action) {
    case "home":
      await showHome(ctx);
      await answer();
      break;
    case "projects:list":
      await handleProjectsList(ctx);
      await answer();
      break;
    case "projects:add":
      await answer();
      await ctx.conversation.enter("addProject");
      break;
    case "projects:detail":
      if (!(await handleProjectDetail(ctx, payload.data, answer))) {
        return;
      }
      await answer();
      break;
    case "projects:delete":
      if (!(await handleProjectDeletePrompt(ctx, payload.data, answer))) {
        return;
      }
      await answer();
      break;
    case "projects:delete_confirm":
      if (!(await handleProjectDeleteConfirm(ctx, payload.data, answer))) {
        return;
      }
      await answer();
      break;
    case "projects:chats":
      if (!(await handleProjectChats(ctx, payload.data, answer))) {
        return;
      }
      await answer();
      break;
    case "projects:link_chat":
      if (!(await handleProjectLinkChat(ctx, payload.data, answer))) {
        return;
      }
      await answer();
      break;
    case "chats:list":
      await handleChatsList(ctx);
      await answer();
      break;
    case "chats:detail":
      if (!(await handleChatDetail(ctx, payload.data, answer))) {
        return;
      }
      await answer();
      break;
    case "chats:test":
      await handleChatTest(ctx, payload.data, answer);
      return;
    case "chats:delete":
      if (!(await handleChatDelete(ctx, payload.data, answer))) {
        return;
      }
      await answer();
      break;
    case "chats:assign":
      if (!(await handleChatAssign(ctx, payload.data, answer))) {
        return;
      }
      await answer();
      break;
    default:
      await answer({ text: "Секция в разработке", show_alert: true });
      return;
  }
});

async function handleProjectsList(ctx: BotContext): Promise<void> {
  const projects = await listProjects();
  const text =
    projects.length > 0
      ? projects
          .map((project) => {
            const name = project.projectName ?? project.id;
            const chats = project.chats.length;
            return `• ${name} (чаты: ${chats})`;
          })
          .join("\n")
      : "Проектов пока нет. Создайте первый проект.";
  await replyOrEdit(ctx, text, projectsListKeyboard(projects));
}

type AnswerFn = (params?: Parameters<BotContext["answerCallbackQuery"]>[0]) => Promise<void>;

async function handleProjectDetail(
  ctx: BotContext,
  data: unknown,
  answer: AnswerFn
): Promise<boolean> {
  const id = getProjectId(data);
  if (!id) {
    await answer({ text: "Проект не найден", show_alert: true });
    return false;
  }
  const project = await getProject(id);
  if (!project) {
    await answer({ text: "Проект удалён", show_alert: true });
    return false;
  }
  const lines: string[] = [];
  lines.push(`📁 ${project.projectName ?? project.id}`);
  if (project.description) {
    lines.push(project.description);
  }
  lines.push(`Чатов: ${project.chats.length}`);
  if (project.chats.length > 0) {
    lines.push(
      project.chats
        .map((chat) => ` • ${chat.title ?? chat.chatId} (${chat.chatId}${chat.threadId ? `:${chat.threadId}` : ""})`)
        .join("\n")
    );
  }
  await replyOrEdit(ctx, lines.join("\n"), projectDetailKeyboard(project.id));
  return true;
}

async function handleProjectDeletePrompt(
  ctx: BotContext,
  data: unknown,
  answer: AnswerFn
): Promise<boolean> {
  if (!hasRole(ctx, ["SUPER_ADMIN", "ADMIN"])) {
    await answer({ text: "Недостаточно прав", show_alert: true });
    return false;
  }
  const id = getProjectId(data);
  if (!id) {
    await answer({ text: "Проект не найден", show_alert: true });
    return false;
  }
  const keyboard = new InlineKeyboard()
    .text("✅ Подтвердить", makePayload("projects:delete_confirm", { id }))
    .text("↩️ Отмена", makePayload("projects:detail", { id }));
  await replyOrEdit(ctx, "Удалить проект? Действие необратимо.", keyboard);
  return true;
}

async function handleProjectDeleteConfirm(
  ctx: BotContext,
  data: unknown,
  answer: AnswerFn
): Promise<boolean> {
  if (!hasRole(ctx, ["SUPER_ADMIN", "ADMIN"])) {
    await answer({ text: "Недостаточно прав", show_alert: true });
    return false;
  }
  const id = getProjectId(data);
  if (!id) {
    await answer({ text: "Проект не найден", show_alert: true });
    return false;
  }

  const project = await getProject(id);
  if (project) {
    for (const chat of project.chats) {
      const stored = await getChat(chat.chatId, chat.threadId);
      if (stored) {
        await saveChat({ ...stored, projectId: undefined });
      }
    }
  }

  await deleteProject(id);
  await handleProjectsList(ctx);
  return true;
}

async function handleProjectChats(
  ctx: BotContext,
  data: unknown,
  answer: AnswerFn
): Promise<boolean> {
  const id = getProjectId(data);
  if (!id) {
    await answer({ text: "Проект не найден", show_alert: true });
    return false;
  }
  const project = await getProject(id);
  if (!project) {
    await answer({ text: "Проект удалён", show_alert: true });
    return false;
  }
  const text =
    project.chats.length > 0
      ? project.chats
          .map((chat) => `• ${chat.title ?? chat.chatId} (${chat.chatId}${chat.threadId ? `:${chat.threadId}` : ""})`)
          .join("\n")
      : "Чаты не привязаны.";
  await replyOrEdit(ctx, text, projectChatsKeyboard(project.id));
  return true;
}

async function handleProjectLinkChat(
  ctx: BotContext,
  data: unknown,
  answer: AnswerFn
): Promise<boolean> {
  const id = getProjectId(data);
  if (!id) {
    await answer({ text: "Проект не найден", show_alert: true });
    return false;
  }
  ctx.session.pendingProjectId = id;
  await ctx.conversation.enter("linkChat");
  return true;
}

async function handleChatsList(ctx: BotContext): Promise<void> {
  const chats = await listChats();
  const text =
    chats.length > 0
      ? chats
          .map((chat) => {
            const label = chat.title ?? chat.chatId;
            const project = chat.projectId ? ` → ${chat.projectId}` : "";
            return `• ${label} (${chat.chatId}${chat.threadId ? `:${chat.threadId}` : ""})${project}`;
          })
          .join("\n")
      : "Чатов пока нет.";
  await replyOrEdit(ctx, text, chatsListKeyboard(chats));
}

interface ChatIdentifier {
  chatId: number;
  threadId?: number;
}

function parseChatIdentifier(data: unknown): ChatIdentifier | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const value = data as { chatId?: unknown; threadId?: unknown };
  if (typeof value.chatId !== "number") {
    return null;
  }
  return {
    chatId: value.chatId,
    threadId: typeof value.threadId === "number" ? value.threadId : undefined,
  };
}

async function handleChatDetail(
  ctx: BotContext,
  data: unknown,
  answer: AnswerFn
): Promise<boolean> {
  const identifier = parseChatIdentifier(data);
  if (!identifier) {
    await answer({ text: "Чат не найден", show_alert: true });
    return false;
  }
  const chat = await getChat(identifier.chatId, identifier.threadId);
  if (!chat) {
    await answer({ text: "Чат удалён", show_alert: true });
    return false;
  }
  await replyOrEdit(
    ctx,
    `Чат ${chat.title ?? chat.chatId}\nID: ${chat.chatId}${chat.threadId ? `:${chat.threadId}` : ""}`,
    chatDetailKeyboard(chat.chatId, chat.threadId)
  );
  return true;
}

async function handleChatTest(
  ctx: BotContext,
  data: unknown,
  answer: AnswerFn
): Promise<void> {
  const identifier = parseChatIdentifier(data);
  if (!identifier) {
    await answer({ text: "Чат не найден", show_alert: true });
    return;
  }
  try {
    await ctx.api.sendMessage(identifier.chatId, "Тестовое сообщение из админки", {
      message_thread_id: identifier.threadId,
    });
    await answer({ text: "Отправлено" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка отправки";
    await answer({ text: message, show_alert: true });
  }
}

async function handleChatDelete(
  ctx: BotContext,
  data: unknown,
  answer: AnswerFn
): Promise<boolean> {
  if (!hasRole(ctx, ["SUPER_ADMIN", "ADMIN"])) {
    await answer({ text: "Недостаточно прав", show_alert: true });
    return false;
  }
  const identifier = parseChatIdentifier(data);
  if (!identifier) {
    await answer({ text: "Чат не найден", show_alert: true });
    return false;
  }

  const chat = await getChat(identifier.chatId, identifier.threadId);
  if (chat?.projectId) {
    const project = await getProject(chat.projectId);
    if (project) {
      const nextChats = project.chats.filter(
        (item) => !(item.chatId === identifier.chatId && item.threadId === identifier.threadId)
      );
      await upsertProject({ ...project, chats: nextChats });
    }
  }

  await deleteChat(identifier.chatId, identifier.threadId);
  await handleChatsList(ctx);
  return true;
}

async function handleChatAssign(
  ctx: BotContext,
  data: unknown,
  answer: AnswerFn
): Promise<boolean> {
  const identifier = parseChatIdentifier(data);
  if (!identifier) {
    await answer({ text: "Чат не найден", show_alert: true });
    return false;
  }
  const chat = await getChat(identifier.chatId, identifier.threadId);
  ctx.session.pendingChat = chat ?? {
    chatId: identifier.chatId,
    threadId: identifier.threadId,
  };
  await ctx.conversation.enter("linkChat");
  return true;
}

function getProjectId(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const value = data as { id?: unknown };
  return typeof value.id === "string" ? value.id : null;
}
