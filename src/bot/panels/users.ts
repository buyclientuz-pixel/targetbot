import { loadUserProjects } from "../data";
import { buildUsersMessage } from "../messages";
import type { PanelRenderer } from "./types";

export const render: PanelRenderer = async ({ runtime, userId }) => {
  const projects = await loadUserProjects(runtime.kv, userId);
  return {
    text: buildUsersMessage(projects, runtime.adminIds, userId),
    keyboard: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "panel:main" }]] },
  };
};
