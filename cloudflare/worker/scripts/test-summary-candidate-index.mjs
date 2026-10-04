import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  backfillSummaryJobIndexPage,
  compareCandidateSelections,
  ensureSummaryCandidateIndexSchema,
  getSummaryCandidateIndexStatus,
  selectCandidateFromIndexedRows,
  selectSummaryCandidateFromIndex,
  shadowIndexSummaryJob,
} from '../src/summary-candidate-index.js';
import {
  ensureEvidenceIndexSchema,
  shadowIndexEvidence,
} from '../src/evidence-index.js';
import { compareSummaryReviewCandidateShadow } from '../src/summary-review.js';

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
class MemoryR2 {
  constructor(objects=[]){this.objects=[...objects].sort((a,b)=>a.key.localeCompare(b.key));}
  async list({prefix='',limit=1000,cursor='',include=[]}={}){
    const rows=this.objects.filter(row=>row.key.startsWith(prefix));
    const offset=cursor?Number(String(cursor).replace(/^c:/,'')):0;
    const slice=rows.slice(offset,offset+limit),next=offset+slice.length;
    return {
      objects:slice.map(row=>({key:row.key,size:1,customMetadata:include.includes('customMetadata')?row.customMetadata:undefined})),
      truncated:next<rows.length,
      ...(next<rows.length?{cursor:'c:'+next}:{})
    };
  }
}
const H=n=>String(n).repeat(64);
function evidenceObject(doi,n,{policy='private_cache_allowed',level='complete',capturedAt='2026-10-04T10:00:00Z'}={}){
  return {key:'private/article-evidence-v2/e'+n+'.json',customMetadata:{
    doi,evidencePacketHash:H(n),sourceHash:H((n+4)%9||9),
    evidenceLevel:level,textProcessingPolicy:policy,capturedAt,publisher:'acs',schemaVersion:'article-evidence-v2'
  }};
}
function jobObject(doi,n,{hash=H(n),state='retry_wait',capturedAt='2026-10-04T09:00:00Z',
  nextRetryAt=0,leaseExpiresAt=0,publishedAt=0,updatedAt=1000}={}){
  return {key:'private/article-summary-jobs/j'+n+'.json',customMetadata:{
    doi,evidencePacketHash:hash,sourceHash:H((n+4)%9||9),state,evidenceLevel:'complete',
    textProcessingPolicy:'private_cache_allowed',capturedAt,
    nextRetryAt:String(nextRetryAt),leaseExpiresAt:String(leaseExpiresAt),
    publishedAt:String(publishedAt),updatedAt:String(updatedAt)
  }};
}
function evidenceRowFromObject(obj){
  const m=obj.customMetadata;
  return {doi:m.doi,evidenceR2Key:obj.key,evidencePacketHash:m.evidencePacketHash,sourceHash:m.sourceHash,
    schemaVersion:m.schemaVersion,publisher:m.publisher,evidenceLevel:m.evidenceLevel,
    textProcessingPolicy:m.textProcessingPolicy,capturedAt:m.capturedAt};
}
function jobRowFromObject(obj){
  const m=obj.customMetadata;
  return {doi:m.doi,jobR2Key:obj.key,evidencePacketHash:m.evidencePacketHash,sourceHash:m.sourceHash,state:m.state,
    evidenceLevel:m.evidenceLevel,textProcessingPolicy:m.textProcessingPolicy,capturedAt:m.capturedAt,
    nextRetryAt:Number(m.nextRetryAt),leaseExpiresAt:Number(m.leaseExpiresAt),
    publishedAt:Number(m.publishedAt),updatedAt:Number(m.updatedAt)};
}
async function markBackfillsComplete(db){
  const now=Date.now();
  await db.prepare(`INSERT INTO article_evidence_index_backfill
    (id,cursor,complete,scanned_objects,indexed_rows,skipped_invalid,started_at,updated_at,last_error)
    VALUES (1,NULL,1,0,0,0,?,?, '')`).bind(now,now).run();
  await db.prepare(`INSERT INTO summary_review_job_index_backfill
    (id,cursor,complete,scanned_objects,indexed_rows,skipped_invalid,started_at,updated_at,last_error)
    VALUES (1,NULL,1,0,0,0,?,?, '')`).bind(now,now).run();
}
async function indexedEnv(objects,{allowUnknown=false}={}){
  const db=new SqliteD1();
  const env={DB:db,MEDIA:new MemoryR2(objects),EVIDENCE_INDEX_SHADOW_ENABLED:'1',
    SUMMARY_CANDIDATE_INDEX_SHADOW_ENABLED:'1',SUMMARY_ALLOW_UNKNOWN_POLICY:allowUnknown?'1':'0'};
  await ensureEvidenceIndexSchema(env);
  await ensureSummaryCandidateIndexSchema(env);
  for(const object of objects){
    if(object.key.startsWith('private/article-evidence-v2/')) await shadowIndexEvidence(env,evidenceRowFromObject(object));
    if(object.key.startsWith('private/article-summary-jobs/')) {
      const row=jobRowFromObject(object);
      await shadowIndexSummaryJob(env,{
        doi:row.doi,evidencePacketHash:row.evidencePacketHash,sourceHash:row.sourceHash,state:row.state,
        evidenceLevel:row.evidenceLevel,textProcessingPolicy:row.textProcessingPolicy,capturedAt:row.capturedAt,
        nextRetryAt:row.nextRetryAt,leaseExpiresAt:row.leaseExpiresAt,publishedAt:row.publishedAt,updatedAt:row.updatedAt,
      },row.jobR2Key);
    }
  }
  await markBackfillsComplete(db);
  return env;
}

