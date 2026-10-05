import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  backfillEvidenceHandoffIndexPage,
  backfillEvidenceIndexPage,
  getEvidenceIndexStatus,
  shadowIndexEvidence,
} from '../src/evidence-index.js';
import {
  backfillScheduledEvidenceHandoffs,
  compareScheduledHandoffIndexShadow,
  getScheduledEvidenceHandoff,
  SCHEDULED_HANDOFF_ALGORITHM,
  SCHEDULED_HANDOFF_KEY_ID,
  SCHEDULED_HANDOFF_SCHEMA_VERSION,
} from '../src/scheduled-summary-handoff.js';

class SqliteD1Statement {
  constructor(db,sql){this.db=db;this.sql=sql;this.args=[];}
  bind(...args){this.args=args;return this;}
  async run(){const result=this.db.sqlite.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(result.changes||0)},results:[]};}
  async first(){const row=this.db.sqlite.prepare(this.sql).get(...this.args);return row===undefined?null:row;}
  async all(){return {success:true,results:this.db.sqlite.prepare(this.sql).all(...this.args),meta:{}};}
}
class SqliteD1 {
  constructor(){this.sqlite=new DatabaseSync(':memory:');}
  prepare(sql){return new SqliteD1Statement(this,sql);}
  async batch(statements){const out=[];for(const statement of statements)out.push(await statement.run());return out;}
  close(){this.sqlite.close();}
}
class MemoryObject {
  constructor(key,body,metadata={}){this.key=key;this.body=body;this.customMetadata=metadata;this.size=body.length;}
  async text(){return this.body;}
}
class MemoryR2 {
  constructor(objects=[]){this.objects=new Map(objects.map(o=>[o.key,o]));this.listCalls=[];}
  async put(key,value,options={}){
    const body=typeof value==='string'?value:new TextDecoder().decode(value);
    this.objects.set(key,new MemoryObject(key,body,options.customMetadata||{}));
  }
  async list({prefix='',limit=1000,cursor='',include=[]}={}){
    this.listCalls.push(prefix);
    const all=[...this.objects.values()].filter(o=>o.key.startsWith(prefix)).sort((a,b)=>a.key.localeCompare(b.key));
    const offset=cursor?Number(String(cursor).replace(/^c:/,'')):0;
    const slice=all.slice(offset,offset+limit),next=offset+slice.length;
    return {
      objects:slice.map(o=>({key:o.key,size:o.size,customMetadata:include.includes('customMetadata')?o.customMetadata:undefined})),
      truncated:next<all.length,
      ...(next<all.length?{cursor:'c:'+next}:{})
    };
  }
  async get(key){return this.objects.get(key)||null;}
  resetListCalls(){this.listCalls.length=0;}
}
const emptyAssets={
  async fetch(){return new Response(JSON.stringify({version:1,generatedAt:0,items:{}}),{status:200,headers:{'content-type':'application/json'}});}
};
function evidenceObject(doi,id,packet,source,capturedAt){
  const evidence={
    schemaVersion:'article-evidence-v2',doi,evidencePacketHash:packet.repeat(64),sourceHash:source.repeat(64),
    publisher:'acs',evidenceLevel:'complete',textProcessingPolicy:'private_cache_allowed',capturedAt,
  };
  return new MemoryObject('private/article-evidence-v2/'+id+'.json',JSON.stringify(evidence),evidence);
}
function handoffObject(doi,id,packet,source,capturedAt){
  const envelope={
    schemaVersion:SCHEDULED_HANDOFF_SCHEMA_VERSION,keyId:SCHEDULED_HANDOFF_KEY_ID,
    algorithm:SCHEDULED_HANDOFF_ALGORITHM,compression:'gzip',plaintextEncoding:'utf-8-json',
    doi,evidencePacketHash:packet.repeat(64),sourceHash:source.repeat(64),evidenceLevel:'complete',
    capturedAt,encryptedKey:'key',iv:'iv',ciphertext:'ciphertext',uncompressedBytes:10,compressedBytes:8,ciphertextBytes:10,
  };
  return new MemoryObject('private/article-summary-handoff-v1/'+id+'.json',JSON.stringify(envelope),{
    doi,evidencePacketHash:envelope.evidencePacketHash,sourceHash:envelope.sourceHash,evidenceLevel:'complete',
    capturedAt,keyId:SCHEDULED_HANDOFF_KEY_ID,algorithm:SCHEDULED_HANDOFF_ALGORITHM,compression:'gzip',
  });
}
function evidenceRow(doi,id,packet,source,capturedAt){
  return {
    doi,evidenceR2Key:'private/article-evidence-v2/'+id+'.json',evidencePacketHash:packet.repeat(64),
    sourceHash:source.repeat(64),schemaVersion:'article-evidence-v2',publisher:'acs',evidenceLevel:'complete',
    textProcessingPolicy:'private_cache_allowed',capturedAt,
  };
}
async function idForDoi(doi){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(doi).toLowerCase()));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('').slice(0,32);
}

