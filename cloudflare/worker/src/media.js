import { primaryVisualResponse } from './primary-visual.js';
import { publisherForDoi } from '../../../shared/publishers.js';

const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/i;
const DOI_LIMIT = 1200;
const QUERY_CHUNK = 80;
// Media written before the 2.2.17 contamination recovery cutover is quarantined.
const MEDIA_REBUILD_EPOCH = 1790077800000;

export function normalizeDoi(value) {
  if (typeof value !== 'string') return null;
  let cleaned = value.trim();
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    return null;
  }
  cleaned = cleaned
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return DOI_PATTERN.test(cleaned) ? cleaned.toLowerCase() : null;
}

function decodedIdentityText(value) {
  let decoded = String(value || '');
  for (let attempt = 0; attempt < 2; attempt += 1) {
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
  const decoded = decodedIdentityText(value);
  const patterns = [
    /10\.1021\/[a-z0-9._-]+/ig,
    /10\.1002\/[a-z0-9._-]+/ig,
    /10\.1038\/[a-z0-9._-]+/ig,
    /10\.1126\/[a-z0-9._-]+/ig,
    /10\.1039\/[a-z0-9._-]+/ig,
    /10\.1016\/[a-z0-9._()-]+/ig,
    /10\.31635\/[a-z0-9._-]+/ig,
  ];
  return [...new Set(patterns.flatMap(pattern => (decoded.match(pattern) || []).map(normalizeDoi).filter(Boolean)))];
}

function articleUrlMatchesDoi(value, doi) {
  const embedded = embeddedKnownDois(value);
  return embedded.length === 0 || embedded.includes(String(doi || '').toLowerCase());
}

function mediaUrl(request, key) {
  if (!key) return undefined;
  const url = new URL(request.url);
  const encoded = key.split('/').map(part => encodeURIComponent(part)).join('/');
  return `${url.origin}/media/${encoded}`;
}

function semanticPriority(key) {
  const normalized = String(key || '').toLowerCase();
  const numbered = /^(figure|scheme|chart)-(\d+)/.exec(normalized);
  if (numbered) {
    const number = Number(numbered[2]);
    return number === 1 ? 0 : 10 + number;
  }
  if (normalized === 'scope') return 50;
  if (normalized === 'mechanism') return 51;
  if (normalized === 'optimization') return 52;
  return 80;
}

function bestFigure(rows) {
  return [...rows].sort((a, b) => {
    const priority = semanticPriority(a.semantic_key) - semanticPriority(b.semantic_key);
    if (priority) return priority;
    const pixelsA = Number(a.width || 0) * Number(a.height || 0);
    const pixelsB = Number(b.width || 0) * Number(b.height || 0);
    if (pixelsA !== pixelsB) return pixelsB - pixelsA;
    return Number(a.sort_order || 0) - Number(b.sort_order || 0);
  })[0] || null;
}

function figureOne(rows) {
  return rows.find(row => String(row.semantic_key || '').toLowerCase() === 'figure-1') || null;
}

function figureQuality(row) {
  const width = Math.max(0, Number(row?.width || 0));
  const height = Math.max(0, Number(row?.height || 0));
  if (!width || !height) return 'unknown';
  const maxSide = Math.max(width, height);
  const minSide = Math.min(width, height);
  const pixels = width * height;
  if (maxSide >= 900 && minSide >= 180 && pixels >= 220000) return 'high';
  if (maxSide >= 600 && minSide >= 140 && pixels >= 120000) return 'usable';
  return 'low';
}

function figureQualityCounts(rows) {
  const counts = { high: 0, usable: 0, low: 0, unknown: 0 };
  for (const row of rows || []) counts[figureQuality(row)] += 1;
  return {
    highQualityFigureCount: counts.high,
    usableFigureCount: counts.high + counts.usable,
    lowQualityFigureCount: counts.low,
    unknownQualityFigureCount: counts.unknown,
  };
}

function tocResponse(request, doi, toc, figures, primary, variants = []) {
  const primaryResponse = primaryVisualResponse(request, doi, primary, variants);
  if (primaryResponse.available && primaryResponse.kind === 'official_visual') {
    return {
      available: true,
      doi,
      articleUrl: primaryResponse.articleUrl,
      imageUrl: primaryResponse.imageUrl,
      contentHash: primaryResponse.contentHash,
      reason: 'primary_official_visual',
      primary: primaryResponse,
      cacheHit: true,
      cacheState: 'hit',
    };
  }
  if (toc && Number(toc.available) === 1 && toc.r2_key) {
    return {
      available: true,
      doi,
      articleUrl: toc.article_url || undefined,
      imageUrl: mediaUrl(request, toc.r2_key),
      contentHash: toc.content_hash || undefined,
      reason: toc.reason || 'cached',
      cacheHit: true,
      cacheState: 'hit',
    };
  }

  if (primaryResponse.available) {
    const reason = primaryResponse.kind === 'figure1'
      ? 'figure1_fallback'
      : primaryResponse.kind === 'pdf_primary'
        ? 'pdf_primary_fallback'
        : primaryResponse.kind === 'article_figure'
          ? 'article_figure_fallback'
          : 'open_fallback';
    return {
      available: true,
      doi,
      articleUrl: primaryResponse.articleUrl,
      imageUrl: primaryResponse.imageUrl,
      contentHash: primaryResponse.contentHash,
      reason,
      primary: primaryResponse,
      cacheHit: true,
      cacheState: 'hit',
    };
  }

  const fallback = bestFigure(figures);
  if (fallback?.r2_key) {
    return {
      available: true,
      doi,
      articleUrl: fallback.article_url || undefined,
      imageUrl: mediaUrl(request, fallback.r2_key),
      contentHash: fallback.content_hash || undefined,
      reason: String(fallback.semantic_key || '').toLowerCase() === 'figure-1'
        ? 'figure1_fallback'
        : `figure_fallback:${fallback.label}`,
      cacheHit: true,
      cacheState: 'hit',
    };
  }

  return {
    available: false,
    doi,
    reason: toc?.reason || 'cache_miss',
    cacheHit: true,
    cacheState: 'miss',
  };
}

function figureResponse(request, doi, rows) {
  const selected = [...rows]
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || Number(b.updated_at || 0) - Number(a.updated_at || 0))
    .slice(0, 24)
    .map(row => ({
      id: row.source_id,
      label: row.label,
      caption: row.caption || undefined,
      imageUrl: mediaUrl(request, row.r2_key),
      order: Number(row.sort_order || 0),
    }));

  return {
    available: selected.length > 0,
    doi,
    articleUrl: rows.find(row => row.article_url)?.article_url || undefined,
    figures: selected,
  };
}

