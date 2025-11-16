import { loadProjectBundle } from "../data";
import { buildBillingScreenMessage } from "../messages";
import { buildBillingKeyboard } from "../keyboards";
import type { InlineKeyboardMarkup } from "../types";
import type { PanelRenderer } from "./types";

const fallbackKeyboard: InlineKeyboardMarkup = { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "panel:projects" }]] };

export const render: PanelRenderer = async ({ runtime, params }) => {
  const projectId = params[0];
  if (!projectId) {
    return { text: "Проект не найден.", keyboard: fallbackKeyboard };
  }
  const bundle = await loadProjectBundle(runtime.kv, runtime.r2, projectId);
  return {
    text: buildBillingScreenMessage(bundle.project, bundle.billing, bundle.payments),
    keyboard: buildBillingKeyboard(projectId),
  };
};
