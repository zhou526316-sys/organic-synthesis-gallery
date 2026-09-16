import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const SOURCE = (process.env.GALLERY_BACKEND_SOURCE || 'https://organic-synthesis-gallery.zhou526316.workers.dev').replace(/\/$/, '');
const PUBLIC_DIR = path.resolve('public');
const RECENT_LIMIT = Math.max(10, Math.min(60, Number(process.env.RECENT_MEDIA_LIMIT || 30)));
const SQL_OUTPUT = process.env.RECENT_MEDIA_SQL || '/tmp/recent-media-priority.sql';
const JSON_OUTPUT = process.env.RECENT_MEDIA_JSON || '/tmp/recent-media-repair.json';

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
    const match = url.pathname.match(/\/doi\/(?:abs\/|full\/|pdf\/|epdf\/)?(10\..+)$/i);
    if (match) return normalizeDoi(match[1]);
    const nature = url.pathname.match(/^\/articles\/(s\d+-\d+-\d+[a-z0-9-]*)$/i);
    if (/nature\.com$/i.test(url.hostname) && nature) return normalizeDoi(`10.1038/${nature[1]}`);
  } catch {
    return null;
  }
  return null;
}

async function loadRecords() {
  const records = [];
  const encoded = (await readFile(path.join(PUBLIC_DIR, 'papers.gz.b64'), 'utf8')).trim();
  const base = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
  if (Array.isArray(base)) records.push(...base);
  for (const file of [
    'total-synthesis.json',
    'manual-supplement.json',
    'final-audit-supplement.json',
    'curated-supplement.json',
    'literature-supplement.json',
  ]) {
    try {
      const payload = JSON.parse(await readFile(path.join(PUBLIC_DIR, file), 'utf8'));
      if (Array.isArray(payload?.papers)) records.push(...payload.papers);
    } catch {
      // Optional snapshot.
    }
  }
  return records;
}

async function postJson(pathname, body) {
  const response = await fetch(`${SOURCE}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${pathname} HTTP ${response.status}`);
  return await response.json();
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const records = await loadRecords();
const byDoi = new Map();
for (const record of records) {
  const doi = doiFromRecord(record);
  if (!doi) continue;
  const date = typeof record?.date === 'string' ? record.date : '';
  const existing = byDoi.get(doi);
  if (!existing || date > existing.date) {
    byDoi.set(doi, { doi, date, title: typeof record?.title === 'string' ? record.title : '' });
  }
}

const recent = [...byDoi.values()]
  .sort((a, b) => b.date.localeCompare(a.date) || a.doi.localeCompare(b.doi))
  .slice(0, RECENT_LIMIT);
const recentDois = recent.map(item => item.doi);
const inventory = recentDois.length
  ? await postJson('/api/media/inventory', { dois: recentDois })
  : { items: [] };
const inventoryByDoi = new Map((inventory?.items || []).map(item => [normalizeDoi(item?.doi), item]));
const gaps = recent.filter(item => {
  const media = inventoryByDoi.get(item.doi);
  if (!media) return true;
  return media.status !== 'complete' || media.suspiciousToc === true || Number(media.figureCount || 0) < 1;
});

const now = Date.now();
const sql = gaps.length
  ? `UPDATE media_repair_state\nSET reported_priority = 1, next_retry_at = -1, attempts = 0, updated_at = ${now}\nWHERE doi IN (${gaps.map(item => sqlString(item.doi)).join(', ')});\n`
  : 'SELECT 1;\n';
await writeFile(SQL_OUTPUT, sql);
await writeFile(JSON_OUTPUT, JSON.stringify({ generatedAt: now, recent, gaps }, null, 2));

console.log(`RECENT_MEDIA_PREPARE_SUMMARY ${JSON.stringify({ recent: recent.length, gaps: gaps.length, newest: recent[0]?.date || null, oldest: recent.at(-1)?.date || null })}`);
