import { BotContext, BotConversation } from "../../types";
import {
  getProject,
  listProjects,
  saveChat,
  StoredChat,
  upsertProject,
} from "../../../services/storage";
import { adminHomeKeyboard } from "../keyboards";

function formatProjectLine(project: { id: string; projectName?: string }): string {
  const name = project.projectName ?? project.id;
  return `${name} — ${project.id}`;
}

function parseChatId(text: string): number | null {
  const normalized = text.trim();
  if (!/^(-?\d+)$/.test(normalized)) {
    return null;
  }
  const id = Number(normalized);
  if (!Number.isSafeInteger(id)) {
    return null;
  }
  return id;
}

export async function linkChatScene(
  conversation: BotConversation,
  ctx: BotContext
): Promise<void> {
  let projectId = ctx.session.pendingProjectId;
  ctx.session.pendingProjectId = undefined;
  const pendingChat = ctx.session.pendingChat;
  ctx.session.pendingChat = undefined;

  let project = projectId ? await getProject(projectId) : null;

  if (!project) {
    const projects = await listProjects();
    if (projects.length === 0) {
      await ctx.reply("Нет проектов для привязки. Сначала создайте проект.");
      return;
    }

    const lines = projects.map(formatProjectLine).join("\n");
    await ctx.reply(
      `Выберите проект. Отправьте ID из списка ниже:\n${lines}`,
      { disable_web_page_preview: true }
    );
    while (!project) {
      const response = await conversation.waitFor("message:text");
      const candidate = response.message?.text?.trim();
      if (!candidate) {
        await ctx.reply("Введите ID проекта.");
        continue;
      }
      const found = projects.find((item) => item.id === candidate);
      if (!found) {
        await ctx.reply("Проект не найден. Попробуйте снова.");
        continue;
      }
      project = found;
      projectId = found.id;
    }
  }

  if (pendingChat) {
    const alreadyLinked = project.chats.some(
      (chat) => chat.chatId === pendingChat.chatId && chat.threadId === pendingChat.threadId
    );
    if (alreadyLinked) {
      await ctx.reply("Чат уже привязан к проекту.", {
        reply_markup: adminHomeKeyboard(),
      });
      return;
    }

    await saveChat({
      chatId: pendingChat.chatId,
      threadId: pendingChat.threadId,
      title: pendingChat.title,
      projectId,
    });

    await upsertProject({
      ...project,
      id: projectId,
      chats: [
        ...project.chats,
        {
          chatId: pendingChat.chatId,
          threadId: pendingChat.threadId,
          title: pendingChat.title,
        },
      ],
    });

    await ctx.reply("Чат успешно привязан.", {
      reply_markup: adminHomeKeyboard(),
    });
    return;
  }

  await ctx.reply(
    `Привязка к проекту «${project.projectName ?? project.id}».\nПерешлите сообщение из чата или введите chat_id. Отправьте «отмена» для выхода.`
  );

  while (true) {
    const update = await conversation.wait();
    const message = update.message;
    if (!message) {
      continue;
    }

    if (message.text && message.text.toLowerCase() === "отмена") {
      await ctx.reply("Привязка отменена.");
      return;
    }

    let chatId: number | null = null;
    let title: string | undefined;
    let threadId: number | undefined;

    if (message.forward_from_chat) {
      chatId = message.forward_from_chat.id;
      title = message.forward_from_chat.title ?? undefined;
    } else if (message.text) {
      chatId = parseChatId(message.text);
    }

    if (!chatId) {
      await ctx.reply("Не удалось определить chat_id. Попробуйте снова.");
      continue;
    }

    if (message.is_topic_message && message.message_thread_id) {
      threadId = message.message_thread_id;
    }

    const alreadyLinked = project.chats.some(
      (chat) => chat.chatId === chatId && chat.threadId === threadId
    );
    if (alreadyLinked) {
      await ctx.reply("Этот чат уже привязан к проекту.", {
        reply_markup: adminHomeKeyboard(),
      });
      return;
    }

    const stored: StoredChat = {
      chatId,
      threadId,
      title,
      projectId,
    };
    await saveChat(stored);

    const nextProject = await upsertProject({
      ...project,
      id: projectId,
      chats: [
        ...project.chats,
        {
          chatId,
          threadId,
          title,
        },
      ],
    });

    await ctx.reply(
      `Чат ${title ?? chatId} привязан к проекту «${nextProject.projectName ?? nextProject.id}».`,
      { reply_markup: adminHomeKeyboard() }
    );
    return;
  }
}
