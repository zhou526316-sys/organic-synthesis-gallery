import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';

const original=await readFile('public/gallery-historical-text-pilot.user.js','utf8');
assert.match(original,/\/\/ @version\s+0\.2\.12/);
assert.match(original,/const BATCH_SCRIPT_VERSION='0\.2\.12'/);
assert.match(original,/const BATCH_BINDING_REVISION='historic-body-early-bound-v031'/);
assert.match(original,/const BATCH_CAPTURE_REVISION='historic-body-evidence-v030'/);
assert.match(original,/scriptVersion:BATCH_SCRIPT_VERSION/);
const anchor="  function batchBoot(){";
assert.ok(original.includes(anchor));
const source=original.replace('const BATCH_PUBLISHER_PROBE_MS=9500;',
  'const BATCH_PUBLISHER_PROBE_MS=45;').replace(anchor,"  globalThis.__batchTest={batchHistoricalPapers,batchLicenseEvidence,batchWorker,batchLoadCanonicalCatalog,batchRetryAllowed,batchStageForStatus,batchNormalizedStatus,batchGroupServerEvents,batchSelectCandidates,batchCoverageSummary,batchLocalSearchTerms,batchLocalEvidenceMatch,batchBodyStructure,batchReuseRights,batchBodyCompleteness,gather,batchPathBindsCurrentJob,batchUnconfirmedPublisherResult,batchParseOfficialOa,batchFetchOfficialOaPacket,batchFinishPublisherTab,batchCloseReviewTabs,batchArticlePageReady,batchEarlyPublisherHeartbeat,batchReviewTabs};\n"+anchor);
const DOI='10.1021/jacs.6c08636',TOKEN='a'.repeat(24),RUN='b'.repeat(24);
function fixture({license='https://creativecommons.org/licenses/by/4.0/',pageDoi=DOI,abstractOnly=false,rightsNotice=false,navigationStatus=null,licenseAfter=0,readyAfter=0,pageTitle='',acsNotice='',acsNoticeOutside=false,
  routePath='/doi/'+DOI,routeHash='#gallery-historical-job='+TOKEN,
  deferDocument=false,expiredJob=false}={}){
  const values=new Map([['gallery-historical-text-batch-v2:job',{
    doi:DOI,publication:'2026-09-14',journal:'JACS',
    title:'A catalytic process',runId:RUN,token:TOKEN,expiresAt:Date.now()+(expiredJob?-20000:20000)
  }]]);
  const nodes=[
    {tagName:'H2',textContent:'Abstract'},
    {tagName:'P',textContent:'A methodology addresses selective carbon-carbon bond forming reactions. '.repeat(5)},
    ...(abstractOnly?[]:[
      {tagName:'H2',textContent:'Mechanistic Studies'},
      {tagName:'P',textContent:'LMCT ligands modulate radical pathways in experimental investigations. '.repeat(5)}
    ]),
    ...(rightsNotice?[
      {tagName:'H2',textContent:'Rights and permissions'},
      {tagName:'P',textContent:'Open Access This article is licensed under a Creative Commons Attribution 4.0 International License. http://creativecommons.org/licenses/by/4.0/ '.repeat(9)}
    ]:[])
  ];
  const footer={id:'',className:'',parentElement:null};
  for(const n of nodes)Object.assign(n,{id:'',className:'',parentElement:footer,closest(){return null;}});
  const copyrightNode={textContent:acsNotice,id:'',className:'',children:[],parentElement:footer,
    closest(){return acsNoticeOutside?{}:null;}};
  const figure={textContent:'Scheme 1. Photoredox reaction mechanism',id:'',className:'',parentElement:footer,closest(){return null;}};
  const table={textContent:'Table 1. Reaction optimization data',id:'',className:'',parentElement:footer,closest(){return null;}};
  const root={querySelectorAll(selector){
    if(selector==='h2,h3,h4,p')return nodes;
    if(selector.startsWith('figure figcaption'))return [figure];
    if(selector==='table')return [table];
    if(selector==='p,span,small,div')return acsNotice?[copyrightNode]:[];
    if(selector.startsWith('[itemprop="license"]'))return [];
    if(selector==='section')return rightsNotice?[{
      querySelector(query){return query==='h2,h3,h4'?{textContent:'Rights and permissions'}:null;},
      textContent:'Open Access This article is licensed under a Creative Commons Attribution 4.0 International License. http://creativecommons.org/licenses/by/4.0/'
    }]:[];
    throw Error('unexpected selector '+selector);
  }};
  let licenseReads=0,readyReads=0,documentReleased=!deferDocument;
  const listeners=new Map(),tabSession=new Map();
  const document={body:footer,title:pageTitle,
    get readyState(){
      if(!documentReleased)return 'loading';
      readyReads++;return readyReads<=readyAfter?'loading':'complete';
    },
    addEventListener(name,handler){
      const callbacks=listeners.get(name)||[];
      callbacks.push(handler);listeners.set(name,callbacks);
    },
    querySelectorAll(selector){
      if(selector.startsWith('meta[name="citation_doi"'))return [{content:pageDoi}];
      if(selector.startsWith('meta[name="citation_license_url"'))return license?[{content:license}]:[];
      if(selector.startsWith('link[rel="license"')){
        licenseReads++;return license&&licenseReads>licenseAfter?[{content:license}]:[];
      }
      throw Error('unexpected doc selector '+selector);
    },
    querySelector(selector){return selector.startsWith('main article')?root:null;},
    createElement(){return {style:{},click(){},remove(){}};}
  };
  const context={
    location:{hostname:'pubs.acs.org',origin:'https://pubs.acs.org',
      pathname:routePath,hash:routeHash},
    document,window:{alert(){},confirm:()=>true},TextEncoder,Blob,crypto:webcrypto,URL,URLSearchParams,
    sessionStorage:{getItem:key=>tabSession.get(key)||null,setItem:(key,value)=>tabSession.set(key,value)},
    performance:{getEntriesByType:()=>[{responseStatus:navigationStatus||0}]},
    GM_getValue:(key,def)=>values.has(key)?values.get(key):def,
    GM_setValue:(key,value)=>values.set(key,value),
    GM_deleteValue:key=>values.delete(key),
    GM_registerMenuCommand:()=>{},
    setTimeout:fn=>{queueMicrotask(fn);return 1;},
    console
  };
  vm.runInNewContext(source,context,{timeout:3000});
  return {context,values,root,tabSession,
    releaseDocument(){
      documentReleased=true;
      for(const kind of ['readystatechange','DOMContentLoaded'])
        for(const callback of listeners.get(kind)||[])callback();
    }
  };
}
const registry={pairedCaptureRegistry:true,webpageDoiCount:5,articles:[
  {doi:DOI,date:'2026-09-14',journal:'JACS'},
  {doi:'10.1038/s44160-026-01100-1',date:'2021-02-02',journal:'Nature Synthesis'},
  {doi:'10.1002/anie.123456',date:'2026-10-04',journal:'Angew'},
  {doi:'10.1021/acs.orglett.2026fake',date:'2025-01-01',journal:'Organic Letters'},
  {doi:DOI,date:'2026-09-14',journal:'JACS'}
]};

