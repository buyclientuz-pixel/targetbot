import { getFbAuthRecord } from "../../domain/spec/fb-auth";
import type { PanelRenderer } from "./types";

const formatAccounts = (accounts: { id: string; name: string; currency: string }[]): string => {
  if (accounts.length === 0) {
    return "⚠️ Рекламные аккаунты не найдены. Обновите токен или проверьте доступы.";
  }
  return [
    "Доступные рекламные аккаунты:",
    ...accounts.map((account, index) => `${index + 1}. ${account.name} (${account.id}) — ${account.currency}`),
  ].join("\n");
};

export const render: PanelRenderer = async ({ runtime, userId }) => {
  const record = await getFbAuthRecord(runtime.kv, userId);
  if (!record) {
    const authUrl = runtime.getFacebookOAuthUrl(userId);
    return {
      text:
        "⚠️ Facebook не подключён. Перейдите по ссылке ниже и завершите авторизацию." +
        (authUrl ? `\n${authUrl}` : ""),
      keyboard: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "panel:main" }]] },
    };
  }
  return {
    text:
      `✅ Facebook подключён. Токен действителен до: ${record.expiresAt ?? "—"}` +
      `\n\n${formatAccounts(record.adAccounts)}`,
    keyboard: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "panel:main" }]] },
  };
};
