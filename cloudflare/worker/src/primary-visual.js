import { isExcludedDoi } from '../../../shared/literature-policy.js';
import { normalizeDoi } from './media.js';

const MAX_IMAGE_BYTES = 4_000_000;
export const PRIMARY_VISUAL_RANK = Object.freeze({
  official_visual: 500,
  figure1: 400,
  pdf_primary: 300,
  article_figure: 200,
  open_fallback: 100,
});

const LABELS = Object.freeze({
  official_visual: 'Graphical Abstract / TOC',
  figure1: 'Figure 1',
  pdf_primary: 'PDF Primary Visual',
  article_figure: 'Article Figure',
  open_fallback: 'Open-version Figure',
});

function normalizeKind(value) {
  return Object.prototype.hasOwnProperty.call(PRIMARY_VISUAL_RANK, value) ? value : null;
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
  let bytes;
  try { bytes = bytesFromBase64(match[2].replace(/\s+/g, '')); } catch { return null; }
  if (bytes.byteLength < 128 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
  const signatures = {
    'image/png': () => [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n),
    'image/jpeg': () => bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
    'image/gif': () => new TextDecoder().decode(bytes.slice(0, 6)).match(/^GIF8[79]a$/),
    'image/webp': () => new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP',
  };
  if (!signatures[contentType]?.()) return null;
  return { contentType, bytes };
}

function extension(contentType) {
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
  return (await sha256Hex(new TextEncoder().encode(doi))).slice(0, 32);
}

export function primaryVisualShouldReplace(existing, incoming) {
  if (!PRIMARY_VISUAL_RANK[incoming?.kind]) return false;
  if (!existing) return true;
  const oldRank = PRIMARY_VISUAL_RANK[existing.kind] || 0;
  const newRank = PRIMARY_VISUAL_RANK[incoming.kind] || 0;
  if (newRank !== oldRank) return newRank > oldRank;
  return Number(incoming.confidence || 0) > Number(existing.confidence || 0);
}

export async function importPrimaryVisual(request, env, payload) {
  if (!env?.DB || !env?.MEDIA) return { status: 503, body: { error: 'Cloudflare media bindings are not configured.' } };
  const doi = normalizeDoi(payload?.doi);
  const kind = normalizeKind(payload?.kind);
  if (isExcludedDoi(doi)) return { status: 422, body: { error: 'excluded_doi' } };
  if (!doi || !kind) return { status: 400, body: { error: 'A valid DOI and primary visual kind are required.' } };

  const image = parseImageData(payload?.imageData);
  if (!image) return { status: 400, body: { error: 'A valid primary visual imageData is required.' } };
  const thumbnail = payload?.thumbnailData ? parseImageData(payload.thumbnailData) : null;

  const confidence = Math.max(0, Math.min(100, Math.round(Number(payload?.confidence) || 0)));
  const source = String(payload?.source || 'unknown').trim().slice(0, 120) || 'unknown';
  const sourceUrl = typeof payload?.sourceUrl === 'string' ? payload.sourceUrl.trim().slice(0, 1600) : null;
  const articleUrl = typeof payload?.articleUrl === 'string' ? payload.articleUrl.trim().slice(0, 1600) : null;
  const caption = typeof payload?.caption === 'string' ? payload.caption.trim().slice(0, 1200) : null;
  const pageNumber = Number.isFinite(Number(payload?.page)) && Number(payload.page) > 0 ? Math.round(Number(payload.page)) : null;
  const bbox = payload?.bbox && typeof payload.bbox === 'object' ? JSON.stringify(payload.bbox).slice(0, 1200) : null;
  const retrievedAt = Number.isFinite(Number(payload?.retrievedAt)) ? Number(payload.retrievedAt) : Date.now();
  const width = Number.isFinite(Number(payload?.width)) && Number(payload.width) > 0 ? Math.round(Number(payload.width)) : null;
  const height = Number.isFinite(Number(payload?.height)) && Number(payload.height) > 0 ? Math.round(Number(payload.height)) : null;
  const thumbnailWidth = Number.isFinite(Number(payload?.thumbnailWidth)) && Number(payload.thumbnailWidth) > 0 ? Math.round(Number(payload.thumbnailWidth)) : null;
  const thumbnailHeight = Number.isFinite(Number(payload?.thumbnailHeight)) && Number(payload.thumbnailHeight) > 0 ? Math.round(Number(payload.thumbnailHeight)) : null;

  if (!width || !height || width < 200 || height < 120 || width * height < 60000 || confidence < 70) {
    return { status: 422, body: { error: 'primary_visual_below_quality_threshold' } };
  }
  const [existing, oldVariantsResult] = await Promise.all([
    env.DB.prepare(
      'SELECT kind, confidence, r2_key, content_hash, source, source_url, retrieved_at FROM primary_visual_assets WHERE doi = ?'
    ).bind(doi).first(),
    env.DB.prepare(
      'SELECT role, r2_key, width, height FROM primary_visual_variants WHERE doi = ?'
    ).bind(doi).all(),
  ]);
  const oldVariants = oldVariantsResult?.results || [];
  const oldMaster = oldVariants.find(row => row.role === 'master' && row.r2_key === existing?.r2_key);
  const resolutionDowngrade = existing?.kind === kind && oldMaster?.width * oldMaster?.height > width * height;
  if (resolutionDowngrade || !primaryVisualShouldReplace(existing, { kind, confidence })) {
    return {
      status: 200,
      body: {
        imported: false,
        importState: 'known_good_preserved',
        doi,
        existing: existing ? { kind: existing.kind, source: existing.source, confidence: Number(existing.confidence || 0) } : null,
      },
    };
  }

  const [token, fullHash] = await Promise.all([doiToken(doi), sha256Hex(image.bytes)]);
  const contentHash = fullHash.slice(0, 32);
  const r2Key = `primary-visual/images/${token}/${kind}-${contentHash}.${extension(image.contentType)}`;
  const thumbKey = thumbnail ? `primary-visual/images/${token}/${kind}-${contentHash}-thumb.${extension(thumbnail.contentType)}` : null;
  const now = Date.now();
  await env.MEDIA.put(r2Key, image.bytes, { httpMetadata: { contentType: image.contentType } });
  if (thumbnail && thumbKey) {
    await env.MEDIA.put(thumbKey, thumbnail.bytes, { httpMetadata: { contentType: thumbnail.contentType } });
  }

  const writeResult = await env.DB.prepare(
    `INSERT INTO primary_visual_assets
      (doi, kind, source, source_url, article_url, r2_key, content_hash, caption, confidence, page_number, bbox_json, retrieved_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(doi) DO UPDATE SET
       kind = excluded.kind,
       source = excluded.source,
       source_url = excluded.source_url,
       article_url = excluded.article_url,
       r2_key = excluded.r2_key,
       content_hash = excluded.content_hash,
       caption = excluded.caption,
       confidence = excluded.confidence,
       page_number = excluded.page_number,
       bbox_json = excluded.bbox_json,
       retrieved_at = excluded.retrieved_at,
       updated_at = excluded.updated_at
     WHERE (CASE excluded.kind WHEN 'official_visual' THEN 500 WHEN 'figure1' THEN 400 WHEN 'pdf_primary' THEN 300 WHEN 'article_figure' THEN 200 ELSE 100 END) >
       (CASE primary_visual_assets.kind WHEN 'official_visual' THEN 500 WHEN 'figure1' THEN 400 WHEN 'pdf_primary' THEN 300 WHEN 'article_figure' THEN 200 ELSE 100 END)
       OR (excluded.kind = primary_visual_assets.kind AND excluded.confidence > primary_visual_assets.confidence)`
  ).bind(doi, kind, source, sourceUrl, articleUrl, r2Key, contentHash, caption, confidence, pageNumber, bbox, retrievedAt, now).run();

  if (!writeResult.meta?.changes) return { status: 200, body: { doi, imported: false, importState: 'known_good_preserved' } };

  const variantStatements = [
    env.DB.prepare(
      `INSERT INTO primary_visual_variants
        (doi, role, r2_key, content_hash, width, height, byte_length, updated_at)
       SELECT ?, 'master', ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM primary_visual_assets WHERE doi = ? AND r2_key = ?)
       ON CONFLICT(doi, role) DO UPDATE SET
         r2_key = excluded.r2_key,
         content_hash = excluded.content_hash,
         width = excluded.width,
         height = excluded.height,
         byte_length = excluded.byte_length,
         updated_at = excluded.updated_at`
    ).bind(doi, r2Key, contentHash, width, height, image.bytes.byteLength, now, doi, r2Key),
  ];
  if (thumbnail && thumbKey) {
    variantStatements.push(env.DB.prepare(
      `INSERT INTO primary_visual_variants
        (doi, role, r2_key, content_hash, width, height, byte_length, updated_at)
       SELECT ?, 'thumbnail', ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM primary_visual_assets WHERE doi = ? AND r2_key = ?)
       ON CONFLICT(doi, role) DO UPDATE SET
         r2_key = excluded.r2_key,
         content_hash = excluded.content_hash,
         width = excluded.width,
         height = excluded.height,
         byte_length = excluded.byte_length,
         updated_at = excluded.updated_at`
    ).bind(doi, thumbKey, await sha256Hex(thumbnail.bytes).then(value => value.slice(0, 32)), thumbnailWidth, thumbnailHeight, thumbnail.bytes.byteLength, now, doi, r2Key));
  } else {
    variantStatements.push(env.DB.prepare(
      "DELETE FROM primary_visual_variants WHERE doi = ? AND role = 'thumbnail' AND EXISTS (SELECT 1 FROM primary_visual_assets WHERE doi = ? AND r2_key = ?)"
    ).bind(doi, doi, r2Key));
  }
  await env.DB.batch(variantStatements);

  // Retain immutable prior objects: concurrent readers and known-good media must survive upgrades.

  return {
    status: 200,
    body: {
      imported: true,
      importState: existing ? 'upgraded' : 'stored',
      doi,
      kind,
      label: LABELS[kind],
      source,
      sourceUrl: sourceUrl || undefined,
      confidence,
      retrievedAt,
      width: width || undefined,
      height: height || undefined,
      thumbnailStored: Boolean(thumbnail && thumbKey),
    },
  };
}

export function primaryVisualResponse(request, doi, row, variants = []) {
  if (!row?.r2_key) return { available: false, doi };
  const url = new URL(request.url);
  const mediaUrl = key => `${url.origin}/media/${String(key).split('/').map(part => encodeURIComponent(part)).join('/')}`;
  const variantMap = new Map((variants || []).filter(item => item.role === 'master'
    ? item.r2_key === row.r2_key
    : String(item.r2_key).includes(`${row.kind}-${row.content_hash}-`)).map(item => [String(item.role || ''), item]));
  const master = variantMap.get('master');
  const thumbnail = variantMap.get('thumbnail');
  const preview = variantMap.get('preview');
  let bbox;
  try { bbox = row.bbox_json ? JSON.parse(row.bbox_json) : undefined; } catch { bbox = undefined; }
  return {
    available: true,
    doi,
    kind: row.kind,
    label: LABELS[row.kind] || 'Primary Visual',
    source: row.source,
    sourceUrl: row.source_url || undefined,
    articleUrl: row.article_url || undefined,
    imageUrl: mediaUrl(row.r2_key),
    masterImageUrl: mediaUrl(row.r2_key),
    thumbnailImageUrl: thumbnail?.r2_key ? mediaUrl(thumbnail.r2_key) : undefined,
    previewImageUrl: preview?.r2_key ? mediaUrl(preview.r2_key) : undefined,
    width: master?.width ? Number(master.width) : undefined,
    height: master?.height ? Number(master.height) : undefined,
    thumbnailWidth: thumbnail?.width ? Number(thumbnail.width) : undefined,
    thumbnailHeight: thumbnail?.height ? Number(thumbnail.height) : undefined,
    contentHash: row.content_hash || undefined,
    caption: row.caption || undefined,
    confidence: Number(row.confidence || 0),
    page: row.page_number ? Number(row.page_number) : undefined,
    bbox,
    retrievedAt: Number(row.retrieved_at || 0),
  };
}
