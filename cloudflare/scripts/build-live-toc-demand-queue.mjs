import { gunzipSync } from 'node:zlib';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'toc-collector', 'queues');
const PUBLIC_QUEUE = path.join(PUBLIC, 'toc-demand-live.json');
const MEDIA_URL = process.env.MEDIA_INDEX_URL || 'https://zhou526316-sys.github.io/organic-synthesis-gallery/media-index.json';
const SUPPLEMENT_URL = process.env.LITERATURE_SUPPLEMENT_URL || 'https://zhou526316-sys.github.io/organic-synthesis-gallery/literature-supplement.json';
const LOCAL_CAPTURE_URL = process.env.LOCAL_CAPTURE_INDEX_URL || 'https://organic-synthesis-gallery.zhou526316.workers.dev/api/media/local-capture-index';
const DISPLAY_GAP_OVERRIDES = 'toc-display-gap-overrides.json';

function normalizeDoi(value) {
  if (typeof value !== 'string') return null;
  let s = value.trim().toLowerCase();
  try { s = decodeURIComponent(s); } catch {}
  s = s.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(s) ? s : null;
}

function canonicalJournal(value='') {
  const s = String(value).trim();
  if (/^(?:angew\b|angewandte chemie)/i.test(s)) return 'Angew';
  return s;
}

function publisherFor(doi) {
  if (doi.startsWith('10.1021/')) return 'acs';
  if (doi.startsWith('10.1002/')) return 'wiley';
  if (doi.startsWith('10.1038/')) return 'nature';
  if (doi.startsWith('10.1126/')) return 'science';
  if (doi.startsWith('10.1039/')) return 'rsc';
  if (doi.startsWith('10.1016/')) return 'elsevier';
  if (doi.startsWith('10.31635/')) return 'ccs';
  return 'other';
}

function embeddedNatureDoi(value) {
  let decoded = String(value || '');
  for (let i = 0; i < 2; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  const match = decoded.match(/10\.1038\/s\d+-\d+-\d+[a-z0-9-]*/i);
  return match ? normalizeDoi(match[0]) : null;
}

function localCaptureBelongsToDoi(item, doi) {
  if (!doi?.startsWith('10.1038/')) return true;
  const embedded = embeddedNatureDoi(item?.sourceUrl || '');
  return !embedded || embedded === doi;
}

function isOfficialToc(toc) {
  if (!toc?.available || !toc?.imageUrl) return false;
  const reason = String(toc.reason || '').toLowerCase();
  if (!reason) return true;
  if (reason === 'figure1_fallback' || reason === 'pdf_primary_fallback') return false;
  if (reason.startsWith('figure_fallback:')) return false;
  if (reason.includes('fallback') && !reason.includes('official')) return false;
  return true;
}

function hasAnyVisual(record) {
  if (record?.toc?.available && record?.toc?.imageUrl) return true;
  const figures = record?.figures?.figures;
  return Array.isArray(figures) && figures.some(x => x?.imageUrl);
}

async function readJson(name) {
  try { return JSON.parse(await readFile(path.join(PUBLIC, name), 'utf8')); } catch { return {}; }
}

async function loadPapers() {
  const encoded = (await readFile(path.join(PUBLIC, 'papers.gz.b64'), 'utf8')).trim();
  const base = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
  const [total, manual, audit, supplement] = await Promise.all([
    readJson('total-synthesis.json'),
    readJson('manual-supplement.json'),
    readJson('final-audit-supplement.json'),
    fetch(SUPPLEMENT_URL, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(45000) })
      .then(response => response.ok ? response.json() : { papers: [] })
      .catch(() => ({ papers: [] })),
  ]);
  const merged = new Map();
  const all = [].concat(Array.isArray(base) ? base : [], total?.papers || [], manual?.papers || [], audit?.papers || [], supplement?.papers || []);
  for (const raw of all) {
    const doi = normalizeDoi(raw?.doi || raw?.url || '');
    if (!doi) continue;
    const paper = { doi, journal: canonicalJournal(raw?.journal || ''), title: typeof raw?.title === 'string' ? raw.title : '', date: typeof raw?.date === 'string' ? raw.date : '' };
    const prev = merged.get(doi);
    if (!prev) merged.set(doi, paper);
    else merged.set(doi, { doi, journal: prev.journal || paper.journal, title: prev.title || paper.title, date: prev.date || paper.date });
  }
  return merged;
}

