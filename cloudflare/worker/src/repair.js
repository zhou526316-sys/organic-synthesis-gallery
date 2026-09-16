import { importFigure, importToc, quarantineToc } from './media-write.js';

const IMAGE_HOSTS = [
  'pubs.acs.org',
  'acs.figshare.com',
  'silverchair-cdn.com',
  'onlinelibrary.wiley.com',
  'wiley.com',
  'media.springernature.com',
  'nature.com',
  'www.nature.com',
  'science.org',
  'www.science.org',
  'pubs.rsc.org',
];
const MAX_IMAGE_BYTES = 2_000_000;
const MAX_PAGES = 3;
const MAX_FIGURES = 8;
const REPAIR_VERSION = 1;

function hostAllowed(host) {
  const lower = host.toLowerCase();
  return IMAGE_HOSTS.some(item => lower === item || lower.endsWith(`.${item}`));
}

function articleUrlsForDoi(doi) {
  const urls = [];
  if (doi.startsWith('10.1021/')) {
    urls.push(`https://pubs.acs.org/doi/${doi}`, `https://pubs.acs.org/doi/full/${doi}`);
  } else if (doi.startsWith('10.1002/')) {
    urls.push(`https://onlinelibrary.wiley.com/doi/${doi}`, `https://onlinelibrary.wiley.com/doi/full/${doi}`);
  } else if (doi.startsWith('10.1038/')) {
    urls.push(`https://www.nature.com/articles/${doi.split('/')[1]}`);
  } else if (doi.startsWith('10.1126/')) {
    urls.push(`https://www.science.org/doi/${doi}`, `https://www.science.org/doi/full/${doi}`);
  }
  urls.push(`https://doi.org/${doi}`);
  return [...new Set(urls)].slice(0, MAX_PAGES);
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\\u002f/gi, '/')
    .replace(/\\\//g, '/');
}

