import {
  bridgeQueue,
  getArticleFigures,
  getToc,
  mediaBatch,
  mediaInventory,
  repairStatus,
  serveMediaObject,
} from './media.js';

const json = (value, init = {}) => new Response(JSON.stringify(value), {
  ...init,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...(init.headers || {}),
  },
});

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function resultResponse(result) {
  return json(result.body, { status: result.status || 200 });
}

async function handleApi(request, env) {
  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/api/_healthcheck') {
    return json({
      ok: true,
      platform: 'cloudflare-workers',
      migration: true,
      d1: Boolean(env.DB),
      r2: Boolean(env.MEDIA),
    });
  }

  if (request.method === 'GET' && url.pathname === '/api/toc') {
    return resultResponse(await getToc(request, env));
  }
  if (request.method === 'GET' && url.pathname === '/api/article-figures') {
    return resultResponse(await getArticleFigures(request, env));
  }
  if (request.method === 'POST' && url.pathname === '/api/media/batch') {
    return resultResponse(await mediaBatch(request, env, await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/media/inventory') {
    return resultResponse(await mediaInventory(request, env, await readJson(request)));
  }
  if (request.method === 'GET' && url.pathname === '/api/media/bridge-queue') {
    return resultResponse(await bridgeQueue(request, env));
  }
  if (request.method === 'GET' && url.pathname === '/api/media/repair-status') {
    return resultResponse(await repairStatus(request, env));
  }

  return json({
    error: 'route_not_migrated',
    path: url.pathname,
  }, { status: 501 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/media/')) return serveMediaObject(request, env);
      if (url.pathname.startsWith('/api/')) return handleApi(request, env);
      return json({ error: 'not_found' }, { status: 404 });
    } catch (error) {
      console.error('Worker request failed', {
        path: url.pathname,
        message: error instanceof Error ? error.message : String(error),
      });
      return json({ error: 'internal_error' }, { status: 500 });
    }
  },

  async scheduled(controller, env, ctx) {
    // This will replace the AppDeploy media-repair cron jobs after the
    // media write paths and publisher-retrieval functions are migrated.
    ctx.waitUntil(Promise.resolve());
  },
};
