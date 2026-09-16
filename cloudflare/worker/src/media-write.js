import { getArticleFigures, getToc, normalizeDoi } from './media.js';

const MAX_IMAGE_BYTES = 4_000_000;
const ARTICLE_HOSTS = [
  'pubs.acs.org',
  'onlinelibrary.wiley.com',
  'nature.com',
  'www.nature.com',
  'science.org',
  'www.science.org',
  'pubs.rsc.org',
  'doi.org',
  'dx.doi.org',
];
const IMAGE_HOSTS = [
  'pubs.acs.org',
  'acs.figshare.com',
  'silverchair-cdn.com',
  'onlinelibrary.wiley.com',
  'wiley.com',
  'media.springernature.com',
  'nature.com',
  'www.nature.com',
  'science.org',
  'www.science.org',
  'pubs.rsc.org',
];

function hostAllowed(host, allowed) {
  const lower = host.toLowerCase();
  return allowed.some(item => lower === item || lower.endsWith(`.${item}`));
}

function articleUrlForDoi(doi) {
  if (doi.startsWith('10.1021/')) return `https://pubs.acs.org/doi/${doi}`;
  if (doi.startsWith('10.1002/')) return `https://onlinelibrary.wiley.com/doi/${doi}`;
  if (doi.startsWith('10.1038/')) return `https://www.nature.com/articles/${doi.split('/')[1]}`;
  if (doi.startsWith('10.1126/')) return `https://www.science.org/doi/${doi}`;
  return `https://doi.org/${doi}`;
}

function normalizeArticleUrl(value, doi) {
  if (typeof value !== 'string' || !value.trim()) return articleUrlForDoi(doi);
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return articleUrlForDoi(doi);
    if (!hostAllowed(url.hostname, ARTICLE_HOSTS)) return articleUrlForDoi(doi);
    return url.href;
  } catch {
    return articleUrlForDoi(doi);
  }
}

function normalizeImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || !hostAllowed(url.hostname, IMAGE_HOSTS)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function bytesFromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function parseImageData(value) {
  if (typeof value !== 'string') return null;
  const match = /^data:(image\/(?:png|jpe?g|gif|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(value);
  if (!match) return null;
  const contentType = match[1].toLowerCase().replace('image/jpg', 'image/jpeg');
  const base64 = match[2].replace(/\s+/g, '');
  const bytes = bytesFromBase64(base64);
  if (bytes.byteLength < 100 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
  return { contentType, bytes };
}

function imageDimensions(bytes, contentType) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 10) return null;

  if (contentType === 'image/png' && bytes.byteLength >= 24) {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (signature.every((value, index) => bytes[index] === value)) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const width = view.getUint32(16, false);
      const height = view.getUint32(20, false);
      if (width > 0 && height > 0) return { width, height };
    }
  }

  if (contentType === 'image/gif' && bytes.byteLength >= 10) {
    const header = String.fromCharCode(...bytes.subarray(0, 6));
    if (header === 'GIF87a' || header === 'GIF89a') {
      const width = bytes[6] | (bytes[7] << 8);
      const height = bytes[8] | (bytes[9] << 8);
      if (width > 0 && height > 0) return { width, height };
    }
  }

  if (contentType === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    while (offset + 9 < bytes.byteLength) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (length < 2 || offset + 2 + length > bytes.byteLength) break;
      if (sofMarkers.has(marker) && length >= 7) {
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        if (width > 0 && height > 0) return { width, height };
      }
      offset += 2 + length;
    }
  }

  return null;
}

