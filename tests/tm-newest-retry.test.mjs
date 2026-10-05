import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
let passed=0;
async function test(name,fn){await fn();passed++;console.log('TM_NEWEST_RETRY_PASS '+name);}
function harness(overrides={}){
  const data=new Map();
  const ctx=vm.createContext({console,URL,Date,Map,Set,AbortController,setTimeout,clearTimeout,setInterval,clearInterval,
    location:{href:'https://gallery.gczhouwld.com/',hostname:'gallery.gczhouwld.com',pathname:'/'},
    GM_getValue:(k,d)=>data.has(k)?data.get(k):d,GM_setValue:(k,v)=>data.set(k,v),GM_deleteValue:k=>data.delete(k),GM_listValues:()=>[...data.keys()],...overrides});
  const names=['captureQueueTier','compareCaptureJobs','selectBatchJobs','queueRegistryChanged','overnightRetryEligible','articleUrl','resolvePublisherTaskUrl','boundPublisherJobUrl','publisherArticleHostAllowed','isAcsImageViewerUrl','shouldNativeRetryUpload','postJson','gmRequest'];
  const instrumented=source.replace('  installMenu();','  globalThis.api={'+names.join(',')+'}; return;\n  installMenu();');
  assert.notEqual(instrumented,source);
  vm.runInContext(instrumented,ctx);
  return {api:ctx.api,data,ctx};
}
const {api}=harness();
const latest='2026-10-01';
const today=[
 {doi:'10.1021/jacs.test',journal:'JACS',addedDate:latest,captureToc:true,captureFigures:true,mediaNeed:'toc'},
 {doi:'10.1021/acs.joc.test',journal:'JOC',addedDate:latest,captureToc:false,capturePrivatePdf:true,mediaNeed:'pdf'},
];
const old=[{doi:'10.1038/s41586-test',journal:'Nature',addedDate:'2026-09-29',captureToc:true},
 {doi:'10.1126/science.test',journal:'Science',captureToc:true},
 {doi:'10.1021/jacs.old',journal:'JACS',captureToc:true}];
