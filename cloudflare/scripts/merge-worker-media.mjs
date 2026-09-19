import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const SOURCE = (process.env.GALLERY_BACKEND_SOURCE || 'https://organic-synthesis-gallery.zhou526316.workers.dev').replace(/\/$/, '');
const PUBLIC_DIR = path.resolve('public');
const MEDIA_DIR = path.join(PUBLIC_DIR, 'media-mirror');
const MEDIA_INDEX = path.join(PUBLIC_DIR, 'media-index.json');
const BATCH_SIZE = 80;
const CONCURRENCY = Math.max(2, Math.min(10, Number(process.env.WORKER_MEDIA_CONCURRENCY || 6)));
const MAX_IMAGE_BYTES = 4_000_000;

function normalizeDoi(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned : null;
}

function doiFromRecord(record) {
  const direct = normalizeDoi(record?.doi);
  if (direct) return direct;
  if (typeof record?.url !== 'string') return null;
  try {
    const url = new URL(record.url);
    if (/^(?:dx\.)?doi\.org$/i.test(url.hostname)) return normalizeDoi(url.pathname.slice(1));
    const match = url.pathname.match(/\/doi\/(?:abs\/|full\/|pdf\/|epdf\/)?(10\..+)$/i);
    if (match) return normalizeDoi(match[1]);
    const nature = url.pathname.match(/^\/articles\/(s\d+-\d+-\d+[a-z0-9-]*)$/i);
    if (/nature\.com$/i.test(url.hostname) && nature) return normalizeDoi(`10.1038/${nature[1]}`);
  } catch {
    return null;
  }
  return null;
}

async function loadGalleryDois() {
  const records = [];
  const encoded = (await readFile(path.join(PUBLIC_DIR, 'papers.gz.b64'), 'utf8')).trim();
  const base = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
  if (Array.isArray(base)) records.push(...base);
  for (const file of [
    'total-synthesis.json',
    'manual-supplement.json',
    'final-audit-supplement.json',
    'curated-supplement.json',
    'automation-supplement.json',
    'rolling-supplement.json',
    'literature-supplement.json',
  ]) {
    try {
      const payload = JSON.parse(await readFile(path.join(PUBLIC_DIR, file), 'utf8'));
      if (Array.isArray(payload?.papers)) records.push(...payload.papers);
    } catch {
      // Optional source.
    }
  }
  return [...new Set(records.map(doiFromRecord).filter(Boolean))].sort();
}

async function postJson(pathname, body) {
  const response = await fetch(`${SOURCE}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${pathname} HTTP ${response.status}`);
  return await response.json();
}

async function mapConcurrent(items, concurrency, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  }));
}

function extensionFor(contentType, url) {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/gif') return 'gif';
  if (type === 'image/avif') return 'avif';
  if (type === 'image/jpeg' || type === 'image/jpg') return 'jpg';
  try {
    const ext = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
    if (['png', 'webp', 'gif', 'avif', 'jpg', 'jpeg'].includes(ext || '')) return ext === 'jpeg' ? 'jpg' : ext;
  } catch {
    // fall through
  }
  return 'jpg';
}

function trueToc(toc) {
  return Boolean(
    toc?.available &&
    toc?.imageUrl &&
    toc?.reason !== 'figure1_fallback' &&
    !String(toc?.reason || '').startsWith('figure_fallback:')
  );
}

function mergeFigures(existing = [], incoming = []) {
  const merged = new Map();
  for (const item of existing) {
    const key = String(item?.id || item?.label || item?.imageUrl || '').toLowerCase();
    if (key) merged.set(key, item);
  }
  for (const item of incoming) {
    const key = String(item?.id || item?.label || item?.imageUrl || '').toLowerCase();
    if (key) merged.set(key, item);
  }
  return [...merged.values()]
    .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
    .slice(0, 10);
}

function inventoryFor(item) {
  const figures = item?.figures?.figures || [];
  const hasToc = Boolean(item?.toc?.available && item?.toc?.imageUrl);
  const isTrue = trueToc(item?.toc);
  const fallback = figures[0];
  return {
    status: isTrue && figures.length > 0 ? 'complete' : isTrue ? 'large_only' : figures.length > 0 ? 'figures_only' : hasToc ? 'figures_only' : 'missing',
    largeSource: isTrue ? 'toc' : fallback ? (/^figure\s*1$/i.test(String(fallback.label || '')) ? 'figure1' : 'figure') : hasToc ? 'figure' : 'none',
    fallbackLabel: !isTrue ? (fallback?.label || item?.inventory?.fallbackLabel) : undefined,
    suspiciousToc: Boolean(item?.inventory?.suspiciousToc),
    figureCount: figures.length,
  };
}

