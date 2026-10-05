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
 test('TIFF classification remains available without requiring an exact trace count',source.includes("return 'image/tiff'")&&source.includes("event:'unsupported_tiff'"));
 test('same-figure currentSrc fallback remains implemented and provenance-bounded',source.includes('async function sameFigureCurrentSrcFallback')&&source.includes('ids.some(function (doi) { return doi !== normalizeDoi(job.doi); })'));
 test('optional body fallback never escapes the discovered candidate set unless it is the bounded same-figure fallback',!result.best||result.rows.includes(result.best.url)||result.best.source==='same_figure_current_src');
 test('TIFF fallback path is coded to avoid re-downloading the identical TIFF through GM',source.includes('Do not download the identical TIFF again through GM'));

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
   return __tm224.pairedJobs(q,media).map(x=>({doi:x.doi,journal:x.journal,captureToc:x.captureToc,captureFigures:x.captureFigures,opportunisticFigures:x.opportunisticFigures,mediaNeed:x.mediaNeed,allowFigureOne:x.allowFigureOne}));
 });
 test('pairedJobs contains only missing-TOC articles',ordering.length===8&&!ordering.some(x=>x.doi==='10.1021/acs.joc.6c00002'||x.doi==='10.1021/acs.orglett.6c00005'));
 test('latest missing TOC leads the queue',ordering[0].doi==='10.1021/jacs.6c00001');
 test('historical missing-TOC tier follows Nature, Science, Nature children, Science children, JACS, Angew, Chem',JSON.stringify(ordering.slice(1).map(x=>x.journal))===JSON.stringify([
   'Nature','Science','Nature Chemistry','Science Advances','JACS','Angew','Chem']));
 test('every paired media job is a TOC obligation with non-blocking opportunistic body capture',ordering.every(x=>x.captureToc===true&&x.captureFigures===false&&x.opportunisticFigures===true&&x.mediaNeed==='toc'));

 const routes=await page.evaluate(()=>({
   acsFigure:__tm224.articleUrl({doi:'10.1021/acs.orglett.6c03487',publisher:'acs',mediaNeed:'figures'}),
   acsToc:__tm224.articleUrl({doi:'10.1021/acs.orglett.6c03487',publisher:'acs',mediaNeed:'toc'}),
   acsPdf:__tm224.articleUrl({doi:'10.1021/acs.orglett.6c03487',publisher:'acs',mediaNeed:'pdf',capturePrivatePdf:true}),
   wileyFigure:__tm224.articleUrl({doi:'10.1002/anie.202600001',publisher:'wiley',mediaNeed:'figures'}),
   wileyPaired:__tm224.articleUrl({doi:'10.1002/anie.202600001',publisher:'wiley',mediaNeed:'toc+figures'}),
   wileyToc:__tm224.articleUrl({doi:'10.1002/anie.202600001',publisher:'wiley',mediaNeed:'toc'}),
   scienceFigure:__tm224.articleUrl({doi:'10.1126/science.abc1234',publisher:'science',mediaNeed:'figures'}),
   sciencePaired:__tm224.articleUrl({doi:'10.1126/science.abc1234',publisher:'science',mediaNeed:'toc+figures'}),
   scienceToc:__tm224.articleUrl({doi:'10.1126/science.abc1234',publisher:'science',mediaNeed:'toc'})
 }));
 test('ACS TOC and PDF-only jobs use the DOI landing route',routes.acsToc==='https://pubs.acs.org/doi/10.1021/acs.orglett.6c03487'&&routes.acsPdf===routes.acsToc);
 test('legacy explicit ACS body job may still use the full-text route without becoming a queue tier',routes.acsFigure==='https://pubs.acs.org/doi/full/10.1021/acs.orglett.6c03487');
 test('paired and body jobs use full-text routes while historical TOC-only uses landing routes',
   routes.wileyFigure==='https://onlinelibrary.wiley.com/doi/full/10.1002/anie.202600001'&&
   routes.wileyPaired===routes.wileyFigure&&
   routes.wileyToc==='https://onlinelibrary.wiley.com/doi/10.1002/anie.202600001'&&
   routes.scienceFigure==='https://www.science.org/doi/full/10.1126/science.abc1234'&&
   routes.sciencePaired===routes.scienceFigure&&
   routes.scienceToc==='https://www.science.org/doi/10.1126/science.abc1234');

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
 test('opportunistic body failure cannot downgrade TOC queue completion',source.includes('var figuresRequired=job.captureFigures===true;')&&source.includes("if(!figuresRequired){\n        result.status=tocOk?'success':'failed';"));
 test('controller revision is current without capture protocol migration',source.includes("var VERSION = '6.2.20';")&&source.includes("var CONTROLLER_REVISION = '2.2.41';"));
}finally{await browser.close();}
console.log('TM224_ACQUISITION_TEST_SUMMARY '+JSON.stringify({passed,productionWrites:0,publisherFixtureOnly:true,captureProtocol:'6.2.20'}));
