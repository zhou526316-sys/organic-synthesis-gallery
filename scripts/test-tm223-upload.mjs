import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
const start=source.indexOf('  // BEGIN OSG_UPLOAD_EVIDENCE_V1'),end=source.indexOf('  // END OSG_UPLOAD_EVIDENCE_V1');
assert.ok(start>=0&&end>start);
let passed=0;
async function test(name,fn){await fn();passed++;console.log('TM223_UPLOAD_PASS '+name);}
function harness(options={}){
 const calls=[],waits=[],events=[];let attempt=0,guards=0;
 const env={AbortController,Date,setTimeout,clearTimeout,console,autoReportText:x=>String(x||'').replace(/Bearer\s+\S+|token=\S+/gi,'[redacted]'),
  headerValue:(s,h)=>String(s||'').split(/\r?\n/).map(x=>x.split(':')).find(x=>x[0].toLowerCase()===h)?.slice(1).join(':').trim()||'',
  sleep:async ms=>{waits.push(ms);if(options.stopAfterWait)env.stopped=true;},captureLiveUpdate:()=>{},pushTrace:(_t,e)=>events.push(e),
  assertBoundCaptureJob:()=>{guards++;if(env.stopped)throw Error('capture_job_stale_or_unbound');return '10.1021/test.a';},
  gmRequest:async req=>{calls.push(req);attempt++;return options.send?options.send(attempt,req):{status:200,responseText:'{"stored":true}'};},
  fetch:async()=>{throw Error('Unexpected fetch: no fallback needed for an actual HTTP response');}};
 const ctx=vm.createContext(env);vm.runInContext(source.slice(start,end),ctx);
 const api=vm.runInContext('({postAcquiredImage,uploadResponseError,retryableImageUpload,postJson})',ctx);
 const job={doi:'10.1021/test.a',jobId:'kept',captureDeadline:Date.now()+60000};const payload={doi:job.doi,id:'figure-1',label:'Figure 1',imageData:'PRIVATE_IMAGE_BYTES'};
 return {api,calls,waits,events,job,payload,run:()=>api.postAcquiredImage(job,{url:'https://cdn.test/image.svg'},{byteLength:500},[], 'https://worker.test/api/article-figures/stage',payload,'SECRET_TOKEN','figure_stage')};
}
await test('503 then success posts identical acquired bytes without publisher downloads',async()=>{const h=harness({send:n=>n===1?{status:503,responseText:'<html>temporarily unavailable PRIVATE_RAW_BODY</html>',responseHeaders:'Content-Type: text/html\nCF-RAY: abcdef-SJC'}:{status:200,responseText:'{"stored":true}'}});assert.equal((await h.run()).stored,true);assert.equal(h.calls.length,2);assert.equal(h.calls[0].data,h.calls[1].data);assert.deepEqual(h.waits,[1500]);assert.ok(h.events.some(e=>e.event==='upload_retry_wait'));assert.ok(!JSON.stringify(h.events).includes('PRIVATE_RAW_BODY'));assert.ok(!JSON.stringify(h.events).includes('SECRET_TOKEN'));assert.ok(!JSON.stringify(h.events).includes('PRIVATE_IMAGE_BYTES'));});
await test('three total attempts bound permanent 503 failure',async()=>{const h=harness({send:()=>({status:503,responseText:'',responseHeaders:'content-type:text/html'})});await assert.rejects(h.run,/upload_http_503/);assert.equal(h.calls.length,3);assert.deepEqual(h.waits,[1500,3000]);});
await test('server retry-after is respected',async()=>{const h=harness({send:n=>n===1?{status:429,responseText:'{}',responseHeaders:'Retry-After: 5'}:{status:200,responseText:'{}'}});await h.run();assert.deepEqual(h.waits,[5000]);});
await test('long retry-after is deferred rather than violated',async()=>{const h=harness({send:()=>({status:429,responseText:'{}',responseHeaders:'Retry-After: 120'})});await assert.rejects(h.run,/429/);assert.equal(h.calls.length,1);assert.equal(h.waits.length,0);});
await test('identity conflict is never retried',async()=>{const h=harness({send:()=>({status:409,responseText:'{"code":"media_source_doi_mismatch"}'})});await assert.rejects(h.run,/doi_mismatch/);assert.equal(h.calls.length,1);});
await test('unauthorized request is not hammered',async()=>{const h=harness({send:()=>({status:401,responseText:'{"error":"unauthorized"}'})});await assert.rejects(h.run,/unauthorized/);assert.equal(h.calls.length,1);});
await test('server integrity failure retryable=false remains stopped',async()=>{const h=harness({send:()=>({status:500,responseText:'{"code":"stage_storage_index_invalid","retryable":false}'})});await assert.rejects(h.run,/index_invalid/);assert.equal(h.calls.length,1);});
await test('closing or losing current job aborts a pending retry',async()=>{const h=harness({stopAfterWait:true,send:()=>({status:503,responseText:'{}'})});await assert.rejects(h.run,/stale_or_unbound/);assert.equal(h.calls.length,1);});
await test('explicit extension denial is not routed around or retried',async()=>{const h=harness({send:()=>{throw Error('Request was blocked by the user');}});await assert.rejects(h.run,/blocked by the user/);assert.equal(h.calls.length,1);});
await test('structured response separates actual Worker code and edge trace identity',async()=>{const h=harness();const e=h.api.uploadResponseError(503,{code:'stage_storage_index_write_service_unavailable',requestId:'abcd-1234',operation:'index_write',objectStored:true,retryable:true},'{}',k=>({'cf-ray':'a1b2-SJC','content-type':'application/json','retry-after':'5'}[k]||''),'gm_request');assert.equal(e.uploadEvidence.objectStored,true);assert.equal(e.uploadEvidence.storageOperation,'index_write');assert.equal(e.uploadEvidence.workerRequestId,'abcd-1234');assert.equal(e.uploadEvidence.cfRay,'a1b2-SJC');assert.equal(e.retryAfterMs,5000);});
await test('raw HTML without code is marked unknown, not invented R2 quota error',async()=>{const h=harness();const e=h.api.uploadResponseError(503,{},'<html>cookie=PRIVATE</html>',()=>'', 'gm_request');assert.equal(e.uploadEvidence.workerCode,null);assert.equal(e.uploadEvidence.responseFormat,'markup');assert.ok(!e.message.includes('PRIVATE'));assert.match(e.message,/response_without_worker_error_code/);});
await test('capture deadline prevents retry running beyond owned task',async()=>{const h=harness({send:()=>({status:503,responseText:'{}'})});h.job.captureDeadline=Date.now()+1000;await assert.rejects(h.run,/503/);assert.equal(h.calls.length,1);});
console.log('TM223_UPLOAD_TEST_SUMMARY '+JSON.stringify({passed,productionWrites:0,publisherDownloads:0}));