test('document-start DOI-bound heartbeat arrives before delayed publisher DOM without claiming content',async()=>{
  const f=fixture({deferDocument:true});
  const progress=f.values.get('gallery-historical-text-batch-v2:publisher-progress-v1');
  assert.equal(progress?.stage,'publisher_dom_wait');
  assert.equal(progress?.token,TOKEN);
  assert.equal(progress?.runId,RUN);
  assert.equal(progress?.pageDoiVerified,false);
  assert.equal(progress?.sectionCount,0);
  assert.equal(progress?.bindingRevision,'historic-body-early-bound-v031');
  assert.equal(f.values.has('gallery-historical-text-batch-v2:result'),false,
    'script activation may not claim scientific text or licence before the page is ready');
  // A publisher SPA may erase its hash before DOM readiness, but a binding
  // recorded in this exact tab's sessionStorage is still valid.
  f.context.location.hash='';
  assert.equal(f.tabSession.get('gallery-historical-text-batch-v2:tab-binding-v030'),TOKEN);
  f.releaseDocument();
  for(let n=0;n<60&&!f.values.has('gallery-historical-text-batch-v2:result');n++)
    await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.values.get('gallery-historical-text-batch-v2:result')?.status,'ok');
  assert.equal(f.values.get('gallery-historical-text-batch-v2:result')?.packet?.publicUploadAllowed,false);
});

test('early heartbeat cannot claim a different token, unrelated tab, expired job or wrong DOI',()=>{
  for(const params of [
    {routeHash:'#gallery-historical-job='+'c'.repeat(24)},
    {routeHash:''},
    {expiredJob:true},
    {pageDoi:'10.1021/jacs.unrelated'}
  ]){
    const f=fixture({...params,deferDocument:true});
    assert.equal(f.values.has('gallery-historical-text-batch-v2:publisher-progress-v1'),false,
      'unbound or mismatched publisher must not gain an early job receipt');
    assert.equal(f.values.has('gallery-historical-text-batch-v2:result'),false);
  }
});

test('v0.2.11 early-handshake retry is once-only and never overrides observed HTTP 403',()=>{
  const api=fixture().context.__batchTest;
  const prior={status:'publisher_script_not_confirmed',pageDoiVerified:false,
    captureRevision:'historic-body-evidence-v030'};
  assert.equal(api.batchRetryAllowed(prior,false),true);
  assert.equal(api.batchRetryAllowed({...prior,
    bindingRevision:'historic-body-early-bound-v031'},false),false);
  assert.equal(api.batchRetryAllowed({...prior,httpStatus:403},false),false);
  assert.equal(api.batchRetryAllowed({...prior,status:'page_access_blocked'},false),false);
  assert.equal(api.batchRetryAllowed({...prior,status:'license_not_verified',
    pageDoiVerified:true},false),false,
    'same scientific parser must not reclassify a rights block during binding-only upgrade');
});

