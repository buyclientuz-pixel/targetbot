import type { Env } from "../core/types";
import { jsonResponse } from "../core/utils";
import { ensureUser, handleCommand } from "./commands";
import { handleCallback } from "./buttons";
import { logEvent } from "../core/logger";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
    from?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
  };
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number };
    message?: { chat: { id: number }; message_id: number };
  };
}

export async function handleUpdate(env: Env, update: TelegramUpdate) {
  if (update.message && update.message.text) {
    await logEvent(env, "telegram.message", { updateId: update.update_id, chatId: update.message.chat.id });
    const user = await ensureUser(env, update.message);
    const [command, ...args] = update.message.text.split(" ");
    return handleCommand({ env, chatId: update.message.chat.id, user }, command, args.join(" ").trim());
  }

  if (update.callback_query) {
    await logEvent(env, "telegram.callback", { updateId: update.update_id, callbackId: update.callback_query.id });
    await handleCallback(env, update.callback_query);
    return jsonResponse({ ok: true });
  }

  await logEvent(env, "telegram.ignored", { updateId: update.update_id });
  return jsonResponse({ ok: true, ignored: true });
}
