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
import { render as renderBilling } from "./panels/billing";
import { render as renderLeads } from "./panels/leads";
import { render as renderLeadDetail } from "./panels/lead-detail";
import { render as renderReport } from "./panels/report";
import { render as renderCampaigns } from "./panels/campaigns";
import { render as renderPortal } from "./panels/portal";
import { render as renderExport } from "./panels/export";
import { render as renderChatInfo } from "./panels/chat-info";
import { render as renderChatChange } from "./panels/chat-change";
import { render as renderChatUnlink } from "./panels/chat-unlink";
import { render as renderAutoreports } from "./panels/autoreports";
import { render as renderKpi } from "./panels/kpi";
import { render as renderProjectEditPanel } from "./panels/project-edit";
import { render as renderProjectDelete } from "./panels/project-delete";

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
  if (panelId === "project:menu") {
    return { renderer: renderMain, params: [], id: "main" };
  }
  if (panelId.startsWith("project:add:")) {
    return { renderer: renderProjects, params: ["bind", panelId.split(":")[2]!], id: panelId };
  }
  if (panelId.startsWith("project:card:")) {
    return { renderer: renderProject, params: [panelId.split(":")[2]!], id: panelId };
  }
  if (panelId.startsWith("project:billing:")) {
    return { renderer: renderBilling, params: [panelId.split(":")[2]!], id: panelId };
  }
  if (panelId.startsWith("project:leads:")) {
    const [, , status, projectId] = panelId.split(":");
    return { renderer: renderLeads, params: [status ?? "new", projectId ?? ""], id: panelId };
  }
  if (panelId.startsWith("lead:detail:")) {
    const [, , projectId, leadId] = panelId.split(":");
    return { renderer: renderLeadDetail, params: [projectId ?? "", leadId ?? ""], id: panelId };
  }
  if (panelId.startsWith("project:report:")) {
    return { renderer: renderReport, params: [panelId.split(":")[2]!], id: panelId };
  }
  if (panelId.startsWith("project:campaigns:")) {
    return { renderer: renderCampaigns, params: [panelId.split(":")[2]!], id: panelId };
  }
  if (panelId.startsWith("project:portal:")) {
    return { renderer: renderPortal, params: [panelId.split(":")[2]!], id: panelId };
  }
  if (panelId.startsWith("project:export:")) {
    return { renderer: renderExport, params: [panelId.split(":")[2]!], id: panelId };
  }
  if (panelId.startsWith("project:chat-change:")) {
    return { renderer: renderChatChange, params: [panelId.split(":")[2]!], id: panelId };
  }
  if (panelId.startsWith("project:chat-unlink:")) {
    return { renderer: renderChatUnlink, params: [panelId.split(":")[2]!], id: panelId };
  }
  if (panelId.startsWith("project:autoreports:")) {
    return { renderer: renderAutoreports, params: [panelId.split(":")[2]!], id: panelId };
  }
  if (panelId.startsWith("project:autoreports-route:")) {
    const [, , , projectId] = panelId.split(":");
    return { renderer: renderAutoreports, params: [projectId ?? "", "route"], id: panelId };
  }
  if (panelId.startsWith("project:kpi:")) {
    return { renderer: renderKpi, params: [panelId.split(":")[2]!], id: panelId };
  }
  if (panelId.startsWith("project:edit:")) {
    return { renderer: renderProjectEditPanel, params: [panelId.split(":")[2]!], id: panelId };
  }
  if (panelId.startsWith("project:delete:")) {
    return { renderer: renderProjectDelete, params: [panelId.split(":")[2]!], id: panelId };
  }
  if (panelId.startsWith("project:chat:")) {
    return { renderer: renderChatInfo, params: [panelId.split(":")[2]!], id: panelId };
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
  return { renderer: renderMain, params: [], id: "main" };
};

export const PANEL_ERROR_MESSAGE =
  "⚠️ Не удалось загрузить панель. Нажмите /start и попробуйте снова.";

interface RenderRequest {
  runtime: PanelRuntime;
  userId: number;
  chatId: number;
  panelId: string;
}

export const renderPanel = async ({ runtime, userId, chatId, panelId }: RenderRequest): Promise<void> => {
  const session = await getBotSession(runtime.kv, userId);
  const resolved = resolvePanel(panelId);
  let result;
  try {
    result = await resolved.renderer({ runtime, userId, chatId, panelId: resolved.id, params: resolved.params });
  } catch (error) {
    console.error(`[telegram] Failed to render panel ${resolved.id}:`, error);
    await sendTelegramMessage(runtime.telegramToken, {
      chatId,
      text: PANEL_ERROR_MESSAGE,
    });
    await saveBotSession(runtime.kv, {
      ...session,
      panel: undefined,
      state: { type: "idle" },
    });
    return;
  }
  let messageId = session.panel?.chatId === chatId ? session.panel?.messageId ?? null : null;
  try {
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
  } catch (error) {
    console.error(`[telegram] Failed to deliver panel ${resolved.id}:`, error);
    try {
      await sendTelegramMessage(runtime.telegramToken, { chatId, text: PANEL_ERROR_MESSAGE });
    } catch (fallbackError) {
      console.error(`[telegram] Failed to send fallback panel message:`, fallbackError);
    }
    await saveBotSession(runtime.kv, {
      ...session,
      panel: undefined,
      state: { type: "idle" },
    });
  }
};
