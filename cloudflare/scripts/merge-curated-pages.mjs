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

function earliestAddedDate(a, b) {
  const left = /^\d{4}-\d{2}-\d{2}$/.test(String(a || '')) ? String(a) : '';
  const right = /^\d{4}-\d{2}-\d{2}$/.test(String(b || '')) ? String(b) : '';
  if (!left) return right || undefined;
  if (!right) return left;
  return left <= right ? left : right;
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
    const existingAuthors = Array.isArray(existing.authors) ? existing.authors.filter(Boolean) : [];
    const incomingAuthors = Array.isArray(paper.authors) ? paper.authors.filter(Boolean) : [];
    merged.set(key, {
      ...existing,
      ...paper,
      authors: incomingAuthors.length ? incomingAuthors : existingAuthors,
      ...(earliestAddedDate(existing.addedDate, paper.addedDate) ? { addedDate: earliestAddedDate(existing.addedDate, paper.addedDate) } : {}),
      new: Boolean(existing.new || paper.new),
      ...(existing.synthesisType && !paper.synthesisType ? { synthesisType: existing.synthesisType } : {}),
    });
  }
  return [...merged.values()].sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || '')) ||
    String(a.journal || '').localeCompare(String(b.journal || '')) ||
    String(a.title || '').localeCompare(String(b.title || ''))
  );
}

const curated = JSON.parse(await readFile(path.join(PUBLIC_DIR, 'curated-supplement.json'), 'utf8'));
let automation = { papers: [] };
try {
  automation = JSON.parse(await readFile(path.join(PUBLIC_DIR, 'automation-supplement.json'), 'utf8'));
} catch {}
let rolling = { papers: [] };
try {
  rolling = JSON.parse(await readFile(path.join(PUBLIC_DIR, 'rolling-supplement.json'), 'utf8'));
} catch {}
const auditedPapers = mergePapers(curated?.papers || [], automation?.papers || [], rolling?.papers || []);
// literature-supplement.json is a generated compatibility artifact, not an
// authoritative merge input. The current source contract is curated +
// automation + rolling, while final-audit remains the browser's mandatory static set.
const supplementPath = path.join(PUBLIC_DIR, 'literature-supplement.json');
const finalAuditPath = path.join(PUBLIC_DIR, 'final-audit-supplement.json');
const translationsPath = path.join(PUBLIC_DIR, 'title-translations-zh.json');
const finalAudit = JSON.parse(await readFile(finalAuditPath, 'utf8'));
let translationPayload = { translations: [] };
try {
  translationPayload = JSON.parse(await readFile(translationsPath, 'utf8'));
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const papers = auditedPapers;
const mandatoryStaticPapers = mergePapers(finalAudit?.papers || [], auditedPapers);

const translations = new Map();
for (const item of translationPayload?.translations || []) {
  if (typeof item?.title === 'string' && typeof item?.zh === 'string' && item.zh.trim()) {
    translations.set(titleKey(item.title), { title: item.title.trim(), zh: item.zh.trim() });
  }
}
for (const paper of auditedPapers) {
  if (typeof paper?.title === 'string' && typeof paper?.titleZh === 'string' && paper.titleZh.trim()) {
    translations.set(titleKey(paper.title), { title: paper.title.trim(), zh: paper.titleZh.trim() });
  }
}

await writeFile(supplementPath, JSON.stringify({
  generatedAt: Date.now(),
  generatedFrom: ['curated-supplement.json', 'automation-supplement.json', 'rolling-supplement.json'],
  curatedVerifiedThrough: curated?.verifiedThrough || null,
  papers,
}));

await writeFile(finalAuditPath, JSON.stringify({
  ...finalAudit,
  verifiedThrough: curated?.verifiedThrough || finalAudit?.verifiedThrough || null,
  curatedMerged: true,
  automationMerged: true,
  rollingMerged: true,
  papers: mandatoryStaticPapers,
}));

await writeFile(translationsPath, JSON.stringify({ translations: [...translations.values()] }));

console.log(`CURATED_MERGE_SUMMARY ${JSON.stringify({
  curated: curated?.papers?.length || 0,
  automation: automation?.papers?.length || 0,
  rolling: rolling?.papers?.length || 0,
  supplement: papers.length,
  mandatoryStatic: mandatoryStaticPapers.length,
  translations: translations.size,
})}`);
