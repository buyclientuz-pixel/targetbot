import { getWebhookInfo } from "../../services/telegram";
import { buildWebhookStatusMessage } from "../messages";
import type { PanelRenderer } from "./types";

const WORKER_FALLBACK = "https://th-reports.buyclientuz.workers.dev";

export const render: PanelRenderer = async ({ runtime }) => {
  const info = await getWebhookInfo(runtime.telegramToken);
  const baseUrl = runtime.workerUrl || WORKER_FALLBACK;
  const expectedUrl = `${baseUrl}/tg-webhook?secret=${runtime.telegramSecret}`;
  const encodedUrl = encodeURIComponent(expectedUrl);
  const refreshUrl = `https://api.telegram.org/bot${runtime.telegramToken}/setWebhook?url=${encodedUrl}`;
  return {
    text: buildWebhookStatusMessage({
      currentUrl: info?.url ?? null,
      expectedUrl,
      pendingUpdates: info?.pending_update_count ?? 0,
      lastError: info?.last_error_message ?? null,
      lastErrorDate: info?.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : null,
    }),
    keyboard: {
      inline_keyboard: [
        [{ text: "🔄 Обновить вебхук", url: refreshUrl }],
        [{ text: "📋 Проверить статус", callback_data: "panel:webhooks" }],
        [{ text: "⬅️ Назад", callback_data: "panel:main" }],
      ],
    },
  };
};
