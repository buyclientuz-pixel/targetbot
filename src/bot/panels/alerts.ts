import { loadProjectBundle } from "../data";
import { buildAlertsMessage } from "../messages";
import { buildAlertsKeyboard } from "../keyboards";
import type { PanelRenderer } from "./types";

export const render: PanelRenderer = async ({ runtime, params }) => {
  const projectId = params[0];
  if (!projectId) {
    return { text: "Проект не найден.", keyboard: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "panel:projects" }]] } };
  }
  const bundle = await loadProjectBundle(runtime.kv, runtime.r2, projectId);
  return {
    text: buildAlertsMessage(bundle.project, bundle.alerts),
    keyboard: buildAlertsKeyboard(projectId, bundle.alerts),
  };
};
