import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PUBLIC_DIR = path.resolve('public');
const DAILY_UPDATE_PATH = path.join(PUBLIC_DIR, 'literature-update-2026-09-17.json');

function normalizeDoi(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
}

function titleKey(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
}

function latestDate(...values) {
  return values.filter(value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))).sort().at(-1) || null;
}

async function readJsonOptional(filePath, fallback = {}) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

function mergePapers(...sets) {
  const merged = new Map();
  for (const paper of sets.flat()) {
    if (!paper || typeof paper !== 'object') continue;
    const doi = normalizeDoi(paper.doi);
    const title = titleKey(paper.title);
    const key = doi || `title:${title}`;
    if (!key || key === 'title:') continue;
    const existing = merged.get(key) || {};
    merged.set(key, {
      ...existing,
      ...paper,
      new: Boolean(existing.new || paper.new),
      ...(existing.synthesisType && !paper.synthesisType ? { synthesisType: existing.synthesisType } : {}),
      ...(Array.isArray(existing.authors) && existing.authors.length && (!Array.isArray(paper.authors) || !paper.authors.length)
        ? { authors: existing.authors }
        : {}),
    });
  }
  return [...merged.values()].sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || '')) ||
    String(a.journal || '').localeCompare(String(b.journal || '')) ||
    String(a.title || '').localeCompare(String(b.title || ''))
  );
}

const curated = JSON.parse(await readFile(path.join(PUBLIC_DIR, 'curated-supplement.json'), 'utf8'));
const daily = await readJsonOptional(DAILY_UPDATE_PATH, { papers: [] });
const supplementPath = path.join(PUBLIC_DIR, 'literature-supplement.json');
const finalAuditPath = path.join(PUBLIC_DIR, 'final-audit-supplement.json');
const translationsPath = path.join(PUBLIC_DIR, 'title-translations-zh.json');
const supplement = JSON.parse(await readFile(supplementPath, 'utf8'));
const finalAudit = JSON.parse(await readFile(finalAuditPath, 'utf8'));
const translationPayload = JSON.parse(await readFile(translationsPath, 'utf8'));

const papers = mergePapers(supplement?.papers || [], curated?.papers || [], daily?.papers || []);
const mandatoryStaticPapers = mergePapers(finalAudit?.papers || [], curated?.papers || [], daily?.papers || []);
const verifiedThrough = latestDate(daily?.verifiedThrough, curated?.verifiedThrough, finalAudit?.verifiedThrough);

const translations = new Map();
for (const item of translationPayload?.translations || []) {
  if (typeof item?.title === 'string' && typeof item?.zh === 'string' && item.zh.trim()) {
    translations.set(titleKey(item.title), { title: item.title.trim(), zh: item.zh.trim() });
  }
}
for (const paper of [...(curated?.papers || []), ...(daily?.papers || [])]) {
  if (typeof paper?.title === 'string' && typeof paper?.titleZh === 'string' && paper.titleZh.trim()) {
    translations.set(titleKey(paper.title), { title: paper.title.trim(), zh: paper.titleZh.trim() });
  }
}

await writeFile(supplementPath, JSON.stringify({
  ...supplement,
  generatedAt: Date.now(),
  curatedVerifiedThrough: verifiedThrough,
  papers,
}));

await writeFile(finalAuditPath, JSON.stringify({
  ...finalAudit,
  verifiedThrough,
  curatedMerged: true,
  papers: mandatoryStaticPapers,
}));

await writeFile(translationsPath, JSON.stringify({ translations: [...translations.values()] }));

console.log(`CURATED_MERGE_SUMMARY ${JSON.stringify({
  curated: curated?.papers?.length || 0,
  daily: daily?.papers?.length || 0,
  verifiedThrough,
  supplement: papers.length,
  mandatoryStatic: mandatoryStaticPapers.length,
  translations: translations.size,
})}`);
