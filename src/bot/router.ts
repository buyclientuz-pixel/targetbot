import { createContext } from "./context";
import { acknowledgeCommand } from "./menu";
import { runCommand, resolveCommand, handleProjectCallback } from "./commands";
import { handleReportCallback, isReportCallbackData } from "./reports";
import { BotContext, TelegramUpdate } from "./types";
import { jsonResponse } from "../utils/http";
import { EnvBindings } from "../utils/storage";
import { TelegramEnv, answerCallbackQuery } from "../utils/telegram";

const ensureEnv = (env: unknown): (EnvBindings & TelegramEnv) | null => {
  if (!env || typeof env !== "object") {
    return null;
  }
  if (!("DB" in env) || !("R2" in env)) {
    return null;
  }
  return env as EnvBindings & TelegramEnv;
};

const handleUpdate = async (context: BotContext): Promise<void> => {
  const callbackData = context.update.callback_query?.data;
  if (isReportCallbackData(callbackData)) {
    const handled = await handleReportCallback(context, callbackData!);
    if (handled) {
      return;
    }
  }
  if (callbackData) {
    const handled = await handleProjectCallback(context, callbackData);
    if (handled) {
      if (context.update.callback_query?.id) {
        await answerCallbackQuery(context.env, context.update.callback_query.id);
      }
      return;
    }
  }
  const command = resolveCommand(context.text);
  if (command) {
    const handled = await runCommand(command, context);
    if (handled) {
      return;
    }
  }
  if (context.update.callback_query?.id) {
    await answerCallbackQuery(context.env, context.update.callback_query.id, "Команда пока недоступна");
  }
  await acknowledgeCommand(context);
};

export const handleTelegramUpdate = async (request: Request, env: unknown): Promise<Response> => {
  const bindings = ensureEnv(env);
  if (!bindings) {
    return jsonResponse({ ok: false, error: "Worker bindings are missing" }, { status: 500 });
  }
  try {
    const update = (await request.json()) as TelegramUpdate;
    const context = createContext(bindings, update);
    await handleUpdate(context);
    return jsonResponse({ ok: true, data: { handled: true } });
  } catch (error) {
    console.error("telegram update error", error);
    return jsonResponse({ ok: false, error: (error as Error).message }, { status: 500 });
  }
};
