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
    this.sqlite.exec('PRAGMA foreign_keys=ON; CREATE TABLE users (id TEXT PRIMARY KEY);');
    const v2=fs.readFileSync(new URL('../../user-library-state-v2.sql',import.meta.url),'utf8');
    const v3=fs.readFileSync(new URL('../../user-library-state-v3.sql',import.meta.url),'utf8');
    this.sqlite.exec(v2);
    this.sqlite.exec(v3);
  }
  prepare(sql){return new Statement(this,sql);}
  async batch(statements){
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
