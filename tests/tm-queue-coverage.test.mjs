import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
const source=fs.readFileSync('public/toc-mainline.user.js','utf8'),P='osg-toc-v6:',EPOCH=1790082000000;
let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('QUEUE_COVERAGE_PASS '+name)};
const article=(n,extra={})=>({doi:'10.1021/jacs.6c'+String(n).padStart(5,'0'),journal:'JACS',addedDate:'2026-10-02',date:'2026-10-01',...extra});
const fig=(doi,n)=>({label:'Figure '+n,sourceUrl:'https://acs.silverchair-cdn.com/10.1021_'+doi.split('/')[1]+'/f'+n+'.png',contentHash:'a'.repeat(32),width:1000,height:500,quality:'high'});
const queue=articles=>({articles,latestAddedDate:'2026-10-02',generatedAt:'2026-10-02T10:00:00Z',webpageDoiCount:articles.length,mediaGeneration:EPOCH});
const inv=articles=>({media:{items:articles.map(a=>({doi:a.doi,tocStored:true,figureCount:2,usableFigureCount:2,capturedFigures:[fig(a.doi,1),fig(a.doi,2)]}))},tocs:{count:0,items:[]},figures:{schemaVersion:'capture-inventory-v1',complete:true,count:articles.length,items:articles.map(a=>({doi:a.doi,expectedFigureCount:2,figures:{}}))},evidence:{count:articles.length,items:articles.map(a=>({doi:a.doi,available:true,evidenceLevel:'partial'}))},errors:[]});
function h(q=queue([]),inventory=inv([]),opts={}){
 const store=new Map(),opened=[],calls=[],timers=new Map();let now=EPOCH+12*86400000,id=0;
 class D extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 const get=u=>{calls.push(u);if(u.includes('capture-capabilities'))return {captureVersion:'6.2.20',mediaControllerRevision:'2.2.41',mediaGeneration:EPOCH,evidenceSchemaVersion:'article-evidence-v2',mode:'verified-staging'};
  if(u.includes('toc-demand'))return q;if(u.includes('local-capture-index'))return inventory.tocs;if(u.includes('/staged?'))return inventory.figures;throw Error('unexpected get '+u)};
 const ctx=vm.createContext({console,Date:D,URL,Map,Set,document:{},crypto:{randomUUID},location:{hostname:'gallery.gczhouwld.com',pathname:'/',href:'https://gallery.gczhouwld.com/',hash:''},window:{open(){},close(){},alert(){},prompt(){return null}},
 GM_getValue:(k,d)=>store.has(k)?structuredClone(store.get(k)):d,GM_setValue:(k,v)=>store.set(k,structuredClone(v)),GM_deleteValue:k=>store.delete(k),GM_listValues:()=>[...store.keys()],GM_registerMenuCommand(){},
 setTimeout:(f,ms)=>{timers.set(++id,{f,ms});return id},clearTimeout:i=>timers.delete(i),setInterval:(f,ms)=>{timers.set(++id,{f,ms,interval:true});return id},clearInterval:i=>timers.delete(i),
 __get:async u=>opts.get?opts.get(u,get):get(u),__post:async(u,p)=>{calls.push(u);if(opts.post)return opts.post(u,p);return {items:inventory.media.items.filter(x=>p.dois.includes(x.doi))}},__private:async()=>{if(opts.evidenceError)throw Error('private_http_401');return inventory.evidence},__sleep:async ms=>{if(opts.sleep)await opts.sleep(ms,advance=>{now+=advance});else now+=ms},
 GM_openInTab:u=>{if(opts.openTabFailure)throw Error('task_tab_open_failed');const j=store.get(P+'active-job');opened.push(structuredClone(j));if(!opts.noResult)store.set(P+'result:'+j.doi,Object.assign({doi:j.doi,jobId:j.jobId,version:'6.2.20',finishedAt:new D().toISOString(),status:'success',toc:{status:j.captureToc?'stored':'already_available'},privatePdf:j.capturePrivatePdf?{status:'stored'}:null,fulltext:{status:opts.failText?'failed':(j.captureEvidence||j.opportunisticEvidence)?'stored':'not_requested'}},opts.result?opts.result(j,opened.length,store):{}));return {closed:false,close(){this.closed=true}};}
 });
 const cut=source.lastIndexOf('  installManualRestartListener();');
 vm.runInContext(source.slice(0,cut)+`
 isGalleryPage=()=>true;writeToken=()=> 'fixture';badge=()=>{};sleep=__sleep;getJson=__get;postReadJson=__post;getPrivateJson=__private;inventoryReadMetadataJson=async(o,p)=>String(o.method||'GET').toUpperCase()==='POST'?__post(o.url,JSON.parse(o.data||'{}')):String(o.url||'').includes('evidence-inventory')?__private(o.url):__get(o.url);enqueueCaptureReport=()=>true;
 globalThis.T={coverageStats,coveragePending,coverageMergePlan,coverageApplyFreshPlan,coverageRemaining,metadataJson,metadataTransport:(g,n)=>{gmRequest=g;nativeControllerRequest=n;},buildMissingCaptureJobs,captureNeedText,captureLiveText,captureLiveSnapshot,forceStartFromHead,manualRunBlocksAutomatic,readMissingCaptureInventory,checkpointKey};
 })();`,ctx);
 return {T:ctx.T,ctx,store,opened,calls,timers,plan:(ar=q.articles,i=inventory)=>{const run={id:'test',summary:{results:[]}};return {jobs:Array.from(ctx.T.buildMissingCaptureJobs(queue(ar),run,i)),summary:run.summary};}};
}
const summary=()=>({results:[],remainingNeeds:{}});
const fakeJob=(n,flags={})=>({...article(n),captureFigures:true,captureToc:false,captureEvidence:false,capturedFigures:{},...flags});
const historicalTocJob=(n,extra={})=>({
 ...article(n,{date:'2026-09-20',addedDate:'2026-10-10',mediaPolicy:'toc_only',ingestionChannel:'historical_backfill'}),
 captureToc:true,captureFigures:false,captureEvidence:false,capturePrivatePdf:false,
 opportunisticFigures:false,opportunisticEvidence:false,existingTocKind:'figure1',
 capturedFigures:{},...extra
});
await test('historical Figure1 fallback never removes official TOC need on warm/fresh inventory refresh',()=>{
 const x=h(),run={summary:summary()},job=historicalTocJob(95);
 x.T.coverageMergePlan(run,[job]);
 x.T.coverageApplyFreshPlan(run,[{...job}],true);
 x.T.coverageMergePlan(run,[{...job}]);
 const current=run.coverage.get(job.doi);
 assert.equal(current.job.captureToc,true);
 assert.equal(current.job.capturePrivatePdf,false);
 assert.equal(current.job.opportunisticFigures,false);
 assert.equal(current.job.opportunisticEvidence,false);
 assert.equal(x.T.coveragePending(run).length,1);
 x.T.coverageStats(run);
 assert.equal(run.summary.unresolvedCount,1);
 assert.equal(run.summary.fullyResolved,0);
});
await test('historical fallback upload cannot count as official TOC completion',()=>{
 const x=h(),run={summary:summary()},job=historicalTocJob(96);
 x.T.coverageMergePlan(run,[job]);
 x.T.coverageRemaining(run,job,{status:'partial',reason:'only_verified_figure1_fallback',
   toc:{status:'stored',kind:'figure1',productionFallbackStored:true}});
 const row=run.coverage.get(job.doi);
 assert.equal(row.job.captureToc,true);
 assert.equal(row.state,'blocked');
 x.T.coverageStats(run);
 assert.equal(run.summary.fullyResolved,0);
 assert.equal(run.summary.unresolvedCount,1);
});
await test('historical official TOC requires a production-backed receipt, not local-only bytes',()=>{
 const x=h(),run={summary:summary()},job=historicalTocJob(97);
 x.T.coverageMergePlan(run,[job]);
 x.T.coverageRemaining(run,job,{status:'partial',reason:'unpublished_official_asset',
   toc:{status:'stored',kind:'official',productionTocStored:false}});
 assert.equal(run.coverage.get(job.doi).job.captureToc,true);
 assert.equal(run.coverage.get(job.doi).state,'blocked');
 const x2=h(),run2={summary:summary()},job2=historicalTocJob(98);
 x2.T.coverageMergePlan(run2,[job2]);
 x2.T.coverageRemaining(run2,job2,{status:'success',
   toc:{status:'stored',kind:'official',productionTocStored:true}});
 assert.equal(run2.coverage.get(job2.doi).state,'resolved');
 x2.T.coverageStats(run2);
 assert.equal(run2.summary.fullyResolved,1);
});
await test('panel distinguishes full registry from eligible scope and never counts untouched inventory as current success',()=>{
 const x=h(),r={summary:summary()},j1=fakeJob(1,{captureFigures:false,captureToc:true}),j2=fakeJob(2,{captureFigures:false,captureToc:true});
 x.T.coverageMergePlan(r,[j1,j2]);
 x.T.coverageApplyFreshPlan(r,[j2],true);
 x.T.coverageStats(r);
 assert.equal(r.summary.total,2);
 assert.equal(r.summary.fullyResolved,0);
 assert.equal(r.summary.inventoryAlreadySatisfiedCount,1);
 assert.equal(r.summary.unresolvedCount,1);
 const words=x.T.captureLiveText({
   scopeRevision:'20261008-added-date-only-v1',coverageRevision:'v10',
   scopeCount:938,scopeRecentCount:197,scopeHistoricalCount:733,scopeExcludedCount:8,
   phase:'blocked_remaining',total:2,completed:0,inventoryAlreadySatisfiedCount:1,
   fullyResolved:0,unresolvedCount:1,pendingMissing:1,deferredCount:0,blockedCount:0,
   attemptCount:0,remainingNeeds:{toc:1,pdf:0},ownerPdfInventory:{ready:0,pending:0,failed:0,unknown:733},
   ownerPdfInventoryState:'owner_lease_missing',inventoryProgress:{},
   inventoryErrors:[],pendingPreview:[],blockedPreview:[],deferredPreview:[]
 });
 assert.match(words.gaps,/目录 938 篇（10月起常规 197／7—9月历史仅补官方TOC 733／其他不派发 8）/);
 assert.doesNotMatch(words.gaps,/10\\.1起 938/);
 assert.match(words.batch,/库存核实已齐 1 篇/);
 assert.match(words.batch,/确认补齐 0 篇/);
});
await test('single run visits61 missing articles, including all after40',async()=>{
 const ar=Array.from({length:61},(_,n)=>article(n)),i=inv(ar);i.media.items.forEach(x=>x.tocStored=false);
 const x=h(queue(ar),i);await x.T.forceStartFromHead();const s=x.store.get(P+'last-run-summary');
 assert.equal(x.opened.length,61);assert.equal(s.total,61);assert.equal(s.visitedCount,61);assert.equal(s.fullyResolved,61);assert.equal(s.unresolvedCount,0);assert.equal(new Set(x.opened.map(j=>j.manualRunId)).size,1);
});
await test('40 attempts with27partial11failed2blocked does not report0remaining',()=>{
 const x=h(),r={summary:summary()};x.T.coverageMergePlan(r,Array.from({length:40},(_,n)=>fakeJob(n)));
 for(const [n,v] of [...r.coverage.values()].entries()){
  const result={status:n<27?'partial':'failed',reason:n<27?'no_more_candidates':'publisher_access_gate',figures:{discovered:7,stored:5,failed:2,items:[]}};
  x.T.coverageRemaining(r,v.job,result);r.summary.results.push(result);
 }
 x.T.coverageStats(r);assert.equal(r.summary.unresolvedCount,40);assert.equal(r.summary.fullyResolved,0);assert.equal(r.summary.blockedCount,40);
 x.store.set(P+'last-run-summary',{...r.summary,queueCoverageRevision:'v6',scopeRevision:'20261008-added-date-only-v1',scopeCount:40,phase:'blocked_remaining'});
 const snapshot=x.T.captureLiveSnapshot(x.ctx.Date.now());assert.equal(snapshot.state,'blocked_remaining');
 const t=x.T.captureLiveText(snapshot);
 assert.match(t.gaps,/未补齐 40/);assert.match(t.state,/未补齐/);
});
await test('new valid partial receipt requeues only remaining layer',()=>{
 const x=h(),r={summary:summary()},j=fakeJob(1,{captureToc:true,captureEvidence:true});x.T.coverageMergePlan(r,[j]);
 x.T.coverageRemaining(r,j,{status:'partial',toc:{status:'stored',kind:'official'},fulltext:{status:'stored',evidenceLevel:'complete'},figures:{discovered:3,stored:1,failed:2,items:[{...fig(j.doi,1),status:'staged'}]}});
 const v=r.coverage.get(j.doi);assert.equal(v.state,'pending');assert.equal(v.job.captureToc,false);assert.equal(v.job.captureEvidence,false);assert.equal(v.job.captureFigures,true);assert.equal(v.job.missingFigureCount,2);assert.equal(Object.keys(v.job.capturedFigures).length,1);
});
await test('production-confirmed Figure 1 fallback closes the current-run TOC gap',()=>{
 const x=h(),r={summary:summary()},j=fakeJob(91,{captureToc:true,captureFigures:false,captureEvidence:false,capturePrivatePdf:false});
 x.T.coverageMergePlan(r,[j]);
 x.T.coverageRemaining(r,j,{status:'partial',reason:'combined_capture',toc:{status:'stored',kind:'figure1',productionFallbackStored:true}});
 const row=r.coverage.get(j.doi);assert.equal(row.job.captureToc,false);assert.equal(row.state,'resolved');
 x.T.coverageStats(r);assert.equal(r.summary.fullyResolved,1);assert.equal(r.summary.unresolvedCount,0);
});
await test('unconfirmed local Figure 1 does not falsely close a live TOC gap',()=>{
 const x=h(),r={summary:summary()},j=fakeJob(92,{captureToc:true,captureFigures:false,captureEvidence:false,capturePrivatePdf:false});
 x.T.coverageMergePlan(r,[j]);
 x.T.coverageRemaining(r,j,{status:'partial',reason:'no_usable_official_or_figure1',toc:{status:'stored',kind:'figure1',productionFallbackStored:false}});
 const row=r.coverage.get(j.doi);assert.equal(row.job.captureToc,true);assert.equal(row.state,'blocked');
});
await test('same valid receipt twice does not cause infinite progress retries',()=>{
 const x=h(),r={summary:summary()},j=fakeJob(1);x.T.coverageMergePlan(r,[j]);const result={status:'partial',reason:'combined_capture',figures:{discovered:3,stored:1,failed:2,items:[{...fig(j.doi,1),status:'staged'}]}};
 x.T.coverageRemaining(r,j,result);const row=r.coverage.get(j.doi);assert.equal(row.state,'pending');x.T.coverageRemaining(r,row.job,result);assert.equal(row.state,'blocked');
});
await test('failed metadata refresh cannot erase previous pending gap',()=>{
 const x=h(),r={summary:summary()},j=fakeJob(1);x.T.coverageMergePlan(r,[j]);x.T.coverageMergePlan(r,[]);assert.equal(x.T.coveragePending(r).length,1);
});
await test('partial continuation waits until every first-pass item has its turn',()=>{
 const x=h(),r={summary:summary()};x.T.coverageMergePlan(r,[fakeJob(1),fakeJob(2)]);r.coverage.get(article(1).doi).attempts=1;assert.equal(x.T.coveragePending(r)[0].job.doi,article(2).doi);
});
await test('image provenance failure is held without retries',()=>{
 const x=h(),r={summary:summary()},j=fakeJob(1);x.T.coverageMergePlan(r,[j]);x.T.coverageRemaining(r,j,{status:'failed',reason:'media_source_doi_mismatch'});assert.equal(r.coverage.get(j.doi).state,'blocked');
});
await test('transient failure retries once then remains visibly blocked',()=>{
 const x=h(),r={summary:summary()},j=fakeJob(1);x.T.coverageMergePlan(r,[j]);const e={status:'failed',reason:'upload_http_503'};x.T.coverageRemaining(r,j,e);assert.equal(r.coverage.get(j.doi).state,'pending');x.T.coverageRemaining(r,j,e);assert.equal(r.coverage.get(j.doi).state,'blocked');
});
await test('unavailable metadata is unknown, not an empty inventory',async()=>{
 let failed=false;const ar=[article(1)],i=inv(ar),x=h(queue(ar),i,{get:(u,g)=>{if(failed&&u.includes('/staged?'))throw Error('queue_http_503');return g(u)}});
 const first=await x.T.readMissingCaptureInventory(queue(ar));assert.equal(first.figures.complete,true);
 failed=true;const second=await x.T.readMissingCaptureInventory(queue(ar));assert.equal(second.figures,null);assert.ok(second.errors.some(e=>e.includes('503')));
});
await test('initial transient stage inventory503 recovers in same click',async()=>{
 let fails=0;const ar=[article(1)],i=inv(ar);i.media.items[0].tocStored=false;
 const x=h(queue(ar),i,{get:(u,g)=>{if(u.includes('/staged?')&&fails++===0)throw Error('queue_http_503');return g(u)}});
 await x.T.forceStartFromHead();assert.equal(x.opened.length,1);assert.equal(x.store.get(P+'last-run-summary').fullyResolved,1);assert.equal(x.store.get(P+'last-run-summary').inventoryUnknown,0);
});
await test('inventory503 mid-run never truncates61 known tasks to40',async()=>{
 const ar=Array.from({length:61},(_,n)=>article(n)),i=inv(ar);i.media.items.forEach(x=>x.tocStored=false);let stages=0;
 const x=h(queue(ar),i,{get:(u,g)=>{if(u.includes('/staged?')&&stages++>0)throw Error('queue_http_503');return g(u)}});
 await x.T.forceStartFromHead();assert.equal(x.opened.length,61);assert.equal(x.store.get(P+'last-run-summary').fullyResolved,61);assert.ok(x.store.get(P+'last-run-summary').inventoryErrors.some(e=>e.includes('保留本轮')));
});
await test('error at article21 does not prevent article61',async()=>{
 const ar=Array.from({length:61},(_,n)=>article(n)),i=inv(ar);i.media.items.forEach(x=>x.tocStored=false);
 const x=h(queue(ar),i,{result:j=>j.doi===ar[20].doi?{status:'failed',reason:'publisher_access_gate',toc:{status:'failed'},fulltext:{status:'failed'}}:{}});
 await x.T.forceStartFromHead();const s=x.store.get(P+'last-run-summary');assert.equal(x.opened.length,61);assert.equal(s.visitedCount,61);assert.equal(s.fullyResolved,60);assert.equal(s.unresolvedCount,1);assert.equal(s.phase,'blocked_remaining');
});
await test('body-completeness unknown never becomes a queue task',()=>{
 const ar=[article(1)],i=inv(ar);i.figures.items[0].expectedFigureCount=0;const x=h(queue(ar),i);assert.equal(x.plan().jobs.length,0);
});
await test('same-endpoint HTML503 metadata fallback retains original authorization',async()=>{
 const x=h();let native=0;const options={method:'GET',url:'https://api.gczhouwld.com/api/article-summary/evidence-inventory',headers:{authorization:'Bearer fixture'}};
 x.T.metadataTransport(async()=>({status:503,responseText:'<html>Gateway</html>',responseHeaders:''}),async o=>{native++;assert.equal(o,options);return {status:200,responseText:'{"items":[],"count":0}'}});
 const v=await x.T.metadataJson(options,'private');assert.equal(native,1);assert.equal(v.count,0);
});
await test('401 and429 metadata reads do not trigger transport fallback',async()=>{
 for(const status of [401,403,429]){const x=h();let n=0;x.T.metadataTransport(async()=>({status,responseText:'<html>Denied</html>',responseHeaders:'retry-after: 120'}),async()=>{n++;});
 await assert.rejects(x.T.metadataJson({url:'https://api.gczhouwld.com/api/media/inventory'},'inventory'),e=>e.httpStatus===status&&e.retryAfterMs===120000);assert.equal(n,0);}
});
await test('Retry-After on HTML503 is preserved, not bypassed',async()=>{
 const x=h();let n=0;x.T.metadataTransport(async()=>({status:503,responseText:'<html>Wait</html>',responseHeaders:'Retry-After: 30'}),async()=>{n++;});
 await assert.rejects(x.T.metadataJson({url:'https://api.gczhouwld.com/api/media/inventory'},'inventory'),e=>e.retryAfterMs===30000);assert.equal(n,0);
});
await test('private evidence inventory401 does not block the queue',async()=>{
 const ar=[article(1)],x=h(queue(ar),inv(ar),{evidenceError:true});await x.T.forceStartFromHead();const s=x.store.get(P+'last-run-summary');assert.equal(s.inventoryUnknown,0);assert.equal(s.ownerPdfInventoryState,'owner_lease_missing');assert.equal(s.phase,'inventory_partial');assert.equal(x.opened.length,0);
});
await test('existing TOC gap opens once and captures the incomplete body figures in that visit',async()=>{
 const ar=[article(1)],i=inv(ar);i.media.items[0].tocStored=false;i.figures.items[0].expectedFigureCount=3;let n=0;
 const x=h(queue(ar),i,{result:j=>{n++;return {status:'success',toc:{status:'stored',kind:'official'},figures:{discovered:3,stored:3,failed:0,items:[{...fig(j.doi,3),status:'staged'}]},fulltext:{status:'not_requested'}}}});await x.T.forceStartFromHead();const s=x.store.get(P+'last-run-summary');assert.equal(n,1);assert.equal(s.total,1);assert.equal(s.fullyResolved,1);assert.equal(s.unresolvedCount,0);
});

