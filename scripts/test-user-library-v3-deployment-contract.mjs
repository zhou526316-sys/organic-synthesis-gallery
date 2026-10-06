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
const accountSync=readFileSync('src/user-ui/account-sync.ts','utf8');
const accountSyncTest=readFileSync('tests/account-sync-v3.spec.ts','utf8');
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
    'user_library_v3_authority',
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
  for(const trigger of [
    'trg_user_library_state_block_v3_insert',
    'trg_user_library_state_block_v3_update',
    'user_library_v3_authority_active',
  ]){
    assert.ok(schema.includes(trigger),trigger);
    assert.ok(migration.includes(trigger),trigger);
  }
});

test('D3c4b stages writes through preflight-driven canary mode before public promotion',()=>{
  const preflight=deploy.indexOf('- name: Verify user library V3 write activation preflight');
  const configStart=deploy.indexOf('- name: Generate frontend deployment configuration');
  const canary=deploy.indexOf('- name: Verify V3 write activation with isolated account');
  const promote=deploy.indexOf('- name: Promote V3 write activation to all users');
  assert.ok(preflight>0&&configStart>preflight&&canary>configStart&&promote>canary);

  const config=section(
    deploy,
    '- name: Generate frontend deployment configuration',
    '- name: Dry-run frontend Worker bundle',
  );
  assert.ok(config.includes('V3_WRITE_ACTIVATION_MODE: ${{ steps.user_library_v3_write_preflight.outputs.activation_mode }}'));
  assert.ok(config.includes('V3_WRITE_ENABLED=1'));
  assert.ok(config.includes('V3_WRITE_CANARY_ONLY=1'));
  assert.ok(config.includes('V3_WRITE_CANARY_USER_ID="arch-v3-canary-$GITHUB_RUN_ID"'));
  assert.ok(config.includes('USER_LIBRARY_V3_WRITE_ENABLED = "$V3_WRITE_ENABLED"'));
  assert.ok(config.includes('USER_LIBRARY_V3_WRITE_CANARY_ONLY = "$V3_WRITE_CANARY_ONLY"'));
  assert.ok(config.includes('USER_LIBRARY_V3_WRITE_CANARY_USER_ID = "$V3_WRITE_CANARY_USER_ID"'));
  assert.ok(config.includes('already-active'));
  assert.ok(deploy.includes('D3c4b preflight could not obtain two stable zero-mismatch passes'));

  assert.ok(v3.includes('userLibraryV3WriteConfigured'));
  assert.ok(v3.includes('USER_LIBRARY_V3_WRITE_CANARY_ONLY'));
  assert.ok(v3.includes('USER_LIBRARY_V3_WRITE_CANARY_USER_ID'));
  assert.ok(index.includes('userLibraryV3WriteConfigured'));
  assert.ok(index.includes('userLibraryV3WriteCanaryOnly'));
});
test('D3c4b exposes authenticated V3 mutation only to the effective per-user writer',()=>{
  assert.ok(userUi.includes("from './user-library-v3.js'"));
  assert.ok(userUi.includes('applyUserLibraryV3Mutation'));
  assert.ok(userUi.includes("mode === 'account-v3-mutate'"));
  assert.ok(userUi.includes('userLibraryV3Authority'));
  assert.ok(userUi.includes('userLibraryV3WriteEnabled(env,session.user_id)'));
  assert.ok(userUi.includes("'user_library_v3_write_suspended'"));
  assert.ok(userUi.includes("'user_library_client_upgrade_required'"));
  for(const mode of ['account-v3-head','account-v3-page','account-v3-delta','account-v3-mutate']) assert.ok(userUi.includes(mode),mode);
  assert.ok(userUi.includes('writeAuthority'));
  assert.ok(userUi.includes('v3ReadFreshness'));
  for(const path of [
    '/api/admin/user-library-v3/status',
    '/api/admin/user-library-v3/backfill',
    '/api/admin/user-library-v3/reconcile',
    '/api/admin/user-library-v3/compare',
  ]) assert.ok(index.includes(path),path);
  assert.ok(!index.includes('/api/user-ui/library-v3'));
  assert.ok(index.includes('requireWriteAuthorization'));
});
test('D3c2 shadow is revision-fenced, shape-preserving, and emits delta continuity',()=>{
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
    'shadowRowDiff',
    'user_library_v3_commits',
    'user_library_v3_changes',
    "op:'delete'",
  ]) assert.ok(shadow.includes(token),token);
  assert.ok(shadow.includes('typeof env.DB.batch'));
  assert.ok(shadow.includes('source_revision<excluded.inflight_revision'));
});

