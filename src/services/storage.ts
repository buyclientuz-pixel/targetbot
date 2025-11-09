import { randomUUID } from "node:crypto";
import { z } from "zod";
import { kvDel, kvGet, kvList, kvPut } from "./kv";
import {
  AdminRoles,
  ChatRef,
  Project,
  ReportSchedule,
  Role,
} from "../types/domain";

const PROJECT_PREFIX = "project:";
const CHAT_PREFIX = "chat:";
const SCHEDULE_PREFIX = "report:schedule:";
const ADMIN_KEY = "admins";
const SETTINGS_KEY = "settings";

const chatRefSchema = z.object({
  chatId: z.number(),
  title: z.string().optional(),
  tgTopicLink: z.string().optional(),
  threadId: z.number().optional(),
});

const projectStoredSchema = z.object({
  id: z.string().min(1),
  projectName: z.string().optional(),
  accountName: z.string().optional(),
  description: z.string().optional(),
  chats: z.array(chatRefSchema).default([]),
});

const projectUpsertSchema = projectStoredSchema.partial({ id: true });

const chatSchema = z.object({
  chatId: z.number(),
  threadId: z.number().optional(),
  title: z.string().optional(),
  tgTopicLink: z.string().optional(),
  projectId: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const reportSlotSchema = z.enum(["daily_9", "daily_18", "weekly_mon", "monthly_1"]);

const scheduleSchema = z.object({
  projectId: z.string().min(1),
  tz: z.string().min(1),
  cron: z.string().min(1),
  targets: z.array(reportSlotSchema),
  preset: z.union([z.literal("today"), z.literal("yesterday"), z.literal("last_7d")]),
  lastRunAt: z.string().optional(),
});

const adminRolesSchema = z.object({
  roles: z.record(z.string(), z.union([z.literal("SUPER_ADMIN"), z.literal("ADMIN"), z.literal("VIEWER")])),
});

export type SettingsRecord = {
  default_tz?: string;
  default_report_time?: string;
  locale?: string;
};

const settingsSchema = z
  .object({
    default_tz: z.string().optional(),
    default_report_time: z.string().optional(),
    locale: z.string().optional(),
  })
  .default({});

export async function listProjects(): Promise<Project[]> {
  const projects: Project[] = [];
  let cursor: string | undefined;
  do {
    const { keys, cursor: nextCursor } = await kvList(PROJECT_PREFIX, cursor);
    cursor = nextCursor;
    for (const key of keys) {
      const raw = await kvGet(key);
      if (!raw) continue;
      const parsed = projectStoredSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        continue;
      }
      projects.push(parsed.data);
    }
  } while (cursor);

  projects.sort((a, b) => {
    const left = a.projectName ?? a.id;
    const right = b.projectName ?? b.id;
    return left.localeCompare(right, "ru");
  });

  return projects;
}

export async function getProject(projectId: string): Promise<Project | null> {
  const raw = await kvGet(`${PROJECT_PREFIX}${projectId}`);
  if (!raw) {
    return null;
  }
  const parsed = projectStoredSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export async function upsertProject(
  project: Omit<Project, "id"> & { id?: string }
): Promise<Project> {
  const parsed = projectUpsertSchema.parse(project);
  const enriched: Project = {
    ...parsed,
    id: parsed.id ?? randomUUID(),
    chats: parsed.chats ?? [],
  };
  await kvPut(`${PROJECT_PREFIX}${enriched.id}`, JSON.stringify(enriched));
  return enriched;
}

export async function deleteProject(projectId: string): Promise<void> {
  await kvDel(`${PROJECT_PREFIX}${projectId}`);
  await kvDel(`${SCHEDULE_PREFIX}${projectId}`);
}

export interface StoredChat extends ChatRef {
  projectId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export async function listChats(): Promise<StoredChat[]> {
  const chats: StoredChat[] = [];
  let cursor: string | undefined;
  do {
    const { keys, cursor: nextCursor } = await kvList(CHAT_PREFIX, cursor);
    cursor = nextCursor;
    for (const key of keys) {
      const raw = await kvGet(key);
      if (!raw) continue;
      const parsed = chatSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) continue;
      chats.push(parsed.data);
    }
  } while (cursor);

  chats.sort((a, b) => {
    const left = a.title ?? String(a.chatId);
    const right = b.title ?? String(b.chatId);
    return left.localeCompare(right, "ru");
  });

  return chats;
}

export function getChatKey(chat: {
  chatId: number;
  threadId?: number;
}): string {
  return `${CHAT_PREFIX}${chat.chatId}${chat.threadId ? `:${chat.threadId}` : ""}`;
}

export async function getChat(chatId: number, threadId?: number): Promise<StoredChat | null> {
  const key = `${CHAT_PREFIX}${chatId}${threadId ? `:${threadId}` : ""}`;
  const raw = await kvGet(key);
  if (!raw) {
    return null;
  }
  const parsed = chatSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export async function saveChat(chat: StoredChat): Promise<StoredChat> {
  const now = new Date().toISOString();
  const parsed = chatSchema.parse(chat);
  const enriched: StoredChat = {
    ...parsed,
    createdAt: parsed.createdAt ?? now,
    updatedAt: now,
  };
  const key = `${CHAT_PREFIX}${enriched.chatId}${enriched.threadId ? `:${enriched.threadId}` : ""}`;
  await kvPut(key, JSON.stringify(enriched));
  return enriched;
}

export async function deleteChat(chatId: number, threadId?: number): Promise<void> {
  const key = `${CHAT_PREFIX}${chatId}${threadId ? `:${threadId}` : ""}`;
  await kvDel(key);
}

export async function getSchedule(projectId: string): Promise<ReportSchedule | null> {
  const raw = await kvGet(`${SCHEDULE_PREFIX}${projectId}`);
  if (!raw) {
    return null;
  }
  const parsed = scheduleSchema.safeParse(JSON.parse(raw));
  return parsed.success ? (parsed.data as ReportSchedule) : null;
}

export async function saveSchedule(schedule: ReportSchedule): Promise<ReportSchedule> {
  const parsed = scheduleSchema.parse(schedule);
  await kvPut(`${SCHEDULE_PREFIX}${parsed.projectId}`, JSON.stringify(parsed));
  return parsed as ReportSchedule;
}

export async function loadAdminRoles(): Promise<Record<string, Role>> {
  const raw = await kvGet(ADMIN_KEY);
  if (!raw) {
    return {};
  }
  const parsed = adminRolesSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data.roles : {};
}

export async function saveAdminRoles(roles: Record<string, Role>): Promise<void> {
  const payload: AdminRoles = { roles };
  await kvPut(ADMIN_KEY, JSON.stringify(payload));
}

export async function getSettings(): Promise<SettingsRecord> {
  const raw = await kvGet(SETTINGS_KEY);
  if (!raw) {
    return {};
  }
  const parsed = settingsSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : {};
}

export async function saveSettings(settings: SettingsRecord): Promise<void> {
  const parsed = settingsSchema.parse(settings ?? {});
  await kvPut(SETTINGS_KEY, JSON.stringify(parsed));
}
