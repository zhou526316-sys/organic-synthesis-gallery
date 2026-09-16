import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PUBLIC_DIR = path.resolve('public');

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

const curated = JSON.parse(await readFile(path.join(PUBLIC_DIR, 'curated-supplement.json'), 'utf8'));
const supplementPath = path.join(PUBLIC_DIR, 'literature-supplement.json');
const translationsPath = path.join(PUBLIC_DIR, 'title-translations-zh.json');
const supplement = JSON.parse(await readFile(supplementPath, 'utf8'));
const translationPayload = JSON.parse(await readFile(translationsPath, 'utf8'));

const merged = new Map();
for (const paper of [...(supplement?.papers || []), ...(curated?.papers || [])]) {
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
  });
}

const papers = [...merged.values()].sort((a, b) =>
  String(b.date || '').localeCompare(String(a.date || '')) ||
  String(a.journal || '').localeCompare(String(b.journal || '')) ||
  String(a.title || '').localeCompare(String(b.title || ''))
);

const translations = new Map();
for (const item of translationPayload?.translations || []) {
  if (typeof item?.title === 'string' && typeof item?.zh === 'string' && item.zh.trim()) {
    translations.set(titleKey(item.title), { title: item.title.trim(), zh: item.zh.trim() });
  }
}
for (const paper of curated?.papers || []) {
  if (typeof paper?.title === 'string' && typeof paper?.titleZh === 'string' && paper.titleZh.trim()) {
    translations.set(titleKey(paper.title), { title: paper.title.trim(), zh: paper.titleZh.trim() });
  }
}

await writeFile(supplementPath, JSON.stringify({
  ...supplement,
  generatedAt: Date.now(),
  curatedVerifiedThrough: curated?.verifiedThrough || null,
  papers,
}));
await writeFile(translationsPath, JSON.stringify({ translations: [...translations.values()] }));

console.log(`CURATED_MERGE_SUMMARY ${JSON.stringify({ curated: curated?.papers?.length || 0, supplement: papers.length, translations: translations.size })}`);
