import { gunzipSync } from 'node:zlib';
import { readFile, writeFile } from 'node:fs/promises';

const GAP_FILE = process.env.GAP_FILE || 'audit/toc-gap-dois-2026-09-16.json';
const REPORT_FILE = process.env.REPORT_FILE || 'audit/toc-gap-metadata-report.json';
const CROSSREF_BASE = 'https://api.crossref.org';
const REQUEST_DELAY_MS = Math.max(300, Number(process.env.CROSSREF_DELAY_MS || 550));

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

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

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value) {
  return new Set(normalizeText(value).split(/\s+/).filter(token => token.length > 1));
}

function titleSimilarity(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return null;
  let intersection = 0;
  for (const token of A) if (B.has(token)) intersection += 1;
  return (2 * intersection) / (A.size + B.size);
}

function canonicalJournal(value) {
  const s = normalizeText(value);
  if (!s) return '';
  if (s.includes('journal of the american chemical society') || s === 'jacs') return 'jacs';
  if (s.includes('organic letters') || s === 'org lett' || s === 'orglett') return 'organic letters';
  if (s.includes('acs catalysis') || s === 'acscatal') return 'acs catalysis';
  if (s.includes('angewandte chemie')) return 'angew';
  if (s.includes('nature communications')) return 'nature communications';
  if (s.includes('nature chemistry')) return 'nature chemistry';
  if (s.includes('nature catalysis')) return 'nature catalysis';
  if (s.includes('nature synthesis')) return 'nature synthesis';
  if (s === 'nature') return 'nature';
  if (s === 'science') return 'science';
  return s;
}

async function loadRecords() {
  const encoded = (await readFile('public/papers.gz.b64', 'utf8')).trim();
  const base = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
  const supplementFiles = [
    'public/total-synthesis.json',
    'public/manual-supplement.json',
    'public/final-audit-supplement.json',
    'public/curated-supplement.json',
  ];
  const all = [...(Array.isArray(base) ? base : [])];
  for (const file of supplementFiles) {
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
    if (!existing || (!existing?.title && record?.title) || (!existing?.titleZh && record?.titleZh) || (!existing?.date && record?.date)) byDoi.set(doi, record);
  }
  return byDoi;
}

async function fetchCrossref(url) {
  const waits = [0, 1800, 4500, 9000];
  let lastStatus = null;
  for (let attempt = 0; attempt < waits.length; attempt += 1) {
    if (waits[attempt]) await sleep(waits[attempt]);
    await sleep(REQUEST_DELAY_MS);
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'organic-synthesis-gallery-metadata-audit/1.1 (https://github.com/zhou526316-sys/organic-synthesis-gallery)',
      },
      signal: AbortSignal.timeout(25000),
    });
    lastStatus = response.status;
    if (response.status === 429 || response.status >= 500) continue;
    if (response.status === 404) return { status: 404, data: null };
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    return { status: response.status, data };
  }
  return { status: lastStatus, data: null };
}

function crossrefTitle(message) {
  return Array.isArray(message?.title) ? String(message.title[0] || '') : String(message?.title || '');
}

function crossrefJournal(message) {
  return Array.isArray(message?.['container-title']) ? String(message['container-title'][0] || '') : String(message?.['container-title'] || '');
}

function scoreCandidate(record, message) {
  const titleScore = titleSimilarity(record?.title, crossrefTitle(message)) ?? 0;
  const expectedJournal = canonicalJournal(record?.journal);
  const candidateJournal = canonicalJournal(crossrefJournal(message));
  const journalScore = expectedJournal && candidateJournal && expectedJournal === candidateJournal ? 1 : 0;
  return { titleScore, journalScore, score: titleScore * 0.88 + journalScore * 0.12 };
}

