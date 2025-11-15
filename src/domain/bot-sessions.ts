import { KV_KEYS } from "../config/kv";
import type { KvClient } from "../infra/kv";

export type BotSessionState =
  | { type: "idle" }
  | { type: "billing:set-date"; projectId: string }
  | { type: "billing:manual"; projectId: string }
  | { type: "facebook:token" }
  | { type: "project:edit"; projectId: string; field: "name" | "ad" | "owner" }
  | { type: "chat:manual"; projectId: string }
  | { type: "autoreports:set-time"; projectId: string };

export interface BotSession {
  userId: number;
  state: BotSessionState;
  updatedAt: string;
}

const createDefaultSession = (userId: number): BotSession => ({
  userId,
  state: { type: "idle" },
  updatedAt: new Date().toISOString(),
});

export const getBotSession = async (kv: KvClient, userId: number): Promise<BotSession> => {
  const key = KV_KEYS.botSession(userId);
  const stored = await kv.getJson<BotSession>(key);
  if (!stored) {
    return createDefaultSession(userId);
  }
  return stored;
};

export const saveBotSession = async (kv: KvClient, session: BotSession): Promise<void> => {
  const key = KV_KEYS.botSession(session.userId);
  await kv.putJson(key, { ...session, updatedAt: new Date().toISOString() });
};

export const clearBotSession = async (kv: KvClient, userId: number): Promise<void> => {
  const key = KV_KEYS.botSession(userId);
  await kv.putJson(key, createDefaultSession(userId));
};
