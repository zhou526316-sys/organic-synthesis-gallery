import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
const start=source.indexOf('  function completedPublisherResult(');
const end=source.indexOf('\n\n  function clearOwnedJob(',start);
assert.ok(start>0&&end>start,'tm227 waitForResult block missing');
const moduleSource=source.slice(start,end);
let passed=0;

function harness(options={}){
  const store=new Map();let now=1800000000000,sleeps=0;
  class Clock extends Date {static now(){return now;}}
  const job={doi:'10.1021/acs.orglett.6c03389',jobId:'6190706a-3356-45ac-86ef-2add950ef799'};
  const resultKey=doi=>'p:result:'+doi;
  const env={
    Date:Clock,VERSION:'6.2.20',
    GM_getValue:(k,d)=>store.has(k)?structuredClone(store.get(k)):d,
    GM_setValue:(k,v)=>store.set(k,structuredClone(v)),
    resultKey,renewLease:()=>true,isAbortRequested:()=>false,ENABLED_KEY:'enabled',
    currentPublisherHeartbeat:()=>options.heartbeat===false?null:{jobId:job.jobId},
    progressKey:doi=>'p:progress:'+doi,badge:()=>{},
    nowIso:()=>new Date(now).toISOString(),
    sleep:async ms=>{
      sleeps+=1;
      if(options.onSleep)await options.onSleep({ms,sleeps,store,job,resultKey,advance:x=>{now+=x;}});
      else now+=ms;
    }
  };
  store.set('enabled',true);
  const ctx=vm.createContext(env);vm.runInContext(moduleSource,ctx);
  const api=vm.runInContext('({completedPublisherResult,waitForResult})',ctx);
  return {api,store,job,resultKey,advance:ms=>{now+=ms;},now:()=>now,sleeps:()=>sleeps};
}
async function test(name,fn){await fn();passed++;console.log('TM227_RESULT_PRECEDENCE_PASS '+name);}

await test('publisher final survives a browser sleep that jumps beyond controller timeout',async()=>{
  const h=harness({onSleep:async({sleeps,store,job,resultKey,advance})=>{
    if(sleeps===1){
      store.set(resultKey(job.doi),{doi:job.doi,jobId:job.jobId,version:'6.2.20',status:'partial',reason:'paired_capture;toc=already_available;figures=4/5;published=0',finishedAt:'2026-09-23T15:01:57.131Z'});
      advance(13*60*1000);
    } else advance(250);
  }});
  const result=await h.api.waitForResult(h.job,{});
  assert.equal(result.status,'partial');assert.match(result.reason,/figures=4\/5/);assert.ok(h.sleeps()>=1);
});

await test('existing final is returned before timeout evaluation',async()=>{
  const h=harness();h.store.set(h.resultKey(h.job.doi),{doi:h.job.doi,jobId:h.job.jobId,version:'6.2.20',status:'success',finishedAt:'done'});
  h.advance(20*60*1000);
  const result=await h.api.waitForResult(h.job,{});
  assert.equal(result.status,'success');assert.equal(h.sleeps(),0);
});

await test('foreign or stale final never masks a real timeout',async()=>{
  const h=harness({onSleep:async({sleeps,store,job,resultKey,advance})=>{
    if(sleeps===1){store.set(resultKey(job.doi),{doi:job.doi,jobId:'other-job',version:'6.2.20',status:'success',finishedAt:'done'});advance(9*60*1000);}
    else advance(250);
  }});
  const result=await h.api.waitForResult(h.job,{});
  assert.equal(result.reason,'controller_timeout');assert.ok(h.sleeps()>=5);
});

await test('capture-protocol mismatch final never masks timeout',async()=>{
  const h=harness({onSleep:async({sleeps,store,job,resultKey,advance})=>{
    if(sleeps===1){store.set(resultKey(job.doi),{doi:job.doi,jobId:job.jobId,version:'6.2.19',status:'success',finishedAt:'done'});advance(9*60*1000);}
    else advance(250);
  }});
  const result=await h.api.waitForResult(h.job,{});
  assert.equal(result.reason,'controller_timeout');
});

await test('heartbeat loss rechecks publisher final before declaring startup failure',async()=>{
  const h=harness({heartbeat:false,onSleep:async({sleeps,store,job,resultKey,advance})=>{
    if(sleeps===1){advance(61000);store.set(resultKey(job.doi),{doi:job.doi,jobId:job.jobId,version:'6.2.20',status:'failed',reason:'paired_capture;toc=not_found;figures=0/0;published=0',finishedAt:'done'});}
    else advance(250);
  }});
  const result=await h.api.waitForResult(h.job,{});
  assert.match(result.reason,/paired_capture/);
});

await test('controller revision changes without capture-protocol migration',()=>{
  assert.ok(source.includes("var VERSION = '6.2.20';"));
  assert.ok(source.includes("var CONTROLLER_REVISION = '2.2.31';"));
});

console.log('TM227_RESULT_PRECEDENCE_TEST_SUMMARY '+JSON.stringify({passed,productionWrites:0,publisherRequests:0}));
