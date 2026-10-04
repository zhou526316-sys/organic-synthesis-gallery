import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { ensureEvidenceIndexSchema } from '../src/evidence-index.js';
import {
  backfillSummaryJobIndexPage,
  compareSummaryCandidateSnapshots,
  ensureSummaryJobIndexSchema,
  getIndexedSummaryCandidateSnapshot,
  getSummaryJobIndexStatus,
  selectSummaryCandidateFromIndexedMetadata,
  shadowIndexSummaryJob,
} from '../src/summary-job-index.js';

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
  async batch(statements){const out=[];for(const s of statements)out.push(await s.run());return out;}
  close(){this.sqlite.close();}
}
class MemoryObject {
  constructor(key,meta={}){this.key=key;this.customMetadata=meta;this.size=1;}
}
class MemoryR2 {
  constructor(objects=[]){this.objects=[...objects].sort((a,b)=>a.key.localeCompare(b.key));}
  async list({prefix='',limit=1000,cursor='',include=[]}={}){
    const rows=this.objects.filter(row=>row.key.startsWith(prefix));
    const offset=cursor?Number(String(cursor).replace(/^c:/,'')):0;
    const slice=rows.slice(offset,offset+limit),next=offset+slice.length;
    return {
      objects:slice.map(row=>({key:row.key,size:row.size,customMetadata:include.includes('customMetadata')?row.customMetadata:undefined})),
      truncated:next<rows.length,
      ...(next<rows.length?{cursor:'c:'+next}:{})
    };
  }
}
const h=ch=>ch.repeat(64);
const key=doi=>'private/article-summary-jobs/'+doi.replace(/[^a-z0-9]/gi,'')+'.json';
function job(doi,state='processing',packet='a',updatedAt=1000,extra={}){
  return {
    doi,state,evidencePacketHash:h(packet),sourceHash:h('b'),evidenceLevel:'complete',
    textProcessingPolicy:'private_cache_allowed',capturedAt:'2026-10-04T08:00:00Z',
    nextRetryAt:0,leaseExpiresAt:0,updatedAt,publishedAt:0,attempts:1,...extra
  };
}
function obj(doi,state='processing',packet='a',updatedAt=1000,extra={}){
  const row=job(doi,state,packet,updatedAt,extra);
  return new MemoryObject(key(doi),{
    doi:row.doi,state:row.state,evidencePacketHash:row.evidencePacketHash,sourceHash:row.sourceHash,
    evidenceLevel:row.evidenceLevel,textProcessingPolicy:row.textProcessingPolicy,capturedAt:row.capturedAt,
    nextRetryAt:String(row.nextRetryAt||0),leaseExpiresAt:String(row.leaseExpiresAt||0),
    updatedAt:String(row.updatedAt||0),publishedAt:String(row.publishedAt||0),attempts:String(row.attempts||0)
  });
}
function evidence(doi,packet='a',capturedAt='2026-10-04T08:00:00Z',level='complete',policy='private_cache_allowed'){
  return {
    doi,evidence_r2_key:'private/article-evidence-v2/'+doi.replace(/[^a-z0-9]/gi,'')+'.json',
    evidence_packet_hash:h(packet),source_hash:h('b'),evidence_level:level,
    text_processing_policy:policy,captured_at:capturedAt
  };
}
async function seedEvidence(db,rows){
  await ensureEvidenceIndexSchema({DB:db});
  const now=Date.now();
  for(const row of rows){
    await db.prepare(`INSERT INTO article_evidence_index
      (doi,evidence_r2_key,evidence_packet_hash,source_hash,schema_version,publisher,evidence_level,
       text_processing_policy,captured_at,handoff_r2_key,handoff_ready,handoff_key_id,handoff_algorithm,
       handoff_compression,indexed_at,updated_at)
      VALUES (?,?,?,?, 'article-evidence-v2','acs',?,?,?,NULL,0,'','','',?,?)`)
      .bind(row.doi,row.evidence_r2_key,row.evidence_packet_hash,row.source_hash,row.evidence_level,
        row.text_processing_policy,row.captured_at,now,now).run();
  }
  await db.prepare(`INSERT INTO article_evidence_index_backfill
    (id,cursor,complete,scanned_objects,indexed_rows,skipped_invalid,started_at,updated_at,last_error)
    VALUES (1,NULL,1,?,?,?,?,?,'')`)
    .bind(rows.length,rows.length,0,now,now).run();
}
async function markJobBackfillComplete(db,count){
  const now=Date.now();
  await db.prepare(`INSERT INTO summary_review_job_index_backfill
    (id,cursor,complete,scanned_objects,indexed_rows,skipped_invalid,skipped_stale,started_at,updated_at,last_error)
    VALUES (1,NULL,1,?,?,?,?,?,?,?,'')`)
    .bind(count,count,0,0,now,now).run();
}

