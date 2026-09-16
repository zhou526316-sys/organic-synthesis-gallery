import { gunzipSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve as resolvePath } from 'node:path';

const SOURCE_SITE = process.env.SOURCE_SITE || 'https://organic-synthesis-literature-gallery-ase43k.v2.appdeploy.ai';
const SOURCE_API = process.env.SOURCE_API || 'https://api-v2.appdeploy.ai/app/organic-synthesis-literature-gallery-ase43k';
const TARGET_API_BASE = (process.env.TARGET_API_BASE || 'https://organic-synthesis-gallery.zhou526316.workers.dev').replace(/\/$/, '');
const TARGET_WRITE_TOKEN = process.env.TARGET_WRITE_TOKEN || '';
const OUTPUT = resolvePath(process.env.MEDIA_MANIFEST_OUTPUT || 'public/media-index.json');
const CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.MIGRATION_CONCURRENCY || 2)));
const MAX_IMAGE_BYTES = 2_000_000;
const INVENTORY_BATCH = 120;
const MEDIA_BATCH = 100;

if (!TARGET_WRITE_TOKEN) throw new Error('TARGET_WRITE_TOKEN is required.');

function normalizeDoi(value) {
  if (typeof value !== 'string') return null;
  let cleaned = value.trim();
  try { cleaned = decodeURIComponent(cleaned); } catch { return null; }
  cleaned = cleaned
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '')
    .toLowerCase();
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned : null;
}

function doiFromRecord(record) {
  const direct = normalizeDoi(record?.doi);
  if (direct) return direct;
  if (typeof record?.url !== 'string') return null;
  try {
    const url = new URL(record.url);
    if (/^(?:dx\.)?doi\.org$/i.test(url.hostname)) return normalizeDoi(url.pathname.slice(1));
    const doiPath = url.pathname.match(/\/doi\/(?:abs\/|full\/|pdf\/|epdf\/)?(10\..+)$/i);
    if (doiPath) return normalizeDoi(doiPath[1]);
    const nature = url.pathname.match(/^\/articles\/(s\d+-\d+-\d+[a-z0-9-]*)$/i);
    if (/nature\.com$/i.test(url.hostname) && nature) return normalizeDoi(`10.1038/${nature[1]}`);
  } catch {}
  return null;
}

async function fetchRetry(url, init = {}, attempts = 3) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(25_000) });
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      last = new Error(`HTTP ${response.status}: ${url}`);
    } catch (error) {
      last = error;
    }
    await new Promise(resolve => setTimeout(resolve, 400 * attempt));
  }
  throw last || new Error(`Request failed: ${url}`);
}