async function allRows(statement) {
  const result = await statement.all();
  return Array.isArray(result?.results) ? result.results : [];
}

function isLegacySchemaError(error) {
  const message = String(error?.message || error || '');
  return /no such table|no such column|has no column named|SQLITE_ERROR/i.test(message);
}

async function allRowsOptional(statement, label = 'optional_query') {
  try {
    return await allRows(statement);
  } catch (error) {
    if (!isLegacySchemaError(error)) throw error;
    console.warn('MEDIA_LEGACY_SCHEMA_FALLBACK', JSON.stringify({ label, message: String(error?.message || error) }));
    return [];
  }
}

async function queryByDois(env, sqlPrefix, dois, { optional = false, label = 'query' } = {}) {
  const rows = [];
  for (let offset = 0; offset < dois.length; offset += QUERY_CHUNK) {
    const chunk = dois.slice(offset, offset + QUERY_CHUNK);
    if (!chunk.length) continue;
    const placeholders = chunk.map(() => '?').join(',');
    const statement = env.DB.prepare(`${sqlPrefix} (${placeholders})`).bind(...chunk);
    rows.push(...(optional ? await allRowsOptional(statement, label) : await allRows(statement)));
  }
  return rows;
}

async function loadMediaRows(env, rawDois) {
  if (!env?.DB) throw new Error('D1 binding DB is not configured');
  const dois = [...new Set(rawDois.map(normalizeDoi).filter(Boolean))].slice(0, DOI_LIMIT);
  if (!dois.length) return { dois, tocByDoi: new Map(), figuresByDoi: new Map(), primaryByDoi: new Map(), primaryVariantsByDoi: new Map(), duplicateHashes: new Set() };

  const [tocRows, figureRows, primaryRows, primaryVariantRows, duplicateRows] = await Promise.all([
    queryByDois(
      env,
      'SELECT doi, article_url, r2_key, content_hash, reason, available, checked_at, updated_at FROM toc_assets WHERE doi IN',
      dois
    ),
    queryByDois(
      env,
      'SELECT doi, semantic_key, source_id, label, caption, article_url, r2_key, content_hash, width, height, sort_order, updated_at FROM figure_assets WHERE doi IN',
      dois
    ),
    queryByDois(
      env,
      'SELECT doi, kind, source, source_url, article_url, r2_key, content_hash, caption, confidence, page_number, bbox_json, retrieved_at, updated_at FROM primary_visual_assets WHERE doi IN',
      dois,
      { optional: true, label: 'primary_visual_assets' }
    ),
    queryByDois(
      env,
      'SELECT doi, role, r2_key, content_hash, width, height, byte_length, updated_at FROM primary_visual_variants WHERE doi IN',
      dois,
      { optional: true, label: 'primary_visual_variants' }
    ),
    allRowsOptional(env.DB.prepare("SELECT content_hash, COUNT(*) AS owners FROM toc_assets WHERE available = 1 AND updated_at >= ? AND content_hash IS NOT NULL AND content_hash <> '' GROUP BY content_hash HAVING COUNT(*) > 1").bind(MEDIA_REBUILD_EPOCH), 'duplicate_toc_hashes'),
  ]);

  tocRows.splice(0, tocRows.length, ...tocRows.filter(row => Number(row.updated_at || 0) >= MEDIA_REBUILD_EPOCH));
  figureRows.splice(0, figureRows.length, ...figureRows.filter(row => Number(row.updated_at || 0) >= MEDIA_REBUILD_EPOCH));
  primaryRows.splice(0, primaryRows.length, ...primaryRows.filter(row => Number(row.updated_at || row.retrieved_at || 0) >= MEDIA_REBUILD_EPOCH));
  primaryVariantRows.splice(0, primaryVariantRows.length, ...primaryVariantRows.filter(row => Number(row.updated_at || 0) >= MEDIA_REBUILD_EPOCH));

  const tocByDoi = new Map();
  for (const row of tocRows) {
    const doi = String(row.doi).toLowerCase();
    if (!articleUrlMatchesDoi(row.article_url, doi)) continue;
    tocByDoi.set(doi, row);
  }
  const figuresByDoi = new Map();
  for (const row of figureRows) {
    const doi = String(row.doi).toLowerCase();
    if (!articleUrlMatchesDoi(row.article_url, doi)) continue;
    const group = figuresByDoi.get(doi) || [];
    group.push(row);
    figuresByDoi.set(doi, group);
  }
  const primaryByDoi = new Map();
  for (const row of primaryRows) {
    const doi = String(row.doi).toLowerCase();
    if (!articleUrlMatchesDoi(row.article_url, doi)) continue;
    primaryByDoi.set(doi, row);
  }
  const primaryVariantsByDoi = new Map();
  for (const row of primaryVariantRows) {
    const doi = String(row.doi).toLowerCase();
    const group = primaryVariantsByDoi.get(doi) || [];
    group.push(row);
    primaryVariantsByDoi.set(doi, group);
  }
  const duplicateHashes = new Set(duplicateRows.map(row => row.content_hash).filter(Boolean));
  return { dois, tocByDoi, figuresByDoi, primaryByDoi, primaryVariantsByDoi, duplicateHashes };
}

