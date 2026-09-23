import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const SITE_BASE = (process.env.SHARE_SITE_ORIGIN || 'https://api.gczhouwld.com').replace(/\/+$/, '');
const GALLERY_BASE = (process.env.SHARE_GALLERY_ORIGIN || SITE_BASE).replace(/\/+$/, '');
const PUBLISHED_PAGES_BASE = 'https://zhou526316-sys.github.io/organic-synthesis-gallery';
const PUBLIC = path.resolve('public');
const OUT = path.join(PUBLIC, 'share');
const COVER_OUT = path.join(PUBLIC, 'share-media');
const DEFAULT_IMAGE = `${SITE_BASE}/share-default.png`;
const MAX_COVER_BYTES = 4_000_000;
const COVER_CONCURRENCY = 8;

const normalizeDoi = value => {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(v) ? v : null;
};
const slug = doi => Buffer.from(doi.toLowerCase(), 'utf8').toString('base64url');
const esc = value => String(value || '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const official = toc => Boolean(
  toc?.available &&
  toc?.imageUrl &&
  toc?.reason !== 'figure1_fallback' &&
  toc?.reason !== 'pdf_primary_fallback' &&
  !String(toc?.reason || '').startsWith('figure_fallback:')
);
const readJson = async (file, fallback) => {
  try { return JSON.parse(await readFile(path.join(PUBLIC, file), 'utf8')); }
  catch { return fallback; }
};

function doiFrom(record) {
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
  } catch {}
  return null;
}

async function records() {
  const all = [];
  try {
    const encoded = (await readFile(path.join(PUBLIC, 'papers.gz.b64'), 'utf8')).trim();
    const base = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
    if (Array.isArray(base)) all.push(...base);
  } catch {}
  for (const file of [
    'total-synthesis.json',
    'manual-supplement.json',
    'final-audit-supplement.json',
    'curated-supplement.json',
    'automation-supplement.json',
    'rolling-supplement.json',
    'literature-supplement.json',
  ]) {
    const payload = await readJson(file, { papers: [] });
    if (Array.isArray(payload?.papers)) all.push(...payload.papers);
  }
  return all;
}

