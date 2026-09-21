import { normalizeDoi } from './media.js';

const INDEX_KEY = 'local-captures/index.json';
const IMAGE_PREFIX = 'local-captures/images/';
const DIAGNOSTIC_KEY = 'local-captures/diagnostics/latest.json';
const TAMPERMONKEY_REPORT_INDEX_KEY = 'local-captures/tampermonkey/report-index.json';
const TAMPERMONKEY_REPORT_PREFIX = 'local-captures/tampermonkey/reports/';
const TAMPERMONKEY_REPORT_HISTORY_LIMIT = 12;
const MAX_IMAGE_BYTES = 4_000_000;
const MAX_DIAGNOSTIC_BYTES = 1_500_000;

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

export async function importLocalCapture(request, env, payload) {
  if (!env?.MEDIA) return { status: 503, body: { error: 'R2 binding MEDIA is not configured.' } };
  const doi = normalizeDoi(payload?.doi);
  if (!doi) return { status: 400, body: { error: 'A valid DOI is required.' } };
  const kind = String(payload?.kind || '').toLowerCase();
  if (!['official', 'figure1'].includes(kind)) return { status: 400, body: { error: 'kind must be official or figure1.' } };
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

  return {
    status: 200,
    body: {
      stored: true,
      doi,
      kind,
      contentHash: hash.slice(0, 32),
      imageUrl: publicMediaUrl(request, key),
      updatedAt: now,
    },
  };
}

export async function getLocalCaptureIndex(request, env) {
  const index = await readIndex(env);
  const items = Object.values(index.items || {}).map(item => ({
    ...item,
    imageUrl: item?.r2Key ? publicMediaUrl(request, item.r2Key) : undefined,
  }));
  return {
    status: 200,
    body: {
      version: Number(index.version || 1),
      updatedAt: Number(index.updatedAt || 0),
      count: items.length,
      items,
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
