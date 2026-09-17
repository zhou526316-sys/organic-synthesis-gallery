import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { normalizeDoi, selectBestPrimaryVisual, visualBucket } from '../core.mjs';

const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR || 'public');
const AUDIT_DIR = path.resolve(process.env.AUDIT_DIR || 'audit');
const API_BASE = String(process.env.PRIMARY_VISUAL_API || 'https://api.gczhouwld.com').replace(/\/$/, '');

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

async function optionalJson(file) {
  try { return JSON.parse(await readFile(path.join(PUBLIC_DIR, file), 'utf8')); }
  catch { return null; }
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
    const payload = await optionalJson(file);
    if (Array.isArray(payload?.papers)) records.push(...payload.papers);
  }

  const byDoi = new Map();
  for (const record of records) {
    const doi = doiFromRecord(record);
    if (!doi) continue;
    const previous = byDoi.get(doi) || {};
    const title = String(record?.title || '').trim();
    const journal = String(record?.journal || '').trim();
    const date = String(record?.date || record?.first_online_date || record?.firstOnlineDate || '').trim();
    byDoi.set(doi, {
      doi,
      title: title || previous.title || '',
      journal: journal || previous.journal || '',
      publicationDate: date || previous.publicationDate || '',
    });
  }
  return byDoi;
}

async function repairState() {
  try {
    const response = await fetch(`${API_BASE}/api/media/repair-status`, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    return new Map((payload?.items || []).map(item => [String(item?.doi || '').toLowerCase(), item]));
  } catch (error) {
    console.warn(`PRIMARY_VISUAL_AUDIT repair status unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return new Map();
  }
}

function emptyCounts() {
  return {
    totalPapers: 0,
    publisherPrimaryGraphic: 0,
    publisherFigure1: 0,
    pdfPrimaryVisual: 0,
    openVersionVisual: 0,
    otherFallback: 0,
    noVisual: 0,
  };
}

function increment(counts, bucket) {
  counts.totalPapers += 1;
  if (bucket === 'publisher_primary_graphic') counts.publisherPrimaryGraphic += 1;
  else if (bucket === 'publisher_figure1') counts.publisherFigure1 += 1;
  else if (bucket === 'pdf_primary_visual') counts.pdfPrimaryVisual += 1;
  else if (bucket === 'open_version_visual') counts.openVersionVisual += 1;
  else if (bucket === 'other_fallback') counts.otherFallback += 1;
  else counts.noVisual += 1;
}

async function main() {
  const [records, repairs] = await Promise.all([loadRecords(), repairState()]);
  const manifest = JSON.parse(await readFile(path.join(PUBLIC_DIR, 'media-index.json'), 'utf8'));
  if (!manifest?.items || typeof manifest.items !== 'object') throw new Error('media-index.json must contain items');

  const totals = emptyCounts();
  const journals = {};
  const noVisual = [];
  const entries = [];

  for (const [doi, meta] of [...records.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const item = manifest.items[doi];
    const primary = item?.primaryVisual?.imageUrl ? item.primaryVisual : selectBestPrimaryVisual(item || {});
    const bucket = primary ? visualBucket(primary) : 'no_visual';
    increment(totals, bucket);
    const journal = meta.journal || 'Unknown';
    journals[journal] ||= emptyCounts();
    increment(journals[journal], bucket);
    const repair = repairs.get(doi) || {};
    const row = {
      doi,
      title: meta.title,
      journal,
      publicationDate: meta.publicationDate,
      bucket,
      kind: primary?.kind || null,
      sourceType: primary?.sourceType || null,
      sourceRepository: primary?.sourceRepository || null,
      confidence: typeof primary?.confidence === 'number' ? primary.confidence : null,
      resolverAttempts: Number(repair?.attempts || 0),
      lastFailure: repair?.last_root_cause || repair?.lastRootCause || null,
      nextRetry: Number(repair?.next_retry_at || repair?.nextRetryAt || 0) || null,
    };
    entries.push(row);
    if (bucket === 'no_visual') noVisual.push(row);
  }

  const payload = {
    version: 2,
    generatedAt: new Date().toISOString(),
    metric: 'trusted_primary_visual_coverage',
    totals,
    journals,
    entries,
  };
  const missingPayload = {
    version: 2,
    generatedAt: payload.generatedAt,
    count: noVisual.length,
    items: noVisual,
  };

  await mkdir(AUDIT_DIR, { recursive: true });
  await Promise.all([
    writeFile(path.join(AUDIT_DIR, 'primary-visual-health.json'), JSON.stringify(payload, null, 2)),
    writeFile(path.join(AUDIT_DIR, 'no_visual_dois.json'), JSON.stringify(missingPayload, null, 2)),
    writeFile(path.join(PUBLIC_DIR, 'primary-visual-health.json'), JSON.stringify(payload)),
    writeFile(path.join(PUBLIC_DIR, 'no_visual_dois.json'), JSON.stringify(missingPayload)),
  ]);

  console.log(`PRIMARY_VISUAL_AUDIT_SUMMARY ${JSON.stringify(totals)}`);
  for (const [journal, summary] of Object.entries(journals).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`PRIMARY_VISUAL_AUDIT_JOURNAL ${JSON.stringify({ journal, ...summary })}`);
  }
  if (noVisual.length) {
    console.warn(`PRIMARY_VISUAL_NO_VISUAL ${noVisual.length}`);
    for (const item of noVisual.slice(0, 80)) console.warn(`${item.doi}\t${item.journal}\t${item.title}\t${item.lastFailure || ''}`);
  }
}

await main();
