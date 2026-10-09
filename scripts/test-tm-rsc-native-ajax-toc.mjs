import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const source=await fs.readFile('public/toc-mainline.user.js','utf8');
const insert='  globalThis.__tmRscAjax={rscNativeAjaxBoundRoute,rscNativeAjaxGraphicalAbstractCandidates,iframeCandidates}; return;\n  installMenu();';
const exposed=source.replace('  installMenu();',insert);
assert.notEqual(exposed,source,'test surface unavailable');
const sc='10.1039/d6sc06407h',gc='10.1039/d6gc03748h';
const urls={
 [sc]:'https://pubs.rsc.org/sc/article/doi/10.1039/D6SC06407H/1367242/test',
 [gc]:'https://pubs.rsc.org/gc/article/doi/10.1039/D6GC03748H/1367368/test'
};
const gaImage='https://pubs.rsc.org/image/article/2026/sc/d6sc06407h-graphical-abstract.jpg';
const gcImage='https://pubs.rsc.org/image/article/2026/gc/d6gc03748h-graphical-abstract.jpg';
let passed=0,ajaxCalls=[],fixture={success:true,html:'',status:200};
const test=(name,condition)=>{assert.ok(condition,name);passed++;console.log('TM_RSC_AJAX_PASS '+name);};
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.includes('/PlatformArticle/ArticleAbstractAjax')){
     ajaxCalls.push({host:url.hostname,path:url.pathname,articleId:url.searchParams.get('articleId'),
       lay:url.searchParams.get('layAbstract'),requestedWith:route.request().headers()['x-requested-with']});
     if(fixture.status!==200)return route.fulfill({status:fixture.status,body:'Access denied'});
     return route.fulfill({status:200,contentType:'application/json',
       body:JSON.stringify({Success:fixture.success,Html:fixture.html})});
   }
   return route.fulfill({status:200,contentType:'text/html',
     body:'<html><head><meta name="citation_doi" content="'+(url.pathname.toLowerCase().includes('d6gc03748h')?gc:sc)+'"></head><body><main><article></article></main></body></html>'});
 });
 async function install(url){
   await page.goto(url);
   await page.evaluate(()=>{
     window.GM_getValue=(_k,d)=>d;window.GM_setValue=()=>{};window.GM_deleteValue=()=>{};
     window.GM_listValues=()=>[];window.GM_registerMenuCommand=()=>{};
     window.GM_openInTab=()=>{};window.GM_xmlhttpRequest=()=>{};
   });
   await page.addScriptTag({content:exposed});
 }
 const job=doi=>({doi,publisher:'rsc',captureToc:true,allowFigureOne:true});
 const read=async doi=>await page.evaluate(async j=>{
   const trace=[];
   const rows=await __tmRscAjax.rscNativeAjaxGraphicalAbstractCandidates(j,trace);
   return {rows:rows.map(r=>({url:r.url,kind:r.kind,source:r.source,assetType:r.assetType})),
     stages:trace.map(r=>({stage:r.stage,event:r.event,status:r.status,httpStatus:r.httpStatus||0}))};
 },job(doi));
 await install(urls[sc]);
 const matched=await page.evaluate(j=>__tmRscAjax.rscNativeAjaxBoundRoute(j),job(sc));
 test('only DOI-bound journal/articleId route is created',
   matched?.url==='https://pubs.rsc.org/sc/PlatformArticle/ArticleAbstractAjax?articleId=1367242&layAbstract=false');
 test('nonmatching DOI cannot request another publisher article',
   await page.evaluate(j=>__tmRscAjax.rscNativeAjaxBoundRoute(j),job(gc))===null);
 test('historical/unlisted RSC DOI not dispatched',
   await page.evaluate(j=>__tmRscAjax.rscNativeAjaxBoundRoute(j),job('10.1039/d6sc06573b'))===null);
 fixture={success:true,html:'<div class="graphical-abstract"><img alt="Graphical abstract" src="'+gaImage+'"></div>',status:200};
 let response=await read(sc);
 test('publisher abstract AJAX yields correct same-DOI official graphical abstract',
   response.rows.some(r=>r.url===gaImage&&r.kind==='official'&&r.source==='rsc_silverchair_abstract_ajax'));
 test('first-party route has bounded article ID and AJAX header',ajaxCalls.some(c=>
   c.host==='pubs.rsc.org'&&c.articleId==='1367242'&&c.lay==='false'&&c.requestedWith==='XMLHttpRequest'));
 const direct=await page.evaluate(async j=>{
   const trace=[];return (await __tmRscAjax.iframeCandidates(j,trace)).map(x=>x.url);
 },job(sc));
 test('existing bounded iframe fallback accepts verified native AJAX before old listing probe',
   direct.includes(gaImage));
 fixture.html='<div class="graphical-abstract"><img alt="PDF page preview" src="https://pubs.rsc.org/image/article/d6sc06407h.pdf.png"></div>';
 response=await read(sc);
 test('PDF page preview never becomes official TOC',response.rows.length===0);
 fixture.html='<div class="fig-graphic"><img alt="Scheme 3 Substrate scope" src="'+gaImage+'"></div>';
 response=await read(sc);
 test('numbered substrate scope never becomes official TOC',response.rows.length===0);
 fixture.html='<div class="graphical-abstract"><img src="https://evil.example/graphic.png"></div>';
 response=await read(sc);
 test('foreign publisher image source denied',response.rows.length===0);
 fixture.html='<div class="graphical-abstract"><img src="https://pubs.rsc.org/image/article/2026/gc/10.1039-d6gc03748h-abstract.jpg"></div>';
 response=await read(sc);
 test('explicitly foreign DOI source denied',response.rows.length===0);
 fixture={success:false,html:'<div class="graphical-abstract"><img src="'+gaImage+'"></div>',status:200};
 response=await read(sc);
 test('negative official AJAX response remains missing, not a forged success',response.rows.length===0);
 fixture.status=403;
 response=await read(sc);
 test('publisher access refusal produces no TOC and no bypass',
   response.rows.length===0&&response.stages.some(s=>s.event==='access_denied'&&s.httpStatus===403));
 const before=ajaxCalls.length;
 response=await read('10.1039/d6sc06573b');
 test('all other RSC DOIs incur zero new publisher network requests',
   response.rows.length===0&&ajaxCalls.length===before);
 await install(urls[gc]);
 fixture={success:true,html:'<div class="graphicalAbstract"><img src="'+gcImage+'"></div>',status:200};
 response=await read(gc);
 test('target Green Chemistry route uses exact RSC GC article and GA source',
   response.rows.some(x=>x.url===gcImage&&x.kind==='official')&&
   ajaxCalls.some(x=>x.articleId==='1367368'&&x.path.startsWith('/gc/')));
 console.log('TM_RSC_AJAX_TEST_SUMMARY '+JSON.stringify({passed,tests:'Chromium DOM/AJAX mock',
   targetedDois:[sc,gc],publisherRequests:0,externalWrites:0,PDFPreviewRejected:true,
   otherRscUnchanged:true,accessDenialHonored:true}));
} finally {await browser.close();}
