import { storeVerifiedStage } from './stage-storage.js';
import { normalizeDoi } from './media.js';
import { importFigure, importToc } from './media-write.js';
import { importPrimaryVisual } from './primary-visual.js';

const INDEX_KEY = 'local-captures/index.json';
const IMAGE_PREFIX = 'local-captures/images/';
const DIAGNOSTIC_KEY = 'local-captures/diagnostics/latest.json';
const TAMPERMONKEY_REPORT_INDEX_KEY = 'local-captures/tampermonkey/report-index.json';
const TAMPERMONKEY_REPORT_PREFIX = 'local-captures/tampermonkey/reports/';
const ARTICLE_FIGURE_STAGE_INDEX_KEY = 'local-captures/article-figures/stage-index.json';
const ARTICLE_FIGURE_STAGE_PREFIX = 'local-captures/article-figures/images/';
const TAMPERMONKEY_REPORT_HISTORY_LIMIT = 12;
const MAX_IMAGE_BYTES = 4_000_000;
const MAX_DIAGNOSTIC_BYTES = 1_500_000;
const MEDIA_REBUILD_EPOCH = 1790082000000;

function decodedIdentityText(value) {
  let decoded = String(value || '');
  for (let i = 0; i < 2; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded.toLowerCase();
}

function embeddedKnownDois(value) {
  let decoded = String(value || '').split(/[?#]/, 1)[0];
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch { break; }
  }
  const found = new Set();
  const pattern = /10\.(1021|1002|1038|1126|1039|1016|31635)[/_]([a-z0-9._()-]+)/ig;
  for (const match of decoded.matchAll(pattern)) {
    const doi = normalizeDoi('10.' + match[1] + '/' + match[2]);
    if (doi) found.add(doi);
  }
  try {
    const url = new URL(decoded);
    if (/^(?:www\.)?nature\.com$/i.test(url.hostname)) {
      const match = url.pathname.match(/^\/articles\/(s\d+-\d+-\d+[a-z0-9-]*)/i);
      if (match) found.add(normalizeDoi('10.1038/' + match[1]));
    }
  } catch {}
  return [...found].filter(Boolean);
}

function captureBelongsToDoi(item, doi) {
  const target = normalizeDoi(doi || '');
  if (!target) return false;
  const embedded = [...new Set([
    ...embeddedKnownDois(item?.articleUrl || ''),
    ...embeddedKnownDois(item?.sourceUrl || ''),
  ])];
  return embedded.every(value => value === target);
}

function captureIntakeError(payload, doi) {
  if (payload?.captureVersion !== '6.2.20') return 'capture_client_upgrade_required';
  if (!/^[a-z0-9-]{16,80}$/i.test(String(payload?.jobId || ''))) return 'capture_job_binding_missing';
  if (normalizeDoi(payload?.pageDoi || '') !== doi) return 'capture_page_doi_unverified';
  if (!safeUrl(payload?.articleUrl) || !safeUrl(payload?.sourceUrl)) return 'capture_source_evidence_missing';
  if (!captureBelongsToDoi(payload, doi)) return 'media_source_doi_mismatch';
  return '';
}

function sniffImageType(bytes, declaredType = '') {
  const head = bytes.slice(0, Math.min(bytes.byteLength, 1024));
  const text = new TextDecoder().decode(head).replace(/^\uFEFF/, '').trimStart().toLowerCase();
  if (text.startsWith('<?xml') || text.startsWith('<svg') || text.includes('<svg ')) return 'image/svg+xml';
  if (head.byteLength >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'image/png';
  if (head.byteLength >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head.byteLength >= 12 && String.fromCharCode(...head.slice(0, 4)) === 'RIFF' && String.fromCharCode(...head.slice(8, 12)) === 'WEBP') return 'image/webp';
  const gif = head.byteLength >= 6 ? String.fromCharCode(...head.slice(0, 6)) : '';
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
  return String(declaredType || '').toLowerCase().replace('image/jpg', 'image/jpeg');
}

function parseImageData(value) {
  if (typeof value !== 'string') return null;
  const match = /^data:(image\/(?:png|jpeg|jpg|gif|webp|svg\+xml));base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(value.trim());
  if (!match) return null;
  const bytes = Uint8Array.from(atob(match[2].replace(/\s+/g, '')), c => c.charCodeAt(0));
  if (bytes.byteLength < 100 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
  const declaredType = match[1].toLowerCase().replace('image/jpg', 'image/jpeg');
  const contentType = sniffImageType(bytes, declaredType);
  if (contentType === 'image/svg+xml') {
    const xml = new TextDecoder().decode(bytes);
    if (!/<svg[\s>]/i.test(xml) || /<!DOCTYPE|<!ENTITY|<(?:script|foreignObject|iframe|object|embed|animate\w*|set)\b|\son[a-z]+\s*=|@import/i.test(xml)) return null;
    for (const m of xml.matchAll(/(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi)) {
      if (!m[2].startsWith('#') && !/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(m[2])) return null;
    }
    if (/url\(\s*["']?\s*(?:https?:|\/\/|data:)|&#(?:x[0-9a-f]+|\d+);/i.test(xml)) return null;
  }
  return { bytes, contentType };
}

function extensionFor(type) {
  if (type === 'image/svg+xml') return 'svg';
  if (type === 'image/png') return 'png';
  if (type === 'image/gif') return 'gif';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function readIndex(env) {
  if (!env?.MEDIA) throw new Error('R2 binding MEDIA is not configured');
  const object = await env.MEDIA.get(INDEX_KEY);
  if (!object) return { version: 1, updatedAt: 0, items: {} };
  try {
    const value = JSON.parse(await object.text());
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid index');
    value.items = value.items && typeof value.items === 'object' && !Array.isArray(value.items) ? value.items : {};
    return value;
  } catch {
    return { version: 1, updatedAt: 0, items: {} };
  }
}

async function readArticleFigureStageIndex(env) {
  if (!env?.MEDIA) throw new Error('R2 binding MEDIA is not configured');
  const object = await env.MEDIA.get(ARTICLE_FIGURE_STAGE_INDEX_KEY);
  if (!object) return { version: 1, updatedAt: 0, items: {} };
  try {
    const value = JSON.parse(await object.text());
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid staged figure index');
    value.items = value.items && typeof value.items === 'object' && !Array.isArray(value.items) ? value.items : {};
    return value;
  } catch {
    return { version: 1, updatedAt: 0, items: {} };
  }
}

function publicMediaUrl(request, key) {
  const origin = new URL(request.url).origin;
  const encoded = key.split('/').map(part => encodeURIComponent(part)).join('/');
  return `${origin}/media/${encoded}`;
}

function safeText(value, max = 500) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.href.slice(0, 2000);
  } catch {
    return safeText(String(value || '').replace(/[?#].*$/, ''), 2000);
  }
}

function sanitizeTraceMessage(value) {
  let text = safeText(value || '', 1600);
  text = text.replace(/https?:\/\/[^\s"'<>]+/gi, raw => safeUrl(raw));
  text = text.replace(/(authorization\s*:\s*bearer\s+)[^\s;,]+/ig, '$1[redacted]');
  text = text.replace(/((?:signature|token|key-pair-id|x-amz-signature|x-amz-credential)=)[^&\s]+/ig, '$1[redacted]');
  text = text.replace(/(cookie\s*[:=]\s*)[^\r\n]+/ig, '$1[redacted]');
  return safeText(text, 500);
}

function sanitizeTrace(trace) {
  if (!Array.isArray(trace)) return [];
  return trace.slice(-160).map((entry, index) => ({
    seq: Number(entry?.seq || index + 1),
    at: safeText(entry?.at || '', 80),
    stage: safeText(entry?.stage || '', 80),
    event: safeText(entry?.event || '', 120),
    status: safeText(entry?.status || '', 80),
    httpStatus: Number(entry?.httpStatus || 0),
    contentType: safeText(entry?.contentType || '', 120),
    url: safeUrl(entry?.url || ''),
    message: sanitizeTraceMessage(entry?.message || ''),
    candidateKind: safeText(entry?.candidateKind || '', 80),
    candidateSource: safeText(entry?.candidateSource || '', 120),
    candidateScore: Number(entry?.candidateScore || 0),
    imageWidth: Number(entry?.imageWidth || 0),
    imageHeight: Number(entry?.imageHeight || 0),
    byteLength: Number(entry?.byteLength || 0),
  }));
}

async function readTampermonkeyReportIndex(env) {
  if (!env?.MEDIA) throw new Error('R2 binding MEDIA is not configured');
  const object = await env.MEDIA.get(TAMPERMONKEY_REPORT_INDEX_KEY);
  if (!object) return { version: 2, updatedAt: 0, items: {} };
  try {
    const value = JSON.parse(await object.text());
    value.items = value?.items && typeof value.items === 'object' && !Array.isArray(value.items) ? value.items : {};
    value.version = Math.max(2, Number(value.version || 1));
    return value;
  } catch {
    return { version: 2, updatedAt: 0, items: {} };
  }
}

function reportAttemptSummary(report, reportKey, attemptId) {
  return {
    attemptId,
    doi: report.doi,
    jobId: report.jobId,
    captureVersion: report.captureVersion,
    controllerRevision: report.controllerRevision,
    mediaNeed: report.mediaNeed,
    final: report.final,
    tocStatus: report.tocStatus,
    figuresDiscovered: report.figuresDiscovered,
    figuresStored: report.figuresStored,
    figureLabels: report.figureLabels,
    fulltextStatus: report.fulltextStatus,
    evidenceLevel: report.evidenceLevel,
    evidenceChars: report.evidenceChars,
    evidenceSections: report.evidenceSections,
    publisher: report.publisher,
    status: report.status,
    reason: report.reason,
    assetType: report.assetType,
    candidateKind: report.candidateKind,
    candidateSource: report.candidateSource,
    articleUrl: report.articleUrl,
    sourceUrl: report.sourceUrl,
    reportKey,
    traceEvents: report.trace.length,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    updatedAt: report.updatedAt,
  };
}

function legacyAttemptSummary(item) {
  if (!item?.reportKey) return null;
  return {
    attemptId: safeText(item.attemptId || ('legacy-' + String(item.updatedAt || 0)), 120),
    doi: safeText(item.doi || '', 300),
    jobId: safeText(item.jobId || '', 120),
    captureVersion: safeText(item.captureVersion || '', 40),
    controllerRevision: safeText(item.controllerRevision || '', 40),
    mediaNeed: safeText(item.mediaNeed || '', 40),
    final: item.final === true,
    tocStatus: safeText(item.tocStatus || '', 80),
    figuresDiscovered: Math.max(0, Number(item.figuresDiscovered || 0)),
    figuresStored: Math.max(0, Number(item.figuresStored || 0)),
    figureLabels: Array.isArray(item.figureLabels) ? item.figureLabels.slice(0,20).map(x => safeText(x,80)).filter(Boolean) : [],
    fulltextStatus: safeText(item.fulltextStatus || '', 40),
    evidenceLevel: safeText(item.evidenceLevel || '', 40),
    evidenceChars: Math.max(0, Number(item.evidenceChars || 0)),
    evidenceSections: Math.max(0, Number(item.evidenceSections || 0)),
    publisher: safeText(item.publisher || '', 80),
    status: safeText(item.status || 'unknown', 80),
    reason: safeText(item.reason || '', 240),
    assetType: safeText(item.assetType || '', 100),
    candidateKind: safeText(item.candidateKind || '', 80),
    candidateSource: safeText(item.candidateSource || '', 120),
    articleUrl: safeUrl(item.articleUrl || ''),
    sourceUrl: safeUrl(item.sourceUrl || ''),
    reportKey: safeText(item.reportKey || '', 500),
    traceEvents: Number(item.traceEvents || 0),
    startedAt: safeText(item.startedAt || '', 80),
    finishedAt: safeText(item.finishedAt || '', 80),
    updatedAt: Number(item.updatedAt || 0),
  };
}

async function readReportObject(env, summary) {
  if (!summary?.reportKey) return null;
  const object = await env.MEDIA.get(summary.reportKey);
  if (!object) return { error: 'tampermonkey_report_object_missing', attempt: summary };
  try {
    return { available: true, attemptId: summary.attemptId || '', ...(JSON.parse(await object.text())) };
  } catch {
    return { error: 'tampermonkey_report_invalid_json', attempt: summary };
  }
}

export async function importTampermonkeyReport(request, env, payload) {
  if (!env?.MEDIA) return { status: 503, body: { error: 'R2 binding MEDIA is not configured.' } };
  const doi = normalizeDoi(payload?.doi);
  if (!doi) return { status: 400, body: { error: 'A valid DOI is required.' } };
  const trace = sanitizeTrace(payload?.trace);
  const now = Date.now();
  const attemptId = String(now) + '-' + crypto.randomUUID().slice(0, 8);
  const report = {
    version: 2,
    source: 'tampermonkey-toc-mainline',
    attemptId,
    doi,
    jobId: safeText(payload?.jobId || '', 120),
    captureVersion: safeText(payload?.captureVersion || '', 40),
    controllerRevision: safeText(payload?.controllerRevision || '', 40),
    mediaNeed: safeText(payload?.mediaNeed || '', 40),
    final: payload?.final === true,
    tocStatus: safeText(payload?.tocStatus || '', 80),
    figuresDiscovered: Math.max(0, Math.min(100, Number(payload?.figuresDiscovered || 0))),
    figuresStored: Math.max(0, Math.min(100, Number(payload?.figuresStored || 0))),
    figureLabels: Array.isArray(payload?.figureLabels) ? payload.figureLabels.slice(0,20).map(x => safeText(x,80)).filter(Boolean) : [],
    fulltextStatus: safeText(payload?.fulltextStatus || '', 40),
    evidenceLevel: safeText(payload?.evidenceLevel || '', 40),
    evidenceChars: Math.max(0, Number(payload?.evidenceChars || 0)),
    evidenceSections: Math.max(0, Number(payload?.evidenceSections || 0)),
    publisher: safeText(payload?.publisher || '', 80),
    status: safeText(payload?.status || 'unknown', 80),
    reason: safeText(payload?.reason || '', 240),
    assetType: safeText(payload?.assetType || '', 100),
    candidateKind: safeText(payload?.candidateKind || '', 80),
    candidateSource: safeText(payload?.candidateSource || '', 120),
    articleUrl: safeUrl(payload?.articleUrl || ''),
    sourceUrl: safeUrl(payload?.sourceUrl || ''),
    pageTitle: safeText(payload?.pageTitle || '', 300),
    queueGeneratedAt: safeText(payload?.queueGeneratedAt || '', 80),
    startedAt: safeText(payload?.startedAt || '', 80),
    finishedAt: safeText(payload?.finishedAt || '', 80),
    trace,
    updatedAt: now,
  };

  const doiHash = await sha256Hex(new TextEncoder().encode(doi));
  const key = TAMPERMONKEY_REPORT_PREFIX + doiHash.slice(0, 32) + '/' + attemptId + '.json';
  await env.MEDIA.put(key, JSON.stringify(report), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' },
    customMetadata: { doi, status: report.status, source: report.source, attemptId },
  });

  const index = await readTampermonkeyReportIndex(env);
  const previous = index.items?.[doi] && typeof index.items[doi] === 'object' ? index.items[doi] : {};
  const attempts = Array.isArray(previous.attempts) ? previous.attempts.slice() : [];
  if (!attempts.length) {
    const legacy = legacyAttemptSummary(previous);
    if (legacy) attempts.push(legacy);
  }
  attempts.push(reportAttemptSummary(report, key, attemptId));
  attempts.sort((a, b) => Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0));
  const recentAttempts = attempts.slice(0, TAMPERMONKEY_REPORT_HISTORY_LIMIT);
  const failureAttempts = recentAttempts.filter(item => item.status === 'failed');
  const successAttempts = recentAttempts.filter(item => item.status === 'success');

  index.items[doi] = {
    doi,
    jobId: report.jobId,
    captureVersion: report.captureVersion,
    controllerRevision: report.controllerRevision,
    mediaNeed: report.mediaNeed,
    final: report.final,
    tocStatus: report.tocStatus,
    figuresDiscovered: report.figuresDiscovered,
    figuresStored: report.figuresStored,
    figureLabels: report.figureLabels,
    fulltextStatus: report.fulltextStatus,
    evidenceLevel: report.evidenceLevel,
    evidenceChars: report.evidenceChars,
    evidenceSections: report.evidenceSections,
    publisher: report.publisher,
    status: report.status,
    reason: report.reason,
    assetType: report.assetType,
    candidateKind: report.candidateKind,
    candidateSource: report.candidateSource,
    articleUrl: report.articleUrl,
    sourceUrl: report.sourceUrl,
    reportKey: key,
    attemptId,
    traceEvents: trace.length,
    attemptCount: Number(previous.attemptCount || attempts.length),
    retainedAttempts: recentAttempts.length,
    failureCount: Number(previous.failureCount || 0) + (report.status === 'failed' ? 1 : 0),
    successCount: Number(previous.successCount || 0) + (report.status === 'success' ? 1 : 0),
    lastFailureReason: report.status === 'failed'
      ? report.reason
      : safeText(previous.lastFailureReason || failureAttempts[0]?.reason || '', 240),
    lastFailureAt: report.status === 'failed'
      ? now
      : Number(previous.lastFailureAt || failureAttempts[0]?.updatedAt || 0),
    attempts: recentAttempts,
    updatedAt: now,
  };
  index.items[doi].attemptCount = Math.max(
    Number(previous.attemptCount || 0) + 1,
    recentAttempts.length,
  );
  index.version = 2;
  index.updatedAt = now;
  const entries = Object.entries(index.items)
    .sort((a, b) => Number(b[1]?.updatedAt || 0) - Number(a[1]?.updatedAt || 0))
    .slice(0, 1000);
  index.items = Object.fromEntries(entries);
  await env.MEDIA.put(TAMPERMONKEY_REPORT_INDEX_KEY, JSON.stringify(index), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' },
  });

  return {
    status: 200,
    body: {
      stored: true,
      doi,
      attemptId,
      status: report.status,
      reason: report.reason,
      traceEvents: trace.length,
      retainedAttempts: recentAttempts.length,
      failureCount: index.items[doi].failureCount,
      successCount: index.items[doi].successCount,
      updatedAt: now,
    },
  };
}

export async function getTampermonkeyReports(request, env) {
  if (!env?.MEDIA) return { status: 503, body: { error: 'R2 binding MEDIA is not configured.' } };
  const url = new URL(request.url);
  const doi = normalizeDoi(url.searchParams.get('doi') || '');
  const statusFilter = safeText(url.searchParams.get('status') || '', 80).toLowerCase();
  const includeHistory = ['1','true','yes'].includes(String(url.searchParams.get('history') || '').toLowerCase());
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 100)));
  const index = await readTampermonkeyReportIndex(env);

  if (doi) {
    const item = index.items?.[doi];
    if (!item?.reportKey) return { status: 404, body: { error: 'tampermonkey_report_not_found', doi } };
    const latest = await readReportObject(env, {
      attemptId: item.attemptId || '',
      reportKey: item.reportKey,
      updatedAt: item.updatedAt,
    });
    if (!includeHistory) {
      if (latest?.error) return { status: 404, body: { ...latest, doi } };
      return { status: 200, body: latest };
    }

    const summaries = (Array.isArray(item.attempts) ? item.attempts : [])
      .filter(attempt => !statusFilter || String(attempt?.status || '').toLowerCase() === statusFilter)
      .slice(0, limit);
    const attempts = await Promise.all(summaries.map(summary => readReportObject(env, summary)));
    return {
      status: 200,
      body: {
        available: true,
        doi,
        latest,
        attemptCount: Number(item.attemptCount || summaries.length),
        retainedAttempts: Number(item.retainedAttempts || summaries.length),
        failureCount: Number(item.failureCount || 0),
        successCount: Number(item.successCount || 0),
        lastFailureReason: safeText(item.lastFailureReason || '', 240),
        lastFailureAt: Number(item.lastFailureAt || 0),
        attempts,
      },
    };
  }

  const latestItems = Object.values(index.items || {})
    .sort((a, b) => Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0));

  if (statusFilter) {
    const attempts = [];
    for (const item of latestItems) {
      const history = Array.isArray(item?.attempts) && item.attempts.length
        ? item.attempts
        : [legacyAttemptSummary(item)].filter(Boolean);
      for (const attempt of history) {
        if (String(attempt?.status || '').toLowerCase() !== statusFilter) continue;
        attempts.push(attempt);
      }
    }
    attempts.sort((a, b) => Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0));
    const selected = attempts.slice(0, limit);
    return {
      status: 200,
      body: {
        version: Number(index.version || 2),
        updatedAt: Number(index.updatedAt || 0),
        mode: 'attempts',
        statusFilter,
        count: selected.length,
        totalMatched: attempts.length,
        items: selected,
      },
    };
  }

  const selected = latestItems.slice(0, limit);
  return {
    status: 200,
    body: {
      version: Number(index.version || 2),
      updatedAt: Number(index.updatedAt || 0),
      mode: 'latest',
      count: selected.length,
      total: latestItems.length,
      items: selected,
    },
  };
}

export async function importStagedArticleFigure(request, env, payload) {
  if (!env?.MEDIA) return { status: 503, body: { error: 'R2 binding MEDIA is not configured.' } };
  const doi = normalizeDoi(payload?.doi);
  if (!doi) return { status: 400, body: { error: 'A valid DOI is required.' } };
  const intakeError = captureIntakeError(payload, doi);
  if (intakeError) return { status: 409, body: { code: intakeError, error: intakeError, doi } };
  if (!captureBelongsToDoi({ articleUrl: payload?.articleUrl, sourceUrl: payload?.sourceUrl }, doi)) {
    return {
      status: 409,
      body: {
        error: 'Staged figure source DOI does not match capture DOI.',
        code: 'staged_media_source_doi_mismatch',
        doi,
      },
    };
  }
  const image = parseImageData(payload?.imageData);
  if (!image) return { status: 400, body: { error: 'A valid imageData payload is required.' } };

  const sourceId = safeText(payload?.id || payload?.label || 'figure', 100)
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'figure';
  const label = safeText(payload?.label || sourceId, 80) || 'Figure';
  const caption = safeText(payload?.caption || '', 600);
  const articleUrl = safeUrl(payload?.articleUrl || '');
  const sourceUrl = safeUrl(payload?.sourceUrl || '');
  const width = Math.max(0, Math.round(Number(payload?.width || 0)));
  const height = Math.max(0, Math.round(Number(payload?.height || 0)));
  const sortOrder = Math.max(0, Math.min(99, Math.round(Number(payload?.order || 0))));
  const hash = await sha256Hex(image.bytes);
  const doiHash = await sha256Hex(new TextEncoder().encode(doi));
  const contentHash = hash.slice(0, 32);
  const key = ARTICLE_FIGURE_STAGE_PREFIX + doiHash.slice(0, 24) + '/' +
    sourceId + '-' + hash.slice(0, 16) + '.' + extensionFor(image.contentType);
  const entry = {doi, id: sourceId, label, caption, articleUrl, sourceUrl, r2Key: key,
    contentHash, contentType: image.contentType, byteLength: image.bytes.byteLength,
    width, height, sortOrder, jobId: payload.jobId, captureVersion: payload.captureVersion,
    pageDoi: payload.pageDoi, mediaGeneration: MEDIA_REBUILD_EPOCH};
  return storeVerifiedStage(request, env, entry, image.bytes, hash, previous =>
    previous.doi === doi && previous.id === sourceId && previous.captureVersion === '6.2.20' &&
    previous.pageDoi === doi && captureBelongsToDoi(previous, doi));
}

export async function getStagedArticleFigures(request, env) {
  if (!env?.MEDIA) return { status: 503, body: { error: 'R2 binding MEDIA is not configured.' } };
  const index = await readArticleFigureStageIndex(env);
  const url = new URL(request.url);
  const doi = normalizeDoi(url.searchParams.get('doi') || '');
  const rawItems = Object.values(index.items || {});
  let items = rawItems.filter(item => {
    const itemDoi = normalizeDoi(item?.doi);
    return Boolean(itemDoi && Number(item?.updatedAt || 0) >= MEDIA_REBUILD_EPOCH && captureBelongsToDoi(item, itemDoi));
  });
  if (doi) items = items.filter(item => normalizeDoi(item?.doi) === doi);
  items.sort((a, b) => Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0));
  return {
    status: 200,
    body: {
      version: Number(index.version || 1),
      updatedAt: Number(index.updatedAt || 0),
      count: items.length,
      invalidFiltered: rawItems.length - items.length,
      items: items.slice(0, 2000).map(item => ({
        ...item,
        imageUrl: item?.r2Key ? publicMediaUrl(request, item.r2Key) : undefined,
      })),
    },
  };
}

function bytesToBase64(bytes) {
  let out = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    out += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + step)));
  }
  return btoa(out);
}

