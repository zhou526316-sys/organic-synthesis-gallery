import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readerCounts } from '../src/user-ui.js';
import {
  backfillUserLibraryV3ShadowPage,
  compareUserLibraryV3ShadowPage,
  getUserLibraryV3ShadowStatus,
  reconcileUserLibraryV3ShadowPage,
  shadowWriteUserLibraryV3FromState,
} from '../src/user-library-v3-shadow.js';
import {
  compareUserLibraryShadowPage,
  getUserLibraryShadowStatus,
} from '../src/user-library-shadow.js';
import {
  applyUserLibraryV3Mutation,
  readUserLibraryV3Delta,
  readUserLibraryV3Head,
  readUserLibraryV3Page,
} from '../src/user-library-v3.js';

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
        user_id TEXT NOT NULL,
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
    this.sqlite.exec(fs.readFileSync(new URL('../../user-library-state-v2.sql',import.meta.url),'utf8'));
    this.sqlite.exec(fs.readFileSync(new URL('../../user-library-state-v3.sql',import.meta.url),'utf8'));
  }
  prepare(sql){return new Statement(this,sql);}
  async batch(statements){
    const out=[];
    this.sqlite.exec('BEGIN IMMEDIATE');
    try{
      for(const statement of statements) out.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return out;
    }catch(error){
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
  close(){this.sqlite.close();}
}
const envFor=db=>({
  DB:db,
  USER_LIBRARY_V3_SHADOW_ENABLED:'1',
  USER_LIBRARY_V3_READ_ENABLED:'0',
  USER_LIBRARY_V3_WRITE_ENABLED:'0',
});
function putLegacy(db,userId,state,revision,updatedAt){
  db.sqlite.prepare('INSERT OR IGNORE INTO users(id) VALUES (?)').run(userId);
  db.sqlite.prepare(`
    INSERT INTO user_library_state(user_id,state_json,revision,updated_at)
    VALUES(?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      state_json=excluded.state_json,revision=excluded.revision,updated_at=excluded.updated_at
  `).run(userId,JSON.stringify(state),revision,updatedAt);
}
function fixture(note='hello'){
  return {
    statuses:[{id:'deep',name:'深读'}],
    quickTerms:[],
    collections:[],
    aliases:[],
    actionStyles:{},
    papers:{'10.1234/a':{favorite:true,note,updatedAt:10}},
    metadata:{'10.1234/a':{id:'10.1234/a',doi:'10.1234/a',title:'A',journal:'JACS'}},
    followedSearches:[],
    searchHistory:[],
    hideRead:false,
  };
}

test('D3c1 shadow preserves empty papers/metadata object shape exactly',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env=envFor(db);
  const state={papers:{},metadata:{},futureTopLevel:{kept:true}};
  putLegacy(db,'u-empty',state,1,100);
  const result=await shadowWriteUserLibraryV3FromState(env,'u-empty',state,1,100,200);
  assert.equal(result.written,true);
  const shape=db.sqlite.prepare('SELECT papers_split,metadata_split,revision FROM user_library_v3_shape WHERE user_id=?').get('u-empty');
  assert.equal(Number(shape.papers_split),1);
  assert.equal(Number(shape.metadata_split),1);
  const comparison=await compareUserLibraryV3ShadowPage(env,0,20);
  assert.equal(comparison.body.mismatched,0);
  assert.equal(comparison.body.matched,1);
});

test('older shadow revision cannot overwrite a newer V3 snapshot',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env=envFor(db);
  const oldState=fixture('old');
  const newState=fixture('new');
  putLegacy(db,'u-race',newState,2,200);
  const fresh=await shadowWriteUserLibraryV3FromState(env,'u-race',newState,2,200,300);
  assert.equal(fresh.written,true);
  const stale=await shadowWriteUserLibraryV3FromState(env,'u-race',oldState,1,100,400);
  assert.equal(stale.skippedStale,true);
  assert.equal(stale.currentRevision,2);
  const row=db.sqlite.prepare(
    "SELECT paper_state_json,revision FROM user_library_v3_rows WHERE user_id='u-race' AND paper_key='10.1234/a'"
  ).get();
  assert.equal(Number(row.revision),2);
  assert.equal(JSON.parse(row.paper_state_json).note,'new');
  const comparison=await compareUserLibraryV3ShadowPage(env,0,20);
  assert.equal(comparison.body.mismatched,0);
});