test('candidate shadow is disabled by default and has no D1 requirement',async()=>{
  const result=await shadowIndexSummaryJob({}, {doi:'10.1234/x'}, 'private/article-summary-jobs/x.json');
  assert.deepEqual(result,{enabled:false,indexed:false});
  const status=await getSummaryCandidateIndexStatus({});
  assert.equal(status.status,200);assert.equal(status.body.enabled,false);assert.equal(status.body.readPathActive,false);
});

test('job dual-write refuses stale older metadata from replacing current state',async t=>{
  const db=new SqliteD1();t.after(()=>db.close());
  const env={DB:db,SUMMARY_CANDIDATE_INDEX_SHADOW_ENABLED:'1'};
  const current={doi:'10.1234/job',evidencePacketHash:H(1),sourceHash:H(5),state:'published',
    evidenceLevel:'complete',textProcessingPolicy:'private_cache_allowed',capturedAt:'2026-10-04T10:00:00Z',
    nextRetryAt:0,leaseExpiresAt:0,publishedAt:2000,updatedAt:2000};
  assert.equal((await shadowIndexSummaryJob(env,current,'private/article-summary-jobs/current.json')).indexed,true);
  const stale={...current,state:'processing',publishedAt:0,updatedAt:1000};
  assert.equal((await shadowIndexSummaryJob(env,stale,'private/article-summary-jobs/stale.json')).indexed,false);
  const row=await db.prepare('SELECT state,published_at,updated_at,job_r2_key FROM summary_review_job_index WHERE doi=?').bind(current.doi).first();
  assert.equal(row.state,'published');assert.equal(row.published_at,2000);assert.equal(row.updated_at,2000);
  assert.equal(row.job_r2_key,'private/article-summary-jobs/current.json');
});

test('summary job backfill uses persisted cursor without fixed page ceiling',async t=>{
  const db=new SqliteD1();t.after(()=>db.close());
  const objects=[
    jobObject('10.1234/j1',1),jobObject('10.1234/j2',2),
    {key:'private/article-summary-jobs/bad.json',customMetadata:{doi:'bad'}},
    jobObject('10.1234/j3',3),jobObject('10.1234/j4',4),
  ];
  const env={DB:db,MEDIA:new MemoryR2(objects),SUMMARY_CANDIDATE_INDEX_SHADOW_ENABLED:'1'};
  let page=await backfillSummaryJobIndexPage(env,2);
  assert.equal(page.body.complete,false);assert.equal(page.body.scannedObjects,2);
  page=await backfillSummaryJobIndexPage(env,2);
  assert.equal(page.body.complete,false);assert.equal(page.body.scannedObjects,4);
  page=await backfillSummaryJobIndexPage(env,2);
  assert.equal(page.body.complete,true);assert.equal(page.body.scannedObjects,5);
  assert.equal(page.body.indexedRows,4);assert.equal(page.body.skippedInvalid,1);
  const status=await getSummaryCandidateIndexStatus(env);
  assert.equal(status.body.jobCount,4);assert.equal(status.body.backfill.complete,true);
});