export async function promoteStagedArticleFigures(request, env, payload = {}) {
  if (!env?.MEDIA || !env?.DB) return { status: 503, body: { error: 'Cloudflare media bindings are not configured.' } };
  const index = await readArticleFigureStageIndex(env);
  const requestedDoi = normalizeDoi(payload?.doi || '');
  const limit = Math.max(1, Math.min(100, Number(payload?.limit || 25)));
  const items = Object.entries(index.items || {})
    .filter(([, item]) => Number(item?.updatedAt || 0) >= MEDIA_REBUILD_EPOCH && captureBelongsToDoi(item, item?.doi))
    .filter(([, item]) => !requestedDoi || normalizeDoi(item?.doi) === requestedDoi)
    .sort((a, b) => Number(a[1]?.updatedAt || 0) - Number(b[1]?.updatedAt || 0))
    .slice(0, limit);

  const promoted = [];
  const failed = [];
  let indexChanged = false;

  for (const [identity, item] of items) {
    try {
      const object = item?.r2Key ? await env.MEDIA.get(item.r2Key) : null;
      if (!object) throw new Error('staged_r2_object_missing');
      const bytes = new Uint8Array(await object.arrayBuffer());
      if (bytes.byteLength < 100 || bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('staged_image_size_invalid');
      const contentType = item.contentType || object.httpMetadata?.contentType || 'image/jpeg';
      const imageData = 'data:' + contentType + ';base64,' + bytesToBase64(bytes);
      const result = await importFigure(request, env, {
        doi: item.doi,
        articleUrl: item.articleUrl,
        sourceUrl: item.sourceUrl,
        id: item.id,
        label: item.label,
        caption: item.caption,
        order: Number(item.sortOrder || 0),
        width: Number(item.width || 0) || undefined,
        height: Number(item.height || 0) || undefined,
        imageData,
      });
      if (Number(result?.status || 500) < 200 || Number(result?.status || 500) >= 300) {
        throw new Error('figure_import_status_' + String(result?.status || 0));
      }
      promoted.push({ doi: item.doi, id: item.id, r2Key: item.r2Key });
      delete index.items[identity];
      indexChanged = true;
      try { await env.MEDIA.delete(item.r2Key); } catch {}
    } catch (error) {
      failed.push({
        doi: item?.doi || '',
        id: item?.id || '',
        error: safeText(error instanceof Error ? error.message : error, 240),
      });
    }
  }

  if (indexChanged) {
    index.version = 1;
    index.updatedAt = Date.now();
    await env.MEDIA.put(ARTICLE_FIGURE_STAGE_INDEX_KEY, JSON.stringify(index), {
      httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' },
    });
  }

  return {
    status: failed.length && !promoted.length ? 503 : 200,
    body: {
      requested: items.length,
      promoted: promoted.length,
      failed: failed.length,
      remaining: Object.keys(index.items || {}).length,
      promotedItems: promoted,
      failedItems: failed.slice(0, 20),
      updatedAt: Date.now(),
    },
  };
}

export async function importLocalCapture(request, env, payload) {
  if (!env?.MEDIA) return { status: 503, body: { error: 'R2 binding MEDIA is not configured.' } };
  const doi = normalizeDoi(payload?.doi);
  if (!doi) return { status: 400, body: { error: 'A valid DOI is required.' } };
  const intakeError = captureIntakeError(payload, doi);
  if (intakeError) return { status: 409, body: { code: intakeError, error: intakeError, doi } };
  const kind = String(payload?.kind || '').toLowerCase();
  if (!['official', 'figure1'].includes(kind)) return { status: 400, body: { error: 'kind must be official or figure1.' } };
  if (!captureBelongsToDoi({ articleUrl: payload?.articleUrl, sourceUrl: payload?.sourceUrl }, doi)) {
    return { status: 409, body: { error: 'Local capture source DOI does not match capture DOI.', code: 'local_media_source_doi_mismatch' } };
  }
  const image = parseImageData(payload?.imageData);
  if (!image) return { status: 400, body: { error: 'A valid imageData payload is required.' } };

  const hash = await sha256Hex(image.bytes);
  const doiHash = await sha256Hex(new TextEncoder().encode(doi));
  const key = `${IMAGE_PREFIX}${doiHash.slice(0, 24)}-${kind}-${hash.slice(0, 16)}.${extensionFor(image.contentType)}`;
  await env.MEDIA.put(key, image.bytes, {
    httpMetadata: { contentType: image.contentType, cacheControl: 'public, max-age=31536000, immutable' },
    customMetadata: { doi, kind, contentHash: hash.slice(0, 32), source: safeText(payload?.source || 'windows-toc-collector', 80) },
  });

  const index = await readIndex(env);
  const now = Date.now();
  const identity = `${doi}|${kind}`;
  index.items[identity] = {
    doi,
    jobId: payload.jobId,
    captureVersion: payload.captureVersion,
    pageDoi: payload.pageDoi,
    mediaGeneration: MEDIA_REBUILD_EPOCH,
    kind,
    r2Key: key,
    contentHash: hash.slice(0, 32),
    contentType: image.contentType,
    byteLength: image.bytes.byteLength,
    articleUrl: typeof payload?.articleUrl === 'string' ? payload.articleUrl.slice(0, 2000) : '',
    caption: typeof payload?.caption === 'string' ? payload.caption.slice(0, 600) : '',
    sourceUrl: typeof payload?.sourceUrl === 'string' ? payload.sourceUrl.slice(0, 2000) : '',
    source: safeText(payload?.source || 'windows-toc-collector', 80),
    capturedAt: typeof payload?.capturedAt === 'string' ? payload.capturedAt.slice(0, 80) : '',
    updatedAt: now,
  };
  index.version = 1;
  index.updatedAt = now;
  await env.MEDIA.put(INDEX_KEY, JSON.stringify(index), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' },
  });

  let productionToc = null;
  let productionFallback = null;
  const imageData = 'data:' + image.contentType + ';base64,' + bytesToBase64(image.bytes);
  if (kind === 'official') {
    const promoted = await importToc(request, env, {
      doi,
      articleUrl: payload.articleUrl,
      sourceUrl: payload.sourceUrl,
      imageData,
      replace: true,
    });
    if (Number(promoted?.status || 500) < 200 || Number(promoted?.status || 500) >= 300 || promoted?.body?.available !== true) {
      return {
        status: 503,
        body: {
          stored: true,
          localStored: true,
          productionTocStored: false,
          doi,
          kind,
          contentHash: hash.slice(0, 32),
          error: 'official_toc_production_promotion_failed',
          promotionStatus: Number(promoted?.status || 0),
          updatedAt: now,
        },
      };
    }
    productionToc = promoted.body;
  } else if (/^10\.(?:1038|1126)\//.test(doi) && image.contentType !== 'image/svg+xml') {
    const promoted = await importPrimaryVisual(request, env, {
      doi,
      kind: 'figure1',
      imageData,
      source: 'tampermonkey_nature_science_figure1_rescue',
      sourceUrl: payload.sourceUrl,
      articleUrl: payload.articleUrl,
      caption: payload.caption || 'Figure 1 fallback',
      confidence: 95,
      replaceSameKind: true,
      width: Number(payload?.width || 0) || undefined,
      height: Number(payload?.height || 0) || undefined,
      retrievedAt: now,
    });
    if (Number(promoted?.status || 500) < 200 || Number(promoted?.status || 500) >= 300 ||
        !(promoted?.body?.imported === true || promoted?.body?.importState === 'known_good_preserved')) {
      return {
        status: 503,
        body: {
          stored: true,
          localStored: true,
          productionFallbackStored: false,
          doi,
          kind,
          contentHash: hash.slice(0, 32),
          error: 'figure1_primary_visual_promotion_failed',
          promotionStatus: Number(promoted?.status || 0),
          updatedAt: now,
        },
      };
    }
    productionFallback = promoted.body;
  }

  return {
    status: 200,
    body: {
      stored: true,
      localStored: true,
      productionTocStored: kind === 'official' ? true : false,
      productionFallbackStored: kind === 'figure1' && /^10\.(?:1038|1126)\//.test(doi) ? Boolean(productionFallback) : false,
      doi,
      kind,
      contentHash: hash.slice(0, 32),
      imageUrl: kind === 'official'
        ? String(productionToc?.imageUrl || '')
        : productionFallback
          ? publicMediaUrl(request, productionFallback?.r2Key || key)
          : publicMediaUrl(request, key),
      productionToc: kind === 'official' ? {
        available: true,
        imageUrl: String(productionToc?.imageUrl || ''),
        reason: String(productionToc?.reason || ''),
        cacheState: String(productionToc?.cacheState || ''),
      } : undefined,
      productionFallback: productionFallback || undefined,
      updatedAt: now,
    },
  };
}

