import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';

// Real userscript functions, virtual clock and local-only transport adapters.
// This test never contacts a publisher or the production API.
const sourcePath=process.env.TM_SOURCE_FILE||'public/toc-mainline.user.js';
const source=fs.readFileSync(sourcePath,'utf8');
const cut=source.lastIndexOf('  installPrivatePdfLeaseReceiver();');
assert.ok(cut>0,'userscript bootstrap boundary exists');
assert.match(source,/function privatePdfUploadRequest\(/,'new transport helper exists');
const P='osg-toc-v6:';
const TOKEN='FIXTURE_ONLY_PRIVATE_TOKEN_'+ 'x'.repeat(48);
let passed=0;
function defer(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function flush(){for(let i=0;i<20;i++)await Promise.resolve();}
function observe(promise){const state={done:false};state.promise=promise.then(value=>{Object.assign(state,{done:true,value});},error=>{Object.assign(state,{done:true,error});});return state;}
function clock(){
  let now=1791388800000,id=0;const tasks=new Map();
  function set(fn,ms,repeat){const n=++id;tasks.set(n,{fn,at:now+Math.max(1,Number(ms)||0),ms:Math.max(1,Number(ms)||0),repeat});return n;}
  return {get now(){return now;},tasks,setTimeout:(fn,ms)=>set(fn,ms,false),setInterval:(fn,ms)=>set(fn,ms,true),clear:id=>tasks.delete(id),
    async advance(ms){const end=now+ms;let count=0;await flush();
      while(true){let next=null;for(const [id,t] of tasks)if(t.at<=end&&(!next||t.at<next[1].at))next=[id,t];if(!next)break;
        assert.ok(++count<10000,'virtual timer loop bounded');const [id,t]=next;now=t.at;if(t.repeat)t.at+=t.ms;else tasks.delete(id);t.fn();await flush();}
      now=end;await flush();
    }};
}
function harness(opt={}){
  const time=clock(),store=new Map(),gm=[],native=[],downloads=[],live=[],reports=[],trace=[],session=new Map();
  const clone=x=>x===undefined?x:structuredClone(x),put=(k,v)=>store.set(k,clone(v));
  class D extends Date{constructor(...a){super(...(a.length?a:[time.now]));}static now(){return time.now;}}
  const doi='10.1039/d6gc99999x',job={doi,jobId:'pdf-job-1',manualRunId:'pdf-run-1',publisher:'rsc',captureVersion:'6.2.20',capturePrivatePdf:true,missingOnly:true,addedDate:'2026-10-07',captureDeadline:time.now+360000};
  const candidates=[{url:'https://pubs.rsc.org/fixture-first.pdf'},{url:'https://pubs.rsc.org/fixture-second.pdf'}];
  function pdf(candidate){return {buffer:new ArrayBuffer(2048),byteLength:2048,sourceUrl:candidate.url,transport:'gm'};}
  const env={Date:D,URL,URLSearchParams,Set,Map,ArrayBuffer,Uint8Array,AbortController,DOMException,crypto:{randomUUID},
    console:{debug(){},log(){},warn(){},error(){}},location:{href:'https://pubs.rsc.org/en/content/articlehtml/2026/gc/d6gc99999x',hostname:'pubs.rsc.org',origin:'https://pubs.rsc.org',pathname:'/en/content/articlehtml/2026/gc/d6gc99999x',hash:''},
    window:{addEventListener(){},removeEventListener(){},postMessage(){},open(){throw Error('unexpected window.open');}},document:{querySelectorAll:()=>[]},
    sessionStorage:{getItem:k=>session.get(k)||'',setItem:(k,v)=>session.set(k,String(v)),removeItem:k=>session.delete(k)},
    setTimeout:time.setTimeout,clearTimeout:time.clear,setInterval:time.setInterval,clearInterval:time.clear,
    GM_getValue:(k,d)=>store.has(k)?clone(store.get(k)):d,GM_setValue:put,GM_deleteValue:k=>store.delete(k),GM_listValues:()=>[...store.keys()],GM_registerMenuCommand(){},
    GM_openInTab(){throw Error('unexpected real page launch');},
    GM_xmlhttpRequest(options){
      const call={options,at:time.now,aborts:0,timer:null};gm.push(call);
      call.timer=time.setTimeout(()=>options.ontimeout?.(),options.timeout);
      call.respond=(status=200,body=receipt())=>{time.clear(call.timer);options.onload({status,responseText:JSON.stringify(body),responseHeaders:'content-type: application/json',finalUrl:options.url});};
      const handle={abort(){call.aborts++;time.clear(call.timer);options.onabort?.();}};
      opt.gmStart?.(call);return handle;
    },
    fetch(url,init){
      const gate=defer(),call={url,init,at:time.now,aborts:0,gate};native.push(call);
      const abort=()=>{call.aborts++;gate.reject(new DOMException('fixture abort','AbortError'));};
      if(init.signal.aborted)abort();else init.signal.addEventListener('abort',abort,{once:true});
      call.respond=(status=200,body=receipt())=>gate.resolve({status,statusText:String(status),url,text:async()=>JSON.stringify(body),headers:{forEach(fn){fn('application/json','content-type');}}});
      return gate.promise;
    },
    __pageDoi:doi,__live:(...a)=>live.push(a),__report:(...a)=>reports.push(a),
    __candidates:async()=>opt.candidates?opt.candidates():candidates,
    __download:async(j,c)=>{downloads.push(c.url);return opt.download?opt.download(j,c,downloads.length,pdf):pdf(c);},
  };
  const context=vm.createContext(env);
  vm.runInContext(source.slice(0,cut)+`
    publisherPageDois=()=>[__pageDoi];captureLiveUpdate=__live;captureDiagnosticEvent=()=>{};enqueueCaptureReport=__report;
    waitForPrivatePdfCandidates=__candidates;fetchExplicitPdf=__download;
    globalThis.T={privatePdfUploadRequest,uploadPrivatePdf,maybeCapturePrivatePdf,finishPairedJob,nativeControllerRequest,currentCaptureJob,assertBoundCaptureJob,
      setPdfCapture:fn=>{maybeCapturePrivatePdf=fn;},VERSION,PRIVATE_PDF_CAPTURE_ENDPOINT,PRIVATE_PDF_LEASE_KEY,PRIVATE_PDF_ATTEMPT_PREFIX,resultKey,traceKey};
  })();`,context,{filename:sourcePath});
  const T=context.T;job.captureVersion=T.VERSION;put(P+'active-job',job);put(P+'manual-from-head-v3',{id:job.manualRunId});put(P+'enabled',true);
  const lease={token:TOKEN,scope:'private_pdf_capture',expiresAt:time.now+3600000};put(T.PRIVATE_PDF_LEASE_KEY,lease);session.set(P+'tab-job-binding',job.jobId);
  function receipt(extra={}){return {stored:true,doi,contentHash:'a'.repeat(64),documentId:'fixture-document',byteLength:2048,active:true,...extra};}
  function options(extra={}){return {method:'POST',url:T.PRIVATE_PDF_CAPTURE_ENDPOINT+'?doi='+encodeURIComponent(doi),headers:{'content-type':'application/pdf',authorization:'Bearer '+TOKEN},data:new ArrayBuffer(2048),...extra};}
  const attempt=T.PRIVATE_PDF_ATTEMPT_PREFIX+doi;
  function revoke(){put(P+'manual-from-head-v3',{id:'pdf-run-2'});put(P+'active-job',{...job,jobId:'pdf-job-2',manualRunId:'pdf-run-2'});put(attempt,{status:'stored',contentHash:'new-generation-sentinel'});put(T.resultKey(doi),{jobId:'pdf-job-2',status:'success'});}
  return {T,context,time,store,put,job,lease,gm,native,downloads,live,reports,trace,options,receipt,attempt,revoke,candidates};
}
async function test(name,fn){await fn();passed++;console.log('PRIVATE_PDF_UPLOAD_PASS '+name);}
function assertClean(x){assert.equal(x.time.tasks.size,0,'settled upload releases all timers');assert.equal(JSON.stringify(x.trace).includes(TOKEN),false,'trace must not include credential');}

await test('matched stored receipt is saved through real uploader',async()=>{
  const x=harness(),s=observe(x.T.maybeCapturePrivatePdf(x.job,x.trace));await flush();
  assert.equal(x.downloads.length,1);assert.equal(x.gm.length,1);assert.equal(x.gm[0].options.timeout,45000);x.gm[0].respond();await s.promise;
  assert.equal(s.value.status,'stored');assert.equal(x.store.get(x.attempt).contentHash,'a'.repeat(64));assert.equal(x.native.length,0);
  for(const event of ['start','transport_start','transport_response','complete'])assert.ok(x.trace.some(r=>r.stage==='private_pdf_upload'&&r.event===event),event);
  assertClean(x);
});

await test('mismatched stored receipt is rejected without another download',async()=>{
  const x=harness(),s=observe(x.T.maybeCapturePrivatePdf(x.job,x.trace));await flush();x.gm[0].respond(200,x.receipt({doi:'10.1039/d6gc00000z'}));await s.promise;
  assert.equal(s.value.status,'failed');assert.match(s.value.reason,/receipt_invalid/);assert.equal(x.downloads.length,1);assert.equal(x.store.get(x.attempt).status,'failed');assertClean(x);
});

await test('upload HTTP failures end this DOI and never choose an alternate PDF URL',async()=>{
  for(const code of [401,403,429,503]){const x=harness(),s=observe(x.T.maybeCapturePrivatePdf(x.job,x.trace));await flush();x.gm[0].respond(code,{error:'fixture HTTP failure'});await s.promise;
    assert.equal(s.value.status,'failed');assert.equal(x.downloads.length,1);assert.equal(x.gm.length,1);assert.equal(x.native.length,0);assertClean(x);}
});

await test('RSC download 403 still allows an alternate candidate',async()=>{
  const x=harness({download:(j,c,n,pdf)=>{if(n===1)throw Object.assign(Error('private_pdf_fetch_http_403'),{httpStatus:403});return pdf(c);}});
  const s=observe(x.T.maybeCapturePrivatePdf(x.job,x.trace));await flush();assert.equal(x.downloads.length,2);x.gm[0].respond();await s.promise;assert.equal(s.value.status,'stored');assertClean(x);
});

await test('publisher download 401 preserves the independent private API lease',async()=>{
  const x=harness({download:()=>{throw Object.assign(Error('private_pdf_fetch_http_401'),{httpStatus:401});}});
  const s=observe(x.T.maybeCapturePrivatePdf(x.job,x.trace));await s.promise;
  assert.equal(s.value.status,'failed');assert.equal(x.downloads.length,1);assert.equal(x.gm.length,0);
  assert.equal(x.store.get(x.T.PRIVATE_PDF_LEASE_KEY).token,TOKEN);assertClean(x);
});

await test('private API upload 401 clears its lease without redownloading',async()=>{
  const x=harness(),s=observe(x.T.maybeCapturePrivatePdf(x.job,x.trace));await flush();x.gm[0].respond(401,{error:'fixture lease expired'});await s.promise;
  assert.equal(s.value.status,'failed');assert.equal(x.downloads.length,1);assert.equal(x.gm.length,1);assert.equal(x.native.length,0);
  assert.equal(x.store.has(x.T.PRIVATE_PDF_LEASE_KEY),false);assertClean(x);
});

await test('one native fallback ignores duplicate terminal callbacks and late GM success',async()=>{
  const x=harness(),s=observe(x.T.privatePdfUploadRequest(x.job,x.options(),x.trace));
  x.gm[0].options.onerror({error:'fixture offline'});x.gm[0].options.ontimeout();await flush();
  assert.equal(x.native.length,1);assert.equal(x.gm[0].aborts,1);assert.equal(s.done,false,'synchronous abort callback must not end fallback');
  x.gm[0].respond(200,x.receipt({documentId:'late-gm'}));await flush();assert.equal(s.done,false,'late GM success cannot win');
  x.native[0].respond(200,x.receipt({documentId:'native-winner'}));await s.promise;assert.equal(JSON.parse(s.value.responseText).documentId,'native-winner');assertClean(x);
});

await test('GM and native stalls share a 90 second total budget',async()=>{
  const x=harness(),start=x.time.now,s=observe(x.T.maybeCapturePrivatePdf(x.job,x.trace));await flush();
  await x.time.advance(44999);assert.equal(x.native.length,0);await x.time.advance(1);assert.equal(x.native.length,1);assert.equal(x.native[0].at-start,45000);
  await x.time.advance(45000);await s.promise;assert.equal(s.value.status,'failed');assert.match(s.value.reason,/budget_exhausted/);assert.equal(x.time.now-start,90000);
  assert.equal(x.downloads.length,1);assert.equal(x.gm[0].aborts,1);assert.equal(x.native[0].aborts,1);assertClean(x);
});

await test('capture deadline truncates both transports and cancels pending fetch',async()=>{
  const x=harness();x.job.captureDeadline=x.time.now+3000;const s=observe(x.T.privatePdfUploadRequest(x.job,x.options(),x.trace));
  assert.equal(x.gm[0].options.timeout,1500);await x.time.advance(3000);await s.promise;
  assert.match(s.error.message,/budget_exhausted/);assert.equal(x.native.length,1);assert.equal(x.native[0].aborts,1);assertClean(x);
});

await test('expired capture deadline starts no transport',async()=>{
  const x=harness();x.job.captureDeadline=x.time.now-1;await assert.rejects(x.T.privatePdfUploadRequest(x.job,x.options(),x.trace),/deadline/);assert.equal(x.gm.length,0);assert.equal(x.native.length,0);assertClean(x);
});

await test('pause cancels GM within 500ms and starts no fallback',async()=>{
  const x=harness(),s=observe(x.T.privatePdfUploadRequest(x.job,x.options(),x.trace));x.put(P+'enabled',false);await x.time.advance(500);await s.promise;
  assert.match(s.error.message,/cancelled/);assert.equal(x.gm[0].aborts,1);assert.equal(x.native.length,0);assert.ok(x.trace.some(r=>r.event==='cancelled'));assertClean(x);
});

await test('new generation cancels native fallback and protects newer local receipts',async()=>{
  const x=harness(),s=observe(x.T.maybeCapturePrivatePdf(x.job,x.trace));await flush();x.gm[0].options.onerror({error:'fixture offline'});await flush();x.revoke();
  await x.time.advance(500);await s.promise;assert.match(s.error.message,/stale_or_unbound/);assert.equal(x.native[0].aborts,1);
  x.gm[0].respond();x.native[0].respond();await flush();assert.equal(x.store.get(x.attempt).contentHash,'new-generation-sentinel');assert.equal(x.store.get(x.T.resultKey(x.job.doi)).jobId,'pdf-job-2');assertClean(x);
});

await test('generation changed just after transport response cannot store old receipt',async()=>{
  const x=harness(),s=observe(x.T.maybeCapturePrivatePdf(x.job,x.trace));await flush();x.gm[0].respond();x.revoke();await s.promise;
  assert.match(s.error.message,/stale_or_unbound/);assert.equal(x.store.get(x.attempt).contentHash,'new-generation-sentinel');assertClean(x);
});

await test('generation changed during candidate discovery cannot overwrite newer attempt',async()=>{
  const gate=defer(),x=harness({candidates:()=>gate.promise}),s=observe(x.T.maybeCapturePrivatePdf(x.job,x.trace));await flush();x.revoke();gate.resolve([]);await s.promise;
  assert.ok(s.error,'superseded candidate discovery must reject');assert.equal(x.store.get(x.attempt).contentHash,'new-generation-sentinel');assert.equal(x.gm.length,0);assertClean(x);
});

await test('finalizer rechecks generation after awaiting PDF and emits no stale result',async()=>{
  const x=harness(),gate=defer();x.T.setPdfCapture(()=>gate.promise);const s=observe(x.T.finishPairedJob(x.job,{status:'success'},x.trace,''));await flush();x.revoke();
  gate.resolve({status:'stored'});await s.promise;assert.equal(s.value.status,'aborted');assert.equal(s.value.reason,'manual_run_superseded');
  assert.equal(x.store.get(x.T.resultKey(x.job.doi)).jobId,'pdf-job-2');assert.equal(x.store.has(x.T.traceKey(x.job.doi)),false);assert.equal(x.reports.length,0);
});

await test('transport traces redact token text in error callbacks',async()=>{
  const x=harness(),s=observe(x.T.privatePdfUploadRequest(x.job,x.options(),x.trace));x.gm[0].options.onerror({error:'Authorization: Bearer '+TOKEN});await flush();
  x.native[0].gate.reject(Error('token='+TOKEN));await s.promise;assert.ok(s.error);assert.ok(x.trace.some(r=>r.event==='failed'));assertClean(x);
});

await test('disallowed upload endpoint and non-POST are rejected before network',async()=>{
  for(const extra of [{url:'https://pubs.rsc.org/api/private-pdf/import'},{method:'GET'}]){const x=harness();await assert.rejects(x.T.privatePdfUploadRequest(x.job,x.options(extra),x.trace),/target_invalid/);assert.equal(x.gm.length,0);assert.equal(x.native.length,0);}
});

await test('synchronous GM failure still aborts returned handle exactly once',async()=>{
  const x=harness({gmStart:call=>call.options.onerror({error:'sync failure'})}),s=observe(x.T.privatePdfUploadRequest(x.job,x.options(),x.trace));await flush();
  assert.equal(x.native.length,1);assert.equal(x.gm[0].aborts,1);x.native[0].respond();await s.promise;assert.equal(s.value.status,200);assertClean(x);
});

console.log(JSON.stringify({passed,source:sourcePath,productionWrites:0,publisherNetworkRequests:0,virtualClock:true}));
