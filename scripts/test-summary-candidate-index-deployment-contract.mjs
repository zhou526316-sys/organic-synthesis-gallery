import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const deploy=readFileSync('.github/workflows/deploy-worker-frontend.yml','utf8');
const site=readFileSync('.github/workflows/site-quality-gate.yml','utf8');
const wrangler=readFileSync('cloudflare/worker/wrangler.toml','utf8');
const review=readFileSync('cloudflare/worker/src/summary-review.js','utf8');
const index=readFileSync('cloudflare/worker/src/index.js','utf8');

function section(source,start,end){
  const a=source.indexOf(start);
  const b=end?source.indexOf(end,a+start.length):source.length;
  assert.ok(a>=0&&b>a,'missing section: '+start);
  return source.slice(a,b);
}

test('candidate migration happens before generated Worker config and deploy',()=>{
  const migration=deploy.indexOf('Apply summary candidate shadow D1 migration');
  const config=deploy.indexOf('Generate frontend deployment configuration');
  const workerDeploy=deploy.indexOf('Deploy frontend assets');
  assert.ok(migration>0&&config>migration&&workerDeploy>config);
  assert.ok(deploy.includes('--file=../summary-candidate-index-v1.sql'));
  assert.ok(deploy.includes("'summary_review_job_index','summary_review_job_index_backfill'"));
});

test('candidate shadow flag is production-generated only',()=>{
  assert.ok(deploy.includes('SUMMARY_CANDIDATE_INDEX_SHADOW_ENABLED = "1"'));
  assert.ok(!wrangler.includes('SUMMARY_CANDIDATE_INDEX_SHADOW_ENABLED'));
});

test('candidate shadow deployment remains non-blocking and read-inactive',()=>{
  const block=section(deploy,'- name: Backfill and compare Summary Candidate Index shadow','- name: Promote verified official TOCs into production');
  assert.ok(block.includes('continue-on-error: true'));
  assert.ok(block.includes('/api/admin/article-summary/candidate-index/status'));
  assert.ok(block.includes('/api/admin/article-summary/candidate-index/backfill?limit=1000'));
  assert.ok(block.includes('/api/admin/article-summary/candidate-index/compare'));
  assert.ok(block.includes('readPathActive!==false'));
  assert.ok(block.includes('if(comparable<3)'));
  assert.ok(block.includes('legacyPotentiallySaturated===true'));
  assert.ok(block.includes('candidateSetHash'));
  assert.ok(block.includes('productionSelector:'legacy_r2''));
  assert.ok(block.includes('comparisonNow=Date.now()'));
  assert.ok(block.includes('body:{now:comparisonNow}'));
  assert.ok(block.includes('body:{preferredDoi,now:comparisonNow}'));
});

test('admin comparison endpoint accepts fixed time but never claims production activation',()=>{
  const block=section(index,"url.pathname === '/api/admin/article-summary/candidate-index/compare'","if (request.method === 'GET' && url.pathname === '/api/user-ui/article-summary')");
  assert.ok(block.includes('const requestedNow = Number(body?.now)'));
  assert.ok(block.includes('Number.isFinite(requestedNow)'));
  assert.ok(block.includes('compareSummaryReviewCandidateShadow'));
});

test('production summary cycle still uses legacy R2 selector',()=>{
  const block=section(review,'export async function runSummaryReviewCycle','export async function compareSummaryReviewCandidateShadow');
  assert.ok(block.includes('selectReviewCandidate(env'));
  assert.ok(!block.includes('selectSummaryCandidateFromIndex'));
  assert.ok(review.includes("mode: 'shadow_comparison'"));
});

test('site quality executes candidate parity tests and D2b2 deployment contract',()=>{
  assert.ok(site.includes('npm run test:summary-candidate-index'));
  assert.ok(site.includes('test-summary-candidate-index-deployment-contract.mjs'));
});

console.log('SUMMARY_CANDIDATE_INDEX_DEPLOYMENT_CONTRACT_PASS');