export async function promoteStagedNatureSciencePrimaryVisuals(request, env, options = {}) {
  if (!env?.MEDIA || !env?.DB) return { status: 503, body: { error: 'Cloudflare media bindings are not configured.' } };
  const limit = Math.max(1, Math.min(30, Number(options?.limit || 20)));
  const offset = Math.max(0, Math.floor(Number(options?.offset || 0)));
  const scanLimit = Math.max(1, Math.min(40, Math.floor(Number(options?.scanLimit || 24))));
  const index = await readArticleFigureStageIndex(env);
  const bestByDoi = new Map();

  for (const item of Object.values(index.items || {})) {
    const doi = normalizeDoi(item?.doi);
    if (!doi || !/^10\.(?:1038|1126)\//.test(doi) ||
        Number(item?.updatedAt || 0) < MEDIA_REBUILD_EPOCH ||
        !captureBelongsToDoi(item, doi) || !item?.r2Key) continue;
    const figureOne = String(item?.label || '').trim() === 'Figure 1'
      || String(item?.id || '').toLowerCase() === 'figure-1'
      || /^(?:fig(?:ure)?\.?\s*0*1)(?:\b|[:.)-])/i.test(String(item?.label || ''));
    if (!figureOne) continue;
    const prior = bestByDoi.get(doi);
    const area = Math.max(0, Number(item?.width || 0)) * Math.max(0, Number(item?.height || 0));
    const priorArea = prior ? Math.max(0, Number(prior.width || 0)) * Math.max(0, Number(prior.height || 0)) : -1;
    if (!prior || area > priorArea || (area === priorArea && Number(item?.updatedAt || 0) > Number(prior?.updatedAt || 0))) {
      bestByDoi.set(doi, item);
    }
  }

  const candidates = [...bestByDoi.values()].sort((a, b) => {
    const aDoi = normalizeDoi(a?.doi) || '';
    const bDoi = normalizeDoi(b?.doi) || '';
    const familyDelta = (aDoi.startsWith('10.1038/') ? 0 : 1) - (bDoi.startsWith('10.1038/') ? 0 : 1);
    return familyDelta || Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0);
  });

  let promoted = 0;
  let alreadyCurrent = 0;
  let failed = 0;
  let scanned = 0;
  const failures = [];
  const slice = candidates.slice(offset, offset + scanLimit);

  for (const item of slice) {
    if (promoted >= limit) break;
    scanned += 1;
    const doi = normalizeDoi(item.doi);
    try {
      const [officialToc, existingPrimary] = await Promise.all([
        env.DB.prepare(
          'SELECT available, r2_key, article_url, updated_at FROM toc_assets WHERE doi = ? LIMIT 1'
        ).bind(doi).first(),
        env.DB.prepare(
          'SELECT kind, r2_key, source_url, article_url, confidence, retrieved_at, updated_at FROM primary_visual_assets WHERE doi = ? LIMIT 1'
        ).bind(doi).first(),
      ]);

      const officialMetadataCurrent = Boolean(
        officialToc && Number(officialToc.available) === 1 && officialToc.r2_key &&
        Number(officialToc.updated_at || 0) >= MEDIA_REBUILD_EPOCH &&
        captureBelongsToDoi({ articleUrl: officialToc.article_url }, doi)
      );
      const primaryMetadataCurrent = Boolean(
        existingPrimary && ['official_visual','figure1'].includes(String(existingPrimary.kind || '')) &&
        existingPrimary.r2_key &&
        Number(existingPrimary.updated_at || existingPrimary.retrieved_at || 0) >= MEDIA_REBUILD_EPOCH &&
        captureBelongsToDoi({ articleUrl: existingPrimary.article_url, sourceUrl: existingPrimary.source_url }, doi)
      );
      const [officialObject, primaryObject] = await Promise.all([
        officialMetadataCurrent ? env.MEDIA.head(officialToc.r2_key).catch(() => null) : Promise.resolve(null),
        primaryMetadataCurrent ? env.MEDIA.head(existingPrimary.r2_key).catch(() => null) : Promise.resolve(null),
      ]);
      if (officialObject || primaryObject) {
        alreadyCurrent += 1;
        continue;
      }

      // Stale pre-recovery or missing-object primary rows must not block a clean
      // Figure 1 fallback. loadMediaRows already quarantines them by epoch; remove
      // only the unusable primary metadata before rebuilding from preserved staging.
      if (existingPrimary?.r2_key) {
        await env.DB.batch([
          env.DB.prepare('DELETE FROM primary_visual_variants WHERE doi = ?').bind(doi),
          env.DB.prepare('DELETE FROM primary_visual_assets WHERE doi = ?').bind(doi),
        ]);
      }

      const object = await env.MEDIA.get(item.r2Key);
      if (!object) throw new Error('staged_figure1_r2_object_missing');
      const bytes = new Uint8Array(await object.arrayBuffer());
      if (bytes.byteLength < 128 || bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('staged_figure1_image_size_invalid');
      const contentType = String(item.contentType || object.httpMetadata?.contentType || 'image/jpeg').toLowerCase().replace('image/jpg','image/jpeg');
      if (!/^image\/(?:png|jpeg|gif|webp)$/.test(contentType)) throw new Error('staged_figure1_primary_visual_requires_raster');
      const result = await importPrimaryVisual(request, env, {
        doi,
        kind: 'figure1',
        imageData: 'data:' + contentType + ';base64,' + bytesToBase64(bytes),
        source: 'tampermonkey_staged_figure1_rescue',
        sourceUrl: item.sourceUrl,
        articleUrl: item.articleUrl,
        caption: item.caption || item.label || 'Figure 1 fallback',
        confidence: 95,
        replaceSameKind: true,
        width: Number(item.width || 0) || undefined,
        height: Number(item.height || 0) || undefined,
        retrievedAt: Number(item.updatedAt || Date.now()),
      });
      if (Number(result?.status || 500) < 200 || Number(result?.status || 500) >= 300 ||
          !(result?.body?.imported === true || result?.body?.importState === 'known_good_preserved')) {
        throw new Error('staged_figure1_primary_visual_import_failed_' + String(result?.status || 0));
      }
      promoted += 1;
    } catch (error) {
      failed += 1;
      failures.push({ doi, error: safeText(error instanceof Error ? error.message : error, 200) });
    }
  }

  const nextOffset = Math.min(candidates.length, offset + scanned);
  return {
    status: 200,
    body: {
      ok: true,
      promoted,
      alreadyCurrent,
      failed,
      scanned,
      candidates: candidates.length,
      limit,
      offset,
      scanLimit,
      nextOffset,
      hasMore: nextOffset < candidates.length,
      source: 'staged_figure1_only',
      stagingPreserved: true,
      failures: failures.slice(0, 20),
      updatedAt: Date.now(),
    },
  };
}

