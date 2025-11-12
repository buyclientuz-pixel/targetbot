import type { Env } from '../core/types';
import { handleLead, handleReport, handleStart, handleUnknown } from './commands';

interface TelegramUpdate {
  message?: {
    text?: string;
    chat: { id: number };
    from?: { first_name?: string; id: number };
  };
}

export async function handleUpdate(env: Env, update: TelegramUpdate): Promise<Response> {
  const message = update.message;
  if (!message?.text) {
    return new Response('ok');
  }
  const command = message.text.split(' ')[0];
  switch (command) {
    case '/start':
      await handleStart(env, message);
      break;
    case '/lead':
      await handleLead(env, message);
      break;
    case '/report':
      await handleReport(env, message);
      break;
    default:
      await handleUnknown(env, message);
  }
  return new Response('ok');
}
