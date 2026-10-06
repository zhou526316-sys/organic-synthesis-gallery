import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const deploy=readFileSync('.github/workflows/deploy-worker-frontend.yml','utf8');
const schema=readFileSync('cloudflare/schema.sql','utf8');
const migration=readFileSync('cloudflare/user-library-state-v3.sql','utf8');
const v3=readFileSync('cloudflare/worker/src/user-library-v3.js','utf8');
const index=readFileSync('cloudflare/worker/src/index.js','utf8');
const userUi=readFileSync('cloudflare/worker/src/user-ui.js','utf8');
const packageJson=JSON.parse(readFileSync('cloudflare/worker/package.json','utf8'));

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
  assert.ok(config.includes('USER_LIBRARY_V3_SHADOW_ENABLED = "0"'));
  assert.ok(config.includes('USER_LIBRARY_V3_READ_ENABLED = "0"'));
  assert.ok(config.includes('USER_LIBRARY_V3_WRITE_ENABLED = "0"'));
  assert.ok(v3.includes("USER_LIBRARY_V3_WRITE_ENABLED"));
  assert.ok(v3.includes("reason:'user_library_v3_write_disabled'"));
  assert.ok(v3.includes("reason:'user_library_v3_read_disabled'"));
});

test('D3c foundation is not wired into public or authenticated production routes yet',()=>{
  assert.ok(!index.includes("from './user-library-v3.js'"));
  assert.ok(!userUi.includes("from './user-library-v3.js'"));
  assert.ok(!index.includes('/api/user-ui/library-v3'));
  assert.ok(!index.includes('/api/admin/user-library-v3'));
  assert.ok(!userUi.includes('applyUserLibraryV3Mutation'));
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

test('D3c regression suite is part of the site quality gate',()=>{
  assert.equal(packageJson.scripts['test:user-library-v3'],'node scripts/test-user-library-v3.mjs');
  const quality=readFileSync('.github/workflows/site-quality-gate.yml','utf8');
  assert.ok(quality.includes('npm run test:user-library-v3'));
  assert.ok(quality.includes('node scripts/test-user-library-v3-deployment-contract.mjs'));
});

console.log('USER_LIBRARY_V3_DEPLOYMENT_CONTRACT_PASS');
