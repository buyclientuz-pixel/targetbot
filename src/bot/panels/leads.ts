import { loadProjectBundle } from "../data";
import type { InlineKeyboardMarkup } from "../types";
import type { PanelRenderer } from "./types";
import type { ProjectLeadsListRecord } from "../../domain/spec/project-leads";
import { buildLeadsMessage } from "../messages";
import { buildLeadsKeyboard } from "../keyboards";

const fallbackKeyboard: InlineKeyboardMarkup = { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "panel:projects" }]] };
const DEFAULT_STATUS: ProjectLeadsListRecord["leads"][number]["status"] = "new";

export const render: PanelRenderer = async ({ runtime, params }) => {
  const status = (params[0] as ProjectLeadsListRecord["leads"][number]["status"]) ?? DEFAULT_STATUS;
  const projectId = params[1];
  if (!projectId) {
    return { text: "Проект не найден.", keyboard: fallbackKeyboard };
  }
  const bundle = await loadProjectBundle(runtime.kv, runtime.r2, projectId);
  return {
    text: buildLeadsMessage(bundle.project, bundle.leads, status),
    keyboard: buildLeadsKeyboard(projectId, bundle.leads.leads, status),
  };
};
