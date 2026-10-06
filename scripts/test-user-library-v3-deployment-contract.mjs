import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const deploy=readFileSync('.github/workflows/deploy-worker-frontend.yml','utf8');
const schema=readFileSync('cloudflare/schema.sql','utf8');
const migration=readFileSync('cloudflare/user-library-state-v3.sql','utf8');
const v3=readFileSync('cloudflare/worker/src/user-library-v3.js','utf8');
const shadow=readFileSync('cloudflare/worker/src/user-library-v3-shadow.js','utf8');
const index=readFileSync('cloudflare/worker/src/index.js','utf8');
const userUi=readFileSync('cloudflare/worker/src/user-ui.js','utf8');
const packageJson=JSON.parse(readFileSync('cloudflare/worker/package.json','utf8'));
const quality=readFileSync('.github/workflows/site-quality-gate.yml','utf8');

function section(source,start,end){
  const a=source.indexOf(start),b=end?source.indexOf(end,a+start.length):source.length;
  assert.ok(a>=0&&b>a,'missing section: '+start);
  return source.slice(a,b);
}

test('D3c V3 schema is isolated, additive and applied before Worker deployment',()=>{
  for(const table of [
    'user_library_v3_head',
    'user_library_v3_rows',
    'user_library_v3_commits',
    'user_library_v3_changes',
    'user_library_v3_shape',
    'user_library_v3_shadow_sync',
    'user_library_v3_backfill',
  ]){
    assert.ok(schema.includes(table),table);
    assert.ok(migration.includes(table),table);
    assert.ok(deploy.includes(table),table);
  }
  const migrate=deploy.indexOf('Apply user library V3 foundation migration');
  const deployStep=deploy.indexOf('Deploy frontend assets');
  assert.ok(migrate>0&&deployStep>migrate);
  assert.ok(deploy.includes('wrangler d1 execute "$D1_NAME" --remote --file=../user-library-state-v3.sql'));
  assert.ok(schema.includes('Legacy user_library_state remains authoritative in D3a'));
  assert.ok(schema.includes('D3c isolated row/delta foundation'));
});

test('D3c production read/write activation remains explicitly off',()=>{
  const config=section(
    deploy,
    '- name: Generate frontend deployment configuration',
    '- name: Deploy frontend assets',
  );
  assert.ok(config.includes('USER_LIBRARY_V3_SHADOW_ENABLED = "1"'));
  assert.ok(config.includes('USER_LIBRARY_V3_READ_ENABLED = "0"'));
  assert.ok(config.includes('USER_LIBRARY_V3_WRITE_ENABLED = "0"'));
  assert.ok(v3.includes("USER_LIBRARY_V3_WRITE_ENABLED"));
  assert.ok(v3.includes("reason:'user_library_v3_write_disabled'"));
  assert.ok(v3.includes("reason:'user_library_v3_read_disabled'"));
  assert.ok(shadow.includes('userLibraryV3ShadowEnabled'));
  assert.ok(shadow.includes('user_library_v3_shadow_atomic_batch_required'));
});

test('D3c1 uses only fail-open shadow writes and authenticated admin diagnostics',()=>{
  assert.ok(userUi.includes("from './user-library-v3-shadow.js'"));
  assert.ok(userUi.includes('safeV3ShadowLibraryWrite'));
  assert.ok(userUi.includes('USER_LIBRARY_V3_SHADOW_WRITE_FAILED'));
  assert.ok((userUi.match(/safeV3ShadowLibraryWrite\\(/g)||[]).length>=3);
  assert.ok(!userUi.includes("from './user-library-v3.js'"));
  assert.ok(!userUi.includes('applyUserLibraryV3Mutation'));
  for(const path of [
    '/api/admin/user-library-v3/status',
    '/api/admin/user-library-v3/backfill',
    '/api/admin/user-library-v3/reconcile',
    '/api/admin/user-library-v3/compare',
  ]) assert.ok(index.includes(path),path);
  assert.ok(!index.includes('/api/user-ui/library-v3'));
  assert.ok(index.includes('requireWriteAuthorization'));
});

test('D3c1 shadow is revision-fenced and preserves legacy shape semantics',()=>{
  for(const token of [
    'inflight_revision',
    'user_library_v3_shadow_revision_conflict',
    'user_library_v3_shadow_claim_lost',
    'user_library_v3_shape',
    'papers_split',
    'metadata_split',
    'source_state_hash',
    'revisionMismatches',
    'semantic_mismatch',
  ]) assert.ok(shadow.includes(token),token);
  assert.ok(shadow.includes('typeof env.DB.batch'));
  assert.ok(shadow.includes('source_revision<excluded.inflight_revision'));
});

test('D3c mutation and delta primitives are bounded and revision-fenced',()=>{
  for(const token of [
    'MAX_MUTATION_OPS = 32',
    'MAX_MUTATION_BYTES = 512 * 1024',
    'MAX_PAGE_LIMIT = 100',
    'MAX_DELTA_LIMIT = 100',
    'expectedRevision',
    'user_library_v3_revision_conflict',
    'user_library_v3_atomic_batch_required',
    'user_library_v3_change_log_pruned',
    'user_library_v3_future_revision',
    'user_library_v3_too_many_operations',
    'user_library_v3_duplicate_paper_key',
  ]) assert.ok(v3.includes(token),token);
  assert.ok(v3.includes('typeof env.DB.batch'));
  assert.ok(v3.includes('user_library_v3_commits'));
  assert.ok(v3.includes('user_library_v3_changes'));
  assert.ok(v3.includes('deleted?1:0'));
});

test('D3c1 production deploy backfills, reconciles, and requires two stable parity passes',()=>{
  const block=section(
    deploy,
    '- name: Backfill and verify user library V3 shadow parity',
    '- name: Advance and reconcile Evidence Index shadow',
  );
  assert.ok(block.includes('continue-on-error: true'));
  assert.ok(block.includes("phase:'D3c1-user-library-v3-shadow'"));
  assert.ok(block.includes('/api/admin/user-library-v3/backfill?limit=20'));
  assert.ok(block.includes('/api/admin/user-library-v3/reconcile?limit=20'));
  assert.ok(block.includes('/api/admin/user-library-v3/compare?offset='));
  assert.ok(block.includes('revisionMismatches'));
  assert.ok(block.includes('passes.length<2'));
  assert.ok(block.includes('mismatched===0'));
  assert.ok(block.includes('readEnabled!==false'));
  assert.ok(block.includes('writeEnabled!==false'));
  assert.ok(block.includes('user-library-v3-shadow-'));
});

test('D3c and D3c1 regression suites are part of the site quality gate',()=>{
  assert.equal(packageJson.scripts['test:user-library-v3'],'node scripts/test-user-library-v3.mjs');
  assert.equal(packageJson.scripts['test:user-library-v3-shadow'],'node scripts/test-user-library-v3-shadow.mjs');
  assert.ok(quality.includes('npm run test:user-library-v3'));
  assert.ok(quality.includes('npm run test:user-library-v3-shadow'));
  assert.ok(quality.includes('node scripts/test-user-library-v3-deployment-contract.mjs'));
});

console.log('USER_LIBRARY_V3_DEPLOYMENT_CONTRACT_PASS');
