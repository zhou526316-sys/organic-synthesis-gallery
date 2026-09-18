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
let formalAddedDateCount = 0;
for (const file of SOURCES) {
  try {
    const payload = JSON.parse(await readFile(path.join(PUBLIC_DIR, file), 'utf8'));
    for (const paper of payload?.papers || []) {
      if (isExcludedDoi(paper?.doi)) findings.push({ file, doi: paper.doi });
      if (paper?.addedDate === '2026-09-18') formalAddedDateCount += 1;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const baseEncoded = (await readFile(path.join(PUBLIC_DIR, 'papers.gz.b64'), 'utf8')).trim();
const base = JSON.parse(gunzipSync(Buffer.from(baseEncoded, 'base64')).toString('utf8'));
for (const paper of base) {
  if (isExcludedDoi(paper?.doi)) findings.push({ file: 'papers.gz.b64', doi: paper.doi });
  if (paper?.addedDate === '2026-09-18') formalAddedDateCount += 1;
}

assert.deepEqual(findings, [], `Excluded DOI present in formal source: ${JSON.stringify(findings)}`);
assert.equal(EXCLUDED_DOIS.size >= 2, true);
assert.equal(formalAddedDateCount, 19, 'Exactly the reviewed 19 papers may carry addedDate=2026-09-18 across formal sources');

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
assert.equal((automation.papers || []).length, 19, 'Reviewed automation set must stay at 19');
for (const paper of automation.papers || []) {
  assert.equal(paper.addedDate, '2026-09-18', `Missing stable addedDate: ${paper.doi}`);
}

console.log(JSON.stringify({
  excludedDois: [...EXCLUDED_DOIS],
  excludedFindings: findings.length,
  midnight: 'passed',
  reviewedSet: automation.papers.length,
  formalAddedDateCount,
}));