export async function promoteOfficialLocalTocs(request, env, options = {}) {
  if (!env?.MEDIA || !env?.DB) return { status: 503, body: { error: 'Cloudflare media bindings are not configured.' } };
  const limit = Math.max(1, Math.min(30, Number(options?.limit || 12)));
  const offset = Math.max(0, Math.floor(Number(options?.offset || 0)));
  const scanLimit = Math.max(1, Math.min(40, Math.floor(Number(options?.scanLimit || 24))));
  const index = await readIndex(env);
  const candidates = Object.values(index.items || {})
    .filter(item => {
      const doi = normalizeDoi(item?.doi);
      return Boolean(
        doi &&
        String(item?.kind || '') === 'official' &&
        Number(item?.updatedAt || 0) >= MEDIA_REBUILD_EPOCH &&
        captureBelongsToDoi(item, doi) &&
        item?.r2Key
      );
    })
    .sort((a, b) => {
      const aDoi = normalizeDoi(a?.doi) || '';
      const bDoi = normalizeDoi(b?.doi) || '';
      const aAngew = /^10\.1002\/anie\./.test(aDoi);
      const bAngew = /^10\.1002\/anie\./.test(bDoi);
      if (aAngew !== bAngew) return aAngew ? -1 : 1;
      return Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0);
    });

  let promoted = 0;
  let alreadyCurrent = 0;
  let failed = 0;
  let scanned = 0;
  const failures = [];
  const slice = candidates.slice(offset, offset + scanLimit);

  for (const item of slice) {
    if (promoted >= limit) break;
    scanned += 1;
    const doi = normalizeDoi(item.doi);
    const current = await env.DB.prepare(
      'SELECT available, r2_key, updated_at FROM toc_assets WHERE doi = ? LIMIT 1'
    ).bind(doi).first();
    if (current && Number(current.available) === 1 && current.r2_key && Number(current.updated_at || 0) >= MEDIA_REBUILD_EPOCH) {
      alreadyCurrent += 1;
      continue;
    }

    try {
      const object = await env.MEDIA.get(item.r2Key);
      if (!object) throw new Error('local_toc_r2_object_missing');
      const bytes = new Uint8Array(await object.arrayBuffer());
      if (bytes.byteLength < 100 || bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('local_toc_image_size_invalid');
      const contentType = item.contentType || object.httpMetadata?.contentType || 'image/jpeg';
      const imageData = 'data:' + contentType + ';base64,' + bytesToBase64(bytes);
      const result = await importToc(request, env, {
        doi,
        articleUrl: item.articleUrl,
        sourceUrl: item.sourceUrl,
        imageData,
        replace: true,
      });
      if (Number(result?.status || 500) < 200 || Number(result?.status || 500) >= 300 || result?.body?.available !== true) {
        const detail = safeText(result?.body?.code || result?.body?.error || '', 120);
        throw new Error('local_toc_production_import_failed_' + String(result?.status || 0) + (detail ? ':' + detail : ''));
      }
      promoted += 1;
    } catch (error) {
      failed += 1;
      failures.push({ doi, error: safeText(error instanceof Error ? error.message : error, 200) });
    }
  }

  const nextOffset = Math.min(candidates.length, offset + scanned);
  const hasMore = nextOffset < candidates.length;
  return {
    status: 200,
    body: {
      ok: true,
      promoted,
      alreadyCurrent,
      failed,
      scanned,
      candidates: candidates.length,
      limit,
      offset,
      scanLimit,
      nextOffset,
      hasMore,
      priority: 'angew_first_then_newest',
      failures: failures.slice(0, 20),
      updatedAt: Date.now(),
    },
  };
}

