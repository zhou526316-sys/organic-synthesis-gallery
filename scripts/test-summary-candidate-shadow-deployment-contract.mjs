import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const deploy=readFileSync('.github/workflows/deploy-worker-frontend.yml','utf8');
const review=readFileSync('cloudflare/worker/src/summary-review.js','utf8');
const wrangler=readFileSync('cloudflare/worker/wrangler.toml','utf8');

function section(source,start,end){
  const a=source.indexOf(start),b=end?source.indexOf(end,a+start.length):source.length;
  assert.ok(a>=0&&b>a,'missing section: '+start);
  return source.slice(a,b);
}

test('summary candidate migration is applied before Worker config/deploy',()=>{
  const migrate=deploy.indexOf('Apply summary candidate index D1 migration');
  const config=deploy.indexOf('Generate frontend deployment configuration');
  const deployStep=deploy.indexOf('Deploy frontend assets');
  assert.ok(migrate>0&&config>migrate&&deployStep>config);
  assert.ok(deploy.includes('wrangler d1 execute "$D1_NAME" --remote --file=../summary-candidate-index-v1.sql'));
  assert.ok(deploy.includes("'summary_review_job_index','summary_review_job_index_backfill'"));
});

test('candidate shadow flag is production-generated only',()=>{
  assert.ok(deploy.includes('SUMMARY_CANDIDATE_INDEX_SHADOW_ENABLED = "1"'));
  assert.ok(!wrangler.includes('SUMMARY_CANDIDATE_INDEX_SHADOW_ENABLED'));
});

test('production review cycle remains on legacy R2 selector',()=>{
  const block=section(review,'export async function runSummaryReviewCycle','export async function compareSummaryReviewCandidateShadow');
  assert.ok(block.includes('selectReviewCandidate(env'));
  assert.ok(!block.includes('selectSummaryCandidateFromIndex'));
  assert.ok(!block.includes('summary_review_job_index'));
});

test('post-deploy candidate step is shadow-only and non-blocking',()=>{
  const block=section(deploy,'- name: Backfill and compare summary candidate index shadow','- name: Promote verified official TOCs into production');
  assert.ok(block.includes('continue-on-error: true'));
  assert.ok(block.includes('/api/admin/article-summary/candidate-index/status'));
  assert.ok(block.includes('/api/admin/article-summary/candidate-index/backfill?limit=1000'));
  assert.ok(block.includes('/api/admin/article-summary/candidate-index/compare'));
  assert.ok(block.includes('/api/admin/article-summary/review-status'));
  assert.ok(block.includes('readPathActive!==false'));
  assert.ok(block.includes('stableComparisons'));
  assert.ok(block.includes('candidateSetHash'));
  assert.ok(block.includes('comparisons.length<3'));
  assert.ok(block.includes('preferredDoi:firstCandidate'));
});

test('legacy saturation and unstable snapshots cannot be promoted as parity',()=>{
  const compare=section(review,'export async function compareSummaryReviewCandidateShadow','export async function getSummaryReviewStatus');
  assert.ok(compare.includes('legacy_reader_at_or_above_10000_object_ceiling'));
  assert.ok(compare.includes('legacy_source_changed_during_comparison'));
  assert.ok(compare.includes('comparable: false'));
  assert.ok(compare.includes('candidateSetHash'));
});

test('D2b2 does not enable model review or change summary schedule',()=>{
  assert.ok(deploy.includes('SUMMARY_REVIEW_ENABLED = "0"'));
  assert.ok(deploy.includes('SUMMARY_MODE = "scheduled_chatgpt_daily_no_api"'));
  assert.ok(deploy.includes('SUMMARY_PUBLICATION_TIME = "12:00 Asia/Shanghai"'));
});

console.log('SUMMARY_CANDIDATE_SHADOW_DEPLOYMENT_CONTRACT_PASS');
