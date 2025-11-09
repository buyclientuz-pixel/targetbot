import { InlineKeyboard } from "grammy";
import { encodeCallbackPayload } from "../../utils/secure";

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
