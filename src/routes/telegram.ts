import { createTelegramBotController } from "../bot/controller";
import type { TelegramUpdate } from "../bot/types";
import { jsonResponse } from "../http/responses";
import type { Router } from "../worker/router";

export const registerTelegramRoutes = (router: Router): void => {
  router.on("POST", "/api/telegram/webhook", async (context) => {
    const token = context.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return jsonResponse({ error: "TELEGRAM_BOT_TOKEN is not configured" }, { status: 500 });
    }

    let update: TelegramUpdate;
    try {
      update = await context.json<TelegramUpdate>();
    } catch {
      return jsonResponse({ ok: false, error: "Invalid Telegram payload" }, { status: 400 });
    }

    const controller = createTelegramBotController({
      token,
      kv: context.kv,
      r2: context.r2,
    });

    try {
      await controller.handleUpdate(update);
      return jsonResponse({ ok: true });
    } catch (error) {
      return jsonResponse({ ok: false, error: (error as Error).message }, { status: 500 });
    }
  });
};
