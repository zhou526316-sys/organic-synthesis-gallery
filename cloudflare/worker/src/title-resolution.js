import { normalizeDoi } from './media.js';

function cleanTitle(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function invalidTitle(value) {
  const title = cleanTitle(value);
  if (!title || title.length < 5 || title.length > 800) return true;
  const normalized = title.toLowerCase().replace(/[：:….]/g, '').replace(/\s+/g, ' ');
  if ([
    'title pending verification', 'title pending', 'pending verification',
    'pending title verification', '标题待核验', '待核验', '标题待确认', '待确认',
  ].includes(normalized)) return true;
  return /cloudflare|checking your browser|verify you are human|enable javascript|access denied|page not found/i.test(normalized);
}

function titleKey(value) {
  return cleanTitle(value)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/α/g, ' alpha ')
    .replace(/β/g, ' beta ')
    .replace(/γ/g, ' gamma ')
    .replace(/δ/g, ' delta ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function strictTitleSimilarity(left, right) {
  const a = titleKey(left);
  const b = titleKey(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aSet = new Set(a.split(' ').filter(Boolean));
  const bSet = new Set(b.split(' ').filter(Boolean));
  if (aSet.size < 4 || bSet.size < 4) return 0;
  let overlap = 0;
  for (const token of aSet) if (bSet.has(token)) overlap += 1;
  const union = aSet.size + bSet.size - overlap;
  const jaccard = union ? overlap / union : 0;
  const containment = overlap / Math.min(aSet.size, bSet.size);
  return jaccard * 0.72 + containment * 0.28;
}

function crossrefContainerName(journal) {
  if (/^angew/i.test(journal)) return 'Angewandte Chemie International Edition';
  if (/^jacs$/i.test(journal)) return 'Journal of the American Chemical Society';
  if (/^organic letters$/i.test(journal) || /^org\.?\s*lett/i.test(journal)) return 'Organic Letters';
  if (/^acs catalysis$/i.test(journal) || /^acs catal/i.test(journal)) return 'ACS Catalysis';
  return journal;
}

function journalMatches(journal, containers) {
  if (!String(journal || '').trim()) return true;
  const target = titleKey(crossrefContainerName(journal));
  if (!target) return true;
  return containers.some(value => {
    const candidate = titleKey(value);
    return candidate === target || candidate.includes(target) || target.includes(candidate);
  });
}

function doiFromArticleUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (/^(?:dx\.)?doi\.org$/i.test(url.hostname)) return normalizeDoi(url.pathname.slice(1));
    const doiPath = url.pathname.match(/\/doi\/(?:abs\/|full\/|pdf\/|epdf\/)?(10\..+)$/i);
    if (doiPath) return normalizeDoi(doiPath[1]);
    const nature = url.pathname.match(/^\/articles\/(s\d+-\d+-\d+[a-z0-9-]*)$/i);
    if (/nature\.com$/i.test(url.hostname) && nature) return normalizeDoi(`10.1038/${nature[1]}`);
  } catch {
    return null;
  }
  return null;
}

async function fetchJson(url, timeoutMs = 6500) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'OrganicSynthesisGallery/2.0' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) return null;
  return response.json();
}

async function crossrefTitleForDoi(doi) {
  try {
    const data = await fetchJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, 5000);
    const title = Array.isArray(data?.message?.title) && typeof data.message.title[0] === 'string'
      ? cleanTitle(data.message.title[0])
      : '';
    return invalidTitle(title) ? null : title;
  } catch {
    return null;
  }
}

async function openAlexTitleForDoi(doi) {
  try {
    const data = await fetchJson(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`, 5000);
    const value = typeof data?.title === 'string'
      ? data.title
      : typeof data?.display_name === 'string'
        ? data.display_name
        : '';
    const title = cleanTitle(value);
    return invalidTitle(title) ? null : title;
  } catch {
    return null;
  }
}

async function crossrefByTitle(title, journal) {
  const normalizedInput = titleKey(title);
  if (normalizedInput.length < 12) return null;
  try {
    const params = new URLSearchParams({ 'query.title': title, rows: '10' });
    if (String(journal || '').trim()) params.set('query.container-title', crossrefContainerName(journal));
    const data = await fetchJson(`https://api.crossref.org/works?${params}`, 6500);
    const byDoi = new Map();
    for (const item of data?.message?.items || []) {
      const candidateTitle = Array.isArray(item?.title) && typeof item.title[0] === 'string'
        ? cleanTitle(item.title[0])
        : '';
      const doi = normalizeDoi(item?.DOI);
      const containers = Array.isArray(item?.['container-title'])
        ? item['container-title'].filter(value => typeof value === 'string')
        : [];
      if (!candidateTitle || !doi || invalidTitle(candidateTitle) || !journalMatches(journal, containers)) continue;
      const score = strictTitleSimilarity(title, candidateTitle);
      if (score < 0.94) continue;
      const previous = byDoi.get(doi);
      if (!previous || score > previous.score) byDoi.set(doi, { title: candidateTitle, doi, score });
    }
    const candidates = [...byDoi.values()].sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best) return null;
    const second = candidates[1];
    if (second && second.doi !== best.doi && second.score >= best.score - 0.015) return null;
    return best;
  } catch {
    return null;
  }
}

