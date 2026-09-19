import { importFigure, importToc, quarantineToc } from './media-write.js';
import { importPrimaryVisual } from './primary-visual.js';
import { claimMediaJobs, completeMediaJob, failMediaJob, startMediaJob } from './media-jobs.js';

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
const MAX_IMAGE_BYTES = 4_000_000;
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

function natureMediaObjectCandidates(doi, articleUrl) {
  const match = /^10\.1038\/(s(\d+)-(\d{3})-(\d+)-[a-z0-9]+)$/i.exec(String(doi || ''));
  if (!match) return { toc: [], figures: [] };
  const slug = match[1];
  const journalId = match[2];
  const year = 2000 + Number(match[3]);
  const articleNumber = String(Number(match[4]));
  if (!Number.isFinite(year) || !articleNumber || articleNumber === 'NaN') return { toc: [], figures: [] };
  const encodedArticle = encodeURIComponent(`10.1038/${slug}`);
  const prefix = `https://media.springernature.com/full/springer-static/image/art%3A${encodedArticle}/MediaObjects/${journalId}_${year}_${articleNumber}_`;
  const variants = suffix => [`${prefix}${suffix}_HTML.png`, `${prefix}${suffix}_HTML.jpg`];
  return {
    toc: variants('Figa').map(url => ({
      url,
      score: 560,
      articleUrl,
      source: 'springer_nature_mediaobject',
      primaryKind: 'official_visual',
      confidence: 96,
      label: 'Graphical Abstract / TOC',
    })),
    figures: variants('Fig1').map(url => ({
      key: 'figure-1',
      label: 'Figure 1',
      caption: 'Figure 1',
      url,
      articleUrl,
      priority: 10,
      order: -1,
      source: 'springer_nature_mediaobject',
      primaryKind: 'figure1',
      confidence: 92,
    })),
  };
}

function imageDimensions(contentType, bytes) {
  try {
    if (contentType === 'image/png' && bytes.length >= 24 &&
        bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (contentType === 'image/jpeg' && bytes.length > 4) {
      let offset = 2;
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) { offset += 1; continue; }
        const marker = bytes[offset + 1];
        if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
        if (offset + 4 >= bytes.length) break;
        const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
        if (length < 2 || offset + 2 + length > bytes.length) break;
        if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
          return {
            height: (bytes[offset + 5] << 8) + bytes[offset + 6],
            width: (bytes[offset + 7] << 8) + bytes[offset + 8],
          };
        }
        offset += 2 + length;
      }
    }
  } catch {}
  return { width: 0, height: 0 };
}

