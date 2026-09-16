import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const START = process.env.AUDIT_START || '2026-07-01';
const END = process.env.AUDIT_END || '2026-09-16';
const SITE = (process.env.GALLERY_SITE || 'https://zhou526316-sys.github.io/organic-synthesis-gallery').replace(/\/$/, '');
const OUT = path.resolve(process.env.AUDIT_OUTPUT || 'audit/latest.json');

const JOURNALS = [
  { name: 'Nature', issns: ['0028-0836', '1476-4687'] },
  { name: 'Science', issns: ['0036-8075', '1095-9203'] },
  { name: 'Nature Catalysis', issns: ['2520-1158'] },
  { name: 'Nature Synthesis', issns: ['2731-0582'] },
  { name: 'Nature Chemistry', issns: ['1755-4330', '1755-4349'] },
  { name: 'Nature Communications', issns: ['2041-1723'] },
  { name: 'JACS', issns: ['0002-7863', '1520-5126'] },
  { name: 'Angew', issns: ['1433-7851', '1521-3773'] },
  { name: 'ACS Catalysis', issns: ['2155-5435'] },
  { name: 'Organic Letters', issns: ['1523-7052', '1523-7060'] },
];

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
    headers: { accept: 'application/json', 'user-agent': 'OrganicSynthesisGalleryAudit/2.0' },
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
  const encoded = Buffer.from(await siteBytes('papers.gz.b64')).toString('utf8').trim();
  JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8')).forEach(add);
  for (const file of ['total-synthesis.json', 'manual-supplement.json', 'final-audit-supplement.json', 'literature-supplement.json']) {
    try {
      const payload = JSON.parse(Buffer.from(await siteBytes(file)).toString('utf8'));
      (payload?.papers || []).forEach(add);
    } catch (error) {
      console.warn(`Gallery asset unavailable: ${file}: ${error.message}`);
    }
  }
  try {
    const curated = JSON.parse(await readFile(path.resolve('public/curated-supplement.json'), 'utf8'));
    (curated?.papers || []).forEach(add);
  } catch {}
  return dois;
}

function mergeCandidate(map, incoming) {
  const doi = normalizeDoi(incoming.doi);
  if (!doi) return;
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
  for (const issn of journal.issns) {
    for (const mode of ['online', 'published']) {
      const dateFilter = mode === 'online'
        ? `from-online-pub-date:${START},until-online-pub-date:${END}`
        : `from-pub-date:${START},until-pub-date:${END}`;
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
        const filter = `primary_location.source.id:${sourceId},from_publication_date:${START},to_publication_date:${END}`;
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

const galleryDois = await loadGalleryDois();
const merged = new Map();
const stats = [];

for (const journal of JOURNALS) {
  const [crossref, openalex] = await Promise.all([fetchCrossref(journal), fetchOpenAlex(journal)]);
  stats.push(...crossref.stats, ...openalex.stats);
  for (const c of [...crossref.candidates, ...openalex.candidates]) mergeCandidate(merged, c);
  console.log(`AUDIT_SOURCE ${journal.name} crossref=${crossref.candidates.length} openalex=${openalex.candidates.length}`);
}

const universe = [...merged.values()].filter(c => !c.date || (c.date >= START && c.date <= END));
const missing = universe.filter(c => !galleryDois.has(c.doi));
const potentialGaps = missing.filter(retainForReview)
  .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.journal.localeCompare(b.journal) || String(a.title).localeCompare(String(b.title)))
  .map(c => ({ ...c, abstract: (c.abstract || '').slice(0, 1800) }));

const criticalFailures = stats.filter(s => !s.ok);
const byJournal = Object.fromEntries(JOURNALS.map(j => {
  const candidates = universe.filter(x => x.journal === j.name);
  const gaps = potentialGaps.filter(x => x.journal === j.name);
  return [j.name, { sourceRecords: candidates.length, coveredByGallery: candidates.filter(x => galleryDois.has(x.doi)).length, potentialGaps: gaps.length }];
}));

const report = {
  auditVersion: 2,
  generatedAt: new Date().toISOString(),
  startDate: START,
  endDate: END,
  policy: 'Multi-ISSN Crossref union plus OpenAlex union. No fixed candidate review cap. Deterministic screening only prioritizes records for assistant review; potential gaps are never silently counted as excluded.',
  summary: {
    galleryDois: galleryDois.size,
    sourceRecords: universe.length,
    missingFromGallery: missing.length,
    potentialGaps: potentialGaps.length,
    criticalSourceFailures: criticalFailures.length,
    unresolved: potentialGaps.length,
  },
  byJournal,
  sourceStats: stats,
  potentialGaps,
};

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(report, null, 2));
console.log(`AUDIT_RESULT ${JSON.stringify(report.summary)}`);
