import { readFile, writeFile } from 'node:fs/promises';

const GAP_FILE = process.env.VISUAL_GAP_FILE || 'audit/visual-gap-dois-2026-09-16.json';
const REPORT_FILE = process.env.OPENALEX_REPORT || 'audit/openalex-open-version-report.json';
const API = 'https://api.openalex.org';
const DELAY_MS = Math.max(80, Number(process.env.OPENALEX_DELAY_MS || 160));

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function normalizeDoi(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned : null;
}

function host(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}

function isPublisherHost(hostname) {
  return [
    'pubs.acs.org', 'onlinelibrary.wiley.com', 'chemistry-europe.onlinelibrary.wiley.com',
    'nature.com', 'link.springer.com', 'science.org', 'doi.org',
  ].some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
}

function compactLocation(location) {
  const source = location?.source || {};
  return {
    landingPageUrl: location?.landing_page_url || null,
    pdfUrl: location?.pdf_url || null,
    isOa: Boolean(location?.is_oa),
    version: location?.version || null,
    license: location?.license || null,
    source: source?.display_name || null,
    sourceType: source?.type || null,
    hostOrganization: source?.host_organization_name || null,
    host: host(location?.landing_page_url || location?.pdf_url || ''),
  };
}

function usefulOpenLocation(location) {
  if (!location) return false;
  const hostname = location.host || '';
  if (!location.landingPageUrl && !location.pdfUrl) return false;
  if (isPublisherHost(hostname)) return false;
  if (location.isOa || location.pdfUrl) return true;
  if (/chemrxiv|zenodo|figshare|repository|eprints|dspace|archive|preprint/i.test(`${location.source || ''} ${location.hostOrganization || ''} ${hostname}`)) return true;
  return false;
}

async function fetchJson(url) {
  const waits = [0, 900, 2500, 6000];
  let lastStatus = null;
  let lastError = null;
  for (let attempt = 0; attempt < waits.length; attempt += 1) {
    if (waits[attempt]) await sleep(waits[attempt]);
    await sleep(DELAY_MS);
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'organic-synthesis-gallery-open-version-audit/1.0' },
        signal: AbortSignal.timeout(20_000),
      });
      lastStatus = response.status;
      if (response.status === 429 || response.status === 409 || response.status >= 500) continue;
      if (!response.ok) return { status: response.status, data: null };
      return { status: response.status, data: await response.json() };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return { status: lastStatus, data: null, error: lastError };
}

async function fetchWork(doi) {
  const externalId = encodeURIComponent(`https://doi.org/${doi}`);
  const direct = await fetchJson(`${API}/works/${externalId}`);
  if (direct.status === 200 && direct.data?.id) return direct;

  const fallback = await fetchJson(`${API}/works?filter=doi:${encodeURIComponent(doi)}&per_page=1`);
  if (fallback.status === 200 && Array.isArray(fallback.data?.results) && fallback.data.results[0]) {
    return { status: 200, data: fallback.data.results[0] };
  }
  return direct.status && direct.status !== 404 ? direct : fallback;
}

const gap = JSON.parse(await readFile(GAP_FILE, 'utf8'));
const dois = [...new Set((gap?.dois || []).map(normalizeDoi).filter(Boolean))];
const results = [];
for (let index = 0; index < dois.length; index += 1) {
  const doi = dois[index];
  const fetched = await fetchWork(doi);
  const work = fetched.data;
  const locations = Array.isArray(work?.locations) ? work.locations.map(compactLocation) : [];
  const openLocations = locations.filter(usefulOpenLocation);
  const chemrxiv = openLocations.filter(item => /chemrxiv/i.test(`${item.source || ''} ${item.host || ''} ${item.landingPageUrl || ''}`));
  results.push({
    doi,
    status: fetched.status,
    openAlexId: work?.id || null,
    title: work?.title || work?.display_name || null,
    type: work?.type || null,
    openAccess: work?.open_access || null,
    bestOaLocation: work?.best_oa_location ? compactLocation(work.best_oa_location) : null,
    primaryLocation: work?.primary_location ? compactLocation(work.primary_location) : null,
    openLocations,
    chemrxiv,
    totalLocations: locations.length,
    error: fetched.error || null,
  });
  if ((index + 1) % 15 === 0 || index + 1 === dois.length) console.log(`OPENALEX_OPEN_VERSION_PROGRESS ${index + 1}/${dois.length}`);
}

const withOpenLocations = results.filter(item => item.openLocations.length);
const withChemrxiv = results.filter(item => item.chemrxiv.length);
const withPdf = results.filter(item => item.openLocations.some(location => location.pdfUrl));
const summary = {
  audited: results.length,
  successfulMetadata: results.filter(item => item.status === 200).length,
  serviceErrors: results.filter(item => item.status !== 200).length,
  withNonPublisherOpenLocation: withOpenLocations.length,
  withOpenPdf: withPdf.length,
  withChemRxivLocation: withChemrxiv.length,
};
const report = { generatedAt: new Date().toISOString(), summary, withOpenLocations, withChemrxiv, results };
await writeFile(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`OPENALEX_OPEN_VERSION_SUMMARY ${JSON.stringify(summary)}`);
for (const item of withOpenLocations) console.log(`OPEN_VERSION ${JSON.stringify({ doi: item.doi, title: item.title, locations: item.openLocations })}`);
