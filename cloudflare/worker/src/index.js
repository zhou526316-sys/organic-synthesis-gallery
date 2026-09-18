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
import { runLeaseRepairBatch, runRepairBatch } from './repair.js';
import { importPrimaryVisual } from './primary-visual.js';
import { claimMediaJobs, completeMediaJob, failMediaJob, mediaJobStatus, resumeManualJob, seedMediaJobs, startMediaJob } from './media-jobs.js';
import { resolvePaperTitles } from './title-resolution.js';
import { markReader, readerCounts, submitPaperFeedback } from './user-ui.js';
import {
  alipayNotify,
  authCallback,
  authStart,
  createPayment,
  emailConsume,
  emailStart,
  exchangeAuth,
  integrationStatus,
  logout,
  paymentStatus,
  sessionInfo,
  wechatNotify,
} from './integrations.js';

const json = (value, init = {}) => new Response(JSON.stringify(value), {
  ...init,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...(init.headers || {}),
  },
});

const BROWSER_READ_PATHS = new Set([
  '/api/paper-titles/resolve',
  '/api/title-translations/zh',
  '/api/literature/supplement',
  '/api/toc',
  '/api/article-figures',
  '/api/media/batch',
  '/api/media/inventory',
  '/api/media/bridge-queue',
  '/api/media/repair-status',
  '/api/media/jobs/status',
]);

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function resultResponse(result, headers = {}) {
  return json(result.body, { status: result.status || 200, headers });
}

function browserCorsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  const allowed = new Set([
    'https://zhou526316-sys.github.io',
    'https://organic-synthesis-gallery.zhou526316.workers.dev',
    'https://organic-synthesis-gallery-public.pages.dev',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);
  return {
    'access-control-allow-origin': allowed.has(origin) ? origin : 'https://zhou526316-sys.github.io',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-max-age': '86400',
    'vary': 'Origin',
  };
}

