import { ensureProjectSettings, type ProjectSettings } from "../domain/project-settings";
import type { Project } from "../domain/projects";
import type { KvClient } from "../infra/kv";
import { sendTelegramMessage } from "./telegram";

export type ProjectMessageRoute = "CHAT" | "ADMIN" | "BOTH";

export interface DispatchProjectMessageOptions {
  kv: KvClient;
  project: Project;
  settings?: ProjectSettings;
  token?: string;
  text: string;
  route?: ProjectMessageRoute;
  parseMode?: "MarkdownV2" | "Markdown" | "HTML";
  replyMarkup?: unknown;
}

export interface DispatchResult {
  settings: ProjectSettings;
  delivered: { chat: boolean; admin: boolean };
}

const ensureSettings = async (
  kv: KvClient,
  project: Project,
  settings?: ProjectSettings,
): Promise<ProjectSettings> => {
  if (settings) {
    return settings;
  }
  return ensureProjectSettings(kv, project.id);
};

const shouldSendToChat = (route: ProjectMessageRoute): boolean => {
  return route === "CHAT" || route === "BOTH";
};

const shouldSendToAdmin = (route: ProjectMessageRoute): boolean => {
  return route === "ADMIN" || route === "BOTH";
};

export const dispatchProjectMessage = async (
  options: DispatchProjectMessageOptions,
): Promise<DispatchResult> => {
  const token = options.token;
  const baseSettings = await ensureSettings(options.kv, options.project, options.settings);
  const route = options.route ?? "CHAT";

  if (!token) {
    return { settings: baseSettings, delivered: { chat: false, admin: false } };
  }

  const tasks: Promise<void>[] = [];
  let chatDelivered = false;
  let adminDelivered = false;

  if (shouldSendToChat(route) && baseSettings.chatId != null) {
    tasks.push(
      sendTelegramMessage(token, {
        chatId: baseSettings.chatId,
        messageThreadId: baseSettings.topicId ?? undefined,
        text: options.text,
        parseMode: options.parseMode ?? "HTML",
        disableWebPagePreview: true,
        replyMarkup: options.replyMarkup,
      })
        .then(() => {
          chatDelivered = true;
        })
        .catch(() => undefined),
    );
  }

  if (shouldSendToAdmin(route)) {
    tasks.push(
      sendTelegramMessage(token, {
        chatId: options.project.ownerTelegramId,
        text: options.text,
        parseMode: options.parseMode ?? "HTML",
        disableWebPagePreview: true,
        replyMarkup: options.replyMarkup,
      })
        .then(() => {
          adminDelivered = true;
        })
        .catch(() => undefined),
    );
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
  }

  return { settings: baseSettings, delivered: { chat: chatDelivered, admin: adminDelivered } };
};
