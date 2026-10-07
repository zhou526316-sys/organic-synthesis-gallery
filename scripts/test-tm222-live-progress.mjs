import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {chromium} from 'playwright';
const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
const begin=source.indexOf('  // BEGIN OSG_LIVE_PROGRESS_V1'),end=source.indexOf('  // END OSG_LIVE_PROGRESS_V1')+'  // END OSG_LIVE_PROGRESS_V1'.length;
assert.ok(begin>0&&end>begin);
const moduleSource=source.slice(begin,end);
const store=new Map();let now=1800000000000;let reject=false;
const key='osg-toc-v6:live-progress-v1',activeKey='active',summaryKey='summary';
const doi='10.1021/jacs.6c14159';
const job={doi,jobId:'active-one',startedAt:new Date(now).toISOString(),_liveResult:{status:'failed',toc:{status:'pending'},figures:{stored:0,discovered:0,failed:0,items:[]},figuresStaged:0}};
store.set(activeKey,{doi,jobId:job.jobId,startedAt:job.startedAt,journal:'JACS'});
const writes=[];
class Clock extends Date {static now(){return now;}}
const ctx=vm.createContext({Date:Clock,P:'osg-toc-v6:',VERSION:'6.2.20',CONTROLLER_REVISION:'2.2.41',CONTROLLER_STOP_REASON:'',ACTIVE_JOB_KEY:activeKey,SUMMARY_KEY:summaryKey,ENABLED_KEY:'enabled',ABORT_KEY:'abort',MANUAL_RUN_KEY:'manual',LEASE_KEY:'lease',CONTROLLER_ID:'this-page',
 automaticReportDisplay:()=> '自动报告测试',
 captureNeedText:()=> 'toc+figures',captureEvidenceLevelText:()=> 'mock evidence',
 normalizeDoi:s=>String(s||'').toLowerCase(),progressKey:d=>'progress:'+d,
 GM_getValue:(k,d)=>store.has(k)?structuredClone(store.get(k)):d,
 GM_setValue:(k,v)=>{writes.push(k);store.set(k,structuredClone(v));},
 assertBoundCaptureJob:j=>{if(reject||store.get(activeKey)?.jobId!==j.jobId)throw Error('stale');}
});
vm.runInContext(moduleSource,ctx);
const api=vm.runInContext('({captureLiveUpdate,captureLiveSnapshot,captureLiveText})',ctx);
let passed=0;
function test(name,fn){fn();passed++;console.log('TM222_PASS '+name);}
test('discovery does not pretend image is stored',()=>{api.captureLiveUpdate(job,'discovering');assert.equal(store.get(key).stored,0);assert.equal(store.get(key).discoveryDone,false);});
test('in-flight image has label but no success increment',()=>{api.captureLiveUpdate(job,'uploading',{label:'Figure 3'});assert.equal(store.get(key).label,'Figure 3');assert.equal(store.get(key).stagedReceipts,0);});
job._liveDiscoveryDone=true;job._liveResult.figures.discovered=7;job._liveResult.figures.stored=1;job._liveResult.figuresStaged=1;job._liveResult.figures.items=[{label:'Figure 3',status:'staged'}];
test('only confirmed receipt advances stored counter',()=>{api.captureLiveUpdate(job,'saved',{label:'Figure 3',quality:'vector',width:600,height:300});assert.equal(store.get(key).stored,1);assert.equal(store.get(key).stagedReceipts,1);assert.equal(store.get(key).publicationState,'not_published');});
test('resume checkpoint is distinct from new receipt',()=>{job._liveResult.figures.items.push({status:'already_staged'});job._liveResult.figures.stored=2;api.captureLiveUpdate(job,'reused');assert.equal(store.get(key).reused,1);assert.equal(store.get(key).stagedReceipts,1);});
test('missing TOC preserves body progress and reports fallback honestly',()=>{job._liveResult.toc={status:'stored',kind:'figure1'};api.captureLiveUpdate(job,'saved');const t=api.captureLiveText(api.captureLiveSnapshot(now));assert.match(t.toc,/非官方 TOC/);assert.match(t.figures,/2／7/);});
test('secrets and source URLs never enter telemetry',()=>{api.captureLiveUpdate(job,'image_failed',{error:'upload_failed token=VERY_SECRET_VALUE https://example.test/?token=HIDDEN cookie=SECRET'});const str=JSON.stringify(store.get(key));assert.ok(!str.includes('VERY_SECRET_VALUE')&&!str.includes('HIDDEN')&&!str.includes('cookie=SECRET')&&!str.includes('https://'));});
test('old task cannot overwrite new task progress',()=>{const before=JSON.stringify(store.get(key));assert.equal(api.captureLiveUpdate({...job,jobId:'retired'},'saved'),false);assert.equal(JSON.stringify(store.get(key)),before);});
test('guard failure is passive and does not throw',()=>{reject=true;assert.equal(api.captureLiveUpdate(job,'saved'),false);reject=false;});
test('new task never sees last DOI counts',()=>{store.set(activeKey,{doi:'10.1021/jacs.6c99999',jobId:'next',startedAt:new Date(now).toISOString()});assert.equal(api.captureLiveSnapshot(now).row,null);});
store.set(activeKey,{doi,jobId:job.jobId,startedAt:job.startedAt});
test('inactive 60 seconds is an age warning not a fake failure',()=>{const t=api.captureLiveText(api.captureLiveSnapshot(now+60000));assert.match(t.stale,/不等于抓取失败/);assert.match(t.last,/1 分钟前/);});
test('stale unrelated login status does not pollute this task',()=>{store.set('progress:'+doi,{jobId:'old',status:'auth_wait',at:new Date(now+1).toISOString()});assert.notEqual(api.captureLiveSnapshot(now+2).state,'auth_wait');});
test('pause takes priority over per-image display',()=>{store.set('enabled',false);assert.equal(api.captureLiveSnapshot(now).state,'pausing');store.set('enabled',true);});
test('ended-paper totals never double count active receipts',()=>{store.set(summaryKey,{total:8,results:[{jobId:'prev',status:'success'}],figuresStaged:10,tocStored:1});assert.equal(api.captureLiveSnapshot(now).batchStaged,10);});
test('no polling HTTP requests or task-control writes in module',()=>{assert.ok(!/\bfetch\(|gmRequest\(|postJson\(|window\.open\(|GM_openInTab\(|GM_deleteValue\(/.test(moduleSource));assert.ok(writes.every(k=>k===key));});
test('all actual pipeline stages wired to monitor',()=>{for(const s of ["captureLiveUpdate(job,'downloading'","captureLiveUpdate(job,'uploading'","captureLiveUpdate(job,'saved'","captureLiveUpdate(job,'image_failed'","captureLiveUpdate(job,'finished'"])assert.ok(source.includes(s),s);});

// Current-generation display regressions; no controller writes or network calls.
const baselineStore=structuredClone([...store]);
function idleFixture(options={}){
 store.clear();
 const startedAt=new Date(now-8895000).toISOString();
 const latest=new Date(now-1213000).toISOString();
 store.set(summaryKey,{controllerRunId:'manual:current-run',mode:'missing_only',queueCoverageRevision:'v9',phase:'running',startedAt,total:166,visitedCount:36,fullyResolved:3,unresolvedCount:163,pendingMissing:130,blockedCount:33,attemptCount:52,results:[{finishedAt:latest,status:'failed'}],...(options.summary||{})});
 if(options.manual!==false)store.set('manual',{id:'current-run',owner:'this-page',startedAt,...(options.manual||{})});
 if(options.lease)store.set('lease',options.lease);
 if(options.paused)store.set('enabled',false);
 return api.captureLiveSnapshot(now);
}
const ownLease={owner:'manual:current-run',manualRunId:'current-run',expiresAt:now+45000};
test('idle clock uses latest result and separates batch start',()=>{const s=idleFixture();assert.equal(s.ageSeconds,1213);assert.equal(s.runStartedAt,now-8895000);const t=api.captureLiveText(s);assert.match(t.last,/20 分钟前/);assert.notEqual(t.started,t.last);});
test('batch start alone is never fabricated as progress',()=>{const s=idleFixture({summary:{results:[]}});assert.equal(s.lastAt,null);assert.equal(s.ageSeconds,null);assert.equal(api.captureLiveText(s).last,'尚无采集进展');});
test('no active DOI cannot imply PDF is unnecessary or already complete',()=>{const s=idleFixture();s.row={pdfStatus:'stored',pdfBytes:2000};assert.equal(api.captureLiveText(s).pdf,'等待下一篇');});
test('manual lease belongs to this page despite manual owner prefix',()=>{assert.equal(idleFixture({lease:ownLease}).state,'between_jobs');});
test('valid foreign lease is described as held not proven capture activity',()=>{const s=idleFixture({manual:{owner:'other-page'},lease:ownLease});assert.equal(s.state,'other_controller');assert.match(api.captureLiveText(s).state,/持有/);});
test('expired manual lease exposes interruption without altering stored state',()=>{const s=idleFixture({lease:{...ownLease,expiresAt:now-1}});const before=JSON.stringify([...store]);assert.equal(s.state,'interrupted');api.captureLiveText(s);api.captureLiveSnapshot(now+1);assert.equal(JSON.stringify([...store]),before);});
test('old waiting phase cannot conceal an interrupted executor',()=>{const s=idleFixture({summary:{phase:'retry_wait'}});assert.equal(s.state,'interrupted');assert.match(api.captureLiveText(s).state,/已中断/);});
test('pause outranks stale queue phase in snapshot and rendered text',()=>{const s=idleFixture({paused:true,summary:{phase:'retry_wait'},lease:ownLease});assert.equal(s.state,'paused');assert.equal(api.captureLiveText(s).state,'已暂停');});
test('completed manual marker remains complete rather than interrupted',()=>{const s=idleFixture({manual:{completedAt:new Date(now-1000).toISOString()},summary:{phase:'blocked_remaining',finishedAt:new Date(now-1000).toISOString()}});assert.equal(s.state,'blocked_remaining');});
test('retry countdown retains a valid same-page execution owner',()=>{assert.equal(idleFixture({summary:{phase:'retry_wait'},lease:ownLease}).state,'retry_wait');});
test('new run cannot inherit older summary completion and events',()=>{const s=idleFixture({manual:{id:'new-run',startedAt:new Date(now-1000).toISOString()},summary:{phase:'all_resolved',finishedAt:new Date(now-500).toISOString()}});assert.equal(s.state,'starting');assert.equal(s.lastAt,null);assert.equal(s.total,0);});
test('future and pre-run result timestamps are ignored',()=>{const s=idleFixture({summary:{results:[{finishedAt:new Date(now+5000).toISOString()},{finishedAt:new Date(now-9000000).toISOString()}]}});assert.equal(s.lastAt,null);});
test('paused active work cannot be hidden by stale completed summary phase',()=>{idleFixture({paused:true,summary:{phase:'all_resolved'}});store.set(activeKey,{doi,jobId:'active-pause',startedAt:new Date(now-2000).toISOString()});const s=api.captureLiveSnapshot(now);assert.equal(s.state,'pausing');assert.equal(api.captureLiveText(s).state,'正在停止当前任务');});

test('completed pass outranks its still-live cleanup lease',()=>{const at=new Date(now-1000).toISOString();const s=idleFixture({manual:{completedAt:at},summary:{phase:'all_resolved',finishedAt:at},lease:ownLease});assert.equal(s.state,'all_resolved');});
test('new generation rejects old active DOI and live row without storage mutation',()=>{idleFixture({manual:{id:'new-run',startedAt:new Date(now-5000).toISOString()}});store.set(activeKey,{doi,jobId:'old-active',manualRunId:'current-run',controllerId:'manual:current-run',startedAt:new Date(now-4000).toISOString()});store.set(key,{doi,jobId:'old-active',phase:'uploading',at:now-1000});const s=api.captureLiveSnapshot(now);assert.equal(s.active,false);assert.equal(s.doi,'');assert.equal(s.row,null);assert.equal(s.lastAt,null);assert.equal(store.get(activeKey).jobId,'old-active');});
test('a previous local stop cannot conceal a new foreign owner',()=>{ctx.CONTROLLER_STOP_REASON='controller_lease_lost';const s=idleFixture({manual:{owner:'other-page'},lease:ownLease});assert.equal(s.state,'other_controller');assert.equal(ctx.CONTROLLER_STOP_REASON,'controller_lease_lost');ctx.CONTROLLER_STOP_REASON='';});
store.clear();for(const [k,v] of baselineStore)store.set(k,v);

const output=process.env.RUNNER_TEMP||'/tmp';
const browser=await chromium.launch({headless:true});
let page;const browserProblems={console:[],page:[],requests:[]};
try{
 page=await browser.newPage({viewport:{width:1100,height:850}});
 page.on('console',msg=>{if(msg.type()==='error')browserProblems.console.push(msg.text());});
 page.on('pageerror',error=>browserProblems.page.push(error.message));
 page.on('requestfailed',request=>browserProblems.requests.push({url:request.url(),error:request.failure()?.errorText}));
 await page.setContent('<html><body><button id="ordinary">Gallery interaction still works</button><p id="count">0</p></body></html>');
 await page.evaluate(()=>{document.querySelector('#ordinary').onclick=()=>document.querySelector('#count').textContent='1';});
 const fixture={active:{doi,jobId:'browser-task',journal:'JACS',startedAt:new Date().toISOString()},summary:{total:8,results:[],figuresStaged:0},row:{doi,jobId:'browser-task',phase:'uploading',label:'Scheme 2',at:Date.now(),discoveryDone:true,discovered:8,stored:2,failed:0,stagedReceipts:2,reused:0,tocStatus:'already_available',lastError:'',quality:'vector',width:640,height:468}};
 await page.evaluate(({moduleSource,fixture})=>{
   window.P='osg-toc-v6:';window.VERSION='6.2.20';window.CONTROLLER_REVISION='2.2.41';window.CONTROLLER_STOP_REASON='';window.ACTIVE_JOB_KEY='active';window.SUMMARY_KEY='summary';window.ENABLED_KEY='enabled';window.ABORT_KEY='abort';
   window.automaticReportDisplay=()=> '自动报告测试';window.captureNeedText=()=> 'toc+figures';window.captureEvidenceLevelText=()=> 'mock evidence';window.forceStartFromHead=()=>{};window.normalizeDoi=s=>String(s||'').toLowerCase();window.progressKey=d=>'progress:'+d;window.isGalleryPage=()=>true;
   window.fixtureStore=new Map([['active',fixture.active],['summary',fixture.summary],['osg-toc-v6:live-progress-v1',fixture.row]]);
   window.GM_getValue=(k,d)=>window.fixtureStore.has(k)?structuredClone(window.fixtureStore.get(k)):d;
   window.GM_setValue=(k,v)=>{if(k!=='osg-toc-v6:live-panel-open-v1')throw Error('Unexpected control write');window.fixtureStore.set(k,v);};
 },{moduleSource,fixture});
 await page.addScriptTag({content:moduleSource+'\nmountCaptureLivePanel();'});
 await page.locator('#osg-capture-live-panel #label').waitFor();
 test('panel shows actual DOI and in-paper figure count',()=>{});
 assert.equal(await page.locator('#osg-capture-live-panel #doi').textContent(),doi);
 assert.match(await page.locator('#osg-capture-live-panel #figures').textContent(),/2／8/);
 await page.locator('#ordinary').click();assert.equal(await page.locator('#count').textContent(),'1');passed++;console.log('TM222_PASS panel is nonmodal and does not block Gallery');
 await page.evaluate(()=>{const k='osg-toc-v6:live-progress-v1',r=fixtureStore.get(k);fixtureStore.set(k,{...r,phase:'saved',label:'Scheme 3',stored:3,stagedReceipts:3,at:Date.now()});});
 await page.waitForFunction(()=>document.querySelector('#osg-capture-live-panel').shadowRoot.querySelector('#figures').textContent.includes('3／8'));
 passed++;console.log('TM222_PASS panel updates automatically after simulated cross-tab storage event');
 await page.screenshot({path:output+'/tm222-live-panel-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'/tm222-live-panel-mobile.png'});
 const box=await page.locator('#osg-capture-live-panel').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);passed++;console.log('TM222_PASS phone-width panel fits viewport');
 const outerDetails=page.locator('#osg-capture-live-panel details').first();await outerDetails.locator('summary').first().click();assert.equal(await outerDetails.getAttribute('open'),null);passed++;console.log('TM222_PASS panel folds without pausing capture');

 await page.evaluate(()=>{
  window.MANUAL_RUN_KEY='manual';window.LEASE_KEY='lease';window.CONTROLLER_ID='this-page';
  const now=Date.now();fixtureStore.delete('active');
  fixtureStore.set('manual',{id:'current-run',owner:'old-page',startedAt:new Date(now-8895000).toISOString()});
  fixtureStore.set('lease',{owner:'manual:current-run',manualRunId:'current-run',expiresAt:now-1});
  fixtureStore.set('summary',{controllerRunId:'manual:current-run',mode:'missing_only',queueCoverageRevision:'v9',phase:'running',startedAt:new Date(now-8895000).toISOString(),total:166,visitedCount:36,fullyResolved:3,unresolvedCount:163,pendingMissing:130,blockedCount:33,attemptCount:52,results:[{finishedAt:new Date(now-1213000).toISOString(),status:'failed',reason:'test_missing_toc'}]});
 });
 await outerDetails.locator('summary').first().click();
 await page.waitForFunction(()=>document.querySelector('#osg-capture-live-panel').shadowRoot.querySelector('#state').textContent.includes('已中断'));
 assert.equal(await page.locator('#osg-capture-live-panel #pdf').textContent(),'等待下一篇');
 assert.match(await page.locator('#osg-capture-live-panel #last').textContent(),/20 分钟前/);
 assert.ok(await page.locator('#osg-capture-live-panel #started').textContent());
 passed++;console.log('TM222_PASS actual idle panel shows interruption, recent result and waiting PDF');
 await page.screenshot({path:output+'/tm222-idle-panel-mobile.png'});
 assert.deepEqual(browserProblems,{console:[],page:[],requests:[]});
 passed++;console.log('TM222_PASS no browser console, uncaught or network errors');
}catch(error){
 if(page)await page.screenshot({path:output+'/tm222-panel-failure.png',fullPage:true}).catch(()=>{});
 console.log('TM222_BROWSER_FAILURE '+JSON.stringify(browserProblems));throw error;
}finally{await browser.close();}

console.log('TM222_PROGRESS_TEST_SUMMARY '+JSON.stringify({passed,productionWrites:0,scope:'controlled Chromium and mocked GM storage, not authenticated publisher capture'}));

