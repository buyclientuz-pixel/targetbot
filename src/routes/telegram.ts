import { createTelegramBotController } from "../bot/controller";
import type { TelegramUpdate } from "../bot/types";
import { jsonResponse } from "../http/responses";
import type { RouteHandler, Router } from "../worker/router";

const createWebhookHandler = (): RouteHandler => {
  return async (context) => {
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
  };
};

export const registerTelegramRoutes = (router: Router): void => {
  const handler = createWebhookHandler();

  router.on("POST", "/api/telegram/webhook", handler);
  router.on("POST", "/tg-webhook", handler);
};
