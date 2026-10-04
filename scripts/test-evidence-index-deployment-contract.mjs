import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const deploy=readFileSync('.github/workflows/deploy-worker-frontend.yml','utf8');
const article=readFileSync('cloudflare/worker/src/article-summary.js','utf8');
const handoff=readFileSync('cloudflare/worker/src/scheduled-summary-handoff.js','utf8');
const review=readFileSync('cloudflare/worker/src/summary-review.js','utf8');
const wrangler=readFileSync('cloudflare/worker/wrangler.toml','utf8');

function section(source,start,end){
  const a=source.indexOf(start);
  const b=end?source.indexOf(end,a+start.length):source.length;
  assert.ok(a>=0 && b>a, 'missing section: '+start);
  return source.slice(a,b);
}

test('production deploy applies Evidence Index schema before Worker deploy',()=>{
  const migrate=deploy.indexOf('Apply Evidence Index shadow D1 migration');
  const generate=deploy.indexOf('Generate frontend deployment configuration');
  const workerDeploy=deploy.indexOf('Deploy frontend assets');
  assert.ok(migrate>0 && generate>migrate && workerDeploy>generate);
  assert.ok(deploy.includes('wrangler d1 execute "$D1_NAME" --remote --file=../evidence-index-v1.sql'));
  assert.ok(deploy.includes("'article_evidence_index','article_evidence_index_backfill'"));
});

test('shadow flag is enabled only in generated production config, not base wrangler',()=>{
  assert.ok(deploy.includes('EVIDENCE_INDEX_SHADOW_ENABLED = "1"'));
  assert.ok(!wrangler.includes('EVIDENCE_INDEX_SHADOW_ENABLED'));
});

test('post-deploy backfill remains shadow and cannot switch reads',()=>{
  const block=section(deploy,'- name: Backfill and reconcile Evidence Index shadow','- name: Promote verified official TOCs into production');
  assert.ok(block.includes('continue-on-error: true'));
  assert.ok(block.includes('/api/admin/article-summary/evidence-index/status'));
  assert.ok(block.includes('/api/admin/article-summary/evidence-index/backfill?limit=1000'));
  assert.ok(block.includes('/api/article-summary/evidence-inventory'));
  assert.ok(block.includes('readPathActive !== false'));
  assert.ok(block.includes('backfillPagesThisRun'));
  assert.ok(block.includes('handoffHistoricalBackfillComplete: false'));
  assert.ok(block.includes('if (pages > 100)'));
});

test('legacy Evidence inventory still reads R2 directly and does not read D1 index',()=>{
  const block=section(article,'export async function getArticleEvidenceInventory','export const ARTICLE_EVIDENCE_SCHEMA_VERSION');
  assert.ok(block.includes('env.MEDIA.list'));
  assert.ok(block.includes('prefix: EVIDENCE_PREFIX'));
  assert.ok(block.includes('pageNo < 10'));
  assert.ok(!block.includes('article_evidence_index'));
  assert.ok(!block.includes('env.DB'));
});

test('scheduled handoff discovery still uses legacy capped R2 list path',()=>{
  const pending=section(handoff,'async function pendingHandoffObjects','export async function backfillScheduledEvidenceHandoffs');
  assert.ok(pending.includes('env.MEDIA.list'));
  assert.ok(pending.includes('pageNo < 10'));
  assert.ok(pending.includes('prefix: HANDOFF_PREFIX'));
  assert.ok(!pending.includes('article_evidence_index'));
});

test('summary-review discovery is not switched to Evidence Index in D2a1',()=>{
  assert.ok(!review.includes('article_evidence_index'));
  assert.ok(!review.includes('EVIDENCE_INDEX_SHADOW_ENABLED'));
});

test('shadow deployment report explicitly treats handoff readiness as incomplete history',()=>{
  assert.ok(deploy.includes("handoffHistoricalBackfillComplete: false"));
  assert.ok(deploy.includes("Handoff readiness is a dual-write lower bound"));
});

console.log('EVIDENCE_INDEX_DEPLOYMENT_CONTRACT_PASS');
