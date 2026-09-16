import { Buffer } from 'node:buffer';

const BACKEND = (process.env.GALLERY_BACKEND || 'https://organic-synthesis-gallery.zhou526316.workers.dev').replace(/\/$/, '');
const TOKEN = String(process.env.BRIDGE_WRITE_TOKEN || '').trim();
const LIMIT = Math.max(1, Math.min(80, Number(process.env.MEDIA_QUALITY_LIMIT || 36)));
const CONCURRENCY = Math.max(1, Math.min(5, Number(process.env.MEDIA_QUALITY_CONCURRENCY || 3)));
const MAX_IMPORT_BYTES = 1_950_000;
const FETCH_TIMEOUT = 16_000;

if (!TOKEN) throw new Error('BRIDGE_WRITE_TOKEN is required.');

const IMAGE_HOSTS = [
  'pubs.acs.org', 'acs.figshare.com', 'silverchair-cdn.com',
  'onlinelibrary.wiley.com', 'wiley.com',
  'media.springernature.com', 'nature.com',
  'science.org', 'pubs.rsc.org',
];

function normalizeDoi(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned : null;
}

function hostAllowed(host) {
  const lower = host.toLowerCase();
  return IMAGE_HOSTS.some(item => lower === item || lower.endsWith(`.${item}`));
}

function articleUrls(doi) {
  const urls = [];
  if (doi.startsWith('10.1021/')) urls.push(`https://pubs.acs.org/doi/${doi}`, `https://pubs.acs.org/doi/full/${doi}`);
  else if (doi.startsWith('10.1002/')) urls.push(`https://onlinelibrary.wiley.com/doi/${doi}`, `https://onlinelibrary.wiley.com/doi/full/${doi}`);
  else if (doi.startsWith('10.1038/')) urls.push(`https://www.nature.com/articles/${doi.split('/')[1]}`);
  else if (doi.startsWith('10.1126/')) urls.push(`https://www.science.org/doi/${doi}`, `https://www.science.org/doi/full/${doi}`);
  urls.push(`https://doi.org/${doi}`);
  return [...new Set(urls)].slice(0, 3);
}

async function fetchRetry(url, init = {}, attempts = 2) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      last = new Error(`HTTP ${response.status}`);
    } catch (error) {
      last = error;
    }
    await new Promise(resolve => setTimeout(resolve, 700 * attempt));
  }
  throw last || new Error(`Unable to fetch ${url}`);
}

