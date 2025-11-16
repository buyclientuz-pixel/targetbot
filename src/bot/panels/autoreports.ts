import { loadProjectBundle } from "../data";
import { buildAutoreportsMessage, buildAutoreportsRouteMessage } from "../messages";
import { buildAutoreportsKeyboard, buildAutoreportsRouteKeyboard } from "../keyboards";
import type { PanelRenderer } from "./types";

export const render: PanelRenderer = async ({ runtime, params }) => {
  const projectId = params[0];
  const view = params[1] ?? "main";
  if (!projectId) {
    return { text: "Проект не найден.", keyboard: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "panel:projects" }]] } };
  }
  const bundle = await loadProjectBundle(runtime.kv, runtime.r2, projectId);
  if (view === "route") {
    return {
      text: buildAutoreportsRouteMessage(bundle.project, bundle.autoreports),
      keyboard: buildAutoreportsRouteKeyboard(projectId),
    };
  }
  return {
    text: buildAutoreportsMessage(bundle.project, bundle.autoreports),
    keyboard: buildAutoreportsKeyboard(projectId, bundle.autoreports),
  };
};
