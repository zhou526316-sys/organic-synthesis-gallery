import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  USER_LIBRARY_V3_LIMITS,
  applyUserLibraryV3Mutation,
  readUserLibraryV3Delta,
  readUserLibraryV3Head,
  readUserLibraryV3Page,
} from '../src/user-library-v3.js';
import { readUserLibraryStateFromRows } from '../src/user-library-shadow.js';
import { shadowWriteUserLibraryV3FromState } from '../src/user-library-v3-shadow.js';
import { readerCounts } from '../src/user-ui.js';

class Statement {
  constructor(db,sql){this.db=db;this.sql=sql;this.args=[];}
  bind(...args){this.args=args;return this;}
  async run(){
    const result=this.db.sqlite.prepare(this.sql).run(...this.args);
    return {success:true,meta:{changes:Number(result.changes||0)},results:[]};
  }
  async first(){
    const row=this.db.sqlite.prepare(this.sql).get(...this.args);
    return row===undefined?null:row;
  }
  async all(){
    return {success:true,results:this.db.sqlite.prepare(this.sql).all(...this.args),meta:{}};
  }
}
class D1 {
  constructor(){
    this.sqlite=new DatabaseSync(':memory:');
    this.sqlite.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE user_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL DEFAULT 0,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE user_library_state (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        state_json TEXT NOT NULL,
        revision INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    const v2=fs.readFileSync(new URL('../../user-library-state-v2.sql',import.meta.url),'utf8');
    const v3=fs.readFileSync(new URL('../../user-library-state-v3.sql',import.meta.url),'utf8');
    this.sqlite.exec(v2);
    this.sqlite.exec(v3);
  }
  prepare(sql){return new Statement(this,sql);}
  async batch(statements){
    const hook=this.beforeBatch;
    this.beforeBatch=null;
    if(typeof hook==='function')hook();
    const out=[];
    this.sqlite.exec('BEGIN IMMEDIATE');
    try{
      for(const statement of statements)out.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return out;
    }catch(error){
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
  close(){this.sqlite.close();}
}
const envFor=(db,overrides={})=>({
  DB:db,
  USER_LIBRARY_V3_SHADOW_ENABLED:'1',
  USER_LIBRARY_V3_READ_ENABLED:'1',
  USER_LIBRARY_V3_WRITE_ENABLED:'1',
  USER_LIBRARY_ROW_READ_ENABLED:'1',
  ...overrides,
});
function addUser(db,id='u1'){db.sqlite.prepare('INSERT INTO users(id) VALUES (?)').run(id);}

test('bounded V3 mutation creates revision-fenced head and paged current rows',async t=>{
  const db=new D1();t.after(()=>db.close());addUser(db);
  const env=envFor(db);
  const result=await applyUserLibraryV3Mutation(env,'u1',{
    expectedRevision:0,
    globalState:{statuses:[{id:'deep',name:'深读'}],hideRead:true},
    operations:[
      {
        paperKey:'10.1234/a',
        paperState:{favorite:true,note:'A'},
        metadata:{doi:'10.1234/a',title:'A',journal:'JACS'},
      },
      {
        paperKey:'title:no-doi',
        metadata:{id:'title:no-doi',title:'No DOI'},
      },
    ],
  },1000);
  assert.equal(result.ok,true);
  assert.equal(result.revision,1);
  assert.equal(result.paperCount,1);
  assert.equal(result.metadataCount,2);

  const head=await readUserLibraryV3Head(env,'u1');
  assert.equal(head.ready,true);
  assert.equal(head.revision,1);
  assert.equal(head.globalRevision,1);
  assert.equal(head.globalState.hideRead,true);

  const first=await readUserLibraryV3Page(env,'u1',{limit:1});
  assert.equal(first.scanStartRevision,1);
  assert.equal(first.rows.length,1);
  assert.equal(first.hasMore,true);
  assert.ok(first.nextKey);
  const second=await readUserLibraryV3Page(env,'u1',{afterKey:first.nextKey,limit:1});
  assert.equal(second.rows.length,1);
  assert.equal(second.hasMore,false);
  assert.deepEqual(
    [...first.rows,...second.rows].map(row=>row.paperKey).sort(),
    ['10.1234/a','title:no-doi'],
  );
});

test('first V3 migration requires an exactly fresh legacy shadow and removes legacy only after success',async t=>{
  const db=new D1();t.after(()=>db.close());addUser(db,'u-migrate');
  const state={
    statuses:[],quickTerms:[],collections:[],aliases:[],actionStyles:{},
    papers:{a:{favorite:true,note:'legacy',updatedAt:10}},
    metadata:{a:{id:'a',title:'A',journal:'JACS'}},
    followedSearches:[],searchHistory:[],hideRead:false,
  };
  db.sqlite.prepare(`
    INSERT INTO user_library_state(user_id,state_json,revision,updated_at)
    VALUES('u-migrate',?,1,100)
  `).run(JSON.stringify(state));
  const shadowEnv=envFor(db,{USER_LIBRARY_V3_WRITE_ENABLED:'0'});
  const shadow=await shadowWriteUserLibraryV3FromState(shadowEnv,'u-migrate',state,1,100,150);
  assert.equal(shadow.written,true);

  const env=envFor(db,{USER_LIBRARY_V3_WRITE_ENABLED:'1'});
  const migrated=await applyUserLibraryV3Mutation(env,'u-migrate',{
    expectedRevision:1,
    operations:[{
      paperKey:'a',
      paperState:{favorite:true,note:'v3',updatedAt:20},
      metadata:{id:'a',title:'A',journal:'JACS'},
    }],
  },200);
  assert.equal(migrated.ok,true);
  assert.equal(migrated.revision,2);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM user_library_state WHERE user_id='u-migrate'").get().c,0);
  assert.equal(db.sqlite.prepare("SELECT authority FROM user_library_v3_authority WHERE user_id='u-migrate'").get().authority,'v3');
  assert.equal(JSON.parse(db.sqlite.prepare("SELECT paper_state_json FROM user_library_v3_rows WHERE user_id='u-migrate' AND paper_key='a'").get().paper_state_json).note,'v3');
});

test('stale legacy revision blocks first V3 migration without deleting or changing authority',async t=>{
  const db=new D1();t.after(()=>db.close());addUser(db,'u-stale');
  const state={
    statuses:[],quickTerms:[],collections:[],aliases:[],actionStyles:{},
    papers:{a:{favorite:true,note:'r1',updatedAt:10}},
    metadata:{a:{id:'a',title:'A',journal:'JACS'}},
    followedSearches:[],searchHistory:[],hideRead:false,
  };
  db.sqlite.prepare(`
    INSERT INTO user_library_state(user_id,state_json,revision,updated_at)
    VALUES('u-stale',?,1,100)
  `).run(JSON.stringify(state));
  const shadowEnv=envFor(db,{USER_LIBRARY_V3_WRITE_ENABLED:'0'});
  await shadowWriteUserLibraryV3FromState(shadowEnv,'u-stale',state,1,100,150);

  const newer={...state,papers:{a:{favorite:true,note:'r2',updatedAt:20}}};
  db.sqlite.prepare(`
    UPDATE user_library_state SET state_json=?,revision=2,updated_at=200 WHERE user_id='u-stale'
  `).run(JSON.stringify(newer));

  const env=envFor(db,{USER_LIBRARY_V3_WRITE_ENABLED:'1'});
  const blocked=await applyUserLibraryV3Mutation(env,'u-stale',{
    expectedRevision:1,
    operations:[{paperKey:'a',paperState:{favorite:true,note:'must-not-win'},metadata:state.metadata.a}],
  },250);
  assert.equal(blocked.ok,false);
  assert.equal(blocked.conflict,true);
  assert.equal(blocked.reason,'user_library_v3_shadow_not_fresh');
  assert.equal(blocked.currentRevision,2);
  assert.equal(blocked.v3Revision,1);
  assert.equal(db.sqlite.prepare("SELECT revision FROM user_library_state WHERE user_id='u-stale'").get().revision,2);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM user_library_v3_authority WHERE user_id='u-stale'").get().c,0);
  assert.equal(db.sqlite.prepare("SELECT revision FROM user_library_v3_head WHERE user_id='u-stale'").get().revision,1);
});

test('atomic first-migration guard catches a legacy write racing after freshness pre-read',async t=>{
  const db=new D1();t.after(()=>db.close());addUser(db,'u-race-freshness');
  const state={
    statuses:[],quickTerms:[],collections:[],aliases:[],actionStyles:{},
    papers:{a:{favorite:true,note:'r1',updatedAt:10}},
    metadata:{a:{id:'a',title:'A',journal:'JACS'}},
    followedSearches:[],searchHistory:[],hideRead:false,
  };
  db.sqlite.prepare(`
    INSERT INTO user_library_state(user_id,state_json,revision,updated_at)
    VALUES('u-race-freshness',?,1,100)
  `).run(JSON.stringify(state));
  const shadowEnv=envFor(db,{USER_LIBRARY_V3_WRITE_ENABLED:'0'});
  await shadowWriteUserLibraryV3FromState(shadowEnv,'u-race-freshness',state,1,100,150);

  db.beforeBatch=()=>{
    const newer={...state,papers:{a:{favorite:true,note:'r2-race',updatedAt:20}}};
    db.sqlite.prepare(`
      UPDATE user_library_state SET state_json=?,revision=2,updated_at=200
      WHERE user_id='u-race-freshness'
    `).run(JSON.stringify(newer));
  };

  const env=envFor(db,{USER_LIBRARY_V3_WRITE_ENABLED:'1'});
  const blocked=await applyUserLibraryV3Mutation(env,'u-race-freshness',{
    expectedRevision:1,
    operations:[{paperKey:'a',paperState:{favorite:true,note:'must-not-win'},metadata:state.metadata.a}],
  },250);
  assert.equal(blocked.ok,false);
  assert.equal(blocked.conflict,true);
  assert.equal(blocked.reason,'user_library_v3_shadow_not_fresh');
  assert.equal(blocked.currentRevision,2);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM user_library_v3_authority WHERE user_id='u-race-freshness'").get().c,0);
  assert.equal(db.sqlite.prepare("SELECT revision FROM user_library_v3_head WHERE user_id='u-race-freshness'").get().revision,1);
  assert.equal(db.sqlite.prepare("SELECT revision FROM user_library_state WHERE user_id='u-race-freshness'").get().revision,2);
});

test('V3 mutation keeps bounded D3b compatibility rows readable without rewriting unchanged rows',async t=>{
  const db=new D1();t.after(()=>db.close());addUser(db);
  const env=envFor(db);
  const first=await applyUserLibraryV3Mutation(env,'u1',{
    expectedRevision:0,
    globalState:{statuses:[],quickTerms:[],collections:[],aliases:[],actionStyles:{},followedSearches:[],searchHistory:[],hideRead:false},
    operations:[
      {paperKey:'a',paperState:{favorite:true,note:'A'},metadata:{id:'a',title:'A'}},
      {paperKey:'b',paperState:{favorite:true,note:'B'},metadata:{id:'b',title:'B'}},
    ],
  },1000);
  assert.equal(first.ok,true);
  const rowA1=db.sqlite.prepare("SELECT revision,paper_state_json FROM user_paper_state WHERE user_id='u1' AND paper_key='a'").get();
  const rowB1=db.sqlite.prepare("SELECT revision,paper_state_json FROM user_paper_state WHERE user_id='u1' AND paper_key='b'").get();
  assert.equal(Number(rowA1.revision),1);
  assert.equal(Number(rowB1.revision),1);

  const second=await applyUserLibraryV3Mutation(env,'u1',{
    expectedRevision:1,
    operations:[{paperKey:'a',paperState:{favorite:true,note:'A2'},metadata:{id:'a',title:'A'}}],
  },2000);
  assert.equal(second.ok,true);
  const rowA2=db.sqlite.prepare("SELECT revision,paper_state_json FROM user_paper_state WHERE user_id='u1' AND paper_key='a'").get();
  const rowB2=db.sqlite.prepare("SELECT revision,paper_state_json FROM user_paper_state WHERE user_id='u1' AND paper_key='b'").get();
  assert.equal(Number(rowA2.revision),2);
  assert.equal(JSON.parse(rowA2.paper_state_json).note,'A2');
  assert.equal(Number(rowB2.revision),1);
  assert.equal(JSON.parse(rowB2.paper_state_json).note,'B');

  const compat=await readUserLibraryStateFromRows(env,'u1',{revision:2,updated_at:2000});
  assert.equal(compat.ready,true);
  assert.equal(compat.compatibilityAuthority,'v3');
  assert.equal(compat.revision,2);
  assert.deepEqual(Object.keys(compat.state.papers).sort(),['a','b']);
  assert.equal(compat.state.papers.a.note,'A2');
  assert.equal(compat.state.papers.b.note,'B');

  const deleted=await applyUserLibraryV3Mutation(env,'u1',{
    expectedRevision:2,
    operations:[{paperKey:'b',delete:true}],
  },3000);
  assert.equal(deleted.ok,true);
  const compatAfterDelete=await readUserLibraryStateFromRows(env,'u1',{revision:3,updated_at:3000});
  assert.equal(compatAfterDelete.ready,true);
  assert.deepEqual(Object.keys(compatAfterDelete.state.papers),['a']);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM user_paper_state WHERE user_id='u1' AND paper_key='b'").get().c,0);
});

test('delete is an explicit tombstone and stale expected revision is rejected',async t=>{
  const db=new D1();t.after(()=>db.close());addUser(db);
  const env=envFor(db);
  await applyUserLibraryV3Mutation(env,'u1',{
    expectedRevision:0,
    operations:[{paperKey:'10.1234/a',paperState:{favorite:true},metadata:{doi:'10.1234/a',title:'A'}}],
  },1000);
  const deleted=await applyUserLibraryV3Mutation(env,'u1',{
    expectedRevision:1,
    operations:[{paperKey:'10.1234/a',delete:true}],
  },2000);
  assert.equal(deleted.ok,true);
  assert.equal(deleted.revision,2);
  assert.equal(deleted.paperCount,0);
  assert.equal(deleted.metadataCount,0);

  const page=await readUserLibraryV3Page(env,'u1');
  assert.equal(page.rows.length,0);

  const delta=await readUserLibraryV3Delta(env,'u1',{sinceRevision:1});
  assert.equal(delta.resetRequired,false);
  assert.equal(delta.targetRevision,2);
  assert.equal(delta.changes.length,1);
  assert.equal(delta.changes[0].op,'delete');
  assert.equal(delta.changes[0].paperKey,'10.1234/a');

  const stale=await applyUserLibraryV3Mutation(env,'u1',{
    expectedRevision:1,
    globalState:{hideRead:false},
  },3000);
  assert.equal(stale.ok,false);
  assert.equal(stale.conflict,true);
  assert.equal(stale.currentRevision,2);
});

test('delta paging is bounded and carries the latest global replacement separately',async t=>{
  const db=new D1();t.after(()=>db.close());addUser(db);
  const env=envFor(db);
  await applyUserLibraryV3Mutation(env,'u1',{
    expectedRevision:0,
    operations:[{paperKey:'a',paperState:{favorite:true}}],
  },1000);
  await applyUserLibraryV3Mutation(env,'u1',{
    expectedRevision:1,
    operations:[{paperKey:'b',metadata:{title:'B'}}],
  },2000);
  await applyUserLibraryV3Mutation(env,'u1',{
    expectedRevision:2,
    globalState:{hideRead:true,collections:[{id:'c',name:'C'}]},
  },3000);

  const first=await readUserLibraryV3Delta(env,'u1',{sinceRevision:0,limit:1});
  assert.equal(first.targetRevision,3);
  assert.equal(first.changes.length,1);
  assert.equal(first.hasMore,true);
  assert.deepEqual(first.globalState,{hideRead:true,collections:[{id:'c',name:'C'}]});

  const second=await readUserLibraryV3Delta(env,'u1',{
    sinceRevision:0,
    afterRevision:first.nextCursor.revision,
    afterSeq:first.nextCursor.seq,
    limit:1,
  });
  assert.equal(second.changes.length,1);
  assert.equal(second.changes[0].paperKey,'b');
  assert.equal(second.hasMore,false);
  assert.equal(second.globalRevision,3);
});

test('paged full scan plus delta catches a concurrently inserted key behind the cursor',async t=>{
  const db=new D1();t.after(()=>db.close());addUser(db);
  const env=envFor(db);
  await applyUserLibraryV3Mutation(env,'u1',{
    expectedRevision:0,
    operations:[
      {paperKey:'10/a',paperState:{favorite:true}},
      {paperKey:'20/b',paperState:{favorite:true}},
    ],
  },1000);
  const first=await readUserLibraryV3Page(env,'u1',{limit:1});
  assert.equal(first.scanStartRevision,1);
  assert.equal(first.rows[0].paperKey,'10/a');

  await applyUserLibraryV3Mutation(env,'u1',{
    expectedRevision:1,
    operations:[{paperKey:'00/new',paperState:{favorite:true}}],
  },2000);

  const second=await readUserLibraryV3Page(env,'u1',{afterKey:first.nextKey,limit:10});
  assert.deepEqual(second.rows.map(row=>row.paperKey),['20/b']);
  const catchup=await readUserLibraryV3Delta(env,'u1',{sinceRevision:first.scanStartRevision});
  assert.deepEqual(catchup.changes.map(row=>row.paperKey),['00/new']);
  assert.equal(catchup.targetRevision,2);
});

test('pruned or future delta revision fails closed into full-resync semantics',async t=>{
  const db=new D1();t.after(()=>db.close());addUser(db);
  const env=envFor(db);
  await applyUserLibraryV3Mutation(env,'u1',{
    expectedRevision:0,
    operations:[{paperKey:'a',paperState:{favorite:true}}],
  },1000);
  db.sqlite.prepare("UPDATE user_library_v3_head SET change_floor_revision=1 WHERE user_id='u1'").run();

  const pruned=await readUserLibraryV3Delta(env,'u1',{sinceRevision:0});
  assert.equal(pruned.resetRequired,true);
  assert.equal(pruned.reason,'user_library_v3_change_log_pruned');

  const future=await readUserLibraryV3Delta(env,'u1',{sinceRevision:2});
  assert.equal(future.resetRequired,true);
  assert.equal(future.reason,'user_library_v3_future_revision');
});

test('V3 write retention advances the delta floor and prunes only history older than 512 revisions',async t=>{
  const db=new D1();t.after(()=>db.close());addUser(db);
  const env=envFor(db);

  db.sqlite.prepare(`
    INSERT INTO user_library_v3_head
      (user_id,revision,updated_at,global_json,global_revision,paper_count,metadata_count,change_floor_revision,schema_version)
    VALUES ('u1',513,513000,'{}',513,0,0,0,1)
  `).run();
  db.sqlite.prepare(`
    INSERT INTO user_library_v3_shape(user_id,papers_split,metadata_split,revision)
    VALUES ('u1',1,1,513)
  `).run();
  db.sqlite.prepare(`
    INSERT INTO user_library_v3_commits(user_id,revision,expected_revision,updated_at)
    VALUES ('u1',1,0,1000)
  `).run();
  db.sqlite.prepare(`
    INSERT INTO user_library_v3_changes
      (user_id,revision,seq,paper_key,op,doi,paper_present,paper_state_json,metadata_present,metadata_json,updated_at)
    VALUES ('u1',1,0,'old','delete',NULL,0,NULL,0,NULL,1000)
  `).run();
  db.sqlite.prepare(`
    INSERT INTO user_library_v3_rows
      (user_id,paper_key,doi,paper_present,paper_state_json,metadata_present,metadata_json,deleted,revision,updated_at)
    VALUES ('u1','old',NULL,0,NULL,0,NULL,1,1,1000)
  `).run();

  const result=await applyUserLibraryV3Mutation(env,'u1',{
    expectedRevision:513,
    globalState:{statuses:[],quickTerms:[],collections:[],aliases:[],actionStyles:{},followedSearches:[],searchHistory:[],hideRead:false},
  },514000);
  assert.equal(result.ok,true);
  assert.equal(result.revision,514);
  assert.equal(result.changeFloorRevision,2);
  assert.equal(USER_LIBRARY_V3_LIMITS.changeRetentionRevisions,512);

  const head=await readUserLibraryV3Head(env,'u1');
  assert.equal(head.changeFloorRevision,2);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM user_library_v3_changes WHERE user_id='u1' AND revision=1").get().c,0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM user_library_v3_commits WHERE user_id='u1' AND revision=1").get().c,0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM user_library_v3_rows WHERE user_id='u1' AND paper_key='old'").get().c,0);

  const reset=await readUserLibraryV3Delta(env,'u1',{sinceRevision:1});
  assert.equal(reset.resetRequired,true);
  assert.equal(reset.reason,'user_library_v3_change_log_pruned');
});

test('mutation bounds reject unbounded, duplicate and monolithic-global payloads',async t=>{
  const db=new D1();t.after(()=>db.close());addUser(db);
  const env=envFor(db);
  const tooMany=Array.from({length:USER_LIBRARY_V3_LIMITS.maxMutationOps+1},(_,index)=>({
    paperKey:`k${index}`,paperState:{favorite:true},
  }));
  await assert.rejects(
    applyUserLibraryV3Mutation(env,'u1',{expectedRevision:0,operations:tooMany},1000),
    /user_library_v3_too_many_operations/,
  );
  await assert.rejects(
    applyUserLibraryV3Mutation(env,'u1',{
      expectedRevision:0,
      operations:[{paperKey:'same',paperState:{}},{paperKey:'same',metadata:{}}],
    },1000),
    /user_library_v3_duplicate_paper_key/,
  );
  await assert.rejects(
    applyUserLibraryV3Mutation(env,'u1',{
      expectedRevision:0,
      globalState:{papers:{a:{favorite:true}}},
    },1000),
    /user_library_v3_global_state_invalid/,
  );
  await assert.rejects(
    applyUserLibraryV3Mutation(env,'u1',{
      expectedRevision:0,
      operations:[{paperKey:'huge',paperState:{note:'x'.repeat(USER_LIBRARY_V3_LIMITS.maxMutationBytes)}}],
    },1000),
    /user_library_v3_mutation_oversized|user_library_v3_paper_state_oversized/,
  );
});

test('authenticated V3 mutation API stays dormant until enabled and legacy account-pull reads row compatibility after cutover',async t=>{
  const db=new D1();t.after(()=>db.close());addUser(db,'u-api');
  const token='v3-write-api-token';
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  const tokenHash=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  db.sqlite.prepare('INSERT INTO user_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
    .run(tokenHash,'u-api',Date.now()+60_000);

  const disabledEnv=envFor(db,{USER_LIBRARY_V3_WRITE_ENABLED:'0'});
  const disabled=await readerCounts(disabledEnv,{
    mode:'account-v3-mutate',
    sessionToken:token,
    expectedRevision:0,
    operations:[{paperKey:'a',paperState:{favorite:true}}],
  });
  assert.equal(disabled.status,503);
  assert.equal(disabled.body.error,'user_library_v3_write_disabled');

  const env=envFor(db);
  const globalState={
    statuses:[],quickTerms:[],collections:[],aliases:[],actionStyles:{},
    followedSearches:[],searchHistory:[],hideRead:false,
  };
  const mutated=await readerCounts(env,{
    mode:'account-v3-mutate',
    sessionToken:token,
    expectedRevision:0,
    globalState,
    operations:[{
      paperKey:'a',
      paperState:{favorite:true,note:'bounded'},
      metadata:{id:'a',title:'A',journal:'JACS'},
    }],
  });
  assert.equal(mutated.status,200);
  assert.equal(mutated.body.account.readPath,'v3-mutate');
  assert.equal(mutated.body.account.revision,1);
  assert.equal(mutated.body.account.paperCount,1);
  assert.equal(mutated.body.account.metadataCount,1);

  const pull=await readerCounts(env,{mode:'account-pull',sessionToken:token});
  assert.equal(pull.status,200);
  assert.equal(pull.body.account.readPath,'rows-v3-compat');
  assert.equal(pull.body.account.revision,1);
  assert.equal(pull.body.account.state.papers.a.note,'bounded');
  assert.equal(pull.body.account.state.metadata.a.title,'A');

  const oldSave=await readerCounts(env,{
    mode:'account-save',
    sessionToken:token,
    revision:1,
    state:{...globalState,papers:{},metadata:{}},
  });
  assert.equal(oldSave.status,409);
  assert.equal(oldSave.body.error,'user_library_client_upgrade_required');
  assert.equal(oldSave.body.writePath,'v3');

  const conflict=await readerCounts(env,{
    mode:'account-v3-mutate',
    sessionToken:token,
    expectedRevision:0,
    operations:[{paperKey:'b',paperState:{favorite:true}}],
  });
  assert.equal(conflict.status,409);
  assert.equal(conflict.body.error,'user_library_v3_revision_conflict');
  assert.equal(conflict.body.currentRevision,1);
});

test('per-user V3 authority survives global write rollback without reviving legacy writes',async t=>{
  const db=new D1();t.after(()=>db.close());addUser(db,'u-rollback');
  const token='v3-rollback-token';
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  const tokenHash=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  db.sqlite.prepare('INSERT INTO user_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
    .run(tokenHash,'u-rollback',Date.now()+60_000);

  const legacyState={
    statuses:[],quickTerms:[],collections:[],aliases:[],actionStyles:{},
    followedSearches:[],searchHistory:[],hideRead:false,
    papers:{a:{favorite:true,note:'legacy'}},
    metadata:{a:{id:'a',title:'A'}},
  };
  db.sqlite.prepare('INSERT INTO user_library_state(user_id,state_json,revision,updated_at) VALUES(?,?,?,?)')
    .run('u-rollback',JSON.stringify(legacyState),1,1000);

  // Seed the already-proven V3/D3b shadow snapshot that exists before activation.
  const globalJson=JSON.stringify({
    statuses:[],quickTerms:[],collections:[],aliases:[],actionStyles:{},
    followedSearches:[],searchHistory:[],hideRead:false,
  });
  db.sqlite.prepare(`
    INSERT INTO user_library_v3_head
      (user_id,revision,updated_at,global_json,global_revision,paper_count,metadata_count,change_floor_revision,schema_version)
    VALUES ('u-rollback',1,1000,?,1,1,1,1,1)
  `).run(globalJson);
  db.sqlite.prepare("INSERT INTO user_library_v3_shape(user_id,papers_split,metadata_split,revision) VALUES('u-rollback',1,1,1)").run();
  db.sqlite.prepare(`
    INSERT INTO user_library_v3_rows
      (user_id,paper_key,doi,paper_present,paper_state_json,metadata_present,metadata_json,deleted,revision,updated_at)
    VALUES ('u-rollback','a',NULL,1,?,1,?,0,1,1000)
  `).run(JSON.stringify({favorite:true,note:'legacy'}),JSON.stringify({id:'a',title:'A'}));
  db.sqlite.prepare(`
    INSERT INTO user_library_head
      (user_id,revision,updated_at,global_json,papers_split,metadata_split,paper_count,metadata_count,source_state_hash,shadow_version)
    VALUES ('u-rollback',1,1000,?,1,1,1,1,'legacy-shadow',1)
  `).run(globalJson);
  db.sqlite.prepare(`
    INSERT INTO user_paper_state
      (user_id,paper_key,doi,paper_present,paper_state_json,metadata_present,metadata_json,revision,updated_at)
    VALUES ('u-rollback','a',NULL,1,?,1,?,1,1000)
  `).run(JSON.stringify({favorite:true,note:'legacy'}),JSON.stringify({id:'a',title:'A'}));

  const active=envFor(db);
  const mutated=await readerCounts(active,{
    mode:'account-v3-mutate',sessionToken:token,expectedRevision:1,
    operations:[{paperKey:'a',paperState:{favorite:true,note:'v3'},metadata:{id:'a',title:'A'}}],
  });
  assert.equal(mutated.status,200);
  assert.equal(mutated.body.account.revision,2);
  assert.equal(mutated.body.account.writeAuthority,'v3');
  assert.equal(db.sqlite.prepare("SELECT authority FROM user_library_v3_authority WHERE user_id='u-rollback'").get().authority,'v3');
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM user_library_state WHERE user_id='u-rollback'").get().c,0);

  const rolledBack={...active,USER_LIBRARY_V3_WRITE_ENABLED:'0'};
  const head=await readerCounts(rolledBack,{mode:'account-v3-head',sessionToken:token});
  assert.equal(head.status,200);
  assert.equal(head.body.account.revision,2);
  assert.equal(head.body.account.writeAuthority,'v3');
  assert.equal(head.body.account.writeEnabled,false);

  const pull=await readerCounts(rolledBack,{mode:'account-pull',sessionToken:token});
  assert.equal(pull.status,200);
  assert.equal(pull.body.account.readPath,'rows-v3-compat');
  assert.equal(pull.body.account.writeAuthority,'v3');
  assert.equal(pull.body.account.state.papers.a.note,'v3');

  const oldSave=await readerCounts(rolledBack,{
    mode:'account-save',sessionToken:token,revision:2,state:legacyState,
  });
  assert.equal(oldSave.status,503);
  assert.equal(oldSave.body.error,'user_library_v3_write_suspended');
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM user_library_state WHERE user_id='u-rollback'").get().c,0);

  const suspendedMutation=await readerCounts(rolledBack,{
    mode:'account-v3-mutate',sessionToken:token,expectedRevision:2,
    operations:[{paperKey:'a',paperState:{favorite:true,note:'must-not-write'},metadata:{id:'a',title:'A'}}],
  });
  assert.equal(suspendedMutation.status,503);
  assert.equal(suspendedMutation.body.error,'user_library_v3_write_suspended');
  const row=db.sqlite.prepare("SELECT paper_state_json FROM user_library_v3_rows WHERE user_id='u-rollback' AND paper_key='a'").get();
  assert.equal(JSON.parse(row.paper_state_json).note,'v3');
});

test('V3 writes are independently disabled and require an atomic D1 batch',async t=>{
  const db=new D1();t.after(()=>db.close());addUser(db);
  const disabled=envFor(db,{USER_LIBRARY_V3_WRITE_ENABLED:'0'});
  const off=await applyUserLibraryV3Mutation(disabled,'u1',{
    expectedRevision:0,globalState:{hideRead:false},
  },1000);
  assert.equal(off.disabled,true);

  const noBatch={...envFor(db),DB:{prepare:db.prepare.bind(db)}};
  await assert.rejects(
    applyUserLibraryV3Mutation(noBatch,'u1',{expectedRevision:0,globalState:{hideRead:false}},1000),
    /user_library_v3_atomic_batch_required/,
  );
});

console.log('USER_LIBRARY_V3_TESTS_READY');
