import type { Env } from '../core/types';
import { json, requireAdminKey } from '../core/utils';

export async function handleReports(request: Request, env: Env): Promise<Response> {
  requireAdminKey(request, env.ADMIN_KEY);
  if (request.method === 'GET') {
    const list = await env.R2_REPORTS.list();
    return json({ reports: list.objects?.map((obj) => ({ key: obj.key, uploaded: obj.uploaded })) ?? [] });
  }
  if (request.method === 'POST') {
    const key = `reports/${Date.now()}.json`;
    await env.R2_REPORTS.put(key, JSON.stringify({ createdAt: new Date().toISOString() }));
    return json({ key }, { status: 201 });
  }
  return new Response('Method Not Allowed', { status: 405 });
}
