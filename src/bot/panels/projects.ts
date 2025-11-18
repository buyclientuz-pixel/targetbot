import { getFbAuthRecord } from "../../domain/spec/fb-auth";
import { listAvailableProjectChats, loadProjectListOverview } from "../data";
import { buildProjectCreationKeyboard, buildProjectListKeyboard } from "../keyboards";
import { buildProjectCreationMessage, buildProjectsListMessage } from "../messages";
import type { PanelRenderer } from "./types";

export const render: PanelRenderer = async ({ runtime, userId, params }) => {
  const view = params[0] ?? "accounts";
  if (view === "list") {
    const overview = await loadProjectListOverview(runtime.kv, runtime.r2, userId);
    const filtered = overview.projects;
    return {
      text: buildProjectsListMessage(filtered),
      keyboard: filtered.length > 0 ? buildProjectListKeyboard(filtered) : { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "panel:projects" }]] },
    };
  }
  if (view === "bind") {
    const accountId = params[1];
    const chats = await listAvailableProjectChats(runtime.kv, userId);
    return {
      text: chats.length
        ? `Теперь выберите свободную чат-группу для аккаунта <b>${accountId}</b>.\n\nЧат должен быть зарегистрирован командой /reg.`
        : "У вас нет свободных чат-групп. Отправьте команду /reg в группу и повторите попытку.",
      keyboard: chats.length
        ? {
            inline_keyboard: [
              ...chats.slice(0, 8).map((chat) => [
                {
                  text: chat.chatTitle ?? String(chat.chatId),
                  callback_data: `project:bind:${accountId}:${chat.chatId}`,
                },
              ]),
              [{ text: "⬅️ Назад", callback_data: "panel:projects" }],
            ],
          }
        : { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "panel:projects" }]] },
    };
  }

  const fbAuth = await getFbAuthRecord(runtime.kv, userId);
  const overview = await loadProjectListOverview(runtime.kv, runtime.r2, userId);
  return {
    text: buildProjectCreationMessage({ accounts: fbAuth?.adAccounts ?? [], hasProjects: overview.projects.length > 0 }),
    keyboard: buildProjectCreationKeyboard(fbAuth?.adAccounts ?? [], {
      hasProjects: overview.projects.length > 0,
      accountSpends: overview.accountSpends,
    }),
  };
};
