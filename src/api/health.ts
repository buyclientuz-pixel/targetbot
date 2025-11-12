import { json } from '../core/utils';
import type { Env } from '../core/types';

export function handleHealth(_request: Request, _env: Env): Response {
  return json({ ok: true, status: 'healthy' });
}
