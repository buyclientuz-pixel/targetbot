import { z } from "zod";
import { BotContext, BotConversation } from "../../types";
import {
  listChats,
  saveChat,
  StoredChat,
  upsertProject,
} from "../../../services/storage";
import { adminHomeKeyboard } from "../keyboards";

const titleSchema = z.string().trim().min(1, "Название не может быть пустым");

function parseChatId(text: string): number | null {
  const trimmed = text.trim();
  if (!/^(-?\d+)$/.test(trimmed)) {
    return null;
  }
  const id = Number(trimmed);
  if (!Number.isSafeInteger(id)) {
    return null;
  }
  return id;
}

export async function addProjectScene(
  conversation: BotConversation,
  ctx: BotContext
): Promise<void> {
  await ctx.reply("Введите название проекта:");
  let projectName: string | undefined;
  while (!projectName) {
    const nameMessage = await conversation.waitFor("message:text");
    const messageText = nameMessage.message?.text ?? "";
    const result = titleSchema.safeParse(messageText);
    if (!result.success) {
      await ctx.reply("Название не может быть пустым. Попробуйте снова.");
      continue;
    }
    projectName = result.data;
  }

  await ctx.reply(
    "Добавьте описание проекта (или отправьте `-`, чтобы пропустить)",
    { parse_mode: "Markdown" }
  );
  const descriptionMessage = await conversation.waitFor("message:text");
  const description = descriptionMessage.message?.text?.trim() ?? "";
  const projectDescription = description === "-" ? undefined : description;

  const knownChats = await listChats();
  if (knownChats.length > 0) {
    const lines = knownChats.map((chat) => {
      const name = chat.title ?? "Без названия";
      return `• ${name} — ${chat.chatId}${chat.threadId ? `:${chat.threadId}` : ""}`;
    });
    await ctx.reply(
      `Известные чаты:\n${lines.join("\n")}\n\nПерешлите сообщение из нужного чата или введите chat_id. Отправьте «готово» для завершения.`,
      { disable_web_page_preview: true }
    );
  } else {
    await ctx.reply(
      "Перешлите сообщение из чата или введите chat_id. Отправьте «готово», когда добавите все чаты."
    );
  }

  const chatRefs: StoredChat[] = [];

  while (true) {
    const response = await conversation.wait();
    const msg = response.message;
    if (!msg) {
      continue;
    }

    if (msg.text && msg.text.toLowerCase() === "готово") {
      break;
    }

    let chatId: number | null = null;
    let title: string | undefined;
    let threadId: number | undefined;

    if (msg.forward_from_chat) {
      chatId = msg.forward_from_chat.id;
      title = msg.forward_from_chat.title ?? undefined;
    } else if (
      "forward_origin" in msg &&
      msg.forward_origin &&
      typeof msg.forward_origin === "object" &&
      "type" in msg.forward_origin &&
      msg.forward_origin.type === "channel" &&
      "chat" in msg.forward_origin
    ) {
      const origin = msg.forward_origin as { chat: { id: number; title?: string } };
      chatId = origin.chat.id;
      title = origin.chat.title;
    } else if (msg.text) {
      chatId = parseChatId(msg.text);
    }

    if (!chatId) {
      await ctx.reply("Не удалось определить chat_id. Попробуйте ещё раз.");
      continue;
    }

    if (msg.is_topic_message && msg.message_thread_id) {
      threadId = msg.message_thread_id;
    }

    const existing = chatRefs.find(
      (chat) => chat.chatId === chatId && chat.threadId === threadId
    );
    if (existing) {
      await ctx.reply("Этот чат уже добавлен.");
      continue;
    }

    const stored: StoredChat = {
      chatId,
      threadId,
      title,
      projectId: undefined,
    };
    chatRefs.push(stored);
    await ctx.reply(
      `Добавлен чат ${title ?? "без названия"} (${chatId}${threadId ? `:${threadId}` : ""})`
    );
  }

  const project = await upsertProject({
    projectName,
    description: projectDescription,
    chats: chatRefs.map((chat) => ({
      chatId: chat.chatId,
      threadId: chat.threadId,
      title: chat.title,
    })),
  });

  for (const chat of chatRefs) {
    await saveChat({ ...chat, projectId: project.id });
  }

  await ctx.reply(
    `Проект «${project.projectName ?? project.id}» создан.`,
    { disable_web_page_preview: true, reply_markup: adminHomeKeyboard() }
  );
}