test('job index is disabled by default',async()=>{
  const result=await shadowIndexSummaryJob({},job('10.1234/disabled'),key('10.1234/disabled'));
  assert.deepEqual(result,{enabled:false,indexed:false});
  const status=await getSummaryJobIndexStatus({});
  assert.equal(status.body.enabled,false);
  assert.equal(status.body.readPathActive,false);
});

test('R2-first dual-write keeps newer D1 job when stale metadata arrives',async t=>{
  const db=new SqliteD1();t.after(()=>db.close());
  const env={DB:db,SUMMARY_JOB_INDEX_SHADOW_ENABLED:'1'};
  let result=await shadowIndexSummaryJob(env,job('10.1234/a','processing','a',2000),key('10.1234/a'));
  assert.equal(result.indexed,true);
  result=await shadowIndexSummaryJob(env,job('10.1234/a','retry_wait','a',1000),key('10.1234/a'));
  assert.equal(result.indexed,false);assert.equal(result.stale,true);
  const row=await db.prepare('SELECT state,updated_at FROM summary_review_job_index WHERE doi=?').bind('10.1234/a').first();
  assert.equal(row.state,'processing');assert.equal(row.updated_at,2000);
});

test('job cursor backfill persists progress and stale rows are counted',async t=>{
  const db=new SqliteD1();t.after(()=>db.close());
  await ensureSummaryJobIndexSchema({DB:db});
  await shadowIndexSummaryJob({DB:db,SUMMARY_JOB_INDEX_SHADOW_ENABLED:'1'},
    job('10.1234/a','published','a',5000,{publishedAt:4900}),key('10.1234/a'));
  const objects=[
    obj('10.1234/a','processing','a',1000),
    obj('10.1234/b','retry_wait','b',2000),
    new MemoryObject('private/article-summary-jobs/bad.json',{doi:'bad',updatedAt:'3'}),
    obj('10.1234/c','rejected','c',3000),
  ];
  const env={DB:db,MEDIA:new MemoryR2(objects),SUMMARY_JOB_INDEX_SHADOW_ENABLED:'1'};
  const first=await backfillSummaryJobIndexPage(env,2);
  assert.equal(first.body.complete,false);
  assert.equal(first.body.pageSkippedStale,1);
  assert.equal(first.body.pageIndexed,1);
  const second=await backfillSummaryJobIndexPage(env,2);
  assert.equal(second.body.complete,true);
  assert.equal(second.body.skippedInvalid,1);
  const status=await getSummaryJobIndexStatus(env);
  assert.equal(status.body.jobCount,3);
  assert.equal(status.body.backfill.complete,true);
  const a=await db.prepare('SELECT state,updated_at FROM summary_review_job_index WHERE doi=?').bind('10.1234/a').first();
  assert.equal(a.state,'published');assert.equal(a.updated_at,5000);
});

test('pure indexed policy reproduces terminal lease retry policy and ordering',()=>{
  const now=10_000;
  const evidenceRows=[
    evidence('10.1234/latest','a','2026-10-04T10:00:00Z','partial'),
    evidence('10.1234/complete','b','2026-10-04T09:00:00Z','complete'),
    evidence('10.1234/terminal','c','2026-10-04T11:00:00Z','complete'),
    evidence('10.1234/processing','d','2026-10-04T12:00:00Z','complete'),
    evidence('10.1234/retry','e','2026-10-04T08:00:00Z','complete'),
    evidence('10.1234/newpacket','f','2026-10-04T07:00:00Z','complete'),
    evidence('10.1234/blocked','g','2026-10-04T13:00:00Z','complete','no_external_ai'),
    evidence('10.1234/unknown','h','2026-10-04T14:00:00Z','complete','unknown'),
  ];
  const jobRows=[
    {...job('10.1234/terminal','published','c',9000,{publishedAt:9000}),job_r2_key:key('10.1234/terminal')},
    {...job('10.1234/processing','processing','d',9000,{leaseExpiresAt:20_000}),job_r2_key:key('10.1234/processing')},
    {...job('10.1234/retry','retry_wait','e',9000,{nextRetryAt:9_000}),job_r2_key:key('10.1234/retry')},
    {...job('10.1234/newpacket','rejected','z',9000),job_r2_key:key('10.1234/newpacket')},
  ];
  const result=selectSummaryCandidateFromIndexedMetadata({evidenceRows,jobRows,now,allowUnknownPolicy:false});
  assert.deepEqual(result.candidateDois,[
    '10.1234/latest','10.1234/complete','10.1234/retry','10.1234/newpacket'
  ]);
  assert.equal(result.candidate.doi,'10.1234/latest');
  assert.equal(result.blockedPolicies.no_external_ai,1);
  assert.equal(result.blockedPolicies.unknown,1);
});

