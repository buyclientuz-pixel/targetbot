import { Bot, session } from "grammy";
import { conversations } from "@grammyjs/conversations";
import { limit } from "@grammyjs/ratelimiter";
import { loadEnv } from "../utils/env";
import { BotContext, SessionData } from "./types";
import { registerCommonHandlers } from "./handlers/common";
import { adminRouter } from "./admin/router";
import { isAdminComposer } from "./admin/guards";
import { broadcastScene } from "./admin/scenes/broadcastScene";

const env = loadEnv();

const bot = new Bot<BotContext>(env.BOT_TOKEN);

bot.api.config.use((prev, method, payload) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(`Calling ${method}`);
  }
  return prev(method, payload);
});

bot.catch((err) => {
  console.error("Bot error", err);
});

bot.use(
  session<SessionData>({
    initial: () => ({}),
  })
);

bot.use(
  limit({
    timeFrame: 5000,
    limit: 3,
    onLimitExceeded: async (ctx) => {
      await ctx.reply("Слишком много действий, попробуйте позже.");
    },
  })
);

bot.use(conversations());

bot.use(isAdminComposer());

registerCommonHandlers(bot);

bot.use(adminRouter);

bot.command("broadcast", async (ctx) => broadcastScene(ctx));

if (process.env.NODE_ENV !== "test") {
  void bot.start();
}

export { bot };