test('persistent historical backfill advances across pages and reaches semantic parity',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env=envFor(db);
  putLegacy(db,'u1',fixture('one'),3,300);
  putLegacy(db,'u2',{papers:{},metadata:{},hideRead:true},5,500);

  const first=await backfillUserLibraryV3ShadowPage(env,1);
  assert.equal(first.body.complete,false);
  assert.equal(first.body.pageUsers,1);
  const second=await backfillUserLibraryV3ShadowPage(env,1);
  assert.equal(second.body.complete,false);
  assert.equal(second.body.pageUsers,1);
  const third=await backfillUserLibraryV3ShadowPage(env,1);
  assert.equal(third.body.complete,true);
  assert.equal(third.body.pageUsers,0);

  const status=await getUserLibraryV3ShadowStatus(env);
  assert.equal(status.body.legacyUsers,2);
  assert.equal(status.body.v3Heads,2);
  assert.equal(status.body.revisionMismatches,0);
  assert.equal(status.body.backfill.complete,true);

  const compare1=await compareUserLibraryV3ShadowPage(env,0,1);
  const compare2=await compareUserLibraryV3ShadowPage(env,compare1.body.nextOffset,1);
  assert.equal(compare1.body.mismatched,0);
  assert.equal(compare2.body.mismatched,0);
  assert.equal(compare2.body.complete,true);
});

test('reconciliation repairs a user changed after historical cursor passed it',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env=envFor(db);
  putLegacy(db,'u1',fixture('before'),1,100);
  await backfillUserLibraryV3ShadowPage(env,20);
  await backfillUserLibraryV3ShadowPage(env,20);
  let status=await getUserLibraryV3ShadowStatus(env);
  assert.equal(status.body.revisionMismatches,0);

  putLegacy(db,'u1',fixture('after'),2,200);
  status=await getUserLibraryV3ShadowStatus(env);
  assert.equal(status.body.revisionMismatches,1);

  const repair=await reconcileUserLibraryV3ShadowPage(env,20);
  assert.equal(repair.body.failed,0);
  assert.equal(repair.body.remaining,0);
  assert.equal(repair.body.complete,true);

  const comparison=await compareUserLibraryV3ShadowPage(env,0,20);
  assert.equal(comparison.body.mismatched,0);
  const row=db.sqlite.prepare(
    "SELECT paper_state_json,revision FROM user_library_v3_rows WHERE user_id='u1' AND paper_key='10.1234/a'"
  ).get();
  assert.equal(Number(row.revision),2);
  assert.equal(JSON.parse(row.paper_state_json).note,'after');
});

test('legacy shadow writes emit bounded net deltas including tombstone deletions',async t=>{
  const db=new D1();t.after(()=>db.close());
  const shadowEnv=envFor(db);
  const first={
    ...fixture('before'),
    papers:{
      '10.1234/a':{favorite:true,note:'before',updatedAt:10},
      '10.1234/delete':{favorite:true,updatedAt:10},
    },
    metadata:{
      '10.1234/a':{id:'10.1234/a',doi:'10.1234/a',title:'A',journal:'JACS'},
      '10.1234/delete':{id:'10.1234/delete',doi:'10.1234/delete',title:'Delete',journal:'JACS'},
    },
  };
  putLegacy(db,'u-delta',first,1,100);
  const initial=await shadowWriteUserLibraryV3FromState(shadowEnv,'u-delta',first,1,100,150);
  assert.equal(initial.written,true);
  assert.equal(initial.changeFloorRevision,1);

  const second={
    ...first,
    hideRead:true,
    papers:{
      '10.1234/a':{favorite:true,note:'after',updatedAt:20},
      '10.1234/new':{favorite:true,updatedAt:20},
    },
    metadata:{
      '10.1234/a':first.metadata['10.1234/a'],
      '10.1234/new':{id:'10.1234/new',doi:'10.1234/new',title:'New',journal:'Angew'},
    },
  };
  putLegacy(db,'u-delta',second,2,200);
  const updated=await shadowWriteUserLibraryV3FromState(shadowEnv,'u-delta',second,2,200,250);
  assert.equal(updated.written,true);
  assert.equal(updated.revision,2);
  assert.equal(updated.changeFloorRevision,1);
  assert.equal(updated.changeCount,3);

  const readEnv={...shadowEnv,USER_LIBRARY_V3_READ_ENABLED:'1'};
  const head=await readUserLibraryV3Head(readEnv,'u-delta');
  assert.equal(head.ready,true);
  assert.equal(head.revision,2);
  assert.equal(head.changeFloorRevision,1);
  assert.equal(head.papersSplit,true);
  assert.equal(head.metadataSplit,true);
  assert.equal(head.globalState.hideRead,true);

  const page=await readUserLibraryV3Page(readEnv,'u-delta',{limit:10});
  assert.deepEqual(page.rows.map(row=>row.paperKey),['10.1234/a','10.1234/new']);
  assert.ok(!page.rows.some(row=>row.paperKey==='10.1234/delete'));

  const delta=await readUserLibraryV3Delta(readEnv,'u-delta',{sinceRevision:1,limit:10});
  assert.equal(delta.resetRequired,false);
  assert.equal(delta.targetRevision,2);
  assert.equal(delta.hasMore,false);
  assert.deepEqual(delta.changes.map(row=>[row.paperKey,row.op]),[
    ['10.1234/a','upsert'],
    ['10.1234/delete','delete'],
    ['10.1234/new','upsert'],
  ]);
  assert.equal(delta.globalState.hideRead,true);
  const tombstone=db.sqlite.prepare(
    "SELECT deleted,revision FROM user_library_v3_rows WHERE user_id='u-delta' AND paper_key='10.1234/delete'"
  ).get();
  assert.equal(Number(tombstone.deleted),1);
  assert.equal(Number(tombstone.revision),2);
});