function inventoryItem(doi, toc, figures, primary, duplicateHashes) {
  const tocStored = Boolean(toc && Number(toc.available) === 1 && toc.r2_key);
  const one = figureOne(figures);
  const fallback = bestFigure(figures);
  const nonFigureOneMatch = Boolean(
    tocStored &&
    toc.content_hash &&
    figures.some(item => item.content_hash === toc.content_hash && String(item.semantic_key || '').toLowerCase() !== 'figure-1')
  );
  const suspiciousToc = Boolean(nonFigureOneMatch || (toc?.content_hash && duplicateHashes.has(toc.content_hash)));
  const trueToc = tocStored && !suspiciousToc;
  const primaryKind = primary?.kind || '';
  const largeSource = primaryKind === 'official_visual'
    ? 'toc'
    : trueToc
      ? 'toc'
      : primaryKind === 'figure1'
        ? 'figure1'
        : primaryKind
          ? 'figure'
          : fallback
            ? one
              ? 'figure1'
              : 'figure'
            : 'none';
  const figureCount = figures.length;
  const qualityCounts = figureQualityCounts(figures);
  const status = trueToc && figureCount > 0
    ? 'complete'
    : trueToc
      ? 'large_only'
      : figureCount > 0
        ? 'figures_only'
        : 'missing';

  return {
    doi,
    status,
    largeSource,
    tocStored: trueToc,
    tocRawStored: tocStored,
    tocMissing: !trueToc,
    tocReason: toc?.reason || (tocStored ? 'cached' : 'cache_miss'),
    figureCount,
    ...qualityCounts,
    figureOneStored: Boolean(one),
    fallbackLabel: fallback?.label,
    suspiciousToc,
    primaryKind: primaryKind || undefined,
    primarySource: primary?.source || undefined,
    primaryConfidence: primary ? Number(primary.confidence || 0) : undefined,
  };
}