test('automatic publisher modes cannot activate a foreground article tab',()=>{
  assert.ok(original.includes("mode==='foreground_one'&&selected.length===1"));
  assert.ok(original.includes("{active:manualForeground,insert:true,setParent:true}"));
  assert.equal((original.match(/GM_openInTab\(/g)||[]).length,1,
    'single publisher tab opener must own both manual and automatic activation');
  assert.ok(!original.includes('{active:true,insert:true,setParent:true}'),
    'cannot have any unguarded automatic foreground reopen');
  assert.ok(!original.includes('publisher_foreground_retry'),
    'old missing-heartbeat auto-foreground branch must be removed');
  assert.ok(original.includes("foregroundOne.addEventListener('click'"));
  assert.ok(original.includes("window.confirm(confirmation)"));
});

test('manual foreground selection is one recent unconfirmed DOI, never a published HTTP denial',()=>{
  const api=fixture().context.__batchTest;
  const papers=[
    {doi:'10.1021/jacs.old-failure',journal:'JACS'},
    {doi:'10.1021/jacs.new-failure',journal:'JACS'},
    {doi:'10.1021/jacs.denied-403',journal:'JACS'},
    {doi:'10.1038/s41557-026-saved',journal:'Nature Chemistry'},
    {doi:'10.1038/s41557-026-license',journal:'Nature Chemistry'},
    {doi:'10.1021/jacs.valid-body',journal:'JACS'}
  ];
  const attempts=[
    {doi:papers[0].doi,status:'publisher_script_not_confirmed',pageDoiVerified:false,checkedAt:10},
    {doi:papers[1].doi,status:'publisher_no_response',pageDoiVerified:false,checkedAt:20},
    {doi:papers[2].doi,status:'publisher_script_not_confirmed',httpStatus:403,checkedAt:40},
    {doi:papers[3].doi,status:'saved_local',checkedAt:45},
    {doi:papers[4].doi,status:'license_not_verified',pageDoiVerified:true,checkedAt:50},
    {doi:papers[5].doi,status:'publisher_script_not_confirmed',pageDoiVerified:true,checkedAt:90}
  ];
  const manual=api.batchSelectCandidates(papers,new Set([papers[3].doi]),attempts,true,'foreground_one');
  assert.equal(manual.length,1);
  assert.equal(manual[0].doi,papers[1].doi,'most recently retriable missing handler only');
  assert.equal(api.batchSelectCandidates(papers,new Set([papers[3].doi]),attempts,true,'all').length>=2,true,
    'normal corpus visit must retain its unbounded candidate traversal');
  assert.equal(api.batchSelectCandidates(papers,new Set(),[],true,'foreground_one').length,0,
    'manual foreground must never visit an unattempted DOI');
});

test('DOI-bound article structure remains metadata only when no reusable licence exists',async()=>{
  const x=fixture({license:''});
  const meta=x.context.__batchTest.batchBodyStructure(x.root);
  assert.equal(meta.presence,'scientific_sections');
  assert.ok(meta.scienceChars>=250);
  assert.equal(x.context.__batchTest.batchReuseRights(x.root).signal,'unverified');
  await x.context.__batchTest.batchWorker();
  const outcome=x.values.get('gallery-historical-text-batch-v2:result');
  assert.equal(outcome.status,'license_pending_load');
  assert.equal(outcome.rightsSignal,'unverified');
  assert.equal(outcome.bodyEvidence.presence,'scientific_sections');
  assert.equal(outcome.packet,undefined);
});
test('licensed scientific packet remains partial unless manuscript completeness is evidenced',async()=>{
  const x=fixture();
  await x.context.__batchTest.batchWorker();
  const row=x.values.get('gallery-historical-text-batch-v2:result');
  assert.equal(row.status,'ok');
  assert.equal(row.packet.bodyCompleteness,'partial');
  assert.ok(row.packet.coverage.scienceSectionCount>=1);
  assert.equal(row.packet.publicUploadAllowed,false);
});
test('balanced pilot selects at most twelve previously checked DOI without relaunching 403',()=>{
  const api=fixture().context.__batchTest;
  const papers=Array.from({length:21},(_,i)=>({doi:'10.1021/jacs.test'+i,journal:'JACS'}))
    .concat(Array.from({length:8},(_,i)=>({doi:'10.1038/test'+i,journal:'Nature Chemistry'})))
    .concat([{doi:'10.1126/sciadv.test',journal:'Science Advances'}]);
  const attempts=papers.map(p=>({doi:p.doi,status:'license_not_verified',pageDoiVerified:true}));
  attempts[1].httpStatus=403;
  const sample=api.batchSelectCandidates(papers,new Set(),attempts,true,'pilot');
  assert.equal(sample.length,12);
  assert.equal(sample.some(p=>p.doi===papers[1].doi),false);
  assert.ok(sample.some(p=>p.journal==='Nature Chemistry'));
  assert.ok(sample.some(p=>p.journal==='Science Advances'));
  assert.equal(api.batchSelectCandidates(papers,new Set(),[],true,'pilot').length,0);
});
test('batch only selects unique formal historical DOI',()=>{
  const {context}=fixture();
  const rows=context.__batchTest.batchHistoricalPapers(registry);
  assert.equal(rows.length,3);
  assert.equal(new Set(rows.map(x=>x.doi)).size,3);
  assert.ok(rows.every(x=>x.publication<'2026-10-01'));
  assert.throws(()=>context.__batchTest.batchHistoricalPapers({...registry,webpageDoiCount:100}),/目录不一致/);
});
test('TOC complete manifest loads entire publisher registry in two requests, without pagination',async()=>{
  const {context}=fixture(),f='a'.repeat(64);
  const official=[
    {doi:DOI,title:'historical JACS',date:'2026-09-14',journal:'JACS',mediaPolicy:'toc_only'},
    {doi:'10.1234/unknown-date',title:'undated article',date:'',journal:'JOC',mediaPolicy:'standard'},
    {doi:'10.1038/s44160-026-01100-1',title:'historic archive',date:'2021-02-02',journal:'Nature Synthesis',mediaPolicy:'metadata_only'},
    {doi:'10.1002/anie.2026new',title:'October',date:'2026-10-02',journal:'Angew',mediaPolicy:'standard'}
  ];
  const calls=[];
  context.GM_xmlhttpRequest=opts=>{
    calls.push(opts.url);
    const u=new URL(opts.url);
    const payload=u.pathname==='/release-delivery.json'
      ?{architectureCatalogId:f,dois:official.map(x=>x.doi),productionCards:official.length}
      :{pairedCaptureRegistry:true,webpageDoiCount:official.length,articles:official};
    queueMicrotask(()=>opts.onload({status:200,responseText:JSON.stringify(payload)}));
  };
  const catalog=await context.__batchTest.batchLoadCanonicalCatalog();
  assert.equal(catalog.formalCount,4);
  assert.equal(catalog.articles.length,2);
  assert.equal(context.__batchTest.batchHistoricalPapers(catalog).length,2);
  assert.equal(calls.length,2);
  assert.equal(new URL(calls[1]).pathname,'/toc-demand-live.json');
  assert.ok(calls.every(x=>!x.includes('catalog-view')));
});

test('entire formal OA registry includes October and undated without per-DOI API paging',async()=>{
  const {context}=fixture(),catalogId='a'.repeat(64);
  const all=[
    {doi:DOI,date:'2026-09-14',journal:'JACS',title:'Old',mediaPolicy:'toc_only'},
    {doi:'10.1234/unknown-date',date:'',journal:'JOC',title:'Undated',mediaPolicy:'metadata_only'},
    {doi:'10.1002/anie.2026new',date:'2026-10-13',journal:'Angew',title:'October',mediaPolicy:'standard'}
  ];
  const queries=[];
  context.GM_xmlhttpRequest=opts=>{
    queries.push(opts.url);
    const u=new URL(opts.url);
    const payload=u.pathname.endsWith('/release-delivery.json')
      ?{architectureCatalogId:catalogId,dois:all.map(x=>x.doi),productionCards:all.length}
      :{pairedCaptureRegistry:true,webpageDoiCount:all.length,articles:all};
    queueMicrotask(()=>opts.onload({status:200,responseText:JSON.stringify(payload)}));
  };
  const result=await context.__batchTest.batchLoadCanonicalCatalog(true);
  assert.equal(result.articles.length,3);
  assert.equal(result.formalCount,3);
  assert.equal(result.articles.find(x=>x.doi==='10.1234/unknown-date').date,'');
  assert.ok(queries.every(x=>!x.includes('/api/literature/catalog-view')));
  assert.equal(queries.length,2);
  assert.equal(context.__batchTest.batchHistoricalPapers(result).length,1);
});

test('one-shot registry fails closed on missing, duplicated or unpublished DOI',async()=>{
  const {context}=fixture(),catalogId='a'.repeat(64),dois=[DOI,'10.1038/known'];
  const good=()=>[
    {doi:DOI,date:'2026-09-14',journal:'JACS'},
    {doi:'10.1038/known',date:'2026-02-02',journal:'Nature'}
  ];
  for(const bad of [
    [{doi:DOI,date:'2026-09-14',journal:'JACS'}],
    [{...good()[0]},{...good()[0]}],
    [good()[0],{doi:'10.1234/unpublished',date:'2026-02-02',journal:'Nature'}]
  ]){
    context.GM_xmlhttpRequest=opts=>{
      const payload=new URL(opts.url).pathname==='/release-delivery.json'
        ?{architectureCatalogId:catalogId,dois,productionCards:dois.length}
        :{pairedCaptureRegistry:true,webpageDoiCount:bad.length,articles:bad};
      queueMicrotask(()=>opts.onload({status:200,responseText:JSON.stringify(payload)}));
    };
    await assert.rejects(()=>context.__batchTest.batchLoadCanonicalCatalog(true),
      /不一致|未发布|重复/);
  }
});

test('a 1151 DOI manifest needs no pagination and preserves metadata_only members',async()=>{
  const {context}=fixture(),catalogId='a'.repeat(64);
  const rows=Array.from({length:1151},(_,i)=>({
    doi:'10.1021/jacs.manifest'+i,date:i%90===0?'':'2026-09-01',
    journal:'JACS',title:'Organic synthesis '+i,
    mediaPolicy:i%110===0?'metadata_only':'toc_only'
  }));
  let reads=0;
  context.GM_xmlhttpRequest=opts=>{
    reads++;
    const payload=new URL(opts.url).pathname==='/release-delivery.json'
      ?{architectureCatalogId:catalogId,dois:rows.map(x=>x.doi),productionCards:rows.length}
      :{pairedCaptureRegistry:true,webpageDoiCount:rows.length,articles:rows};
    queueMicrotask(()=>opts.onload({status:200,responseText:JSON.stringify(payload)}));
  };
  const catalog=await context.__batchTest.batchLoadCanonicalCatalog(true);
  assert.equal(reads,2);
  assert.equal(catalog.formalCount,1151);
  assert.equal(catalog.articles.length,1151);
  assert.ok(catalog.articles.some(x=>x.date===''));
});
test('explicit article license gate allows BY/CC0 and excludes NC-ND or unlicensed',()=>{
  assert.equal(fixture().context.__batchTest.batchLicenseEvidence(fixture().root)?.kind,'cc-by');
  const zero=fixture({license:'https://creativecommons.org/publicdomain/zero/1.0/'});
  assert.equal(zero.context.__batchTest.batchLicenseEvidence(zero.root)?.kind,'cc0');
  const nd=fixture({license:'https://creativecommons.org/licenses/by-nc-nd/4.0/'});
  assert.equal(nd.context.__batchTest.batchLicenseEvidence(nd.root),null);
  const missing=fixture({license:''});
  assert.equal(missing.context.__batchTest.batchLicenseEvidence(missing.root),null);
});
test('publisher worker emits only DOI verified local packet without PDF, media or upload',async()=>{
  const {context,values}=fixture();
  await context.__batchTest.batchWorker();
  const result=values.get('gallery-historical-text-batch-v2:result');
  assert.equal(result.status,'ok');
  assert.equal(result.doi,DOI);
  assert.equal(result.runId,RUN);
  assert.equal(result.packet.publicUploadAllowed,false);
  assert.equal(result.packet.pdfDownloaded,false);
  assert.equal(result.packet.mediaDownloaded,false);
  assert.equal(result.packet.rightsBasis,'cc-by');
  assert.ok(result.packet.sections.some(x=>x.text.includes('LMCT')));
  assert.match(result.packet.sourceSha256,/^[a-f0-9]{64}$/);
});
test('worker cannot claim another tab, expired job, or unlicensed article',async()=>{
  const other=fixture({pageDoi:'10.1021/jacs.other'});
  await other.context.__batchTest.batchWorker();
  assert.equal(other.values.get('gallery-historical-text-batch-v2:result')?.status,'doi_unverified');
  assert.equal(other.values.get('gallery-historical-text-batch-v2:result')?.packet,undefined);
  const unlicensed=fixture({license:'https://creativecommons.org/licenses/by-nc-nd/4.0/'});
  await unlicensed.context.__batchTest.batchWorker();
  assert.equal(unlicensed.values.get('gallery-historical-text-batch-v2:result')?.status,'license_not_verified');
  const expired=fixture();
  expired.values.set('gallery-historical-text-batch-v2:job',
    {...expired.values.get('gallery-historical-text-batch-v2:job'),expiresAt:0});
  expired.values.delete('gallery-historical-text-batch-v2:result');
  await expired.context.__batchTest.batchWorker();
  assert.equal(expired.values.has('gallery-historical-text-batch-v2:result'),false);
});
test('ACS article-specific copyright declaration recognizes CC BY but not generic badges or restricted licenses',async()=>{
  const explicit='© 2026 The Authors. Published by American Chemical Society This publication is licensed under a Creative Commons Attribution 4.0 International License.';
  const x=fixture({license:'',acsNotice:explicit});
  assert.equal(x.context.__batchTest.batchLicenseEvidence(x.root)?.kind,'cc-by');
  await x.context.__batchTest.batchWorker();
  assert.equal(x.values.get('gallery-historical-text-batch-v2:result')?.status,'ok');
  const unrelated=fixture({license:'',acsNotice:explicit,acsNoticeOutside:true});
  assert.equal(unrelated.context.__batchTest.batchLicenseEvidence(unrelated.root),null);
  const ncnd=fixture({license:'',acsNotice:explicit.replace('Attribution 4.0','Attribution-NonCommercial-NoDerivatives 4.0')});
  assert.equal(ncnd.context.__batchTest.batchLicenseEvidence(ncnd.root),null);
  const bare=fixture({license:'',acsNotice:'This content is Open Access under the license indicated.'});
  assert.equal(bare.context.__batchTest.batchLicenseEvidence(bare.root),null);
});
test('Nature article legal notice is recognized without indexing legal boilerplate',async()=>{
  const input=fixture({license:'',rightsNotice:true});
  const legal=input.context.__batchTest.batchLicenseEvidence(input.root);
  assert.equal(legal?.kind,'cc-by');
  assert.equal(legal?.licenseUrl,'https://creativecommons.org/licenses/by/4.0/');
  await input.context.__batchTest.batchWorker();
  const reply=input.values.get('gallery-historical-text-batch-v2:result');
  assert.equal(reply?.status,'ok');
  assert.ok(reply.packet.sections.every(s=>s.heading!=='Rights and permissions'));
  const shell=fixture({license:'',rightsNotice:true,abstractOnly:true});
  await shell.context.__batchTest.batchWorker();
  assert.equal(shell.values.get('gallery-historical-text-batch-v2:result')?.status,'body_missing');
});
test('abstract-only pages are not falsely accepted as historical fulltext',async()=>{
  const x=fixture({abstractOnly:true});
  await x.context.__batchTest.batchWorker();
  assert.equal(x.values.get('gallery-historical-text-batch-v2:result')?.status,'body_missing');
});
test('no-response classification distinguishes absent script heartbeat from unfinished publisher worker',()=>{
  const api=fixture().context.__batchTest;
  assert.equal(api.batchUnconfirmedPublisherResult(false).reasonCode,'publisher_script_not_confirmed');
  assert.equal(api.batchUnconfirmedPublisherResult(false).httpStatus,null);
  assert.equal(api.batchUnconfirmedPublisherResult(true).reasonCode,'publisher_no_response');
});
test('real ACS DOI route with missing citation DOI only proves publisher script activation, not paper identity',async()=>{
  const metaOnly=fixture({pageDoi:'',routeHash:'',navigationStatus:403,
    routePath:'/orlef7/article/doi/'+DOI+'/5442045/Article'});
  const api=metaOnly.context.__batchTest;
  assert.equal(api.batchPathBindsCurrentJob({doi:DOI}),true);
  await api.batchWorker();
  const returned=metaOnly.values.get('gallery-historical-text-batch-v2:result');
  assert.equal(returned.status,'page_http_error');
  assert.equal(returned.httpStatus,403);
  assert.equal(returned.pageDoiVerified,false);
  assert.equal(returned.packet,undefined);
  const unrelated=fixture({pageDoi:'',routeHash:'',navigationStatus:403,
    routePath:'/orlef7/article/doi/10.1021/jacs.other/5442045/Article'});
  assert.equal(unrelated.context.__batchTest.batchPathBindsCurrentJob({doi:DOI}),false);
  await unrelated.context.__batchTest.batchWorker();
  assert.equal(unrelated.values.has('gallery-historical-text-batch-v2:result'),false);
});
test('reachability pilot samples max eight previous publisher non-responses, not rights blocks or HTTP 429',()=>{
  const api=fixture().context.__batchTest;
  const papers=[
    ...Array.from({length:12},(_,i)=>({doi:'10.1021/jacs.reach'+i,journal:'JACS'})),
    ...Array.from({length:7},(_,i)=>({doi:'10.1038/s41557-reach'+i,journal:'Nature Chemistry'})),
    ...Array.from({length:3},(_,i)=>({doi:'10.1126/sciadv.reach'+i,journal:'Science Advances'}))
  ];
  const attempts=papers.map(p=>({doi:p.doi,status:'publisher_no_response',pageDoiVerified:false}));
  attempts[0].httpStatus=429;
  attempts[1].status='license_not_verified';
  attempts[2].status='page_access_blocked';
  const selected=api.batchSelectCandidates(papers,new Set(),attempts,true,'reachability');
  assert.equal(selected.length,8);
  assert.equal(selected.some(p=>p.doi===papers[0].doi),false);
  assert.equal(selected.some(p=>p.doi===papers[1].doi),false);
  assert.equal(selected.some(p=>p.doi===papers[2].doi),false);
  assert.ok(selected.some(p=>p.journal==='Nature Chemistry'));
  assert.ok(selected.some(p=>p.journal==='Science Advances'));
  assert.equal(api.batchSelectCandidates(papers,new Set(),[],true,'reachability').length,0);
});
test('historical batch does not write into media, PDF or Evidence interfaces',()=>{
  const body=original.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/,'');
  for(const forbidden of [
    'osg-toc-v6:','/api/article-summary/fulltext/import','/api/private-pdf/import',
    'api/local-captures/import','importBodyFigure','capturePrivatePdf','GM_download('
  ])assert.ok(!body.includes(forbidden),'isolation breach: '+forbidden);
  assert.ok(original.includes('GM_openInTab(navigate(job)'));
  assert.ok(original.includes('一键补抓全部缺项'));
  assert.ok(original.includes('BATCH_MIN_GAP_MS=2000'));
});

