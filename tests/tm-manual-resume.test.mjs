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
  if(!opt.noResult){const rf={label:'Figure 1',sourceUrl:'https://pubs.acs.org/'+j.doi+'/f1.png',contentHash:'a'.repeat(32),width:1000,height:500,quality:'high',status:'staged'};put(P+'verified-capture:6.2.20:1790082000000:'+j.doi,{doi:j.doi,version:'6.2.20',figures:{'Figure 1':rf},updatedAt:D.now()});put(P+'result:'+j.doi,{doi:j.doi,jobId:j.jobId,version:'6.2.20',status:'success',finishedAt:new D().toISOString(),toc:{status:'stored',kind:'official'},figures:{discovered:1,stored:1,failed:0,items:[rf]},figuresStaged:1,fulltext:{status:'stored'}});}return tab;},
 };
 c=vm.createContext(env);const cut=source.lastIndexOf('  installManualRestartListener();');assert.ok(cut>0);
 vm.runInContext(source.slice(0,cut)+`
 readMissingCaptureInventory=async(q)=>({media:{items:q.articles.map(a=>({doi:a.doi,figureCount:0,tocStored:false,capturedFigures:[]}))},tocs:{items:[],count:0},figures:{complete:true,items:[]},evidence:{items:[],count:0},errors:[]});isGalleryPage=()=>true;badge=__badge;sleep=__sleep;writeToken=__token;getJson=__getJson;enqueueCaptureReport=__enqueue;
 globalThis.T={snapshot:controllerLifecycleSnapshot,captureLiveSnapshot,setResolver:(fn)=>{resolvePublisherTaskUrl=fn;},tryResumeInterruptedManualRun,controllerTick,acquireLease,setInventory:(value)=>{readMissingCaptureInventory=async()=>value;},forceStartFromHead,manualCaptureJobs,manualExecutionCurrent,manualRunBlocksAutomatic,renewLease,currentCaptureJob,finishPairedJob,saveCheckpoint,checkpointKey,attemptKey,completedPublisherResult,controllerRun,requestControllerPause,owner:CONTROLLER_ID};
 installManualRestartListener();installMenu();})();`,c);
 return {T:c.T,c,store,put,badges,opened,requests,timers,reports,clock,listeners};
}
async function test(n,f){await f();passed++;console.log('MANUAL_RESUME_PASS '+n);}
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};

