import type { Env } from "../core/types";
import { logError } from "../core/logger";

const API_BASE = "https://api.telegram.org";

export async function callTelegramApi<T>(env: Env, method: string, payload: Record<string, unknown>) {
  const token = env.TELEGRAM_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_TOKEN is not configured");
  }

  const response = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    await logError(env, new Error(`Telegram API ${method} failed: ${response.status}`), errorText);
    throw new Error(`Telegram API request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export function maskTelegramId(id: string | number) {
  const text = String(id);
  return `${text.slice(0, 4)}***${text.slice(-3)}`;
}
