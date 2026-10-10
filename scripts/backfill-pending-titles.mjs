#!/usr/bin/env node
/**
 * Backfill only invalid/missing *English article titles* on already published DOI rows.
 * This is metadata maintenance; it cannot add a paper, change dates or publish a new DOI.
 * Run: node scripts/backfill-pending-titles.mjs --inventory | --apply
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { normalizeDoi } from '../shared/literature-identity.mjs';

const SOURCE_PATHS = [
  'public/papers.gz.b64',
  'public/total-synthesis.json',
  'public/manual-supplement.json',
  'public/final-audit-supplement.json',
  'public/curated-supplement.json',
  'public/automation-supplement.json',
  'public/rolling-supplement.json',
];
const REPORT_PATH = process.env.TITLE_BACKFILL_REPORT || 'audit/title-backfill/verified-titles-20261010.json';
const TIMEOUT_MS = 10000;
const PARALLEL = 4;
const RETRIES = 2;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (cond, message) => { if (!cond) throw new Error(message); };
const pretty = value => JSON.stringify(value, null, 2) + '\n';

export function pendingTitle(value) {
  if (typeof value !== 'string' || !value.trim()) return true;
  const title = value.trim().toLowerCase().replace(/[：:….]/g, '').replace(/\s+/g, ' ');
  if ([
    'title pending verification', 'title pending', 'pending verification',
    'pending title verification', '标题待核验', '待核验', '标题待确认', '待确认',
    'verifying title', '正在核验标题', 'unknown title',
  ].includes(title)) return true;
  return /cloudflare|checking your browser|verify you are human|enable javascript|access denied|page not found/i.test(title);
}

export function cleanTitle(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/<[^>]*>/g, '').replace(/&#(x[0-9a-f]+|\d+);/gi, (_m, n) => {
    const code = n.toLowerCase().startsWith('x') ? parseInt(n.slice(1), 16) : Number(n);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }).replace(/&(amp|lt|gt|quot|apos|nbsp|ndash|mdash|alpha|beta|gamma);/gi, (_m, n) =>
    ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',alpha:'α',beta:'β',gamma:'γ'})[n.toLowerCase()]
  ).replace(/\s+/g, ' ').trim();
  if (normalized.length < 5 || normalized.length > 500 || pendingTitle(normalized)
      || /(?:captcha|enable cookies|browser verification)/i.test(normalized)) return '';
  return normalized;
}
export function chooseExistingTitle(rows) {
  const choices = new Map();
  for (const row of rows) {
    for (const candidate of [row.title, row.titleEn]) {
      if (pendingTitle(candidate)) continue;
      const title = cleanTitle(candidate);
      if (title) choices.set(title.toLowerCase().replace(/\s+/g, ' '), title);
    }
  }
  return choices.size === 1 ? [...choices.values()][0] : '';
}
async function loadSources() {
  const sources = [];
  for (const path of SOURCE_PATHS) {
    const raw = await readFile(path, 'utf8');
    const compressed = path.endsWith('.b64');
    const body = JSON.parse(compressed ? gunzipSync(Buffer.from(raw.trim(), 'base64')).toString('utf8') : raw);
    const rows = compressed ? body : body.papers;
    assert(Array.isArray(rows), 'missing_paper_array:' + path);
    sources.push({ path, compressed, body, rows });
  }
  return sources;
}
async function requestJson(url, label) {
  let failure = '';
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Accept:'application/json', 'User-Agent':'OrganicSynthesisGallery-verified-title-backfill/1.0 (https://github.com/zhou526316-sys/organic-synthesis-gallery)' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status === 404) return { error: label + ':HTTP_404' };
      if (!response.ok) {
        failure = label + ':HTTP_' + response.status;
        if (response.status !== 429 && response.status < 500) break;
      } else return { data: await response.json() };
    } catch (error) { failure = label + ':' + (error.name || 'network_error'); }
    if (attempt + 1 < RETRIES) await wait(700 * (attempt + 1));
  }
  return { error: failure || label + ':unavailable' };
}
export function extractCrossrefTitle(payload, doi) {
  const record = payload?.message;
  if (normalizeDoi(record?.DOI) !== doi) return '';
  const title = Array.isArray(record?.title) ? record.title[0] : '';
  return cleanTitle(title);
}
export function extractOpenalexTitle(payload, doi) {
  if (normalizeDoi(payload?.doi) !== doi) return '';
  return cleanTitle(payload?.display_name || payload?.title);
}
async function lookupOfficialTitle(doi) {
  const evidence = [];
  const crossref = await requestJson('https://api.crossref.org/works/' + encodeURIComponent(doi), 'crossref');
  const cr = extractCrossrefTitle(crossref.data, doi);
  if (cr) return { title: cr, source:'crossref', evidence:['crossref:verified_doi'] };
  evidence.push(crossref.error || 'crossref:no_valid_doi_matched_title');
  const openalex = await requestJson('https://api.openalex.org/works?filter=doi:' +
    encodeURIComponent('https://doi.org/' + doi) + '&per-page=1', 'openalex');
  const oa = Array.isArray(openalex.data?.results)
    ? openalex.data.results.find(row => normalizeDoi(row?.doi) === doi)
    : null;
  const title = extractOpenalexTitle(oa, doi);
  if (title) return { title, source:'openalex', evidence:[...evidence,'openalex:verified_doi'] };
  evidence.push(openalex.error || 'openalex:no_valid_doi_matched_title');
  return { title:'', source:'unresolved', evidence };
}
async function resolveAll(dois, callback) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(PARALLEL, dois.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= dois.length) return;
      await callback(dois[index]);
    }
  }));
}
export async function run({ apply = false, lookup = lookupOfficialTitle, reportPath = REPORT_PATH } = {}) {
  const sources = await loadSources();
  const perDoi = new Map();
  let totalRows = 0;
  for (const source of sources) {
    for (const row of source.rows) {
      totalRows++;
      const doi = normalizeDoi(row?.doi || row?.url);
      assert(doi, 'published_row_without_valid_doi:' + source.path);
      if (!perDoi.has(doi)) perDoi.set(doi, []);
      perDoi.get(doi).push({ row, path: source.path });
    }
  }
  const originalDois = [...perDoi.keys()].sort();
  const pending = [];
  for (const [doi, entries] of perDoi) {
    const affected = entries.filter(entry => pendingTitle(entry.row.title));
    if (affected.length) pending.push({ doi, entries, affected });
  }
  pending.sort((a,b) => a.doi.localeCompare(b.doi));
  const pendingRowCount = pending.reduce((n, item) => n + item.affected.length, 0);
  const resolved = [], unresolved = [];
  if (apply) {
    await resolveAll(pending, async item => {
      const local = chooseExistingTitle(item.entries.map(entry => entry.row));
      const found = local ? { title:local, source:'existing_same_doi', evidence:['matching_doi_published_row'] }
        : await lookup(item.doi);
      const safeTitle = cleanTitle(found.title);
      if (!safeTitle) {
        unresolved.push({ doi:item.doi, affectedFiles:item.affected.map(e=>e.path), reasons:found.evidence || ['no_reliable_title'] });
        return;
      }
      for (const entry of item.affected) entry.row.title = safeTitle;
      resolved.push({ doi:item.doi, title:safeTitle, source:found.source, affectedFiles:item.affected.map(e=>e.path), evidence:found.evidence || [] });
    });
  }
  const remaining = [...perDoi.entries()].flatMap(([doi,entries]) =>
    entries.filter(entry => pendingTitle(entry.row.title)).map(entry => ({ doi, file:entry.path })));
  assert(remaining.length === (apply ? unresolved.reduce((sum,x)=>sum+x.affectedFiles.length,0) : pendingRowCount),
    'unexplained_pending_title_count_after_resolution');
  assert(originalDois.length === perDoi.size, 'doi_set_changed');
  if (apply) for (const source of sources) {
    if (!resolved.some(item => item.affectedFiles.includes(source.path))) continue;
    const newBody = source.compressed
      ? gzipSync(Buffer.from(JSON.stringify(source.body))).toString('base64') + '\n'
      : pretty(source.body);
    await writeFile(source.path, newBody);
  }
  resolved.sort((a,b)=>a.doi.localeCompare(b.doi));
  unresolved.sort((a,b)=>a.doi.localeCompare(b.doi));
  const report = {
    schema:'gallery-verified-title-backfill-v1', generatedAt:new Date().toISOString(),
    scope:'existing_approved_dois_only', mode:apply?'apply':'inventory',
    sources:SOURCE_PATHS, originalUniqueDois:originalDois.length, originalRows:totalRows,
    pendingUniqueDoisBefore:pending.length, pendingRowsBefore:pendingRowCount,
    resolvedUniqueDois:resolved.length, resolvedRows:pendingRowCount - remaining.length,
    pendingUniqueDoisAfter:new Set(remaining.map(x=>x.doi)).size, pendingRowsAfter:remaining.length,
    doiMembershipUnchanged:true, publicationDatesUnchanged:true, titleZhUnchanged:true,
    newLiteraturePublished:false, resolved, unresolved,
    inventory:apply?[]:pending.map(item=>({doi:item.doi,files:item.affected.map(e=>e.path)})),
  };
  if (apply) {
    await mkdir(reportPath.slice(0,reportPath.lastIndexOf('/')), {recursive:true});
    await writeFile(reportPath, pretty(report));
  }
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apply = process.argv.includes('--apply');
  const report = await run({ apply });
  console.log(pretty({
    mode:report.mode, originalUniqueDois:report.originalUniqueDois,
    pendingUniqueDoisBefore:report.pendingUniqueDoisBefore,
    pendingRowsBefore:report.pendingRowsBefore,
    resolvedUniqueDois:report.resolvedUniqueDois,
    pendingUniqueDoisAfter:report.pendingUniqueDoisAfter,
    pendingRowsAfter:report.pendingRowsAfter,
    unresolved:report.unresolved,
    ...(apply?{}:{inventory:report.inventory}),
  }));
  if (apply && report.pendingRowsAfter) process.exitCode = 2;
}