test('scheduled handoff D1 selector matches legacy R2 discovery after both historical backfills complete',async t=>{
  const db=new SqliteD1();t.after(()=>db.close());
  const objects=[
    evidenceObject('10.1234/a','a','a','b','2026-10-05T01:00:00Z'),
    evidenceObject('10.1234/b','b','c','d','2026-10-05T02:00:00Z'),
    evidenceObject('10.1234/c','c','e','f','2026-10-05T03:00:00Z'),
    handoffObject('10.1234/a','a','a','b','2026-10-05T01:00:00Z'),
    handoffObject('10.1234/b','b','c','d','2026-10-05T02:00:00Z'),
  ];
  const env={DB:db,MEDIA:new MemoryR2(objects),ASSETS:emptyAssets,EVIDENCE_INDEX_SHADOW_ENABLED:'1'};
  assert.equal((await backfillEvidenceIndexPage(env,100)).body.complete,true);
  assert.equal((await backfillEvidenceHandoffIndexPage(env,100)).body.complete,true);

  const comparison=await compareScheduledHandoffIndexShadow(env,40);
  assert.equal(comparison.status,200);
  assert.equal(comparison.body.comparable,true);
  assert.equal(comparison.body.same,true);
  assert.equal(comparison.body.pending.same,true);
  assert.equal(comparison.body.pending.legacy.count,2);
  assert.equal(comparison.body.pending.indexed.count,2);
  assert.equal(comparison.body.pending.legacy.candidateSetHash,comparison.body.pending.indexed.candidateSetHash);
  assert.deepEqual(comparison.body.pending.legacy.items.map(x=>x.doi),['10.1234/b','10.1234/a']);
  assert.equal(comparison.body.backfill.same,true);
  assert.equal(comparison.body.backfill.legacy.count,1);
  assert.equal(comparison.body.backfill.indexed.count,1);
  assert.equal(comparison.body.backfill.legacy.candidateSetHash,comparison.body.backfill.indexed.candidateSetHash);
  assert.deepEqual(comparison.body.backfill.legacy.items.map(x=>x.doi),['10.1234/c']);
});

test('new Evidence revision fences stale historical handoff from D1 parity',async t=>{
  const db=new SqliteD1();t.after(()=>db.close());
  const objects=[
    evidenceObject('10.1234/a','a','a','b','2026-10-05T01:00:00Z'),
    handoffObject('10.1234/a','a','a','b','2026-10-05T01:00:00Z'),
  ];
  const env={DB:db,MEDIA:new MemoryR2(objects),ASSETS:emptyAssets,EVIDENCE_INDEX_SHADOW_ENABLED:'1'};
  await backfillEvidenceIndexPage(env,100);
  await backfillEvidenceHandoffIndexPage(env,100);
  const revised=evidenceObject('10.1234/a','a','e','f','2026-10-05T03:00:00Z');
  env.MEDIA.objects.set(revised.key,revised);
  await shadowIndexEvidence(env,evidenceRow('10.1234/a','a','e','f','2026-10-05T03:00:00Z'));

  const comparison=await compareScheduledHandoffIndexShadow(env,40);
  assert.equal(comparison.status,200);
  assert.equal(comparison.body.comparable,true);
  assert.equal(comparison.body.same,false);
  assert.equal(comparison.body.pending.same,false);
  assert.equal(comparison.body.pending.legacy.count,1);
  assert.equal(comparison.body.pending.indexed.count,0);
  assert.equal(comparison.body.backfill.same,true);
});