async function publishedMediaIndex() {
  try {
    const response = await fetch(`${PUBLISHED_PAGES_BASE}/media-index.json?share-build=${Date.now()}`, {
      headers: { 'cache-control': 'no-cache', 'user-agent': 'osg-rich-share-builder/2.0' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    return payload?.items && typeof payload.items === 'object' ? payload : { items: {} };
  } catch (error) {
    console.warn('SHARE_PUBLISHED_MEDIA_INDEX_FAILED', error instanceof Error ? error.message : String(error));
    return { items: {} };
  }
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

function coverExtension(contentType, sourceUrl) {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/gif') return 'gif';
  if (type === 'image/avif') return 'avif';
  if (type === 'image/jpeg' || type === 'image/jpg') return 'jpg';
  try {
    const ext = new URL(sourceUrl).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
    if (['png','webp','gif','avif','jpg','jpeg'].includes(ext || '')) return ext === 'jpeg' ? 'jpg' : ext;
  } catch {}
  return 'jpg';
}

function sourceTocUrl(item) {
  if (!official(item?.toc)) return null;
  const value = String(item.toc.imageUrl || '').trim();
  if (!value) return null;
  try {
    return new URL(value, `${PUBLISHED_PAGES_BASE}/`).toString();
  } catch {
    return null;
  }
}

async function mirrorPublishedCovers(media, dois) {
  const result = new Map();
  let failures = 0;
  let candidates = 0;
  await rm(COVER_OUT, { recursive: true, force: true });
  await mkdir(COVER_OUT, { recursive: true });

  await mapConcurrent(dois, COVER_CONCURRENCY, async doi => {
    const item = media?.items?.[doi] || media?.items?.[doi.toLowerCase()] || null;
    const source = sourceTocUrl(item);
    if (!source) return;
    candidates += 1;
    try {
      const response = await fetch(source, {
        headers: { 'cache-control': 'no-cache', 'user-agent': 'osg-rich-share-cover-mirror/1.0' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 100 || bytes.length > MAX_COVER_BYTES) throw new Error(`invalid image size ${bytes.length}`);
      const type = response.headers.get('content-type') || '';
      if (type && !type.toLowerCase().startsWith('image/')) throw new Error(`invalid content type ${type}`);
      const ext = coverExtension(type, source);
      const name = `${createHash('sha256').update(doi + '|' + source).digest('hex').slice(0, 28)}.${ext}`;
      await writeFile(path.join(COVER_OUT, name), bytes);
      result.set(doi, {
        image: `${SITE_BASE}/share-media/${name}`,
        toc: item.toc,
      });
    } catch (error) {
      failures += 1;
      console.warn('SHARE_TOC_COVER_FAILED', doi, error instanceof Error ? error.message : String(error));
    }
  });

  return { result, candidates, failures };
}

function html(meta, selected) {
  const doi = meta.doi;
  const id = slug(doi);
  const share = `${SITE_BASE}/share/${id}.html`;
  const target = `${GALLERY_BASE}/?doi=${encodeURIComponent(doi)}`;
  const image = selected?.image || DEFAULT_IMAGE;
  const title = meta.titleZh || meta.title || doi;
  const secondary = [meta.journal, meta.date, `DOI: ${doi}`].filter(Boolean).join(' · ');
  const description = `${secondary}${secondary ? ' — ' : ''}点击进入 Organic Synthesis Gallery，直接定位并高亮这篇文献卡片。`;
  const targetJson = JSON.stringify(target).replace(/</g, '\\u003c');
  const width = Number(selected?.toc?.primary?.width || selected?.toc?.width || 0);
  const height = Number(selected?.toc?.primary?.height || selected?.toc?.height || 0);
  const imageDims = width > 0 && height > 0
    ? `<meta property="og:image:width" content="${width}"><meta property="og:image:height" content="${height}">`
    : '';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | Organic Synthesis Gallery</title>
<meta name="description" content="${esc(description)}"><meta name="robots" content="noindex,follow">
<meta itemprop="name" content="${esc(title)}"><meta itemprop="description" content="${esc(description)}"><meta itemprop="image" content="${esc(image)}">
<meta property="og:site_name" content="Organic Synthesis Gallery"><meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(share)}"><meta property="og:image" content="${esc(image)}"><meta property="og:image:secure_url" content="${esc(image)}">${imageDims}
<meta property="og:image:alt" content="${esc(title)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(image)}">
<link rel="image_src" href="${esc(image)}"><link rel="canonical" href="${esc(share)}"><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f5f7fb;color:#172033;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.paper{width:min(560px,100%);overflow:hidden;border:1px solid #dfe5ef;border-radius:20px;background:#fff;box-shadow:0 18px 48px rgba(23,32,51,.12)}.cover{display:grid;place-items:center;min-height:260px;padding:18px;background:#f8fafc}.cover img{display:block;width:100%;max-height:360px;object-fit:contain}.body{padding:18px}.site{color:#3159bd;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}h1{margin:8px 0 10px;font-size:20px;line-height:1.42}.meta{color:#667085;font-size:12px;line-height:1.6;overflow-wrap:anywhere}.open{display:inline-flex;margin-top:15px;padding:10px 14px;border-radius:10px;background:#3159bd;color:#fff;text-decoration:none;font-size:13px;font-weight:800}.hint{margin-top:10px;color:#98a2b3;font-size:10px}</style></head><body>
<article class="paper"><div class="cover"><img src="${esc(image)}" alt="${esc(title)}"></div><div class="body"><div class="site">Organic Synthesis Gallery</div><h1>${esc(title)}</h1><div class="meta">${esc(secondary)}</div><a class="open" href="${esc(target)}">进入网页并定位这篇文献 →</a><div class="hint">微信分享卡片优先使用官方 TOC；打开后目标卡片会保持 20 秒光环高亮。</div></div></article>
<script>(()=>{const t=${targetJson};setTimeout(()=>location.replace(t),120)})()</script></body></html>`;
}

const merged = new Map();
for (const record of await records()) {
  const doi = doiFrom(record);
  if (!doi) continue;
  const old = merged.get(doi) || { doi, title: '', titleZh: '', journal: '', date: '' };
  const title = typeof record?.title === 'string' ? record.title.trim() : '';
  const titleZh = typeof record?.titleZh === 'string' ? record.titleZh.trim() : '';
  const journal = typeof record?.journal === 'string' ? record.journal.trim() : '';
  const date = typeof record?.date === 'string' ? record.date.trim() : '';
  if (title && (!old.title || title.length > old.title.length)) old.title = title;
  if (titleZh && (!old.titleZh || titleZh.length > old.titleZh.length)) old.titleZh = titleZh;
  if (journal && !old.journal) old.journal = journal;
  if (date && (!old.date || date > old.date)) old.date = date;
  merged.set(doi, old);
}

const publishedMedia = await publishedMediaIndex();
const covers = await mirrorPublishedCovers(publishedMedia, [...merged.keys()]);
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

let tocCoverCount = 0;
for (const [doi, meta] of merged) {
  const selected = covers.result.get(doi) || null;
  if (selected) tocCoverCount += 1;
  await writeFile(path.join(OUT, `${slug(doi)}.html`), html(meta, selected), 'utf8');
}

console.log('SHARE_PAGES_SUMMARY ' + JSON.stringify({
  pages: merged.size,
  publishedMediaItems: Object.keys(publishedMedia?.items || {}).length,
  tocCoverCandidates: covers.candidates,
  tocCoverCount,
  tocCoverFailures: covers.failures,
  fallbackCoverCount: merged.size - tocCoverCount,
  siteBase: SITE_BASE,
  galleryBase: GALLERY_BASE,
}));
