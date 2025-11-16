import { loadProjectBundle } from "../data";
import { buildAlertsMessage, buildAlertsRouteMessage } from "../messages";
import { buildAlertsKeyboard, buildAlertsRouteKeyboard } from "../keyboards";
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
      text: buildAlertsRouteMessage(bundle.project, bundle.alerts),
      keyboard: buildAlertsRouteKeyboard(projectId),
    };
  }
  return {
    text: buildAlertsMessage(bundle.project, bundle.alerts),
    keyboard: buildAlertsKeyboard(projectId, bundle.alerts),
  };
};
