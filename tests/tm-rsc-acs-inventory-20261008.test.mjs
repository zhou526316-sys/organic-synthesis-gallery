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
 c.document={querySelectorAll:()=>[],body:{}};
 vm.runInContext(extract('iframeSourceUrls')+
  '\n globalThis.iframeSourceUrlsForTest=iframeSourceUrls;',c);
 const j={doi:'10.1039/d6gc04458a',publisher:'rsc'};
 assert.equal(c.iframeSourceUrlsForTest(j).length,0);
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
   updateInventoryProgress:()=>{},nowIso:()=>new Date().toISOString(),manualExecutionCurrent:()=>true,controllerPaused:()=>false,
   captureLiveError:e=>String(e),coverageTransient:()=>false,sleep:async()=>{},
   MEDIA_INVENTORY_ENDPOINT:'https://api.test/media/inventory',
   CAPTURE_INDEX_URL:'https://api.test/media/local-capture-index',
   WORKER:'https://api.test',
   EVIDENCE_INVENTORY_ENDPOINT:'https://api.test/evidence-inventory',
   writeToken:()=> '测试授权占位符',
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
     if(options.url.includes('evidence-inventory'))return {count:0,items:[]};
     throw Error('unexpected URL');
   }
 };
 vm.createContext(ctx);
 vm.runInContext(extract('readMissingCaptureInventory')+'\n globalThis.load=readMissingCaptureInventory;',ctx);
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
 assert.equal(peak,2);assert.equal(calls,3);
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
