import type { Env } from '../core/types';
import { json } from '../core/utils';
import { setMetaStatus } from '../core/db';

export async function handleMetaCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) {
    return json({ error: 'Missing code' }, { status: 400 });
  }
  await setMetaStatus(env, { status: 'authorized', code, updatedAt: new Date().toISOString() });
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${env.WORKER_URL ?? ''}/admin?key=${env.ADMIN_KEY ?? ''}#integrations`
    }
  });
}
