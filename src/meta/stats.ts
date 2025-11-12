import type { Env } from '../core/types';
import { json } from '../core/utils';
import { fetchMetaStats } from './client';
import { setMetaStatus } from '../core/db';

export async function handleMetaStats(request: Request, env: Env): Promise<Response> {
  const stats = await fetchMetaStats();
  await setMetaStatus(env, { status: 'synced', stats, updatedAt: new Date().toISOString() });
  return json({ stats });
}
