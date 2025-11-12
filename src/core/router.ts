import { Router } from 'itty-router';
import type { Env, RouterRequest } from './types';
import { handleHealth } from '../api/health';
import { handleLeads, handleLeadDetail } from '../api/leads';
import { handleUsers } from '../api/users';
import { handleReports } from '../api/reports';
import { handleSettings } from '../api/settings';
import { handleDashboard } from '../api/dashboard';
import { handleMetaStatus } from '../meta/status';
import { handleMetaSync } from '../meta/sync';
import { handleMetaStats } from '../meta/stats';
import { handleMetaCallback } from '../meta/auth';
import { handleTelegramWebhook } from '../bot/webhook';
import { json, notFound } from './utils';

export function createRouter(env: Env) {
  const router = Router<Request, RouterRequest>();

  router.get('/api/health', (request) => handleHealth(request, env));
  router.get('/api/dashboard', (request) => handleDashboard(request, env));
  router.all('/api/leads', (request) => handleLeads(request, env));
  router.all('/api/leads/:id', (request) => handleLeadDetail(request, env, request.params!.id));
  router.all('/api/users', (request) => handleUsers(request, env));
  router.all('/api/reports', (request) => handleReports(request, env));
  router.get('/api/settings', (request) => handleSettings(request, env));

  router.get('/meta/status', (request) => handleMetaStatus(request, env));
  router.post('/meta/sync', (request) => handleMetaSync(request, env));
  router.get('/meta/stats', (request) => handleMetaStats(request, env));
  router.get('/auth/facebook/callback', (request) => handleMetaCallback(request, env));

  router.post('/telegram/:botId', (request) => handleTelegramWebhook(request, env));

  router.get('/admin', (request) => {
    const url = new URL(request.url);
    if (url.searchParams.get('key') !== env.ADMIN_KEY) {
      return new Response('Unauthorized', { status: 401 });
    }
    return fetch(new URL('../public/admin.html', import.meta.url));
  });

  router.get('/', () => json({ name: 'TargetBot', version: '1.0.0' }));
  router.all('*', () => notFound());

  return router;
}
