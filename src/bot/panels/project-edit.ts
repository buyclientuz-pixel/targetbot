import { requireProjectRecord } from "../../domain/spec/project";
import { buildProjectEditMessage } from "../messages";
import { buildProjectEditKeyboard } from "../keyboards";
import type { PanelRenderer } from "./types";

export const render: PanelRenderer = async ({ runtime, params }) => {
  const projectId = params[0];
  if (!projectId) {
    return { text: "Проект не найден.", keyboard: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "panel:projects" }]] } };
  }
  const project = await requireProjectRecord(runtime.kv, projectId);
  return {
    text: buildProjectEditMessage(project),
    keyboard: buildProjectEditKeyboard(projectId),
  };
};
