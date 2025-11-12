import { createContext } from "./context";
import { acknowledgeCommand, sendMainMenu } from "./menu";
import { BotContext, TelegramUpdate } from "./types";
import { jsonResponse } from "../utils/http";
import { EnvBindings } from "../utils/storage";
import { TelegramEnv } from "../utils/telegram";

const ensureEnv = (env: unknown): (EnvBindings & TelegramEnv) | null => {
  if (!env || typeof env !== "object") {
    return null;
  }
  if (!("DB" in env) || !("R2" in env)) {
    return null;
  }
  return env as EnvBindings & TelegramEnv;
};

const isStartCommand = (text: string | undefined): boolean => {
  if (!text) {
    return false;
  }
  const normalized = text.trim().toLowerCase();
  return normalized === "/start" || normalized === "меню" || normalized === "/menu";
};

const handleCommand = async (context: BotContext): Promise<void> => {
  if (!context.text) {
    await acknowledgeCommand(context);
    return;
  }
  if (context.text.startsWith("cmd:")) {
    await acknowledgeCommand(context);
    return;
  }
  await acknowledgeCommand(context);
};

const handleUpdate = async (context: BotContext): Promise<void> => {
  if (isStartCommand(context.text)) {
    await sendMainMenu(context);
    return;
  }
  await handleCommand(context);
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
