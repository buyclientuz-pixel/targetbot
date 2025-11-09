import { Bot } from "grammy";
import { BotContext } from "../types";
import { adminHomeKeyboard } from "../admin/keyboards";
import { loadEnv } from "../../utils/env";
import { getUserRole } from "../admin/guards";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

export function registerCommonHandlers(bot: Bot<BotContext>): void {
  bot.command("start", async (ctx) => {
    const role = ctx.from ? await getUserRole(ctx.from.id) : undefined;
    const buttons = role
      ? { reply_markup: adminHomeKeyboard() }
      : undefined;
    await ctx.reply(
      role
        ? "Привет! Используйте меню для доступа к админ-панели."
        : "Привет! У вас нет доступа к админ-панели.",
      buttons
    );
  });

  bot.command("ping", async (ctx) => {
    const now = dayjs().tz(loadEnv().DEFAULT_TZ);
    await ctx.reply(`pong ${now.format("DD.MM.YYYY HH:mm:ss")}`);
  });

  bot.command("whoami", async (ctx) => {
    const from = ctx.from;
    if (!from) {
      await ctx.reply("Не удалось определить пользователя.");
      return;
    }
    const role = await getUserRole(from.id);
    await ctx.reply(`ID: ${from.id}\nРоль: ${role ?? "нет"}`);
  });
}