async function jsonGet(path, fallback = null) {
  try {
    const response = await fetchRetry(`${BACKEND}${path}`);
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

async function jsonPost(path, body) {
  const response = await fetchRetry(`${BACKEND}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload = {};
  try { payload = JSON.parse(text); } catch { payload = { text }; }
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}: ${text.slice(0, 240)}`);
  return payload;
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\\u002f/gi, '/').replace(/\\\//g, '/');
}

function stripTags(value) {
  return decodeHtml(value).replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function attr(tag, name) {
  return decodeHtml(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(tag)?.[1] || '');
}

function resolveImage(raw, base) {
  if (!raw) return null;
  try {
    const url = new URL(raw, base);
    if (url.protocol !== 'https:' || !hostAllowed(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}

function rejectedContext(value) {
  return /journal[\s_-]*cover|issue[\s_-]*cover|masthead|logo|icon|avatar|author[-_ ]photo|advert|banner|favicon|tracking|pixel|spinner|loading/i.test(value);
}

function srcsetBest(value, base) {
  return String(value || '').split(',').flatMap(part => {
    const match = part.trim().match(/^(\S+)(?:\s+(\d+(?:\.\d+)?)(w|x))?/);
    if (!match) return [];
    const url = resolveImage(match[1], base);
    if (!url) return [];
    const weight = Number(match[2] || 0) * (match[3] === 'x' ? 1000 : 1);
    return [{ url, weight }];
  }).sort((a, b) => b.weight - a.weight)[0]?.url || null;
}

function imageFromTag(tag, base) {
  const candidates = [
    srcsetBest(attr(tag, 'srcset') || attr(tag, 'data-srcset'), base),
    ...['data-src-large', 'data-hi-res-src', 'data-original', 'data-full', 'data-zoom-src', 'data-src', 'src']
      .map(name => resolveImage(attr(tag, name), base)),
  ].filter(Boolean);
  return candidates[0] || null;
}

function addCandidate(list, seen, rawUrl, base, score, context, kind, label = '') {
  const url = resolveImage(rawUrl, base);
  if (!url || seen.has(url) || rejectedContext(`${url} ${context}`)) return;
  seen.add(url);
  list.push({ url, articleUrl: base, score, context: String(context || '').slice(0, 1000), kind, label });
}

function extractTocCandidates(html, pageUrl) {
  const source = decodeHtml(html);
  const list = [];
  const seen = new Set();
  let match;
  const meta = /<meta\b[^>]*>/gi;
  while ((match = meta.exec(source))) {
    const tag = match[0];
    const name = `${attr(tag, 'name')} ${attr(tag, 'property')} ${attr(tag, 'itemprop')}`.toLowerCase();
    const content = attr(tag, 'content');
    if (/citation_(?:graphical_abstract|toc_graphic)|graphical[_ -]?abstract|visual[_ -]?abstract|toc[_ -]?(?:graphic|image)/i.test(name)) {
      addCandidate(list, seen, content, pageUrl, 1000, name, 'toc');
    }
  }

  const semantic = /(?:graphical\s*abstract|visual\s*abstract|toc\s*(?:graphic|image)|table\s*of\s*contents)[\s\S]{0,7000}/gi;
  while ((match = semantic.exec(source))) {
    const fragment = match[0];
    for (const tag of fragment.match(/<(?:img|source)\b[^>]*>/gi) || []) {
      const url = imageFromTag(tag, pageUrl);
      if (url) addCandidate(list, seen, url, pageUrl, 700, fragment.slice(0, 1400), 'toc');
    }
  }

  // Some publisher templates expose the semantic label in attributes rather than visible text.
  for (const tag of source.match(/<(?:img|source)\b[^>]*>/gi) || []) {
    const context = `${attr(tag, 'alt')} ${attr(tag, 'title')} ${attr(tag, 'class')} ${attr(tag, 'id')}`;
    if (!/(?:graphical|visual)[-_ ]?abstract|toc[-_ ]?(?:graphic|image)/i.test(context)) continue;
    const url = imageFromTag(tag, pageUrl);
    if (url) addCandidate(list, seen, url, pageUrl, 820, context, 'toc');
  }
  return list.sort((a, b) => b.score - a.score);
}

function figureLabel(block) {
  const text = stripTags(block).slice(0, 1800);
  const numbered = text.match(/\b(Figure|Fig\.?|Scheme|Chart)\s*([A-Za-z]?\d+[A-Za-z]?)\b/i);
  if (numbered) {
    const kind = /^fig/i.test(numbered[1]) ? 'Figure' : numbered[1][0].toUpperCase() + numbered[1].slice(1).toLowerCase();
    return `${kind} ${numbered[2]}`;
  }
  if (/substrate\s+scope|scope\s+of/i.test(text)) return 'Scope';
  if (/proposed\s+mechanism|reaction\s+mechanism|mechanistic/i.test(text)) return 'Mechanism';
  return null;
}

function figurePriority(label) {
  const match = /^(Figure|Scheme|Chart)\s+([A-Za-z]?)(\d+)/i.exec(label || '');
  if (match) return Number(match[3]) * 10 + (/^figure$/i.test(match[1]) ? 0 : /^scheme$/i.test(match[1]) ? 1 : 2);
  if (label === 'Scope') return 500;
  if (label === 'Mechanism') return 510;
  return 900;
}

function extractFigureCandidates(html, pageUrl) {
  const source = decodeHtml(html);
  const byLabel = new Map();
  const blocks = source.match(/<figure\b[\s\S]{0,40000}?<\/figure>/gi) || [];
  for (const block of blocks) {
    const label = figureLabel(block);
    if (!label) continue;
    const tags = block.match(/<(?:img|source)\b[^>]*>/gi) || [];
    const url = tags.map(tag => imageFromTag(tag, pageUrl)).find(Boolean);
    if (!url || rejectedContext(`${url} ${block.slice(0, 1200)}`)) continue;
    const caption = stripTags(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(block)?.[1] || block).slice(0, 600);
    const candidate = { url, articleUrl: pageUrl, label, caption, priority: figurePriority(label) };
    const current = byLabel.get(label.toLowerCase());
    if (!current || candidate.priority < current.priority) byLabel.set(label.toLowerCase(), candidate);
  }
  return [...byLabel.values()].sort((a, b) => a.priority - b.priority).slice(0, 6);
}

function imageDimensions(bytes, contentType = '') {
  const b = Buffer.from(bytes);
  if (b.length < 24) return null;
  if (b.toString('ascii', 1, 4) === 'PNG') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (contentType.includes('jpeg') || (b[0] === 0xff && b[1] === 0xd8)) {
    let offset = 2;
    while (offset + 9 < b.length) {
      if (b[offset] !== 0xff) { offset += 1; continue; }
      const marker = b[offset + 1];
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        return { width: b.readUInt16BE(offset + 7), height: b.readUInt16BE(offset + 5) };
      }
      const length = b.readUInt16BE(offset + 2);
      if (!length || length < 2) break;
      offset += 2 + length;
    }
  }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X' && b.length >= 30) {
      const width = 1 + b[24] + (b[25] << 8) + (b[26] << 16);
      const height = 1 + b[27] + (b[28] << 8) + (b[29] << 16);
      return { width, height };
    }
  }
  return null;
}

async function downloadImage(candidate) {
  try {
    const response = await fetchRetry(candidate.url, {
      headers: {
        accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        referer: candidate.articleUrl,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36',
      },
    });
    if (!response.ok) return null;
    const type = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase().replace('image/jpg', 'image/jpeg');
    if (!['image/png','image/jpeg','image/gif','image/webp'].includes(type)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 3000 || bytes.length > MAX_IMPORT_BYTES) return null;
    const dimensions = imageDimensions(bytes, type);
    if (dimensions) {
      if (dimensions.width < 260 || dimensions.height < 90) return null;
      const ratio = dimensions.width / Math.max(1, dimensions.height);
      if (ratio > 12 || ratio < .18) return null;
    }
    return { bytes, type, dimensions };
  } catch { return null; }
}

async function currentImageStats(url) {
  if (!url) return null;
  try {
    const response = await fetchRetry(new URL(url, `${BACKEND}/`).href);
    if (!response.ok) return null;
    const type = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const bytes = Buffer.from(await response.arrayBuffer());
    return { bytes: bytes.length, dimensions: imageDimensions(bytes, type) };
  } catch { return null; }
}

function improvement(candidate, current) {
  if (!current) return true;
  if (candidate.dimensions && current.dimensions) {
    const nextArea = candidate.dimensions.width * candidate.dimensions.height;
    const oldArea = current.dimensions.width * current.dimensions.height;
    if (nextArea >= oldArea * 1.35 && candidate.dimensions.width >= current.dimensions.width) return true;
  }
  return candidate.bytes.length >= current.bytes * 1.65;
}

function dataUrl(image) {
  return `data:${image.type};base64,${image.bytes.toString('base64')}`;
}

async function collectPages(doi) {
  const pages = [];
  const seen = new Set();
  for (const url of articleUrls(doi)) {
    try {
      const response = await fetchRetry(url, {
        headers: {
          accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36',
        },
      });
      if (!response.ok) continue;
      const html = await response.text();
      if (html.length < 500) continue;
      const finalUrl = response.url || url;
      if (seen.has(finalUrl)) continue;
      seen.add(finalUrl);
      pages.push({ html, finalUrl });
    } catch { /* next URL */ }
  }
  return pages;
}

async function repairDoi(item, manifestItem) {
  const doi = normalizeDoi(item?.doi);
  if (!doi) return { doi: item?.doi, outcome: 'invalid_doi' };
  const pages = await collectPages(doi);
  if (!pages.length) return { doi, outcome: 'publisher_unreachable', bridgeNeeded: true };

  let tocCandidates = [];
  let figureCandidates = [];
  for (const page of pages) {
    tocCandidates.push(...extractTocCandidates(page.html, page.finalUrl));
    figureCandidates.push(...extractFigureCandidates(page.html, page.finalUrl));
  }
  tocCandidates = [...new Map(tocCandidates.map(value => [value.url, value])).values()].sort((a,b) => b.score-a.score);
  figureCandidates = [...new Map(figureCandidates.map(value => [`${value.label}|${value.url}`, value])).values()].sort((a,b) => a.priority-b.priority);

  let tocImported = false;
  let tocImproved = false;
  const currentTocUrl = manifestItem?.toc?.available ? manifestItem.toc.imageUrl : null;
  const currentToc = currentTocUrl ? await currentImageStats(currentTocUrl) : null;
  for (const candidate of tocCandidates.slice(0, 5)) {
    const image = await downloadImage(candidate);
    if (!image) continue;
    if (!item.tocMissing && !item.suspiciousToc && !improvement(image, currentToc)) continue;
    await jsonPost('/api/toc/import', {
      doi,
      articleUrl: candidate.articleUrl,
      imageData: dataUrl(image),
      replace: Boolean(currentTocUrl),
    });
    tocImported = true;
    tocImproved = Boolean(currentTocUrl);
    break;
  }

  let figuresImported = 0;
  const currentFigures = Array.isArray(manifestItem?.figures?.figures) ? manifestItem.figures.figures : [];
  for (const [index, candidate] of figureCandidates.slice(0, Math.max(2, 4 - currentFigures.length)).entries()) {
    const image = await downloadImage(candidate);
    if (!image) continue;
    const currentMatch = currentFigures.find(value => String(value.label || '').toLowerCase() === candidate.label.toLowerCase());
    const current = currentMatch?.imageUrl ? await currentImageStats(currentMatch.imageUrl) : null;
    if (current && !improvement(image, current)) continue;
    await jsonPost('/api/article-figures/import', {
      doi,
      id: `${candidate.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-quality`,
      label: candidate.label,
      caption: candidate.caption,
      articleUrl: candidate.articleUrl,
      imageData: dataUrl(image),
      width: image.dimensions?.width || 0,
      height: image.dimensions?.height || 0,
      order: index,
    });
    figuresImported += 1;
  }

  return {
    doi,
    outcome: tocImported || figuresImported ? 'updated' : tocCandidates.length || figureCandidates.length ? 'no_better_asset' : 'semantic_media_not_found',
    tocImported,
    tocImproved,
    figuresImported,
    bridgeNeeded: !tocImported && Boolean(item.tocMissing || item.suspiciousToc),
    tocCandidates: tocCandidates.length,
    figureCandidates: figureCandidates.length,
  };
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

const [queue, manifest] = await Promise.all([
  jsonGet('/api/media/bridge-queue', { items: [] }),
  jsonGet('/media-index.json', { items: {} }),
]);
const queueItems = Array.isArray(queue?.items) ? queue.items : [];
const selected = queueItems
  .sort((a,b) => Number(b.reportedPriority)-Number(a.reportedPriority) || Number(b.tocMissing)-Number(a.tocMissing) || Number(a.figureCount||0)-Number(b.figureCount||0))
  .slice(0, LIMIT);

const results = await mapConcurrent(selected, async item => {
  try {
    const doi = normalizeDoi(item.doi);
    const result = await repairDoi(item, doi ? manifest?.items?.[doi] : null);
    console.log('MEDIA_QUALITY_ITEM', JSON.stringify(result));
    return result;
  } catch (error) {
    const result = { doi: item?.doi, outcome: 'error', error: error instanceof Error ? error.message : String(error) };
    console.log('MEDIA_QUALITY_ITEM', JSON.stringify(result));
    return result;
  }
});

const summary = {
  queue: queueItems.length,
  selected: selected.length,
  updated: results.filter(item => item?.outcome === 'updated').length,
  tocImported: results.filter(item => item?.tocImported).length,
  tocImproved: results.filter(item => item?.tocImproved).length,
  figuresImported: results.reduce((sum, item) => sum + Number(item?.figuresImported || 0), 0),
  bridgeNeeded: results.filter(item => item?.bridgeNeeded).length,
  publisherUnreachable: results.filter(item => item?.outcome === 'publisher_unreachable').length,
  errors: results.filter(item => item?.outcome === 'error').length,
};
console.log(`MEDIA_QUALITY_SUMMARY ${JSON.stringify(summary)}`);