function primaryConfidence(candidate, image) {
  const base = Number(candidate?.confidence || (candidate?.primaryKind === 'official_visual' ? 94 : candidate?.primaryKind === 'figure1' ? 88 : 75));
  const longEdge = Math.max(Number(image?.width || 0), Number(image?.height || 0));
  const resolutionBonus = longEdge >= 1800 ? 3 : longEdge >= 1200 ? 2 : longEdge >= 800 ? 1 : 0;
  return Math.min(100, base + resolutionBonus);
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
    const dimensions = imageDimensions(contentType, bytes);
    if (dimensions.width && dimensions.height && (dimensions.width < 220 || dimensions.height < 120)) return null;
    return { contentType, bytes, ...dimensions };
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
  const [toc, figureCountRow, figureOneRow, primary] = await Promise.all([
    env.DB.prepare('SELECT available, content_hash, reason, r2_key FROM toc_assets WHERE doi = ?').bind(doi).first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM figure_assets WHERE doi = ?').bind(doi).first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM figure_assets WHERE doi = ? AND semantic_key = 'figure-1'").bind(doi).first(),
    env.DB.prepare('SELECT kind, source, confidence, r2_key FROM primary_visual_assets WHERE doi = ?').bind(doi).first(),
  ]);
  return {
    trueToc: Boolean(toc && Number(toc.available) === 1 && toc.r2_key),
    toc,
    figureCount: Number(figureCountRow?.count || 0),
    figureOne: Number(figureOneRow?.count || 0) > 0,
    primary,
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

export async function repairOne(env, doi, { updateLegacyState = true } = {}) {
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
  if (String(doi).startsWith('10.1038/')) {
    const articleUrl = `https://www.nature.com/articles/${String(doi).split('/')[1]}`;
    const nature = natureMediaObjectCandidates(doi, articleUrl);
    tocCandidates.push(...nature.toc);
    if (nature.figures.length) figureGroups.set('figure-1', [...nature.figures]);
  }
  for (const page of pages) {
    for (const candidate of extractTocCandidates(page.html, page.finalUrl)) {
      if (!tocCandidates.some(item => item.url === candidate.url)) tocCandidates.push({
        ...candidate,
        source: candidate.source || (String(doi).startsWith('10.1126/') ? 'aaas_publisher_html' : 'publisher_html'),
        primaryKind: 'official_visual',
        confidence: 94,
        label: 'Graphical Abstract / TOC',
      });
    }
    for (const candidate of extractFigureCandidates(page.html, page.finalUrl)) {
      const alternatives = figureGroups.get(candidate.key) || [];
      if (!alternatives.some(item => item.url === candidate.url)) alternatives.push({
        ...candidate,
        source: candidate.source || (String(doi).startsWith('10.1038/') ? 'springer_nature_html' : String(doi).startsWith('10.1126/') ? 'aaas_publisher_html' : 'publisher_html'),
        primaryKind: candidate.key === 'figure-1' ? 'figure1' : 'article_figure',
        confidence: candidate.key === 'figure-1' ? 88 : 76,
      });
      figureGroups.set(candidate.key, alternatives);
    }
  }

  if (!before.trueToc || suspicious) {
    for (const candidate of tocCandidates) {
      const image = await downloadImage(candidate);
      if (!image) continue;
      const imageData = bytesToDataUrl(image.contentType, image.bytes);
      const result = await importToc(new Request('https://repair.internal/'), env, {
        doi,
        articleUrl: candidate.articleUrl,
        imageData,
        replace: true,
      });
      if (result.status === 200) {
        tocImported = true;
        await importPrimaryVisual(new Request('https://repair.internal/'), env, {
          doi,
          kind: 'official_visual',
          source: candidate.source || 'publisher_html',
          sourceUrl: candidate.url,
          articleUrl: candidate.articleUrl,
          caption: candidate.label || 'Graphical Abstract / TOC',
          confidence: primaryConfidence(candidate, image),
          width: image.width,
          height: image.height,
          imageData,
        });
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
      const imageData = bytesToDataUrl(image.contentType, image.bytes);
      const result = await importFigure(new Request('https://repair.internal/'), env, {
        doi,
        articleUrl: candidate.articleUrl,
        id: candidate.key,
        label: candidate.label,
        caption: candidate.caption,
        order,
        imageData,
      });
      if (result.status === 200) {
        figuresImported += 1;
        if (candidate.primaryKind === 'figure1' || (candidate.primaryKind === 'article_figure' && order === 0)) {
          await importPrimaryVisual(new Request('https://repair.internal/'), env, {
            doi,
            kind: candidate.primaryKind,
            source: candidate.source || 'publisher_html',
            sourceUrl: candidate.url,
            articleUrl: candidate.articleUrl,
            caption: candidate.caption || candidate.label,
            confidence: primaryConfidence(candidate, image),
            width: image.width,
            height: image.height,
            imageData,
          });
        }
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
    figureOne: after.figureOne,
    primaryKind: after.primary?.kind || (after.trueToc ? 'official_visual' : after.figureOne ? 'figure1' : ''),
    primarySource: after.primary?.source || (after.trueToc ? 'legacy_toc' : after.figureOne ? 'publisher_figure1' : ''),
    confidence: Number(after.primary?.confidence || (after.trueToc ? 85 : after.figureOne ? 80 : 0)),
  };
  if (updateLegacyState) await updateRepairState(env, doi, result);
  return result;
}

export async function runLeaseRepairBatch(env, requestedLimit = 2, mode = 'coverage', owner = 'cloudflare-cron') {
  const limit = Math.max(1, Math.min(8, Number(requestedLimit) || 2));
  const claim = await claimMediaJobs(env, { owner, mode: mode === 'upgrade' ? 'upgrade' : 'coverage', limit, leaseMs: 8 * 60 * 1000 });
  const items = claim?.body?.items || [];
  const results = [];
  for (const item of items) {
    const doi = String(item.doi || '').toLowerCase();
    const started = await startMediaJob(env, { doi, owner, leaseMs: 8 * 60 * 1000 });
    if (started.status !== 200) continue;
    try {
      const result = await repairOne(env, doi, { updateLegacyState: false });
      if (result.primaryKind) {
        const completed = await completeMediaJob(env, {
          doi,
          owner,
          visualKind: result.primaryKind,
          visualSource: result.primarySource || 'cloudflare-resolver',
          confidence: result.confidence || 0,
        });
        results.push({ ...result, jobState: completed.body?.state || 'unknown' });
      } else {
        const failed = await failMediaJob(env, {
          doi,
          owner,
          reason: result.rootCause || 'semantic_media_not_found',
          retryMs: mode === 'upgrade' ? 7 * 24 * 60 * 60 * 1000 : undefined,
          auditedUnresolved: false,
        });
        results.push({ ...result, jobState: failed.body?.state || 'unknown' });
      }
    } catch (error) {
      const reason = `repair_exception:${error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160)}`;
      await failMediaJob(env, { doi, owner, reason });
      results.push({ doi, complete: false, progress: false, rootCause: reason, jobState: 'retry_wait' });
    }
  }
  return { generatedAt: Date.now(), requested: limit, claimed: items.length, processed: results.length, mode, results };
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