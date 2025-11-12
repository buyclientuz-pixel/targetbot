import { createRouter } from './core/router';
import type { Env } from './core/types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const router = createRouter(env);
    try {
      const response = await router.handle(request);
      if (response) {
        return response;
      }
      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Worker error', error);
      return new Response('Internal Error', { status: 500 });
    }
  }
};

export const onRequest = async ({ request, env }: { request: Request; env: Env }) => {
  return (await createRouter(env).handle(request)) ?? new Response('Not Found', { status: 404 });
};
