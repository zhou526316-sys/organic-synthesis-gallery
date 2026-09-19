import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { isExcludedDoi } from '../../shared/literature-policy.js';
import { TARGET_JOURNALS, effectiveJournalStart } from '../../shared/literature-journals.js';

const TIME_ZONE = 'Asia/Shanghai';

function dateInTimeZone(date = new Date(), timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const DEFAULT_END = dateInTimeZone();
const END = process.env.AUDIT_END || DEFAULT_END;
const DEFAULT_LOOKBACK_DAYS = 7;
const parsedLookbackDays = Number.parseInt(process.env.AUDIT_LOOKBACK_DAYS || String(DEFAULT_LOOKBACK_DAYS), 10);
const LOOKBACK_DAYS = Number.isFinite(parsedLookbackDays) ? Math.max(3, Math.min(31, parsedLookbackDays)) : DEFAULT_LOOKBACK_DAYS;
const START = process.env.AUDIT_START || shiftDate(END, -(LOOKBACK_DAYS - 1));
const CLOSURE_DATE = shiftDate(END, -1);
const SITE = (process.env.GALLERY_SITE || 'https://zhou526316-sys.github.io/organic-synthesis-gallery').replace(/\/$/, '');
const OUT = path.resolve(process.env.AUDIT_OUTPUT || 'audit/latest.json');

const JOURNALS = TARGET_JOURNALS;
const JOURNAL_BY_NAME = new Map(JOURNALS.map(journal => [journal.name, journal]));
const auditStartForJournal = journal => effectiveJournalStart(journal, START);

const normalizeDoi = value => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
};

const dateFromParts = value => {
  const p = value?.['date-parts']?.[0];
  if (!Array.isArray(p) || !p[0]) return '';
  return `${String(p[0]).padStart(4, '0')}-${String(p[1] || 1).padStart(2, '0')}-${String(p[2] || 1).padStart(2, '0')}`;
};

const clean = value => typeof value === 'string'
  ? value.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
  : '';

function openAlexAbstract(index) {
  if (!index || typeof index !== 'object') return '';
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const pos of positions) if (Number.isFinite(pos)) words.push([pos, word]);
  }
  return words.sort((a, b) => a[0] - b[0]).map(x => x[1]).join(' ').slice(0, 6000);
}

