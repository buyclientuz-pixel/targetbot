import type { Env } from '../core/types';
import { json, requireAdminKey } from '../core/utils';

export async function handleWebhookManage(request: Request, env: Env): Promise<Response> {
  requireAdminKey(request, env.ADMIN_KEY);
  const url = new URL(request.url);
  const refresh = url.searchParams.get('refresh') === '1';
  if (!env.TELEGRAM_BOT_TOKEN) {
    return json({
      ok: false,
      status: 'TELEGRAM_BOT_TOKEN not configured'
    });
  }

  if (refresh) {
    // In production this would call Telegram setWebhook. Here we return a stub response.
    return json({ ok: true, status: 'Webhook refresh triggered' });
  }

  return json({ ok: true, status: 'Webhook active' });
}
