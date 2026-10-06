import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const deploy=readFileSync('.github/workflows/deploy-worker-frontend.yml','utf8');
const userUi=readFileSync('cloudflare/worker/src/user-ui.js','utf8');
const shadow=readFileSync('cloudflare/worker/src/user-library-shadow.js','utf8');
const index=readFileSync('cloudflare/worker/src/index.js','utf8');
const schema=readFileSync('cloudflare/schema.sql','utf8');
const migration=readFileSync('cloudflare/user-library-state-v2.sql','utf8');

function section(source,start,end){
  const a=source.indexOf(start),b=end?source.indexOf(end,a+start.length):source.length;
  assert.ok(a>=0&&b>a,'missing section: '+start);
  return source.slice(a,b);
}

test('D3b keeps the D3a migration isolated, canonical, and applied before Worker deployment',()=>{
  for(const table of ['user_library_head','user_paper_state','user_library_shadow_backfill']){
    assert.ok(schema.includes(table),table);
    assert.ok(migration.includes(table),table);
    assert.ok(deploy.includes(table),table);
  }
  const migrate=deploy.indexOf('Apply user library row-shadow D1 migration');
  const deployStep=deploy.indexOf('Deploy frontend assets');
  assert.ok(migrate>0&&deployStep>migrate);
  assert.ok(deploy.includes('wrangler d1 execute "$D1_NAME" --remote --file=../user-library-state-v2.sql'));
});

test('D3b account reads are row-primary with a lazy legacy JSON fallback',()=>{
  const helper=section(userUi,'async function readAccountLibraryState','async function linkProfileToSession');
  assert.ok(helper.includes("SELECT revision, updated_at FROM user_library_state WHERE user_id = ?"));
  assert.ok(helper.includes('readUserLibraryStateFromRows'));
  assert.ok(helper.includes("readPath: v3Authority ? 'rows-v3-compat' : 'rows'"));
  assert.ok(helper.includes("readPath:'rows-v3-compat-unavailable'"));
  assert.ok(helper.includes("writeAuthority:'legacy'"));
  assert.ok(shadow.includes('compatibilityAuthority'));
  assert.ok(shadow.includes("? 'v3' : 'legacy'") || shadow.includes("?'v3':'legacy'"));
  assert.ok(helper.includes("SELECT state_json, revision, updated_at FROM user_library_state WHERE user_id = ?"));
  assert.ok(helper.includes("readPath: legacy ? 'legacy_fallback' : 'legacy_empty'"));
  const account=section(userUi,'async function accountState','async function cleanOpenReaderCounts');
  assert.ok(account.includes('const current = await readAccountLibraryState'));
  assert.ok(account.includes('state: current.state'));
  assert.ok(account.includes('readPath: current.readPath'));
  assert.ok(userUi.includes('const MAX_LIBRARY_STATE_BYTES = 1_500_000'));
  assert.ok(shadow.includes('userLibraryRowReadEnabled'));
  assert.ok(shadow.includes("reason:'row_revision_stale'"));
  assert.ok(shadow.includes("reason:'row_count_mismatch'"));
  assert.ok(shadow.includes("reason:'row_source_hash_mismatch'"));
});

test('account merge/save dual-write the row shadow without making shadow failure user-visible',()=>{
  assert.ok(userUi.includes('shadowWriteUserLibraryState'));
  assert.ok(userUi.includes('USER_LIBRARY_ROW_SHADOW_WRITE_FAILED'));
  assert.ok(userUi.includes('if (ctx?.waitUntil)'));
  assert.ok((userUi.match(/safeShadowLibraryWrite\(/g)||[]).length>=3);
  assert.ok(shadow.includes('if (Number(current?.revision || 0) > rev)'));
  assert.ok(shadow.includes('DELETE FROM user_paper_state WHERE user_id = ?'));
  assert.ok(shadow.includes('WHERE user_library_head.revision <= excluded.revision'));
});

test('row model preserves stable paper keys and metadata-only rows instead of assuming every key is a DOI',()=>{
  assert.ok(shadow.includes('paper_key TEXT')===false); // schema owns SQL column declarations.
  assert.ok(shadow.includes("const keys = [...new Set([...Object.keys(papers), ...Object.keys(metadata)])].sort();"));
  assert.ok(shadow.includes('doiForPaperKey(paperKey, meta)'));
  assert.ok(shadow.includes('paperPresent'));
  assert.ok(shadow.includes('metadataPresent'));
  assert.ok(migration.includes('paper_key TEXT NOT NULL'));
  assert.ok(migration.includes('doi TEXT'));
});

test('D3b production deployment activates row reads only after historical backfill and two full semantic parity passes',()=>{
  assert.ok(deploy.includes('USER_LIBRARY_ROW_SHADOW_ENABLED = "1"'));
  assert.ok(deploy.includes('USER_LIBRARY_ROW_READ_ENABLED = "1"'));
  const block=section(
    deploy,
    '- name: Backfill and verify user library row read path',
    '- name: Advance and reconcile Evidence Index shadow',
  );
  assert.ok(block.includes('continue-on-error: true'));
  assert.ok(block.includes("phase:'D3b-user-library-row-read-live'"));
  assert.ok(block.includes('readPathActive:true'));
  assert.ok(block.includes('status.readConfigured!==true'));
  assert.ok(block.includes('page.readPathActive!==true'));
  assert.ok(block.includes('after.readPathActive===true'));
  assert.ok(block.includes('finalStatus.readPathActive!==true'));
  assert.ok(block.includes('/api/admin/user-library-shadow/backfill?limit=20'));
  assert.ok(block.includes('/api/admin/user-library-shadow/compare?offset='));
  assert.ok(block.includes('passes.length<2'));
  assert.ok(block.includes('mismatched===0'));
  assert.ok(block.includes('revisionMismatches'));
  assert.ok(block.includes('semanticMismatches'));
  const preserve=section(
    deploy,
    '- name: Preserve user library row shadow report',
    '- name: Advance and reconcile Evidence Index shadow',
  );
  assert.ok(preserve.includes('if-no-files-found: error'));
});

test('admin routes and health expose D3b row-read activation',()=>{
  for(const path of [
    '/api/admin/user-library-shadow/status',
    '/api/admin/user-library-shadow/backfill',
    '/api/admin/user-library-shadow/compare',
  ]) assert.ok(index.includes(path),path);
  assert.ok(index.includes('userLibraryRowShadowEnabled: userLibraryRowShadowEnabled(env)'));
  assert.ok(index.includes("userLibraryRowReadEnabled: String(env.USER_LIBRARY_ROW_READ_ENABLED || '') === '1'"));
  assert.ok(deploy.includes('body?.userLibraryRowShadowEnabled === true'));
  assert.ok(deploy.includes('body?.userLibraryRowReadEnabled === true'));
  assert.ok(shadow.includes('readConfigured,readPathActive'));
  assert.ok(shadow.includes("USER_LIBRARY_V3_WRITE_ENABLED"));
  assert.ok(shadow.includes("!== '1'"));
  assert.ok(shadow.includes("error:'user_library_row_shadow_disabled'"));
});

console.log('USER_LIBRARY_ROW_SHADOW_DEPLOYMENT_CONTRACT_PASS');
