import { loadProjectBundle } from "../data";
import type { InlineKeyboardMarkup } from "../types";
import { buildCampaignsMessage } from "../messages";
import type { PanelRenderer } from "./types";

const backKeyboard = (projectId: string) => ({
  inline_keyboard: [[{ text: "⬅️ Назад", callback_data: `project:card:${projectId}` }]],
});

export const render: PanelRenderer = async ({ runtime, params }) => {
  const projectId = params[0];
  if (!projectId) {
    return { text: "Проект не найден.", keyboard: { inline_keyboard: [[{ text: "⬅️ Меню", callback_data: "panel:projects" }]] } };
  }
  const bundle = await loadProjectBundle(runtime.kv, runtime.r2, projectId);
  return { text: buildCampaignsMessage(bundle.project, bundle.campaigns), keyboard: backKeyboard(projectId) };
};
