import { getBotSession, saveBotSession } from "../domain/bot-sessions";
import { editTelegramMessage, sendTelegramMessage, TelegramError } from "../services/telegram";
import type { TelegramMessage } from "./types";
import type { PanelRuntime } from "./panels/types";
import { render as renderMain } from "./panels/main";
import { render as renderProjects } from "./panels/projects";
import { render as renderFbAuth } from "./panels/fb-auth";
import { render as renderProject } from "./panels/project";
import { render as renderAnalytics } from "./panels/analytics";
import { render as renderFinance } from "./panels/finance";
import { render as renderUsers } from "./panels/users";
import { render as renderSettings } from "./panels/settings";
import { render as renderWebhooks } from "./panels/webhooks";
import { render as renderMeta } from "./panels/meta";

interface ResolveResult {
  renderer: typeof renderMain;
  params: string[];
  id: string;
}

const resolvePanel = (panelId: string): ResolveResult => {
  if (panelId === "panel:main" || panelId === "cmd:menu" || panelId === "main") {
    return { renderer: renderMain, params: [], id: "main" };
  }
  if (panelId === "panel:projects" || panelId === "cmd:projects") {
    return { renderer: renderProjects, params: [], id: "projects" };
  }
  if (panelId === "panel:projects:list" || panelId === "project:list") {
    return { renderer: renderProjects, params: ["list"], id: "projects:list" };
  }
  if (panelId === "project:menu") {
    return { renderer: renderMain, params: [], id: "main" };
  }
  if (panelId.startsWith("project:add:")) {
    return { renderer: renderProjects, params: ["bind", panelId.split(":")[2]!], id: panelId };
  }
  if (panelId.startsWith("project:card:")) {
    return { renderer: renderProject, params: [panelId.split(":")[2]!], id: panelId };
  }
  if (panelId === "panel:fb-auth" || panelId === "cmd:auth") {
    return { renderer: renderFbAuth, params: [], id: "fb-auth" };
  }
  if (panelId === "panel:analytics" || panelId === "cmd:analytics") {
    return { renderer: renderAnalytics, params: [], id: "analytics" };
  }
  if (panelId === "panel:finance" || panelId === "cmd:finance") {
    return { renderer: renderFinance, params: [], id: "finance" };
  }
  if (panelId === "panel:users" || panelId === "cmd:users") {
    return { renderer: renderUsers, params: [], id: "users" };
  }
  if (panelId === "panel:settings" || panelId === "cmd:settings") {
    return { renderer: renderSettings, params: [], id: "settings" };
  }
  if (panelId === "panel:webhooks" || panelId === "cmd:webhooks") {
    return { renderer: renderWebhooks, params: [], id: "webhooks" };
  }
  if (panelId === "panel:meta" || panelId === "cmd:meta") {
    return { renderer: renderMeta, params: [], id: "meta" };
  }
  return { renderer: renderMain, params: [], id: "main" };
};

interface RenderRequest {
  runtime: PanelRuntime;
  userId: number;
  chatId: number;
  panelId: string;
}

export const renderPanel = async ({ runtime, userId, chatId, panelId }: RenderRequest): Promise<void> => {
  const session = await getBotSession(runtime.kv, userId);
  const resolved = resolvePanel(panelId);
  const result = await resolved.renderer({ runtime, userId, chatId, panelId: resolved.id, params: resolved.params });
  let messageId = session.panel?.chatId === chatId ? session.panel?.messageId ?? null : null;
  if (messageId) {
    try {
      await editTelegramMessage(runtime.telegramToken, {
        chatId,
        messageId,
        text: result.text,
        replyMarkup: result.keyboard,
      });
    } catch (error) {
      if (error instanceof TelegramError && error.responseBody.includes("message is not modified")) {
        // ignore
      } else {
        messageId = null;
      }
    }
  }
  if (!messageId) {
    const sent = (await sendTelegramMessage<TelegramMessage>(runtime.telegramToken, {
      chatId,
      text: result.text,
      replyMarkup: result.keyboard,
    })) as TelegramMessage | undefined;
    if (sent && typeof sent.message_id === "number") {
      messageId = sent.message_id;
    }
  }
  await saveBotSession(runtime.kv, {
    ...session,
    panel: messageId ? { chatId, messageId, panelId: resolved.id } : session.panel,
    state: { type: "panel", panelId: resolved.id },
  });
};