function isBrowserReadablePath(pathname) {
  return pathname.startsWith('/api/user-ui/') || BROWSER_READ_PATHS.has(pathname);
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
  const userUiRoute = url.pathname.startsWith('/api/user-ui/');
  const corsRoute = isBrowserReadablePath(url.pathname);
  const cors = corsRoute ? browserCorsHeaders(request) : {};

  if (corsRoute && request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method === 'GET' && url.pathname === '/api/_healthcheck') {
    return json({
      ok: true,
      platform: 'cloudflare-workers',
      migration: true,
      d1: Boolean(env.DB),
      r2: Boolean(env.MEDIA),
      kv: Boolean(env.STATE),
      writeAuth: Boolean(env.BRIDGE_WRITE_TOKEN),
      integrations: integrationStatus(env).body,
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/user-ui/reader-counts') {
    return resultResponse(await readerCounts(env, await readJson(request)), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/reader-counts/mark') {
    return resultResponse(await markReader(env, await readJson(request)), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/feedback') {
    return resultResponse(await submitPaperFeedback(env, await readJson(request)), cors);
  }

  if (request.method === 'GET' && url.pathname === '/api/user-ui/integrations') {
    return resultResponse(integrationStatus(env), cors);
  }
  if (request.method === 'GET' && url.pathname === '/api/user-ui/auth/start') {
    return authStart(request, env);
  }
  if (request.method === 'GET' && url.pathname.startsWith('/api/user-ui/auth/callback/')) {
    const provider = url.pathname.split('/').pop() || '';
    return authCallback(request, env, provider);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/auth/exchange') {
    return resultResponse(await exchangeAuth(env, await readJson(request)), cors);
  }
  if (request.method === 'GET' && url.pathname === '/api/user-ui/auth/session') {
    return resultResponse(await sessionInfo(request, env), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/auth/logout') {
    return resultResponse(await logout(request, env), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/auth/email/start') {
    return resultResponse(await emailStart(request, env, await readJson(request)), cors);
  }
  if (request.method === 'GET' && url.pathname === '/api/user-ui/auth/email/consume') {
    return emailConsume(request, env);
  }

  if (request.method === 'POST' && url.pathname === '/api/user-ui/payments/create') {
    return resultResponse(await createPayment(request, env, await readJson(request)), cors);
  }
  if (request.method === 'GET' && url.pathname === '/api/user-ui/payments/status') {
    return resultResponse(await paymentStatus(request, env), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/payments/wechat/notify') {
    return wechatNotify(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/payments/alipay/notify') {
    return alipayNotify(request, env);
  }

  if (request.method === 'POST' && url.pathname === '/api/paper-titles/resolve') {
    return resultResponse(await resolvePaperTitles(env, await readJson(request)), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/title-translations/zh') {
    return resultResponse(await getTitleTranslations(env, await readJson(request)), cors);
  }
  if (request.method === 'GET' && url.pathname === '/api/literature/supplement') {
    return resultResponse(await getLiteratureSupplement(env), cors);
  }

  if (request.method === 'GET' && url.pathname === '/api/toc') {
    return resultResponse(await getToc(request, env), cors);
  }
  if (request.method === 'GET' && url.pathname === '/api/article-figures') {
    return resultResponse(await getArticleFigures(request, env), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/media/batch') {
    return resultResponse(await mediaBatch(request, env, await readJson(request)), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/media/inventory') {
    return resultResponse(await mediaInventory(request, env, await readJson(request)), cors);
  }
  if (request.method === 'GET' && url.pathname === '/api/media/bridge-queue') {
    return resultResponse(await bridgeQueue(request, env), cors);
  }
  if (request.method === 'GET' && url.pathname === '/api/media/repair-status') {
    return resultResponse(await repairStatus(request, env), cors);
  }
  if (request.method === 'GET' && url.pathname === '/api/media/jobs/status') {
    return resultResponse(await mediaJobStatus(env), cors);
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
      '/api/media/repair-batch',
      '/api/media/primary/import',
      '/api/media/jobs/claim',
      '/api/media/jobs/start',
      '/api/media/jobs/complete',
      '/api/media/jobs/fail',
      '/api/media/jobs/resume-manual',
      '/api/media/jobs/seed',
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
  if (request.method === 'POST' && url.pathname === '/api/media/repair-batch') {
    const payload = await readJson(request);
    return json(await runRepairBatch(env, payload?.limit));
  }
  if (request.method === 'POST' && url.pathname === '/api/media/primary/import') {
    return resultResponse(await importPrimaryVisual(request, env, await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/media/jobs/claim') {
    return resultResponse(await claimMediaJobs(env, await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/media/jobs/start') {
    return resultResponse(await startMediaJob(env, await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/media/jobs/complete') {
    return resultResponse(await completeMediaJob(env, await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/media/jobs/fail') {
    return resultResponse(await failMediaJob(env, await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/media/jobs/resume-manual') {
    return resultResponse(await resumeManualJob(env, await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/media/jobs/seed') {
    const payload = await readJson(request);
    return resultResponse({ status: 200, body: await seedMediaJobs(env, Array.isArray(payload?.dois) ? payload.dois : [], { priority: payload?.priority }) });
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
  }, { status: 501, headers: cors });
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
      const headers = isBrowserReadablePath(url.pathname) ? browserCorsHeaders(request) : {};
      return json({ error: 'internal_error' }, { status: 500, headers });
    }
  },

  async scheduled(controller, env, ctx) {
    const minute = new Date(controller.scheduledTime || Date.now()).getUTCMinutes();
    const mode = minute === 0 ? 'upgrade' : 'coverage';
    const limit = mode === 'upgrade' ? 1 : 2;
    ctx.waitUntil(
      runLeaseRepairBatch(env, limit, mode, `cloudflare-cron:${controller.scheduledTime || Date.now()}`).then(result => {
        console.log('MEDIA_JOB_CRON', JSON.stringify({ mode, claimed: result.claimed, processed: result.processed, results: result.results }));
      }).catch(error => {
        console.error('MEDIA_JOB_CRON_FAILED', error instanceof Error ? error.message : String(error));
      })
    );
  },
};
