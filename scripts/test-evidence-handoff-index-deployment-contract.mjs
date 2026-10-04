import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const deploy=readFileSync('.github/workflows/deploy-worker-frontend.yml','utf8');
const evidence=readFileSync('cloudflare/worker/src/evidence-index.js','utf8');
const handoff=readFileSync('cloudflare/worker/src/scheduled-summary-handoff.js','utf8');
const article=readFileSync('cloudflare/worker/src/article-summary.js','utf8');
const review=readFileSync('cloudflare/worker/src/summary-review.js','utf8');
const router=readFileSync('cloudflare/worker/src/index.js','utf8');

function section(source,start,end){
  const a=source.indexOf(start);
  const b=end?source.indexOf(end,a+start.length):source.length;
  assert.ok(a>=0 && b>a, 'missing section: '+start);
  return source.slice(a,b);
}

test('canonical deploy applies Evidence Index v1 and v2 migrations before Worker deploy',()=>{
  const migrate=deploy.indexOf('Apply Evidence Index D1 migrations');
  const config=deploy.indexOf('Generate frontend deployment configuration');
  const workerDeploy=deploy.indexOf('Deploy frontend assets');
  assert.ok(migrate>0 && config>migrate && workerDeploy>config);
  assert.ok(deploy.includes('--file=../evidence-index-v1.sql'));
  assert.ok(deploy.includes('--file=../evidence-index-v2.sql'));
  assert.ok(deploy.includes("'article_evidence_index','article_evidence_index_backfill','article_evidence_handoff_backfill'"));
});

test('handoff historical backfill remains shadow and bounded per deploy',()=>{
  const block=section(deploy,'- name: Advance and reconcile Evidence Index shadow','- name: Promote verified official TOCs into production');
  assert.ok(block.includes('/api/admin/article-summary/evidence-index/handoff-backfill?limit=500'));
  assert.ok(block.includes('handoffPages<4'));
  assert.ok(block.includes("status.readPathActive!==false"));
  assert.ok(block.includes('handoffReconciled:false'));
  assert.ok(block.includes('Handoff Index accounting mismatch'));
  assert.ok(block.includes('handoffReadyCount<Number(h.matchedRows||0)'));
});

test('handoff backfill runtime only conditionally updates existing Evidence identities',()=>{
  const block=section(evidence,'export async function backfillHandoffIndexPage','export async function getEvidenceIndexStatus');
  assert.ok(block.includes('UPDATE article_evidence_index'));
  assert.ok(block.includes('WHERE doi=? AND evidence_packet_hash=? AND source_hash=?'));
  assert.ok(!block.includes('INSERT INTO article_evidence_index'));
  assert.ok(block.includes('skippedStale'));
  assert.ok(block.includes('skippedInvalid'));
});

test('handoff backfill endpoint is admin-only and not browser-readable',()=>{
  assert.ok(router.includes("'/api/admin/article-summary/evidence-index/handoff-backfill'"));
  const route=section(router,"url.pathname === '/api/admin/article-summary/evidence-index/handoff-backfill'","url.pathname === '/api/admin/article-summary/evidence-index/sample'");
  assert.ok(route.includes('requireWriteAuthorization'));
  const browserSet=section(router,'const BROWSER_READ_PATHS = new Set([',']);');
  assert.ok(!browserSet.includes('evidence-index/handoff-backfill'));
});

test('legacy scheduled handoff discovery still scans R2 and does not query Evidence Index',()=>{
  const pending=section(handoff,'async function pendingHandoffObjects','export async function backfillScheduledEvidenceHandoffs');
  assert.ok(pending.includes('env.MEDIA.list'));
  assert.ok(pending.includes('prefix: HANDOFF_PREFIX'));
  assert.ok(pending.includes('pageNo < 10'));
  assert.ok(!pending.includes('article_evidence_index'));
});

test('legacy Evidence inventory and summary-review candidate discovery remain unchanged readers',()=>{
  const inventory=section(article,'export async function getArticleEvidenceInventory','export const ARTICLE_EVIDENCE_SCHEMA_VERSION');
  assert.ok(inventory.includes('env.MEDIA.list'));
  assert.ok(inventory.includes('prefix: EVIDENCE_PREFIX'));
  assert.ok(!inventory.includes('article_evidence_index'));
  assert.ok(!review.includes('article_evidence_index'));
});

test('runtime status exposes independent Evidence and handoff backfill state while reads stay inactive',()=>{
  assert.ok(evidence.includes('article_evidence_handoff_backfill'));
  assert.ok(evidence.includes('handoffBackfill: handoffState ?'));
  assert.ok(evidence.includes('readPathActive:false'));
});

console.log('EVIDENCE_HANDOFF_INDEX_DEPLOYMENT_CONTRACT_PASS');