async function jsonRequest(url, init = {}) {
  const response = await fetchRetry(url, init, 3);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

const sourceGet = path => jsonRequest(`${SOURCE_API}${path}`);
const sourcePost = (path, body) => jsonRequest(`${SOURCE_API}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const targetPost = (path, body) => jsonRequest(`${TARGET_API_BASE}${path}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TARGET_WRITE_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const targetGet = path => jsonRequest(`${TARGET_API_BASE}${path}`);

async function optionalJson(url) {
  try { return await jsonRequest(url); } catch { return null; }
}

async function loadSnapshot() {
  const encodedResponse = await fetchRetry(`${SOURCE_SITE}/papers.gz.b64`);
  if (!encodedResponse.ok) throw new Error(`papers.gz.b64 HTTP ${encodedResponse.status}`);
  const base = JSON.parse(gunzipSync(Buffer.from((await encodedResponse.text()).trim(), 'base64')).toString('utf8'));
  const files = ['total-synthesis.json', 'manual-supplement.json', 'final-audit-supplement.json'];
  const supplements = await Promise.all(files.map(file => optionalJson(`${SOURCE_SITE}/${file}`)));
  const dynamic = await sourceGet('/api/literature/supplement').catch(() => ({ papers: [] }));
  const records = [
    ...(Array.isArray(base) ? base : []),
    ...supplements.flatMap(item => Array.isArray(item?.papers) ? item.papers : []),
    ...(Array.isArray(dynamic?.papers) ? dynamic.papers : []),
  ];
  return { records, dynamic };
}

async function resolveMissingDois(records) {
  const requests = records.flatMap((record, index) => {
    if (doiFromRecord(record)) return [];
    const title = typeof record?.title === 'string' ? record.title.trim() : '';
    if (title.length < 8) return [];
    return [{ key: String(index), title, journal: record?.journal || '', date: record?.date || '', url: record?.url || undefined }];
  });
  const resolved = new Map();
  for (let offset = 0; offset < requests.length; offset += 40) {
    try {
      const payload = await sourcePost('/api/paper-titles/resolve', { papers: requests.slice(offset, offset + 40) });
      for (const item of payload?.papers || []) {
        const doi = normalizeDoi(item?.doi);
        if (doi && typeof item?.key === 'string') resolved.set(Number(item.key), doi);
      }
    } catch (error) {
      console.warn('DOI recovery batch failed:', error instanceof Error ? error.message : String(error));
    }
  }
  for (const [index, doi] of resolved) if (records[index] && !records[index].doi) records[index].doi = doi;
  return resolved;
}

async function migrateMetadata(snapshot) {
  if (Array.isArray(snapshot.dynamic?.papers) && snapshot.dynamic.papers.length) {
    const imported = await targetPost('/api/literature/supplement/import', snapshot.dynamic).catch(error => {
      console.warn('Supplement import failed:', error instanceof Error ? error.message : String(error));
      return null;
    });
    console.log(`Supplement imported: ${Number(imported?.imported || 0)}`);
  }

  const titles = [...new Set(snapshot.records.map(item => typeof item?.title === 'string' ? item.title.trim() : '').filter(Boolean))];
  let translated = 0;
  for (let offset = 0; offset < titles.length; offset += 100) {
    try {
      const source = await sourcePost('/api/title-translations/zh', { titles: titles.slice(offset, offset + 100) });
      const translations = Array.isArray(source?.translations) ? source.translations : [];
      if (!translations.length) continue;
      const result = await targetPost('/api/title-translations/zh/import', { translations });
      translated += Number(result?.imported || 0);
    } catch (error) {
      console.warn('Translation batch failed:', error instanceof Error ? error.message : String(error));
    }
  }
  console.log(`Chinese title translations imported: ${translated}`);
}

async function sourceInventory(dois) {
  const map = new Map();
  for (let offset = 0; offset < dois.length; offset += INVENTORY_BATCH) {
    const chunk = dois.slice(offset, offset + INVENTORY_BATCH);
    try {
      const payload = await sourcePost('/api/media/inventory', { dois: chunk });
      for (const item of payload?.items || []) {
        const doi = normalizeDoi(item?.doi);
        if (doi) map.set(doi, item);
      }
    } catch (error) {
      console.warn(`Inventory batch ${offset} failed:`, error instanceof Error ? error.message : String(error));
    }
  }
  return map;
}

async function targetMedia(dois) {
  const map = new Map();
  for (let offset = 0; offset < dois.length; offset += MEDIA_BATCH) {
    const chunk = dois.slice(offset, offset + MEDIA_BATCH);
    try {
      const payload = await targetPost('/api/media/batch', { dois: chunk });
      for (const item of payload?.items || []) {
        const doi = normalizeDoi(item?.doi);
        if (doi) map.set(doi, item);
      }
    } catch (error) {
      console.warn(`Target media batch ${offset} failed:`, error instanceof Error ? error.message : String(error));
    }
  }
  return map;
}

function sniffType(bytes, declared) {
  const type = String(declared || '').split(';')[0].trim().toLowerCase().replace('image/jpg', 'image/jpeg');
  if (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(type)) return type;
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(Buffer.from(bytes.subarray(0, 6)).toString('ascii'))) return 'image/gif';
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

async function imageDataUrl(url) {
  const response = await fetchRetry(url, { headers: { Accept: 'image/webp,image/apng,image/*,*/*;q=0.8' } }, 2);
  if (!response.ok) throw new Error(`image HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 100 || bytes.byteLength > MAX_IMAGE_BYTES) throw new Error(`image size ${bytes.byteLength}`);
  const type = sniffType(bytes, response.headers.get('content-type'));
  if (!type) throw new Error('unsupported image format');
  return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
}

function figureIdentity(figure) {
  return String(figure?.id || figure?.label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function genuineFigure(figure) {
  const label = `${figure?.label || ''} ${figure?.caption || ''}`;
  return Boolean(figure?.imageUrl) && !/article graphic|generated|placeholder|loading|journal cover|issue cover/i.test(label);
}

async function migrateOne(doi, inventory, existing) {
  const result = { doi, toc: 0, figures: 0, skippedExisting: 0, errors: [] };
  const [toc, figuresPayload] = await Promise.all([
    sourceGet(`/api/toc?doi=${encodeURIComponent(doi)}`).catch(() => ({ available: false })),
    sourceGet(`/api/article-figures?doi=${encodeURIComponent(doi)}`).catch(() => ({ available: false, figures: [] })),
  ]);

  const targetHasRealToc = Boolean(existing?.toc?.available && existing?.toc?.imageUrl && !String(existing?.toc?.reason || '').startsWith('figure'));
  const sourceHasRealToc = Boolean(
    toc?.available === true && toc?.imageUrl && !inventory?.suspiciousToc &&
    !String(toc?.reason || '').startsWith('figure1_fallback') &&
    !String(toc?.reason || '').startsWith('figure_fallback:')
  );
  if (sourceHasRealToc && !targetHasRealToc) {
    try {
      await targetPost('/api/toc/import', {
        doi,
        articleUrl: toc.articleUrl || `https://doi.org/${doi}`,
        imageData: await imageDataUrl(toc.imageUrl),
        replace: false,
      });
      result.toc = 1;
    } catch (error) {
      result.errors.push(`TOC: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (targetHasRealToc) {
    result.skippedExisting += 1;
  }

  const existingFigures = new Set((existing?.figures?.figures || []).flatMap(item => [figureIdentity(item), String(item.label || '').toLowerCase()].filter(Boolean)));
  const sourceFigures = (Array.isArray(figuresPayload?.figures) ? figuresPayload.figures : []).filter(genuineFigure).slice(0, 10);
  let order = existing?.figures?.figures?.length || 0;
  for (const figure of sourceFigures) {
    const id = figureIdentity(figure) || `figure-${order + 1}`;
    if (existingFigures.has(id) || existingFigures.has(String(figure.label || '').toLowerCase())) {
      result.skippedExisting += 1;
      continue;
    }
    try {
      await targetPost('/api/article-figures/import', {
        doi,
        articleUrl: figuresPayload.articleUrl || toc?.articleUrl || `https://doi.org/${doi}`,
        id,
        label: figure.label || 'Figure',
        caption: figure.caption || undefined,
        order: Number.isFinite(figure.order) ? figure.order : order,
        width: Number.isFinite(figure.width) ? figure.width : undefined,
        height: Number.isFinite(figure.height) ? figure.height : undefined,
        imageData: await imageDataUrl(figure.imageUrl),
      });
      result.figures += 1;
      order += 1;
      existingFigures.add(id);
    } catch (error) {
      result.errors.push(`${figure.label || id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}

async function mapConcurrent(items, worker) {
  let cursor = 0;
  const results = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, items.length)) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

async function buildManifest(dois) {
  const media = await targetMedia(dois);
  const items = {};
  for (const [doi, item] of media) {
    const figureCount = item?.figures?.figures?.length || 0;
    const hasLarge = Boolean(item?.toc?.available && item?.toc?.imageUrl);
    if (!hasLarge && figureCount === 0) continue;
    const reason = String(item?.toc?.reason || '');
    const realToc = hasLarge && !reason.startsWith('figure1_fallback') && !reason.startsWith('figure_fallback:');
    const fallback = figureCount ? item.figures.figures[0] : null;
    items[doi] = {
      doi,
      toc: item.toc,
      figures: item.figures,
      inventory: {
        status: hasLarge && figureCount ? 'complete' : hasLarge ? 'large_only' : figureCount ? 'figures_only' : 'missing',
        largeSource: realToc ? 'toc' : fallback ? (/^figure\s*1$/i.test(fallback.label || '') ? 'figure1' : 'figure') : 'none',
        fallbackLabel: fallback?.label,
        suspiciousToc: false,
        figureCount,
      },
    };
  }
  const manifest = { version: 1, generatedAt: Date.now(), items };
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(manifest)}\n`, 'utf8');
  return manifest;
}