function stripTags(value) {
  return decodeHtml(value).replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function attr(tag, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i');
  return decodeHtml(pattern.exec(tag)?.[1] || '');
}

function resolveUrl(raw, baseUrl) {
  if (!raw) return null;
  try {
    const url = new URL(raw, baseUrl);
    if (url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

function imageUrlAllowed(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && hostAllowed(url.hostname);
  } catch {
    return false;
  }
}

function rejectedMediaContext(value) {
  return /journal[\s_-]*cover|issue[\s_-]*cover|masthead|logo|icon|avatar|author[-_ ]photo|advert|banner|spinner|loading|favicon|tracking|pixel/i.test(value);
}

function srcsetBest(value, baseUrl) {
  const entries = String(value || '').split(',').flatMap(item => {
    const match = item.trim().match(/^(\S+)(?:\s+(\d+)(?:w|x))?/);
    if (!match) return [];
    const url = resolveUrl(match[1], baseUrl);
    return url ? [{ url, weight: Number(match[2] || 0) }] : [];
  });
  return entries.sort((a, b) => b.weight - a.weight)[0]?.url || null;
}

function preferredImageFromTag(tag, baseUrl) {
  const direct = ['data-src-large', 'data-hi-res-src', 'data-original', 'data-src', 'src']
    .map(name => attr(tag, name))
    .filter(Boolean);
  const srcset = srcsetBest(attr(tag, 'srcset') || attr(tag, 'data-srcset'), baseUrl);
  const candidates = [srcset, ...direct.map(value => resolveUrl(value, baseUrl))].filter(Boolean);
  return candidates.find(imageUrlAllowed) || null;
}

function extractTocCandidates(html, pageUrl) {
  const source = decodeHtml(html);
  const candidates = [];
  const seen = new Set();
  const add = (rawUrl, score, context) => {
    const url = resolveUrl(rawUrl, pageUrl);
    if (!url || !imageUrlAllowed(url) || rejectedMediaContext(`${url} ${context || ''}`)) return;
    if (seen.has(url)) return;
    seen.add(url);
    candidates.push({ url, score, articleUrl: pageUrl });
  };

  const metaPattern = /<meta\b[^>]*>/gi;
  let match;
  while ((match = metaPattern.exec(source))) {
    const tag = match[0];
    const name = `${attr(tag, 'name')} ${attr(tag, 'property')}`.toLowerCase();
    const content = attr(tag, 'content');
    if (/citation_graphical_abstract|citation_toc_graphic|graphical[_ -]?abstract|visual[_ -]?abstract/.test(name)) {
      add(content, 500, name);
    }
  }

  const semanticPattern = /(?:graphical\s*abstract|visual\s*abstract|toc\s*(?:graphic|image)|table\s*of\s*contents)[\s\S]{0,5000}/gi;
  while ((match = semanticPattern.exec(source))) {
    const fragment = match[0];
    const imgPattern = /<(?:img|source)\b[^>]*>/gi;
    let imageMatch;
    while ((imageMatch = imgPattern.exec(fragment))) {
      const tag = imageMatch[0];
      const url = preferredImageFromTag(tag, pageUrl);
      if (url) add(url, 320, fragment.slice(0, 1000));
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
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
  if (/optimization|optimisation/i.test(text)) return 'Optimization';
  return null;
}

function figurePriority(label) {
  const numbered = /^(Figure|Scheme|Chart)\s+([A-Za-z]?)(\d+)/i.exec(label);
  if (numbered) {
    const number = Number(numbered[3]);
    const kind = numbered[1].toLowerCase();
    const kindBias = kind === 'figure' ? 0 : kind === 'scheme' ? 1 : 2;
    return number * 10 + kindBias;
  }
  if (label === 'Scope') return 500;
  if (label === 'Mechanism') return 510;
  if (label === 'Optimization') return 520;
  return 900;
}

function figureKey(label) {
  return label.toLowerCase().replace(/^fig\.?\s*/, 'figure ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function extractFigureCandidates(html, pageUrl) {
  const source = decodeHtml(html);
  const grouped = new Map();
  let sequence = 0;
  const addBlock = block => {
    const label = figureLabel(block);
    if (!label) return;
    const captionMatch = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(block);
    const caption = stripTags(captionMatch?.[1] || block).slice(0, 600);
    const imageTags = block.match(/<(?:img|source)\b[^>]*>/gi) || [];
    const urls = imageTags.map(tag => preferredImageFromTag(tag, pageUrl)).filter(Boolean);
    if (!urls.length) return;
    const key = figureKey(label);
    const candidate = {
      key,
      label,
      caption,
      url: urls[0],
      articleUrl: pageUrl,
      priority: figurePriority(label),
      order: sequence++,
    };
    const existing = grouped.get(key);
    if (!existing || candidate.priority < existing.priority || candidate.order < existing.order) grouped.set(key, candidate);
  };

  const figurePattern = /<figure\b[\s\S]{0,30000}?<\/figure>/gi;
  let match;
  while ((match = figurePattern.exec(source))) addBlock(match[0]);

  // Some publisher pages use div-based figure viewers instead of semantic <figure>.
  const rawPattern = /(?:Figure|Fig\.?|Scheme|Chart)\s*[A-Za-z]?\d+[A-Za-z]?[\s\S]{0,5000}?<(?:img|source)\b[^>]*>/gi;
  while ((match = rawPattern.exec(source))) addBlock(match[0]);

  return [...grouped.values()].sort((a, b) => a.priority - b.priority || a.order - b.order);
}

async function fetchPage(url) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 OrganicSynthesisGallery/2.0',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(6500),
    });
    if (!response.ok) return null;
    const text = await response.text();
    if (text.length < 200) return null;
    return { html: text, finalUrl: response.url || url };
  } catch {
    return null;
  }
}

async function collectPages(doi) {
  const pages = [];
  const seen = new Set();
  for (const url of articleUrlsForDoi(doi)) {
    const page = await fetchPage(url);
    if (!page) continue;
    const key = page.finalUrl.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pages.push(page);
  }
  return pages;
}

async function downloadImage(candidate) {
  if (!candidate?.url || !imageUrlAllowed(candidate.url)) return null;
  try {
    const response = await fetch(candidate.url, {
      headers: {
        Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
        Referer: candidate.articleUrl,
        'User-Agent': 'Mozilla/5.0',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase().replace('image/jpg', 'image/jpeg').replace('image/apng', 'image/png');
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(contentType)) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 100 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
    return { contentType, bytes };
  } catch {
    return null;
  }
}

function bytesToDataUrl(contentType, bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunk)));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

async function currentState(env, doi) {
  const [toc, figureCountRow] = await Promise.all([
    env.DB.prepare('SELECT available, content_hash, reason, r2_key FROM toc_assets WHERE doi = ?').bind(doi).first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM figure_assets WHERE doi = ?').bind(doi).first(),
  ]);
  return {
    trueToc: Boolean(toc && Number(toc.available) === 1 && toc.r2_key),
    toc,
    figureCount: Number(figureCountRow?.count || 0),
  };
}

async function tocSuspicious(env, doi, toc) {
  if (!toc?.content_hash) return false;
  const [duplicate, nonFigureOne] = await Promise.all([
    env.DB.prepare(
      'SELECT COUNT(*) AS owners FROM toc_assets WHERE available = 1 AND content_hash = ?'
    ).bind(toc.content_hash).first(),
    env.DB.prepare(
      `SELECT COUNT(*) AS matches FROM figure_assets
       WHERE doi = ? AND content_hash = ? AND semantic_key <> 'figure-1'`
    ).bind(doi, toc.content_hash).first(),
  ]);
  return Number(duplicate?.owners || 0) > 1 || Number(nonFigureOne?.matches || 0) > 0;
}

async function updateRepairState(env, doi, result) {
  const previous = await env.DB.prepare(
    'SELECT attempts FROM media_repair_state WHERE doi = ?'
  ).bind(doi).first();
  const attempts = Number(previous?.attempts || 0) + 1;
  const now = Date.now();
  const delay = result.complete
    ? 24 * 60 * 60 * 1000
    : Math.min(15 * 60 * 1000, 90 * 1000 * Math.max(1, 2 ** Math.min(5, attempts - 1)));
  await env.DB.prepare(
    `INSERT INTO media_repair_state
      (doi, repair_version, attempts, last_attempt_at, next_retry_at, last_root_cause, last_outcome, reported_priority, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(doi) DO UPDATE SET
       repair_version = excluded.repair_version,
       attempts = excluded.attempts,
       last_attempt_at = excluded.last_attempt_at,
       next_retry_at = excluded.next_retry_at,
       last_root_cause = excluded.last_root_cause,
       last_outcome = excluded.last_outcome,
       updated_at = excluded.updated_at`
  ).bind(
    doi,
    REPAIR_VERSION,
    attempts,
    now,
    now + delay,
    result.rootCause,
    result.complete ? 'complete' : result.progress ? 'partial' : 'failed',
    now
  ).run();
}

export async function repairOne(env, doi) {
  const before = await currentState(env, doi);
  const suspicious = before.trueToc ? await tocSuspicious(env, doi, before.toc) : false;
  if (suspicious) {
    await quarantineToc(new Request('https://repair.internal/'), env, { doi, reason: 'cloud_repair_suspicious_toc' });
  }

  const pages = await collectPages(doi);
  let tocImported = false;
  let figuresImported = 0;
  let pageReachable = pages.length > 0;

  const tocCandidates = [];
  const figureGroups = new Map();
  for (const page of pages) {
    for (const candidate of extractTocCandidates(page.html, page.finalUrl)) {
      if (!tocCandidates.some(item => item.url === candidate.url)) tocCandidates.push(candidate);
    }
    for (const candidate of extractFigureCandidates(page.html, page.finalUrl)) {
      const alternatives = figureGroups.get(candidate.key) || [];
      if (!alternatives.some(item => item.url === candidate.url)) alternatives.push(candidate);
      figureGroups.set(candidate.key, alternatives);
    }
  }

  if (!before.trueToc || suspicious) {
    for (const candidate of tocCandidates) {
      const image = await downloadImage(candidate);
      if (!image) continue;
      const result = await importToc(new Request('https://repair.internal/'), env, {
        doi,
        articleUrl: candidate.articleUrl,
        imageData: bytesToDataUrl(image.contentType, image.bytes),
        replace: true,
      });
      if (result.status === 200) {
        tocImported = true;
        break;
      }
    }
  }

  const figureCandidates = [...figureGroups.values()]
    .sort((a, b) => (a[0]?.priority || 999) - (b[0]?.priority || 999))
    .slice(0, MAX_FIGURES);
  let order = 0;
  for (const alternatives of figureCandidates) {
    for (const candidate of alternatives) {
      const image = await downloadImage(candidate);
      if (!image) continue;
      const result = await importFigure(new Request('https://repair.internal/'), env, {
        doi,
        articleUrl: candidate.articleUrl,
        id: candidate.key,
        label: candidate.label,
        caption: candidate.caption,
        order,
        imageData: bytesToDataUrl(image.contentType, image.bytes),
      });
      if (result.status === 200) {
        figuresImported += 1;
        order += 1;
        break;
      }
    }
  }

  const after = await currentState(env, doi);
  const complete = after.trueToc && after.figureCount >= 2;
  const progress = tocImported || figuresImported > 0 || after.figureCount > before.figureCount || (!before.trueToc && after.trueToc);
  let rootCause = 'complete_cached';
  if (!complete) {
    if (!pageReachable) rootCause = 'publisher_html_unreachable';
    else if (!after.trueToc && tocCandidates.length === 0) rootCause = 'semantic_toc_not_found';
    else if (!after.trueToc) rootCause = 'toc_image_download_failed';
    else if (after.figureCount < 2 && figureGroups.size === 0) rootCause = 'body_figures_not_found';
    else if (after.figureCount < 2) rootCause = 'body_figure_download_failed';
    else rootCause = 'incomplete_media';
  }

  const result = {
    doi,
    complete,
    progress,
    rootCause,
    tocImported,
    figuresImported,
    trueToc: after.trueToc,
    figureCount: after.figureCount,
  };
  await updateRepairState(env, doi, result);
  return result;
}

export async function runRepairBatch(env, requestedLimit = 2) {
  const limit = Math.max(1, Math.min(4, Number(requestedLimit) || 2));
  const now = Date.now();
  const due = await env.DB.prepare(
    `SELECT doi FROM media_repair_state
     WHERE next_retry_at <= ?
     ORDER BY reported_priority DESC, next_retry_at ASC, attempts ASC
     LIMIT ?`
  ).bind(now, limit).all();
  const results = [];
  for (const row of due?.results || []) {
    if (!row?.doi) continue;
    try {
      results.push(await repairOne(env, String(row.doi).toLowerCase()));
    } catch (error) {
      const result = {
        doi: String(row.doi).toLowerCase(),
        complete: false,
        progress: false,
        rootCause: `repair_exception:${error instanceof Error ? error.message.slice(0, 120) : String(error).slice(0, 120)}`,
        tocImported: false,
        figuresImported: 0,
        trueToc: false,
        figureCount: 0,
      };
      await updateRepairState(env, result.doi, result);
      results.push(result);
    }
  }
  return {
    generatedAt: Date.now(),
    requested: limit,
    processed: results.length,
    results,
  };
}
