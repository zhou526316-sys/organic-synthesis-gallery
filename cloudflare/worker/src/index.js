import { STAGE_STORAGE_REVISION } from './stage-storage.js';
import { getLocalCaptureIndex, getLocalDiagnostics, getStagedArticleFigures, getTampermonkeyReports, importLocalCapture, importLocalDiagnostics, importStagedArticleFigure, importTampermonkeyReport, promoteStagedArticleFigures, purgeCrossDoiLocalMedia } from './local-captures.js';
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
  purgeCrossDoiMedia,
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
import { getArticleSummary, importArticleFulltext } from './article-summary.js';
import { exportOpenSiteFeedback, markReader, readerCounts, readerStats, siteAnalyticsStats, submitPaperFeedback, submitSiteFeedback, trackPageView, updateSiteFeedbackStatuses } from './user-ui.js';
import {
  alipayNotify,
  authCallback,
  authStart,
  createPayment,
  changePassword,
  confirmEmailChange,
  confirmExistingEmailVerification,
  confirmPasswordReset,
  consumePasswordRegistration,
  emailConsume,
  emailStart,
  exchangeAuth,
  integrationStatus,
  probeEmailDelivery,
  logout,
  paymentStatus,
  passwordLogin,
  registerPasswordUser,
  resendEmailChange,
  resendExistingEmailVerification,
  resendPasswordRegistrationCode,
  resendPasswordResetCode,
  revokeOtherSessions,
  sessionInfo,
  startEmailChange,
  startExistingEmailVerification,
  startPasswordReset,
  verifyPasswordRegistration,
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

// Site analytics routes live under /api/user-ui/ and inherit browser CORS.
const BROWSER_READ_PATHS = new Set([
  '/api/paper-titles/resolve',
  '/api/title-translations/zh',
  '/api/literature/supplement',
  '/api/toc',
  '/api/article-figures',
  '/api/article-figures/staged',
  '/api/media/batch',
  '/api/media/inventory',
  '/api/media/bridge-queue',
  '/api/media/repair-status',
  '/api/media/jobs/status',
  '/api/media/local-capture-index',
  '/api/media/capture-capabilities',
  '/api/media/local-diagnostics',
  '/api/media/tampermonkey-reports',
]);

const TAMPERMONKEY_CORS_WRITE_PATHS = new Set([
  '/api/article-figures/stage',
  '/api/article-summary/fulltext/import',
  '/api/media/local-capture/import',
  '/api/media/local-diagnostics/import',
  '/api/media/tampermonkey-report/import',
]);

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function resultResponse(result, headers = {}) {
  return json(result.body, { status: result.status || 200, headers: { ...(result.headers || {}), ...headers } });
}

function browserCorsOriginAllowed(origin) {
  if (!origin) return false;
  const exact = new Set([
    'https://zhou526316-sys.github.io',
    'https://organic-synthesis-gallery.zhou526316.workers.dev',
    'https://organic-synthesis-gallery-public.pages.dev',
    'https://pubs.acs.org',
    'https://onlinelibrary.wiley.com',
    'https://pubs.rsc.org',
    'https://www.nature.com',
    'https://www.science.org',
    'https://www.sciencedirect.com',
    'https://www.cell.com',
    'https://www.ccspublishing.org.cn',
    'https://doi.org',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);
  if (exact.has(origin)) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && (
      host.endsWith('.onlinelibrary.wiley.com') ||
      host.endsWith('.sciencedirect.com') ||
      host.endsWith('.cell.com') ||
      host.endsWith('.ccspublishing.org.cn')
    );
  } catch {
    return false;
  }
}

function browserCorsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  return {
    'access-control-allow-origin': browserCorsOriginAllowed(origin) ? origin : 'https://zhou526316-sys.github.io',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-max-age': '86400',
    'access-control-expose-headers': 'retry-after, cf-ray, content-type',
    'vary': 'Origin',
  };
}

