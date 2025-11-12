import type { Env } from '../core/types';

const TELEGRAM_API = 'https://api.telegram.org';

async function callTelegram<T>(env: Env, method: string, payload: Record<string, unknown>): Promise<T> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }
  const response = await fetch(`${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram API error: ${response.status} ${text}`);
  }
  return response.json<T>();
}

export function sendMessage(env: Env, chatId: number | string, text: string) {
  return callTelegram(env, 'sendMessage', { chat_id: chatId, text });
}

export function answerCallback(env: Env, callbackQueryId: string, text: string) {
  return callTelegram(env, 'answerCallbackQuery', { callback_query_id: callbackQueryId, text });
}