export async function getLocalCaptureIndex(request, env) {
  const index = await readIndex(env);
  const rawItems = Object.values(index.items || {});
  const validItems = rawItems.filter(item => {
    const doi = normalizeDoi(item?.doi);
    return Boolean(doi && Number(item?.updatedAt || 0) >= MEDIA_REBUILD_EPOCH && captureBelongsToDoi(item, doi));
  });
  const items = validItems.map(item => ({
    ...item,
    imageUrl: item?.r2Key ? publicMediaUrl(request, item.r2Key) : undefined,
  }));
  return {
    status: 200,
    body: {
      version: Number(index.version || 1),
      updatedAt: Number(index.updatedAt || 0),
      count: items.length,
      invalidFiltered: rawItems.length - validItems.length,
      items,
    },
  };
}


export async function purgeCrossDoiLocalMedia(env, payload = {}) {
  if (!env?.MEDIA) return { status: 503, body: { error: 'R2 binding MEDIA is not configured.' } };
  const dryRun = payload?.dryRun === true;
  const [stageIndex, localIndex] = await Promise.all([
    readArticleFigureStageIndex(env),
    readIndex(env),
  ]);

  const badStage = Object.entries(stageIndex.items || {}).filter(([, item]) => {
    const doi = normalizeDoi(item?.doi);
    return !doi || !captureBelongsToDoi(item, doi);
  });
  const badLocal = Object.entries(localIndex.items || {}).filter(([, item]) => {
    const doi = normalizeDoi(item?.doi);
    return !doi || !captureBelongsToDoi(item, doi);
  });
  const affectedDois = [...new Set([...badStage, ...badLocal]
    .map(([, item]) => normalizeDoi(item?.doi))
    .filter(Boolean))];

  if (!dryRun) {
    for (const [identity, item] of badStage) {
      if (item?.r2Key) {
        try { await env.MEDIA.delete(item.r2Key); } catch {}
      }
      delete stageIndex.items[identity];
    }
    for (const [identity, item] of badLocal) {
      if (item?.r2Key) {
        try { await env.MEDIA.delete(item.r2Key); } catch {}
      }
      delete localIndex.items[identity];
    }
    if (badStage.length) {
      stageIndex.updatedAt = Date.now();
      await env.MEDIA.put(ARTICLE_FIGURE_STAGE_INDEX_KEY, JSON.stringify(stageIndex), {
        httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' },
      });
    }
    if (badLocal.length) {
      localIndex.updatedAt = Date.now();
      await env.MEDIA.put(INDEX_KEY, JSON.stringify(localIndex), {
        httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' },
      });
    }
  }

  return {
    status: 200,
    body: {
      dryRun,
      affectedDois,
      summary: {
        stagedRows: badStage.length,
        localCaptureRows: badLocal.length,
        affectedDois: affectedDois.length,
      },
    },
  };
}