test('production scheduled handoff manifest uses D1 discovery without R2 prefix listing when activated',async t=>{
  const db=new SqliteD1();t.after(()=>db.close());
  const media=new MemoryR2([
    evidenceObject('10.1234/live-a','a','a','b','2026-10-05T01:00:00Z'),
    handoffObject('10.1234/live-a','a','a','b','2026-10-05T01:00:00Z'),
  ]);
  const env={
    DB:db,MEDIA:media,ASSETS:emptyAssets,EVIDENCE_INDEX_SHADOW_ENABLED:'1',
    SCHEDULED_HANDOFF_INDEX_READ_ENABLED:'1',
  };
  await backfillEvidenceIndexPage(env,100);
  await backfillEvidenceHandoffIndexPage(env,100);
  media.resetListCalls();

  const result=await getScheduledEvidenceHandoff(env,40,{manifestOnly:true});
  assert.equal(result.status,200);
  assert.equal(result.body.discoveryMode,'d1_index');
  assert.equal(result.body.count,1);
  assert.equal(result.body.items[0].doi,'10.1234/live-a');
  assert.equal(media.listCalls.length,0);
});

test('production handoff creation backlog uses D1 rows and dual-writes new readiness without prefix scans',async t=>{
  const db=new SqliteD1();t.after(()=>db.close());
  const media=new MemoryR2([
    evidenceObject('10.1234/create','c','c','d','2026-10-05T02:00:00Z'),
  ]);
  const env={
    DB:db,MEDIA:media,ASSETS:emptyAssets,EVIDENCE_INDEX_SHADOW_ENABLED:'1',
    SCHEDULED_HANDOFF_INDEX_READ_ENABLED:'1',
  };
  await backfillEvidenceIndexPage(env,100);
  await backfillEvidenceHandoffIndexPage(env,100);
  media.resetListCalls();

  const result=await backfillScheduledEvidenceHandoffs(env,4);
  assert.equal(result.status,200);
  assert.equal(result.body.discoveryMode,'d1_index');
  assert.equal(result.body.created,1);
  assert.equal(media.listCalls.length,0);

  const after=await getEvidenceIndexStatus(env);
  assert.equal(after.body.handoffReadyCount,1);
  assert.equal(after.body.handoffReadPathActive,true);
});

test('activated D1 discovery falls back to legacy R2 if D1 is unavailable',async()=>{
  const doi='10.1234/fallback';
  const id=await idForDoi(doi);
  const media=new MemoryR2([
    handoffObject(doi,id,'a','b','2026-10-05T03:00:00Z'),
  ]);
  const env={
    MEDIA:media,ASSETS:emptyAssets,EVIDENCE_INDEX_SHADOW_ENABLED:'1',
    SCHEDULED_HANDOFF_INDEX_READ_ENABLED:'1',
  };
  const result=await getScheduledEvidenceHandoff(env,40,{manifestOnly:true});
  assert.equal(result.status,200);
  assert.equal(result.body.discoveryMode,'legacy_r2_fallback');
  assert.equal(result.body.fallbackReason,'scheduled_handoff_index_not_ready');
  assert.equal(result.body.count,1);
  assert.ok(media.listCalls.some(prefix=>prefix==='private/article-summary-handoff-v1/'));
});