async function ensureRepairRows(env, dois) {
  if (!dois.length) return;
  const now = Date.now();
  const jobStatements = dois.map(doi => env.DB.prepare(
    `INSERT INTO media_jobs
      (doi, publisher, mode, state, priority, attempts, last_attempt_at, next_retry_at, lease_owner, lease_expires_at, last_failure_reason, visual_kind, visual_source, confidence, created_at, updated_at)
     VALUES (?, ?, 'coverage', 'pending', 0, 0, 0, 0, NULL, 0, NULL, NULL, NULL, 0, ?, ?)
     ON CONFLICT(doi) DO NOTHING`
  ).bind(doi, publisherForDoi(doi), now, now));
  for (let offset = 0; offset < jobStatements.length; offset += 80) {
    await env.DB.batch(jobStatements.slice(offset, offset + 80));
  }
  const statements = dois.map(doi => env.DB.prepare(
    `INSERT INTO media_repair_state
      (doi, repair_version, attempts, last_attempt_at, next_retry_at, reported_priority, updated_at)
     VALUES (?, 1, 0, 0, 0, 0, ?)
     ON CONFLICT(doi) DO NOTHING`
  ).bind(doi, now));
  for (let offset = 0; offset < statements.length; offset += 80) {
    await env.DB.batch(statements.slice(offset, offset + 80));
  }
}

export async function serveMediaObject(request, env) {
  if (!env?.MEDIA) return new Response('R2 binding MEDIA is not configured', { status: 503 });
  const prefix = '/media/';
  const path = new URL(request.url).pathname;
  if (!path.startsWith(prefix)) return new Response('Not found', { status: 404 });
  const key = path.slice(prefix.length).split('/').map(part => decodeURIComponent(part)).join('/');
  if (!key || key.includes('..')) return new Response('Invalid media key', { status: 400 });
  if (key.startsWith('private/')) return new Response('Not found', { status: 404 });
  const object = await env.MEDIA.get(key);
  if (!object) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=86400, stale-while-revalidate=604800');
  return new Response(object.body, { headers });
}

export async function getToc(request, env) {
  const doi = normalizeDoi(new URL(request.url).searchParams.get('doi'));
  if (!doi) return { status: 400, body: { error: 'A valid DOI is required.' } };
  const media = await loadMediaRows(env, [doi]);
  return { status: 200, body: tocResponse(request, doi, media.tocByDoi.get(doi), media.figuresByDoi.get(doi) || [], media.primaryByDoi.get(doi), media.primaryVariantsByDoi.get(doi) || []) };
}

export async function getArticleFigures(request, env) {
  const doi = normalizeDoi(new URL(request.url).searchParams.get('doi'));
  if (!doi) return { status: 400, body: { error: 'A valid DOI is required.' } };
  const media = await loadMediaRows(env, [doi]);
  return { status: 200, body: figureResponse(request, doi, media.figuresByDoi.get(doi) || []) };
}

export async function mediaBatch(request, env, payload) {
  const input = Array.isArray(payload?.dois) ? payload.dois : [];
  const startedAt = Date.now();
  const media = await loadMediaRows(env, input);
  const items = media.dois.map(doi => ({
    doi,
    toc: tocResponse(request, doi, media.tocByDoi.get(doi), media.figuresByDoi.get(doi) || [], media.primaryByDoi.get(doi), media.primaryVariantsByDoi.get(doi) || []),
    primary: primaryVisualResponse(request, doi, media.primaryByDoi.get(doi), media.primaryVariantsByDoi.get(doi) || []),
    figures: figureResponse(request, doi, media.figuresByDoi.get(doi) || []),
  }));
  return { status: 200, body: { items, elapsedMs: Date.now() - startedAt } };
}