function orphan(x,summary={}){
 const startedAt=new Date(x.clock.now-15*60000).toISOString();
 x.put(MK,{id:'abandoned-run',owner:'closed-control-page',startedAt,revision:'20261001-immediate-restart-v3'});
 x.put(P+'last-run-summary',{controllerRunId:'manual:abandoned-run',controllerRevision:'2.2.41',version:'6.2.20',mode:'missing_only',phase:'running',startedAt,results:[],...summary});
 x.put(P+'controller-lease',{owner:'manual:abandoned-run',expiresAt:x.clock.now-1});
 return x;
}
await test('expired orphan resumes once under a fresh fenced generation',async()=>{
 const x=orphan(h());await x.T.tryResumeInterruptedManualRun();
 assert.equal(x.opened.length,3);const manual=x.store.get(MK),summary=x.store.get(P+'last-run-summary');
 assert.notEqual(manual.id,'abandoned-run');assert.equal(manual.resumedFromRunId,'abandoned-run');assert.equal(manual.owner,x.T.owner);
 assert.equal(summary.resumedFromRunId,'abandoned-run');assert.equal(summary.recoveryRevision,'20261007-manual-resume-v1');
 await x.T.controllerTick();assert.equal(x.opened.length,3);assert.equal(x.store.get(MK).id,manual.id);
});
await test('renewed lease from any control page prevents recovery without writes',async()=>{
 for(const owner of ['manual:abandoned-run','another-controller']){const x=orphan(h());x.put(P+'controller-lease',{owner,expiresAt:x.clock.now+90000});const before=structuredClone([...x.store]);
 assert.equal(await x.T.tryResumeInterruptedManualRun(),false);assert.deepEqual([...x.store],before);assert.equal(x.requests.length,0);}
});
await test('explicit Pause and abort markers remain untouched',async()=>{
 for(const key of [P+'enabled',P+'abort-request']){const x=orphan(h());x.put(key,key.endsWith('enabled')?false:{at:x.clock.now,reason:'user_aborted'});const before=structuredClone([...x.store]);
 assert.equal(await x.T.tryResumeInterruptedManualRun(),false);assert.deepEqual([...x.store],before);assert.equal(x.requests.length,0);}
});
await test('Pause during lease confirmation wins and stops the recovery',async()=>{
 const gate=defer(),x=orphan(h({sleep:()=>gate.promise}));const p=x.T.tryResumeInterruptedManualRun();
 await tick();x.T.requestControllerPause();gate.resolve();await p;
 assert.equal(x.store.get(MK).id,'abandoned-run');assert.equal(x.store.get(P+'enabled'),false);assert.equal(x.store.get(P+'abort-request').reason,'user_aborted');assert.equal(x.opened.length,0);assert.equal(x.requests.length,0);
});
await test('two refreshed pages cannot both acquire the same expired run',async()=>{
 const store=new Map(),listeners=[],clock={now:1790827200000};const a=orphan(h({store,listeners,clock})),b=h({store,listeners,clock});
 await Promise.all([a.T.tryResumeInterruptedManualRun(),b.T.tryResumeInterruptedManualRun()]);
 assert.equal(a.opened.length+b.opened.length,3);assert.equal(new Set([...a.opened,...b.opened].map(v=>v.j.manualRunId)).size,1);
});
await test('a live local manual execution cannot be resumed a second time',async()=>{
 const gate=defer(),x=h({fetch:()=>gate.promise});const p=x.T.forceStartFromHead();await x.T.tryResumeInterruptedManualRun();assert.equal(x.requests.length,2);gate.resolve(queue);await p;
});
await test('finished and failed summaries form a terminal barrier without completedAt',async()=>{
 for(const summary of [{finishedAt:new Date(1790827200000).toISOString()},{phase:'all_resolved'},{phase:'blocked_remaining'},{phase:'paused'},{stopReason:'capture_server_upgrade_pending'}]){
 const x=orphan(h(),summary),before=structuredClone([...x.store]);assert.equal(await x.T.tryResumeInterruptedManualRun(),false);assert.deepEqual([...x.store],before);assert.equal(x.requests.length,0);}
 const x=orphan(h());x.put(MK,{...x.store.get(MK),completedAt:new Date(x.clock.now).toISOString()});assert.equal(await x.T.tryResumeInterruptedManualRun(),false);
});
await test('mismatched, missing and unsupported summaries never start automatic work',async()=>{
 for(const summary of [{controllerRunId:'manual:other'},{mode:'paired'},{version:'old'},{controllerRevision:'old'},{phase:''}]){
 const x=orphan(h(),summary);assert.equal(await x.T.tryResumeInterruptedManualRun(),false);assert.equal(x.requests.length,0);}
});
await test('fresh heartbeat protects even an old publisher task',async()=>{
 const x=orphan(h()),job={doi:articles[1].doi,jobId:'still-working',controllerId:'manual:abandoned-run',manualRunId:'abandoned-run',startedAt:new Date(x.clock.now-12*60000).toISOString()};
 x.put(P+'active-job',job);x.put(P+'publisher-heartbeat',{jobId:job.jobId,doi:job.doi,at:x.clock.now});
 const before=structuredClone([...x.store]);assert.equal(await x.T.controllerTick(),false);assert.deepEqual([...x.store],before);assert.deepEqual(x.store.get(P+'active-job'),job);assert.equal(x.store.get(MK).id,'abandoned-run');assert.equal(x.requests.length,0);
});
await test('young orphan stays protected then the periodic tick recovers after grace',async()=>{
 const x=orphan(h()),job={doi:articles[1].doi,jobId:'young-orphan',controllerId:'manual:abandoned-run',manualRunId:'abandoned-run',startedAt:new Date(x.clock.now-60000).toISOString()};
 x.put(P+'active-job',job);const before=structuredClone([...x.store]);assert.equal(await x.T.controllerTick(),false);assert.deepEqual([...x.store],before);assert.deepEqual(x.store.get(P+'active-job'),job);assert.equal(x.requests.length,0);
 x.clock.now+=10*60000;await x.T.controllerTick();assert.equal(x.opened.length,3);assert.equal(x.store.has(P+'active-job'),false);
});
await test('completed publisher receipt is reconciled and stored media is reused',async()=>{
 const x=orphan(h()),doi=articles[1].doi,job={doi,jobId:'completed-old',controllerId:'manual:abandoned-run',manualRunId:'abandoned-run',startedAt:new Date(x.clock.now-60000).toISOString()};
 x.put(P+'active-job',job);x.put(P+'result:'+doi,{doi,jobId:job.jobId,version:'6.2.20',status:'success',finishedAt:new Date(x.clock.now).toISOString(),toc:{status:'stored',kind:'official',sourceUrl:'https://acs.silverchair-cdn.com/10.1021_jacs.6c90002/toc.png',imageWidth:1000,imageHeight:500}});
 x.T.setInventory({media:{items:articles.map(a=>({doi:a.doi,tocStored:a.doi===doi,tocKind:a.doi===doi?'official':'',figureCount:0,capturedFigures:[]}))},tocs:{items:[],count:0},figures:{complete:true,items:[]},evidence:{items:[],count:0},errors:[]});
 await x.T.tryResumeInterruptedManualRun();assert.equal(x.opened.some(v=>v.j.doi===doi),false);assert.equal(x.opened.length,2);
});
await test('explicit new Start during recovery fencing wins without being overwritten',async()=>{
 const gate=defer();let first=true;const x=orphan(h({sleep:async(ms,c)=>{if(first){first=false;return gate.promise;}x.clock.now+=ms;}}));
 const recovery=x.T.tryResumeInterruptedManualRun();await tick();await x.T.forceStartFromHead();const id=x.store.get(MK).id;gate.resolve();await recovery;
 assert.equal(x.store.get(MK).id,id);assert.equal(x.opened.length,3);assert.equal(x.store.get(P+'last-run-summary').resumedFromRunId,undefined);
});
await test('late old-generation results remain rejected after recovery',async()=>{
 const x=orphan(h());await x.T.tryResumeInterruptedManualRun();const before=structuredClone(x.store.get(P+'last-run-summary'));
 const old={doi:articles[1].doi,jobId:'old-job',manualRunId:'abandoned-run',controllerId:'manual:abandoned-run'};
 const r=await x.T.finishPairedJob(old,{status:'success'},[],'');assert.equal(r.reason,'manual_run_superseded');assert.equal(x.T.saveCheckpoint(old.doi,{figures:{wrong:1}},old),false);assert.deepEqual(x.store.get(P+'last-run-summary'),before);
});
await test('publisher cooldowns credentials and saved checkpoints survive recovery',async()=>{
 const x=orphan(h()),until=x.clock.now+30*60000;x.put(P+'publisher-access-cooldown:acs',{until});
 const keys=['organicGalleryCloudflareBridgeWriteToken',x.T.checkpointKey(articles[1].doi),P+'auto-report-v1:pending'];keys.forEach(k=>x.put(k,{retained:true}));
 await x.T.tryResumeInterruptedManualRun();assert.equal(x.opened.some(v=>v.j.publisher==='acs'),false);assert.equal(x.store.get(P+'publisher-access-cooldown:acs').until,until);keys.forEach(k=>assert.deepEqual(x.store.get(k),{retained:true}));
});
await test('missing write capability and pending user resume request prevent recovery',async()=>{
 const x=orphan(h({noToken:true}));assert.equal(await x.T.tryResumeInterruptedManualRun(),false);assert.equal(x.requests.length,0);
 const y=orphan(h());y.put(P+'controller-resume-request-v2',{requester:'other',requestId:'user-command'});assert.equal(await y.T.tryResumeInterruptedManualRun(),false);assert.equal(y.requests.length,0);
});
await test('old controller completion during confirmation cancels automatic recovery',async()=>{
 const gate=defer(),x=orphan(h({sleep:()=>gate.promise}));const p=x.T.tryResumeInterruptedManualRun();await tick();
 x.put(P+'last-run-summary',{...x.store.get(P+'last-run-summary'),finishedAt:new Date(x.clock.now).toISOString(),phase:'all_resolved'});
 gate.resolve();assert.equal(await p,false);assert.equal(x.store.get(MK).id,'abandoned-run');assert.equal(x.requests.length,0);
});
await test('manual inventory waits report the real local owner and renewed lease',async()=>{
 const x=h();let finish;
 x.T.setInventory(new Promise(resolve=>{finish=resolve;}));
 const running=x.T.forceStartFromHead();await tick();
 assert.equal(x.store.get(P+'last-run-summary').phase,'inventory_refresh');
 assert.equal(x.T.snapshot().localBusy,true);
 assert.equal(x.T.snapshot().ownerIsThisPage,true);
 assert.equal(x.T.captureLiveSnapshot(x.clock.now).state,'inventory_refresh');
 x.clock.now+=15000;for(const timer of x.timers.values())if(timer.interval&&timer.ms===15000)timer.cb();
 assert.equal(x.T.snapshot().renewedAt,x.clock.now);
 x.T.requestControllerPause();finish({});await running;
 assert.equal(x.opened.length,0);
});
await test('interrupted queue and inventory reads remain eligible for guarded recovery',async()=>{
 for(const phase of ['queue_refresh','inventory_refresh']){const x=orphan(h(),{phase});await x.T.tryResumeInterruptedManualRun();assert.equal(x.opened.length,3);}
});
await test('pause during publisher URL resolution opens no late task page',async()=>{
 const x=h();let finish;
 x.T.setResolver(()=>new Promise(resolve=>{finish=resolve;}));
 const running=x.T.forceStartFromHead();await tick();
 for(let i=0;i<10&&typeof finish!=='function';i++)await tick();
 assert.equal(typeof finish,'function');
 x.T.requestControllerPause();finish('https://pubs.acs.org/doi/10.1021/jacs.6c10001');await running;
 assert.equal(x.opened.length,0);
 assert.equal(x.store.get(P+'enabled'),false);
});
console.log(JSON.stringify({passed,revision:'20261007-manual-resume-v1',productionWrites:0,publisherNetworkRequests:0}));
