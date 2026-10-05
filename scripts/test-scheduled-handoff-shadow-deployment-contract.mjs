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
  assert.ok(evidence.includes('const handoffReadPathReady=evidenceBackfillComplete&&handoffBackfillComplete'));
  assert.ok(evidence.includes('handoffReadPathActive:scheduledHandoffIndexReadEnabled(env)&&handoffReadPathReady'));
  assert.ok(evidence.includes('backfillEvidenceHandoffIndexPage'));
  assert.ok(evidence.includes('listEvidenceHandoffIndexRows'));
});

test('admin endpoints expose only shadow backfill and parity operations',()=>{
  assert.ok(index.includes("/api/admin/article-summary/evidence-index/handoff-backfill"));
  assert.ok(index.includes("/api/admin/article-summary/evidence-index/handoff-compare"));
  assert.ok(index.includes('compareScheduledHandoffIndexShadow'));
});

test('post-deploy D2c2 gate requires ready active D1 reads plus three stable parity snapshots',()=>{
  const block=section(
    deploy,
    '- name: Backfill and verify scheduled handoff D1 read path',
    '- name: Backfill and compare summary candidate index shadow',
  );
  assert.ok(block.includes('continue-on-error: true'));
  assert.ok(block.includes("import fs from 'node:fs';"));
  assert.ok(!block.includes("const fs=require('fs')"));
  assert.ok(block.includes("status:'started'"));
  assert.ok(block.includes('/api/admin/article-summary/evidence-index/handoff-backfill?limit=500'));
  assert.ok(block.includes('/api/admin/article-summary/evidence-index/handoff-compare?limit=40'));
  assert.ok(block.includes('handoffReadPathReady!==true'));
  assert.ok(block.includes('handoffReadPathActive!==true'));
  assert.ok(block.includes('comparison.readPathActive!==true'));
  assert.ok(block.includes('comparisons.length<3'));
  assert.ok(block.includes("for(const kind of ['pending','backfill'])"));
  assert.ok(block.includes('/api/article-summary/scheduled-handoff?manifest=1&limit=40'));
  assert.ok(block.includes("liveManifest.discoveryMode!=='d1_index'"));
  assert.ok(block.includes('pendingCandidateSetHash'));
  assert.ok(block.includes('backfillCandidateSetHash'));
  assert.ok(block.includes('creationBacklogCount'));
  assert.ok(block.includes('readPathActive:true'));
  assert.ok(block.includes('staleOrMissingRows'));
  assert.ok(block.includes("phase:'D2c2-scheduled-handoff-index-read-live'"));
  const preserve=section(
    deploy,
    '- name: Preserve scheduled handoff readiness shadow report',
    '- name: Backfill and compare summary candidate index shadow',
  );
  assert.ok(preserve.includes('if-no-files-found: error'));
});

test('production scheduled handoff discovery is D1-primary with explicit R2 fallback in D2c2',()=>{
  assert.ok(deploy.includes('SCHEDULED_HANDOFF_INDEX_READ_ENABLED = "1"'));
  const readBlock=section(
    handoff,
    'export async function getScheduledEvidenceHandoff',
    'export async function getScheduledEvidenceHandoffPart',
  );
  assert.ok(readBlock.includes('scheduledHandoffIndexReadEnabled(env)'));
  assert.ok(readBlock.includes('pendingHandoffObjectsIndexed(env, limit)'));
  assert.ok(readBlock.includes("discoveryMode = 'd1_index'"));
  assert.ok(readBlock.includes("discoveryMode = 'legacy_r2_fallback'"));
  assert.ok(readBlock.includes('pendingHandoffObjects(env, limit)'));

  const backfillBlock=section(
    handoff,
    'export async function backfillScheduledEvidenceHandoffs',
    'export async function getScheduledEvidenceHandoff',
  );
  assert.ok(backfillBlock.includes('handoffBackfillObjectsIndexed(env, limit)'));
  assert.ok(backfillBlock.includes("discoveryMode: 'd1_index'"));
  assert.ok(backfillBlock.includes("discoveryMode = 'legacy_r2_fallback'"));
  assert.ok(backfillBlock.includes("prefix: EVIDENCE_PREFIX"));
  assert.ok(backfillBlock.includes("prefix: HANDOFF_PREFIX"));

  const compare=section(
    handoff,
    'export async function compareScheduledHandoffIndexShadow',
    'export async function backfillScheduledEvidenceHandoffs',
  );
  assert.ok(compare.includes('scheduledHandoffIndexReadEnabled(env)'));
  assert.ok(compare.includes('legacyPotentiallySaturated'));
  assert.ok(compare.includes('candidateSetHash'));
});

test('production deployment refuses silent fallback after D2c2 activation',()=>{
  const backfill=section(
    deploy,
    '- name: Backfill encrypted daily-summary handoff',
    '- name: Verify WeChat MP domain file',
  );
  assert.ok(backfill.includes("body.discoveryMode !== 'd1_index'"));
  assert.ok(backfill.includes('summary handoff backfill did not use D1 discovery'));

  const health=section(
    deploy,
    '- name: Verify canonical Worker bindings survived deployment and secret sync',
    '- name: Verify deployed search filtering CSS',
  );
  assert.ok(health.includes('body?.scheduledHandoffIndexReadEnabled === true'));
  assert.ok(health.includes('scheduledHandoffIndexReadEnabled: body.scheduledHandoffIndexReadEnabled'));
});

test('D2c2 changes only handoff discovery and keeps model review/noon publication contract unchanged',()=>{
  assert.ok(deploy.includes('SUMMARY_REVIEW_ENABLED = "0"'));
  assert.ok(deploy.includes('SUMMARY_MODE = "scheduled_chatgpt_daily_no_api"'));
  assert.ok(deploy.includes('SUMMARY_PUBLICATION_TIME = "12:00 Asia/Shanghai"'));
  assert.ok(deploy.includes('SCHEDULED_HANDOFF_INDEX_READ_ENABLED = "1"'));
  assert.ok(index.includes('scheduledHandoffIndexReadEnabled'));
  assert.ok(evidence.includes('scheduledHandoffIndexReadEnabled'));
});

console.log('SCHEDULED_HANDOFF_SHADOW_DEPLOYMENT_CONTRACT_PASS');
