import { getFbAuthRecord } from "../../domain/spec/fb-auth";
import { listAvailableProjectChats, loadProjectListOverview } from "../data";
import { buildProjectCreationKeyboard, buildChatBindingKeyboard } from "../keyboards";
import { buildChatBindingMessage, buildNoFreeChatsMessage, buildProjectCreationMessage } from "../messages";
import type { PanelRenderer } from "./types";

export const render: PanelRenderer = async ({ runtime, userId, params }) => {
  const view = params[0] ?? "accounts";
  if (view === "bind") {
    const accountId = params[1];
    const fbAuth = await getFbAuthRecord(runtime.kv, userId);
    const accountName = fbAuth?.adAccounts?.find((entry) => entry.id === accountId)?.name ?? accountId ?? "аккаунт";
    const chats = await listAvailableProjectChats(runtime.kv, userId);
    if (chats.length === 0) {
      return {
        text: buildNoFreeChatsMessage(),
        keyboard: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "cmd:projects" }]] },
      };
    }
    return {
      text: buildChatBindingMessage({ accountName }),
      keyboard: buildChatBindingKeyboard(accountId ?? "", chats),
    };
  }

  const fbAuth = await getFbAuthRecord(runtime.kv, userId);
  const overview = await loadProjectListOverview(runtime.kv, runtime.r2, userId);
  return {
    text: buildProjectCreationMessage({ accounts: fbAuth?.adAccounts ?? [], hasProjects: overview.projects.length > 0 }),
    keyboard: buildProjectCreationKeyboard(fbAuth?.adAccounts ?? [], {
      hasProjects: overview.projects.length > 0,
      accountSpends: overview.accountSpends,
      accountBindings: overview.accountBindings,
    }),
  };
};
