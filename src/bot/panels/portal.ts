import { requireProjectRecord } from "../../domain/spec/project";
import type { InlineKeyboardMarkup } from "../types";
import { buildPortalMessage } from "../messages";
import type { PanelRenderer } from "./types";

export const render: PanelRenderer = async ({ runtime, params }) => {
  const projectId = params[0];
  if (!projectId) {
    return { text: "Проект не найден.", keyboard: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "panel:projects" }]] } };
  }
  const project = await requireProjectRecord(runtime.kv, projectId);
  return {
    text: buildPortalMessage(project),
    keyboard: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: `project:card:${projectId}` }]] },
  };
};
