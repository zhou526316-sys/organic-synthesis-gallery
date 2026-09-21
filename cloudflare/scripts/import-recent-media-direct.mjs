import { articleUrlsForDoi as publisherArticleUrlsForDoi, extractPublisherMediaCandidates } from '../../toc-collector/src/publisher-adapters.mjs';
import { readFile } from 'node:fs/promises';

const API_BASE = (process.env.WORKER_URL || 'https://organic-synthesis-gallery.zhou526316.workers.dev').replace(/\/$/, '');
const WRITE_TOKEN = String(process.env.BRIDGE_WRITE_TOKEN || '').trim();
const INPUT = process.env.RECENT_MEDIA_JSON || '/tmp/recent-media-repair.json';
const LIMIT = Math.max(1, Math.min(30, Number(process.env.DIRECT_MEDIA_LIMIT || 20)));
const PAGE_TIMEOUT_MS = 18_000;
const IMAGE_TIMEOUT_MS = 20_000;
const MAX_IMAGE_BYTES = 3_800_000;
const MAX_FIGURES = 5;

if (!WRITE_TOKEN) throw new Error('BRIDGE_WRITE_TOKEN is required');

function normalizeDoi(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned : null;
}

function articleUrlsForDoi(doi) {
  return publisherArticleUrlsForDoi(doi).map(item => item.url);
}
function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x2F;/gi, '/')
    .replace(/\\u002f/gi, '/')
    .replace(/\\\//g, '/');
}

