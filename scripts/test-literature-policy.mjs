import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import {
  EXCLUDED_DOIS,
  earliestAddedDate,
  isExcludedDoi,
  isNewToday,
  msUntilNextBeijingDay,
} from '../shared/literature-policy.js';

const PUBLIC_DIR = path.resolve('public');
const SOURCES = [
  'total-synthesis.json',
  'manual-supplement.json',
  'final-audit-supplement.json',
  'curated-supplement.json',
  'automation-supplement.json',
  'rolling-supplement.json',
  'literature-supplement.json',
];

const findings = [];
const formalAddedByDate = new Map();
const recordAddedDate = paper => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(paper?.addedDate || ''))) return;
  const key = String(paper.doi || paper.title || '').toLowerCase();
  if (!key) return;
  const set = formalAddedByDate.get(paper.addedDate) || new Set();
  set.add(key);
  formalAddedByDate.set(paper.addedDate, set);
};
for (const file of SOURCES) {
  try {
    const payload = JSON.parse(await readFile(path.join(PUBLIC_DIR, file), 'utf8'));
    for (const paper of payload?.papers || []) {
      if (isExcludedDoi(paper?.doi)) findings.push({ file, doi: paper.doi });
      recordAddedDate(paper);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const baseEncoded = (await readFile(path.join(PUBLIC_DIR, 'papers.gz.b64'), 'utf8')).trim();
const base = JSON.parse(gunzipSync(Buffer.from(baseEncoded, 'base64')).toString('utf8'));
for (const paper of base) {
  if (isExcludedDoi(paper?.doi)) findings.push({ file: 'papers.gz.b64', doi: paper.doi });
  recordAddedDate(paper);
}

assert.deepEqual(findings, [], `Excluded DOI present in formal source: ${JSON.stringify(findings)}`);
assert.equal(EXCLUDED_DOIS.size >= 2, true);

const beforeMidnight = new Date('2026-09-18T15:59:59.500Z'); // 23:59:59.5 Asia/Shanghai
const afterMidnight = new Date('2026-09-18T16:00:00.500Z'); // 00:00:00.5 Asia/Shanghai
assert.equal(isNewToday('2026-09-18', beforeMidnight), true);
assert.equal(isNewToday('2026-09-18', afterMidnight), false);
assert.equal(isNewToday('2026-09-19', afterMidnight), true);
assert.equal(isNewToday(undefined, afterMidnight), false);
assert.equal(earliestAddedDate('2026-09-18', '2026-09-19'), '2026-09-18');
assert.equal(earliestAddedDate('', '2026-09-19'), '2026-09-19');
assert.ok(msUntilNextBeijingDay(beforeMidnight) > 0 && msUntilNextBeijingDay(beforeMidnight) < 2000);

const mainSource = await readFile(path.resolve('src/main.ts'), 'utf8');
assert.ok(mainSource.includes("${isNewToday(paper) ? `<span class='tag new'>"), 'Card badge must be driven by isNewToday(paper)');
assert.ok(mainSource.includes(".filter(paper => !onlyNew || isNewToday(paper))"), 'Only-new filter must be driven by isNewToday(paper)');

const automation = JSON.parse(await readFile(path.join(PUBLIC_DIR, 'automation-supplement.json'), 'utf8'));
const automationPapers = automation.papers || [];
assert.ok(automationPapers.length > 0, 'Reviewed automation set must not be empty');
const automationByDoi = new Map(automationPapers.map(paper => [String(paper.doi || '').toLowerCase(), paper]));
for (const paper of automationPapers) {
  assert.match(String(paper.addedDate || ''), /^\d{4}-\d{2}-\d{2}$/, `Missing stable addedDate: ${paper.doi}`);
  const key = String(paper.doi || paper.title || '').toLowerCase();
  assert.equal(formalAddedByDate.get(paper.addedDate)?.has(key), true, `Formal sources lost addedDate mapping: ${paper.doi}`);
}

const updateState = JSON.parse(await readFile(path.resolve('audit/literature-update-state.json'), 'utf8'));
const latestReview = updateState?.lastCompletedReview;
assert.ok(latestReview, 'Latest completed review metadata is required');
const latestReviewedDois = Array.isArray(latestReview.addedDois)
  ? latestReview.addedDois
  : Array.isArray(updateState?.lastCompletedFetch?.addedThisRun)
    ? updateState.lastCompletedFetch.addedThisRun
    : [];
assert.ok(Array.isArray(latestReviewedDois), 'Latest reviewed DOI list must be an array');
const latestReviewDate = String(latestReview.finishedAt || updateState?.lastCompletedFetch?.finishedAt || '').slice(0, 10);
for (const doi of latestReviewedDois) {
  const paper = automationByDoi.get(String(doi).toLowerCase());
  assert.ok(paper, `Latest reviewed DOI missing from automation supplement: ${doi}`);
  assert.equal(paper.addedDate, latestReviewDate, `Latest reviewed DOI has wrong addedDate: ${doi}`);
}

console.log(JSON.stringify({
  excludedDois: [...EXCLUDED_DOIS],
  excludedFindings: findings.length,
  midnight: 'passed',
  reviewedSet: automationPapers.length,
  latestReviewedSet: latestReviewedDois.length,
  addedDates: Object.fromEntries([...formalAddedByDate].map(([date, set]) => [date, set.size])),
}));