async function searchByTitle(record) {
  const title = String(record?.title || '').trim();
  if (title.length < 8) return [];
  const url = `${CROSSREF_BASE}/works?query.title=${encodeURIComponent(title)}&rows=5&select=DOI,title,container-title,published-online,published-print,type`;
  try {
    const { status, data } = await fetchCrossref(url);
    if (status !== 200) return [];
    const items = Array.isArray(data?.message?.items) ? data.message.items : [];
    return items.map(item => {
      const metrics = scoreCandidate(record, item);
      return {
        doi: normalizeDoi(item?.DOI),
        title: crossrefTitle(item),
        journal: crossrefJournal(item),
        type: item?.type || null,
        ...metrics,
      };
    }).filter(item => item.doi).sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

async function auditOne(doi, record) {
  const result = {
    doi,
    local: record ? { title: record.title || '', journal: record.journal || '', date: record.date || '' } : null,
    registered: false,
    directStatus: null,
    titleSimilarity: null,
    journalMatches: null,
    crossref: null,
    issue: null,
    candidate: null,
  };

  if (!record) {
    result.issue = 'missing_local_record';
    return result;
  }

  try {
    const { status, data } = await fetchCrossref(`${CROSSREF_BASE}/works/${encodeURIComponent(doi)}`);
    result.directStatus = status;
    if (status === 200 && data?.message) {
      result.registered = true;
      const message = data.message;
      const crTitle = crossrefTitle(message);
      const crJournal = crossrefJournal(message);
      result.crossref = {
        doi: normalizeDoi(message?.DOI),
        title: crTitle,
        journal: crJournal,
        type: message?.type || null,
      };
      result.titleSimilarity = titleSimilarity(record?.title, crTitle);
      const expectedJournal = canonicalJournal(record?.journal);
      const actualJournal = canonicalJournal(crJournal);
      result.journalMatches = Boolean(expectedJournal && actualJournal && expectedJournal === actualJournal);

      if (!String(record?.title || '').trim()) result.issue = 'local_title_missing';
      else if (result.titleSimilarity !== null && result.titleSimilarity < 0.62) result.issue = 'title_mismatch';
      else if (!result.journalMatches) result.issue = 'journal_mismatch';
      else if (result.crossref.doi && result.crossref.doi !== doi) result.issue = 'doi_mismatch';
      else result.issue = null;
    } else {
      result.issue = status === 404 ? 'doi_not_registered_in_crossref' : `crossref_http_${status}`;
    }
  } catch (error) {
    result.issue = `crossref_error:${error instanceof Error ? error.message : String(error)}`;
  }

  if (['doi_not_registered_in_crossref', 'title_mismatch', 'journal_mismatch', 'doi_mismatch'].includes(result.issue)) {
    const candidates = await searchByTitle(record);
    const best = candidates[0];
    if (best && best.score >= 0.78) result.candidate = best;
  }
  return result;
}

const gapPayload = JSON.parse(await readFile(GAP_FILE, 'utf8'));
const gapDois = [...new Set((gapPayload?.dois || []).map(normalizeDoi).filter(Boolean))];
const records = await loadRecords();
const results = [];
for (let index = 0; index < gapDois.length; index += 1) {
  const doi = gapDois[index];
  const item = await auditOne(doi, records.get(doi));
  results.push(item);
  if ((index + 1) % 20 === 0 || index + 1 === gapDois.length) console.log(`METADATA_AUDIT_PROGRESS ${index + 1}/${gapDois.length}`);
}
const issues = results.filter(item => item.issue);
const actionableIssues = issues.filter(item => item.issue !== 'local_title_missing' && !String(item.issue).startsWith('crossref_http_'));
const correctionCandidates = actionableIssues.filter(item => item.candidate && item.candidate.doi !== item.doi);
const confirmed = results.filter(item => !item.issue || item.issue === 'local_title_missing');
const summary = {
  audited: results.length,
  confirmedDoiJournal: confirmed.length,
  fullyConfirmedMetadata: results.filter(item => !item.issue).length,
  localTitleMissing: issues.filter(item => item.issue === 'local_title_missing').length,
  unresolvedServiceErrors: issues.filter(item => String(item.issue).startsWith('crossref_http_') || String(item.issue).startsWith('crossref_error:')).length,
  doiNotRegistered: issues.filter(item => item.issue === 'doi_not_registered_in_crossref').length,
  titleMismatch: issues.filter(item => item.issue === 'title_mismatch').length,
  journalMismatch: issues.filter(item => item.issue === 'journal_mismatch').length,
  correctionCandidates: correctionCandidates.length,
};
const report = {
  generatedAt: new Date().toISOString(),
  sourceGapFile: GAP_FILE,
  summary,
  issues,
  actionableIssues,
  correctionCandidates,
  results,
};
await writeFile(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`METADATA_AUDIT_SUMMARY ${JSON.stringify(summary)}`);
for (const item of actionableIssues) console.log(`METADATA_ACTIONABLE ${JSON.stringify(item)}`);
for (const item of correctionCandidates) console.log(`CORRECTION_CANDIDATE ${JSON.stringify({ doi: item.doi, local: item.local, candidate: item.candidate })}`);
