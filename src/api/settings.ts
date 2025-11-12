import type { Env } from '../core/types';
import { json, requireAdminKey } from '../core/utils';

export async function handleSettings(request: Request, env: Env): Promise<Response> {
  requireAdminKey(request, env.ADMIN_KEY);
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  return json({
    workerUrl: env.WORKER_URL ?? 'https://example.workers.dev',
    adminKey: env.ADMIN_KEY ?? 'unset'
  });
}
