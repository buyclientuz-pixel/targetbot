import { ProjectRecord } from "../types";
import { EnvBindings, loadProject, updateProjectRecord } from "./storage";
import { TelegramEnv, listTelegramForumTopics } from "./telegram";

const TARGET_TOPIC_NAME = "таргет";

const ensureChatId = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
};

const parseThreadIdFromLink = (link: unknown): number | null => {
  if (typeof link !== "string") {
    return null;
  }
  const match = link.match(/\/c\/[-\d]+\/(\d+)/);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

export interface ProjectTopicRoute {
  chatId: string;
  threadId: number;
  project: ProjectRecord;
}

const updateProjectThread = async (
  env: EnvBindings,
  projectId: string,
  threadId: number,
): Promise<ProjectRecord | null> => {
  try {
    const updated = await updateProjectRecord(env, projectId, { telegramThreadId: threadId });
    if (updated) {
      return updated;
    }
  } catch (error) {
    console.warn("Failed to persist project thread", projectId, error);
  }
  try {
    return await loadProject(env, projectId);
  } catch (error) {
    console.warn("Failed to reload project after thread update", projectId, error);
  }
  return null;
};

export const ensureProjectTopicRoute = async (
  env: EnvBindings & TelegramEnv,
  project: ProjectRecord,
): Promise<ProjectTopicRoute | null> => {
  const chatId = ensureChatId(project.telegramChatId ?? project.chatId);
  if (!chatId) {
    console.warn("Project chat missing for topic routing", project.id);
    return null;
  }

  let current: ProjectRecord = project;
  let threadId = typeof current.telegramThreadId === "number" ? current.telegramThreadId : null;

  if (threadId === null) {
    const parsed = parseThreadIdFromLink(current.telegramLink);
    if (parsed !== null) {
      const updated = await updateProjectThread(env, current.id, parsed);
      if (updated) {
        current = updated;
        threadId = parsed;
      } else {
        threadId = parsed;
      }
    }
  }

  if (threadId === null) {
    const topics = await listTelegramForumTopics(env, chatId);
    if (!topics.length) {
      console.warn("Forum topics not available for chat", chatId, project.id);
      return null;
    }
    const match = topics.find(
      (topic) => topic.name && topic.name.trim().toLowerCase() === TARGET_TOPIC_NAME,
    );
    if (!match) {
      console.warn("Target forum topic not found", chatId, project.id, topics.map((topic) => topic.name));
      return null;
    }
    const updated = await updateProjectThread(env, current.id, match.messageThreadId);
    if (updated) {
      current = updated;
    }
    threadId = match.messageThreadId;
  }

  if (threadId === null) {
    console.warn("Project thread could not be resolved", project.id);
    return null;
  }

  return { chatId, threadId, project: current };
};