test('same captured time prioritizes complete then partial then DOI',()=>{
  const at='2026-10-04T08:00:00Z';
  const rows=[
    evidence('10.1234/z','a',at,'partial'),
    evidence('10.1234/b','b',at,'complete'),
    evidence('10.1234/a','c',at,'complete'),
  ];
  const result=selectSummaryCandidateFromIndexedMetadata({evidenceRows:rows,jobRows:[],now:1});
  assert.deepEqual(result.candidateDois,['10.1234/a','10.1234/b','10.1234/z']);
});

test('unknown policy is eligible only when explicit legacy flag equivalent is true',()=>{
  const rows=[evidence('10.1234/u','a','2026-10-04T08:00:00Z','complete','unknown')];
  assert.equal(selectSummaryCandidateFromIndexedMetadata({evidenceRows:rows,jobRows:[],allowUnknownPolicy:false}).eligibleCount,0);
  assert.equal(selectSummaryCandidateFromIndexedMetadata({evidenceRows:rows,jobRows:[],allowUnknownPolicy:true}).eligibleCount,1);
});

test('preferred DOI semantics and recent published count match legacy behavior',()=>{
  const now=100_000_000;
  const rows=[evidence('10.1234/a'),evidence('10.1234/b')];
  const jobs=[
    {...job('10.1234/x','published','x',now,{publishedAt:now-1000}),job_r2_key:key('10.1234/x')},
    {...job('10.1234/y','published','y',now,{publishedAt:now-25*60*60*1000}),job_r2_key:key('10.1234/y')},
  ];
  const r=selectSummaryCandidateFromIndexedMetadata({evidenceRows:rows,jobRows:jobs,now,preferredDoi:'10.1234/b'});
  assert.equal(r.candidate.doi,'10.1234/b');
  assert.equal(r.preferredEligible,true);
  assert.equal(r.recentPublishedCount,1);
});

test('indexed snapshot requires both Evidence and job backfills complete',async t=>{
  const db=new SqliteD1();t.after(()=>db.close());
  await seedEvidence(db,[evidence('10.1234/a')]);
  await ensureSummaryJobIndexSchema({DB:db});
  const env={DB:db,EVIDENCE_INDEX_SHADOW_ENABLED:'1',SUMMARY_JOB_INDEX_SHADOW_ENABLED:'1'};
  let r=await getIndexedSummaryCandidateSnapshot(env,1000);
  assert.equal(r.body.complete,false);
  await markJobBackfillComplete(db,0);
  r=await getIndexedSummaryCandidateSnapshot(env,1000);
  assert.equal(r.body.complete,true);
  assert.deepEqual(r.body.candidateDois,['10.1234/a']);
});

test('snapshot comparison requires exact counts order selected DOI and blocked policies',()=>{
  const base={complete:true,evidenceCount:2,jobCount:1,eligibleCount:2,preferredDoi:'',preferredEligible:null,
    recentPublishedCount:0,blockedPolicies:{no_external_ai:1},candidateDois:['a','b'],candidate:{doi:'a'}};
  assert.equal(compareSummaryCandidateSnapshots(base,{...base}).equivalent,true);
  assert.equal(compareSummaryCandidateSnapshots(base,{...base,candidateDois:['b','a'],candidate:{doi:'b'}}).equivalent,false);
  assert.equal(compareSummaryCandidateSnapshots(base,{...base,eligibleCount:1}).equivalent,false);
});

console.log('SUMMARY_JOB_INDEX_SHADOW_TESTS_READY');
