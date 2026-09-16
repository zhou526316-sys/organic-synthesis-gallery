import { gunzipSync } from 'node:zlib';
import { readFile, writeFile } from 'node:fs/promises';

const GAP_FILE = process.env.TOC_GAP_FILE || 'audit/toc-gap-dois-2026-09-16.json';
const REPORT_FILE = process.env.CHEMRXIV_REPORT || 'audit/chemrxiv-toc-gap-report.json';
const API = 'https://chemrxiv.org/engage/chemrxiv/public-api/v1/items';
const CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.CHEMRXIV_CONCURRENCY || 2)));
const DELAY_MS = Math.max(100, Number(process.env.CHEMRXIV_DELAY_MS || 250));

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function normalizeDoi(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned : null;
}

function doiFromRecord(record) {
  const direct = normalizeDoi(record?.doi);
  if (direct) return direct;
  if (typeof record?.url !== 'string') return null;
  try {
    const url = new URL(record.url);
    if (/^(?:dx\.)?doi\.org$/i.test(url.hostname)) return normalizeDoi(url.pathname.slice(1));
    const doiPath = url.pathname.match(/\/doi\/(?:abs\/|full\/|pdf\/|epdf\/)?(10\..+)$/i);
    if (doiPath) return normalizeDoi(doiPath[1]);
    const nature = url.pathname.match(/^\/articles\/(s\d+-\d+-\d+[a-z0-9-]*)$/i);
    if (/nature\.com$/i.test(url.hostname) && nature) return normalizeDoi(`10.1038/${nature[1]}`);
  } catch {}
  return null;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value) {
  return new Set(normalizeText(value).split(/\s+/).filter(token => token.length > 1));
}

function similarity(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let intersection = 0;
  for (const token of A) if (B.has(token)) intersection += 1;
  return (2 * intersection) / (A.size + B.size);
}

async function loadRecords() {
  const encoded = (await readFile('public/papers.gz.b64', 'utf8')).trim();
  const base = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
  const files = [
    'public/total-synthesis.json',
    'public/manual-supplement.json',
    'public/final-audit-supplement.json',
    'public/curated-supplement.json',
  ];
  const all = [...(Array.isArray(base) ? base : [])];
  for (const file of files) {
    try {
      const payload = JSON.parse(await readFile(file, 'utf8'));
      all.push(...(Array.isArray(payload?.papers) ? payload.papers : []));
    } catch {}
  }
  const byDoi = new Map();
  for (const record of all) {
    const doi = doiFromRecord(record);
    if (!doi) continue;
    const existing = byDoi.get(doi);
    if (!existing || (!existing?.title && record?.title)) byDoi.set(doi, record);
  }
  return byDoi;
}

async function fetchJson(url) {
  let last = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await sleep(attempt ? DELAY_MS * 2 ** attempt : DELAY_MS);
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'organic-synthesis-gallery-preprint-audit/1.0' },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 429 || response.status >= 500) { last = new Error(`HTTP ${response.status}`); continue; }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) { last = error; }
  }
  throw last || new Error('request failed');
}

function compactItem(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    id: item.id || item._id || item.itemId || null,
    title: item.title || '',
    doi: normalizeDoi(item.doi),
    version: item.version || null,
    statusDate: item.statusDate || item.publishedDate || null,
    license: item.license || item.licenseType || null,
    contentType: item.contentType || null,
    asset: item.asset || item.assets || null,
  };
}

async function searchOne(doi, record) {
  const title = String(record?.title || '').trim();
  if (title.length < 12) return { doi, title, state: 'missing_local_title', candidates: [] };
  const params = new URLSearchParams({ term: `"${title}"`, limit: '6', sort: 'RELEVANT_DESC' });
  try {
    const payload = await fetchJson(`${API}?${params}`);
    const hits = Array.isArray(payload?.itemHits) ? payload.itemHits : [];
    const candidates = hits.map(hit => compactItem(hit?.item || hit)).filter(Boolean).map(item => ({
      ...item,
      titleSimilarity: similarity(title, item.title),
    })).sort((a, b) => b.titleSimilarity - a.titleSimilarity);
    const best = candidates[0] || null;
    return {
      doi,
      title,
      state: best && best.titleSimilarity >= 0.82 ? 'matched' : 'no_confident_match',
      best: best && best.titleSimilarity >= 0.82 ? best : null,
      candidates: candidates.slice(0, 3),
      responseKeys: Object.keys(payload || {}).sort(),
      itemKeys: hits[0]?.item ? Object.keys(hits[0].item).sort() : [],
    };
  } catch (error) {
    return { doi, title, state: 'error', error: error instanceof Error ? error.message : String(error), candidates: [] };
  }
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

const gaps = JSON.parse(await readFile(GAP_FILE, 'utf8'));
const dois = [...new Set((gaps?.dois || []).map(normalizeDoi).filter(Boolean))];
const records = await loadRecords();
const results = await mapConcurrent(dois, CONCURRENCY, doi => searchOne(doi, records.get(doi)));
const matches = results.filter(item => item.state === 'matched');
const summary = {
  audited: results.length,
  withLocalTitle: results.filter(item => item.title).length,
  missingLocalTitle: results.filter(item => item.state === 'missing_local_title').length,
  confidentMatches: matches.length,
  errors: results.filter(item => item.state === 'error').length,
};
const report = { generatedAt: new Date().toISOString(), summary, matches, results };
await writeFile(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`CHEMRXIV_AUDIT_SUMMARY ${JSON.stringify(summary)}`);
for (const item of matches) console.log(`CHEMRXIV_MATCH ${JSON.stringify({ doi: item.doi, title: item.title, best: item.best })}`);
const schemaExample = results.find(item => item.itemKeys?.length);
if (schemaExample) console.log(`CHEMRXIV_SCHEMA ${JSON.stringify({ responseKeys: schemaExample.responseKeys, itemKeys: schemaExample.itemKeys })}`);