test('D3c mutation and delta primitives are bounded and revision-fenced',()=>{
  for(const token of [
    'MAX_MUTATION_OPS = 32',
    'MAX_MUTATION_BYTES = 2 * 1024 * 1024',
    'MAX_GLOBAL_BYTES = 1_500_000',
    'MAX_PAGE_LIMIT = 100',
    'MAX_DELTA_LIMIT = 100',
    'CHANGE_RETENTION_REVISIONS = 512',
    'COMPAT_ROW_SHADOW_VERSION = 2',
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
  assert.ok(v3.includes('INSERT INTO user_paper_state'));
  assert.ok(v3.includes('INSERT INTO user_library_head'));
  assert.ok(v3.includes('INSERT INTO user_library_v3_authority'));
  assert.ok(v3.includes('DELETE FROM user_library_state WHERE user_id=?'));
  assert.ok(v3.includes('DELETE FROM user_library_v3_changes'));
  assert.ok(v3.includes('DELETE FROM user_library_v3_commits'));
  assert.ok(v3.includes('deleted=1 AND revision<?'));
});

test('first V3 authority claim is freshness-fenced both before and inside the atomic batch',()=>{
  for(const token of [
    'legacyAuthorityMeta',
    'shadowSyncMeta',
    'legacyShadowFresh',
    'user_library_v3_shadow_not_fresh',
    "THEN 'v3' ELSE 'stale' END",
    'INNER JOIN user_library_v3_shadow_sync',
  ]) assert.ok(v3.includes(token),token);
  assert.ok(userUi.includes("String(result.reason || 'user_library_v3_revision_conflict')"));
});

test('D3c4b client mutation path remains dirty-key bounded after activation',()=>{
  for(const token of [
    "account-v3-mutate",
    'V3_MUTATION_OP_LIMIT = 32',
    'V3_MUTATION_TARGET_BYTES = 1_500_000',
    'dirtyPaperKeys',
    'dirtyGlobal',
    'mutationBatches',
    'persistV3Desired',
    'user_library_client_upgrade_required',
    "dataset.accountSyncWrite",
    'writeAuthority',
    "'suspended'",
  ]) assert.ok(accountSync.includes(token),token);
  assert.ok(accountSync.includes("detail?.scope==='paper'"));
  assert.ok(accountSync.includes('detail?.paperIds || []'));
  assert.ok(accountSync.includes('relevantPaperKeys'));
  assert.ok(accountSync.includes('mergeDirtyState'));
  assert.ok(!accountSync.includes('allChangedKeys'));
  assert.ok(accountSyncTest.includes('toBeGreaterThan(1_500_000)'));
  assert.ok(accountSyncTest.includes('toEqual([32,32,1])'));
  assert.ok(accountSyncTest.includes('legacy_save_must_not_run'));
  assert.ok(accountSyncTest.includes("writeAuthority:'v3'"));
});
test('D3c4b production deployment requires isolated canary, promotion, rollback and cleanup',()=>{
  const canaryBlock=section(
    deploy,
    '- name: Verify V3 write activation with isolated account',
    '- name: Promote V3 write activation to all users',
  );
  for(const token of [
    'arch-v3-canary-${GITHUB_RUN_ID}',
    "mode:'account-v3-mutate'",
    "mode:'account-v3-delta'",
    "mode:'account-pull'",
    'user_library_v3_revision_conflict',
    'user_library_client_upgrade_required',
    'monolithicDocumentRemoved',
  ]) assert.ok(canaryBlock.includes(token),token);

  const promoteBlock=section(
    deploy,
    '- name: Promote V3 write activation to all users',
    '- name: Roll back V3 write activation on authority/canary failure',
  );
  assert.ok(promoteBlock.includes('USER_LIBRARY_V3_WRITE_CANARY_ONLY = "0"'));
  assert.ok(promoteBlock.includes('USER_LIBRARY_V3_WRITE_CANARY_USER_ID = ""'));
  assert.ok(promoteBlock.includes('userLibraryV3WriteConfigured===true'));
  assert.ok(promoteBlock.includes('userLibraryV3WriteEnabled===true'));
  assert.ok(promoteBlock.includes('userLibraryV3ShadowEnabled===false'));

  const rollbackBlock=section(
    deploy,
    '- name: Roll back V3 write activation on authority/canary failure',
    '- name: Clean up isolated V3 write canary account',
  );
  assert.ok(rollbackBlock.includes('USER_LIBRARY_V3_WRITE_ENABLED = "0"'));
  assert.ok(rollbackBlock.includes('USER_LIBRARY_V3_WRITE_CANARY_ONLY = "0"'));
  assert.ok(rollbackBlock.includes('userLibraryV3WriteConfigured!==false'));
  assert.ok(rollbackBlock.includes('userLibraryV3ShadowEnabled!==true'));

  assert.ok(deploy.includes('- name: Clean up isolated V3 write canary account'));
  assert.ok(deploy.includes('- name: Remove stale monolithic rows for V3-authoritative accounts'));
  assert.ok(deploy.includes('- name: Fail deployment after safe V3 write rollback'));
  assert.ok(deploy.includes("steps.user_library_v3_write_preflight.outputs.activation_mode == 'activate'"));

  const finalHealth=section(
    deploy,
    '- name: Verify canonical Worker bindings survived deployment and secret sync',
    '- name: Verify deployed search filtering CSS',
  );
  assert.ok(finalHealth.includes('body?.userLibraryV3WriteConfigured === true'));
  assert.ok(finalHealth.includes('body?.userLibraryV3WriteCanaryOnly === false'));
  assert.ok(finalHealth.includes('body?.userLibraryV3WriteEnabled === true'));
  assert.ok(finalHealth.includes('body?.userLibraryV3ShadowEnabled === false'));
});
test('D3c through D3c4b regression suites remain in the site quality gate',()=>{
  assert.equal(packageJson.scripts['test:user-library-v3'],'node scripts/test-user-library-v3.mjs');
  assert.equal(packageJson.scripts['test:user-library-v3-shadow'],'node scripts/test-user-library-v3-shadow.mjs');
  assert.ok(quality.includes('npm run test:user-library-v3'));
  assert.ok(quality.includes('npm run test:user-library-v3-shadow'));
  assert.ok(quality.includes('node scripts/test-user-library-v3-deployment-contract.mjs'));
  assert.ok(quality.includes('tests/account-sync-v3.spec.ts'));
});
console.log('USER_LIBRARY_V3_DEPLOYMENT_CONTRACT_PASS');
