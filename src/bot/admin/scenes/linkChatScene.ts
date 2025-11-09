import { BotContext } from "../../types";

export async function linkChatScene(ctx: BotContext): Promise<void> {
  await ctx.reply("Мастер привязки чата пока не реализован.");
}
