import { requireProjectRecord } from "../../domain/spec/project";
import type { InlineKeyboardMarkup } from "../types";
import type { PanelRenderer } from "./types";

export const render: PanelRenderer = async ({ runtime, params }) => {
  const projectId = params[0];
  if (!projectId) {
    return { text: "Проект не найден.", keyboard: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "panel:projects" }]] } };
  }
  const project = await requireProjectRecord(runtime.kv, projectId);
  return {
    text:
      `Вы уверены, что хотите отвязать чат от проекта <b>${project.name}</b>?\n` +
      "Лиды, отчёты и алерты перестанут отправляться в этот чат.",
    keyboard: {
      inline_keyboard: [
        [{ text: "✅ Да, отвязать", callback_data: `project:chat-unlink-confirm:${projectId}` }],
        [{ text: "⬅️ Отмена", callback_data: `project:card:${projectId}` }],
      ],
    },
  };
};
