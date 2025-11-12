import type { Env } from '../core/types';
import { json, parseJSON, requireAdminKey } from '../core/utils';
import { createLead, listLeads, removeLead } from '../core/db';

export async function handleLeads(request: Request, env: Env): Promise<Response> {
  switch (request.method) {
    case 'GET':
      requireAdminKey(request, env.ADMIN_KEY);
      return json({ items: await listLeads(env) });
    case 'POST':
      requireAdminKey(request, env.ADMIN_KEY);
      return json({ lead: await createLead(env, await parseJSON(request)) }, { status: 201 });
    default:
      return new Response('Method Not Allowed', { status: 405 });
  }
}

export async function handleLeadDetail(request: Request, env: Env, id: string): Promise<Response> {
  if (request.method === 'DELETE') {
    requireAdminKey(request, env.ADMIN_KEY);
    const removed = await removeLead(env, id);
    return json({ removed });
  }
  return new Response('Method Not Allowed', { status: 405 });
}
