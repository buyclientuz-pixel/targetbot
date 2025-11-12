import type { Env } from '../core/types';
import { handleUpdate } from './handler';

export async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  const update = await request.json();
  return handleUpdate(env, update);
}