function stripTags(value) {
  return decodeHtml(value).replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function attr(tag, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(tag);
  return decodeHtml(match?.[1] || '');
}

function resolveUrl(raw, base) {
  if (!raw) return null;
  try {
    const url = new URL(decodeHtml(raw).trim(), base);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function rejectedMediaContext(value) {
  return /journal[\s_-]*cover|cover[\s_-]*image|issue[\s_-]*cover|masthead|logo|icon|avatar|author[-_ ]photo|advert|banner|spinner|loading|favicon|tracking|pixel|cookie|placeholder/i.test(String(value || ''));
}

function parseSrcset(value, base) {
  return String(value || '').split(',').flatMap(part => {
    const match = part.trim().match(/^(\S+)(?:\s+([0-9.]+)(w|x))?/);
    if (!match) return [];
    const url = resolveUrl(match[1], base);
    if (!url) return [];
    let rank = Number(match[2] || 0);
    if (match[3] === 'w') rank *= 10;
    return [{ url, rank }];
  }).sort((a, b) => b.rank - a.rank);
}

function imageUrlsFromTag(tag, base) {
  const out = [];
  const add = raw => {
    const url = resolveUrl(raw, base);
    if (url && !out.includes(url)) out.push(url);
  };
  for (const item of parseSrcset(attr(tag, 'data-srcset') || attr(tag, 'srcset'), base)) add(item.url);
  for (const name of [
    'data-lg-src','data-hi-res-src','data-src-large','data-full-src','data-full','data-original',
    'data-src','data-lazy-src','data-image','data-url','src'
  ]) add(attr(tag, name));
  return out;
}

function imageUrlsFromFragment(fragment, base) {
  const urls = [];
  const add = raw => {
    const url = resolveUrl(raw, base);
    if (url && !urls.includes(url)) urls.push(url);
  };
  const direct = /https?:\\?\/\\?\/[^\s"'<>\\]+?\.(?:png|jpe?g|gif|webp)(?:\?[^\s"'<>\\]*)?/gi;
  let match;
  while ((match = direct.exec(fragment))) add(match[0].replace(/\\\//g, '/'));
  for (const tag of fragment.match(/<(?:img|source)\b[^>]*>/gi) || []) {
    for (const url of imageUrlsFromTag(tag, base)) add(url);
  }
  return urls;
}

function addCandidate(map, rawUrl, base, score, context, extra = {}) {
  const url = resolveUrl(rawUrl, base);
  if (!url || rejectedMediaContext(`${url} ${context || ''}`)) return;
  const old = map.get(url);
  const item = { url, score, context: String(context || '').slice(0, 500), ...extra };
  if (!old || score > old.score) map.set(url, item);
}

function extractTocCandidates(html, pageUrl, doi) {
  return extractPublisherMediaCandidates(html, pageUrl, { doi })
    .filter(item => item.kind === 'official')
    .map(item => ({
      url: item.src,
      score: item.score,
      context: item.text,
      assetType: item.assetType,
      source: item.source,
      publisher: item.publisher,
    }))
    .slice(0, 16);
}
function figureLabel(block, index) {
  const text = stripTags(block).slice(0, 2200);
  const numbered = text.match(/\b(Figure|Fig\.?|Scheme|Chart)\s*([A-Za-z]?\d+[A-Za-z]?)\b/i);
  if (numbered) {
    const kind = /^fig/i.test(numbered[1]) ? 'Figure' : numbered[1][0].toUpperCase() + numbered[1].slice(1).toLowerCase();
    return `${kind} ${numbered[2]}`;
  }
  if (/substrate\s+scope|reaction\s+scope|scope\s+of/i.test(text)) return 'Scope';
  if (/mechanis|catalytic\s+cycle|proposed\s+pathway/i.test(text)) return 'Mechanism';
  if (/optimization|reaction\s+conditions/i.test(text)) return 'Optimization';
  return `Figure ${index + 1}`;
}

function figurePriority(label) {
  const match = /^(Figure|Scheme|Chart)\s+(\d+)/i.exec(label);
  if (match) return Number(match[2]) === 1 ? 0 : 10 + Number(match[2]);
  if (label === 'Scope') return 50;
  if (label === 'Mechanism') return 51;
  if (label === 'Optimization') return 52;
  return 80;
}

function extractFigureCandidates(html, pageUrl) {
  const source = decodeHtml(html);
  const grouped = new Map();
  let index = 0;
  const blocks = source.match(/<figure\b[\s\S]{0,60000}?<\/figure>/gi) || [];
  const loose = source.match(/(?:Figure|Fig\.?|Scheme|Chart)\s*[A-Za-z]?\d+[A-Za-z]?[\s\S]{0,9000}?<(?:img|source)\b[^>]*>/gi) || [];
  for (const block of [...blocks, ...loose]) {
    if (/visual\s*abstract|graphical\s*abstract|toc\s*(?:graphic|image)/i.test(stripTags(block).slice(0, 1200))) continue;
    const label = figureLabel(block, index++);
    const caption = stripTags(block).slice(0, 600);
    const urls = imageUrlsFromFragment(block, pageUrl);
    for (const [variant, url] of urls.entries()) {
      if (rejectedMediaContext(`${url} ${caption}`)) continue;
      const key = `${label.toLowerCase()}::${url}`;
      grouped.set(key, { url, label, caption, priority: figurePriority(label), order: index, variant });
    }
  }
  return [...grouped.values()]
    .sort((a, b) => a.priority - b.priority || a.order - b.order || a.variant - b.variant)
    .slice(0, 30);
}

async function fetchPage(url) {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140 Safari/537.36 OrganicSynthesisGallery/2.1',
      },
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });
    const text = await response.text().catch(() => '');
    return { ok: response.ok && text.length >= 250, status: response.status, html: text, finalUrl: response.url || url };
  } catch (error) {
    return { ok: false, status: 0, html: '', finalUrl: url, error: error instanceof Error ? error.message : String(error) };
  }
}

function sniffMime(bytes, declared) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6) {
    const head = bytes.subarray(0, 6).toString('ascii');
    if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif';
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  const type = String(declared || '').split(';')[0].trim().toLowerCase().replace('image/jpg', 'image/jpeg');
  return ['image/png','image/jpeg','image/gif','image/webp'].includes(type) ? type : '';
}

function dimensions(bytes, mime) {
  try {
    if (mime === 'image/png' && bytes.length >= 24) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    if (mime === 'image/gif' && bytes.length >= 10) return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
    if (mime === 'image/jpeg') {
      let offset = 2;
      const sof = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) { offset += 1; continue; }
        const marker = bytes[offset + 1];
        const len = bytes.readUInt16BE(offset + 2);
        if (sof.has(marker) && len >= 7) return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
        if (len < 2) break;
        offset += 2 + len;
      }
    }
  } catch {
    // Optional quality signal.
  }
  return { width: 0, height: 0 };
}

async function fetchImage(candidate, articleUrl) {
  try {
    const response = await fetch(candidate.url, {
      redirect: 'follow',
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        Referer: articleUrl,
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
      },
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 200 || bytes.length > MAX_IMAGE_BYTES) return null;
    const mime = sniffMime(bytes, response.headers.get('content-type'));
    if (!mime) return null;
    const size = dimensions(bytes, mime);
    return { ...candidate, bytes, mime, width: size.width, height: size.height };
  } catch {
    return null;
  }
}

