import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { backfillHandoffIndexPage, shadowIndexEvidence } from '../src/evidence-index.js';
import {
  compareScheduledHandoffIndexShadow,
  persistScheduledEvidenceHandoff,
  SCHEDULED_REVIEWED_SUMMARY_SCHEMA_VERSION,
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
  constructor(value,options={}){this.value=typeof value==='string'?value:new TextDecoder().decode(value);this.customMetadata=options.customMetadata||{};this.size=new TextEncoder().encode(this.value).length;}
  async text(){return this.value;}
}
class MemoryR2 {
  constructor(){this.map=new Map();}
  async put(key,value,options={}){this.map.set(key,new MemoryObject(value,options));}
  async get(key){return this.map.get(key)||null;}
  async list({prefix='',limit=1000,cursor='',include=[]}={}){
    const entries=[...this.map.entries()].filter(([key])=>key.startsWith(prefix)).sort(([a],[b])=>a.localeCompare(b));
    const offset=cursor?Number(String(cursor).replace(/^c:/,'')):0;
    const slice=entries.slice(offset,offset+limit),next=offset+slice.length;
    return {
      objects:slice.map(([key,obj])=>({key,size:obj.size,customMetadata:include.includes('customMetadata')?obj.customMetadata:undefined})),
      truncated:next<entries.length,
      ...(next<entries.length?{cursor:'c:'+next}:{})
    };
  }
}
async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value||'')));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function idForDoi(doi){return (await sha256Hex(doi.toLowerCase())).slice(0,32);}
function evidence(doi,packetChar,sourceChar,capturedAt){
  return {
    schemaVersion:'article-evidence-v2',doi,title:'shadow comparator',journal:'JACS',publisher:'acs',
    articleUrl:'https://pubs.acs.org/doi/'+doi,sourceUrl:'https://pubs.acs.org/doi/'+doi,pageDoi:doi,
    captureVersion:'6.2.20',controllerRevision:'2.2.39',jobId:'12345678-1234-1234-1234-123456789012',
    queueGeneratedAt:'2026-10-04T08:00:00Z',capturedAt,fulltextStatus:'complete',evidenceLevel:'complete',
    textProcessingPolicy:'private_cache_allowed',sourceHash:sourceChar.repeat(64),evidencePacketHash:packetChar.repeat(64),
    sections:[{sectionId:'s001',type:'abstract',heading:'Abstract',text:'Private evidence fixture text.',order:0,hash:'f'.repeat(64)}],
    captions:[],tables:[],chars:30,sectionCount:1,captionCount:0,tableCount:0,importedAt:Date.now(),
  };
}
function indexRow(row){
  return {
    doi:row.doi,
    evidenceR2Key:'private/article-evidence-v2/'+row.doi.replace(/[^a-z0-9]/gi,'')+'.json',
    evidencePacketHash:row.evidencePacketHash,
    sourceHash:row.sourceHash,
    schemaVersion:'article-evidence-v2',
    publisher:row.publisher,
    evidenceLevel:row.evidenceLevel,
    textProcessingPolicy:row.textProcessingPolicy,
    capturedAt:row.capturedAt,
  };
}

test('scheduled handoff D1 shadow matches legacy R2 selection and detects divergence',async t=>{
  const DB=new SqliteD1();t.after(()=>DB.close());
  const MEDIA=new MemoryR2();
  const one=evidence('10.1021/jacs.6c88001','a','b','2026-10-04T09:00:00Z');
  const two=evidence('10.1021/jacs.6c88002','c','d','2026-10-04T08:00:00Z');
  const approved={
    schemaVersion:SCHEDULED_REVIEWED_SUMMARY_SCHEMA_VERSION,doi:two.doi,status:'approved',
    sourceHash:two.sourceHash,evidencePacketHash:two.evidencePacketHash,evidenceLevel:'complete',
    zh:'已审核。',en:'Reviewed.',generatedAt:Date.now(),reviewedAt:Date.now(),
    promptVersion:'gallery-daily-summary-v1',auditVersion:'gallery-daily-summary-audit-v1',
  };
  const ASSETS={async fetch(){return new Response(JSON.stringify({version:1,generatedAt:Date.now(),schemaVersion:SCHEDULED_REVIEWED_SUMMARY_SCHEMA_VERSION,items:{[two.doi]:approved}}),{status:200,headers:{'content-type':'application/json'}});}};
  const env={DB,MEDIA,ASSETS,EVIDENCE_INDEX_SHADOW_ENABLED:'1'};

  assert.equal((await shadowIndexEvidence(env,indexRow(one))).indexed,true);
  assert.equal((await shadowIndexEvidence(env,indexRow(two))).indexed,true);
  assert.ok(await persistScheduledEvidenceHandoff(env,one));
  assert.ok(await persistScheduledEvidenceHandoff(env,two));

  const backfill=await backfillHandoffIndexPage(env,100);
  assert.equal(backfill.status,200);assert.equal(backfill.body.complete,true);

  let compared=await compareScheduledHandoffIndexShadow(env,40);
  assert.equal(compared.status,200);
  assert.equal(compared.body.readPathActive,false);
  assert.equal(compared.body.match,true);
  assert.equal(compared.body.sameSet,true);
  assert.equal(compared.body.sameOrder,true);
  assert.equal(compared.body.legacyCount,1);
  assert.equal(compared.body.indexCount,1);
  assert.equal(compared.body.legacy[0].doi,one.doi);
  assert.equal(compared.body.indexed[0].doi,one.doi);

  await DB.prepare('UPDATE article_evidence_index SET handoff_ready=0,handoff_r2_key=NULL WHERE doi=?').bind(one.doi).run();
  compared=await compareScheduledHandoffIndexShadow(env,40);
  assert.equal(compared.status,200);
  assert.equal(compared.body.match,false);
  assert.equal(compared.body.sameSet,false);
  assert.equal(compared.body.legacyCount,1);
  assert.equal(compared.body.indexCount,0);

  const id=await idForDoi(one.doi);
  await MEDIA.put('private/article-summary/'+id+'.json',JSON.stringify({
    schemaVersion:'reviewed-summary-v2',doi:one.doi,status:'approved',
    sourceHash:one.sourceHash,evidencePacketHash:one.evidencePacketHash,zh:'旧摘要',en:'Legacy reviewed'
  }));
  compared=await compareScheduledHandoffIndexShadow(env,40);
  assert.equal(compared.body.legacyCount,0);
  assert.equal(compared.body.indexCount,0);
  assert.equal(compared.body.match,true);
});

console.log('SCHEDULED_HANDOFF_INDEX_SHADOW_TEST_READY');