export async function importLocalDiagnostics(request, env, payload) {
  if (!env?.MEDIA) return { status: 503, body: { error: 'R2 binding MEDIA is not configured.' } };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { status: 400, body: { error: 'A diagnostic object is required.' } };
  const text = JSON.stringify({
    ...payload,
    uploadedAt: Date.now(),
    source: safeText(payload?.source || 'windows-toc-collector', 120),
  });
  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength > MAX_DIAGNOSTIC_BYTES) return { status: 413, body: { error: 'Diagnostic payload is too large.' } };
  await env.MEDIA.put(DIAGNOSTIC_KEY, bytes, {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' },
  });
  return {
    status: 200,
    body: {
      stored: true,
      byteLength: bytes.byteLength,
      total: Number(payload?.total || 0),
      retry: Number(payload?.retry || 0),
      officialSaved: Number(payload?.officialSaved || 0),
      figure1Saved: Number(payload?.figure1Saved || 0),
      uploadedAt: Date.now(),
    },
  };
}

export async function getLocalDiagnostics(env) {
  if (!env?.MEDIA) return { status: 503, body: { error: 'R2 binding MEDIA is not configured.' } };
  const object = await env.MEDIA.get(DIAGNOSTIC_KEY);
  if (!object) return { status: 200, body: { available: false } };
  try {
    return { status: 200, body: { available: true, ...(JSON.parse(await object.text())) } };
  } catch {
    return { status: 500, body: { error: 'Stored diagnostic JSON is invalid.' } };
  }
}
