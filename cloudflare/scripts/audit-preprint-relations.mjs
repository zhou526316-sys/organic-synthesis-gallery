import { readFile, writeFile } from 'node:fs/promises';

const GAP_FILE = process.env.TOC_GAP_FILE || 'audit/toc-gap-dois-2026-09-16.json';
const REPORT_FILE = process.env.PREPRINT_RELATION_REPORT || 'audit/preprint-relation-report.json';
const API = 'https://api.crossref.org/works';
const DELAY_MS = Math.max(300, Number(process.env.CROSSREF_RELATION_DELAY_MS || 650));
const TIMEOUT_MS = Math.max(5000, Number(process.env.CROSSREF_RELATION_TIMEOUT_MS || 12000));

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function normalizeDoi(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned : null;
}

async function fetchCrossref(doi) {
  const waits = [0, 1600, 4200];
  let lastStatus = null;
  let lastError = null;
  for (let attempt = 0; attempt < waits.length; attempt += 1) {
    if (waits[attempt]) await sleep(waits[attempt]);
    await sleep(DELAY_MS);
    try {
      const response = await fetch(`${API}/${encodeURIComponent(doi)}`, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'organic-synthesis-gallery-preprint-relations/1.0 (https://github.com/zhou526316-sys/organic-synthesis-gallery)',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      lastStatus = response.status;
      if (response.status === 429 || response.status >= 500) continue;
      if (!response.ok) return { status: response.status, message: null };
      const payload = await response.json();
      return { status: response.status, message: payload?.message || null };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return { status: lastStatus, message: null, error: lastError };
}

function relationEntries(message) {
  const relation = message?.relation && typeof message.relation === 'object' ? message.relation : {};
  const keys = ['has-preprint', 'hasPreprint', 'is-preprint-of', 'isPreprintOf'];
  const entries = [];
  for (const key of keys) {
    const values = Array.isArray(relation[key]) ? relation[key] : [];
    for (const value of values) {
      const doi = normalizeDoi(value?.id || value?.DOI || value?.doi);
      if (!doi) continue;
      entries.push({
        relationType: key,
        doi,
        idType: value?.['id-type'] || value?.idType || null,
        assertedBy: value?.['asserted-by'] || value?.assertedBy || null,
      });
    }
  }
  return entries;
}

function isChemRxivDoi(doi) {
  return /^10\.26434\/chemrxiv-/i.test(doi || '');
}

const gap = JSON.parse(await readFile(GAP_FILE, 'utf8'));
const dois = [...new Set((gap?.dois || []).map(normalizeDoi).filter(Boolean))];
const results = [];
for (let i = 0; i < dois.length; i += 1) {
  const doi = dois[i];
  const fetched = await fetchCrossref(doi);
  const relations = relationEntries(fetched.message);
  results.push({
    doi,
    status: fetched.status,
    title: Array.isArray(fetched.message?.title) ? fetched.message.title[0] || '' : '',
    relations,
    chemrxiv: relations.filter(item => isChemRxivDoi(item.doi)),
    error: fetched.error || null,
  });
  if ((i + 1) % 20 === 0 || i + 1 === dois.length) console.log(`PREPRINT_RELATION_PROGRESS ${i + 1}/${dois.length}`);
}

const linked = results.filter(item => item.relations.length);
const chemrxivLinked = results.filter(item => item.chemrxiv.length);
const summary = {
  audited: results.length,
  successfulMetadata: results.filter(item => item.status === 200).length,
  serviceErrors: results.filter(item => item.status !== 200).length,
  withPreprintRelation: linked.length,
  withChemRxivRelation: chemrxivLinked.length,
};
const report = { generatedAt: new Date().toISOString(), summary, linked, chemrxivLinked, results };
await writeFile(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`PREPRINT_RELATION_SUMMARY ${JSON.stringify(summary)}`);
for (const item of chemrxivLinked) console.log(`CHEMRXIV_RELATION ${JSON.stringify({ doi: item.doi, title: item.title, chemrxiv: item.chemrxiv })}`);
for (const item of linked.filter(item => !item.chemrxiv.length)) console.log(`OTHER_PREPRINT_RELATION ${JSON.stringify({ doi: item.doi, title: item.title, relations: item.relations })}`);