function extensionForContentType(contentType) {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/gif') return 'gif';
  return 'jpg';
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function doiToken(doi) {
  return (await sha256Hex(new TextEncoder().encode(doi.toLowerCase()))).slice(0, 32);
}

function semanticKey(label, sourceId) {
  const normalized = String(label || '')
    .toLowerCase()
    .replace(/^fig\.?\s*/, 'figure ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (/^(?:figure|scheme|chart)-[a-z]?\d+[a-z]?$|^(?:scope|mechanism|optimization)$/.test(normalized)) return normalized;
  return String(sourceId || 'figure').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'figure';
}

function safeSourceId(value) {
  return String(value || 'figure').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'figure';
}

async function fetchPublisherImage(imageUrl, articleUrl) {
  const response = await fetch(imageUrl, {
    redirect: 'follow',
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: articleUrl,
      'User-Agent': 'Mozilla/5.0',
    },
  });
  if (!response.ok) return null;
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase().replace('image/jpg', 'image/jpeg');
  if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(contentType)) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 100 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
  return { contentType, bytes };
}

async function currentToc(request, env, doi) {
  const url = new URL('/api/toc', request.url);
  url.searchParams.set('doi', doi);
  return (await getToc(new Request(url), env)).body;
}

async function currentFigures(request, env, doi) {
  const url = new URL('/api/article-figures', request.url);
  url.searchParams.set('doi', doi);
  return (await getArticleFigures(new Request(url), env)).body;
}

export async function importToc(request, env, payload) {
  if (!env?.DB || !env?.MEDIA) return { status: 503, body: { error: 'Cloudflare media bindings are not configured.' } };
  const doi = normalizeDoi(payload?.doi);
  if (!doi) return { status: 400, body: { error: 'A valid DOI is required.' } };

  const existing = await env.DB.prepare('SELECT available, r2_key FROM toc_assets WHERE doi = ?').bind(doi).first();
  if (existing && Number(existing.available) === 1 && existing.r2_key && payload?.replace !== true) {
    return { status: 200, body: { ...(await currentToc(request, env, doi)), imported: false, importState: 'already_cached' } };
  }

  const articleUrl = normalizeArticleUrl(payload?.articleUrl, doi);
  let image = parseImageData(payload?.imageData);
  if (!image) {
    const imageUrl = normalizeImageUrl(payload?.imageUrl);
    if (!imageUrl) return { status: 400, body: { error: 'A valid TOC imageData or publisher imageUrl is required.' } };
    image = await fetchPublisherImage(imageUrl, articleUrl);
  }
  if (!image) return { status: 422, body: { error: 'The publisher image could not be downloaded into the gallery cache.' } };

  const [token, fullHash] = await Promise.all([doiToken(doi), sha256Hex(image.bytes)]);
  const contentHash = fullHash.slice(0, 32);
  const r2Key = `toc-cache/images/${token}.${extensionForContentType(image.contentType)}`;
  const now = Date.now();
  await env.MEDIA.put(r2Key, image.bytes, { httpMetadata: { contentType: image.contentType } });
  await env.DB.prepare(
    `INSERT INTO toc_assets (doi, article_url, r2_key, content_hash, reason, available, checked_at, updated_at)
     VALUES (?, ?, ?, ?, 'imported', 1, ?, ?)
     ON CONFLICT(doi) DO UPDATE SET
       article_url = excluded.article_url,
       r2_key = excluded.r2_key,
       content_hash = excluded.content_hash,
       reason = excluded.reason,
       available = 1,
       checked_at = excluded.checked_at,
       updated_at = excluded.updated_at`
  ).bind(doi, articleUrl, r2Key, contentHash, now, now).run();

  return { status: 200, body: { ...(await currentToc(request, env, doi)), imported: true, importState: 'stored' } };
}

export async function quarantineToc(request, env, payload) {
  const doi = normalizeDoi(payload?.doi);
  if (!doi) return { status: 400, body: { error: 'A valid DOI is required.' } };
  const reason = typeof payload?.reason === 'string' && payload.reason.trim()
    ? payload.reason.trim().slice(0, 120)
    : 'quarantined';
  const now = Date.now();
  const result = await env.DB.prepare(
    `UPDATE toc_assets SET available = 0, reason = ?, checked_at = ?, updated_at = ? WHERE doi = ?`
  ).bind(reason, now, now, doi).run();
  return { status: 200, body: { quarantined: Number(result?.meta?.changes || 0) > 0, doi, reason } };
}