test('retry policy separates temporary errors from license and access blocks',()=>{
  const api=fixture().context.__batchTest;
  assert.equal(api.batchRetryAllowed({status:'timeout',pageDoiVerified:true},false),true);
  assert.equal(api.batchRetryAllowed({status:'timeout',pageDoiVerified:false},false),true);
  assert.equal(api.batchRetryAllowed({status:'timeout',pageDoiVerified:false,
    bindingRevision:'historic-body-early-bound-v031'},false),false);
  assert.equal(api.batchRetryAllowed({status:'publisher_script_not_confirmed'},false),true);
  assert.equal(api.batchRetryAllowed({status:'publisher_script_not_confirmed'},true),true);
  assert.equal(api.batchRetryAllowed({status:'publisher_unreachable'},false),true);
  assert.equal(api.batchRetryAllowed({status:'storage_failure'},false),true);
  assert.equal(api.batchRetryAllowed({status:'response_hash_mismatch'},false),true);
  assert.equal(api.batchRetryAllowed({status:'license_not_verified'},false),false);
  assert.equal(api.batchRetryAllowed({status:'license_not_verified'},true),true);
  assert.equal(api.batchRetryAllowed({status:'body_missing'},false),false);
  assert.equal(api.batchRetryAllowed({status:'page_access_blocked'},false),false);
  assert.equal(api.batchRetryAllowed({status:'saved_local'},true),false);
  assert.equal(api.batchRetryAllowed({status:'publisher_unreachable',httpStatus:429},false),false);
  assert.equal(api.batchStageForStatus('response_hash_mismatch'),'hash_verify');
});

