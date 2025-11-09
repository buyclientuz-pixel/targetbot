import { Context, SessionFlavor } from "grammy";
import { ConversationFlavor } from "@grammyjs/conversations";
import { Role } from "../types/domain";

export interface SessionData {
  role?: Role;
  lastAdminCommandAt?: number;
}

export type BotContext = Context & SessionFlavor<SessionData> & ConversationFlavor;

export type BotConversation = never;
