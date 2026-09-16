import { readFile } from 'node:fs/promises';
import path from 'node:path';

const BACKEND = (process.env.GALLERY_BACKEND || 'https://organic-synthesis-gallery.zhou526316.workers.dev').replace(/\/$/, '');
const TOKEN = String(process.env.BRIDGE_WRITE_TOKEN || '').trim();
const CURATED_FILE = path.resolve(process.env.CURATED_FILE || 'public/curated-supplement.json');

if (!TOKEN) throw new Error('BRIDGE_WRITE_TOKEN is required.');

async function post(pathname, body) {
  const response = await fetch(`${BACKEND}${pathname}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${pathname} HTTP ${response.status}: ${text.slice(0, 500)}`);
  try { return JSON.parse(text); } catch { return { text }; }
}

const curated = JSON.parse(await readFile(CURATED_FILE, 'utf8'));
const rawPapers = Array.isArray(curated?.papers) ? curated.papers : [];
const papers = rawPapers.flatMap(paper => {
  if (!paper || typeof paper !== 'object') return [];
  const title = typeof paper.title === 'string' ? paper.title.trim() : '';
  const journal = typeof paper.journal === 'string' ? paper.journal.trim() : '';
  const date = typeof paper.date === 'string' ? paper.date.trim() : '';
  if (!title || !journal || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  return [{
    journal,
    title,
    doi: typeof paper.doi === 'string' ? paper.doi.trim() : null,
    date,
    url: typeof paper.url === 'string' ? paper.url.trim() : null,
    new: paper.new !== false,
    ...(paper.synthesisType === 'total' || paper.synthesisType === 'formal' ? { synthesisType: paper.synthesisType } : {}),
    source: 'github-curated-supplement',
  }];
});

const translations = rawPapers.flatMap(paper => {
  const title = typeof paper?.title === 'string' ? paper.title.trim() : '';
  const zh = typeof paper?.titleZh === 'string' ? paper.titleZh.trim() : '';
  return title && zh ? [{ title, zh }] : [];
});

const generatedAt = Date.now();
const literatureResult = await post('/api/literature/supplement/import', {
  papers,
  generatedAt,
  verifiedThrough: typeof curated?.verifiedThrough === 'string' ? curated.verifiedThrough : null,
  reviewSummary: {
    source: 'github-curated-supplement',
    syncedAt: new Date(generatedAt).toISOString(),
    paperCount: papers.length,
  },
});

let translationResult = { imported: 0 };
if (translations.length) {
  translationResult = await post('/api/title-translations/zh/import', { translations });
}

const dois = [...new Set(papers.map(paper => paper.doi).filter(value => typeof value === 'string' && value.trim()))];
let inventory = { items: [] };
if (dois.length) {
  const response = await fetch(`${BACKEND}/api/media/inventory`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dois }),
    signal: AbortSignal.timeout(30_000),
  });
  if (response.ok) inventory = await response.json();
}

const items = Array.isArray(inventory?.items) ? inventory.items : [];
const summary = {
  curatedPapers: papers.length,
  curatedDois: dois.length,
  literatureImported: Number(literatureResult?.imported || 0),
  repairSeeded: Number(literatureResult?.mediaRepairSeeded || 0),
  translationsImported: Number(translationResult?.imported || 0),
  withRealToc: items.filter(item => item?.tocStored === true).length,
  tocMissing: items.filter(item => item?.tocMissing === true).length,
  withFigures: items.filter(item => Number(item?.figureCount || 0) > 0).length,
};
console.log(`CURATED_SYNC_SUMMARY ${JSON.stringify(summary)}`);
