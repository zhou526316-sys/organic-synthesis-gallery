import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
let passed=0;
const clone=x=>x==null?x:structuredClone(x);
function harness(text=source,opt={}) {
  const store=opt.store||new Map(),menus=new Map(),timers=new Map(),opened=[],badges=[];
  let now=1790096000000,id=0,maxLive=0,ctx;
  class Clock extends Date {constructor(...v){super(...(v.length?v:[now]));}static now(){return now;}}
  const set=(k,v)=>store.set(k,clone(v));
  const c={Date:Clock,URL,Set,Map,Promise,crypto:{randomUUID},console,Math,Number,String,Array,Object,RegExp,
    location:{hostname:'zhou526316-sys.github.io',pathname:'/organic-synthesis-gallery/',href:'https://zhou526316-sys.github.io/organic-synthesis-gallery/',hash:''},
    window:{alert(){},prompt(){return null;},open(){throw Error('unexpected window.open');}},
    GM_getValue:(k,d)=>store.has(k)?clone(store.get(k)):d,GM_setValue:set,GM_deleteValue:k=>store.delete(k),GM_listValues:()=>[...store.keys()],
    GM_registerMenuCommand:(n,f)=>menus.set(n,f),
    setTimeout:(f,ms)=>{timers.set(++id,{f,ms});return id;},clearTimeout:i=>timers.delete(i),setInterval:()=>++id,clearInterval(){},
    __badge:t=>badges.push(t),
    __sleep:async ms=>{now+=ms;for(const h of opened)if(h.closeRequested&&!opt.neverClose)h.closed=true;const extra=await opt.onSleep?.(ms,ctx);now+=Math.max(0,Number(extra||0));},
    __getJson:async url=>{await opt.onFetch?.(url,ctx,menus,store);return url.includes('capture-capabilities')?{captureVersion:'6.2.20',mediaGeneration:1790082000000,mode:'verified-staging'}:url.includes('toc-demand')?{generatedAt:'2026-09-22T16:30:47.570Z',mediaGeneration:1790082000000}:{items:{}};},
    GM_openInTab:(url,options)=>{
      const job=store.get('osg-toc-v6:active-job');
      const h={url,options,closed:false,closeRequested:false,close(){this.closeRequested=true;}};
      opened.push(h);maxLive=Math.max(maxLive,opened.filter(h=>!h.closed).length);
      if(!opt.deferResult)set(ctx.T.resultKey(job.doi),{doi:job.doi,jobId:job.jobId,version:'6.2.20',status:'success',finishedAt:new Clock().toISOString(),toc:{status:'stored'},figuresStaged:2});
      opt.onOpen?.(job,ctx,store);
      return opt.promiseHandle?Promise.resolve(h):h;
    },
    __jobs:Array.from({length:Number(opt.jobCount||20)},(_,i)=>({doi:'10.1021/jacs.6c'+String(10000+i),publisher:'acs'})),
  };
  ctx=vm.createContext(c);
  const cut=text.lastIndexOf('  installMenu();');assert.ok(cut>0);
  vm.runInContext(text.slice(0,cut)+`
    isGalleryPage=()=>true;writeToken=()=> 'fixture-only';badge=__badge;sleep=__sleep;getJson=__getJson;
    pairedJobs=()=>__jobs;batchSize=()=>20;selectBatchJobs=(jobs,n)=>jobs.slice(0,n);
    globalThis.T={controllerRun,installMenu,resultKey,progressKey,attemptKey,leaseKey:LEASE_KEY,activeKey:ACTIVE_JOB_KEY,summaryKey:SUMMARY_KEY,owner:CONTROLLER_ID};
  })();`,ctx);
  ctx.T.installMenu();
  return {ctx,store,menus,timers,opened,badges,get maxLive(){return maxLive;},run:()=>ctx.T.controllerRun(),summary:()=>store.get(ctx.T.summaryKey)};
}
async function test(name,fn){await fn();passed++;console.log('TM221_PASS '+name);}
if(process.env.TM221_BASELINE){
 const old=fs.readFileSync(process.env.TM221_BASELINE,'utf8');
 const h=harness(old,{onFetch:async(u,c,m)=>{if(u.includes('capture-capabilities'))m.get('继续媒体抓取主线')();}});
 await h.run();assert.equal(h.opened.length,20);assert.equal(h.summary().failed,20);assert.ok(h.summary().results.every(r=>r.reason==='controller_lease_lost'));
 console.log('TM221_REPRODUCED_PRODUCTION_BUG '+JSON.stringify({opened:h.opened.length,failed:h.summary().failed,reason:'controller_lease_lost'}));
}
await test('repeated resume while loading does not delete lease or duplicate dispatch',async()=>{
 const h=harness(source,{onFetch:async(u,c,m)=>{if(u.includes('capture-capabilities')){m.get('继续媒体抓取主线')();m.get('立即运行媒体抓取队列')();}}});
 await h.run();assert.equal(h.summary().success,20);assert.equal(h.summary().failed,0);assert.equal(h.maxLive,1);assert.ok(h.opened.every(x=>x.closed));
});
await test('lease lost while fetching queue opens zero pages and latches stop',async()=>{
 const h=harness(source,{onFetch:async(u,c,m,s)=>{if(u.includes('toc-demand'))s.delete(c.T.leaseKey);}});
 await h.run();await h.run();assert.equal(h.opened.length,0);assert.equal(h.summary().stopReason,'controller_lease_lost');assert.equal(h.summary().failed,0);assert.equal(h.timers.size,0);
});
await test('lease lost after first open stops entire batch and closes only its page',async()=>{
 const h=harness(source,{onOpen:(j,c,s)=>s.delete(c.T.leaseKey)});await h.run();await h.run();
 assert.equal(h.opened.length,1);assert.ok(h.opened[0].closed);assert.equal(h.summary().failed,0);assert.equal(h.timers.size,0);
});
await test('cannot confirm closed tab means no second open',async()=>{
 const h=harness(source,{neverClose:true});await h.run();await h.run();assert.equal(h.opened.length,1);assert.equal(h.summary().stopReason,'previous_task_tab_not_closed');assert.equal(h.timers.size,0);
});
await test('async tab handle is awaited and closure still enforced',async()=>{
 const h=harness(source,{promiseHandle:true});await h.run();assert.equal(h.summary().success,20);assert.equal(h.maxLive,1);assert.ok(h.opened.every(t=>t.closed));
});
await test('background timer jump past controller timeout still consumes completed publisher result first',async()=>{
 const store=new Map();let injected=false,h;
 h=harness(source,{store,jobCount:1,deferResult:true,onSleep:async(ms,c)=>{
   if(!injected&&ms===1000&&h.opened.length){
     const job=store.get(c.T.activeKey);assert.ok(job);
     store.set(c.T.resultKey(job.doi),{doi:job.doi,jobId:job.jobId,version:'6.2.20',status:'success',finishedAt:new Date(1790096000000+1000).toISOString(),toc:{status:'stored'},figuresStaged:2});
     injected=true;return 9*60*1000;
   }
   return 0;
 }});
 await h.run();assert.equal(h.summary().success,1);assert.equal(h.summary().failed,0);assert.equal(h.summary().results[0].status,'success');
});
await test('finished progress mirror survives delayed result-key visibility',async()=>{
 const store=new Map();let injected=false,h;
 h=harness(source,{store,jobCount:1,deferResult:true,onSleep:async(ms,c)=>{
   if(!injected&&ms===1000&&h.opened.length){
     const job=store.get(c.T.activeKey);assert.ok(job);
     const result={doi:job.doi,jobId:job.jobId,version:'6.2.20',status:'partial',reason:'fixture_finished',finishedAt:new Date(1790096000000+1000).toISOString(),toc:{status:'stored'},figuresStaged:1};
     store.set(c.T.progressKey(job.doi),{jobId:job.jobId,status:'finished',at:result.finishedAt,result});
     injected=true;return 9*60*1000;
   }
   return 0;
 }});
 await h.run();assert.equal(h.summary().partial,1);assert.equal(h.summary().failed,0);assert.equal(h.summary().results[0].reason,'fixture_finished');
});
await test('old controller cleanup cannot erase new owners lease or active job',async()=>{
 const h=harness(source,{onOpen:(j,c,s)=>{s.set(c.T.leaseKey,{owner:'other',expiresAt:1790999999999});s.set(c.T.activeKey,{controllerId:'other',jobId:'other-job'});}});
 await h.run();assert.equal(h.opened.length,1);assert.equal(h.store.get(h.ctx.T.activeKey).jobId,'other-job');assert.equal(h.store.get(h.ctx.T.leaseKey).owner,'other');
});
await test('two gallery pages do not acquire simultaneous dispatch ownership',async()=>{
 const store=new Map(),a=harness(source,{store}),b=harness(source,{store});await Promise.all([a.run(),b.run()]);assert.equal(a.opened.length+b.opened.length,20);assert.ok(a.opened.length===0||b.opened.length===0);
});
await test('manual stop during queue fetch opens no page and preserves pause',async()=>{
 const h=harness(source,{onFetch:async(u,c,m)=>{if(u.includes('toc-demand'))m.get('中止当前媒体抓取批次')();}});await h.run();assert.equal(h.opened.length,0);assert.equal(h.store.get('osg-toc-v6:enabled'),false);assert.equal(h.timers.size,0);
});
await test('clear-failure menu must not delete the live lease',async()=>{
 const h=harness(source,{onFetch:async(u,c,m)=>{if(u.includes('capture-capabilities'))m.get('清除 TOC 失败冷却并立即重试')();}});await h.run();assert.equal(h.summary().success,20);assert.equal(h.summary().failed,0);
});
await test('prior lease-loss results do not impose article failure cooldown',async()=>{
 const h=harness();const key=h.ctx.T.attemptKey('10.1021/jacs.6c10000','6.2.20:paired:1790082000000','figures');h.store.set(key,{version:'6.2.20',reason:'controller_lease_lost',status:'failed',retryCount:3,finishedAt:new Date(1790096000000).toISOString()});await h.run();assert.equal(h.summary().success,20);assert.equal(h.store.get(key).retryCount,1);
});
await test('bound capture nonce and DOI guards remain in source',()=>{
 for(const text of ['assertBoundCaptureJob','capture_job_stale_or_unbound','capture_tab_job_mismatch','page_doi_mismatch','media_source_doi_mismatch','previous_task_tab_not_closed'])assert.ok(source.includes(text));
});
const loader=fs.readFileSync('cloudflare/scripts/build-bridge-loader.mjs','utf8');
await test('legacy viewport collectors are guarded by packaging',()=>{assert.ok(loader.includes('legacy_runtime_media_disabled'));for(const n of ['function queueDoi','function pump','function scan'])assert.ok(loader.includes(n));assert.ok(loader.includes("const loaderVersion = '2.2.26';"));});
console.log('TM221_WINDOW_TEST_SUMMARY '+JSON.stringify({passed,productionWrites:0,environment:'VM mocked GM APIs; not a live Tampermonkey extension'}));
