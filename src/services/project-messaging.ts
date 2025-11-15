import { ensureProjectSettings, type ProjectSettings, upsertProjectSettings } from "../domain/project-settings";
import type { Project } from "../domain/projects";
import type { KvClient } from "../infra/kv";
import { createForumTopic, sendTelegramMessage } from "./telegram";

export interface DispatchProjectMessageOptions {
  kv: KvClient;
  project: Project;
  settings?: ProjectSettings;
  token?: string;
  text: string;
  route?: ProjectSettings["alerts"]["route"];
  parseMode?: "MarkdownV2" | "Markdown" | "HTML";
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

const ensureTopic = async (
  kv: KvClient,
  token: string | undefined,
  project: Project,
  settings: ProjectSettings,
): Promise<ProjectSettings> => {
  if (!token || settings.chatId == null || settings.topicId != null) {
    return settings;
  }

  try {
    const result = await createForumTopic(token, {
      chatId: settings.chatId,
      name: "Таргет",
      iconColor: 0x4a90e2,
    });
    if (!result?.message_thread_id) {
      return settings;
    }
    const updated: ProjectSettings = {
      ...settings,
      topicId: result.message_thread_id,
      updatedAt: new Date().toISOString(),
    };
    await upsertProjectSettings(kv, updated);
    return updated;
  } catch {
    return settings;
  }
};

const shouldSendToChat = (route: ProjectSettings["alerts"]["route"]): boolean => {
  return route === "CHAT" || route === "BOTH";
};

const shouldSendToAdmin = (route: ProjectSettings["alerts"]["route"]): boolean => {
  return route === "ADMIN" || route === "BOTH";
};

export const dispatchProjectMessage = async (
  options: DispatchProjectMessageOptions,
): Promise<DispatchResult> => {
  const token = options.token;
  const baseSettings = await ensureSettings(options.kv, options.project, options.settings);
  const route = options.route ?? baseSettings.alerts.route;

  if (!token) {
    return { settings: baseSettings, delivered: { chat: false, admin: false } };
  }

  let settings = baseSettings;
  if (shouldSendToChat(route)) {
    settings = await ensureTopic(options.kv, token, options.project, baseSettings);
  }

  const tasks: Promise<void>[] = [];
  let chatDelivered = false;
  let adminDelivered = false;

  if (shouldSendToChat(route) && settings.chatId != null) {
    tasks.push(
      sendTelegramMessage(token, {
        chatId: settings.chatId,
        messageThreadId: settings.topicId ?? undefined,
        text: options.text,
        parseMode: options.parseMode ?? "HTML",
        disableWebPagePreview: true,
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

  return { settings, delivered: { chat: chatDelivered, admin: adminDelivered } };
};