const health = await targetGet('/api/_healthcheck');
if (!health?.ok || !health?.d1 || !health?.r2 || !health?.writeAuth) throw new Error(`Target healthcheck incomplete: ${JSON.stringify(health)}`);

const snapshot = await loadSnapshot();
const recovered = await resolveMissingDois(snapshot.records);
await migrateMetadata(snapshot);

const allDois = [...new Set(snapshot.records.map(doiFromRecord).filter(Boolean))].sort();
console.log(`Production snapshot DOI count: ${allDois.length}; recovered missing DOI: ${recovered.size}`);

const inventory = await sourceInventory(allDois);
const candidates = allDois.filter(doi => {
  const item = inventory.get(doi);
  return item && (item.status !== 'missing' || Number(item.figureCount || 0) > 0 || item.largeSource !== 'none');
});
console.log(`Media migration candidates after source inventory: ${candidates.length}/${allDois.length}`);

const existing = await targetMedia(candidates);
let done = 0;
const results = await mapConcurrent(candidates, async doi => {
  const result = await migrateOne(doi, inventory.get(doi), existing.get(doi));
  done += 1;
  if (done % 20 === 0 || result.errors.length) console.log(`[${done}/${candidates.length}] ${doi}: toc=${result.toc}, figures=${result.figures}, skip=${result.skippedExisting}, errors=${result.errors.length}`);
  return result;
});

const manifest = await buildManifest(allDois);
const summary = {
  literatureDois: allDois.length,
  recoveredMissingDois: recovered.size,
  mediaCandidates: candidates.length,
  tocImported: results.reduce((sum, item) => sum + item.toc, 0),
  figuresImported: results.reduce((sum, item) => sum + item.figures, 0),
  skippedExisting: results.reduce((sum, item) => sum + item.skippedExisting, 0),
  failures: results.filter(item => item.errors.length).length,
  manifestItems: Object.keys(manifest.items).length,
};
console.log(`MIGRATION_SUMMARY ${JSON.stringify(summary)}`);
if (summary.failures) {
  console.log('MIGRATION_FAILURES', JSON.stringify(results.filter(item => item.errors.length), null, 2));
}
