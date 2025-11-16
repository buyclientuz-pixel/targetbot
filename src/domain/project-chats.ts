import { KV_KEYS, KV_PREFIXES } from "../config/kv";
import type { KvClient } from "../infra/kv";
import { DataValidationError } from "../errors";
import { assertIsoDate, assertNumber, assertOptionalNumber, assertOptionalString, assertString } from "./validation";

export interface FreeChatRecord {
  chatId: number;
  chatTitle: string | null;
  topicId: number | null;
  ownerId: number;
  registeredAt: string;
}

export interface OccupiedChatRecord {
  chatId: number;
  chatTitle: string | null;
  topicId: number | null;
  ownerId: number;
  projectId: string;
  projectName: string;
  boundAt: string;
}

const parseFreeChatRecord = (raw: unknown): FreeChatRecord => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("free chat record must be an object");
  }
  const record = raw as Record<string, unknown>;
  return {
    chatId: assertNumber(record.chatId ?? record["chat_id"], "free-chat.chatId"),
    chatTitle: assertOptionalString(record.chatTitle ?? record["chat_title"], "free-chat.chatTitle"),
    topicId: assertOptionalNumber(record.topicId ?? record["topic_id"], "free-chat.topicId"),
    ownerId: assertNumber(record.ownerId ?? record["owner_id"], "free-chat.ownerId"),
    registeredAt: assertIsoDate(record.registeredAt ?? record["registered_at"], "free-chat.registeredAt"),
  };
};

const serialiseFreeChatRecord = (record: FreeChatRecord): Record<string, unknown> => ({
  chatId: record.chatId,
  chatTitle: record.chatTitle,
  topicId: record.topicId,
  ownerId: record.ownerId,
  registeredAt: record.registeredAt,
});

const parseOccupiedChatRecord = (raw: unknown): OccupiedChatRecord => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("occupied chat record must be an object");
  }
  const record = raw as Record<string, unknown>;
  return {
    chatId: assertNumber(record.chatId ?? record["chat_id"], "occupied-chat.chatId"),
    chatTitle: assertOptionalString(record.chatTitle ?? record["chat_title"], "occupied-chat.chatTitle"),
    topicId: assertOptionalNumber(record.topicId ?? record["topic_id"], "occupied-chat.topicId"),
    ownerId: assertNumber(record.ownerId ?? record["owner_id"], "occupied-chat.ownerId"),
    projectId: assertString(record.projectId ?? record["project_id"], "occupied-chat.projectId"),
    projectName: assertString(record.projectName ?? record["project_name"], "occupied-chat.projectName"),
    boundAt: assertIsoDate(record.boundAt ?? record["bound_at"], "occupied-chat.boundAt"),
  };
};

const serialiseOccupiedChatRecord = (record: OccupiedChatRecord): Record<string, unknown> => ({
  chatId: record.chatId,
  chatTitle: record.chatTitle,
  topicId: record.topicId,
  ownerId: record.ownerId,
  projectId: record.projectId,
  projectName: record.projectName,
  boundAt: record.boundAt,
});

export const putFreeChatRecord = async (kv: KvClient, record: FreeChatRecord): Promise<void> => {
  await kv.putJson(KV_KEYS.freeChat(record.chatId), serialiseFreeChatRecord(record));
};

export const getFreeChatRecord = async (kv: KvClient, chatId: number): Promise<FreeChatRecord | null> => {
  const raw = await kv.getJson<Record<string, unknown>>(KV_KEYS.freeChat(chatId));
  return raw ? parseFreeChatRecord(raw) : null;
};

export const deleteFreeChatRecord = async (kv: KvClient, chatId: number): Promise<void> => {
  await kv.delete(KV_KEYS.freeChat(chatId));
};

export const listFreeChatsByOwner = async (kv: KvClient, ownerId: number): Promise<FreeChatRecord[]> => {
  const { keys } = await kv.list(KV_PREFIXES.freeChats);
  if (keys.length === 0) {
    return [];
  }
  const chats = await Promise.all(
    keys.map(async (key) => {
      const raw = await kv.getJson<Record<string, unknown>>(key);
      if (!raw) {
        return null;
      }
      try {
        const record = parseFreeChatRecord(raw);
        return record.ownerId === ownerId ? record : null;
      } catch {
        return null;
      }
    }),
  );
  return chats.filter((chat): chat is FreeChatRecord => chat != null).sort((a, b) => (a.registeredAt < b.registeredAt ? 1 : -1));
};

export const putOccupiedChatRecord = async (kv: KvClient, record: OccupiedChatRecord): Promise<void> => {
  await kv.putJson(KV_KEYS.occupiedChat(record.chatId), serialiseOccupiedChatRecord(record));
};

export const getOccupiedChatRecord = async (kv: KvClient, chatId: number): Promise<OccupiedChatRecord | null> => {
  const raw = await kv.getJson<Record<string, unknown>>(KV_KEYS.occupiedChat(chatId));
  return raw ? parseOccupiedChatRecord(raw) : null;
};

export const deleteOccupiedChatRecord = async (kv: KvClient, chatId: number): Promise<void> => {
  await kv.delete(KV_KEYS.occupiedChat(chatId));
};
