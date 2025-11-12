import type { Env } from '../core/types';
import { json } from '../core/utils';
import { getMetaStatus } from '../core/db';

export async function handleMetaStatus(request: Request, env: Env): Promise<Response> {
  const status = await getMetaStatus(env);
  return json({ meta: status, telegram: { status: 'unknown' } });
}
