import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const SOURCE = (process.env.GALLERY_BACKEND_SOURCE || 'https://organic-synthesis-gallery.zhou526316.workers.dev').replace(/\/$/, '');
const PUBLIC_DIR = path.resolve('public');
const MEDIA_DIR = path.join(PUBLIC_DIR, 'media-mirror');
const CONCURRENCY = Math.max(2, Math.min(12, Number(process.env.PAGES_MEDIA_CONCURRENCY || 8)));
const MAX_IMAGE_BYTES = 8_000_000;

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
  } catch { return fallback; }
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
  } catch { return fallback; }
}

function normalizeDoi(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned : null;
}

function paperDoi(record) {
  const direct = normalizeDoi(record?.doi);
  if (direct) return direct;
  if (typeof record?.url !== 'string') return null;
  try {
    const url = new URL(record.url);
    if (/^(?:dx\.)?doi\.org$/i.test(url.hostname)) return normalizeDoi(url.pathname.slice(1));
    const hit = url.pathname.match(/\/doi\/(?:abs\/|full\/|pdf\/|epdf\/)?(10\..+)$/i);
    if (hit) return normalizeDoi(hit[1]);
    const nature = url.pathname.match(/^\/articles\/(s\d+-\d+-\d+[a-z0-9-]*)$/i);
    if (/nature\.com$/i.test(url.hostname) && nature) return normalizeDoi(`10.1038/${nature[1]}`);
  } catch { return null; }
  return null;
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
    const ext = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
    if (['png','webp','gif','avif','jpg','jpeg'].includes(ext || '')) return ext === 'jpeg' ? 'jpg' : ext;
  } catch { /* fall through */ }
  return 'jpg';
}

async function loadRecords() {
  const encoded = (await readFile(path.join(PUBLIC_DIR, 'papers.gz.b64'), 'utf8')).trim();
  const base = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
  const files = ['total-synthesis.json', 'manual-supplement.json', 'final-audit-supplement.json'];
  const local = [];
  for (const file of files) {
    try {
      const payload = JSON.parse(await readFile(path.join(PUBLIC_DIR, file), 'utf8'));
      if (Array.isArray(payload?.papers)) local.push(...payload.papers);
    } catch { /* optional supplement */ }
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
  const titles = [...new Set(records.map(record => typeof record?.title === 'string' ? record.title.trim() : '').filter(Boolean))];
  const translations = [];
  for (let offset = 0; offset < titles.length; offset += 100) {
    const payload = await jsonPost(`${SOURCE}/api/title-translations/zh`, { titles: titles.slice(offset, offset + 100) }, { translations: [] });
    for (const item of payload?.translations || []) {
      if (typeof item?.title === 'string' && typeof item?.zh === 'string' && item.zh.trim()) translations.push({ title: item.title, zh: item.zh.trim() });
    }
  }
  const unique = new Map(translations.map(item => [normalizeTitle(item.title), item]));
  await writeFile(path.join(PUBLIC_DIR, 'title-translations-zh.json'), JSON.stringify({ translations: [...unique.values()] }));
  return unique.size;
}

async function buildResolutions(records) {
  const unresolved = records.flatMap((record, index) => {
    const title = typeof record?.title === 'string' ? record.title.trim() : '';
    const doi = paperDoi(record);
    if (title && doi) return [];
    return [{ key: String(index), doi: doi || undefined, url: typeof record?.url === 'string' ? record.url : undefined, title: title || undefined, journal: String(record?.journal || ''), date: String(record?.date || '') }];
  });
  const byDoi = {}, byTitle = {}, byUrl = {};
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

async function buildLiveManifest(records) {
  const dois = [...new Set(records.map(paperDoi).filter(Boolean))].sort();
  const items = {};
  for (let offset = 0; offset < dois.length; offset += 80) {
    const chunk = dois.slice(offset, offset + 80);
    const payload = await jsonPost(`${SOURCE}/api/media/batch`, { dois: chunk }, { items: [] });
    for (const item of payload?.items || []) {
      const doi = normalizeDoi(item?.doi);
      if (!doi) continue;
      const hasToc = Boolean(item?.toc?.available && item?.toc?.imageUrl);
      const figureCount = Array.isArray(item?.figures?.figures) ? item.figures.figures.length : 0;
      if (!hasToc && !figureCount) continue;
      items[doi] = item;
    }
  }
  return { version: 2, generatedAt: Date.now(), items };
}

async function mapConcurrent(items, concurrency, worker) {
  let cursor = 0;
  const results = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

async function mirrorMedia(manifest) {
  await rm(MEDIA_DIR, { recursive: true, force: true });
  await mkdir(MEDIA_DIR, { recursive: true });
  const urls = new Set();
  for (const item of Object.values(manifest.items || {})) {
    if (item?.toc?.available && typeof item.toc.imageUrl === 'string') urls.add(item.toc.imageUrl);
    for (const figure of item?.figures?.figures || []) if (typeof figure?.imageUrl === 'string') urls.add(figure.imageUrl);
  }

  const replacements = new Map();
  const failures = [];
  let bytesTotal = 0;
  const list = [...urls];
  await mapConcurrent(list, CONCURRENCY, async (url, index) => {
    try {
      const response = await fetchRetry(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 100 || bytes.length > MAX_IMAGE_BYTES) throw new Error(`invalid image size ${bytes.length}`);
      const ext = extensionFor(response.headers.get('content-type'), url);
      const name = `${createHash('sha256').update(url).digest('hex').slice(0, 28)}.${ext}`;
      await writeFile(path.join(MEDIA_DIR, name), bytes);
      replacements.set(url, `media-mirror/${name}`);
      bytesTotal += bytes.length;
      if ((index + 1) % 100 === 0) console.log(`Mirrored ${index + 1}/${list.length} media objects`);
    } catch (error) {
      failures.push({ url, error: error instanceof Error ? error.message : String(error) });
    }
  });

  for (const item of Object.values(manifest.items || {})) {
    if (item?.toc?.imageUrl && replacements.has(item.toc.imageUrl)) item.toc.imageUrl = replacements.get(item.toc.imageUrl);
    for (const figure of item?.figures?.figures || []) if (figure?.imageUrl && replacements.has(figure.imageUrl)) figure.imageUrl = replacements.get(figure.imageUrl);
  }
  await writeFile(path.join(PUBLIC_DIR, 'media-index.json'), JSON.stringify(manifest));
  return { manifestItems: Object.keys(manifest.items || {}).length, mediaObjects: replacements.size, failures: failures.length, bytesTotal };
}

await mkdir(PUBLIC_DIR, { recursive: true });
await writeFile(path.join(PUBLIC_DIR, '.nojekyll'), '');
const records = await loadRecords();
const [translationCount, resolutionCount, liveManifest] = await Promise.all([
  buildTranslations(records),
  buildResolutions(records),
  buildLiveManifest(records),
]);
const media = await mirrorMedia(liveManifest);
const summary = { records: records.length, translations: translationCount, resolutions: resolutionCount, ...media };
console.log(`PAGES_MIRROR_SUMMARY ${JSON.stringify(summary)}`);
if (media.failures > 0) process.exitCode = 2;