test('indexed selector refuses comparison until both Evidence and job backfills are complete',async t=>{
  const db=new SqliteD1();t.after(()=>db.close());
  const env={DB:db,SUMMARY_CANDIDATE_INDEX_SHADOW_ENABLED:'1'};
  await ensureEvidenceIndexSchema(env);await ensureSummaryCandidateIndexSchema(env);
  let result=await selectSummaryCandidateFromIndex(env,1000,'');
  assert.equal(result.status,409);assert.equal(result.body.error,'summary_candidate_index_backfill_incomplete');
  assert.equal(result.body.evidenceBackfillComplete,false);assert.equal(result.body.jobBackfillComplete,false);
});

test('pure indexed selector reproduces policy, state, lease, retry and ordering semantics',()=>{
  const now=Date.parse('2026-10-04T12:00:00Z');
  const evidenceRows=[
    {doi:'10.1234/a',evidence_r2_key:'private/article-evidence-v2/a.json',evidence_packet_hash:H(1),source_hash:H(5),
      evidence_level:'complete',text_processing_policy:'private_cache_allowed',captured_at:'2026-10-04T11:00:00Z'},
    {doi:'10.1234/b',evidence_r2_key:'private/article-evidence-v2/b.json',evidence_packet_hash:H(2),source_hash:H(6),
      evidence_level:'complete',text_processing_policy:'no_external_ai',captured_at:'2026-10-04T11:30:00Z'},
    {doi:'10.1234/c',evidence_r2_key:'private/article-evidence-v2/c.json',evidence_packet_hash:H(3),source_hash:H(7),
      evidence_level:'partial',text_processing_policy:'private_cache_allowed',captured_at:'2026-10-04T10:30:00Z'},
    {doi:'10.1234/d',evidence_r2_key:'private/article-evidence-v2/d.json',evidence_packet_hash:H(4),source_hash:H(8),
      evidence_level:'abstract_only',text_processing_policy:'private_cache_allowed',captured_at:'2026-10-04T09:00:00Z'},
  ];
  const jobs=[
    {doi:'10.1234/a',job_r2_key:'private/article-summary-jobs/a-old.json',evidence_packet_hash:H(9),state:'published',published_at:now-1000},
    {doi:'10.1234/c',job_r2_key:'private/article-summary-jobs/c.json',evidence_packet_hash:H(3),state:'retry_wait',next_retry_at:now+60000,published_at:0},
  ];
  const s=selectCandidateFromIndexedRows({evidenceRows,jobRows:jobs,now});
  assert.equal(s.candidate.doi,'10.1234/a');
  assert.equal(s.candidate.existingJobKey,'private/article-summary-jobs/a-old.json');
  assert.equal(s.eligibleCount,2);assert.equal(s.recentPublishedCount,1);
  assert.deepEqual(s.blockedPolicies,{no_external_ai:1});
  const preferred=selectCandidateFromIndexedRows({evidenceRows,jobRows:jobs,now,preferredDoi:'10.1234/d'});
  assert.equal(preferred.candidate.doi,'10.1234/d');assert.equal(preferred.preferredEligible,true);
});

