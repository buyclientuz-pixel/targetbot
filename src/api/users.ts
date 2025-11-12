import type { Env } from '../core/types';
import { json, parseJSON, requireAdminKey } from '../core/utils';
import { createUser, listUsers } from '../core/db';

export async function handleUsers(request: Request, env: Env): Promise<Response> {
  requireAdminKey(request, env.ADMIN_KEY);
  switch (request.method) {
    case 'GET':
      return json({ items: await listUsers(env) });
    case 'POST':
      return json({ user: await createUser(env, await parseJSON(request)) }, { status: 201 });
    default:
      return new Response('Method Not Allowed', { status: 405 });
  }
}
