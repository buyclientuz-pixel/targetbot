import { requireProjectRecord } from "../../domain/spec/project";
import { buildDeleteConfirmationMessage } from "../messages";
import { buildDeleteConfirmKeyboard } from "../keyboards";
import type { PanelRenderer } from "./types";

export const render: PanelRenderer = async ({ runtime, params }) => {
  const projectId = params[0];
  if (!projectId) {
    return { text: "Проект не найден.", keyboard: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "panel:projects" }]] } };
  }
  const project = await requireProjectRecord(runtime.kv, projectId);
  return {
    text: buildDeleteConfirmationMessage(project),
    keyboard: buildDeleteConfirmKeyboard(projectId),
  };
};
