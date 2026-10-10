import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const src=readFileSync('public/toc-mainline.user.js','utf8');
function extract(name){
  const start=src.search(new RegExp('^  (?:async )?function '+name+'\\(', 'm'));
  assert.ok(start>=0,'missing '+name);
  const tail=src.slice(start);
  const end=tail.indexOf('\n  }\n');
  assert.ok(end>0,'cannot find function boundary '+name);
  return tail.slice(0,end+5);
}
function routeContext(){
  const ctx={URL,Set,Map,console,location:{href:'https://pubs.rsc.org/gc/article/doi/10.1039/D6GC04458A/1365974/Title',hostname:'pubs.rsc.org',origin:'https://pubs.rsc.org',pathname:'/gc/article/doi/10.1039/D6GC04458A/1365974/Title'},
    normalizeDoi:v=>String(v||'').trim().toLowerCase(),
    publisherForDoi:d=>d.startsWith('10.1039/')?'rsc':'acs',
    rscPdfPreviewUrl:u=>/\.pdf\.(?:gif|png|jpg|jpeg|webp)(?:[?#]|$)/i.test(String(u)),
    candidateBelongsToJob:(url,job)=>!(/10\.1039[_/](d6gc[0-9a-z]+)/i.test(String(url))&&!String(url).toLowerCase().includes(job.doi.split('/')[1])),
    embeddedJobDois:()=>[],
    reject:()=>false,
    articleFigureImageUrls:node=>node.mockUrls||[],
    normalizeUrl:(url,base)=>new URL(url,base).href,
    contextFor:()=>'', 
  };
  vm.createContext(ctx);
  vm.runInContext(['articleUrl','captureRouteClass','rscSilverchairArticleForJob',
    'rscSilverchairVisualCandidates','rscGraphicalAbstractCandidates']
    .map(extract).join('\n')+'\n globalThis.testFns={articleUrl,captureRouteClass,rscSilverchairArticleForJob,rscSilverchairVisualCandidates,rscGraphicalAbstractCandidates};',ctx);
  return ctx;
}
function visualBlock({kind='visual',url='https://rscj.silverchair-cdn.com/rscj/content_public/journal/gc/ga/10.1039_d6gc04458a/d6gc04458a-ga.png'}={}){
  const visual=kind==='visual',a={tagName:'IMG',mockUrls:[url],
    getAttribute(key){return key==='src'?url:key==='alt'?(visual?'Visual Abstract':'Figure 1'):null;},
    closest(){return null;}};
  const heading={textContent:visual?'Visual Abstract':'Fig. 1 The reaction scheme'};
  const block={getAttribute(key){return key==='class'?(visual?'visual-abstract': 'fig-section'):'';},
    closest(){return null;},
    querySelectorAll(){return [a]}};
  // Heading selectors must expose an isolated heading, image selectors image.
  block.querySelectorAll=selector=>/figcaption|caption|figure-title|h2|h3|h4/.test(selector)?[heading]:[a];
  return {block,image:a,scope:{querySelectorAll:()=>[block]}};
}

test('RSC Silverchair recovery reads only genuine publisher issue/search HTML and rejects non-DOI media',async()=>{
 const events=[],calls=[];
 const doi='10.1039/d6gc03161g';
 const url='https://pubs.rsc.org/en/results?searchtext=10.1039%2Fd6gc03161g';
 const ctx=vm.createContext({
   URL,Number,String,RegExp,DOMParser:class {
     parseFromString(html,mime){assert.equal(mime,'text/html');return {html};}
   },
   normalizeDoi:v=>String(v||'').toLowerCase(),
   captureLiveError:v=>String(v),
   pushTrace:(_trace,row)=>events.push(row),
   gmRequest:async(options,skipFallback)=>{
     calls.push(options);assert.equal(skipFallback,true);assert.equal(options.timeout,10000);
     return {status:200,finalUrl:options.url,responseText:'<!doctype html><html><body><article>10.1039/d6gc03161g</article></body></html>'};
   },
   rscIssueTocCandidatesFromDocument:(job,doc,pageUrl)=>{
     assert.equal(job.doi,doi);assert.equal(pageUrl,url);assert.ok(doc.html.includes(doi));
     return [{kind:'official',url:'https://rscj.silverchair-cdn.com/rscj/content_public/journal/gc/ga/10.1039_d6gc03161g/d6gc03161g-ga.png'}];
   },
 });
 vm.runInContext(extract('rscPublisherListingHtmlCandidates')+'\n globalThis.run=rscPublisherListingHtmlCandidates;',ctx);
 const job={doi,publisher:'rsc'};
 assert.equal((await ctx.run(job,[],url)).length,1);
 assert.equal(calls.length,1);assert.equal(events.at(-1).status,'found');
 assert.equal(await ctx.run(job,[],'https://example.com/en/results?searchtext='+doi),null);
 assert.equal(calls.length,1,'untrusted host must never be fetched');
 ctx.gmRequest=async()=>({status:403,responseText:'Forbidden',finalUrl:url});
 assert.equal((await ctx.run(job,[],url)).length,0);assert.equal(events.at(-1).event,'access_denied');
 ctx.gmRequest=async()=>({status:200,responseText:'<!doctype html><html></html>',finalUrl:'https://other.example/en/results'});
 assert.equal((await ctx.run(job,[],url)).length,0);assert.equal(events.at(-1).event,'redirect_rejected');
 assert.ok(src.includes("if(job.publisher==='rsc' && rscSilverchairArticleForJob(job,location.href))"));
});
test('ACS publisher binding report carries required controller revision, never overrides a final receipt',async()=>{
 let reported=null;
 const ctx=vm.createContext({
   GM_setValue:()=>{},traceKey:doi=>'trace:'+doi,nowIso:()=>new Date('2026-10-08T14:03:00Z').toISOString(),
   postJson:async (_url,payload)=>{reported=payload;return {stored:true};},
   REPORT_ENDPOINT:'https://api.gczhouwld.com/api/media/tampermonkey-report/import',
   CONTROLLER_REVISION:'2.2.41',VERSION:'6.2.20',
   location:{href:'https://pubs.acs.org/doi/10.1021/acs.orglett.6c03611'},
   document:{title:'ACS publisher page'},Number,String,pushTrace:()=>{}
 });
 vm.runInContext(extract('uploadReport')+'\n globalThis.run=uploadReport;',ctx);
 const result=await ctx.run({doi:'10.1021/acs.orglett.6c03611',jobId:'a-valid-job-id',publisher:'acs',mediaNeed:'toc+figures'},[], 'failed','page_doi_unverified',null,'fixture');
 assert.equal(result,true);
 assert.equal(reported.controllerRevision,'2.2.41');
 assert.equal(reported.captureVersion,'6.2.20');
 assert.equal(reported.jobId,'a-valid-job-id');
 assert.equal(reported.final,false);
});

test('unrelated ACS tab cannot upload a binding failure for a different active task',async()=>{
 let reports=0,binding='';
 const job={doi:'10.1021/acs.orglett.6c03611',jobId:'owner-bound-job'};
 const ctx=vm.createContext({
   location:{hostname:'pubs.acs.org',href:'https://pubs.acs.org/doi/10.1021/acscatal.6c06279'},
   GM_getValue:()=>job,ACTIVE_JOB_KEY:'active-job',normalizeDoi:v=>String(v||''),
   sessionStorage:{getItem:()=>binding},P:'osg-toc-v6:',
   bindPublisherCaptureJob:async()=>{throw Error('capture_tab_job_mismatch');},
   finishBoundPublisherPreflightFailure:()=>{reports++;return true;},writeToken:()=> 'test-token'
 });
 vm.runInContext(extract('publisherBoot')+'\n globalThis.run=publisherBoot;',ctx);
 await ctx.run();assert.equal(reports,0,'unrelated publisher tab must not claim a failed capture');
 binding=job.jobId;
 await ctx.run();assert.equal(reports,1,'genuinely bound failed task must hand a durable terminal result to its controller');
});
test('new RSC Silverchair route is recognized and DOI-bound; ACS landing only for missing TOC',()=>{
 const c=routeContext(),job={doi:'10.1039/d6gc04458a',publisher:'rsc'};
 assert.equal(c.testFns.captureRouteClass(c.location.href),'rsc_silverchair_article');
 assert.equal(c.testFns.rscSilverchairArticleForJob(job,c.location.href),true);
 assert.equal(c.testFns.rscSilverchairArticleForJob({...job,doi:'10.1039/d6gc05783g'},c.location.href),false);
 assert.equal(c.testFns.rscSilverchairArticleForJob(job,'https://pubs.rsc.org/en/content/articlehtml/2026/gc/d6gc04458a'),false);
 assert.equal(c.testFns.articleUrl({doi:'10.1021/acs.joc.6c01708',publisher:'acs',captureToc:true,opportunisticFigures:true}),
    'https://pubs.acs.org/doi/10.1021/acs.joc.6c01708');
 assert.equal(c.testFns.articleUrl({doi:'10.1021/acs.joc.6c01708',publisher:'acs',captureToc:false,captureFigures:true}),
    'https://pubs.acs.org/doi/full/10.1021/acs.joc.6c01708');
});
test('only a DOI-bound isolated Visual Abstract from live Silverchair DOM becomes official TOC',()=>{
 const c=routeContext(),job={doi:'10.1039/d6gc04458a',publisher:'rsc',allowFigureOne:true};
 const x=visualBlock();
 const rows=c.testFns.rscSilverchairVisualCandidates(job,x.scope,c.location.href);
 assert.equal(rows.length,1);
 assert.equal(rows[0].kind,'official');
 assert.equal(rows[0].source,'rsc_silverchair_isolated_visual_abstract');
 assert.equal(rows[0].url,x.image.mockUrls[0]);
});
test('Figure 1 may be a legitimate fallback but never when explicitly disabled',()=>{
 const c=routeContext(),x=visualBlock({kind:'figure'});
 const job={doi:'10.1039/d6gc04458a',publisher:'rsc',allowFigureOne:true};
 const rows=c.testFns.rscSilverchairVisualCandidates(job,x.scope,c.location.href);
 assert.equal(rows.length,1);
 assert.equal(rows[0].kind,'figure1');
 assert.equal(c.testFns.rscSilverchairVisualCandidates({...job,allowFigureOne:false},x.scope,c.location.href).length,0);
});
test('same DOI PDF first-page preview, unrelated DOI, publisher logo and nonpublisher images are all rejected',()=>{
 const c=routeContext(),job={doi:'10.1039/d6gc04458a',publisher:'rsc',allowFigureOne:true};
 const bad=[
 'https://rscj.silverchair-cdn.com/rscj/content_public/journal/gc/jam/10.1039_d6gc04458a/1/d6gc04458a.pdf.gif',
 'https://rscj.silverchair-cdn.com/rscj/content_public/journal/gc/ga/10.1039_d6gc05783g/d6gc05783g-ga.png',
 'https://rscj.silverchair-cdn.com/site/logo.png',
 'https://other.example/content/10.1039_d6gc04458a-ga.png'
 ];
 for(const u of bad)assert.equal(c.testFns.rscSilverchairVisualCandidates(job,visualBlock({url:u}).scope,c.location.href).length,0,u);
 assert.equal(c.testFns.rscSilverchairVisualCandidates(job,{querySelectorAll:()=>[]},c.location.href).length,0,
  'Missing visual cannot be fabricated as successful capture');
});
test('old RSC hidden iframe retries are omitted on current Silverchair route only',()=>{
 const c=routeContext();
 c.rscRouteParts=()=>({year:'2026',code:'gc',suffix:'d6gc04458a'});
 c.rscIssuePageUrls=()=>[];
 c.rscSearchResultUrl=job=>'https://pubs.rsc.org/en/results?searchtext='+encodeURIComponent(job.doi);
 c.document={querySelectorAll:()=>[],body:{}};
 vm.runInContext(extract('iframeSourceUrls')+
  '\n globalThis.iframeSourceUrlsForTest=iframeSourceUrls;',c);
 const j={doi:'10.1039/d6gc04458a',publisher:'rsc'};
 assert.deepEqual(Array.from(c.iframeSourceUrlsForTest(j)),
  ['https://pubs.rsc.org/en/results?searchtext=10.1039%2Fd6gc04458a'],
  'one real DOI-specific publisher search endpoint, never a guessed image URL');
 c.rscIssuePageUrls=()=>[
   'https://pubs.rsc.org/gc/issue/34/8',
   'https://pubs.rsc.org/gc/issue/34/9'
 ];
 assert.deepEqual(Array.from(c.iframeSourceUrlsForTest(j)),['https://pubs.rsc.org/gc/issue/34/8'],
   'one genuine DOI-verified publisher issue fallback is allowed');
 c.location.href='https://pubs.rsc.org/en/content/articlelanding/2026/gc/d6gc04458a';
 assert.ok(c.iframeSourceUrlsForTest(j).length>=2);
});

test('five inventory layers never start more than two concurrent network tasks',async()=>{
 let active=0,peak=0,started=[];
 const papers=[{doi:'10.1039/d6gc04458a',addedDate:'2026-10-08'}];
 const ctx={URL,Map,Set,Number,Date,Promise,console,
   RECENT_FULL_CAPTURE_CUTOFF:'2026-10-01',
   normalizeDoi:d=>String(d||'').toLowerCase(),
   recentFullCaptureEligible:x=>x.addedDate>='2026-10-01',
   captureJobEligible:x=>x.addedDate>='2026-10-01',
   updateInventoryProgress:()=>{},nowIso:()=>new Date().toISOString(),manualExecutionCurrent:()=>true,controllerPaused:()=>false,
   captureLiveError:e=>String(e),coverageTransient:()=>false,sleep:async()=>{},
   INVENTORY_REQUEST_TIMEOUT_MS:12000,
   MEDIA_INVENTORY_ENDPOINT:'https://api.test/media/inventory',
   CAPTURE_INDEX_URL:'https://api.test/media/local-capture-index',
   WORKER:'https://api.test',
   EVIDENCE_INVENTORY_ENDPOINT:'https://api.test/evidence-inventory',
   writeToken:()=> '测试授权占位符',
   EVIDENCE_SCHEMA_VERSION:'article-evidence-v2',encodeURIComponent,
   readOwnerPdfInventory:async()=>{
     active++;peak=Math.max(peak,active);started.push('pdf');
     await new Promise(resolve=>setImmediate(resolve));active--;
     return {complete:true,count:1,items:[{doi:papers[0].doi,status:'ready'}]};
   },
   inventoryReadMetadataJson:async options=>{
     active++;peak=Math.max(peak,active);started.push(options.url);
     await new Promise(resolve=>setImmediate(resolve));active--;
     if(options.url.includes('/media/inventory'))return {items:papers.map(x=>({doi:x.doi}))};
     if(options.url.includes('/local-capture-index'))return {items:[],count:0};
     if(options.url.includes('/staged?'))return {schemaVersion:'capture-inventory-v1',complete:true,count:0,items:[]};
     if(options.url.includes('evidence-inventory'))return {schemaVersion:'article-evidence-v2',complete:true,truncated:false,nextCursor:'',count:0,items:[]};
     throw Error('unexpected URL');
   }
 };
 vm.createContext(ctx);
 vm.runInContext(extract('readEvidenceInventoryPaged')+'\n'+extract('readMissingCaptureInventory')+'\n globalThis.load=readMissingCaptureInventory;',ctx);
 const result=await ctx.load({articles:papers});
 assert.ok(peak>=1&&peak<=2,'inventory layers must not exceed two simultaneous requests');
 assert.equal(started.length,5);
 assert.equal(result.pdf.complete,true);
 assert.equal(result.errors.length,0);
});

test('PDF owner inventory reads 177 DOI in batches of at most two and preserves verified rows',async()=>{
 let active=0,peak=0,calls=0;
 const papers=Array.from({length:177},(_,i)=>({doi:'10.1021/jacs.6c'+String(i).padStart(5,'0'),addedDate:'2026-10-08'}));
 const ctx={Map,Set,Date,Promise,console,
   normalizeDoi:d=>String(d||'').toLowerCase(),
   recentFullCaptureEligible:x=>x.addedDate>='2026-10-01',
   privatePdfLease:()=>({token:'测试授权占位符'}),
   GM_getValue:()=>null,PRIVATE_PDF_LEASE_KEY:'test',
   PRIVATE_PDF_INVENTORY_ENDPOINT:'https://api.test/private-pdf/capture-inventory',
   updateInventoryProgress:()=>{},captureLiveError:e=>String(e),
   inventoryReadMetadataJson:async options=>{
     active++;calls++;peak=Math.max(peak,active);
     await new Promise(resolve=>setImmediate(resolve));active--;
     const arr=JSON.parse(options.data).dois;
     return {schemaVersion:'private-pdf-capture-inventory-v1',complete:true,count:arr.length,
       items:arr.map(doi=>({doi,status:'ready'}))};
   }
 };
 vm.createContext(ctx);vm.runInContext(extract('readOwnerPdfInventory')+'\n globalThis.load=readOwnerPdfInventory;',ctx);
 const result=await ctx.load(papers,null);
 assert.equal(peak,2);assert.equal(calls,Math.ceil(177/25));
 assert.equal(result.complete,true);assert.equal(result.items.length,177);
 assert.equal(result.unknown,0);
});
test('inventory transport failure retains native and extension error causes without treating unknown as missing',async()=>{
 const ctx={URL,Number,Map,Set,Date,Promise,Error,AbortController,setTimeout,clearTimeout,
    INVENTORY_REQUEST_TIMEOUT_MS:12000,INVENTORY_HEDGE_DELAY_MS:1,
    GALLERY_HOST:'gallery.gczhouwld.com',PAGES_GALLERY_HOST:'organic-synthesis-gallery-public.pages.dev',
    LEGACY_GALLERY_HOST:'zhou526316-sys.github.io',LEGACY_GALLERY_PATH:'/organic-synthesis-gallery/',
    location:{hostname:'gallery.gczhouwld.com',pathname:'/',href:'https://gallery.gczhouwld.com'},
    captureLiveError:v=>String(v),
    nativeControllerRequest:async()=>{throw Error('controller_native_timeout_12000ms');},
    gmRequest:async()=>{throw Error('gm_request_error:background shutdown');}
 };
 vm.createContext(ctx);
 vm.runInContext(extract('inventoryReadMetadataJson')+'\n globalThis.load=inventoryReadMetadataJson;',ctx);
 await assert.rejects(()=>ctx.load({method:'GET',url:'https://api.test/inventory'},'inventory'),
  e=>/inventory_inventory_transport_failed/.test(e.message)&&/browser:controller_native_timeout/.test(e.message)
   &&/gm:gm_request_error/.test(e.message));
});

test('RSC Silverchair CSS background is accepted only from a DOI-bound isolated visual block',()=>{
 const c=routeContext(),job={doi:'10.1039/d6gc04458a',publisher:'rsc',allowFigureOne:true};
 const x=visualBlock();
 const u=x.image.mockUrls[0];
 x.image.mockUrls=[];
 const old=x.image.getAttribute;
 x.image.getAttribute=(key)=>key==='style'?'background-image: url("'+u+'")':old(key);
 const rows=c.testFns.rscSilverchairVisualCandidates(job,x.scope,c.location.href);
 assert.equal(rows.length,1);
 assert.equal(rows[0].url,u);
 x.image.getAttribute=(key)=>key==='style'?'background-image: url("https://rscj.silverchair-cdn.com/site/logo.png")':old(key);
 assert.equal(c.testFns.rscSilverchairVisualCandidates(job,x.scope,c.location.href).length,0);
});
test('owner PDF transient timeout splits only the failed small batch and preserves all DOI statuses',async()=>{
 const papers=Array.from({length:53},(_,i)=>({doi:'10.1021/jacs.6c'+String(i).padStart(5,'0'),addedDate:'2026-10-08'}));
 let calls=0;
 const ctx={Map,Set,Date,Promise,console,Number,
   normalizeDoi:d=>String(d||'').toLowerCase(),
   recentFullCaptureEligible:x=>x.addedDate>='2026-10-01',
   privatePdfLease:()=>({token:'测试授权占位符'}),GM_getValue:()=>null,
   PRIVATE_PDF_LEASE_KEY:'owner-test',
   PRIVATE_PDF_INVENTORY_ENDPOINT:'https://api.test/private-pdf/capture-inventory',
   updateInventoryProgress:()=>{},captureLiveError:e=>String(e),
   sleep:async()=>{},
   inventoryReadMetadataJson:async options=>{
     const items=JSON.parse(options.data).dois;calls++;
     if(items.length===25&&items[0]===papers[0].doi)throw Error('owner_pdf_inventory_deadline');
     return {schemaVersion:'private-pdf-capture-inventory-v1',complete:true,count:items.length,
       items:items.map(doi=>({doi,status:'ready'}))};
   }
 };
 vm.createContext(ctx);vm.runInContext(extract('readOwnerPdfInventory')+'\n globalThis.load=readOwnerPdfInventory;',ctx);
 const result=await ctx.load(papers,null);
 assert.equal(result.complete,true);
 assert.equal(result.unknown,0);
 assert.equal(result.items.length,53);
 assert.equal(calls,5,'25 initial failed, two split parts, two unaffected batches');
});
test('owner PDF 403 cannot spawn retry requests or turn unknown into missing',async()=>{
 const papers=Array.from({length:25},(_,i)=>({doi:'10.1021/jacs.6c'+String(i).padStart(5,'0'),addedDate:'2026-10-08'}));
 let calls=0;
 const ctx={Map,Set,Date,Promise,console,Number,
   normalizeDoi:d=>String(d||'').toLowerCase(),recentFullCaptureEligible:x=>true,
   privatePdfLease:()=>({token:'测试授权占位符'}),GM_getValue:()=>null,
   PRIVATE_PDF_LEASE_KEY:'owner-test',PRIVATE_PDF_INVENTORY_ENDPOINT:'https://api.test/private-pdf/capture-inventory',
   updateInventoryProgress:()=>{},captureLiveError:e=>String(e),sleep:async()=>{},
   inventoryReadMetadataJson:async()=>{calls++;const e=Error('owner_pdf_inventory_http_403');e.httpStatus=403;throw e;}
 };
 vm.createContext(ctx);vm.runInContext(extract('readOwnerPdfInventory')+'\n globalThis.load=readOwnerPdfInventory;',ctx);
 const result=await ctx.load(papers,null);
 assert.equal(calls,1);
 assert.equal(result.complete,false);
 assert.equal(result.items.length,0);
 assert.equal(result.unknown,25);
 assert.equal(result.errors.length,1);
});
