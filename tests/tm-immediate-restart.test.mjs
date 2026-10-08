import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
const P='osg-toc-v6:',MK=P+'manual-from-head-v3';let passed=0;
function defer(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
const articles=[{doi:'10.1038/s41586-026-old',journal:'Nature',addedDate:'2026-09-30',date:'2026-09-30'},
 {doi:'10.1021/jacs.6c90002',journal:'JACS',addedDate:'2026-10-01',date:'2026-10-01'},
 {doi:'10.1002/anie.90001',journal:'Angew',addedDate:'2026-10-01',date:'2026-10-01'}];
const queue={articles,latestAddedDate:'2026-10-01',generatedAt:'2026-10-01T05:00:00Z',webpageDoiCount:3,mediaGeneration:1790082000000};
const caps={captureVersion:'6.2.20',mediaGeneration:1790082000000,mode:'verified-staging',mediaControllerRevision:'2.2.41',evidenceSchemaVersion:'article-evidence-v2'};
function h(opt={}){
 const store=opt.store||new Map(),listeners=opt.listeners||[],badges=[],opened=[],requests=[],timers=new Map(),reports=[],clock=opt.clock||{now:1790827200000};let id=0,c;
 class D extends Date{constructor(...a){super(...(a.length?a:[clock.now]));}static now(){return clock.now;}}
 const clone=x=>x===undefined?x:structuredClone(x);
 const put=(key,value)=>{const old=store.get(key);store.set(key,clone(value));for(const fn of listeners.filter(v=>v.key===key))fn.cb(key,clone(old),clone(value),true);};
 const env={Date:D,console,URL,Set,Map,crypto:{randomUUID},location:{href:'https://gallery.gczhouwld.com/',hostname:'gallery.gczhouwld.com',pathname:'/',hash:''},
 window:{open(){},close(){},alert(){},prompt(){return null;}},sessionStorage:{getItem:()=>'',setItem(){}},
 GM_getValue:(k,d)=>store.has(k)?clone(store.get(k)):d,GM_setValue:put,GM_deleteValue:k=>store.delete(k),GM_listValues:()=>[...store.keys()],
 GM_addValueChangeListener:(k,cb)=>listeners.push({key:k,cb}),GM_registerMenuCommand:(name,cb)=>{env.menus[name]=cb;},menus:{},
 setInterval:(cb,ms)=>{timers.set(++id,{cb,ms,interval:true});return id;},clearInterval:i=>timers.delete(i),
 setTimeout:(cb,ms)=>{timers.set(++id,{cb,ms});return id;},clearTimeout:i=>timers.delete(i),
 __badge:x=>badges.push(x),__sleep:async ms=>{if(opt.sleep)return opt.sleep(ms,c);clock.now+=ms;},__token:()=>opt.noToken?'':'private_fixture_key',
 __getJson:async url=>{requests.push(url);if(opt.fetch)return opt.fetch(url,c);return url.includes('capture-capabilities')?caps:queue;},
 __enqueue:(...args)=>reports.push(args),
 GM_openInTab:url=>{const j=store.get(P+'active-job');const tab={url,closed:false,close(){this.closed=true;}};opened.push({j:clone(j),tab,at:clock.now});opt.open?.(j,c,tab);
  if(!opt.noResult){const rf={label:'Figure 1',sourceUrl:'https://pubs.acs.org/'+j.doi+'/f1.png',contentHash:'a'.repeat(32),width:1000,height:500,quality:'high',status:'staged'},ck=P+'verified-capture:6.2.20:1790082000000:'+j.doi,prior=store.get(ck)||{};put(ck,{...clone(prior),doi:j.doi,version:'6.2.20',figures:{...(prior.figures||{}),'Figure 1':rf},updatedAt:D.now()});put(P+'result:'+j.doi,{doi:j.doi,jobId:j.jobId,version:'6.2.20',status:'success',finishedAt:new D().toISOString(),toc:{status:'stored',kind:'official'},figures:{discovered:1,stored:1,failed:0,items:[rf]},figuresStaged:1,fulltext:{status:'stored'}});}return tab;},
 };
 c=vm.createContext(env);const cut=source.lastIndexOf('  installManualRestartListener();');assert.ok(cut>0);
 vm.runInContext(source.slice(0,cut)+`
 readMissingCaptureInventory=async(q)=>({media:{items:q.articles.map(a=>({doi:a.doi,figureCount:0,tocStored:false,capturedFigures:[]}))},tocs:{items:[],count:0},figures:{complete:true,items:[]},evidence:{items:[],count:0},errors:[]});isGalleryPage=()=>true;badge=__badge;sleep=__sleep;writeToken=__token;getJson=__getJson;enqueueCaptureReport=__enqueue;
 globalThis.T={forceStartFromHead,manualCaptureJobs,manualExecutionCurrent,manualRunBlocksAutomatic,renewLease,currentCaptureJob,finishPairedJob,saveCheckpoint,checkpointKey,attemptKey,completedPublisherResult,controllerRun,requestControllerPause,owner:CONTROLLER_ID};
 installManualRestartListener();installMenu();})();`,c);
 return {T:c.T,c,store,put,badges,opened,requests,timers,reports,clock,listeners};
}
async function test(n,f){await f();passed++;console.log('IMMEDIATE_RESTART_PASS '+n);}
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
await test('click synchronously revokes foreign live lock and active task, no polling',async()=>{const gate=defer(),x=h({fetch:()=>gate.promise});x.put(P+'controller-lease',{owner:'foreign',expiresAt:x.clock.now+90000});x.put(P+'active-job',{doi:articles[0].doi,jobId:'old'});x.put(P+'enabled',false);x.put(P+'abort-request',{at:x.clock.now});const done=x.T.forceStartFromHead();assert.equal(x.store.has(P+'active-job'),false);assert.equal(x.store.get(P+'enabled'),true);assert.match(x.store.get(P+'controller-lease').owner,/^manual:/);assert.equal(x.requests.length,2);assert.equal([...x.timers.values()].filter(v=>!v.interval).length,0);gate.resolve(queue);await done;});
await test('starts newest-first for every verified missing fixture, despite a stale success attempt',async()=>{const x=h();x.put(x.T.attemptKey(articles[1].doi,'6.2.20:paired:1790082000000','figures'),{status:'success'});await x.T.forceStartFromHead();assert.deepEqual(x.opened.map(v=>v.j.doi),[articles[1].doi,articles[2].doi,articles[0].doi]);assert.ok(x.requests.every(u=>!u.includes('inventory')));});
await test('TOC is the queue obligation while figures and text are opportunistic',async()=>{const x=h();await x.T.forceStartFromHead();for(const {j} of x.opened){assert.equal(j.captureToc,true);assert.equal(j.captureFigures,false);assert.equal(j.captureEvidence,false);assert.equal(j.opportunisticFigures,true);assert.equal(j.opportunisticEvidence,true);assert.equal(j.recaptureFromHead,false);assert.equal(j.missingOnly,true);}});
await test('second click immediately resets statistics and starts again at first paper',async()=>{const x=h();await x.T.forceStartFromHead();const first=x.store.get(MK).id;const p=x.T.forceStartFromHead();assert.equal(x.store.get(P+'last-run-summary').results.length,0);assert.notEqual(x.store.get(MK).id,first);await p;assert.equal(x.opened[3].j.doi,articles[1].doi);});
await test('same page mid-network restart does not wait on old unresolved request',async()=>{const gate=defer();let calls=0;const x=h({fetch:url=>{calls++;if(calls<=2)return gate.promise;return url.includes('capabilities')?caps:queue;}});const old=x.T.forceStartFromHead();const fresh=x.T.forceStartFromHead();await fresh;assert.equal(x.opened.length,3);gate.resolve(queue);await old;assert.equal(x.opened.length,3);assert.equal(x.store.get(P+'last-run-summary').success,3);});
await test('second control page invalidates first run without waiting for its lease',async()=>{const store=new Map(),listeners=[],clock={now:1790827200000},gate=defer();const a=h({store,listeners,clock,fetch:()=>gate.promise}),b=h({store,listeners,clock});const ap=a.T.forceStartFromHead();await b.T.forceStartFromHead();gate.resolve(queue);await ap;assert.equal(a.opened.length,0);assert.equal(b.opened.length,3);assert.equal(store.get(MK).owner,b.T.owner);});
await test('old in-flight result cannot overwrite the new session result or checkpoint',async()=>{const x=h();const gate=defer();x.put(P+'active-job',{doi:articles[0].doi,jobId:'old'});const old={doi:articles[0].doi,jobId:'old'};await x.T.forceStartFromHead();const before=structuredClone(x.store.get(P+'last-run-summary'));const r=await x.T.finishPairedJob(old,{status:'success'},[],'');assert.equal(r.reason,'manual_run_superseded');assert.equal(x.T.saveCheckpoint(old.doi,{figures:{evil:1}},old),false);assert.deepEqual(x.store.get(P+'last-run-summary'),before);});
await test('click does not delete credentials, existing figures or pending diagnostics',async()=>{const x=h();const retained=['organicGalleryCloudflareBridgeWriteToken',x.T.checkpointKey(articles[1].doi),P+'auto-report-v1:old'];retained.forEach(k=>x.put(k,{original:true}));await x.T.forceStartFromHead();retained.forEach(k=>assert.equal(x.store.get(k).original,true));});
await test('single user_aborted article does not terminate the manual pass',async()=>{
  let first=true;
  const x=h({noResult:true,open:(j,c)=>{
    const result=first
      ? {doi:j.doi,jobId:j.jobId,version:'6.2.20',status:'aborted',reason:'user_aborted',finishedAt:new Date(c.Date.now()).toISOString(),toc:{status:'not_requested'},figures:{discovered:0,stored:0,failed:0,items:[]},fulltext:{status:'not_requested'}}
      : {doi:j.doi,jobId:j.jobId,version:'6.2.20',status:'success',finishedAt:new Date(c.Date.now()).toISOString(),toc:{status:'stored',kind:'official'},figures:{discovered:1,stored:1,failed:0,items:[]},figuresStaged:1,fulltext:{status:'stored'}};
    first=false;
    c.GM_setValue(P+'result:'+j.doi,result);
  }});
  await x.T.forceStartFromHead();
  assert.equal(x.opened.length,3);
  const summary=x.store.get(P+'last-run-summary');
  assert.equal(summary.aborted,1);
  assert.equal(summary.success,2);
  assert.notEqual(summary.phase,'paused');
});
await test('unavailable page does not stop subsequent articles',async()=>{const x=h({open:(job,c)=>{if(job.doi===articles[1].doi)throw Error('open failed');}});await x.T.forceStartFromHead();assert.equal(x.store.get(P+'last-run-summary').failed,1);assert.equal(x.store.get(P+'last-run-summary').success,2);});
await test('publisher access rate limits remain intact and do not occupy controller waits',async()=>{const x=h();x.put(P+'publisher-access-cooldown:acs',{until:x.clock.now+30*60000});await x.T.forceStartFromHead();assert.equal(x.opened.length,2);assert.equal(x.store.get(P+'last-run-summary').skipped,1);});
await test('old failed-paper cooldown never blocks an explicit new pass',async()=>{const x=h();x.put(x.T.attemptKey(articles[1].doi,'6.2.20:paired:1790082000000','figures'),{status:'failed',reason:'controller_timeout',retryCount:9,finishedAt:new Date(x.clock.now).toISOString()});await x.T.forceStartFromHead();assert.equal(x.opened[0].j.doi,articles[1].doi);});
await test('manual pause halts the new pass without deleting acquired results',async()=>{const x=h({open:(j,c)=>c.T.requestControllerPause()});await x.T.forceStartFromHead();assert.equal(x.opened.length,1);assert.equal(x.store.get(P+'last-run-summary').success,1);assert.equal(x.store.get(P+'enabled'),false);});
await test('token absence does not revoke existing work or start unauthenticated requests',async()=>{const x=h({noToken:true});x.put(P+'controller-lease',{owner:'other'});await x.T.forceStartFromHead();assert.equal(x.requests.length,0);assert.equal(x.store.get(P+'controller-lease').owner,'other');});
await test('invalid current queue fails closed without publisher dispatch',async()=>{const x=h({fetch:u=>u.includes('capabilities')?caps:{...queue,webpageDoiCount:10}});await x.T.forceStartFromHead();assert.equal(x.opened.length,0);assert.match(x.store.get(P+'last-run-summary').stopReason,/current_complete_registry/);});
await test('capability mismatch does not bypass stored-generation or source validation',async()=>{const x=h({fetch:u=>u.includes('capabilities')?{...caps,mediaGeneration:0}:queue});await x.T.forceStartFromHead();assert.equal(x.opened.length,0);assert.match(x.store.get(P+'last-run-summary').stopReason,/upgrade/);});
await test('normal automatic controller never competes with active manual run',async()=>{const gate=defer(),x=h({fetch:()=>gate.promise});const p=x.T.forceStartFromHead();assert.equal(x.T.manualRunBlocksAutomatic(),true);assert.equal(x.T.renewLease(),false);await x.T.controllerRun();assert.equal(x.requests.length,2);gate.resolve(queue);await p;});
await test('original immediate menu and new primary panel action both call force start',()=>{assert.ok(source.includes("GM_registerMenuCommand('立即运行媒体抓取队列', forceStartFromHead)"));assert.ok(source.includes("immediate.addEventListener('click',forceStartFromHead)"));assert.ok(source.includes("GM_registerMenuCommand('立即开始任务（从头重抓）', forceStartFromHead)"));});
await test('fresh visits do not inherit six-hour TOC suppression or per-figure skip',()=>{assert.ok(source.includes("if(!job.recaptureFromHead&&checkpoint.toc"));assert.ok(source.includes('if(!job.recaptureFromHead&&saved&&(!job.missingOnly||validReceiptForDoi('));});
console.log(JSON.stringify({passed,productionWrites:0,publisherNetworkRequests:0,manualRestart:'v3'}));
