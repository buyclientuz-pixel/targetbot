import type { Env } from '../core/types';
import { json, parseJSON } from '../core/utils';
import { setMetaStatus } from '../core/db';

interface SyncRequest {
  refresh?: boolean;
}

export async function handleMetaSync(request: Request, env: Env): Promise<Response> {
  const body = await parseJSON<SyncRequest>(request);
  const status = {
    status: body.refresh ? 'refreshed' : 'synced',
    updatedAt: new Date().toISOString()
  };
  await setMetaStatus(env, status);
  return json({ ok: true, status });
}
