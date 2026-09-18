import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCES = [
  { path: 'public/papers.gz.b64', kind: 'gzip-base64' },
  { path: 'public/total-synthesis.json', kind: 'json-papers' },
  { path: 'public/manual-supplement.json', kind: 'json-papers' },
  { path: 'public/final-audit-supplement.json', kind: 'json-papers' },
  { path: 'public/curated-supplement.json', kind: 'json-papers' },
  { path: 'public/automation-supplement.json', kind: 'json-papers' },
  { path: 'public/literature-supplement.json', kind: 'json-papers' },
];

const MAX_CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.AUTHOR_BACKFILL_CONCURRENCY || 5)));
const RETRIES = 4;
const EXCLUDED_DOIS = new Set(['10.1038/s41467-026-77616-8', '10.1021/jacs.6c13738']);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function normalizeDoi(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
}

function normalizeAuthors(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => typeof item === 'string')
    .map(item => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function authorName(author) {
  if (!author || typeof author !== 'object') return '';
  if (typeof author.name === 'string' && author.name.trim()) return author.name.trim();
  const pieces = [
    typeof author.given === 'string' ? author.given.trim() : '',
    typeof author.family === 'string' ? author.family.trim() : '',
    typeof author.suffix === 'string' ? author.suffix.trim() : '',
  ].filter(Boolean);
  return pieces.join(' ').replace(/\s+/g, ' ').trim();
}

function identity(paper) {
  const doi = normalizeDoi(paper?.doi);
  if (doi) return `doi:${doi}`;
  const journal = String(paper?.journal || '').trim().toLowerCase();
  const date = String(paper?.date || '').trim();
  const title = String(paper?.title || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `meta:${journal}|${date}|${title}`;
}

async function loadSource(source) {
  const full = path.join(ROOT, source.path);
  try {
    if (source.kind === 'gzip-base64') {
      const encoded = (await readFile(full, 'utf8')).trim();
      const records = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
      return { ...source, exists: true, full, payload: records, papers: records };
    }
    const payload = JSON.parse(await readFile(full, 'utf8'));
    const papers = Array.isArray(payload?.papers) ? payload.papers : [];
    return { ...source, exists: true, full, payload, papers };
  } catch (error) {
    if (error?.code === 'ENOENT') return { ...source, exists: false, full, payload: null, papers: [] };
    throw error;
  }
}

async function crossrefAuthors(doi) {
  const endpoint = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  let lastError = null;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'organic-synthesis-gallery-author-backfill/1.0 (+https://github.com/zhou526316-sys/organic-synthesis-gallery)',
        },
        signal: AbortSignal.timeout(25_000),
      });
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get('retry-after') || 0);
        await sleep(Math.max(retryAfter * 1000, 800 * 2 ** attempt));
        continue;
      }
      if (!response.ok) throw new Error(`Crossref HTTP ${response.status}`);
      const payload = await response.json();
      const rows = Array.isArray(payload?.message?.author) ? payload.message.author : [];
      return rows.map(authorName).filter(Boolean);
    } catch (error) {
      lastError = error;
      if (attempt + 1 < RETRIES) await sleep(900 * 2 ** attempt);
    }
  }
  console.warn(`AUTHOR_BACKFILL_LOOKUP_FAILED ${JSON.stringify({ doi, error: String(lastError?.message || lastError || 'unknown') })}`);
  return [];
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

const sources = (await Promise.all(SOURCES.map(loadSource))).filter(source => source.exists);
for (const source of sources) {
  source.papers = source.papers.filter(paper => !EXCLUDED_DOIS.has(normalizeDoi(paper?.doi)));
  if (source.kind === 'gzip-base64') source.payload = source.papers;
  else if (source.payload && typeof source.payload === 'object') source.payload.papers = source.papers;
}
const records = [];
for (const source of sources) {
  for (const paper of source.papers) records.push({ source, paper });
}

const authorsByDoi = new Map();
for (const { paper } of records) {
  const doi = normalizeDoi(paper?.doi);
  const authors = normalizeAuthors(paper?.authors);
  if (doi && authors.length && !authorsByDoi.has(doi)) authorsByDoi.set(doi, authors);
}

const doiTargets = [...new Set(records
  .map(({ paper }) => normalizeDoi(paper?.doi))
  .filter(Boolean)
  .filter(doi => !authorsByDoi.has(doi)))].sort();

console.log(`AUTHOR_BACKFILL_BEGIN ${JSON.stringify({ sources: sources.length, records: records.length, missingDoiAuthors: doiTargets.length })}`);

const lookupResults = await mapConcurrent(doiTargets, MAX_CONCURRENCY, async (doi, index) => {
  const authors = await crossrefAuthors(doi);
  if (authors.length) authorsByDoi.set(doi, authors);
  if ((index + 1) % 25 === 0 || index + 1 === doiTargets.length) {
    console.log(`AUTHOR_BACKFILL_PROGRESS ${index + 1}/${doiTargets.length}`);
  }
  return { doi, count: authors.length };
});

for (const { paper } of records) {
  const doi = normalizeDoi(paper?.doi);
  const authors = doi ? authorsByDoi.get(doi) || [] : normalizeAuthors(paper?.authors);
  paper.authors = authors;
}

for (const source of sources) {
  if (source.kind === 'gzip-base64') {
    const json = JSON.stringify(source.payload);
    const compressed = gzipSync(Buffer.from(json), { level: 9 });
    await writeFile(source.full, compressed.toString('base64'));
  } else {
    await writeFile(source.full, JSON.stringify(source.payload));
  }
}

const unique = new Map();
for (const { source, paper } of records) {
  const key = identity(paper);
  const existing = unique.get(key) || {
    doi: normalizeDoi(paper?.doi) || null,
    title: paper?.title || null,
    journal: paper?.journal || null,
    date: paper?.date || null,
    authors: [],
    sources: [],
  };
  const authors = normalizeAuthors(paper?.authors);
  if (authors.length > existing.authors.length) existing.authors = authors;
  if (!existing.sources.includes(source.path)) existing.sources.push(source.path);
  unique.set(key, existing);
}

const papers = [...unique.values()];
const missing = papers.filter(item => !item.authors.length);
const coverage = {
  generatedAt: new Date().toISOString(),
  total: papers.length,
  withAuthors: papers.length - missing.length,
  missingAuthors: missing.length,
  crossrefLookups: lookupResults.length,
  sourceFiles: sources.map(source => source.path),
};
await writeFile(path.join(ROOT, 'audit/author-coverage.json'), JSON.stringify(coverage, null, 2));
await writeFile(path.join(ROOT, 'audit/missing-authors.json'), JSON.stringify({
  ...coverage,
  papers: missing,
}, null, 2));

console.log(`AUTHOR_BACKFILL_SUMMARY ${JSON.stringify(coverage)}`);
if (missing.length) console.error(JSON.stringify(missing.slice(0, 30), null, 2));
