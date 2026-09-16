import { gunzipSync } from 'node:zlib';

const SOURCE_SITE = process.env.SOURCE_SITE || 'https://organic-synthesis-literature-gallery-ase43k.v2.appdeploy.ai';
const SOURCE_API = process.env.SOURCE_API || 'https://api-v2.appdeploy.ai/app/organic-synthesis-literature-gallery-ase43k';
const TARGET_API_BASE = (process.env.TARGET_API_BASE || '').replace(/\/$/, '');
const TARGET_WRITE_TOKEN = process.env.TARGET_WRITE_TOKEN || '';
const CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.MIGRATION_CONCURRENCY || 3)));
const MAX_IMAGE_BYTES = 2_000_000;

if (!TARGET_API_BASE) throw new Error('TARGET_API_BASE is required.');
if (!TARGET_WRITE_TOKEN) throw new Error('TARGET_WRITE_TOKEN is required.');

function normalizeDoi(value) {
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
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned.toLowerCase() : null;
}

async function fetchWithRetry(url, init = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(25_000),
      });
      if (response.ok) return response;
      if (response.status < 500 && response.status !== 429) return response;
      lastError = new Error(`HTTP ${response.status} for ${url}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 500 * attempt));
  }
  throw lastError || new Error(`Request failed: ${url}`);
}

async function optionalJson(url) {
  try {
    const response = await fetchWithRetry(url, {}, 2);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function loadGalleryDois() {
  const encodedResponse = await fetchWithRetry(`${SOURCE_SITE}/papers.gz.b64`);
  if (!encodedResponse.ok) throw new Error(`Unable to load base literature data: ${encodedResponse.status}`);
  const encoded = (await encodedResponse.text()).trim();
  const base = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));

  const supplementalFiles = [
    'total-synthesis.json',
    'manual-supplement.json',
    'final-audit-supplement.json',
  ];
  const supplemental = await Promise.all(supplementalFiles.map(file => optionalJson(`${SOURCE_SITE}/${file}`)));
  const records = [
    ...(Array.isArray(base) ? base : []),
    ...supplemental.flatMap(value => Array.isArray(value?.papers) ? value.papers : []),
  ];

  const dois = new Set();
  for (const record of records) {
    const doi = normalizeDoi(record?.doi) || normalizeDoi(record?.url);
    if (doi) dois.add(doi);
  }
  return [...dois].sort();
}

function sniffContentType(bytes, declared) {
  const type = String(declared || '').split(';')[0].trim().toLowerCase().replace('image/jpg', 'image/jpeg');
  if (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(type)) return type;
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6) {
    const head = Buffer.from(bytes.subarray(0, 6)).toString('ascii');
    if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif';
  }
  if (bytes.length >= 12) {
    const riff = Buffer.from(bytes.subarray(0, 4)).toString('ascii');
    const webp = Buffer.from(bytes.subarray(8, 12)).toString('ascii');
    if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';
  }
  return null;
}

async function imageDataUrl(url) {
  const response = await fetchWithRetry(url, {
    headers: { Accept: 'image/webp,image/apng,image/*,*/*;q=0.8' },
  }, 2);
  if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 100 || bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image size ${bytes.byteLength} is outside migration limits`);
  }
  const contentType = sniffContentType(bytes, response.headers.get('content-type'));
  if (!contentType) throw new Error('Unsupported image format');
  return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`;
}

async function sourceJson(path) {
  const response = await fetchWithRetry(`${SOURCE_API}${path}`, {}, 2);
  if (!response.ok) throw new Error(`Source API HTTP ${response.status}: ${path}`);
  return response.json();
}

async function targetPost(path, body) {
  const response = await fetchWithRetry(`${TARGET_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TARGET_WRITE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }, 3);
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!response.ok) throw new Error(`Target HTTP ${response.status}: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`);
  return parsed;
}

async function migrateDoi(doi) {
  const [toc, figurePayload] = await Promise.all([
    sourceJson(`/api/toc?doi=${encodeURIComponent(doi)}`).catch(() => ({ available: false })),
    sourceJson(`/api/article-figures?doi=${encodeURIComponent(doi)}`).catch(() => ({ available: false, figures: [] })),
  ]);

  const result = { doi, toc: 0, figures: 0, skipped: 0, errors: [] };

  const tocIsTruePublisherAsset =
    toc?.available === true &&
    typeof toc?.imageUrl === 'string' &&
    !String(toc?.reason || '').startsWith('figure1_fallback') &&
    !String(toc?.reason || '').startsWith('figure_fallback:');
  if (tocIsTruePublisherAsset) {
    try {
      const imageData = await imageDataUrl(toc.imageUrl);
      await targetPost('/api/toc/import', {
        doi,
        articleUrl: toc.articleUrl || `https://doi.org/${doi}`,
        imageData,
        replace: false,
      });
      result.toc = 1;
    } catch (error) {
      result.errors.push(`TOC: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const figures = Array.isArray(figurePayload?.figures) ? figurePayload.figures : [];
  for (const figure of figures) {
    if (!figure?.imageUrl) continue;
    try {
      const imageData = await imageDataUrl(figure.imageUrl);
      await targetPost('/api/article-figures/import', {
        doi,
        articleUrl: figurePayload.articleUrl || toc?.articleUrl || `https://doi.org/${doi}`,
        id: figure.id || String(figure.label || 'figure').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        label: figure.label || 'Figure',
        caption: figure.caption || undefined,
        order: Number.isFinite(figure.order) ? figure.order : result.figures,
        imageData,
      });
      result.figures += 1;
    } catch (error) {
      result.errors.push(`${figure.label || 'Figure'}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!tocIsTruePublisherAsset && figures.length === 0) result.skipped += 1;
  return result;
}

async function mapConcurrent(items, concurrency, worker) {
  let cursor = 0;
  const output = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await worker(items[index], index);
    }
  }));
  return output;
}

const targetHealth = await optionalJson(`${TARGET_API_BASE}/api/_healthcheck`);
if (!targetHealth?.ok) throw new Error('Target Cloudflare Worker healthcheck failed.');
if (!targetHealth?.d1 || !targetHealth?.r2 || !targetHealth?.writeAuth) {
  throw new Error(`Target bindings are incomplete: ${JSON.stringify(targetHealth)}`);
}

const dois = await loadGalleryDois();
console.log(`Discovered ${dois.length} unique DOI records from the current production Gallery.`);

let completed = 0;
const results = await mapConcurrent(dois, CONCURRENCY, async doi => {
  const result = await migrateDoi(doi);
  completed += 1;
  if (completed % 20 === 0 || result.errors.length) {
    console.log(`[${completed}/${dois.length}] ${doi}: TOC ${result.toc}, figures ${result.figures}, errors ${result.errors.length}`);
  }
  return result;
});

const summary = {
  dois: results.length,
  tocImported: results.reduce((sum, item) => sum + item.toc, 0),
  figuresImported: results.reduce((sum, item) => sum + item.figures, 0),
  empty: results.filter(item => item.skipped > 0).length,
  withErrors: results.filter(item => item.errors.length > 0).length,
};
console.log('Migration summary:', summary);

if (summary.withErrors > 0) {
  const failures = results.filter(item => item.errors.length > 0);
  console.log('Migration failures:', JSON.stringify(failures, null, 2));
  process.exitCode = 2;
}
