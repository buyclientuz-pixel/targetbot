import { Context, SessionFlavor } from "grammy";
import { Conversation, ConversationFlavor } from "@grammyjs/conversations";
import { Role } from "../types/domain";

export interface SessionData {
  role?: Role;
  lastAdminCommandAt?: number;
  pendingProjectId?: string;
  pendingChat?: {
    chatId: number;
    threadId?: number;
    title?: string;
  };
}

export type BotContext = Context & SessionFlavor<SessionData> & ConversationFlavor;

export type BotConversation = Conversation<BotContext>;