async function apiPost(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${WRITE_TOKEN}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(40_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}: ${JSON.stringify(data).slice(0, 250)}`);
  return data;
}

async function importOne(doi) {
  const pageResults = [];
  const toc = [];
  const figures = [];
  const seenToc = new Set();
  const seenFigures = new Set();
  for (const url of articleUrlsForDoi(doi)) {
    const page = await fetchPage(url);
    pageResults.push({ requested: url, final: page.finalUrl, status: page.status, bytes: page.html.length, ok: page.ok, error: page.error });
    if (!page.ok) continue;
    for (const candidate of extractTocCandidates(page.html, page.finalUrl, doi)) {
      if (seenToc.has(candidate.url)) continue;
      seenToc.add(candidate.url);
      toc.push({ ...candidate, articleUrl: page.finalUrl });
    }
    for (const candidate of extractFigureCandidates(page.html, page.finalUrl)) {
      const key = `${candidate.label}::${candidate.url}`;
      if (seenFigures.has(key)) continue;
      seenFigures.add(key);
      figures.push({ ...candidate, articleUrl: page.finalUrl });
    }
  }

  toc.sort((a, b) => b.score - a.score);
  figures.sort((a, b) => a.priority - b.priority || a.order - b.order || a.variant - b.variant);
  let tocImported = false;
  let figuresImported = 0;

  for (const candidate of toc) {
    const image = await fetchImage(candidate, candidate.articleUrl);
    if (!image) continue;
    if (image.width && image.height) {
      const ratio = image.width / image.height;
      const explicit = candidate.score >= 3000;
      if (image.width < 300 || image.height < 90 || (!explicit && ratio < 0.8)) continue;
    }
    await apiPost('/api/toc/import', {
      doi,
      articleUrl: candidate.articleUrl,
      imageData: `data:${image.mime};base64,${image.bytes.toString('base64')}`,
      replace: false,
    });
    tocImported = true;
    break;
  }

  const usedLabels = new Set();
  for (const candidate of figures) {
    if (figuresImported >= MAX_FIGURES || usedLabels.has(candidate.label)) continue;
    const image = await fetchImage(candidate, candidate.articleUrl);
    if (!image) continue;
    if (image.width && image.height) {
      const maxSide = Math.max(image.width, image.height);
      const minSide = Math.min(image.width, image.height);
      if (maxSide < 600 || minSide < 140 || image.width * image.height < 120_000) continue;
    }
    await apiPost('/api/article-figures/import', {
      doi,
      articleUrl: candidate.articleUrl,
      id: candidate.label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      label: candidate.label,
      caption: candidate.caption,
      order: figuresImported,
      width: image.width || undefined,
      height: image.height || undefined,
      imageData: `data:${image.mime};base64,${image.bytes.toString('base64')}`,
    });
    usedLabels.add(candidate.label);
    figuresImported += 1;
  }

  return {
    doi,
    tocImported,
    figuresImported,
    tocCandidates: toc.length,
    figureCandidates: figures.length,
    pages: pageResults,
  };
}

const prepared = JSON.parse(await readFile(INPUT, 'utf8'));
const targetDois = [...new Set((prepared.gaps || []).map(item => normalizeDoi(item?.doi)).filter(Boolean))].slice(0, LIMIT);
const results = [];
for (const doi of targetDois) {
  try {
    const result = await importOne(doi);
    results.push(result);
    console.log(`DIRECT_MEDIA_ITEM ${JSON.stringify(result)}`);
  } catch (error) {
    const result = { doi, error: error instanceof Error ? error.message : String(error) };
    results.push(result);
    console.warn(`DIRECT_MEDIA_ITEM ${JSON.stringify(result)}`);
  }
}

const summary = {
  requested: targetDois.length,
  tocImported: results.filter(item => item.tocImported).length,
  figuresImported: results.reduce((sum, item) => sum + Number(item.figuresImported || 0), 0),
  pageReachable: results.filter(item => Array.isArray(item.pages) && item.pages.some(page => page.ok)).length,
  failed: results.filter(item => item.error).length,
};
console.log(`DIRECT_MEDIA_SUMMARY ${JSON.stringify(summary)}`);
