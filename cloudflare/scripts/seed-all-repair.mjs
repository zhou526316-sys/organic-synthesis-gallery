import { gunzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';

const SOURCE_API = process.env.SOURCE_API || 'https://api-v2.appdeploy.ai/app/organic-synthesis-literature-gallery-ase43k';
const TARGET_API_BASE = (process.env.TARGET_API_BASE || 'https://organic-synthesis-gallery.zhou526316.workers.dev').replace(/\/$/, '');

function normalizeDoi(value) {
  if (typeof value !== 'string') return null;
  let cleaned = value.trim();
  try { cleaned = decodeURIComponent(cleaned); } catch { return null; }
  cleaned = cleaned
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '')
    .toLowerCase();
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

async function jsonFetch(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(25000) });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

async function loadLocalRecords() {
  const encoded = (await readFile('public/papers.gz.b64', 'utf8')).trim();
  const base = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
  const supplementFiles = ['public/total-synthesis.json', 'public/manual-supplement.json', 'public/final-audit-supplement.json'];
  const supplements = [];
  for (const file of supplementFiles) {
    try {
      const payload = JSON.parse(await readFile(file, 'utf8'));
      supplements.push(...(Array.isArray(payload?.papers) ? payload.papers : []));
    } catch {}
  }
  let dynamic = [];
  try {
    const payload = await jsonFetch(`${SOURCE_API}/api/literature/supplement`);
    dynamic = Array.isArray(payload?.papers) ? payload.papers : [];
  } catch (error) {
    console.warn('Dynamic supplement fetch failed:', error instanceof Error ? error.message : String(error));
  }
  return [...(Array.isArray(base) ? base : []), ...supplements, ...dynamic];
}

async function recoverMissing(records) {
  const requests = records.flatMap((record, index) => {
    if (doiFromRecord(record)) return [];
    const title = typeof record?.title === 'string' ? record.title.trim() : '';
    if (title.length < 8) return [];
    return [{ key: String(index), title, journal: record?.journal || '', date: record?.date || '', url: record?.url || undefined }];
  });
  for (let offset = 0; offset < requests.length; offset += 40) {
    try {
      const payload = await jsonFetch(`${SOURCE_API}/api/paper-titles/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ papers: requests.slice(offset, offset + 40) }),
      });
      for (const item of payload?.papers || []) {
        const doi = normalizeDoi(item?.doi);
        const index = Number(item?.key);
        if (doi && Number.isInteger(index) && records[index] && !records[index].doi) records[index].doi = doi;
      }
    } catch (error) {
      console.warn('DOI recovery batch failed:', error instanceof Error ? error.message : String(error));
    }
  }
}

const records = await loadLocalRecords();
await recoverMissing(records);
const dois = [...new Set(records.map(doiFromRecord).filter(Boolean))].sort();
const items = [];
for (let offset = 0; offset < dois.length; offset += 100) {
  const chunk = dois.slice(offset, offset + 100);
  const payload = await jsonFetch(`${TARGET_API_BASE}/api/media/inventory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dois: chunk }),
  });
  items.push(...(payload?.items || []));
}
const summary = {
  trackedDois: dois.length,
  withToc: items.filter(item => item?.tocStored).length,
  tocMissing: items.filter(item => item?.tocMissing || !item?.tocStored).length,
  figuresOnly: items.filter(item => item?.status === 'figures_only').length,
  missingAllMedia: items.filter(item => item?.status === 'missing').length,
  suspiciousToc: items.filter(item => item?.suspiciousToc).length,
};
console.log(`REPAIR_SEED_SUMMARY ${JSON.stringify(summary)}`);
console.log(`TOC_GAP_DOIS ${JSON.stringify(items.filter(item => item?.tocMissing || !item?.tocStored).map(item => item.doi))}`);