test('ACS licence review samples at most ten genuine prior blocks, not the full historical queue',()=>{
  const api=fixture().context.__batchTest;
  const papers=Array.from({length:25},(_,i)=>({doi:'10.1021/jacs.sample'+i}));
  papers.push({doi:'10.1038/nature.open',journal:'Nature'});
  const rows=papers.map(p=>({doi:p.doi,status:'license_not_verified'}));
  rows[2].status='page_http_error';
  const result=api.batchSelectCandidates(papers,new Set([papers[0].doi]),rows,true,'acs_license');
  assert.equal(result.length,10);
  assert.ok(result.every(p=>p.doi.startsWith('10.1021/')&&p.doi!==papers[0].doi&&p.doi!==papers[2].doi));
  assert.equal(api.batchSelectCandidates(papers,new Set(),[],true,'blocked').length,0);
  assert.equal(api.batchSelectCandidates(papers,new Set(),[],false,'all').length,papers.length);
});
test('old DOI-verified ambiguous licensing/body is rechecked exactly once after parser upgrade',()=>{
  const api=fixture().context.__batchTest;
  const prior={doi:DOI,status:'license_not_verified',pageDoiVerified:true,captureRevision:'old'};
  assert.equal(api.batchRetryAllowed(prior,false),true);
  assert.equal(api.batchRetryAllowed({...prior,captureRevision:'historic-body-evidence-v026'},false),true);
  assert.equal(api.batchRetryAllowed({...prior,captureRevision:'historic-body-evidence-v030'},false),false);
  assert.equal(api.batchRetryAllowed({...prior,status:'body_missing',captureRevision:'old'},false),true);
  assert.equal(api.batchRetryAllowed({...prior,status:'page_access_blocked'},false),false);
  assert.equal(api.batchRetryAllowed({...prior,httpStatus:403},false),false);
  assert.equal(api.batchRetryAllowed({...prior,httpStatus:429},false),false);
  const papers=[{doi:DOI},{doi:'10.1021/acs.joc.other'}];
  const chosen=api.batchSelectCandidates(papers,new Set(),[prior],false,'all');
  assert.equal(chosen.length,2,'previous rights unknown and never-attempted both remain in corpus sweep');
});
test('full inventory reports actual formal DOI, saved science, unresolved rights and never-attempted separately',()=>{
  const api=fixture().context.__batchTest;
  const catalog={pairedCaptureRegistry:true,webpageDoiCount:4,formalCount:6,articles:[
    {doi:DOI,date:'2026-09-01',journal:'JACS'},
    {doi:'10.1021/jacs.other1',date:'2026-09-02',journal:'JACS'},
    {doi:'10.1021/jacs.other2',date:'2026-09-03',journal:'JACS'},
    {doi:'10.1021/jacs.undated',date:'',journal:'JACS'}
  ]};
  const rows=[{doi:'10.1021/jacs.other1',status:'license_not_verified',pageDoiVerified:true}];
  const c=api.batchCoverageSummary(catalog,[DOI],rows);
  assert.equal(c.formalDois,6);
  assert.equal(c.historicalWithVerifiedDate,3);
  assert.equal(c.historicalWithoutVerifiedDate,1);
  assert.equal(c.savedLocal,1);
  assert.equal(c.licensePending,1);
  assert.equal(c.neverAttempted,1);
  assert.equal(c.parserRecheckEligible,1);
  assert.equal(c.scheduledByNormalBatch,2);
});
test('local body search includes core chapters captions and tables, not only first 20',()=>{
  const api=fixture().context.__batchTest;
  assert.ok(api.batchLocalSearchTerms('LMCT').includes('ligand-to-metal charge transfer'));
  const p={doi:DOI,sections:[
    {type:'introduction',heading:'Background',text:'LMCT was discussed in prior work.'},
    {type:'mechanism',heading:'Mechanistic Studies',text:'The ligand-to-metal charge transfer is established by spectroscopy.'}
  ],captions:[{label:'Scheme 2',text:'LMCT mechanism'}],tables:[{label:'Table 1',text:'LMCT control'}]};
  const chosen=api.batchLocalEvidenceMatch(p,api.batchLocalSearchTerms('LMCT'));
  assert.equal(chosen.type,'mechanism');
  assert.equal(chosen.kind,'正文');
  const cap=api.batchLocalEvidenceMatch({...p,sections:[]},['lmct']);
  assert.equal(cap.kind,'图注');
  const tab=api.batchLocalEvidenceMatch({...p,sections:[],captions:[]},['lmct']);
  assert.equal(tab.kind,'表格');
  assert.equal(api.batchLocalEvidenceMatch({...p,sections:[{type:'results',text:'Hydrogenation only.'}],captions:[],tables:[]},['lmct']),null);
});
test('publisher evidence HTTP 403 is recorded only from observed navigation status',async()=>{
  const noEvidence=fixture({navigationStatus:null});
  await noEvidence.context.__batchTest.batchWorker();
  assert.equal(noEvidence.values.get('gallery-historical-text-batch-v2:result')?.httpStatus,null);
  const denied=fixture({navigationStatus:403});
  await denied.context.__batchTest.batchWorker();
  const r=denied.values.get('gallery-historical-text-batch-v2:result');
  assert.equal(r.status,'page_http_error');
  assert.equal(r.httpStatus,403);
  assert.equal(r.stage,'publisher_page');
  const throttled=fixture({navigationStatus:429});
  await throttled.context.__batchTest.batchWorker();
  const retryAfter=throttled.values.get('gallery-historical-text-batch-v2:result');
  assert.equal(retryAfter.status,'page_http_error');
  assert.equal(retryAfter.httpStatus,429);
  assert.equal(retryAfter.stage,'publisher_page');
});

