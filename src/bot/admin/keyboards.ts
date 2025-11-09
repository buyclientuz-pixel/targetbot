import { InlineKeyboard } from "grammy";
import { Project } from "../../types/domain";
import { encodeCallbackPayload } from "../../utils/secure";
import { StoredChat } from "../../services/storage";

export function adminHomeKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("🧭 Проекты", makePayload("projects:list"))
    .text("💬 Чаты", makePayload("chats:list")).row()
    .text("📊 Отчёты", makePayload("reports:home"))
    .text("🎯 Цели", makePayload("objectives:home")).row()
    .text("🔗 Портал", makePayload("portal:home"))
    .text("🧾 Биллинг", makePayload("billing:home")).row()
    .text("📜 Логи", makePayload("logs:home"))
    .text("📨 Рассылка", makePayload("broadcast:start")).row()
    .text("🛡 Админы", makePayload("admins:home"))
    .text("⚙️ Настройки", makePayload("settings:home"));
  return keyboard;
}

export function makePayload(action: string, data?: unknown): string {
  return encodeCallbackPayload({ action, data });
}

export function projectsListKeyboard(projects: Project[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const project of projects) {
    const title = project.projectName ?? project.id;
    keyboard.text(`📁 ${title}`, makePayload("projects:detail", { id: project.id })).row();
  }
  keyboard
    .text("➕ Добавить", makePayload("projects:add"))
    .text("⬅️ Назад", makePayload("home"));
  return keyboard;
}

export function projectDetailKeyboard(projectId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("💬 Чаты", makePayload("projects:chats", { id: projectId }))
    .text("🔗 Портал", makePayload("portal:project", { id: projectId }))
    .row()
    .text("✏️ Редактировать", makePayload("projects:edit", { id: projectId }))
    .text("🗑 Удалить", makePayload("projects:delete", { id: projectId }))
    .row()
    .text("⬅️ Назад", makePayload("projects:list"))
    .text("🏠 Домой", makePayload("home"));
}

export function projectChatsKeyboard(projectId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("➕ Привязать", makePayload("projects:link_chat", { id: projectId }))
    .text("⬅️ Назад", makePayload("projects:detail", { id: projectId }));
}

export function chatsListKeyboard(chats: StoredChat[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const chat of chats) {
    const label = chat.title ?? String(chat.chatId);
    keyboard
      .text(
        `💬 ${label}`,
        makePayload("chats:detail", {
          chatId: chat.chatId,
          threadId: chat.threadId,
        })
      )
      .row();
  }
  keyboard
    .text("➕ Добавить", makePayload("chats:add"))
    .text("⬅️ Назад", makePayload("home"));
  return keyboard;
}

export function chatDetailKeyboard(chatId: number, threadId?: number): InlineKeyboard {
  return new InlineKeyboard()
    .text(
      "📨 Тест",
      makePayload("chats:test", { chatId, threadId })
    )
    .text(
      "🔗 К проекту",
      makePayload("chats:assign", { chatId, threadId })
    )
    .row()
    .text(
      "✏️ Заголовок",
      makePayload("chats:rename", { chatId, threadId })
    )
    .text(
      "🗑 Удалить",
      makePayload("chats:delete", { chatId, threadId })
    )
    .row()
    .text("⬅️ Назад", makePayload("chats:list"))
    .text("🏠 Домой", makePayload("home"));
}
