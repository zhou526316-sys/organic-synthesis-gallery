import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const SOURCE = (process.env.GALLERY_BACKEND_SOURCE || 'https://organic-synthesis-gallery.zhou526316.workers.dev').replace(/\/$/, '');
const FALLBACK_SITE = (process.env.PAGES_MEDIA_FALLBACK || 'https://zhou526316-sys.github.io/organic-synthesis-gallery').replace(/\/$/, '');
const PUBLIC_DIR = path.resolve('public');
const MEDIA_DIR = path.join(PUBLIC_DIR, 'media-mirror');
const CONCURRENCY = Math.max(2, Math.min(12, Number(process.env.PAGES_MEDIA_CONCURRENCY || 8)));
const MAX_IMAGE_BYTES = 4_000_000;

async function fetchRetry(url, init = {}, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response;
      if (response.status < 500 && response.status !== 429) return response;
      lastError = new Error(`HTTP ${response.status}: ${url}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 700 * attempt));
  }
  throw lastError || new Error(`Unable to fetch ${url}`);
}

async function jsonGet(url, fallback = null) {
  try {
    const response = await fetchRetry(url);
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

async function jsonPost(url, body, fallback = null) {
  try {
    const response = await fetchRetry(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

function normalizeDoi(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned : null;
}

function normalizeTitle(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
}

function extensionFor(contentType, url) {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/gif') return 'gif';
  if (type === 'image/avif') return 'avif';
  if (type === 'image/jpeg' || type === 'image/jpg') return 'jpg';
  try {
    const ext = new URL(url, `${FALLBACK_SITE}/`).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
    if (['png', 'webp', 'gif', 'avif', 'jpg', 'jpeg'].includes(ext || '')) return ext === 'jpeg' ? 'jpg' : ext;
  } catch {
    // fall through
  }
  return 'jpg';
}

function isCriticalMirrorFailure(url) {
  if (!/^https?:\/\//i.test(url)) return true;
  try {
    const host = new URL(url).host;
    return host === new URL(SOURCE).host || host === new URL(FALLBACK_SITE).host;
  } catch {
    return true;
  }
}

async function loadRecords() {
  const encoded = (await readFile(path.join(PUBLIC_DIR, 'papers.gz.b64'), 'utf8')).trim();
  const base = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
  const files = ['total-synthesis.json', 'manual-supplement.json', 'final-audit-supplement.json', 'curated-supplement.json'];
  const local = [];
  for (const file of files) {
    try {
      const payload = JSON.parse(await readFile(path.join(PUBLIC_DIR, file), 'utf8'));
      if (Array.isArray(payload?.papers)) local.push(...payload.papers);
    } catch {
      // Optional supplement.
    }
  }
  const dynamic = await jsonGet(`${SOURCE}/api/literature/supplement`, { papers: [] });
  await writeFile(path.join(PUBLIC_DIR, 'literature-supplement.json'), JSON.stringify(dynamic || { papers: [] }));
  return [
    ...(Array.isArray(base) ? base : []),
    ...local,
    ...(Array.isArray(dynamic?.papers) ? dynamic.papers : []),
  ];
}

async function buildTranslations(records) {
  const titles = [...new Set(records
    .map(record => typeof record?.title === 'string' ? record.title.trim() : '')
    .filter(Boolean))];
  const translations = [];
  for (let offset = 0; offset < titles.length; offset += 100) {
    const batch = titles.slice(offset, offset + 100);
    const payload = await jsonPost(`${SOURCE}/api/title-translations/zh`, { titles: batch }, { translations: [] });
    for (const item of payload?.translations || []) {
      if (typeof item?.title === 'string' && typeof item?.zh === 'string' && item.zh.trim()) {
        translations.push({ title: item.title, zh: item.zh.trim() });
      }
    }
  }
  const unique = new Map(translations.map(item => [normalizeTitle(item.title), item]));
  await writeFile(path.join(PUBLIC_DIR, 'title-translations-zh.json'), JSON.stringify({ translations: [...unique.values()] }));
  return unique.size;
}

async function buildResolutions(records) {
  const unresolved = records.flatMap((record, index) => {
    const title = typeof record?.title === 'string' ? record.title.trim() : '';
    const doi = normalizeDoi(record?.doi);
    if (title && doi) return [];
    return [{
      key: String(index),
      doi: doi || undefined,
      url: typeof record?.url === 'string' ? record.url : undefined,
      title: title || undefined,
      journal: typeof record?.journal === 'string' ? record.journal : '',
      date: typeof record?.date === 'string' ? record.date : '',
    }];
  });

  const byDoi = {};
  const byTitle = {};
  const byUrl = {};
  let resolvedCount = 0;
  for (let offset = 0; offset < unresolved.length; offset += 40) {
    const batch = unresolved.slice(offset, offset + 40);
    const payload = await jsonPost(`${SOURCE}/api/paper-titles/resolve`, { papers: batch }, { papers: [] });
    const requestByKey = new Map(batch.map(item => [item.key, item]));
    for (const item of payload?.papers || []) {
      const req = requestByKey.get(String(item?.key));
      if (!req || typeof item?.title !== 'string' || !item.title.trim()) continue;
      const entry = { title: item.title.trim(), doi: normalizeDoi(item.doi) || undefined };
      const resultDoi = entry.doi || normalizeDoi(req.doi);
      if (resultDoi) byDoi[resultDoi] = entry;
      if (req.title) byTitle[normalizeTitle(req.title)] = entry;
      if (req.url) byUrl[req.url.trim()] = entry;
      resolvedCount += 1;
    }
  }
  await writeFile(path.join(PUBLIC_DIR, 'paper-title-resolutions.json'), JSON.stringify({ byDoi, byTitle, byUrl }));
  return resolvedCount;
}

async function mapConcurrent(items, concurrency, worker) {
  let cursor = 0;
  const results = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

async function mirrorMedia() {
  let manifest = await jsonGet(`${SOURCE}/media-index.json`);
  let mediaBase = SOURCE;
  let mediaSource = 'worker';
  if (!manifest?.items || typeof manifest.items !== 'object' || Object.keys(manifest.items).length === 0) {
    console.warn('Worker media index is empty; preserving the last published GitHub Pages media snapshot.');
    manifest = await jsonGet(`${FALLBACK_SITE}/media-index.json`);
    mediaBase = FALLBACK_SITE;
    mediaSource = 'published-pages-fallback';
  }
  if (!manifest?.items || typeof manifest.items !== 'object' || Object.keys(manifest.items).length === 0) {
    throw new Error('Neither Worker nor published Pages provides a non-empty media-index.json.');
  }

  await rm(MEDIA_DIR, { recursive: true, force: true });
  await mkdir(MEDIA_DIR, { recursive: true });

  const urls = new Set();
  for (const item of Object.values(manifest.items)) {
    if (item?.toc?.available && typeof item.toc.imageUrl === 'string') urls.add(item.toc.imageUrl);
    for (const figure of item?.figures?.figures || []) {
      if (typeof figure?.imageUrl === 'string') urls.add(figure.imageUrl);
    }
  }

  const replacements = new Map();
  const failures = [];
  let criticalFailures = 0;
  let bytesTotal = 0;
  const list = [...urls];
  await mapConcurrent(list, CONCURRENCY, async (url, index) => {
    try {
      const fetchUrl = /^https?:\/\//i.test(url) ? url : new URL(url, `${mediaBase}/`).toString();
      const response = await fetchRetry(fetchUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 100 || bytes.length > MAX_IMAGE_BYTES) throw new Error(`invalid image size ${bytes.length}`);
      const ext = extensionFor(response.headers.get('content-type'), fetchUrl);
      const name = `${createHash('sha256').update(String(url)).digest('hex').slice(0, 28)}.${ext}`;
      await writeFile(path.join(MEDIA_DIR, name), bytes);
      replacements.set(url, `media-mirror/${name}`);
      bytesTotal += bytes.length;
      if ((index + 1) % 100 === 0) console.log(`Mirrored ${index + 1}/${list.length} media objects`);
    } catch (error) {
      const critical = isCriticalMirrorFailure(url);
      if (critical) criticalFailures += 1;
      failures.push({ url, critical, error: error instanceof Error ? error.message : String(error) });
    }
  });

  for (const item of Object.values(manifest.items)) {
    if (item?.toc?.imageUrl && replacements.has(item.toc.imageUrl)) item.toc.imageUrl = replacements.get(item.toc.imageUrl);
    for (const figure of item?.figures?.figures || []) {
      if (figure?.imageUrl && replacements.has(figure.imageUrl)) figure.imageUrl = replacements.get(figure.imageUrl);
    }
  }

  if (failures.length) {
    const externalFallbacks = failures.length - criticalFailures;
    console.warn(`Media mirror failures: ${failures.length} (${criticalFailures} critical, ${externalFallbacks} external fallbacks retained)`);
    console.warn(JSON.stringify(failures.slice(0, 20), null, 2));
  }
  await writeFile(path.join(PUBLIC_DIR, 'media-index.json'), JSON.stringify(manifest));
  return {
    mediaSource,
    manifestItems: Object.keys(manifest.items).length,
    mediaObjects: replacements.size,
    failures: failures.length,
    criticalFailures,
    externalFallbacks: failures.length - criticalFailures,
    bytesTotal,
  };
}

await mkdir(PUBLIC_DIR, { recursive: true });
await writeFile(path.join(PUBLIC_DIR, '.nojekyll'), '');
const records = await loadRecords();
const [translationCount, resolutionCount, media] = await Promise.all([
  buildTranslations(records),
  buildResolutions(records),
  mirrorMedia(),
]);
const summary = {
  records: records.length,
  translations: translationCount,
  resolutions: resolutionCount,
  ...media,
};
console.log(`PAGES_MIRROR_SUMMARY ${JSON.stringify(summary)}`);
if (media.criticalFailures > 0) process.exitCode = 2;
