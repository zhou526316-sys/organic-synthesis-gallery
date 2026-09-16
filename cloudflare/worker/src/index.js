import {
  bridgeQueue,
  getArticleFigures,
  getToc,
  mediaBatch,
  mediaInventory,
  repairStatus,
  serveMediaObject,
} from './media.js';
import {
  importFigure,
  importToc,
  quarantineToc,
  resetFigures,
} from './media-write.js';
import {
  diagnoseMedia,
  mediaAudit,
  mediaDiagnostics,
  persistMediaAttempt,
  persistRenderReport,
} from './diagnostics.js';
import {
  getLiteratureSupplement,
  getTitleTranslations,
  importLiteratureSupplement,
  importTitleTranslations,
} from './metadata.js';
import { resolvePaperTitles } from './title-resolution.js';

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

function writeAuthorized(request, env) {
  const expected = typeof env.BRIDGE_WRITE_TOKEN === 'string' ? env.BRIDGE_WRITE_TOKEN.trim() : '';
  if (!expected) return false;
  const authorization = request.headers.get('authorization') || '';
  const bearer = authorization.replace(/^Bearer\s+/i, '').trim();
  const bridgeHeader = (request.headers.get('x-bridge-token') || '').trim();
  return bearer === expected || bridgeHeader === expected;
}

function requireWriteAuthorization(request, env) {
  if (!env.BRIDGE_WRITE_TOKEN) {
    return json({ error: 'write_token_not_configured' }, { status: 503 });
  }
  if (!writeAuthorized(request, env)) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
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
      kv: Boolean(env.STATE),
      writeAuth: Boolean(env.BRIDGE_WRITE_TOKEN),
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/paper-titles/resolve') {
    return resultResponse(await resolvePaperTitles(env, await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/title-translations/zh') {
    return resultResponse(await getTitleTranslations(env, await readJson(request)));
  }
  if (request.method === 'GET' && url.pathname === '/api/literature/supplement') {
    return resultResponse(await getLiteratureSupplement(env));
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
  if (request.method === 'GET' && url.pathname === '/api/media-audit') {
    return resultResponse(await mediaAudit(env));
  }
  if (request.method === 'GET' && url.pathname === '/api/media-diagnostics') {
    return resultResponse(await mediaDiagnostics(env));
  }
  if (request.method === 'POST' && url.pathname === '/api/media/render-report') {
    return resultResponse(await persistRenderReport(env, await readJson(request)));
  }

  const isWriteRoute =
    request.method === 'POST' &&
    [
      '/api/toc/import',
      '/api/toc/quarantine',
      '/api/article-figures/import',
      '/api/article-figures/reset',
      '/api/media/attempt',
      '/api/media/diagnose',
      '/api/title-translations/zh/import',
      '/api/literature/supplement/import',
    ].includes(url.pathname);
  if (isWriteRoute) {
    const denied = requireWriteAuthorization(request, env);
    if (denied) return denied;
  }

  if (request.method === 'POST' && url.pathname === '/api/toc/import') {
    return resultResponse(await importToc(request, env, await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/toc/quarantine') {
    return resultResponse(await quarantineToc(request, env, await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/article-figures/import') {
    return resultResponse(await importFigure(request, env, await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/article-figures/reset') {
    return resultResponse(await resetFigures(request, env, await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/media/attempt') {
    return resultResponse(await persistMediaAttempt(env, await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/media/diagnose') {
    return resultResponse(await diagnoseMedia(env, await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/title-translations/zh/import') {
    return resultResponse(await importTitleTranslations(env, await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/literature/supplement/import') {
    return resultResponse(await importLiteratureSupplement(env, await readJson(request)));
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
    // publisher-retrieval functions are migrated and validated.
    ctx.waitUntil(Promise.resolve());
  },
};
