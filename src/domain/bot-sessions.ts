import { KV_KEYS } from "../config/kv";
import type { KvClient } from "../infra/kv";

export type BotSessionState =
  | { type: "idle" }
  | { type: "panel"; panelId: string }
  | { type: "billing:set-date"; projectId: string }
  | { type: "billing:manual"; projectId: string }
  | { type: "facebook:token" }
  | { type: "project:edit"; projectId: string; field: "name" | "ad" | "owner" }
  | { type: "project:create-manual"; accountId: string }
  | { type: "chat:manual"; projectId: string }
  | { type: "autoreports:set-time"; projectId: string };

export interface BotPanelState {
  panelId: string;
  chatId: number;
  messageId: number;
}

export interface BotSession {
  userId: number;
  state: BotSessionState;
  panel?: BotPanelState;
  /**
   * Indicates whether we've already removed the legacy ReplyKeyboardMarkup for this user.
   * Needed to avoid spamming chats with duplicate "remove keyboard" messages when migrating
   * existing sessions to the single-message panel UI.
   */
  replyKeyboardCleared?: boolean;
  /**
   * Timestamp of the last time we notified the user that commands only work in private chat.
   * Used to avoid spamming group chats when someone keeps typing /start inside a group thread.
   */
  lastGroupNoticeAt?: string;
  updatedAt: string;
}

const createDefaultSession = (userId: number): BotSession => ({
  userId,
  state: { type: "idle" },
  panel: undefined,
  updatedAt: new Date().toISOString(),
});

export const getBotSession = async (kv: KvClient, userId: number): Promise<BotSession> => {
  const key = KV_KEYS.botSession(userId);
  try {
    const stored = await kv.getJson<BotSession>(key);
    if (!stored) {
      return createDefaultSession(userId);
    }
    return stored;
  } catch (error) {
    console.warn(`[bot-session] Failed to parse session for ${userId}: ${(error as Error).message}`);
    await kv.delete(key);
    return createDefaultSession(userId);
  }
};

export const saveBotSession = async (kv: KvClient, session: BotSession): Promise<void> => {
  const key = KV_KEYS.botSession(session.userId);
  await kv.putJson(key, { ...session, updatedAt: new Date().toISOString() });
};

export const clearBotSession = async (kv: KvClient, userId: number): Promise<void> => {
  const session = await getBotSession(kv, userId);
  await saveBotSession(kv, { ...session, state: { type: "idle" } });
};