test('publisher HTTP error and access block remain intact in final results and stages',()=>{
  const api=fixture().context.__batchTest;
  assert.equal(api.batchNormalizedStatus('page_http_error'),'page_http_error');
  assert.equal(api.batchStageForStatus('page_http_error'),'publisher_page');
  assert.equal(api.batchNormalizedStatus('page_unavailable'),'page_unavailable');
  assert.equal(api.batchStageForStatus('page_unavailable'),'publisher_page');
  assert.equal(api.batchNormalizedStatus('page_access_blocked'),'page_access_blocked');
  assert.equal(api.batchStageForStatus('page_access_blocked'),'publisher_page');
  assert.equal(api.batchNormalizedStatus('publisher_no_response'),'publisher_no_response');
  assert.equal(api.batchStageForStatus('publisher_no_response'),'publisher_wait');
  assert.equal(api.batchNormalizedStatus('invented'), 'invalid_response');
});
test('DOI-bound publisher accepts a licence that appears during real page hydration',async()=>{
  const x=fixture({licenseAfter:3,readyAfter:4});
  await x.context.__batchTest.batchWorker();
  const result=x.values.get('gallery-historical-text-batch-v2:result');
  assert.equal(result?.status,'ok');
  assert.equal(result?.packet?.rightsBasis,'cc-by');
  assert.equal(result?.packet?.doi,DOI);
  assert.equal(result?.packet?.publicUploadAllowed,false);
});
test('stable article without article-level reuse license stays blocked, not access-denied',async()=>{
  const x=fixture({license:''});
  await x.context.__batchTest.batchWorker();
  const result=x.values.get('gallery-historical-text-batch-v2:result');
  assert.equal(result?.status,'license_pending_load');
  assert.equal(result?.stage,'publisher_wait');
  assert.equal(result?.httpStatus,null);
  const blocked=fixture({license:'',pageTitle:'Verify you are human'});
  await blocked.context.__batchTest.batchWorker();
  const challenge=blocked.values.get('gallery-historical-text-batch-v2:result');
  assert.equal(challenge?.status,'page_access_blocked');
  assert.equal(challenge?.stage,'publisher_page');
});
test('admin report display groups checkpoint+final by DOI and attempt',()=>{
  const api=fixture().context.__batchTest;
  const entries=[
    {doi:DOI,jobId:'job_one',kind:'failure_checkpoint',
      status:'failed',reasonCode:'page_http_error',receivedAt:1000,httpStatus:403},
    {doi:DOI,jobId:'job_one',kind:'final_result',
      status:'failed',reasonCode:'page_http_error',receivedAt:1001,httpStatus:403},
    {doi:DOI,jobId:'job_two',kind:'final_result',
      status:'blocked',reasonCode:'license_not_verified',receivedAt:1002,httpStatus:null},
    {doi:'10.1126/science.aef0766',jobId:'job_three',kind:'final_result',
      status:'blocked',reasonCode:'license_not_verified',receivedAt:1003,httpStatus:null},
  ];
  const groups=api.batchGroupServerEvents(entries);
  assert.equal(groups.length,3,'events are not falsely counted as independent DOI');
  const grouped=groups.find(g=>g.jobId==='job_one');
  assert.equal(grouped.events.length,2);
  assert.equal(grouped.display.kind,'final_result');
  assert.equal(grouped.display.httpStatus,403);
  assert.equal(new Set(groups.map(g=>g.doi)).size,2);
  assert.equal(groups[0].jobId,'job_three');
});

