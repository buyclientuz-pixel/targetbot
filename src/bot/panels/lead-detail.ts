import { loadProjectBundle } from "../data";
import type { InlineKeyboardMarkup } from "../types";
import type { PanelRenderer } from "./types";
import { buildLeadDetailMessage } from "../messages";
import { buildLeadDetailKeyboard } from "../keyboards";

const fallbackKeyboard: InlineKeyboardMarkup = { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "panel:projects" }]] };

export const render: PanelRenderer = async ({ runtime, params }) => {
  const projectId = params[0];
  const leadId = params[1];
  if (!projectId || !leadId) {
    return { text: "Лид не найден.", keyboard: fallbackKeyboard };
  }
  const bundle = await loadProjectBundle(runtime.kv, runtime.r2, projectId);
  const lead = bundle.leads.leads.find((entry) => entry.id === leadId);
  if (!lead) {
    return {
      text: "Лид не найден.",
      keyboard: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: `project:leads:new:${projectId}` }]] },
    };
  }
  return {
    text: buildLeadDetailMessage(bundle.project, lead),
    keyboard: buildLeadDetailKeyboard(projectId, leadId, lead.status),
  };
};