async function fetchMediaIndex() {
  const response = await fetch(MEDIA_URL, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error('media-index HTTP ' + response.status);
  const json = await response.json();
  return json?.items && typeof json.items === 'object' ? json.items : {};
}

async function fetchLocalCaptureIndex() {
  try {
    const response = await fetch(LOCAL_CAPTURE_URL, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error('local-capture-index HTTP ' + response.status);
    const json = await response.json();
    const map = new Map();
    for (const item of Array.isArray(json?.items) ? json.items : []) {
      const doi = normalizeDoi(item?.doi || '');
      const kind = String(item?.kind || '').toLowerCase();
      if (!doi || !['official','figure1'].includes(kind)) continue;
      if (!localCaptureBelongsToDoi(item, doi)) {
        console.warn('TOC_LOCAL_CAPTURE_CROSS_DOI_REJECTED ' + JSON.stringify({ doi, kind }));
        continue;
      }
      map.set(doi, { kind, updatedAt: Number(item?.updatedAt || 0), sourceUrl: String(item?.sourceUrl || '') });
    }
    return map;
  } catch (error) {
    console.warn('TOC_LOCAL_CAPTURE_INDEX_UNAVAILABLE ' + String(error instanceof Error ? error.message : error));
    return new Map();
  }
}

async function loadDisplayGapOverrides() {
  const payload = await readJson(DISPLAY_GAP_OVERRIDES);
  const map = new Map();
  for (const item of Array.isArray(payload?.items) ? payload.items : []) {
    const doi = normalizeDoi(item?.doi || '');
    if (!doi) continue;
    map.set(doi, String(item?.reason || 'manual_display_gap_override'));
  }
  return map;
}

function csvEscape(value='') {
  const s = String(value);
  return /[\",\n]/.test(s) ? '"' + s.replaceAll('"','""') + '"' : s;
}

async function main() {
  const [papers, media, localCaptures, displayGapOverrides] = await Promise.all([
    loadPapers(),
    fetchMediaIndex(),
    fetchLocalCaptureIndex(),
    loadDisplayGapOverrides(),
  ]);
  const allMissingOfficial = [];
  const displayGaps = [];
  const officialUpgrade = [];
  for (const [doi, paper] of papers) {
    const record = media[doi] || null;
    const liveCapture = localCaptures.get(doi) || null;
    const manualGapReason = displayGapOverrides.get(doi) || '';
    const official = liveCapture?.kind === 'official' || (!manualGapReason && isOfficialToc(record?.toc));
    if (official) continue;

    const anyVisual = liveCapture?.kind === 'figure1'
      || (!manualGapReason && hasAnyVisual(record));

    let existingReason = '';
    if (liveCapture?.kind === 'figure1') existingReason = 'live_r2_figure1_fallback';
    else if (manualGapReason) existingReason = manualGapReason;
    else existingReason = String(record?.toc?.reason || '');

    const row = {
      doi,
      journal: paper.journal,
      title: paper.title,
      date: paper.date,
      publisher: publisherFor(doi),
      state: anyVisual ? 'fallback_only' : 'no_visual',
      existingReason,
    };
    allMissingOfficial.push(row);
    if (anyVisual) officialUpgrade.push(row);
    else displayGaps.push(row);
  }
  const sorter = (a,b) => a.publisher.localeCompare(b.publisher) || a.journal.localeCompare(b.journal) || b.date.localeCompare(a.date) || a.doi.localeCompare(b.doi);
  allMissingOfficial.sort(sorter);
  displayGaps.sort(sorter);
  officialUpgrade.sort(sorter);
  const rows = displayGaps;
  const publishers = ['acs','wiley','nature','science','rsc','elsevier','ccs','other'];
  await mkdir(OUT, { recursive: true });
  async function writeList(name, list) { await writeFile(path.join(OUT, name), list.map(x => x.doi).join('\n') + (list.length ? '\n' : '')); }

  // "toc-demand-*" now means visible website gaps: no usable TOC/Figure fallback at all.
  await writeList('toc-demand-all.txt', displayGaps);
  await writeList('toc-demand-no-visual.txt', displayGaps);
  for (const publisher of publishers) await writeList('toc-demand-' + publisher + '.txt', displayGaps.filter(x => x.publisher === publisher));

  // Separate lower-priority queue: visible fallback exists, but official TOC is still missing.
  await writeList('toc-demand-official-upgrade.txt', officialUpgrade);
  await writeList('toc-demand-missing-official-all.txt', allMissingOfficial);
  for (const publisher of publishers) {
    await writeList('toc-demand-official-upgrade-' + publisher + '.txt', officialUpgrade.filter(x => x.publisher === publisher));
  }
  const csv = ['doi,publisher,journal,date,state,existingReason,title'].concat(allMissingOfficial.map(r => [r.doi,r.publisher,r.journal,r.date,r.state,r.existingReason,r.title].map(csvEscape).join(','))).join('\n') + '\n';
  await writeFile(path.join(OUT, 'toc-demand-all.csv'), csv);
  const byPublisher = Object.fromEntries(publishers.map(p => [p, displayGaps.filter(x => x.publisher === p).length]));
  const upgradeByPublisher = Object.fromEntries(publishers.map(p => [p, officialUpgrade.filter(x => x.publisher === p).length]));
  const byJournal = {};
  for (const r of displayGaps) byJournal[r.journal || 'Unknown'] = (byJournal[r.journal || 'Unknown'] || 0) + 1;
  const summary = {
    generatedAt: new Date().toISOString(),
    mediaIndexUrl: MEDIA_URL,
    localCaptureIndexUrl: LOCAL_CAPTURE_URL,
    literatureSupplementUrl: SUPPLEMENT_URL,
    manualDisplayGapOverrides: displayGapOverrides.size,
    liveLocalCaptures: localCaptures.size,
    webpageDoiCount: papers.size,
    mediaRecordCount: Object.keys(media).length,
    visibleGapTotal: displayGaps.length,
    demandTotal: displayGaps.length,
    noVisual: displayGaps.length,
    fallbackOnlyNeedsOfficialUpgrade: officialUpgrade.length,
    missingOfficialTotal: allMissingOfficial.length,
    byPublisher,
    upgradeByPublisher,
    byJournal,
    sample: displayGaps.slice(0,25),
  };
  await writeFile(path.join(OUT, 'toc-demand-summary.json'), JSON.stringify(summary, null, 2) + '\n');
  const liveQueue = {
    version: 2,
    generatedAt: summary.generatedAt,
    webpageDoiCount: summary.webpageDoiCount,
    visibleGapTotal: displayGaps.length,
    missingOfficialTotal: allMissingOfficial.length,
    officialUpgradeTotal: officialUpgrade.length,
    visibleGaps: displayGaps,
    officialUpgrades: officialUpgrade,
    allMissingOfficial,
  };
  await writeFile(PUBLIC_QUEUE, JSON.stringify(liveQueue, null, 2) + '\n');
  console.log('TOC_DEMAND_SUMMARY ' + JSON.stringify(summary));
  console.log('TOC_LIVE_QUEUE ' + JSON.stringify({ path: PUBLIC_QUEUE, visible: displayGaps.length, upgrades: officialUpgrade.length }));
}

await main();