test('hydration-pending rights differ from DOI-bound explicit restricted licence',async()=>{
  const pending=fixture({license:''});
  await pending.context.__batchTest.batchWorker();
  assert.equal(pending.values.get('gallery-historical-text-batch-v2:result')?.status,'license_pending_load');
  const restricted=fixture({license:'https://creativecommons.org/licenses/by-nc-nd/4.0/'});
  await restricted.context.__batchTest.batchWorker();
  const observed=restricted.values.get('gallery-historical-text-batch-v2:result');
  assert.equal(observed?.status,'license_not_verified');
  assert.equal(observed?.rightsSignal,'other_license_declared');
  assert.equal(observed?.packet,undefined);
});
test('keeps no more than two DOI-confirmed review tabs; immediately closes denied pages',()=>{
  const api=fixture().context.__batchTest;
  const closed=[];
  const tab=id=>({close(){closed.push(id)}});
  const pending={status:'license_pending_load',pageDoiVerified:true};
  assert.equal(api.batchFinishPublisherTab(tab('a'),pending,'10.1021/a'),true);
  assert.equal(api.batchFinishPublisherTab(tab('b'),pending,'10.1021/b'),true);
  assert.equal(api.batchFinishPublisherTab(tab('c'),pending,'10.1021/c'),true);
  assert.deepEqual(closed,['a']);
  assert.equal(api.batchReviewTabs.length,2);
  assert.equal(api.batchFinishPublisherTab(tab('denied'),{
    status:'page_http_error',pageDoiVerified:false,httpStatus:403},'10.1021/denied'),false);
  assert.equal(api.batchFinishPublisherTab(tab('unknown'),{
    status:'license_pending_load',pageDoiVerified:false},'10.1021/unknown'),false);
  assert.deepEqual(closed,['a','denied','unknown']);
  api.batchCloseReviewTabs();
  assert.equal(api.batchReviewTabs.length,0);
  assert.deepEqual(closed,['a','denied','unknown','b','c']);
});
test('v026 checked DOI licence false negatives are rechecked only once after upgrade',()=>{
  const api=fixture().context.__batchTest;
  const old={doi:DOI,status:'license_not_verified',pageDoiVerified:true,
    captureRevision:'historic-body-evidence-v026'};
  assert.equal(api.batchRetryAllowed(old,false),true);
  assert.equal(api.batchRetryAllowed({...old,captureRevision:'historic-body-evidence-v030'},false),false);
  assert.equal(api.batchRetryAllowed({...old,httpStatus:403},false),false);
  assert.equal(api.batchRetryAllowed({...old,httpStatus:429},false),false);
  assert.equal(api.batchRetryAllowed({...old,status:'license_pending_load'},false),true);
});


test('Pages artifact gate checks byte-for-byte installer and reviewed version rather than obsolete hardcode',async()=>{
  const pages=await readFile('.github/workflows/github-pages.yml','utf8');
  const marker=pages.slice(pages.indexOf('test -s dist/gallery-historical-text-pilot.user.js'),
    pages.indexOf('grep -F "全库开放正文补抓（本机）"'));
  assert.ok(marker.includes("assert.equal(published, original"),'same reviewed userscript must reach Pages');
  assert.ok(marker.includes("patch >= 9"),'disallow rollback below user-approved 0.2.9');
  assert.ok(marker.includes("BATCH_SCRIPT_VERSION"),'script metadata and diagnostic version must agree');
  assert.ok(!marker.includes('grep -F "// @version      0.2.8"'),'stale version pin must not block a legitimate deployment');
});
