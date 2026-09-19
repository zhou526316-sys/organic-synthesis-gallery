import { normalizeDoi } from './media.js';

const INDEX_KEY = 'local-captures/index.json';
const IMAGE_PREFIX = 'local-captures/images/';
const DIAGNOSTIC_KEY = 'local-captures/diagnostics/latest.json';
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
    customMetadata: { doi, kind, contentHash: hash.slice(0, 32), source: 'windows-toc-collector' },
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
    source: 'windows-toc-collector',
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
    source: 'windows-toc-collector',
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
