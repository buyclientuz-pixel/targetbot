import { requireProjectRecord } from "../../domain/spec/project";
import type { InlineKeyboardMarkup } from "../types";
import { listAvailableProjectChats } from "../data";
import { buildChatChangeMessage } from "../messages";
import { buildChatChangeKeyboard } from "../keyboards";
import type { PanelRenderer } from "./types";

export const render: PanelRenderer = async ({ runtime, userId, params }) => {
  const projectId = params[0];
  if (!projectId) {
    return { text: "Проект не найден.", keyboard: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "panel:projects" }]] } };
  }
  const [project, chats] = await Promise.all([
    requireProjectRecord(runtime.kv, projectId),
    listAvailableProjectChats(runtime.kv, userId),
  ]);
  return {
    text: buildChatChangeMessage(project, chats),
    keyboard: buildChatChangeKeyboard(projectId, chats),
  };
};