test('authenticated V3 head/page/delta modes are bounded and freshness-fenced',async t=>{
  const db=new D1();t.after(()=>db.close());
  const shadowEnv=envFor(db);
  const token='v3-sync-session-token';
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  const tokenHash=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  const first={
    ...fixture('before'),
    papers:{
      '10.1234/a':{favorite:true,note:'before',updatedAt:10},
      '10.1234/b':{favorite:true,updatedAt:10},
    },
    metadata:{
      '10.1234/a':{id:'10.1234/a',doi:'10.1234/a',title:'A',journal:'JACS'},
      '10.1234/b':{id:'10.1234/b',doi:'10.1234/b',title:'B',journal:'Angew'},
    },
  };
  putLegacy(db,'u-api-v3',first,1,100);
  db.sqlite.prepare('INSERT INTO user_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
    .run(tokenHash,'u-api-v3',Date.now()+60_000);
  await shadowWriteUserLibraryV3FromState(shadowEnv,'u-api-v3',first,1,100,150);

  const disabled=await readerCounts(shadowEnv,{mode:'account-v3-head',sessionToken:token});
  assert.equal(disabled.status,503);
  assert.equal(disabled.body.error,'user_library_v3_read_disabled');

  const env={...shadowEnv,USER_LIBRARY_V3_READ_ENABLED:'1'};
  const head=await readerCounts(env,{mode:'account-v3-head',sessionToken:token});
  assert.equal(head.status,200);
  assert.equal(head.body.account.readPath,'v3-head');
  assert.equal(head.body.account.revision,1);
  assert.equal(head.body.account.paperCount,2);
  assert.equal(head.body.account.papersSplit,true);

  const firstPage=await readerCounts(env,{mode:'account-v3-page',sessionToken:token,limit:1});
  assert.equal(firstPage.status,200);
  assert.equal(firstPage.body.account.count,1);
  assert.equal(firstPage.body.account.hasMore,true);
  assert.ok(firstPage.body.account.nextKey);
  const secondPage=await readerCounts(env,{
    mode:'account-v3-page',sessionToken:token,limit:1,afterKey:firstPage.body.account.nextKey,
  });
  assert.equal(secondPage.status,200);
  assert.equal(secondPage.body.account.count,1);
  assert.equal(secondPage.body.account.hasMore,false);

  const second={
    ...first,
    papers:{
      '10.1234/a':{favorite:true,note:'after',updatedAt:20},
      '10.1234/c':{favorite:true,updatedAt:20},
    },
    metadata:{
      '10.1234/a':first.metadata['10.1234/a'],
      '10.1234/c':{id:'10.1234/c',doi:'10.1234/c',title:'C',journal:'JACS'},
    },
  };
  putLegacy(db,'u-api-v3',second,2,200);

  const stale=await readerCounts(env,{mode:'account-v3-head',sessionToken:token});
  assert.equal(stale.status,409);
  assert.equal(stale.body.error,'user_library_v3_not_fresh');
  assert.equal(stale.body.legacyRevision,2);
  assert.equal(stale.body.v3Revision,1);

  await shadowWriteUserLibraryV3FromState(shadowEnv,'u-api-v3',second,2,200,250);
  const delta=await readerCounts(env,{
    mode:'account-v3-delta',sessionToken:token,sinceRevision:1,limit:10,
  });
  assert.equal(delta.status,200);
  assert.equal(delta.body.account.readPath,'v3-delta');
  assert.equal(delta.body.account.targetRevision,2);
  assert.deepEqual(delta.body.account.changes.map(row=>[row.paperKey,row.op]),[
    ['10.1234/a','upsert'],
    ['10.1234/b','delete'],
    ['10.1234/c','upsert'],
  ]);

  const unauth=await readerCounts(env,{mode:'account-v3-head',sessionToken:'wrong'});
  assert.equal(unauth.status,401);
  assert.equal(unauth.body.error,'not_authenticated');
});

test('V3 write authority verifies against D3b compatibility without any legacy state document',async t=>{
  const db=new D1();t.after(()=>db.close());
  db.sqlite.prepare('INSERT INTO users(id) VALUES (?)').run('u-authority');
  const env={
    DB:db,
    USER_LIBRARY_ROW_SHADOW_ENABLED:'1',
    USER_LIBRARY_ROW_READ_ENABLED:'1',
    USER_LIBRARY_V3_SHADOW_ENABLED:'1',
    USER_LIBRARY_V3_READ_ENABLED:'1',
    USER_LIBRARY_V3_WRITE_ENABLED:'1',
  };
  const globalState={
    statuses:[],quickTerms:[],collections:[],aliases:[],actionStyles:{},
    followedSearches:[],searchHistory:[],hideRead:false,
  };
  const mutation=await applyUserLibraryV3Mutation(env,'u-authority',{
    expectedRevision:0,
    globalState,
    operations:[{
      paperKey:'10.1234/a',
      paperState:{favorite:true,note:'authority'},
      metadata:{id:'10.1234/a',doi:'10.1234/a',title:'A',journal:'JACS'},
    }],
  },1000);
  assert.equal(mutation.ok,true);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM user_library_state WHERE user_id='u-authority'").get().c,0);

  const rowStatus=await getUserLibraryShadowStatus(env);
  assert.equal(rowStatus.body.authority,'v3');
  assert.equal(rowStatus.body.writeAuthority,true);
  assert.equal(rowStatus.body.authorityUsers,1);
  assert.equal(rowStatus.body.shadowHeads,1);
  assert.equal(rowStatus.body.revisionMismatches,0);
  assert.equal(rowStatus.body.readPathActive,true);

  const v3Status=await getUserLibraryV3ShadowStatus(env);
  assert.equal(v3Status.body.authority,'v3');
  assert.equal(v3Status.body.writeEnabled,true);
  assert.equal(v3Status.body.v3Heads,1);
  assert.equal(v3Status.body.compatibilityHeads,1);
  assert.equal(v3Status.body.compatibilityMismatches,0);
  assert.equal(v3Status.body.legacyUsers,0);

  const rowCompare=await compareUserLibraryShadowPage(env,0,20);
  assert.equal(rowCompare.body.authority,'v3');
  assert.equal(rowCompare.body.checked,1);
  assert.equal(rowCompare.body.mismatched,0);
  assert.equal(rowCompare.body.complete,true);

  const v3Compare=await compareUserLibraryV3ShadowPage(env,0,20);
  assert.equal(v3Compare.body.authority,'v3');
  assert.equal(v3Compare.body.comparison,'v3-to-d3b-compatibility');
  assert.equal(v3Compare.body.checked,1);
  assert.equal(v3Compare.body.mismatched,0);

  const blockedBackfill=await backfillUserLibraryV3ShadowPage(env,20);
  assert.equal(blockedBackfill.status,409);
  assert.equal(blockedBackfill.body.error,'user_library_v3_write_authority_active');
  const blockedReconcile=await reconcileUserLibraryV3ShadowPage(env,20);
  assert.equal(blockedReconcile.status,409);
  assert.equal(blockedReconcile.body.error,'user_library_v3_write_authority_active');
});

test('shadow can be independently disabled and does not activate V3 read/write authority',async t=>{
  const db=new D1();t.after(()=>db.close());
  const state=fixture();
  putLegacy(db,'u-off',state,1,100);
  const env={...envFor(db),USER_LIBRARY_V3_SHADOW_ENABLED:'0'};
  const result=await shadowWriteUserLibraryV3FromState(env,'u-off',state,1,100,200);
  assert.equal(result.enabled,false);
  const count=db.sqlite.prepare('SELECT COUNT(*) AS c FROM user_library_v3_head').get();
  assert.equal(Number(count.c),0);
});

console.log('USER_LIBRARY_V3_SHADOW_TESTS_READY');
