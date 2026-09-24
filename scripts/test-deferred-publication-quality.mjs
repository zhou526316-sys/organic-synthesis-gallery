import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TARGET_JOURNALS } from '../shared/literature-journals.js';

// Only isolated files and a loopback fixture server. Never query the real Gallery or publishers.
const root = await mkdtemp(path.join(tmpdir(), 'gallery-deferred-quality-'));
const script = fileURLToPath(new URL('./validate-literature-quality-gate.mjs', import.meta.url));
const inc = '10.5555/quality-included-fixture', pd = '10.5555/quality-pending-fixture';
const reviewFile = 'audit/review-2026-09-23-synthetic-fixture.json';
await mkdir(path.join(root, 'audit'), { recursive: true });
await mkdir(path.join(root, 'public'), { recursive: true });
await writeFile(path.join(root, 'public/papers.gz.b64'), gzipSync('[]').toString('base64'));
const server = spawn(process.execPath, ['-e', `
  const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
  const root = process.argv[1];
  const server = http.createServer((req, res) => {
    const file = path.join(root, 'public', path.basename((req.url || '').split('?')[0]));
    try { res.end(fs.readFileSync(file)); } catch { res.writeHead(404); res.end('fixture not found'); }
  });
  server.listen(0, '127.0.0.1', () => console.log(server.address().port));
`, root], { stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Loopback fixture server timeout')), 5000);
  server.once('error', error => { clearTimeout(timer); reject(error); });
  server.stdout.once('data', data => { clearTimeout(timer); resolve(Number(String(data).trim())); });
});
function fixture() {
  const accepted = { doi: inc, journal: 'JACS', date: '2026-09-22', title: 'Synthetic included method fixture',
    reason: 'Synthetic fixture describes a general preparative organic reaction, not a real article.',
    evidenceBasis: 'Synthetic evidence confirms a general synthetic method with a diverse preparative substrate scope.',
    firstPassDecision: 'include', challengeDecision: 'include',
    challengeReason: 'The independent synthetic challenge confirms inclusion rather than a materials-only application.' };
  const pending = { doi: pd, journal: 'CCS Chemistry', date: '2026-09-22', title: 'Synthetic deferred fixture',
    reason: 'The synthetic publisher evidence is incomplete; a final scope decision cannot yet be defended.',
    evidenceBasis: 'The synthetic record has metadata, but publisher text and substrate-scope evidence remain unavailable.',
    firstPassDecision: 'pending', challengeDecision: 'pending',
    challengeReason: 'Neither inclusion nor exclusion is supported by the synthetic evidence, so both passes retain pending.',
    evidenceNeeded: 'Obtain publisher abstract and preparative scope evidence.' };
  const review = { generatedAt: '2026-09-23T00:00:00.000Z', releasePolicy: { mode: 'per-doi' },
    accepted: [accepted], rejected: [], pending: [pending], summary: { reviewed: 2, accepted: 1, rejected: 0, pending: 1 },
    qualityControl: { secondPassCompleted: true, unresolvedDisagreements: 0 },
    sourceChecks: TARGET_JOURNALS.map(row => ({ journal: row.name, status: 'checked', candidateCount: 1, syntheticTitleCount: 1,
      sourceType: 'publisher-fixture', sourcePage: 'https://example.invalid/test' })) };
  const state = { phase: 'synced_with_pending', verifiedThrough: '2026-09-21',
    lastWebsiteSync: { verification: { galleryDois: 1 } },
    pendingReviewBacklog: [{ ...pending, sourceReviewFile: reviewFile, nextAction: 'Retry missing publisher evidence in the next fixed pre-review cycle.' }] };
  const audit = { generatedAt: '2026-09-23T00:02:00.000Z', closureDate: '2026-09-22',
    summary: { criticalSourceFailures: 0, sourceFamilyGaps: 0, sourceCoverageAnomalies: 0,
      historicalCoverageLosses: 0, closureCoverageAnomalies: 0, unresolved: 1, missingFromGallery: 1 },
    missingCandidates: [{ doi: pd }] };
  return { review, state, audit, papers: [accepted] };
}
async function run(data) {
  for (const [name, value] of [[reviewFile, data.review], ['audit/literature-update-state.json', data.state],
    ['audit/latest.json', data.audit], ['public/automation-supplement.json', { papers: data.papers }]]) {
    await writeFile(path.join(root, name), JSON.stringify(value));
  }
  const child = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', timeout: 30000,
    env: { ...process.env, GALLERY_SITE: `http://127.0.0.1:${port}` } });
  if (child.error) throw child.error;
  return { exit: child.status, body: JSON.parse(child.stdout || '{}') };
}
const passed = [];
try {
  let data = fixture(), result = await run(data);
  assert.equal(result.exit, 0, JSON.stringify(result.body));
  assert.equal(result.body.publicationChecksPassed, true);
  assert.equal(result.body.reviewComplete, false);
  assert.deepEqual(result.body.deferredDois, [pd]);
  passed.push('published_subset_with_exact_durable_pending_backlog_passes');

  data = fixture(); data.audit.summary.sourceCoverageAnomalies = 1;
  result = await run(data); assert.equal(result.exit, 0, JSON.stringify(result.body));
  assert.equal(result.body.publicationChecksPassed, true);
  passed.push('healthy_source_coverage_warning_does_not_fail_post_release_quality');

  data = fixture(); data.papers.push(data.review.pending[0]);
  result = await run(data); assert.equal(result.exit, 1);
  assert.ok(result.body.failures.some(row => row.includes('deferred DOI leaked')));
  passed.push('pending_in_production_fails');

  data = fixture(); data.audit.missingCandidates = [{ doi: '10.5555/unreviewed-unknown' }];
  result = await run(data); assert.equal(result.exit, 1);
  passed.push('unknown_unreviewed_gap_cannot_be_excused_as_pending');

  data = fixture(); data.state.pendingReviewBacklog = [];
  result = await run(data); assert.equal(result.exit, 1);
  passed.push('lost_pending_backlog_fails');

  data = fixture(); data.state.phase = 'synced';
  result = await run(data); assert.equal(result.exit, 1);
  passed.push('partial_publication_cannot_claim_full_synced');

  data = fixture(); data.state.verifiedThrough = '2026-09-22';
  result = await run(data); assert.equal(result.exit, 1);
  passed.push('pending_prevents_false_closure_not_other_publication');

  data = fixture(); data.review.accepted[0].challengeDecision = 'exclude';
  result = await run(data); assert.equal(result.exit, 1);
  passed.push('accepted_challenge_matches_real_decision_not_missing_annotation');

  console.log(JSON.stringify({ ok: true, tests: passed.length, passed, productionDataModified: false,
    externalNetworkRequests: false, loopbackFixtureOnly: true }, null, 2));
} finally {
  server.kill();
  await rm(root, { recursive: true, force: true });
}
