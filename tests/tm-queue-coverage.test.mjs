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
 const get=u=>{calls.push(u);if(u.includes('capture-capabilities'))return {captureVersion:'6.2.20',mediaControllerRevision:'2.2.39',mediaGeneration:EPOCH,evidenceSchemaVersion:'article-evidence-v2',mode:'verified-staging'};
  if(u.includes('toc-demand'))return q;if(u.includes('local-capture-index'))return inventory.tocs;if(u.includes('/staged?'))return inventory.figures;throw Error('unexpected get '+u)};
 const ctx=vm.createContext({console,Date:D,URL,Map,Set,document:{},crypto:{randomUUID},location:{hostname:'gallery.gczhouwld.com',pathname:'/',href:'https://gallery.gczhouwld.com/',hash:''},window:{open(){},close(){},alert(){},prompt(){return null}},
 GM_getValue:(k,d)=>store.has(k)?structuredClone(store.get(k)):d,GM_setValue:(k,v)=>store.set(k,structuredClone(v)),GM_deleteValue:k=>store.delete(k),GM_listValues:()=>[...store.keys()],GM_registerMenuCommand(){},
 setTimeout:(f,ms)=>{timers.set(++id,{f,ms});return id},clearTimeout:i=>timers.delete(i),setInterval:(f,ms)=>{timers.set(++id,{f,ms,interval:true});return id},clearInterval:i=>timers.delete(i),
 __get:async u=>opts.get?opts.get(u,get):get(u),__post:async(u,p)=>{calls.push(u);if(opts.post)return opts.post(u,p);return {items:inventory.media.items.filter(x=>p.dois.includes(x.doi))}},__private:async()=>{if(opts.evidenceError)throw Error('private_http_401');return inventory.evidence},__sleep:async ms=>{now+=ms},
 GM_openInTab:u=>{const j=store.get(P+'active-job');opened.push(structuredClone(j));if(!opts.noResult)store.set(P+'result:'+j.doi,Object.assign({doi:j.doi,jobId:j.jobId,version:'6.2.20',finishedAt:new D().toISOString(),status:'success',toc:{status:j.captureToc?'stored':'already_available'},privatePdf:j.capturePrivatePdf?{status:'stored'}:null,fulltext:{status:opts.failText?'failed':(j.captureEvidence||j.opportunisticEvidence)?'stored':'not_requested'}},opts.result?opts.result(j,opened.length,store):{}));return {closed:false,close(){this.closed=true}};}
 });
 const cut=source.lastIndexOf('  installManualRestartListener();');
 vm.runInContext(source.slice(0,cut)+`
 isGalleryPage=()=>true;writeToken=()=> 'fixture';badge=()=>{};sleep=__sleep;getJson=__get;postReadJson=__post;getPrivateJson=__private;enqueueCaptureReport=()=>true;
 globalThis.T={coverageStats,coveragePending,coverageMergePlan,coverageRemaining,metadataJson,metadataTransport:(g,n)=>{gmRequest=g;nativeControllerRequest=n;},buildMissingCaptureJobs,captureNeedText,captureLiveText,captureLiveSnapshot,forceStartFromHead,manualRunBlocksAutomatic,readMissingCaptureInventory,checkpointKey};
 })();`,ctx);
 return {T:ctx.T,ctx,store,opened,calls,timers,plan:(ar=q.articles,i=inventory)=>{const run={id:'test',summary:{results:[]}};return {jobs:Array.from(ctx.T.buildMissingCaptureJobs(queue(ar),run,i)),summary:run.summary};}};
}
const summary=()=>({results:[],remainingNeeds:{}});
const fakeJob=(n,flags={})=>({...article(n),captureFigures:true,captureToc:false,captureEvidence:false,capturedFigures:{},...flags});
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
 const t=x.T.captureLiveText({coverageRevision:'v6',phase:'blocked_remaining',unresolvedCount:40,pendingMissing:0,blockedCount:40,remainingNeeds:r.summary.remainingNeeds,inventoryErrors:[]});
 assert.match(t.gaps,/未补齐 40/);assert.match(t.state,/未补齐/);
});
await test('new valid partial receipt requeues only remaining layer',()=>{
 const x=h(),r={summary:summary()},j=fakeJob(1,{captureToc:true,captureEvidence:true});x.T.coverageMergePlan(r,[j]);
 x.T.coverageRemaining(r,j,{status:'partial',toc:{status:'stored',kind:'official'},fulltext:{status:'stored',evidenceLevel:'complete'},figures:{discovered:3,stored:1,failed:2,items:[{...fig(j.doi,1),status:'staged'}]}});
 const v=r.coverage.get(j.doi);assert.equal(v.state,'pending');assert.equal(v.job.captureToc,false);assert.equal(v.job.captureEvidence,false);assert.equal(v.job.captureFigures,true);assert.equal(v.job.missingFigureCount,2);assert.equal(Object.keys(v.job.capturedFigures).length,1);
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
 const ar=[article(1)],x=h(queue(ar),inv(ar),{evidenceError:true});await x.T.forceStartFromHead();const s=x.store.get(P+'last-run-summary');assert.equal(s.inventoryUnknown,0);assert.equal(s.phase,'all_resolved');assert.equal(x.opened.length,0);
});
await test('body figure completion alone does not open a publisher tab',async()=>{
 const ar=[article(1)],i=inv(ar);i.figures.items[0].expectedFigureCount=3;let n=0;
 const x=h(queue(ar),i,{result:j=>{n++;return {figures:{discovered:3,stored:3,failed:0,items:[{...fig(j.doi,3),status:'staged'}]}}}});await x.T.forceStartFromHead();assert.equal(n,0);assert.equal(x.store.get(P+'last-run-summary').total,0);
});
console.log(JSON.stringify({passed,revision:'20261005-queue-coverage-v7',realPublisherRequests:0,productionWrites:0}));