await test('verified 429 publisher limit defers 23 items without fabricated visits and retries after deadline',async()=>{
 const ar=Array.from({length:23},(_,n)=>article(n)),i=inv(ar);i.media.items.forEach(x=>x.tocStored=false);
 let release;const barrier=new Promise(resolve=>{release=resolve;});
 const x=h(queue(ar),i,{sleep:async(ms,advance)=>{await barrier;advance(ms);}});
 const until=x.ctx.Date.now()+2500;
 x.store.set(P+'publisher-access-cooldown:acs',{revision:'20261010-doi-first-authoritative-global-v1',
   scope:'publisher',publisher:'acs',doi:ar[0].doi,
   reason:'publisher_http_429_retry_after',httpStatus:429,retryAfterMs:2500,verified:true,at:x.ctx.Date.now(),until});
 const running=x.T.forceStartFromHead();
 let snap=null;
 for(let n=0;n<100;n++){
   await new Promise(resolve=>setImmediate(resolve));
   snap=x.store.get(P+'last-run-summary');
   if(snap&&snap.phase==='cooldown_wait')break;
 }
 try{
   assert.equal(snap.phase,'cooldown_wait');
   assert.equal(snap.total,23);assert.equal(snap.visitedCount,0);assert.equal(snap.attemptCount,0);
   assert.equal(snap.blockedCount,0);assert.equal(snap.deferredCount,23);
   assert.equal(snap.deferredNextAt,until);assert.equal(x.opened.length,0);
   const text=x.T.captureLiveText(x.T.captureLiveSnapshot(x.ctx.Date.now()));
   assert.match(text.batch,/本轮缺项 23 篇 · 实际访问 0 篇/);
   assert.match(text.gaps,/冷却等待 23/);
   assert.doesNotMatch(text.state,/已遍历全部/);
 }finally{release();}
 await running;
 const final=x.store.get(P+'last-run-summary');
 assert.equal(x.opened.length,23);assert.equal(final.visitedCount,23);
 assert.equal(final.attemptCount,23);assert.equal(final.deferredCount,0);
 assert.equal(final.fullyResolved,23);
});
await test('unaffected publisher runs during another publisher cooldown',async()=>{
 const ar=[article(1),article(2,{doi:'10.1039/d6sc00001a',journal:'Chemical Science',publisher:'rsc'})],i=inv(ar);
 i.media.items.forEach(x=>x.tocStored=false);
 const x=h(queue(ar),i);
 x.store.set(P+'publisher-access-cooldown:acs',{revision:'20261010-doi-first-authoritative-global-v1',
   scope:'publisher',publisher:'acs',doi:ar[0].doi,reason:'publisher_http_429_retry_after',
   httpStatus:429,retryAfterMs:3000,verified:true,at:x.ctx.Date.now(),until:x.ctx.Date.now()+3000});
 await x.T.forceStartFromHead();
 assert.deepEqual(x.opened.map(j=>j.publisher),['rsc','acs']);
 assert.equal(x.store.get(P+'last-run-summary').attemptCount,2);
});
await test('owner PDF missing, expired, and unreadable inventory remain distinct from missing PDF',async()=>{
 const ar=[article(7)],i=inv(ar),x=h(queue(ar),i),q=queue(ar);
 const first=await x.T.readMissingCaptureInventory(q);
 assert.equal(first.pdf.reason,'owner_lease_missing');
 const state={id:'fixture',summary:{results:[]}};
 x.T.buildMissingCaptureJobs(q,state,first);
 assert.equal(state.summary.ownerPdfInventoryState,'owner_lease_missing');
 x.store.set(P+'private-pdf-capture-lease-v1',{scope:'private_pdf_capture',token:'placeholder',
   expiresAt:x.ctx.Date.now()-1000});
 const expired=await x.T.readMissingCaptureInventory(q);
 assert.equal(expired.pdf.reason,'owner_lease_expired');
 const failed=h(q,i,{post:(url,p)=>{
   if(url.includes('/private-pdf/capture-inventory'))throw Error('inventory_http_503');
   return {items:i.media.items.filter(v=>p.dois.includes(v.doi))};
 }});
 failed.store.set(P+'private-pdf-capture-lease-v1',{scope:'private_pdf_capture',token:'placeholder',
   expiresAt:failed.ctx.Date.now()+3600000});
 const unreadable=await failed.T.readMissingCaptureInventory(q);
 assert.equal(unreadable.pdf.complete,false);
 assert.match(unreadable.pdf.reason,/503/);
 const failState={id:'fixture',summary:{results:[]}};
 failed.T.buildMissingCaptureJobs(q,failState,unreadable);
 assert.equal(failState.summary.ownerPdfInventoryState,'read_failed');
 assert.equal(failState.summary.ownerPdfInventory.missing,0);
 assert.equal(failState.summary.ownerPdfInventory.unknown,1);
});


await test('pre-opening task failure is an attempt but never a publisher visit',async()=>{
 const ar=[article(8)],i=inv(ar);i.media.items[0].tocStored=false;
 const x=h(queue(ar),i,{openTabFailure:true});await x.T.forceStartFromHead();
 const s=x.store.get(P+'last-run-summary');
 assert.equal(s.attemptCount,1);assert.equal(s.visitedCount,0);
 assert.equal(s.blockedCount,1);assert.equal(x.opened.length,0);
 const panel=x.T.captureLiveText(x.T.captureLiveSnapshot(x.ctx.Date.now()));
 assert.match(panel.batch,/本轮缺项 1 篇 · 实际访问 0 篇/);
});
console.log(JSON.stringify({passed,revision:'20261008-cooldown-deferred-v1',realPublisherRequests:0,productionWrites:0}));