async function uniqueCrossrefWork(journal, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return null;
  try {
    const params = new URLSearchParams({
      filter: `from-online-pub-date:${date},until-online-pub-date:${date}`,
      'query.container-title': crossrefContainerName(journal),
      rows: '20',
    });
    const data = await fetchJson(`https://api.crossref.org/works?${params}`, 6000);
    const candidates = [];
    for (const item of data?.message?.items || []) {
      const title = Array.isArray(item?.title) && typeof item.title[0] === 'string' ? cleanTitle(item.title[0]) : '';
      const containers = Array.isArray(item?.['container-title']) ? item['container-title'].filter(value => typeof value === 'string') : [];
      if (!title || invalidTitle(title) || !journalMatches(journal, containers)) continue;
      candidates.push({ title, doi: normalizeDoi(item?.DOI) || undefined });
    }
    return candidates.length === 1 ? candidates[0] : null;
  } catch {
    return null;
  }
}

async function readCached(env, identity) {
  if (!env?.DB) return null;
  const row = await env.DB.prepare(
    'SELECT title, doi FROM paper_title_resolution WHERE identity = ?'
  ).bind(identity).first();
  if (!row || invalidTitle(row.title)) return null;
  return { title: cleanTitle(row.title), doi: normalizeDoi(row.doi) || undefined };
}

async function writeCached(env, identity, title, doi) {
  if (!env?.DB) return;
  await env.DB.prepare(
    `INSERT INTO paper_title_resolution (identity, title, doi, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(identity) DO UPDATE SET
       title = excluded.title,
       doi = excluded.doi,
       updated_at = excluded.updated_at`
  ).bind(identity, title, doi || null, Date.now()).run();
}

async function resolveOne(env, item) {
  if (!item || typeof item.key !== 'string' || !item.key || item.key.length > 100) return null;
  const knownTitle = typeof item.title === 'string' && !invalidTitle(item.title) ? cleanTitle(item.title) : '';
  let doi = normalizeDoi(item.doi) || doiFromArticleUrl(item.url);
  const journal = typeof item.journal === 'string' ? item.journal.trim() : '';
  const date = typeof item.date === 'string' ? item.date.trim() : '';
  const identity = doi || (typeof item.url === 'string' && item.url.trim()) || `${journal}|${date}|${titleKey(knownTitle) || item.key}`;

  const cached = await readCached(env, identity);
  if (cached && (!knownTitle || doi || cached.doi)) return { key: item.key, ...cached };

  let title = doi ? await crossrefTitleForDoi(doi) : null;
  if (!doi && knownTitle) {
    const matched = await crossrefByTitle(knownTitle, journal);
    if (matched) {
      doi = matched.doi;
      title = matched.title;
    }
  }
  if (!title && doi) title = await openAlexTitleForDoi(doi);
  if (!title && !doi && !knownTitle && journal && date) {
    const unique = await uniqueCrossrefWork(journal, date);
    if (unique) {
      doi = unique.doi || null;
      title = unique.title;
    }
  }

  // If a title is already known, never return a guessed replacement unless a DOI was
  // matched to it at the strict Crossref threshold. This prevents title/DOI drift.
  if (knownTitle && !doi) return null;
  if (!title || invalidTitle(title)) return null;

  await writeCached(env, identity, title, doi);
  return { key: item.key, title, doi: doi || undefined };
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

export async function resolvePaperTitles(env, payload) {
  const papers = Array.isArray(payload?.papers) ? payload.papers.slice(0, 200) : [];
  const results = await mapConcurrent(papers, 8, item => resolveOne(env, item));
  return {
    status: 200,
    body: { papers: results.filter(Boolean) },
  };
}
