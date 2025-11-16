import { getFbAuthRecord } from "../../domain/spec/fb-auth";
import type { PanelRenderer } from "./types";

export const render: PanelRenderer = async ({ runtime, userId }) => {
  const fbAuth = await getFbAuthRecord(runtime.kv, userId);
  const lines: string[] = [];
  if (fbAuth) {
    lines.push("✅ Facebook уже подключён.");
    lines.push(`Аккаунт: <b>${fbAuth.userId}</b>`);
    if (fbAuth.expiresAt) {
      lines.push(`Токен действителен до: <b>${fbAuth.expiresAt}</b>`);
    }
    lines.push("Используйте кнопки ниже, чтобы обновить токен или открыть список аккаунтов.");
  } else {
    lines.push("👣 Шаг 1. Авторизация Facebook");
    lines.push("Перейдите по ссылке ниже, авторизуйтесь и пришлите токен сообщением сюда.");
  }
  const url = runtime.getFacebookOAuthUrl(userId);
  const keyboard = {
    inline_keyboard: [
      ...(url ? [[{ text: "Открыть Facebook OAuth", url }]] : []),
      [{ text: "⬅️ Назад", callback_data: "panel:main" }],
    ],
  };
  return { text: lines.join("\n"), keyboard };
};
