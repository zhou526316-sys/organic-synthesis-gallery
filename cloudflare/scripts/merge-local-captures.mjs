import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE = (process.env.GALLERY_BACKEND_SOURCE || 'https://organic-synthesis-gallery.zhou526316.workers.dev').replace(/\/$/, '');
const PUBLIC_DIR = path.resolve('public');
const MEDIA_DIR = path.join(PUBLIC_DIR, 'media-mirror');
const MEDIA_INDEX = path.join(PUBLIC_DIR, 'media-index.json');
const MAX_IMAGE_BYTES = 4_000_000;

function normalizeDoi(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned : null;
}

function trueToc(toc) {
  return Boolean(
    toc?.available &&
    toc?.imageUrl &&
    toc?.reason !== 'figure1_fallback' &&
    !String(toc?.reason || '').startsWith('figure_fallback:')
  );
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
  } catch {}
  return 'jpg';
}

function mergeFigures(existing = [], incoming) {
  const map = new Map();
  for (const item of existing) {
    const key = String(item?.id || item?.label || item?.imageUrl || '').toLowerCase();
    if (key) map.set(key, item);
  }
  if (incoming) map.set('figure-1', incoming);
  return [...map.values()]
    .sort((a,b) => Number(a?.order || 0) - Number(b?.order || 0))
    .slice(0,10);
}

function updateInventory(record) {
  const figures = record?.figures?.figures || [];
  const official = trueToc(record?.toc);
  const fallback = figures[0];
  record.inventory = {
    ...(record.inventory || {}),
    status: official && figures.length ? 'complete' : official ? 'large_only' : figures.length ? 'figures_only' : 'missing',
    largeSource: official ? 'toc' : fallback ? (/^figure\s*1$/i.test(String(fallback.label || '')) ? 'figure1' : 'figure') : 'none',
    fallbackLabel: official ? undefined : fallback?.label,
    figureCount: figures.length,
    tocStored: official,
    tocMissing: !official,
  };
}

async function downloadCapture(item) {
  const response = await fetch(item.imageUrl, {
    headers: { 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 100 || bytes.length > MAX_IMAGE_BYTES) throw new Error(`invalid image size ${bytes.length}`);
  const ext = extensionFor(response.headers.get('content-type') || item.contentType, item.imageUrl);
  const name = `local-${createHash('sha256').update(`${item.doi}|${item.kind}|${item.contentHash || item.imageUrl}`).digest('hex').slice(0,28)}.${ext}`;
  await writeFile(path.join(MEDIA_DIR, name), bytes);
  return { localUrl: `media-mirror/${name}`, bytes: bytes.length };
}

async function main() {
  const response = await fetch(`${SOURCE}/api/media/local-capture-index`, {
    headers: { 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`local capture index HTTP ${response.status}`);
  const payload = await response.json();
  const captures = Array.isArray(payload?.items) ? payload.items : [];
  if (!captures.length) {
    console.log('LOCAL_CAPTURE_MERGE_SUMMARY ' + JSON.stringify({ captures: 0, official: 0, figure1: 0, merged: 0, failures: 0 }));
    return;
  }

  const manifest = JSON.parse(await readFile(MEDIA_INDEX, 'utf8'));
  manifest.items ||= {};
  await mkdir(MEDIA_DIR, { recursive: true });

  let official = 0;
  let figure1 = 0;
  let merged = 0;
  let failures = 0;
  let bytesTotal = 0;

  for (const capture of captures) {
    const doi = normalizeDoi(capture?.doi);
    const kind = String(capture?.kind || '').toLowerCase();
    const imageUrl = typeof capture?.imageUrl === 'string' ? capture.imageUrl : '';
    if (!doi || !['official','figure1'].includes(kind) || !imageUrl) continue;

    try {
      const mirrored = await downloadCapture(capture);
      bytesTotal += mirrored.bytes;

      const record = manifest.items[doi] || {
        doi,
        toc: { available: false, doi, reason: 'cache_miss', cacheHit: true, cacheState: 'miss' },
        figures: { available: false, doi, figures: [] },
      };

      if (kind === 'official') {
        official += 1;
        if (!trueToc(record.toc)) {
          record.toc = {
            available: true,
            doi,
            articleUrl: capture.articleUrl || record?.toc?.articleUrl,
            imageUrl: mirrored.localUrl,
            contentHash: capture.contentHash || undefined,
            reason: 'local_vpn_official_toc',
            sourceRepository: 'Local VPN Collector',
            source: 'windows-toc-collector',
            cacheHit: true,
            cacheState: 'hit',
          };
          merged += 1;
        }
      } else {
        figure1 += 1;
        const figure = {
          id: 'figure-1',
          label: 'Figure 1',
          caption: capture.caption || 'Figure 1',
          imageUrl: mirrored.localUrl,
          order: 0,
          sourceRepository: 'Local VPN Collector',
          source: 'windows-toc-collector',
          contentHash: capture.contentHash || undefined,
        };
        const figures = mergeFigures(record?.figures?.figures || [], figure);
        record.figures = {
          available: figures.length > 0,
          doi,
          articleUrl: capture.articleUrl || record?.figures?.articleUrl,
          figures,
        };
        if (!trueToc(record.toc)) {
          record.toc = {
            available: true,
            doi,
            articleUrl: capture.articleUrl || record?.toc?.articleUrl,
            imageUrl: mirrored.localUrl,
            contentHash: capture.contentHash || undefined,
            reason: 'figure1_fallback',
            sourceRepository: 'Local VPN Collector',
            source: 'windows-toc-collector',
            cacheHit: true,
            cacheState: 'hit',
          };
        }
        merged += 1;
      }

      updateInventory(record);
      manifest.items[doi] = record;
    } catch (error) {
      failures += 1;
      console.warn('LOCAL_CAPTURE_MERGE_FAILURE ' + JSON.stringify({
        doi,
        kind,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  manifest.version = Math.max(2, Number(manifest.version || 1));
  manifest.generatedAt = Date.now();
  await writeFile(MEDIA_INDEX, JSON.stringify(manifest));

  console.log('LOCAL_CAPTURE_MERGE_SUMMARY ' + JSON.stringify({
    captures: captures.length,
    official,
    figure1,
    merged,
    failures,
    finalRecords: Object.keys(manifest.items).length,
    bytesTotal,
  }));

  if (failures && merged === 0) process.exitCode = 2;
}

await main();
