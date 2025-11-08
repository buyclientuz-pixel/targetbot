export default {
  async fetch(request) {
    if (new URL(request.url).pathname === '/health') {
      return new Response('ok', { status: 200, headers: { 'cache-control': 'no-store' } });
    }

    return new Response(
      JSON.stringify({
        status: 'ready',
        message: 'Targetbot worker scaffold is running. Replace this handler with the production bot logic.',
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      }
    );
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(Promise.resolve());
  },
};