export async function importFigure(request, env, payload) {
  if (!env?.DB || !env?.MEDIA) return { status: 503, body: { error: 'Cloudflare media bindings are not configured.' } };
  const doi = normalizeDoi(payload?.doi);
  if (!doi) return { status: 400, body: { error: 'A valid DOI is required.' } };
  const image = parseImageData(payload?.imageData);
  if (!image) return { status: 400, body: { error: 'A valid figure imageData is required.' } };

  const sourceId = safeSourceId(payload?.id || `figure-${Date.now()}`);
  const label = typeof payload?.label === 'string' && payload.label.trim() ? payload.label.trim().slice(0, 80) : 'Figure';
  const key = semanticKey(label, sourceId);
  const caption = typeof payload?.caption === 'string' && payload.caption.trim() ? payload.caption.trim().slice(0, 600) : null;
  const articleUrl = normalizeArticleUrl(payload?.articleUrl, doi);
  const detected = imageDimensions(image.bytes, image.contentType);
  const width = Number.isFinite(payload?.width) && Number(payload.width) > 0
    ? Math.max(1, Math.round(payload.width))
    : detected?.width || null;
  const height = Number.isFinite(payload?.height) && Number(payload.height) > 0
    ? Math.max(1, Math.round(payload.height))
    : detected?.height || null;
  const sortOrder = Number.isFinite(payload?.order) ? Math.max(0, Math.min(99, Math.round(payload.order))) : 0;
  const [token, fullHash] = await Promise.all([doiToken(doi), sha256Hex(image.bytes)]);
  const contentHash = fullHash.slice(0, 32);

  const duplicate = await env.DB.prepare(
    'SELECT semantic_key FROM figure_assets WHERE doi = ? AND content_hash = ? LIMIT 1'
  ).bind(doi, contentHash).first();
  if (!duplicate || duplicate.semantic_key === key) {
    const r2Key = `figure-cache/images/${token}/${sourceId}.${extensionForContentType(image.contentType)}`;
    const now = Date.now();
    await env.MEDIA.put(r2Key, image.bytes, { httpMetadata: { contentType: image.contentType } });
    await env.DB.prepare(
      `INSERT INTO figure_assets
        (doi, semantic_key, source_id, label, caption, article_url, r2_key, content_hash, width, height, sort_order, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(doi, semantic_key) DO UPDATE SET
         source_id = excluded.source_id,
         label = excluded.label,
         caption = excluded.caption,
         article_url = excluded.article_url,
         r2_key = excluded.r2_key,
         content_hash = excluded.content_hash,
         width = excluded.width,
         height = excluded.height,
         sort_order = excluded.sort_order,
         updated_at = excluded.updated_at
       WHERE
         COALESCE(figure_assets.width, 0) = 0
         OR COALESCE(figure_assets.height, 0) = 0
         OR COALESCE(excluded.width, 0) * COALESCE(excluded.height, 0) >=
            COALESCE(figure_assets.width, 0) * COALESCE(figure_assets.height, 0)`
    ).bind(doi, key, sourceId, label, caption, articleUrl, r2Key, contentHash, width, height, sortOrder, now).run();
  }

  return { status: 200, body: { ...(await currentFigures(request, env, doi)), imported: true } };
}

export async function resetFigures(request, env, payload) {
  const doi = normalizeDoi(payload?.doi);
  if (!doi) return { status: 400, body: { error: 'A valid DOI is required.' } };
  const rows = await env.DB.prepare('SELECT r2_key FROM figure_assets WHERE doi = ?').bind(doi).all();
  const keys = (rows?.results || []).map(row => row.r2_key).filter(Boolean);
  if (keys.length && env?.MEDIA) await env.MEDIA.delete(keys);
  const result = await env.DB.prepare('DELETE FROM figure_assets WHERE doi = ?').bind(doi).run();
  return { status: 200, body: { reset: true, doi, deleted: Number(result?.meta?.changes || 0) } };
}
