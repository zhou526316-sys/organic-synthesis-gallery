const json = (value, init = {}) => new Response(JSON.stringify(value), {
  ...init,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...(init.headers || {}),
  },
});

async function handleApi(request, env) {
  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/api/_healthcheck') {
    return json({
      ok: true,
      platform: 'cloudflare-workers',
      migration: true,
    });
  }

  return json({
    error: 'route_not_migrated',
    path: url.pathname,
  }, { status: 501 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    return json({ error: 'not_found' }, { status: 404 });
  },

  async scheduled(controller, env, ctx) {
    // This will replace the five AppDeploy media-repair cron jobs after the
    // media storage and repair routes have been migrated and validated.
    ctx.waitUntil(Promise.resolve());
  },
};
