const META_TYPES = new Map([
  ['citation_toc_graphic', 'toc_graphic'],
  ['citation_graphical_abstract', 'graphical_abstract'],
  ['citation_abstract_image', 'abstract_image'],
]);

const TYPE_SCORE = {
  toc_graphic: 1200,
  graphical_abstract: 1150,
  abstract_image: 1100,
  figure1_fallback: 300,
};

export function normalizeDoi(value = '') {
  const cleaned = String(value || '').trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned : '';
}

export function classifyPublisher(value = '') {
  const doi = normalizeDoi(value);
  if (doi.startsWith('10.1021/')) return 'acs';
  if (doi.startsWith('10.1002/')) return 'wiley';
  if (doi.startsWith('10.1039/')) return 'rsc';
  if (doi.startsWith('10.1016/')) return 'elsevier';
  if (doi.startsWith('10.1038/')) return 'nature';
  if (doi.startsWith('10.1126/')) return 'science';
  if (doi.startsWith('10.31635/')) return 'ccs';
  return 'other';
}

export function publisherFromUrl(value = '') {
  try {
    const hostname = new URL(String(value || '')).hostname.toLowerCase();
    if (hostname.endsWith('pubs.acs.org')) return 'acs';
    if (hostname.endsWith('onlinelibrary.wiley.com')) return 'wiley';
    if (hostname.endsWith('pubs.rsc.org')) return 'rsc';
    if (hostname.endsWith('sciencedirect.com') || hostname.endsWith('elsevier.com')) return 'elsevier';
    if (hostname.endsWith('nature.com') || hostname.endsWith('springernature.com')) return 'nature';
    if (hostname.endsWith('science.org')) return 'science';
    if (hostname.endsWith('chemsoc.org.cn') || hostname.endsWith('chinesechemsoc.org')) return 'ccs';
  } catch {}
  return '';
}

export function publisherHostMatches(publisher, value = '') {
  return publisherFromUrl(value) === String(publisher || '').toLowerCase();
}

function rscLandingUrl(doi) {
  const suffix = doi.split('/')[1] || '';
  const match = /^([a-z])(\d)([a-z]{2})/i.exec(suffix);
  if (!match) return '';
  return 'https://pubs.rsc.org/en/content/articlelanding/' + (2020 + Number(match[2])) + '/' + match[3].toLowerCase() + '/' + suffix.toLowerCase();
}

export function articleUrlsForDoi(value = '') {
  const doi = normalizeDoi(value);
  if (!doi) return [];
  const publisher = classifyPublisher(doi);
  const rows = [];
  const add = (url, source) => {
    if (url && !rows.some(item => item.url === url)) rows.push({ url, source, publisher });
  };
  if (publisher === 'acs') {
    add('https://pubs.acs.org/doi/' + doi, 'article');
    add('https://pubs.acs.org/doi/abs/' + doi, 'abstract_page');
    add('https://pubs.acs.org/doi/full/' + doi, 'full_page');
    add('https://pubs.acs.org/action/doSearch?AllField=' + encodeURIComponent(doi), 'search_listing');
  } else if (publisher === 'wiley') {
    add('https://onlinelibrary.wiley.com/doi/' + doi, 'article');
    add('https://onlinelibrary.wiley.com/doi/abs/' + doi, 'abstract_page');
    add('https://onlinelibrary.wiley.com/doi/full/' + doi, 'full_page');
  } else if (publisher === 'rsc') {
    add(rscLandingUrl(doi), 'article_landing');
    add('https://doi.org/' + doi, 'doi_redirect');
  } else if (publisher === 'elsevier') {
    add('https://doi.org/' + doi, 'doi_redirect');
    add('https://www.sciencedirect.com/search?qs=' + encodeURIComponent(doi), 'search_listing');
  } else if (publisher === 'nature') {
    add('https://www.nature.com/articles/' + doi.split('/')[1], 'article');
    add('https://doi.org/' + doi, 'doi_redirect');
  } else if (publisher === 'science') {
    add('https://www.science.org/doi/' + doi, 'article');
    add('https://www.science.org/doi/full/' + doi, 'full_page');
    add('https://doi.org/' + doi, 'doi_redirect');
  } else if (publisher === 'ccs') {
    add('https://doi.org/' + doi, 'doi_redirect');
  } else {
    add('https://doi.org/' + doi, 'doi_redirect');
  }
  return rows;
}

