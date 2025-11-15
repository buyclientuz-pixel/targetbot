import { KV_KEYS } from "../config/kv";
import type { KvClient } from "../infra/kv";

export interface ChatRegistryEntry {
  id: number;
  title: string | null;
  type: string;
  updatedAt: string;
}

interface ChatRegistryRecord {
  chats: ChatRegistryEntry[];
}

const REGISTRY_KEY = KV_KEYS.config("chat-registry");
const MAX_REGISTRY_SIZE = 50;

const normaliseTitle = (title?: string): string | null => {
  if (!title) {
    return null;
  }
  return title.trim() || null;
};

const ensureRegistry = (record: ChatRegistryRecord | null): ChatRegistryRecord => {
  if (!record) {
    return { chats: [] };
  }
  return {
    chats: Array.isArray(record.chats) ? record.chats.filter((entry) => typeof entry.id === "number") : [],
  };
};

export const listKnownChats = async (kv: KvClient): Promise<ChatRegistryEntry[]> => {
  const raw = await kv.getJson<ChatRegistryRecord>(REGISTRY_KEY);
  return ensureRegistry(raw).chats;
};

export const recordKnownChat = async (
  kv: KvClient,
  chat: { id: number; title?: string; type?: string },
): Promise<void> => {
  const registry = ensureRegistry(await kv.getJson<ChatRegistryRecord>(REGISTRY_KEY));
  const existingIndex = registry.chats.findIndex((entry) => entry.id === chat.id);
  const entry: ChatRegistryEntry = {
    id: chat.id,
    title: normaliseTitle(chat.title),
    type: chat.type ?? "group",
    updatedAt: new Date().toISOString(),
  };
  if (existingIndex >= 0) {
    registry.chats.splice(existingIndex, 1, entry);
  } else {
    registry.chats.unshift(entry);
    if (registry.chats.length > MAX_REGISTRY_SIZE) {
      registry.chats.length = MAX_REGISTRY_SIZE;
    }
  }
  await kv.putJson(REGISTRY_KEY, registry);
};

export const removeKnownChat = async (kv: KvClient, chatId: number): Promise<void> => {
  const registry = ensureRegistry(await kv.getJson<ChatRegistryRecord>(REGISTRY_KEY));
  const filtered = registry.chats.filter((entry) => entry.id !== chatId);
  if (filtered.length === registry.chats.length) {
    return;
  }
  await kv.putJson(REGISTRY_KEY, { chats: filtered });
};

export const listAvailableChats = async (
  kv: KvClient,
  occupiedIds: Iterable<number>,
): Promise<ChatRegistryEntry[]> => {
  const occupied = new Set(occupiedIds);
  const registry = ensureRegistry(await kv.getJson<ChatRegistryRecord>(REGISTRY_KEY));
  return registry.chats.filter((entry) => !occupied.has(entry.id));
};
