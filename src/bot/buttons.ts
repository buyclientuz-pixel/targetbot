import type { Env } from "../core/types";
import { callTelegramApi } from "./telegram";
import { logEvent } from "../core/logger";

interface CallbackQuery {
  id: string;
  data?: string;
  message?: { chat: { id: number }; message_id: number };
  from: { id: number };
}

export async function handleCallback(env: Env, callback: CallbackQuery) {
  if (!callback.data) {
    return;
  }
  const [action, payload] = callback.data.split(":", 2);
  switch (action) {
    case "lead_status":
      await logEvent(env, "lead.status.update", { payload, userId: callback.from.id });
      if (callback.message) {
        await callTelegramApi(env, "editMessageText", {
          chat_id: callback.message.chat.id,
          message_id: callback.message.message_id,
          text: `Статус заявки обновлён: ${payload}`,
        });
      }
      await callTelegramApi(env, "answerCallbackQuery", {
        callback_query_id: callback.id,
        text: "Статус обновлён",
        show_alert: false,
      });
      break;
    default:
      await callTelegramApi(env, "answerCallbackQuery", {
        callback_query_id: callback.id,
        text: "Действие недоступно",
        show_alert: true,
      });
      break;
  }
}