async function jsonFetch(url, timeout = 20000) {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'OrganicSynthesisGalleryAudit/2.1' },
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function siteBytes(file) {
  const response = await fetch(`${SITE}/${file}`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${file} HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function loadGalleryDois() {
  const dois = new Set();
  const add = paper => {
    const doi = normalizeDoi(paper?.doi || paper?.url || '');
    if (doi.startsWith('10.')) dois.add(doi);
  };

  // Repository data is the write-side source of truth. Read it first so an
  // audit that races a Pages deployment does not rediscover papers that were
  // already accepted and committed but are not visible on the CDN yet.
  try {
    const encoded = (await readFile(path.resolve('public/papers.gz.b64'), 'utf8')).trim();
    JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8')).forEach(add);
  } catch (error) {
    console.warn(`Repository baseline unavailable: ${error.message}`);
  }
  for (const file of [
    'total-synthesis.json',
    'manual-supplement.json',
    'final-audit-supplement.json',
    'curated-supplement.json',
    'automation-supplement.json',
    'rolling-supplement.json',
    'literature-supplement.json',
  ]) {
    try {
      const payload = JSON.parse(await readFile(path.resolve('public', file), 'utf8'));
      (payload?.papers || []).forEach(add);
    } catch {
      // Optional/local generated source.
    }
  }

  // Union the currently deployed snapshot as a compatibility fallback for any
  // data that may still be served dynamically but is not yet repository-owned.
  try {
    const encoded = Buffer.from(await siteBytes('papers.gz.b64')).toString('utf8').trim();
    JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8')).forEach(add);
  } catch (error) {
    console.warn(`Deployed baseline unavailable: ${error.message}`);
  }
  for (const file of ['total-synthesis.json', 'manual-supplement.json', 'final-audit-supplement.json', 'literature-supplement.json']) {
    try {
      const payload = JSON.parse(Buffer.from(await siteBytes(file)).toString('utf8'));
      (payload?.papers || []).forEach(add);
    } catch (error) {
      console.warn(`Gallery asset unavailable: ${file}: ${error.message}`);
    }
  }
  return dois;
}

async function loadReviewExclusions() {
  const excluded = new Set();
  const files = await readdir(path.resolve('audit')).catch(() => []);
  for (const file of files.filter(name => /^review-.*\.json$/i.test(name)).sort()) {
    try {
      const payload = JSON.parse(await readFile(path.resolve('audit', file), 'utf8'));
      for (const item of payload?.rejected || []) {
        const doi = normalizeDoi(item?.doi);
        if (doi) excluded.add(doi);
      }
      for (const item of payload?.decisions || []) {
        if (String(item?.decision || '').toLowerCase() !== 'exclude') continue;
        const doi = normalizeDoi(item?.doi);
        if (doi) excluded.add(doi);
      }
    } catch (error) {
      console.warn(`Review decision file unavailable: ${file}: ${error.message}`);
    }
  }
  return excluded;
}

function mergeCandidate(map, incoming) {
  const doi = normalizeDoi(incoming.doi);
  if (!doi || isExcludedDoi(doi)) return;
  const current = map.get(doi);
  if (!current) {
    map.set(doi, { ...incoming, doi, sources: [...new Set(incoming.sources || [])] });
    return;
  }
  if (!current.title && incoming.title) current.title = incoming.title;
  if ((!current.abstract || current.abstract.length < 120) && incoming.abstract) current.abstract = incoming.abstract;
  if (!current.date && incoming.date) current.date = incoming.date;
  if (!current.type && incoming.type) current.type = incoming.type;
  current.topics = [...new Set([...(current.topics || []), ...(incoming.topics || [])])];
  current.sources = [...new Set([...(current.sources || []), ...(incoming.sources || [])])];
}

async function fetchCrossref(journal) {
  const map = new Map();
  const stats = [];
  const journalStart = auditStartForJournal(journal);
  for (const issn of journal.issns) {
    for (const mode of ['online', 'published', 'created']) {
      const filterField = mode === 'online' ? 'online-pub-date' : mode === 'published' ? 'pub-date' : 'created-date';
      const dateFilter = `from-${filterField}:${journalStart},until-${filterField}:${END}`;
      let cursor = '*';
      let count = 0;
      let ok = true;
      let note = '';
      try {
        for (let page = 0; page < 30; page += 1) {
          const q = new URLSearchParams({ filter: dateFilter, rows: '500', cursor });
          const data = await jsonFetch(`https://api.crossref.org/journals/${encodeURIComponent(issn)}/works?${q}`);
          const items = data?.message?.items || [];
          count += items.length;
          for (const item of items) {
            const online = dateFromParts(item['published-online']);
            const published = dateFromParts(item.published);
            const date = online || published || '';
            mergeCandidate(map, {
              doi: item.DOI,
              journal: journal.name,
              title: clean(item.title?.[0]),
              abstract: clean(item.abstract),
              date,
              type: item.type || '',
              topics: [],
              sources: [`crossref:${issn}:${mode}`],
            });
          }
          const next = data?.message?.['next-cursor'];
          if (items.length < 500 || !next || next === cursor) break;
          cursor = next;
        }
      } catch (error) {
        ok = false;
        note = error.message;
      }
      stats.push({ source: 'crossref', journal: journal.name, issn, mode, ok, count, note });
    }
  }
  return { candidates: [...map.values()], stats };
}

async function fetchOpenAlex(journal) {
  const map = new Map();
  const stats = [];
  const sourceIds = new Set();
  for (const issn of journal.issns) {
    try {
      const source = await jsonFetch(`https://api.openalex.org/sources/issn:${encodeURIComponent(issn)}`);
      const id = String(source?.id || '').split('/').pop();
      if (id) sourceIds.add(id);
    } catch (error) {
      stats.push({ source: 'openalex-source', journal: journal.name, issn, ok: false, count: 0, note: error.message });
    }
  }
  for (const sourceId of sourceIds) {
    let cursor = '*';
    let count = 0;
    let ok = true;
    let note = '';
    try {
      for (let page = 0; page < 40; page += 1) {
        const filter = `primary_location.source.id:${sourceId},from_publication_date:${auditStartForJournal(journal)},to_publication_date:${END}`;
        const q = new URLSearchParams({ filter, 'per-page': '200', cursor });
        const data = await jsonFetch(`https://api.openalex.org/works?${q}`);
        const items = data?.results || [];
        count += items.length;
        for (const item of items) {
          const topics = [
            item?.primary_topic?.display_name,
            item?.primary_topic?.subfield?.display_name,
            item?.primary_topic?.field?.display_name,
            item?.primary_topic?.domain?.display_name,
            ...(item?.topics || []).slice(0, 5).map(x => x?.display_name),
          ].filter(Boolean);
          mergeCandidate(map, {
            doi: item.doi,
            journal: journal.name,
            title: clean(item.display_name),
            abstract: openAlexAbstract(item.abstract_inverted_index),
            date: /^\d{4}-\d{2}-\d{2}$/.test(item.publication_date || '') ? item.publication_date : '',
            type: item.type || '',
            topics,
            sources: [`openalex:${sourceId}`],
          });
        }
        const next = data?.meta?.next_cursor;
        if (items.length < 200 || !next || next === cursor) break;
        cursor = next;
      }
    } catch (error) {
      ok = false;
      note = error.message;
    }
    stats.push({ source: 'openalex', journal: journal.name, sourceId, ok, count, note });
  }
  return { candidates: [...map.values()], stats };
}

const synthRe = /\b(synthesi[sz]|synthetic|reaction|cataly|coupl|functionaliz|cycloadd|cyclization|annulation|dearomat|radical|photoredox|electrochem|asymmetric|enantio|stereoselect|boryl|silyl|arylat|alkylat|aminat|amidat|acylat|hydroamination|hydroalkylation|olefination|metathesis|rearrangement|decarbox|carboxyl|glycosyl|amination|cross-electrophile|skeletal edit|bond formation|substrate scope|late-stage)\b/i;
const chemistryTopicRe = /(organic chemistry|synthetic chemistry|catalysis|stereochemistry|organometallic|photochemistry|chemical synthesis|organic synthesis)/i;
const nonResearchRe = /\b(review|perspective|editorial|correction|retraction|news|commentary|protocol)\b/i;
const strongNonSynthRe = /\b(patient|clinical|tumou?r|cancer|genome|transcriptome|neuron|mouse|mice|immune|battery|photovoltaic|semiconductor|geophysical|astronom|machine learning|neural network)\b/i;

function retainForReview(c) {
  const text = `${c.title || ''}\n${c.abstract || ''}\n${(c.topics || []).join(' ')}`;
  if (nonResearchRe.test(c.type || '') || nonResearchRe.test(c.title || '')) return false;
  if (synthRe.test(text)) return true;
  if (chemistryTopicRe.test(text)) return true;
  if (c.journal === 'Organic Letters' && !strongNonSynthRe.test(text)) return true;
  return false;
}

function compactCandidate(c) {
  const journal = JOURNAL_BY_NAME.get(c.journal);
  return {
    ...c,
    activeFrom: journal?.activeFrom || '',
    dateUnverified: !c.date,
    reviewPriority: retainForReview(c) ? 'high' : 'normal',
    abstract: (c.abstract || '').slice(0, 1800),
  };
}

const [galleryDois, reviewedExclusions] = await Promise.all([loadGalleryDois(), loadReviewExclusions()]);
const merged = new Map();
const stats = [];

for (const journal of JOURNALS) {
  const [crossref, openalex] = await Promise.all([fetchCrossref(journal), fetchOpenAlex(journal)]);
  stats.push(...crossref.stats, ...openalex.stats);
  for (const c of [...crossref.candidates, ...openalex.candidates]) mergeCandidate(merged, c);
  console.log(`AUDIT_SOURCE ${journal.name} crossref=${crossref.candidates.length} openalex=${openalex.candidates.length}`);
}

const universe = [...merged.values()].filter(c => {
  const journal = JOURNAL_BY_NAME.get(c.journal);
  const effectiveStart = journal ? auditStartForJournal(journal) : START;
  return !c.date || (c.date >= effectiveStart && c.date <= END);
});
const excludedUniverse = universe.filter(c => isExcludedDoi(c.doi));
const rawMissing = universe.filter(c => !galleryDois.has(c.doi));
const reviewableMissing = rawMissing.filter(c => !isExcludedDoi(c.doi));
const reviewedExcluded = reviewableMissing.filter(c => reviewedExclusions.has(c.doi));
const missing = reviewableMissing.filter(c => !reviewedExclusions.has(c.doi));
const missingCandidates = missing
  .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.journal.localeCompare(b.journal) || String(a.title).localeCompare(String(b.title)))
  .map(compactCandidate);
const potentialGaps = missingCandidates.filter(c => c.reviewPriority === 'high');

const criticalFailures = stats.filter(s => !s.ok);
const sourceFamilyHealth = Object.fromEntries(JOURNALS.map(j => {
  const rows = stats.filter(s => s.journal === j.name);
  const crossrefRows = rows.filter(s => s.source === 'crossref');
  const openAlexRows = rows.filter(s => s.source === 'openalex' || s.source === 'openalex-source');
  return [j.name, {
    activeFrom: j.activeFrom || '',
    effectiveStart: auditStartForJournal(j),
    crossrefRequests: crossrefRows.length,
    crossrefFailures: crossrefRows.filter(s => !s.ok).length,
    openAlexRequests: openAlexRows.length,
    openAlexFailures: openAlexRows.filter(s => !s.ok).length,
    crossrefHealthy: crossrefRows.some(s => s.ok),
    openAlexHealthy: openAlexRows.some(s => s.ok),
  }];
}));
const sourceFamilyGaps = Object.entries(sourceFamilyHealth)
  .filter(([, health]) => !health.crossrefHealthy || !health.openAlexHealthy)
  .map(([journal, health]) => ({ journal, ...health }));

const byJournal = Object.fromEntries(JOURNALS.map(j => {
  const candidates = universe.filter(x => x.journal === j.name);
  const rawMissingForJournal = rawMissing.filter(x => x.journal === j.name);
  const reviewedExcludedForJournal = rawMissingForJournal.filter(x => reviewedExclusions.has(x.doi));
  const missingForJournal = missingCandidates.filter(x => x.journal === j.name);
  const gaps = missingForJournal.filter(x => x.reviewPriority === 'high');
  const crossrefOnly = candidates.filter(x => (x.sources || []).some(s => s.startsWith('crossref:')) && !(x.sources || []).some(s => s.startsWith('openalex:'))).length;
  const openAlexOnly = candidates.filter(x => (x.sources || []).some(s => s.startsWith('openalex:')) && !(x.sources || []).some(s => s.startsWith('crossref:'))).length;
  const multiSource = candidates.filter(x => (x.sources || []).some(s => s.startsWith('crossref:')) && (x.sources || []).some(s => s.startsWith('openalex:'))).length;
  return [j.name, {
    activeFrom: j.activeFrom || '',
    effectiveStart: auditStartForJournal(j),
    sourceRecords: candidates.length,
    crossrefOnly,
    openAlexOnly,
    multiSource,
    coveredByGallery: candidates.filter(x => galleryDois.has(x.doi)).length,
    rawMissingFromGallery: rawMissingForJournal.length,
    previouslyReviewedExcluded: reviewedExcludedForJournal.length,
    missingFromGallery: missingForJournal.length,
    potentialGaps: gaps.length,
  }];
}));

const closureUniverse = universe.filter(c => c.date === CLOSURE_DATE);
const closureRawMissing = rawMissing.filter(c => c.date === CLOSURE_DATE);
const closureReviewedExcluded = closureRawMissing.filter(c => reviewedExclusions.has(c.doi));
const closureMissing = missingCandidates.filter(c => c.date === CLOSURE_DATE);
const closurePotentialGaps = closureMissing.filter(c => c.reviewPriority === 'high');
const closureStatus = criticalFailures.length > 0
  ? 'blocked-source-failure'
  : closureMissing.length > 0
    ? 'requires-assistant-review'
    : 'assistant-decisions-complete';

const report = {
  auditVersion: 4,
  generatedAt: new Date().toISOString(),
  timeZone: TIME_ZONE,
  windowMode: process.env.AUDIT_START || process.env.AUDIT_END ? 'explicit' : 'rolling-7d-calendar',
  lookbackDays: LOOKBACK_DAYS,
  startDate: START,
  endDate: END,
  closureDate: CLOSURE_DATE,
  policy: 'Prospective per-journal activation dates; multi-ISSN Crossref online/published/created union plus OpenAlex union; default seven-calendar-day Beijing safety rescan to recover delayed indexing. Repository and deployed gallery DOI sets are unioned to avoid deployment-race false positives. Every DOI difference remains reviewable: deterministic screening only assigns review priority and never silently excludes a new missing record. Publisher TOC/Early View/ASAP is an additional assistant-side closure check when available.',
  targetJournals: JOURNALS.map(journal => ({ name: journal.name, issns: journal.issns, activeFrom: journal.activeFrom || '', effectiveStart: auditStartForJournal(journal) })),
  summary: {
    galleryDois: galleryDois.size,
    sourceRecords: universe.length,
    rawMissingFromGallery: rawMissing.length,
    previouslyReviewedExcluded: reviewedExcluded.length,
    missingFromGallery: missing.length,
    potentialGaps: potentialGaps.length,
    criticalSourceFailures: criticalFailures.length,
    sourceFamilyGaps: sourceFamilyGaps.length,
    unresolved: missing.length,
    excludedByPolicy: excludedUniverse.length,
  },
  closure: {
    date: CLOSURE_DATE,
    status: closureStatus,
    sourceRecords: closureUniverse.length,
    rawMissingFromGallery: closureRawMissing.length,
    previouslyReviewedExcluded: closureReviewedExcluded.length,
    missingFromGallery: closureMissing.length,
    potentialGaps: closurePotentialGaps.length,
    criticalSourceFailures: criticalFailures.length,
    verifiedThroughEligible: criticalFailures.length === 0 && closureMissing.length === 0,
    note: 'Machine audit never advances verifiedThrough by itself. Persisted assistant exclusions are treated as resolved; accepted papers must exist in repository/site data, pending items remain unresolved, publisher sources must be cross-checked where available, and critical source failures must be zero.',
  },
  byJournal,
  sourceFamilyHealth,
  sourceFamilyGaps,
  sourceStats: stats,
  missingCandidates,
  potentialGaps,
};

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(report, null, 2));
console.log(`AUDIT_WINDOW ${START}..${END} closure=${CLOSURE_DATE} timezone=${TIME_ZONE}`);
console.log(`AUDIT_RESULT ${JSON.stringify(report.summary)}`);