export function primaryArticleUrlForDoi(value = '') {
  const doi = normalizeDoi(value);
  return articleUrlsForDoi(doi)[0]?.url || (doi ? 'https://doi.org/' + doi : '');
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

function stripHtml(value) {
  return decodeHtml(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function attrs(tag) {
  const out = {};
  for (const match of String(tag || '').matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/g)) {
    out[String(match[1] || '').toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return out;
}

function absoluteUrl(raw, base) {
  if (!raw) return '';
  try {
    const url = new URL(decodeHtml(raw).trim(), base);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function imageSources(tag, pageUrl) {
  const a = attrs(tag);
  const sources = [];
  const add = raw => {
    const src = absoluteUrl(raw, pageUrl);
    if (src && !sources.includes(src)) sources.push(src);
  };
  for (const key of ['data-lg-src','data-hi-res-src','data-src-large','data-full-src','data-full','data-original','data-src','data-lazy-src','data-image-src','data-image','data-url']) add(a[key]);
  for (const key of ['data-srcset','srcset']) {
    const parts = String(a[key] || '').split(',').map(part => part.trim()).filter(Boolean).reverse();
    for (const part of parts) add(part.split(/\s+/)[0]);
  }
  add(a.src);
  return { attrs: a, sources };
}

function rejectContext(value) {
  return /journal[\s_-]*cover|issue[\s_-]*cover|cover[\s_-]*image|masthead|site[-_ ]?logo|favicon|avatar|author[-_ ]photo|advert|banner|spinner|loading|tracking|pixel|cookie|placeholder/i.test(String(value || ''));
}

function assetType(text, publisher) {
  const t = String(text || '');
  if (/toc\s*(?:and\s*abstract\s*)?(?:graphic|image)|table\s*of\s*contents\s*(?:graphic|image)/i.test(t)) return 'toc_graphic';
  if (/graphical\s*abstract|visual\s*abstract|graphical\s*(?:summary|synopsis)|visual\s*summary/i.test(t)) return 'graphical_abstract';
  if (/abstract\s*(?:graphic|image)/i.test(t)) return 'abstract_image';
  if (publisher === 'wiley' && /first\s+page\s+image/i.test(t)) return 'graphical_abstract';
  return '';
}

function isFigureOne(text) {
  return /(^|\b)fig(?:ure)?\.?\s*1(\b|[:.)])/i.test(String(text || ''));
}

function addCandidate(map, raw, pageUrl, data) {
  const src = absoluteUrl(raw, pageUrl);
  if (!src) return;
  const text = String(data.text || '').replace(/\s+/g, ' ').trim();
  if (rejectContext(src + ' ' + text)) return;
  const type = data.assetType || assetType(text, data.publisher) || (data.kind === 'figure1' ? 'figure1_fallback' : '');
  const kind = type === 'figure1_fallback' ? 'figure1' : type ? 'official' : '';
  if (!kind) return;
  const width = Number(data.width) || 0;
  const height = Number(data.height) || 0;
  const score = (TYPE_SCORE[type] || 0) + Number(data.bonus || 0) + Math.min(30, width && height ? width * height / 100000 : 0);
  const item = { src, url: src, text, kind, assetType: type, publisher: data.publisher, source: data.source || 'html', score, width, height };
  const old = map.get(src);
  if (!old || item.score > old.score) map.set(src, item);
}

function windows(source, regex) {
  const rows = [];
  let count = 0;
  for (const match of source.matchAll(regex)) {
    rows.push(source.slice(match.index, Math.min(source.length, match.index + 7000)));
    if (++count >= 30) break;
  }
  return rows;
}

function fragmentImages(fragment, pageUrl) {
  const rows = [];
  for (const tag of String(fragment || '').match(/<(?:img|source)\b[^>]*>/gi) || []) {
    const parsed = imageSources(tag, pageUrl);
    for (const src of parsed.sources) rows.push({ src, attrs: parsed.attrs });
  }
  return rows;
}

export function extractPublisherMediaCandidates(html, pageUrl, options = {}) {
  const publisher = options.publisher || classifyPublisher(options.doi) || publisherFromUrl(pageUrl) || 'other';
  const source = decodeHtml(html);
  const map = new Map();
  const figureOneSources = new Set();

  // A nearby graphical-abstract heading must never upgrade an explicitly
  // numbered Figure 1. Semantic windows can span multiple sibling blocks on
  // publisher pages, so mark Figure 1 URLs before scoring TOC candidates.
  for (const block of source.match(/<figure\b[\s\S]{0,70000}?<\/figure>/gi) || []) {
    const context = stripHtml(block).slice(0, 2200);
    if (!isFigureOne(context) || assetType(context, publisher)) continue;
    for (const item of fragmentImages(block, pageUrl)) figureOneSources.add(item.src);
  }

  for (const tag of source.match(/<meta\b[^>]*>/gi) || []) {
    const a = attrs(tag);
    const key = String(a.name || a.property || a.itemprop || '').toLowerCase();
    const type = META_TYPES.get(key);
    if (type) addCandidate(map, a.content, pageUrl, { publisher, source: 'publisher_metadata', assetType: type, text: key, bonus: 250 });
  }

  const strong = /toc\s*(?:and\s*abstract\s*)?(?:graphic|image)|graphical\s*abstract|visual\s*abstract|graphical\s*(?:summary|synopsis)|visual\s*summary|abstract\s*(?:graphic|image)|table\s*of\s*contents\s*(?:graphic|image)|first\s+page\s+image/gi;
  for (const fragment of windows(source, strong)) {
    const context = stripHtml(fragment).slice(0, 2500);
    const type = assetType(context, publisher);
    if (!type) continue;
    const images = fragmentImages(fragment, pageUrl);
    for (const [index, item] of images.entries()) {
      const ownMarker = [item.attrs.alt,item.attrs.title,item.attrs.id,item.attrs.class,item.attrs['aria-label']].filter(Boolean).join(' ');
      const ownType = assetType(ownMarker, publisher);
      if (!ownType && (index > 0 || figureOneSources.has(item.src))) continue;
      const marker = [ownMarker, context].filter(Boolean).join(' ');
      addCandidate(map, item.src, pageUrl, { publisher, source: publisher + '_semantic_block', assetType: ownType || type, text: marker, width: item.attrs.width, height: item.attrs.height, bonus: 170 });
    }
  }

  let figures = 0;
  for (const block of source.match(/<figure\b[\s\S]{0,70000}?<\/figure>/gi) || []) {
    if (++figures > 100) break;
    const context = stripHtml(block).slice(0, 2200);
    const type = assetType(context, publisher);
    const fig1 = isFigureOne(context);
    if (!type && !fig1) continue;
    for (const item of fragmentImages(block, pageUrl)) {
      const marker = [item.attrs.alt,item.attrs.title,item.attrs.id,item.attrs.class,context].filter(Boolean).join(' ');
      addCandidate(map, item.src, pageUrl, {
        publisher,
        source: type ? publisher + '_figure_semantic' : publisher + '_figure1',
        assetType: type || 'figure1_fallback',
        kind: type ? 'official' : 'figure1',
        text: marker,
        width: item.attrs.width,
        height: item.attrs.height,
        bonus: type ? 130 : 0,
      });
    }
  }

  let images = 0;
  for (const tag of source.match(/<img\b[^>]*>/gi) || []) {
    if (++images > 700) break;
    const parsed = imageSources(tag, pageUrl);
    const marker = [parsed.attrs.alt,parsed.attrs.title,parsed.attrs.id,parsed.attrs.class,parsed.attrs['aria-label']].filter(Boolean).join(' ');
    const type = assetType(marker, publisher);
    const fig1 = isFigureOne(marker);
    if (!type && !fig1) continue;
    for (const src of parsed.sources) addCandidate(map, src, pageUrl, {
      publisher,
      source: type ? publisher + '_image_marker' : publisher + '_figure1',
      assetType: type || 'figure1_fallback',
      kind: type ? 'official' : 'figure1',
      text: marker,
      width: parsed.attrs.width,
      height: parsed.attrs.height,
      bonus: type ? 100 : 0,
    });
  }

  return [...map.values()].sort((a, b) => b.score - a.score || a.src.localeCompare(b.src));
}

export function pickBestPublisherMediaCandidate(html, pageUrl, options = {}) {
  const rows = extractPublisherMediaCandidates(html, pageUrl, options);
  return rows.find(item => item.kind === 'official') || rows.find(item => item.kind === 'figure1') || null;
}