export async function mediaInventory(request, env, payload) {
  const input = Array.isArray(payload?.dois) ? payload.dois : [];
  const media = await loadMediaRows(env, input);
  if (payload?.readOnly !== true) await ensureRepairRows(env, media.dois);
  const items = media.dois.map(doi => inventoryItem(
    doi,
    media.tocByDoi.get(doi),
    media.figuresByDoi.get(doi) || [],
    media.primaryByDoi.get(doi),
    media.duplicateHashes
  ));
  const summary = {
    total: items.length,
    complete: items.filter(item => item.status === 'complete').length,
    largeOnly: items.filter(item => item.status === 'large_only').length,
    figuresOnly: items.filter(item => item.status === 'figures_only').length,
    missing: items.filter(item => item.status === 'missing').length,
    tocMissing: items.filter(item => item.tocMissing).length,
    suspiciousToc: items.filter(item => item.suspiciousToc).length,
    withToc: items.filter(item => item.tocStored).length,
    withFigure1: items.filter(item => item.figureOneStored).length,
  };
  return { status: 200, body: { generatedAt: Date.now(), summary, items } };
}

export async function bridgeQueue(request, env) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') === 'upgrade' ? 'upgrade' : 'coverage';
  const now = Date.now();
  let rows;
  try {
    rows = await allRows(env.DB.prepare(
      'SELECT doi, attempts, last_attempt_at, next_retry_at, last_root_cause, last_outcome, reported_priority FROM media_repair_state WHERE next_retry_at <= ? ORDER BY reported_priority DESC, next_retry_at ASC, attempts ASC LIMIT 1200'
    ).bind(now));
  } catch (error) {
    if (!isLegacySchemaError(error)) throw error;
    console.warn('MEDIA_LEGACY_SCHEMA_FALLBACK', JSON.stringify({ label: 'bridge_queue', message: String(error?.message || error) }));
    const legacy = await allRowsOptional(env.DB.prepare(
      'SELECT doi, attempts, last_attempt_at, next_retry_at FROM media_repair_state WHERE next_retry_at <= ? ORDER BY next_retry_at ASC, attempts ASC LIMIT 1200'
    ).bind(now), 'bridge_queue_legacy');
    rows = legacy.map(row => ({ ...row, last_root_cause: '', last_outcome: '', reported_priority: 0 }));
  }
  const dois = rows.map(row => row.doi).filter(Boolean);
  const media = await loadMediaRows(env, dois);
  const stateByDoi = new Map(rows.map(row => [String(row.doi).toLowerCase(), row]));
  const items = media.dois
    .map(doi => {
      const inventory = inventoryItem(doi, media.tocByDoi.get(doi), media.figuresByDoi.get(doi) || [], media.primaryByDoi.get(doi), media.duplicateHashes);
      const repair = stateByDoi.get(doi) || {};
      return {
        ...inventory,
        attempts: Number(repair.attempts || 0),
        lastRootCause: repair.last_root_cause || '',
        lastOutcome: repair.last_outcome || '',
        nextRetryAt: Number(repair.next_retry_at || 0),
        reportedPriority: Number(repair.reported_priority || 0) === 1,
      };
    })
    .filter(item => {
      if (item.suspiciousToc) return true;
      if (mode === 'upgrade') return item.tocMissing && item.largeSource !== 'none';
      return item.largeSource === 'none';
    })
    .sort((a, b) =>
      Number(b.reportedPriority) - Number(a.reportedPriority) ||
      Number(a.largeSource !== 'none') - Number(b.largeSource !== 'none') ||
      Number(b.suspiciousToc) - Number(a.suspiciousToc) ||
      a.attempts - b.attempts
    );
  return { status: 200, body: { updatedAt: now, mode, count: items.length, items } };
}

export async function repairStatus(request, env) {
  let rows;
  try {
    rows = await allRows(env.DB.prepare(
      'SELECT doi, attempts, last_attempt_at, next_retry_at, last_root_cause, last_outcome, reported_priority, updated_at FROM media_repair_state ORDER BY updated_at DESC LIMIT 1200'
    ));
  } catch (error) {
    if (!isLegacySchemaError(error)) throw error;
    console.warn('MEDIA_LEGACY_SCHEMA_FALLBACK', JSON.stringify({ label: 'repair_status', message: String(error?.message || error) }));
    const legacy = await allRowsOptional(env.DB.prepare(
      'SELECT doi, attempts, last_attempt_at, next_retry_at, updated_at FROM media_repair_state ORDER BY updated_at DESC LIMIT 1200'
    ), 'repair_status_legacy');
    rows = legacy.map(row => ({ ...row, last_root_cause: '', last_outcome: '', reported_priority: 0 }));
  }
  return {
    status: 200,
    body: {
      updatedAt: Date.now(),
      runs: 0,
      bridgeQueueCount: rows.filter(row => Number(row.next_retry_at || 0) <= Date.now()).length,
      items: rows,
    },
  };
}
