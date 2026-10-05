import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  backfillUserLibraryShadowPage,
  compareUserLibraryShadowPage,
  getUserLibraryShadowStatus,
  rebuildUserLibraryState,
  shadowWriteUserLibraryState,
  splitUserLibraryState,
  stableStateJson,
} from '../src/user-library-shadow.js';

class Statement {
  constructor(db,sql){this.db=db;this.sql=sql;this.args=[];}
  bind(...args){this.args=args;return this;}
  async run(){const r=this.db.sqlite.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(r.changes||0)},results:[]};}
  async first(){const row=this.db.sqlite.prepare(this.sql).get(...this.args);return row===undefined?null:row;}
  async all(){return {success:true,results:this.db.sqlite.prepare(this.sql).all(...this.args),meta:{}};}
}
class D1 {
  constructor(){
    this.sqlite=new DatabaseSync(':memory:');
    this.sqlite.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE user_library_state (
        user_id TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        revision INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE user_library_head (
        user_id TEXT PRIMARY KEY,
        revision INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        global_json TEXT NOT NULL,
        papers_split INTEGER NOT NULL,
        metadata_split INTEGER NOT NULL,
        paper_count INTEGER NOT NULL DEFAULT 0,
        metadata_count INTEGER NOT NULL DEFAULT 0,
        source_state_hash TEXT NOT NULL,
        shadow_version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE user_paper_state (
        user_id TEXT NOT NULL,
        paper_key TEXT NOT NULL,
        doi TEXT,
        paper_present INTEGER NOT NULL,
        paper_state_json TEXT,
        metadata_present INTEGER NOT NULL,
        metadata_json TEXT,
        revision INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id,paper_key)
      );
      CREATE TABLE user_library_shadow_backfill (
        id INTEGER PRIMARY KEY CHECK (id=1),
        cursor_user_id TEXT,
        complete INTEGER NOT NULL DEFAULT 0,
        scanned_users INTEGER NOT NULL DEFAULT 0,
        synced_users INTEGER NOT NULL DEFAULT 0,
        skipped_stale INTEGER NOT NULL DEFAULT 0,
        invalid_states INTEGER NOT NULL DEFAULT 0,
        failed_users INTEGER NOT NULL DEFAULT 0,
        started_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_error TEXT NOT NULL DEFAULT ''
      );
    `);
  }
  prepare(sql){return new Statement(this,sql);}
  async batch(statements){const out=[];for(const s of statements)out.push(await s.run());return out;}
  close(){this.sqlite.close();}
}
const envFor=db=>({DB:db,USER_LIBRARY_ROW_SHADOW_ENABLED:'1'});

function stateFixture(){
  return {
    statuses:[{id:'deep',name:'深读'}],
    quickTerms:[{id:'method',label:'方法'}],
    collections:[{id:'default',name:'默认收藏'}],
    aliases:[],
    actionStyles:{favorite:{rgb:[1,2,3],shape:'pill'}},
    papers:{
      '10.1234/abc':{favorite:true,collections:['default'],note:'hello',quickTerms:['method'],tags:['x'],updatedAt:10},
      'title:nodoi':{favorite:false,collections:[],note:'',quickTerms:[],tags:[],statusId:'deep',updatedAt:11},
    },
    metadata:{
      '10.1234/abc':{id:'10.1234/abc',doi:'10.1234/abc',title:'A',journal:'JACS',href:'https://doi.org/10.1234/abc'},
      'title:nodoi':{id:'title:nodoi',title:'No DOI',journal:'Test'},
      '10.1234/meta-only':{id:'10.1234/meta-only',doi:'10.1234/meta-only',title:'Meta only',journal:'Test'},
    },
    followedSearches:['nickel'],
    searchHistory:['photoredox'],
    hideRead:true,
    futureTopLevel:{kept:true},
  };
}

test('split/rebuild preserves DOI, title fallback, metadata-only rows and unknown top-level fields',async()=>{
  const state=stateFixture();
  const split=await splitUserLibraryState(state);
  assert.equal(split.paperCount,2);
  assert.equal(split.metadataCount,3);
  assert.equal(split.rows.length,3);
  assert.equal(split.rows.find(r=>r.paperKey==='10.1234/abc').doi,'10.1234/abc');
  assert.equal(split.rows.find(r=>r.paperKey==='title:nodoi').doi,null);
  assert.equal(split.rows.find(r=>r.paperKey==='10.1234/meta-only').paperPresent,false);

  const head={
    global_json:split.globalJson,papers_split:1,metadata_split:1,
  };
  const rows=split.rows.map(row=>({
    paper_key:row.paperKey,paper_present:row.paperPresent?1:0,paper_state_json:row.paperStateJson,
    metadata_present:row.metadataPresent?1:0,metadata_json:row.metadataJson,
  }));
  assert.equal(stableStateJson(rebuildUserLibraryState(head,rows)),stableStateJson(state));
});

test('malformed legacy papers/metadata values remain in global state instead of being lost',async()=>{
  const state={papers:'legacy-scalar',metadata:null,other:7};
  const split=await splitUserLibraryState(state);
  assert.equal(split.papersSplit,false);
  assert.equal(split.metadataSplit,false);
  assert.equal(split.rows.length,0);
  const rebuilt=rebuildUserLibraryState({global_json:split.globalJson,papers_split:0,metadata_split:0},[]);
  assert.deepEqual(rebuilt,state);
});

test('shadow write replaces removed rows and stale historical writes cannot roll revision backward',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env=envFor(db);
  db.sqlite.prepare('INSERT INTO users(id) VALUES (?)').run('u1');

  const state1=stateFixture();
  const first=await shadowWriteUserLibraryState(env,'u1',state1,3,300);
  assert.equal(first.written,true);
  assert.equal(first.rowCount,3);

  const state2={...state1,papers:{'10.1234/abc':state1.papers['10.1234/abc']},metadata:{'10.1234/abc':state1.metadata['10.1234/abc']}};
  const second=await shadowWriteUserLibraryState(env,'u1',state2,4,400);
  assert.equal(second.written,true);
  const count=db.sqlite.prepare('SELECT COUNT(*) AS c FROM user_paper_state WHERE user_id=?').get('u1');
  assert.equal(Number(count.c),1);

  const stale=await shadowWriteUserLibraryState(env,'u1',state1,3,300);
  assert.equal(stale.skippedStale,true);
  const head=db.sqlite.prepare('SELECT revision FROM user_library_head WHERE user_id=?').get('u1');
  assert.equal(Number(head.revision),4);
});

test('historical cursor backfill and paged semantic parity cover all legacy users',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env=envFor(db);
  for(const [id,revision,updated,state] of [
    ['u1',2,200,stateFixture()],
    ['u2',5,500,{...stateFixture(),papers:{},metadata:{},hideRead:false}],
  ]){
    db.sqlite.prepare('INSERT INTO users(id) VALUES (?)').run(id);
    db.sqlite.prepare('INSERT INTO user_library_state(user_id,state_json,revision,updated_at) VALUES (?,?,?,?)')
      .run(id,JSON.stringify(state),revision,updated);
  }

  const p1=await backfillUserLibraryShadowPage(env,1);
  assert.equal(p1.body.complete,false);
  const p2=await backfillUserLibraryShadowPage(env,1);
  assert.equal(p2.body.complete,false);
  const p3=await backfillUserLibraryShadowPage(env,1);
  assert.equal(p3.body.complete,true);

  const status=await getUserLibraryShadowStatus(env);
  assert.equal(status.body.legacyUsers,2);
  assert.equal(status.body.shadowHeads,2);
  assert.equal(status.body.revisionMismatches,0);
  assert.equal(status.body.backfill.complete,true);

  const c1=await compareUserLibraryShadowPage(env,0,1);
  assert.equal(c1.body.checked,1);
  assert.equal(c1.body.mismatched,0);
  assert.equal(c1.body.complete,false);
  const c2=await compareUserLibraryShadowPage(env,c1.body.nextOffset,1);
  assert.equal(c2.body.checked,1);
  assert.equal(c2.body.mismatched,0);
  assert.equal(c2.body.complete,true);
});

console.log('USER_LIBRARY_ROW_SHADOW_TESTS_READY');
