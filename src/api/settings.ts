import { jsonResponse } from "../utils/http";
import { createId } from "../utils/ids";
import { appendCommandLog, EnvBindings, listSettings, saveSettings } from "../utils/storage";
import { ApiError, ApiSuccess, CommandLogRecord, SettingRecord, SettingScope } from "../types";

const ensureEnv = (env: unknown): EnvBindings => {
  if (!env || typeof env !== "object" || !("DB" in env) || !("R2" in env)) {
    throw new Error("Env bindings are not configured");
  }
  return env as EnvBindings;
};

const parseScope = (value: unknown): SettingScope => {
  if (value === "bot" || value === "portal" || value === "reports" || value === "billing" || value === "system") {
    return value;
  }
  return "system";
};

const ensureKey = (value: unknown): string => {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  throw new Error("key is required");
};

const ensureJsonValue = (value: unknown) => {
  if (value === undefined) {
    return null;
  }
  return value as SettingRecord["value"];
};

const buildLogEntry = (
  key: string,
  value: SettingRecord["value"],
  scope: SettingScope,
  userId?: string | null,
  chatId?: string | null,
): CommandLogRecord => ({
  id: createId(),
  command: "settings.update",
  payload: { key, value, scope },
  userId: userId || undefined,
  chatId: chatId || undefined,
  createdAt: new Date().toISOString(),
});

export const handleSettingsList = async (_request: Request, env: unknown): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const settings = await listSettings(bindings);
    const payload: ApiSuccess<SettingRecord[]> = { ok: true, data: settings };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 500 });
  }
};

export const handleSettingsUpsert = async (request: Request, env: unknown): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const body = (await request.json()) as Record<string, unknown>;
    const key = ensureKey(body.key);
    const scope = parseScope(body.scope);
    const value = ensureJsonValue(body.value);
    const settings = await listSettings(bindings);
    const existingIndex = settings.findIndex((entry) => entry.key === key);
    const now = new Date().toISOString();
    const record: SettingRecord = {
      key,
      scope,
      value,
      updatedAt: now,
    };
    if (existingIndex >= 0) {
      settings[existingIndex] = record;
    } else {
      settings.push(record);
    }
    await saveSettings(bindings, settings);
    const actorUserId = typeof body.userId === "string" ? body.userId : undefined;
    const actorChatId = typeof body.chatId === "string" ? body.chatId : undefined;
    await appendCommandLog(bindings, buildLogEntry(key, value, scope, actorUserId, actorChatId));
    const payload: ApiSuccess<SettingRecord> = { ok: true, data: record };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 400 });
  }
};

export const handleSettingGet = async (
  _request: Request,
  env: unknown,
  key: string,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const settings = await listSettings(bindings);
    const record = settings.find((entry) => entry.key === key);
    if (!record) {
      return jsonResponse({ ok: false, error: "Setting not found" }, { status: 404 });
    }
    const payload: ApiSuccess<SettingRecord> = { ok: true, data: record };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 500 });
  }
};
