import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { splitUserLibraryState } from '../cloudflare/worker/src/user-library-shadow.js';
import { applyUserLibraryV3Mutation } from '../cloudflare/worker/src/user-library-v3.js';

const workflow=readFileSync('.github/workflows/user-library-v3-write-canary.yml','utf8');
const dispatcher=readFileSync('.github/workflows/user-library-v3-write-canary-dispatch.yml','utf8');
const deploy=readFileSync('.github/workflows/deploy-worker-frontend.yml','utf8');

test('D3c4b canary is manual, isolated and never enables global writes',()=>{
  assert.match(workflow,/workflow_dispatch:/);
  assert.ok(!workflow.includes('schedule:'));
  assert.ok(!workflow.includes('push:'));
  assert.ok(workflow.includes("confirmation == 'D3C4B'"));
  assert.ok(workflow.includes('CANARY_USER_ID: __gallery_v3_write_canary__'));
  assert.ok(deploy.includes('USER_LIBRARY_V3_WRITE_CANARY_USER_ID = "__gallery_v3_write_canary__"'));
  assert.ok(deploy.includes('USER_LIBRARY_V3_WRITE_ENABLED = "0"'));
  assert.ok(!workflow.includes('USER_LIBRARY_V3_WRITE_ENABLED = "1"'));
  assert.ok(!workflow.includes('wrangler deploy'));
});

test('D3c4b canary gates on parity and the deployed D3c3/D3c4a client',()=>{
  for(const token of [
    '/api/admin/user-library-v3/status',
    'revisionMismatches',
    'legacyUsers',
    'v3Heads',
    'legacyV3Heads',
    'v3AuthorityHeads',
    'orphanV3Heads',
    'legacyHeadMismatches',
    'legacyCompatibilityHeadMismatches',
    'pendingLegacyCompatibilityHeads',
    'compatibilityReadEnabled',
    'authorityHeadMismatches',
    'compatibilityHeadMismatches',
    'rollout?.preflightReady',
    'backfill?.complete',
    'account-v3-head',
    'account-v3-mutate',
    'canonical frontend lacks D3c3 V3 read client',
    'canonical frontend lacks D3c4a V3 mutation client',
  ]) assert.ok(workflow.includes(token),token);
  assert.ok(!workflow.includes("Number(status.body?.legacyUsers||0)===Number(status.body?.v3Heads||0)"));
});

test('D3c4b canary exercises real write, bounded reads, compatibility and conflict fences',()=>{
  for(const token of [
    "mode:'account-v3-mutate'",
    "mode:'account-v3-head'",
    "mode:'account-v3-page'",
    "mode:'account-v3-delta'",
    "mode:'account-pull'",
    "mode:'account-save'",
    'user_library_v3_revision_conflict',
    'rows-v3-compat',
    'user_library_client_upgrade_required',
    'writeAuthority',
    'expectedRevision:1',
    'unchangedRowPreserved',
    'legacyDocumentRemoved',
    'normalAccountsUnchanged',
    'mixedAuthorityStatus',
    'v3CohortsHealthy(after.body)',
    'status.body.v3AuthorityUsers+1',
  ]) assert.ok(workflow.includes(token),token);
});

