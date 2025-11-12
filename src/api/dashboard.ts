import type { Env } from '../core/types';
import { json, requireAdminKey } from '../core/utils';
import { getDashboard } from '../core/db';

export async function handleDashboard(request: Request, env: Env): Promise<Response> {
  requireAdminKey(request, env.ADMIN_KEY);
  const snapshot = await getDashboard(env);
  return json(snapshot);
}
