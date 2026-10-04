import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  backfillEvidenceIndexPage,
  getEvidenceIndexStatus,
  listEvidenceIndexRows,
  shadowIndexEvidence,
  shadowIndexHandoff,
} from '../src/evidence-index.js';

class SqliteD1Statement {
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
class SqliteD1 {
  constructor(){this.sqlite=new DatabaseSync(':memory:');}
  prepare(sql){return new SqliteD1Statement(this,sql);}
  async batch(statements){
    const out=[];
    for(const statement of statements) out.push(await statement.run());
    return out;
  }
  close(){this.sqlite.close();}
}

class MemoryObject {
  constructor(key,metadata={}){this.key=key;this.customMetadata=metadata;this.size=1;}
}
class MemoryR2 {
  constructor(objects=[]){this.objects=[...objects].sort((a,b)=>a.key.localeCompare(b.key));}
  async list({prefix='',limit=1000,cursor='',include=[]}={}){
    const filtered=this.objects.filter(o=>o.key.startsWith(prefix));
    const offset=cursor?Number(String(cursor).replace(/^c:/,'')):0;
    const slice=filtered.slice(offset,offset+limit);
    const next=offset+slice.length;
    return {
      objects:slice.map(o=>({key:o.key,size:o.size,customMetadata:include.includes('customMetadata')?o.customMetadata:undefined})),
      truncated:next<filtered.length,
      ...(next<filtered.length?{cursor:'c:'+next}:{})
    };
  }
}

function evidenceRow(doi,packet='a',source='b',extra={}){
  return {
    doi,
    evidenceR2Key:'private/article-evidence-v2/'+doi.replace(/[^a-z0-9]/gi,'')+'.json',
    evidencePacketHash:packet.repeat(64),
    sourceHash:source.repeat(64),
    schemaVersion:'article-evidence-v2',
    publisher:'acs',
    evidenceLevel:'complete',
    textProcessingPolicy:'private_cache_allowed',
    capturedAt:'2026-10-04T08:00:00Z',
    ...extra,
  };
}
function handoff(doi,packet='a',source='b'){
  return {
    doi,
    evidencePacketHash:packet.repeat(64),
    sourceHash:source.repeat(64),
    evidenceLevel:'complete',
    capturedAt:'2026-10-04T08:00:00Z',
    keyId:'key-v1',
    algorithm:'RSA-OAEP-256+A256GCM+GZIP',
    compression:'gzip',
  };
}
function objectFor(doi,n){
  return new MemoryObject('private/article-evidence-v2/'+String(n).padStart(4,'0')+'.json',{
    doi,
    schemaVersion:'article-evidence-v2',
    sourceHash:'b'.repeat(64),
    evidencePacketHash:String((n%9)+1).repeat(64),
    publisher:'acs',
    capturedAt:'2026-10-04T08:'+String(n).padStart(2,'0')+':00Z',
    textProcessingPolicy:'private_cache_allowed',
    evidenceLevel:'complete',
  });
}

test('Evidence Index shadow is disabled by default and does not require D1',async()=>{
  assert.deepEqual(await shadowIndexEvidence({},evidenceRow('10.1234/disabled')),{enabled:false,indexed:false});
  const status=await getEvidenceIndexStatus({});
  assert.equal(status.status,200);
  assert.equal(status.body.enabled,false);
  assert.equal(status.body.readPathActive,false);
});

test('D1 shadow dual-write, packet replacement and stale handoff fencing',async t=>{
  const db=new SqliteD1(); t.after(()=>db.close());
  const env={DB:db,MEDIA:new MemoryR2(),EVIDENCE_INDEX_SHADOW_ENABLED:'1'};
  const doi='10.1234/index-a';

  let result=await shadowIndexEvidence(env,evidenceRow(doi,'a','b'));
  assert.equal(result.indexed,true);
  let status=await getEvidenceIndexStatus(env);
  assert.equal(status.body.evidenceCount,1);
  assert.equal(status.body.handoffReadyCount,0);

  result=await shadowIndexHandoff(env,handoff(doi,'a','b'));
  assert.equal(result.indexed,true);
  status=await getEvidenceIndexStatus(env);
  assert.equal(status.body.handoffReadyCount,1);

  result=await shadowIndexEvidence(env,evidenceRow(doi,'c','d',{capturedAt:'2026-10-04T09:00:00Z'}));
  assert.equal(result.indexed,true);
  let rows=(await listEvidenceIndexRows(env,10)).body.items;
  assert.equal(rows.length,1);
  assert.equal(rows[0].evidence_packet_hash,'c'.repeat(64));
  assert.equal(rows[0].handoff_ready,0);
  assert.equal(rows[0].handoff_r2_key,null);

  result=await shadowIndexHandoff(env,handoff(doi,'a','b'));
  assert.equal(result.indexed,false);
  assert.equal(result.stale,true);
  rows=(await listEvidenceIndexRows(env,10)).body.items;
  assert.equal(rows[0].handoff_ready,0);

  result=await shadowIndexHandoff(env,handoff(doi,'c','d'));
  assert.equal(result.indexed,true);
  rows=(await listEvidenceIndexRows(env,10)).body.items;
  assert.equal(rows[0].handoff_ready,1);
  assert.match(rows[0].handoff_r2_key,/^private\/article-summary-handoff-v1\//);
});

test('cursor backfill progresses across arbitrary pages without a ten-page loop cap',async t=>{
  const db=new SqliteD1(); t.after(()=>db.close());
  const objects=[
    objectFor('10.1234/b1',1),
    objectFor('10.1234/b2',2),
    new MemoryObject('private/article-evidence-v2/bad.json',{doi:'bad',evidencePacketHash:'x',sourceHash:'y'}),
    objectFor('10.1234/b3',3),
    objectFor('10.1234/b4',4),
  ];
  const env={DB:db,MEDIA:new MemoryR2(objects),EVIDENCE_INDEX_SHADOW_ENABLED:'1'};

  const first=await backfillEvidenceIndexPage(env,2);
  assert.equal(first.status,200);
  assert.equal(first.body.complete,false);
  assert.equal(first.body.scannedObjects,2);
  assert.ok(first.body.cursor);

  const second=await backfillEvidenceIndexPage(env,2);
  assert.equal(second.body.complete,false);
  assert.equal(second.body.scannedObjects,4);
  assert.equal(second.body.skippedInvalid,0);

  const third=await backfillEvidenceIndexPage(env,2);
  assert.equal(third.body.complete,true);
  assert.equal(third.body.cursor,null);
  assert.equal(third.body.scannedObjects,5);
  assert.equal(third.body.indexedRows,4);
  assert.equal(third.body.skippedInvalid,1);

  const fourth=await backfillEvidenceIndexPage(env,2);
  assert.equal(fourth.body.complete,true);
  assert.equal(fourth.body.scannedObjects,5);

  const status=await getEvidenceIndexStatus(env);
  assert.equal(status.body.evidenceCount,4);
  assert.equal(status.body.backfill.complete,true);
  assert.equal(status.body.backfill.scannedObjects,5);
  assert.equal(status.body.backfill.indexedRows,4);
});

test('backfill state is unchanged when R2 listing fails',async t=>{
  const db=new SqliteD1(); t.after(()=>db.close());
  const env={
    DB:db,EVIDENCE_INDEX_SHADOW_ENABLED:'1',
    MEDIA:{async list(){throw new Error('injected_r2_failure');}}
  };
  const result=await backfillEvidenceIndexPage(env,100);
  assert.equal(result.status,502);
  assert.equal(result.body.error,'evidence_index_backfill_list_failed');
  const status=await getEvidenceIndexStatus(env);
  assert.equal(status.body.evidenceCount,0);
  assert.equal(status.body.backfill.scannedObjects,0);
  assert.equal(status.body.backfill.complete,false);
});

test('admin sample is bounded and never contains Evidence plaintext',async t=>{
  const db=new SqliteD1(); t.after(()=>db.close());
  const env={DB:db,MEDIA:new MemoryR2(),EVIDENCE_INDEX_SHADOW_ENABLED:'1'};
  await shadowIndexEvidence(env,evidenceRow('10.1234/sample','e','f'));
  const sample=await listEvidenceIndexRows(env,99999);
  assert.equal(sample.status,200);
  assert.equal(sample.body.count,1);
  const serialized=JSON.stringify(sample.body);
  assert.ok(!serialized.includes('sections'));
  assert.ok(!serialized.includes('fulltext'));
  assert.ok(!serialized.includes('articleUrl'));
});

console.log('EVIDENCE_INDEX_SHADOW_TESTS_READY');
