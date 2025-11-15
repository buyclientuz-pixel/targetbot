import type { TargetBotEnv } from "../worker/types";

export const resolveTelegramToken = (env: TargetBotEnv): string | undefined => {
  return env.TELEGRAM_BOT_TOKEN ?? env.BOT_TOKEN;
};
