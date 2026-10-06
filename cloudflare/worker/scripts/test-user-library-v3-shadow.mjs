import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  backfillUserLibraryV3ShadowPage,
  compareUserLibraryV3ShadowPage,
  getUserLibraryV3ShadowStatus,
  reconcileUserLibraryV3ShadowPage,
  shadowWriteUserLibraryV3FromState,
} from '../src/user-library-v3-shadow.js';

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
      CREATE TABLE user_library_state (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        state_json TEXT NOT NULL,
        revision INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
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