test('canary seed executes bounded SQL with exact official legacy and shadow hashes',async t=>{
  const temp=mkdtempSync(join(tmpdir(),'gallery-v3-canary-seed-'));
  t.after(()=>rmSync(temp,{recursive:true,force:true}));
  const prepare=workflow.slice(workflow.indexOf('- name: Prepare isolated canary account'),workflow.indexOf('- name: Execute isolated V3 write canary'));
  const match=prepare.match(/node --input-type=module <<'NODE'\n([\s\S]*?)\n          NODE/);
  assert.ok(match,'missing executable canary seed generator');
  const source=match[1].replace(/^          /gm,'');
  execFileSync(process.execPath,['--input-type=module'],{
    input:source,cwd:'cloudflare/worker',encoding:'utf8',
    env:{...process.env,RUNNER_TEMP:temp,CANARY_USER_ID:'__gallery_v3_write_canary__'},
    stdio:['pipe','pipe','pipe'],
  });
  const sql=readFileSync(join(temp,'user-library-v3-canary-seed.sql'),'utf8');
  const fixture=JSON.parse(readFileSync(join(temp,'user-library-v3-canary-fixture.json'),'utf8'));
  assert.ok(Buffer.byteLength(sql)<=32768);
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY,display_name TEXT,email TEXT,avatar_url TEXT,created_at INTEGER,updated_at INTEGER); CREATE TABLE user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),created_at INTEGER,expires_at INTEGER); CREATE TABLE user_library_state(user_id TEXT PRIMARY KEY REFERENCES users(id),state_json TEXT,revision INTEGER,updated_at INTEGER);");
  db.exec(readFileSync('cloudflare/user-library-state-v2.sql','utf8'));
  db.exec(readFileSync('cloudflare/user-library-state-v3.sql','utf8'));
  db.exec(sql);
  assert.deepEqual(db.prepare('SELECT id FROM users').all().map(row=>row.id),['__gallery_v3_write_canary__']);
  const official=await splitUserLibraryState(fixture.state);
  assert.equal(db.prepare('SELECT source_state_hash FROM user_library_head').get().source_state_hash,official.sourceStateHash);
  assert.equal(db.prepare('SELECT source_state_hash FROM user_library_v3_shadow_sync').get().source_state_hash,official.sourceStateHash);
  assert.deepEqual(JSON.parse(db.prepare('SELECT state_json FROM user_library_state').get().state_json),fixture.state);
  for(const table of ['user_paper_state','user_library_v3_rows','user_library_v3_changes'])assert.equal(db.prepare('SELECT COUNT(*) AS c FROM '+table).get().c,2,table);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM user_library_v3_authority').get().c,0);
  assert.equal(db.prepare('SELECT revision FROM user_library_v3_head').get().revision,1);
  assert.equal(db.prepare('SELECT shadow_version FROM user_library_head').get().shadow_version,1);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  const adapter={
    prepare(sql){
      const statement={args:[],bind(...args){this.args=args;return this;},
        async first(){return db.prepare(sql).get(...this.args)||null;},
        async all(){return {results:db.prepare(sql).all(...this.args)};},
        async run(){return {meta:{changes:Number(db.prepare(sql).run(...this.args).changes)}};},
      };
      return statement;
    },
    async batch(statements){
      db.exec('BEGIN IMMEDIATE');
      try{const results=[];for(const statement of statements)results.push(await statement.run());db.exec('COMMIT');return results;}
      catch(error){db.exec('ROLLBACK');throw error;}
    },
  };
  const mutation=await applyUserLibraryV3Mutation({
    DB:adapter,USER_LIBRARY_V3_WRITE_ENABLED:'0',USER_LIBRARY_V3_READ_ENABLED:'1',
    USER_LIBRARY_ROW_READ_ENABLED:'1',USER_LIBRARY_V3_WRITE_CANARY_USER_ID:'__gallery_v3_write_canary__',
  },'__gallery_v3_write_canary__',{
    expectedRevision:1,globalState:{hideRead:true},
    operations:[{paperKey:'d3c4b-canary-paper',paperState:{favorite:true},
      metadata:fixture.state.metadata['d3c4b-canary-paper']}],
  },fixture.updatedAt+1);
  assert.equal(mutation.ok,true,JSON.stringify(mutation));
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM user_library_state').get().c,0);
  for(const table of ['user_paper_state','user_library_v3_rows']){
    const row=db.prepare('SELECT revision,paper_state_json FROM '+table+" WHERE paper_key='d3c4b-canary-unchanged'").get();
    assert.equal(row.revision,1);
    assert.deepEqual(JSON.parse(row.paper_state_json),fixture.state.papers['d3c4b-canary-unchanged']);
  }
  assert.throws(()=>execFileSync(process.execPath,['--input-type=module'],{
    input:source,cwd:'cloudflare/worker',encoding:'utf8',
    env:{...process.env,RUNNER_TEMP:temp,CANARY_USER_ID:'not-the-reserved-canary'},
    stdio:['pipe','pipe','pipe'],
  }),/reserved canary identity required/);
});

test('D3c4b canary deletes the FK root and verifies zero residue by FK integrity',()=>{
  assert.ok(workflow.includes('- name: Clean up isolated canary account'));
  assert.ok(workflow.includes('if: always()'));
  assert.ok(workflow.includes("DELETE FROM users WHERE id='$CANARY_USER_ID'"));
  assert.ok(workflow.includes('if [ ! -x node_modules/.bin/wrangler ]'));
  assert.ok(workflow.includes("SELECT COUNT(*) AS c FROM users WHERE id='$CANARY_USER_ID'"));
  assert.ok(workflow.includes('PRAGMA foreign_key_check'));
  assert.ok(workflow.includes('cascadeChanges'));
  assert.ok(workflow.includes('cleanupVerified=true'));
  assert.ok(workflow.includes('user-library-v3-write-canary-${{ github.run_id }}'));
});

test('D3c4b dispatcher is marker-only and cannot mutate production data itself',()=>{
  assert.ok(dispatcher.includes("paths:"));
  assert.ok(dispatcher.includes("D3C4B_CANARY_REQUEST"));
  assert.ok(dispatcher.includes("actions: write"));
  assert.ok(dispatcher.includes("contents: read"));
  assert.ok(dispatcher.includes("deploy-worker-frontend.yml"));
  assert.ok(dispatcher.includes("conclusion"));
  assert.ok(dispatcher.includes("user-library-v3-write-canary.yml"));
  assert.ok(dispatcher.includes("confirmation=D3C4B"));
  assert.ok(!dispatcher.includes("wrangler d1"));
  assert.ok(!dispatcher.includes("USER_LIBRARY_V3_WRITE_ENABLED"));
});

console.log('USER_LIBRARY_V3_WRITE_CANARY_CONTRACT_PASS');
