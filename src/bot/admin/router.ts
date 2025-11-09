import { Composer } from "grammy";
import { BotContext } from "../types";
import { adminHomeKeyboard } from "./keyboards";
import { decodeCallbackPayload } from "../../utils/secure";
import { requireRole } from "./guards";
import { Role } from "../../types/domain";

interface CallbackPayload {
  action: string;
  data?: unknown;
}

export const adminRouter = new Composer<BotContext>();

adminRouter.command("admin", async (ctx) => {
  await ctx.reply("Админ-панель:", { reply_markup: adminHomeKeyboard() });
});

adminRouter.callbackQuery(/.*/, async (ctx, next) => {
  try {
    const data = ctx.callbackQuery.data;
    if (!data) {
      return next();
    }
    const payload = decodeCallbackPayload<CallbackPayload>(data);
    ctx.session.lastAdminCommandAt = Date.now();

    switch (payload.action) {
      case "projects:list":
        await ctx.editMessageText("Список проектов пока не реализован.", {
          reply_markup: adminHomeKeyboard(),
        });
        return;
      case "admins:home":
        await requireRole("SUPER_ADMIN")(ctx, async () => {
          await ctx.editMessageText("Управление администраторами в разработке.", {
            reply_markup: adminHomeKeyboard(),
          });
        });
        return;
      default:
        await ctx.answerCallbackQuery({ text: "Секция в разработке", show_alert: true });
        return;
    }
  } catch (error) {
    await ctx.answerCallbackQuery({ text: "Ошибка обработки кнопки", show_alert: true });
  }
});