test('real legacy R2 selector and indexed D1 selector compare equal on the same metadata snapshot',async t=>{
  const now=Date.parse('2026-10-04T12:00:00Z');
  const objects=[
    evidenceObject('10.1234/a',1,{capturedAt:'2026-10-04T11:00:00Z'}),
    evidenceObject('10.1234/b',2,{policy:'no_external_ai',capturedAt:'2026-10-04T11:30:00Z'}),
    evidenceObject('10.1234/c',3,{level:'partial',capturedAt:'2026-10-04T10:30:00Z'}),
    evidenceObject('10.1234/d',4,{level:'abstract_only',capturedAt:'2026-10-04T09:00:00Z'}),
    jobObject('10.1234/a',9,{hash:H(9),state:'published',publishedAt:now-1000,updatedAt:now-1000}),
    jobObject('10.1234/c',3,{hash:H(3),state:'retry_wait',nextRetryAt:now+60000,updatedAt:now-1000}),
  ];
  const env=await indexedEnv(objects);t.after(()=>env.DB.close());
  const result=await compareSummaryReviewCandidateShadow(env,{now});
  assert.equal(result.status,200);assert.equal(result.body.readPathActive,false);assert.equal(result.body.comparable,true);assert.equal(result.body.same,true);
  assert.equal(result.body.legacy.candidate.doi,'10.1234/a');
  assert.deepEqual(result.body.legacy,result.body.indexed);
});

test('comparison detects a divergent job index instead of hiding it',()=>{
  const legacy={candidate:{doi:'10.1234/a',evidenceKey:'x',evidencePacketHash:H(1),sourceHash:H(5),evidenceLevel:'complete',
    textProcessingPolicy:'private_cache_allowed',capturedAt:'x',existingJobKey:''},evidenceCount:1,jobCount:0,eligibleCount:1,
    preferredDoi:'',preferredEligible:null,recentPublishedCount:0,blockedPolicies:{}};
  const indexed={...legacy,eligibleCount:0,candidate:null};
  const result=compareCandidateSelections(legacy,indexed);
  assert.equal(result.same,false);assert.equal(result.legacy.eligibleCount,1);assert.equal(result.indexed.eligibleCount,0);
});

test('production review selector remains legacy R2 path in D2b1 foundation',()=>{
  const source=readFileSync('src/summary-review.js','utf8');
  const start=source.indexOf('export async function runSummaryReviewOnce');
  const end=source.indexOf('export async function getSummaryReviewStatus',start);
  assert.ok(start>0&&end>start);
  const block=source.slice(start,end);
  assert.ok(block.includes('selectReviewCandidate(env'));
  assert.ok(!block.includes('selectSummaryCandidateFromIndex'));
  assert.ok(source.includes("mode: 'shadow_comparison'"));
});

console.log('SUMMARY_CANDIDATE_INDEX_TESTS_READY');


test('source race is reported as incomparable rather than D1 divergence',async t=>{
  const evidence=evidenceObject('10.1234/race',1,{capturedAt:'2026-10-04T11:00:00Z'});
  const env=await indexedEnv([evidence]);t.after(()=>env.DB.close());
  let jobLists=0;
  env.MEDIA={
    async list({prefix='',include=[]}={}){
      if(prefix==='private/article-evidence-v2/') return {objects:[{key:evidence.key,customMetadata:evidence.customMetadata}],truncated:false};
      if(prefix==='private/article-summary-jobs/'){
        jobLists++;
        if(jobLists===1) return {objects:[],truncated:false};
        return {objects:[{
          key:'private/article-summary-jobs/race.json',
          customMetadata:{
            doi:'10.1234/race',evidencePacketHash:H(1),sourceHash:H(5),state:'published',
            evidenceLevel:'complete',textProcessingPolicy:'private_cache_allowed',
            capturedAt:'2026-10-04T11:00:00Z',publishedAt:String(Date.parse('2026-10-04T11:30:00Z')),
            nextRetryAt:'0',leaseExpiresAt:'0',updatedAt:String(Date.parse('2026-10-04T11:30:00Z'))
          }
        }],truncated:false};
      }
      return {objects:[],truncated:false};
    }
  };
  const result=await compareSummaryReviewCandidateShadow(env,{now:Date.parse('2026-10-04T12:00:00Z')});
  assert.equal(result.status,200);
  assert.equal(result.body.comparable,false);
  assert.equal(result.body.sourceStable,false);
  assert.equal(result.body.same,false);
  assert.equal(result.body.reason,'legacy_source_changed_during_comparison');
});
