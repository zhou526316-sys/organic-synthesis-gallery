import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const source=await fs.readFile('public/toc-mainline.user.js','utf8');
const names=['sniffContentType','articleFigureResolution','visualScope','collectArticleFigureCandidates','acquireBestVisual','pairedJobs','articleUrl','pairedDiscoveryReady'];
const exposed=source.replace('  installMenu();','  globalThis.__tm224={'+names.join(',')+'}; return;\n  installMenu();');
const doi='10.1021/acs.orglett.6c03512',foreign='10.1021/jacs.6c00000';
const jobId='12345678-1234-1234-1234-123456789012';
const base='https://pubs.acs.org';
const own='/acs/content_public/journal/orglett/10.1021_acs.orglett.6c03512/1/';
const foreignDir='/acs/content_public/journal/jacs/10.1021_jacs.6c00000/1/';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="900" height="420" viewBox="0 0 900 420"><path d="M10 20 L880 390" stroke="black"/><text x="80" y="120">Scheme 5 product scope</text></svg>';
const tiff=Buffer.alloc(512);tiff[0]=0x49;tiff[1]=0x49;tiff[2]=0x2a;tiff[3]=0x00;
let passed=0;function test(name,v){assert.ok(v,name);passed++;console.log('TM224_ACQUISITION_PASS '+name);}
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 const gets=[];
 await page.route('**/*',route=>{
   const req=route.request(),u=new URL(req.url());gets.push(u.pathname+u.search);
   if(/hi[1-4]\.tif$/.test(u.pathname))return route.fulfill({status:200,body:tiff,contentType:'application/octet-stream',headers:{'access-control-allow-origin':'*'}});
   if(/current\.svg$/.test(u.pathname))return route.fulfill({status:200,body:svg,contentType:'image/svg+xml',headers:{'access-control-allow-origin':'*'}});
   return route.fulfill({status:200,body:'<html><head><meta name="citation_doi" content="'+doi+'"></head><body><article id="article"></article></body></html>',contentType:'text/html'});
 });
 await page.goto(base+'/doi/full/'+doi+'#osg-job='+jobId);
 await page.evaluate(({doi,jobId})=>{
   const storage={'osg-toc-v6:active-job':{doi,jobId,captureVersion:'6.2.20',publisher:'acs',startedAt:new Date().toISOString()},'osg-toc-v6:write-token':'fixture'};
   window.__gm=storage;window.GM_getValue=(k,d)=>k in storage?storage[k]:d;window.GM_setValue=(k,v)=>storage[k]=v;window.GM_deleteValue=k=>delete storage[k];
   window.GM_listValues=()=>Object.keys(storage);window.GM_registerMenuCommand=()=>{};window.GM_openInTab=()=>{};
   window.GM_xmlhttpRequest=()=>{throw new Error('GM network not expected in this page-fetch fixture');};
   sessionStorage.setItem('osg-toc-v6:tab-job-binding',jobId);
 },{doi,jobId});
 await page.addScriptTag({content:exposed});
 await page.evaluate(({own})=>{
   document.querySelector('#article').innerHTML='<figure id="s5"><figcaption>Scheme 5. Product scope.</figcaption>'+
     '<img id="good" data-full-src="'+own+'hi1.tif" data-lg-src="'+own+'hi2.tif" data-hi-res-src="'+own+'hi3.tif" data-src-large="'+own+'hi4.tif" src="'+own+'current.svg"></figure>';
 },{own});
 await page.locator('#good').evaluate(img=>img.decode());
 const result=await page.evaluate(async doi=>{
   const job={doi,jobId:'12345678-1234-1234-1234-123456789012',captureVersion:'6.2.20',publisher:'acs',captureDeadline:Date.now()+60000};
   const trace=[],rows=__tm224.collectArticleFigureCandidates(job,trace,document,location.href,'fixture');
   const best=await __tm224.acquireBestVisual(job,rows,trace,new Map(),'figure');
   return {best:best&&{url:best.candidate.url,source:best.candidate.source,quality:best.quality.quality,width:best.image.width,height:best.image.height},trace,rows:rows.map(r=>r.url)};
 },doi);
 test('first four network variants are attempted before fallback',result.rows.slice(0,4).every(x=>/hi[1-4]\.tif$/.test(new URL(x).pathname)));
 test('octet-stream TIFF is identified explicitly',result.trace.filter(x=>x.event==='unsupported_tiff').length===4);
 test('same labelled figure currentSrc becomes a bounded final fallback',result.best?.source==='same_figure_current_src'&&/current\.svg$/.test(result.best.url));
 test('same-figure fallback keeps normal quality evaluation',result.best?.quality==='vector'&&result.best.width===900&&result.best.height===420);
 test('fallback does not need another TIFF/other publisher download',gets.filter(x=>/hi[1-4]\.tif$/.test(x.split('?')[0])).length===4);

 await page.evaluate(({own,foreignDir})=>{
   document.querySelector('#article').innerHTML='<figure><figcaption>Scheme 6. Foreign current image test.</figcaption>'+
     '<img id="foreign" data-full-src="'+own+'hi1.tif" data-lg-src="'+own+'hi2.tif" data-hi-res-src="'+own+'hi3.tif" data-src-large="'+own+'hi4.tif" src="'+foreignDir+'current.svg"></figure>';
 },{own,foreignDir});
 // We do not route the foreign SVG; a safe fallback must reject it before fetch.
 const foreignResult=await page.evaluate(async doi=>{
   const job={doi,jobId:'12345678-1234-1234-1234-123456789012',captureVersion:'6.2.20',publisher:'acs',captureDeadline:Date.now()+60000};
   const trace=[],rows=__tm224.collectArticleFigureCandidates(job,trace,document,location.href,'fixture');
   const best=await __tm224.acquireBestVisual(job,rows,trace,new Map(),'figure');
   return {best:Boolean(best),trace};
 },doi);
 test('foreign DOI currentSrc is never used as same-figure fallback',foreignResult.best===false);

 const formats=await page.evaluate(()=>{
   const a=new Uint8Array(256);a.set([0x49,0x49,0x2a,0x00]);
   const b=new Uint8Array([0xff,0xfe,...Array.from(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).flatMap(x=>[x,0])]);
   return {tiff:__tm224.sniffContentType(a.buffer,'application/octet-stream'),low:__tm224.articleFigureResolution(520,200),usable:__tm224.articleFigureResolution(520,800)};
 });
 test('TIFF magic is classified but not disguised as generic bytes',formats.tiff==='image/tiff');
 test('existing raster quality floor is not loosened',formats.low.usable===false&&formats.usable.usable===true);

 const ordering=await page.evaluate(()=>{
   const q={mediaGeneration:1790082000000,latestAddedDate:'2026-09-24',webpageDoiCount:10,articles:[
     {doi:'10.1021/jacs.6c00001',journal:'JACS',date:'2026-09-23',addedDate:'2026-09-24'},
     {doi:'10.1021/acs.joc.6c00002',journal:'JOC',date:'2026-09-24',addedDate:'2026-09-24'},
     {doi:'10.1038/s41586-026-10001-1',journal:'Nature',date:'2026-09-20',addedDate:'2026-09-20'},
     {doi:'10.1126/science.abc0001',journal:'Science',date:'2026-09-21',addedDate:'2026-09-21'},
     {doi:'10.1038/s41557-026-02001-1',journal:'Nature Chemistry',date:'2026-09-22',addedDate:'2026-09-22'},
     {doi:'10.1126/sciadv.abc0002',journal:'Science Advances',date:'2026-09-22',addedDate:'2026-09-22'},
     {doi:'10.1021/jacs.6c00003',journal:'JACS',date:'2026-09-22',addedDate:'2026-09-22'},
     {doi:'10.1002/anie.202600003',journal:'Angew',date:'2026-09-23',addedDate:'2026-09-23'},
     {doi:'10.1016/j.chempr.2026.00004',journal:'Chem',date:'2026-09-23',addedDate:'2026-09-23'},
     {doi:'10.1021/acs.orglett.6c00005',journal:'Organic Letters',date:'2026-09-24',addedDate:'2026-09-23'}]};
   const media={items:{
     '10.1021/acs.joc.6c00002':{toc:{available:true,imageUrl:'toc.svg'}},
     '10.1021/acs.orglett.6c00005':{toc:{available:true,imageUrl:'toc.svg'}}
   }};
   return __tm224.pairedJobs(q,media).map(x=>({doi:x.doi,journal:x.journal,captureToc:x.captureToc}));
 });
 test('latest Gallery additions outrank historical TOC gaps, with journal priority inside the tier',JSON.stringify(ordering.slice(0,2).map(x=>x.doi))===JSON.stringify([
   '10.1021/jacs.6c00001','10.1021/acs.joc.6c00002']));
 test('historical missing-TOC tier follows Nature, Science, Nature children, Science children, JACS, Angew, Chem, others',JSON.stringify(ordering.slice(2,9).map(x=>x.journal))===JSON.stringify([
   'Nature','Science','Nature Chemistry','Science Advances','JACS','Angew','Chem']));
 test('historical body-only backlog waits until historical TOC gaps are exhausted',ordering[9].doi==='10.1021/acs.orglett.6c00005'&&ordering[9].captureToc===false);
 test('today-added article with existing TOC still stays in the daily full-capture priority tier',ordering[1].doi==='10.1021/acs.joc.6c00002'&&ordering[1].captureToc===false);

 const routes=await page.evaluate(()=>({
   acsFigure:__tm224.articleUrl({doi:'10.1021/acs.orglett.6c03487',publisher:'acs',mediaNeed:'figures'}),
   acsToc:__tm224.articleUrl({doi:'10.1021/acs.orglett.6c03487',publisher:'acs',mediaNeed:'toc'}),
   wileyFigure:__tm224.articleUrl({doi:'10.1002/anie.202600001',publisher:'wiley',mediaNeed:'figures'}),
   scienceFigure:__tm224.articleUrl({doi:'10.1126/science.abc1234',publisher:'science',mediaNeed:'figures'})
 }));
 test('ACS TOC and body jobs both enter through the canonical DOI route',routes.acsFigure==='https://pubs.acs.org/doi/10.1021/acs.orglett.6c03487'&&routes.acsToc===routes.acsFigure);
 test('ACS body jobs no longer force the legacy doi/full shell route',!routes.acsFigure.includes('/doi/full/'));
 test('non-ACS full-text routes remain unchanged',routes.wileyFigure==='https://onlinelibrary.wiley.com/doi/full/10.1002/anie.202600001'&&routes.scienceFigure==='https://www.science.org/doi/full/10.1126/science.abc1234');

 const discovery=await page.evaluate(()=>({
   tocOnlyEarly:__tm224.pairedDiscoveryReady({mediaNeed:'toc+figures'},3,1,0,6000,6000),
   tocOnlyTimedOut:__tm224.pairedDiscoveryReady({mediaNeed:'toc+figures'},3,1,0,18000,18000),
   bodyTooEarly:__tm224.pairedDiscoveryReady({mediaNeed:'toc+figures'},3,1,3,7000,5000),
   bodyStillChanging:__tm224.pairedDiscoveryReady({mediaNeed:'toc+figures'},3,1,3,9000,3000),
   bodyStable:__tm224.pairedDiscoveryReady({mediaNeed:'toc+figures'},3,1,3,9000,4000),
   tocJobLegacy:__tm224.pairedDiscoveryReady({mediaNeed:'toc'},3,1,0,3000,3000)
 }));
 test('body discovery is not terminated merely because TOC appeared early',discovery.tocOnlyEarly===false);
 test('body discovery with no figures may close only after the bounded 18s observation window',discovery.tocOnlyTimedOut===true);
 test('body discovery retains an 8s minimum observation even after figures appear',discovery.bodyTooEarly===false);
 test('body discovery waits four quiet seconds after the latest figure-set change',discovery.bodyStillChanging===false&&discovery.bodyStable===true);
 test('TOC-only discovery keeps the legacy early-stable behavior',discovery.tocJobLegacy===true);
 test('controller revision is upgraded without capture protocol migration',source.includes("var VERSION = '6.2.20';")&&source.includes("var CONTROLLER_REVISION = '2.2.30';"));
}finally{await browser.close();}
console.log('TM224_ACQUISITION_TEST_SUMMARY '+JSON.stringify({passed,productionWrites:0,publisherFixtureOnly:true,captureProtocol:'6.2.20'}));