function isBrowserReadablePath(pathname) {
  return pathname.startsWith('/api/user-ui/') ||
    BROWSER_READ_PATHS.has(pathname) ||
    TAMPERMONKEY_CORS_WRITE_PATHS.has(pathname);
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
      ai: Boolean(env.AI),
      kv: Boolean(env.STATE),
      writeAuth: Boolean(env.BRIDGE_WRITE_TOKEN),
      integrations: integrationStatus(env).body,
    });
  }

  if (request.method === 'GET' && url.pathname === '/api/user-ui/article-summary') {
    return resultResponse(await getArticleSummary(env, url.searchParams.get('doi')), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/reader-counts') {
    return resultResponse(await readerCounts(env, await readJson(request)), cors);
  }
  if (request.method === 'GET' && url.pathname === '/api/user-ui/reader-stats') {
    return resultResponse(await readerStats(env), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/pageview') {
    return resultResponse(await trackPageView(env, await readJson(request), request), cors);
  }
  if (request.method === 'GET' && url.pathname === '/api/user-ui/site-stats') {
    return resultResponse(await siteAnalyticsStats(env), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/reader-counts/mark') {
    return resultResponse(await markReader(env, await readJson(request), request), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/feedback') {
    return resultResponse(await submitPaperFeedback(env, await readJson(request)), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/site-feedback') {
    return resultResponse(await submitSiteFeedback(env, await readJson(request)), cors);
  }
  if (request.method === 'GET' && url.pathname === '/api/admin/site-feedback/open') {
    const authError = requireWriteAuthorization(request, env);
    if (authError) return authError;
    const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') || 300)));
    return resultResponse(await exportOpenSiteFeedback(env, limit));
  }
  if (request.method === 'POST' && url.pathname === '/api/admin/site-feedback/status') {
    const authError = requireWriteAuthorization(request, env);
    if (authError) return authError;
    return resultResponse(await updateSiteFeedbackStatuses(env, await readJson(request)));
  }

  if (request.method === 'GET' && url.pathname === '/api/user-ui/integrations') {
    return resultResponse(integrationStatus(env), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/admin/email/probe') {
    const authError = requireWriteAuthorization(request, env);
    if (authError) return authError;
    return resultResponse(await probeEmailDelivery(env));
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
  if (request.method === 'POST' && url.pathname === '/api/user-ui/auth/register') {
    return resultResponse(await registerPasswordUser(request, env, await readJson(request)), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/auth/register/verify') {
    return resultResponse(await verifyPasswordRegistration(env, await readJson(request)), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/auth/register/resend') {
    return resultResponse(await resendPasswordRegistrationCode(env, await readJson(request)), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/auth/password/login') {
    return resultResponse(await passwordLogin(env, await readJson(request)), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/auth/password/reset/start') {
    return resultResponse(await startPasswordReset(env, await readJson(request)), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/auth/password/reset/resend') {
    return resultResponse(await resendPasswordResetCode(env, await readJson(request)), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/auth/password/reset/confirm') {
    return resultResponse(await confirmPasswordReset(env, await readJson(request)), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/auth/password/change') {
    return resultResponse(await changePassword(request, env, await readJson(request)), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/auth/email/change/start') {
    return resultResponse(await startEmailChange(request, env, await readJson(request)), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/auth/email/change/resend') {
    return resultResponse(await resendEmailChange(request, env, await readJson(request)), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/auth/email/change/confirm') {
    return resultResponse(await confirmEmailChange(request, env, await readJson(request)), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/auth/sessions/revoke-others') {
    return resultResponse(await revokeOtherSessions(request, env), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/auth/email/verify/start') {
    return resultResponse(await startExistingEmailVerification(request, env), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/auth/email/verify/resend') {
    return resultResponse(await resendExistingEmailVerification(request, env, await readJson(request)), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/user-ui/auth/email/verify/confirm') {
    return resultResponse(await confirmExistingEmailVerification(request, env, await readJson(request)), cors);
  }
  if (request.method === 'GET' && url.pathname === '/api/user-ui/auth/register/consume') {
    return consumePasswordRegistration(request, env);
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
  if(request.method==='GET' && url.pathname==='/api/media/capture-capabilities') {
    return json({captureVersion:'6.2.20',mediaGeneration:1790082000000,mode:'verified-staging',pairedCapture:true,bodyFigures:true,maxFiguresPerVisit:20,publishedAutomatically:false,bodyReviewMarkers:'body-review-v1',stageStorageRevision:STAGE_STORAGE_REVISION}, {headers:cors});
  }
  if (request.method === 'GET' && url.pathname === '/api/article-figures/staged') {
    return resultResponse(await getStagedArticleFigures(request, env), cors);
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
  if (request.method === 'GET' && url.pathname === '/api/media/local-capture-index') {
    return resultResponse(await getLocalCaptureIndex(request, env), cors);
  }
  if (request.method === 'GET' && url.pathname === '/api/media/local-diagnostics') {
    return resultResponse(await getLocalDiagnostics(env), cors);
  }
  if (request.method === 'GET' && url.pathname === '/api/media/tampermonkey-reports') {
    return resultResponse(await getTampermonkeyReports(request, env), cors);
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
      '/api/article-figures/stage',
      '/api/article-figures/promote-staged',
      '/api/article-figures/reset',
      '/api/media/purge-cross-doi',
      '/api/media/attempt',
      '/api/media/diagnose',
      '/api/media/repair-batch',
      '/api/media/primary/import',
      '/api/media/local-capture/import',
      '/api/media/local-diagnostics/import',
      '/api/media/tampermonkey-report/import',
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
    return json({ error: 'media_rebuild_lockdown', route: url.pathname }, { status: 503, headers: cors });
  }
  if (request.method === 'POST' && url.pathname === '/api/toc/quarantine') {
    return resultResponse(await quarantineToc(request, env, await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/article-figures/import') {
    return json({ error: 'media_rebuild_lockdown', route: url.pathname }, { status: 503, headers: cors });
  }
  if (request.method === 'POST' && url.pathname === '/api/article-figures/stage') {
    return resultResponse(await importStagedArticleFigure(request, env, await readJson(request)), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/article-figures/promote-staged') {
    return json({error:'verified_promotion_pending',stagedObjectsRetained:true},{status:503,headers:cors});
  }
  if (request.method === 'POST' && url.pathname === '/api/article-figures/reset') {
    return resultResponse(await resetFigures(request, env, await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/media/purge-cross-doi') {
    const payload = await readJson(request);
    const [database, local] = await Promise.all([
      purgeCrossDoiMedia(env, payload),
      purgeCrossDoiLocalMedia(env, payload),
    ]);
    const affectedDois = [...new Set([
      ...(database.body?.affectedDois || []),
      ...(local.body?.affectedDois || []),
    ])];
    return resultResponse({
      status: Math.max(Number(database.status || 200), Number(local.status || 200)),
      body: {
        dryRun: payload?.dryRun === true,
        affectedDois,
        database: database.body,
        local: local.body,
      },
    });
  }
  if (request.method === 'POST' && url.pathname === '/api/media/attempt') {
    return resultResponse(await persistMediaAttempt(env, await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/media/diagnose') {
    return resultResponse(await diagnoseMedia(env, await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/media/repair-batch') {
    return json({ error: 'media_rebuild_lockdown', route: url.pathname }, { status: 503, headers: cors });
  }
  if (request.method === 'POST' && url.pathname === '/api/media/primary/import') {
    return json({ error: 'media_rebuild_lockdown', route: url.pathname }, { status: 503, headers: cors });
  }
  if (request.method === 'POST' && url.pathname === '/api/article-summary/fulltext/import') {
    const authError = requireWriteAuthorization(request, env);
    if (authError) return authError;
    return resultResponse(await importArticleFulltext(env, await readJson(request)), cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/media/local-capture/import') {
    return resultResponse(await importLocalCapture(request, env, await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/media/local-diagnostics/import') {
    return resultResponse(await importLocalDiagnostics(request, env, await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/media/tampermonkey-report/import') {
    return resultResponse(await importTampermonkeyReport(request, env, await readJson(request)));
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
    ctx.waitUntil((async () => {
      try {
        const [databaseSweep, localSweep] = await Promise.all([
          purgeCrossDoiMedia(env, { dryRun: false }),
          purgeCrossDoiLocalMedia(env, { dryRun: false }),
        ]);
        const purged = Number(databaseSweep.body?.summary?.affectedDois || 0) +
          Number(localSweep.body?.summary?.affectedDois || 0);
        if (purged > 0) {
          console.warn('CROSS_DOI_MEDIA_PURGED', JSON.stringify({
            database: databaseSweep.body?.summary || {},
            local: localSweep.body?.summary || {},
          }));
        }
        console.log('MEDIA_JOB_CRON_SKIPPED', JSON.stringify({ mode, reason: 'media_rebuild_lockdown' }));
      } catch (error) {
        console.error('MEDIA_JOB_CRON_FAILED', error instanceof Error ? error.message : String(error));
      }
    })());
    console.log('ARTICLE_FIGURE_STAGE_PROMOTION_CRON_SKIPPED', 'verified_staging_release;retain_original_objects');
  },
};
