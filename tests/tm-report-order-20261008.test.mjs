import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';
import {
  tmReportEventId, tmReportDeliveryKey, tmUniqueReportHistory,
  tmEffectiveReport, tmProjectReportItem,
} from '../cloudflare/worker/src/tm-report-order.js';
import { importTampermonkeyReport, getTampermonkeyReports } from '../cloudflare/worker/src/local-captures.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const doi = '10.1021/acs.joc.6c01708';
const job = 'e64003c3-dc08-4713-84e0-8aae636dd4b2';
const newer = 'ff4003c3-dc08-4713-84e0-8aae636dd4b2';
const started = '2026-10-08T08:28:27.490Z';
function data(overrides={}) {
  return {
    doi, jobId:job, controllerRevision:'2.2.41', captureVersion:'6.2.20',
    final:true, status:'failed', reason:'publisher_access_gate',
    publisher:'acs', tocStatus:'pending', mediaNeed:'toc+figures',
    startedAt:started, finishedAt:'2026-10-08T08:28:45.416Z',
    trace:[{stage:'diagnostic_context',
      message:JSON.stringify({eventId:job+':final:1',jobId:job})}],
    ...overrides,
  };
}
function summary(report, updatedAt, reportKey) {
  return {
    ...report, reportKey, attemptId:String(updatedAt), updatedAt,
    deliveryEventId: tmReportEventId(report),
  };
}
function createStore(initialIndex=null) {
  const objects = new Map();
  if(initialIndex)objects.set('local-captures/tampermonkey/report-index.json',JSON.stringify(initialIndex));
  const metrics={writes:0};
  const env={MEDIA:{
    async get(key){return objects.has(key)?{text:async()=>objects.get(key)}:null;},
    async put(key,value){metrics.writes++;objects.set(key,String(value));},
  }};
  return {env,objects,metrics};
}
function request(url='https://api.gczhouwld.com/api/media/tampermonkey-reports') {
  return {url};
}
test('historical repeated final event is one delivery, old duplicate stays available only in raw saved objects',()=>{
  const final=summary(data(),100,'r/final');
  const repeated=summary(data(),120,'r/replayed');
  const checkpoint=summary(data({final:false,status:'progress',trace:[{stage:'diagnostic_context',message:JSON.stringify({eventId:job+':checkpoint:8'})}]}),160,'r/progress');
  assert.equal(tmReportEventId(data()),job+':final:1');
  assert.equal(tmReportDeliveryKey(final),tmReportDeliveryKey(repeated));
  assert.notEqual(tmReportDeliveryKey(checkpoint),tmReportDeliveryKey(final));
  const row={...checkpoint,attempts:[checkpoint,repeated,final]};
  assert.equal(tmUniqueReportHistory(row).length,2);
  assert.equal(tmEffectiveReport(row).reportKey,'r/replayed');
  assert.equal(tmProjectReportItem(row).status,'failed');
});
test('same-job final stays authoritative when post-final progress arrives late, but a new job may be active',()=>{
  const final=summary(data(),100,'final');
  const late=summary(data({final:false,status:'progress',tocStatus:'stored',
    trace:[{stage:'diagnostic_context',message:JSON.stringify({eventId:job+':checkpoint:8'})}]}),300,'late');
  assert.equal(tmEffectiveReport({attempts:[late,final]}).status,'failed');
  const laterJob=summary(data({jobId:newer,startedAt:'2026-10-08T09:20:00Z',final:false,status:'progress',
    trace:[{stage:'diagnostic_context',message:JSON.stringify({eventId:newer+':checkpoint:1'})}]}),350,'newer');
  assert.equal(tmEffectiveReport({attempts:[final,late,laterJob]}).reportKey,'newer');
});
test('terminal report deduplicates with old reports missing eventId by job ID',()=>{
  const old={...summary(data(),100,'legacy/final'),deliveryEventId:''};
  delete old.trace;
  assert.equal(tmReportDeliveryKey(old),tmReportDeliveryKey(data()));
  assert.equal(tmUniqueReportHistory({attempts:[old,summary(data(),200,'new/final')]}).length,1);
});
test('DOI mismatch in diagnostic eventId never deduplicates a different publisher job',()=>{
  const x=data({trace:[{stage:'diagnostic_context',message:JSON.stringify({eventId:newer+':final:1'})}]});
  assert.equal(tmReportEventId(x),'');
});
test('R2 ingestion: same terminal report twice produces one object, no extra failed visits',async()=>{
  const {env,objects,metrics}=createStore();
  const first=await importTampermonkeyReport(null,env,data());
  assert.equal(first.status,200);assert.equal(first.body.stored,true);
  const before=metrics.writes;
  const again=await importTampermonkeyReport(null,env,data());
  assert.equal(again.status,200);assert.equal(again.body.duplicate,true);
  assert.equal(metrics.writes,before);
  const raw=JSON.parse(objects.get('local-captures/tampermonkey/report-index.json'));
  assert.equal(raw.items[doi].attemptCount,1);
  assert.equal(raw.items[doi].failureCount,1);
  assert.equal(raw.items[doi].attempts.length,1);
  assert.equal(raw.items[doi].status,'failed');
});
test('R2 ingestion: a new delayed checkpoint from same job stays in history, final remains selected',async()=>{
  const {env,objects}=createStore();
  await importTampermonkeyReport(null,env,data());
  const cp=data({final:false,status:'progress',tocStatus:'stored',
    trace:[{stage:'diagnostic_context',message:JSON.stringify({eventId:job+':checkpoint:8'})}]});
  const result=await importTampermonkeyReport(null,env,cp);
  assert.equal(result.status,200);
  const raw=JSON.parse(objects.get('local-captures/tampermonkey/report-index.json'));
  assert.equal(raw.items[doi].status,'failed');
  assert.equal(raw.items[doi].tocStatus,'pending');
  assert.equal(raw.items[doi].attemptCount,1);
  assert.equal(raw.items[doi].attempts.length,2);
  const got=await getTampermonkeyReports(request(request().url+'?doi='+encodeURIComponent(doi)+'&history=1'),env);
  assert.equal(got.status,200);
  assert.equal(got.body.latest.status,'failed');
  assert.equal(got.body.attempts.length,2);
});
test('read-time projection corrects existing persisted index with late progress and duplicate finals',async()=>{
  const original=data();
  const final=summary(original,100,'legacy/final');
  const replay=summary(original,130,'legacy/replayed');
  const late=summary(data({final:false,status:'progress',tocStatus:'stored',
    trace:[{stage:'diagnostic_context',message:JSON.stringify({eventId:job+':checkpoint:8'})}]}),180,'legacy/progress');
  const index={version:2,updatedAt:180,items:{[doi]:{...late,attemptCount:3,attempts:[late,replay,final]}}};
  const {env,objects,metrics}=createStore(index);
  for(const row of [final,replay,late])objects.set(row.reportKey,JSON.stringify(row));
  const got=await getTampermonkeyReports(request(request().url+'?doi='+encodeURIComponent(doi)+'&history=1'),env);
  assert.equal(got.body.latest.status,'failed');
  assert.equal(got.body.latest.final,true);
  assert.equal(got.body.attempts.length,2);
  const overview=await getTampermonkeyReports(request(),env);
  assert.equal(overview.body.items[0].status,'failed');
  assert.equal(metrics.writes,0,'read-only reconciliation must not mutate historical R2');
});

test('terminal report survives more than twelve distinct late checkpoints',()=>{
  const terminal=summary(data(),100,'final-job');
  const checkpoints=Array.from({length:25},(_,i)=>summary(
    data({final:false,status:'progress',tocStatus:'stored',
      trace:[{stage:'diagnostic_context',message:JSON.stringify({eventId:job+':checkpoint:'+i})}]}),
    101+i,'checkpoint-'+i));
  const history=tmUniqueReportHistory({attempts:[...checkpoints,terminal]},12);
  assert.equal(history.length,12);
  assert.ok(history.some(item=>item.final===true),'terminal cannot be evicted by progress retries');
  assert.equal(tmEffectiveReport({attempts:history}).status,'failed');
});
