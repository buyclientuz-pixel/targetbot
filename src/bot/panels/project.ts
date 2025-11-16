import { loadProjectBundle } from "../data";
import { buildProjectCardMessage } from "../messages";
import { buildProjectActionsKeyboard } from "../keyboards";
import type { PanelRenderer } from "./types";

export const render: PanelRenderer = async ({ runtime, params }) => {
  const projectId = params[0];
  if (!projectId) {
    return {
      text: "Проект не найден.",
      keyboard: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "panel:projects" }]] },
    };
  }
  const bundle = await loadProjectBundle(runtime.kv, runtime.r2, projectId);
  return {
    text: buildProjectCardMessage(bundle),
    keyboard: buildProjectActionsKeyboard(projectId),
  };
};
