import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const deploy=readFileSync('.github/workflows/deploy-worker-frontend.yml','utf8');
const handoff=readFileSync('cloudflare/worker/src/scheduled-summary-handoff.js','utf8');
const evidence=readFileSync('cloudflare/worker/src/evidence-index.js','utf8');
const index=readFileSync('cloudflare/worker/src/index.js','utf8');
const sql=readFileSync('cloudflare/evidence-index-v1.sql','utf8');

function section(source,start,end){
  const a=source.indexOf(start),b=end?source.indexOf(end,a+start.length):source.length;
  assert.ok(a>=0&&b>a,'missing section: '+start);
  return source.slice(a,b);
}

test('canonical Worker deploy applies Evidence handoff cursor schema before deployment',()=>{
  const migrate=deploy.indexOf('Apply Evidence Index D1 migration');
  const config=deploy.indexOf('Generate frontend deployment configuration');
  const deployStep=deploy.indexOf('Deploy frontend assets');
  assert.ok(migrate>0&&config>migrate&&deployStep>config);
  assert.ok(deploy.includes('wrangler d1 execute "$D1_NAME" --remote --file=../evidence-index-v1.sql'));
  for(const table of ['article_evidence_index','article_evidence_index_backfill','article_evidence_handoff_backfill']){
    assert.ok(deploy.includes(table),table);
    assert.ok(sql.includes(table),table);
  }
});

test('historical handoff backfill is cursor-persisted and exact-hash fenced',()=>{
  assert.ok(evidence.includes('article_evidence_handoff_backfill'));
  assert.ok(evidence.includes('evidence_packet_hash=? AND source_hash=?'));
  assert.ok(evidence.includes('handoffReadPathReady:evidenceBackfillComplete&&handoffBackfillComplete'));
  assert.ok(evidence.includes('backfillEvidenceHandoffIndexPage'));
  assert.ok(evidence.includes('listEvidenceHandoffIndexRows'));
});

test('admin endpoints expose only shadow backfill and parity operations',()=>{
  assert.ok(index.includes("/api/admin/article-summary/evidence-index/handoff-backfill"));
  assert.ok(index.includes("/api/admin/article-summary/evidence-index/handoff-compare"));
  assert.ok(index.includes('compareScheduledHandoffIndexShadow'));
});

test('post-deploy D2c1 gate requires complete backfill and three stable parity snapshots',()=>{
  const block=section(
    deploy,
    '- name: Backfill and compare scheduled handoff readiness shadow',
    '- name: Backfill and compare summary candidate index shadow',
  );
  assert.ok(block.includes('continue-on-error: true'));
  assert.ok(block.includes('/api/admin/article-summary/evidence-index/handoff-backfill?limit=500'));
  assert.ok(block.includes('/api/admin/article-summary/evidence-index/handoff-compare?limit=40'));
  assert.ok(block.includes('handoffReadPathReady!==true'));
  assert.ok(block.includes('comparisons.length<3'));
  assert.ok(block.includes("for(const kind of ['pending','backfill'])"));
  assert.ok(block.includes('pendingCandidateSetHash'));
  assert.ok(block.includes('backfillCandidateSetHash'));
  assert.ok(block.includes('creationBacklogCount'));
  assert.ok(block.includes('readPathActive:false'));
  assert.ok(block.includes('staleOrMissingRows'));
  assert.ok(block.includes("phase:'D2c1-scheduled-handoff-readiness-shadow-live'"));
});

test('production scheduled handoff read path remains on legacy R2 discovery in D2c1',()=>{
  const block=section(
    handoff,
    'export async function getScheduledEvidenceHandoff',
    'export async function getScheduledEvidenceHandoffPart',
  );
  assert.ok(block.includes('pendingHandoffObjects(env, limit)'));
  assert.ok(!block.includes('pendingHandoffSelectionIndexed'));
  assert.ok(!block.includes('listEvidenceHandoffIndexRows'));
  const compare=section(
    handoff,
    'export async function compareScheduledHandoffIndexShadow',
    'export async function backfillScheduledEvidenceHandoffs',
  );
  assert.ok(compare.includes("readPathActive:false"));
  assert.ok(compare.includes('legacyPotentiallySaturated'));
  assert.ok(compare.includes('pendingHandoffSelectionLegacy'));
  assert.ok(compare.includes('pendingHandoffSelectionIndexed'));
  assert.ok(compare.includes('handoffBackfillSelectionLegacy'));
  assert.ok(compare.includes('handoffBackfillSelectionIndexed'));
  assert.ok(compare.includes('candidateSetHash'));
});

test('D2c1 does not enable model review or change noon summary publication contract',()=>{
  assert.ok(deploy.includes('SUMMARY_REVIEW_ENABLED = "0"'));
  assert.ok(deploy.includes('SUMMARY_MODE = "scheduled_chatgpt_daily_no_api"'));
  assert.ok(deploy.includes('SUMMARY_PUBLICATION_TIME = "12:00 Asia/Shanghai"'));
});

console.log('SCHEDULED_HANDOFF_SHADOW_DEPLOYMENT_CONTRACT_PASS');