await test('latest TOC leads, historical TOCs stay ahead of PDF-only work',()=>{
 const sorted=api.selectBatchJobs([...old,...today],5,latest);
 assert.deepEqual(Array.from(sorted,x=>x.doi),[today[0].doi,old[0].doi,old[1].doi,old[2].doi,today[1].doi]);
 assert.ok(api.compareCaptureJobs(today[0],old[0],latest)<0);
 assert.ok(api.compareCaptureJobs(today[1],old[2],latest)>0);
});
await test('historical Nature then Science then other TOCs remain ordered',()=>assert.deepEqual(Array.from(api.selectBatchJobs(old,3,latest),x=>x.journal),['Nature','Science','JACS']));
await test('figure/text-only legacy jobs have no queue priority',()=>{assert.equal(api.captureQueueTier({mediaNeed:'figures',captureFigures:true},latest),5);assert.equal(api.captureQueueTier({mediaNeed:'evidence',captureEvidence:true},latest),5);});
await test('publisher access cooldown still excludes latest articles',()=>{const h=harness();h.data.set('osg-toc-v6:publisher-access-cooldown:acs',{until:Date.now()+60000});assert.equal(h.api.selectBatchJobs([today[0]],1,latest).length,0);});
await test('reordered same registry does not restart',()=>assert.equal(api.queueRegistryChanged({latestAddedDate:latest,articles:today},{latestAddedDate:latest,articles:[...today].reverse()}),false));
await test('added DOI restarts between articles',()=>assert.equal(api.queueRegistryChanged({articles:today},{articles:[...today,old[0]]}),true));
await test('removed DOI restarts between articles',()=>assert.equal(api.queueRegistryChanged({articles:today},{articles:today.slice(1)}),true));
await test('new addedDate on same DOI restarts',()=>assert.equal(api.queueRegistryChanged({articles:today},{articles:today.map((x,i)=>i?x:{...x,addedDate:'2026-10-02'})}),true));
await test('queue refresh precedes opening next tab and preserves current result',()=>{const start=source.indexOf('for (var i=0;i<batch.length;i+=1)');const refresh=source.indexOf('queueRegistryChanged(queue,refreshedQueue)',start);assert.ok(refresh>start&&refresh<source.indexOf('GM_openInTab(boundPublisherJobUrl(taskUrl,job.jobId)',start));assert.ok(source.includes('summary.refreshPending||remainingAvailable.length'));assert.ok(source.includes('}, 60 * 1000);'));});
const now=Date.now();
const prior=(minutes,count=1,reason='gm_then_fetch_failed:Failed to fetch')=>({status:'failed',reason,retryCount:count,finishedAt:new Date(now-minutes*60000).toISOString()});
await test('transient retry starts at five minutes, not thirty minutes',()=>{assert.equal(api.overnightRetryEligible(prior(4),now),false);assert.equal(api.overnightRetryEligible(prior(5),now),true);});
await test('transient backoff is bounded 5/15/30/60 minutes',()=>{[5,15,30,60].forEach((m,i)=>{assert.equal(api.overnightRetryEligible(prior(m-1,i+1),now),false);assert.equal(api.overnightRetryEligible(prior(m,i+1),now),true);});});
await test('partial TOC upload503 is retried without discarding staged figures',()=>{const p={...prior(5),status:'partial',reason:'combined_capture',toc:{status:'failed',reason:'upload_http_503'},figures:{status:'staged',items:[{status:'staged',contentHash:'keep'}]}};const before=JSON.stringify(p);assert.equal(api.overnightRetryEligible(p,now),true);assert.equal(JSON.stringify(p),before);});
await test('successful captures are never reopened by retry hotfix',()=>assert.equal(api.overnightRetryEligible({...prior(100),status:'success'},now),false));
await test('authorization and identity failures do not fast retry',()=>{for(const r of ['upload_http_401','image_http_403','media_source_doi_mismatch','evidence_receipt_invalid','publisher_access_gate'])assert.equal(api.overnightRetryEligible(prior(5,1,r),now),false);});
await test('stored Retry-After is respected',()=>assert.equal(api.overnightRetryEligible({...prior(15),retryAfterMs:3600000},now),false));
await test('old CCS injection failure gets one immediate fixed-route retry',()=>{const p={...prior(0,4,'bound_publisher_heartbeat_missing'),doi:'10.31635/ccschem.026.202607330'};assert.equal(api.overnightRetryEligible(p,now),true);p.retryPolicyRevision='20261001-newest-retry-v1';assert.equal(api.overnightRetryEligible(p,now),false);});
await test('CCS requests direct DOI-bound full article not unbound DOI redirect',()=>assert.equal(api.articleUrl({doi:'10.31635/ccschem.026.202607330',captureFigures:true}),'https://www.chinesechemsoc.org/doi/full/10.31635/ccschem.026.202607330'));
await test('Elsevier DOI resolver converts linkinghub PII to bound ScienceDirect article URL',async()=>{const h=harness({GM_xmlhttpRequest:o=>queueMicrotask(()=>o.onload({status:403,finalUrl:'https://linkinghub.elsevier.com/retrieve/pii/S2451929426009999',responseText:''}))});const job={doi:'10.1016/j.chempr.2026.103282',publisher:'elsevier'};assert.equal(await h.api.resolvePublisherTaskUrl(job),'https://www.sciencedirect.com/science/article/pii/S2451929426009999');assert.equal(h.api.boundPublisherJobUrl('https://www.sciencedirect.com/science/article/pii/S2451929426009999','job-1234567890123456'),'https://www.sciencedirect.com/science/article/pii/S2451929426009999#osg-job=job-1234567890123456');});
await test('Elsevier resolver accepts only publisher article hosts and falls back to DOI URL',async()=>{const h=harness({GM_xmlhttpRequest:o=>queueMicrotask(()=>o.onload({status:200,finalUrl:'https://evil.example/retrieve/pii/S2451929426009999',responseText:'https://evil.example/article'}))});const job={doi:'10.1016/j.chempr.2026.103282',publisher:'elsevier'};assert.equal(await h.api.resolvePublisherTaskUrl(job),'https://doi.org/10.1016/j.chempr.2026.103282');assert.equal(h.api.publisherArticleHostAllowed('elsevier','https://www.sciencedirect.com/science/article/pii/X'),true);assert.equal(h.api.publisherArticleHostAllowed('elsevier','https://www.sciencedirect.com.evil.example/X'),false);});
await test('pre-fix Elsevier task-binding failure gets one immediate repaired-route retry',()=>{const p={...prior(0,9,'capture_tab_job_mismatch'),doi:'10.1016/j.chempr.2026.103282'};assert.equal(api.overnightRetryEligible(p,now),true);p.publisherTaskBindingRevision='20261005-interstitial-bind-v4';assert.equal(api.overnightRetryEligible(p,now),false);});
await test('both CCS website origins inject script',()=>{assert.ok(source.includes('// @match        https://www.chinesechemsoc.org/*'));assert.ok(source.includes('// @match        https://chinesechemsoc.org/*'));});
await test('ACS HTML viewer is recognized even with svg suffix',()=>assert.equal(api.isAcsImageViewerUrl('https://pubs.acs.org/view-large/figure/123/test.svg'),true));
await test('real CDN image and foreign sites are not filtered as ACS viewer',()=>{assert.equal(api.isAcsImageViewerUrl('https://acs.silverchair-cdn.com/path/test.svg'),false);assert.equal(api.isAcsImageViewerUrl('https://evil.example/view-large/figure/123/test.svg'),false);});
const gateway={status:503,responseText:'<!doctype html><html>gateway</html>',responseHeaders:'content-type: text/html'};
await test('only owned API gateway markup qualifies for same-endpoint fallback',()=>{assert.equal(api.shouldNativeRetryUpload(gateway,'https://api.gczhouwld.com/api/article-figures/stage'),true);assert.equal(api.shouldNativeRetryUpload(gateway,'https://pubs.acs.org/file'),false);});
await test('401 403 429 and Retry-After are not routed around',()=>{for(const s of [401,403,429])assert.equal(api.shouldNativeRetryUpload({...gateway,status:s},'https://api.gczhouwld.com/api/test'),false);assert.equal(api.shouldNativeRetryUpload({...gateway,responseHeaders:'retry-after: 90'},'https://api.gczhouwld.com/api/test'),false);});
await test('structured Worker errors do not trigger transport fallback',()=>assert.equal(api.shouldNativeRetryUpload({...gateway,responseText:'{"code":"stage_storage_error"}'},'https://api.gczhouwld.com/api/test'),false));
await test('HTTP503 markup switches once to native fetch with identical payload',async()=>{let gm=0,native=0,body='';const payload={doi:today[0].doi,imageData:'bytes'};const h=harness({GM_xmlhttpRequest:o=>{gm++;queueMicrotask(()=>o.onload(gateway));},fetch:async(url,opts)=>{native++;body=opts.body;assert.equal(url,'https://api.gczhouwld.com/api/article-figures/stage');return {ok:true,status:200,text:async()=>' {"stored":true}',headers:{get:()=>''}};}});assert.equal((await h.api.postJson('https://api.gczhouwld.com/api/article-figures/stage',payload,'test-token')).stored,true);assert.equal(gm,1);assert.equal(native,1);assert.equal(body,JSON.stringify(payload));});
await test('failed native fallback is not attempted a second time by postJson',async()=>{let n=0;const h=harness({GM_xmlhttpRequest:o=>queueMicrotask(()=>o.onerror({error:'Failed to fetch'})),fetch:async()=>{n++;throw Error('network unavailable');}});await assert.rejects(h.api.postJson('https://api.gczhouwld.com/api/article-figures/stage',{},''),/gm_then_fetch_failed/);assert.equal(n,1);});
await test('explicit extension permission denial never invokes native fetch',async()=>{let n=0;const h=harness({GM_xmlhttpRequest:o=>queueMicrotask(()=>o.onerror({error:'Request was blocked by the user'})),fetch:async()=>{n++;throw Error('unexpected');}});await assert.rejects(h.api.postJson('https://api.gczhouwld.com/api/article-figures/stage',{},''),/blocked by the user/);assert.equal(n,0);});
await test('CCS backend origin accepted without broadening to impostor hosts',()=>{
 const worker=fs.readFileSync('cloudflare/worker/src/index.js','utf8');
 const a=worker.indexOf('function browserCorsOriginAllowed('),b=worker.indexOf('\nfunction browserCorsHeaders(',a);
 const cors=vm.runInNewContext(worker.slice(a,b)+';browserCorsOriginAllowed',{URL,Set});
 assert.equal(cors('https://www.chinesechemsoc.org'),true);assert.equal(cors('https://chinesechemsoc.org'),true);assert.equal(cors('https://www.chinesechemsoc.org.evil.example'),false);
 const evidence=fs.readFileSync('cloudflare/worker/src/article-summary.js','utf8');
 const st=evidence.indexOf('function hostMatches('),en=evidence.indexOf('function publisherArticleUrlBindsDoi(',st);
 const allowed=vm.runInNewContext(evidence.slice(st,en)+';publisherUrlAllowed',{URL});
 assert.equal(allowed('ccs','https://www.chinesechemsoc.org/doi/full/10.31635/test'),true);assert.equal(allowed('ccs','https://chinesechemsoc.org.evil.example/doi/full/10.31635/test'),false);assert.equal(allowed('acs','https://www.chinesechemsoc.org/doi/full/10.1021/test'),false);
});
await test('protocol, version, generation and ownership guards remain',()=>{for(const text of ["var CONTROLLER_REVISION = '2.2.39';","var VERSION = '6.2.20';",'capture_job_stale_or_unbound','capture_tab_job_mismatch','media_source_doi_mismatch','page_doi_mismatch',"caps.mediaGeneration!==1790082000000","String(caps.mediaControllerRevision||'')!=='2.2.39'"])assert.ok(source.includes(text),text);});
await test('provenance errors retain six-hour protection',()=>assert.equal(api.overnightRetryEligible(prior(45,1,'media_source_doi_mismatch'),now),false));
await test('Retry-After travels through media/evidence completion receipts',()=>{assert.equal((source.match(/result.retryAfterMs=Math.max\(Number\(result.retryAfterMs/g)||[]).length,3);assert.ok(source.includes('retryAfterMs:Number(error&&error.retryAfterMs||0)'));});
console.log(JSON.stringify({passed,productionWrites:0,hotfix:'20261001-newest-retry-v1'}));