async function main() {
  const dois = await loadGalleryDois();
  const manifest = JSON.parse(await readFile(MEDIA_INDEX, 'utf8'));
  manifest.items ||= {};
  const workerItems = [];
  for (let offset = 0; offset < dois.length; offset += BATCH_SIZE) {
    const batch = dois.slice(offset, offset + BATCH_SIZE);
    const payload = await postJson('/api/media/batch', { dois: batch });
    if (Array.isArray(payload?.items)) workerItems.push(...payload.items);
  }

  await mkdir(MEDIA_DIR, { recursive: true });
  const urls = new Set();
  for (const item of workerItems) {
    if (item?.toc?.available && typeof item.toc.imageUrl === 'string') urls.add(item.toc.imageUrl);
    for (const figure of item?.figures?.figures || []) {
      if (typeof figure?.imageUrl === 'string') urls.add(figure.imageUrl);
    }
  }

  const replacements = new Map();
  const failures = [];
  let bytesTotal = 0;
  const list = [...urls];
  await mapConcurrent(list, CONCURRENCY, async url => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 100 || bytes.length > MAX_IMAGE_BYTES) throw new Error(`invalid image size ${bytes.length}`);
      const ext = extensionFor(response.headers.get('content-type'), url);
      const name = `worker-${createHash('sha256').update(url).digest('hex').slice(0, 28)}.${ext}`;
      await writeFile(path.join(MEDIA_DIR, name), bytes);
      replacements.set(url, `media-mirror/${name}`);
      bytesTotal += bytes.length;
    } catch (error) {
      failures.push({ url, error: error instanceof Error ? error.message : String(error) });
    }
  });

  const failedUrls = new Set(failures.map(item => item.url));

  let addedRecords = 0;
  let updatedRecords = 0;
  let workerToc = 0;
  let workerFigures = 0;
  for (const incomingRaw of workerItems) {
    const doi = normalizeDoi(incomingRaw?.doi);
    if (!doi) continue;
    const incoming = structuredClone(incomingRaw);
    if (incoming?.toc?.imageUrl) {
      const originalTocUrl = incoming.toc.imageUrl;
      if (replacements.has(originalTocUrl)) {
        incoming.toc.imageUrl = replacements.get(originalTocUrl);
      } else if (failedUrls.has(originalTocUrl)) {
        incoming.toc.available = false;
        delete incoming.toc.imageUrl;
      }
    }
    incoming.figures ||= { available: false, doi, figures: [] };
    incoming.figures.figures = (incoming.figures.figures || []).flatMap(figure => {
      if (!figure?.imageUrl) return [];
      const originalFigureUrl = figure.imageUrl;
      if (replacements.has(originalFigureUrl)) return [{ ...figure, imageUrl: replacements.get(originalFigureUrl) }];
      if (failedUrls.has(originalFigureUrl)) return [];
      return [figure];
    });
    incoming.figures.available = incoming.figures.figures.length > 0;
    if (incoming?.toc?.available && incoming?.toc?.imageUrl) workerToc += 1;
    workerFigures += incoming?.figures?.figures?.length || 0;

    const existing = manifest.items[doi];
    if (!existing) {
      if (!(incoming?.toc?.available || incoming?.figures?.figures?.length)) continue;
      incoming.inventory = inventoryFor(incoming);
      manifest.items[doi] = incoming;
      addedRecords += 1;
      continue;
    }

    const before = JSON.stringify(existing);
    const existingToc = existing.toc || { available: false };
    const incomingToc = incoming.toc || { available: false };
    if (trueToc(incomingToc) || (!trueToc(existingToc) && incomingToc.available && incomingToc.imageUrl)) {
      existing.toc = incomingToc;
    }
    const mergedFigures = mergeFigures(existing?.figures?.figures || [], incoming?.figures?.figures || []);
    existing.figures = {
      available: mergedFigures.length > 0,
      doi,
      articleUrl: incoming?.figures?.articleUrl || existing?.figures?.articleUrl,
      figures: mergedFigures,
    };
    existing.inventory = inventoryFor(existing);
    if (JSON.stringify(existing) !== before) updatedRecords += 1;
  }

  manifest.version = Math.max(2, Number(manifest.version || 1));
  manifest.generatedAt = Date.now();
  await writeFile(MEDIA_INDEX, JSON.stringify(manifest));

  const summary = {
    galleryDois: dois.length,
    workerItems: workerItems.length,
    workerToc,
    workerFigures,
    downloadedObjects: replacements.size,
    addedRecords,
    updatedRecords,
    finalRecords: Object.keys(manifest.items).length,
    failures: failures.length,
    bytesTotal,
  };
  console.log(`WORKER_MEDIA_MERGE_SUMMARY ${JSON.stringify(summary)}`);
  if (failures.length) {
    console.warn('WORKER_MEDIA_SOFT_FAILURES');
    console.warn(JSON.stringify(failures.slice(0, 12), null, 2));
  }
}

await main();
