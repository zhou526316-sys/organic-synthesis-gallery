import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {chromium} from 'playwright';
const out=process.env.RUNNER_TEMP||'/tmp';
const source=await fs.readFile('public/toc-mainline.user.js','utf8'),cut=source.lastIndexOf('  installManualRestartListener();');
const script=source.slice(0,cut)+`
 isGalleryPage=()=>true;writeToken=()=> 'fixture';enqueueCaptureReport=()=>true;
 var fixtureArticles=Array.from({length:765},(_,n)=>({doi:'10.1021/jacs.6c'+String(n).padStart(5,'0'),journal:n===2?'Angew':'JACS',addedDate:n<4?'2026-10-02':'2026-10-01',date:'2026-10-01'}));
 var fq={articles:fixtureArticles,webpageDoiCount:765,latestAddedDate:'2026-10-02',generatedAt:'2026-10-02T10:00:00Z',mediaGeneration:1790082000000};
 function ff(d,n){return {label:'Figure '+n,sourceUrl:'https://acs.silverchair-cdn.com/10.1021_'+d.split('/')[1]+'/f'+n+'.png',contentHash:'a'.repeat(32),width:1000,height:500,quality:'high'};}
 getJson=async u=>u.includes('capabilities')?{captureVersion:VERSION,mediaGeneration:1790082000000,mode:'verified-staging',mediaControllerRevision:CONTROLLER_REVISION,evidenceSchemaVersion:EVIDENCE_SCHEMA_VERSION}:u.includes('local-capture-index')?{count:0,items:[]}:u.includes('/staged?')?{schemaVersion:'capture-inventory-v1',complete:true,count:765,items:fixtureArticles.map((a,n)=>({doi:a.doi,expectedFigureCount:n===2?3:2,figures:{}}))}:fq;
 observeArchitectureMembership=async(q)=>({ok:true,revision:'fixture-c2b',serial:1,publicationSlot:'2026-10-04T08:00:00+08:00',catalogId:'a'.repeat(64),membershipSha256:'b'.repeat(64),asOfDate:'2026-10-04',cutoff:'2026-07-04',liveAsOfDate:'2026-10-04',liveCutoff:'2026-07-04',memberCount:q.articles.length,hotCount:q.articles.length,archiveCount:0,activeCount:q.articles.length,archiveIdleCount:0,recentAdditionCount:0,dateReviewCount:0,activeDois:q.articles.map(a=>normalizeDoi(a.doi)),hotDois:q.articles.map(a=>normalizeDoi(a.doi)),archiveDois:[],withdrawn:[]});
 postReadJson=async(u,p)=>({items:fixtureArticles.filter(a=>p.dois.includes(a.doi)).map(a=>({doi:a.doi,tocStored:a.doi!==fixtureArticles[1].doi,figureCount:2,capturedFigures:[ff(a.doi,1),ff(a.doi,2)]}))});
 getPrivateJson=async()=>({count:764,items:fixtureArticles.filter((a,n)=>n!==3).map(a=>({doi:a.doi,available:true,evidenceLevel:'partial'}))});
 globalThis.T={forceStartFromHead,finishPairedJob,owner:CONTROLLER_ID,requestControllerPause};
 installManualRestartListener();installMenu();mountCaptureLivePanel();})();`;
const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end('<!doctype html><html lang="zh"><meta charset="utf-8"><title>Missing-only regression</title><body><h1>缺项补抓：765 篇库存中只调度 3 篇缺项</h1></body></html>')});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1100,height:1200}});
await context.tracing.start({screenshots:true,snapshots:true,sources:true});
const report={mockedGM:true,fixtureCorpus:765,expectedMissing:3,publisherRequests:0,productionWrites:0,consoleErrors:[],pageErrors:[],failedRequests:[],responses:[],passed:false};
try{
 await context.addInitScript(()=>{
  const listeners=[];window.__opened=[];window.__menus={};
  window.GM_getValue=(k,d)=>{const x=localStorage.getItem(k);return x===null?d:JSON.parse(x)};
  window.GM_setValue=(k,v)=>{const old=GM_getValue(k,null);localStorage.setItem(k,JSON.stringify(v));for(const x of listeners.filter(x=>x.k===k))x.f(k,old,v,false)};
  window.GM_deleteValue=k=>localStorage.removeItem(k);window.GM_listValues=()=>Object.keys(localStorage);
  window.GM_addValueChangeListener=(k,f)=>listeners.push({k,f});window.addEventListener('storage',e=>{for(const x of listeners.filter(x=>x.k===e.key))x.f(e.key,e.oldValue?JSON.parse(e.oldValue):null,e.newValue?JSON.parse(e.newValue):null,true)});
  window.GM_registerMenuCommand=(k,f)=>__menus[k]=f;
  window.GM_openInTab=url=>{const j=GM_getValue('osg-toc-v6:active-job'),tab={closed:false,close(){this.closed=true}};__opened.push({job:j,tab});return tab};
 });
 const a=await context.newPage(),b=await context.newPage();
 for(const page of [a,b]){page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text())});page.on('pageerror',e=>report.pageErrors.push(String(e)));page.on('requestfailed',r=>report.failedRequests.push(r.url()));page.on('response',r=>report.responses.push({url:r.url(),status:r.status()}));await page.goto('http://127.0.0.1:'+server.address().port);await page.addScriptTag({content:script});}
 await a.evaluate(()=>{GM_setValue('osg-toc-v6:controller-lease',{owner:'foreign',expiresAt:Date.now()+90000});GM_setValue('saved-fixture',{retained:true});});
 await a.locator('#osg-immediate-start').click();await a.waitForFunction(()=>__opened.length===1);
 await a.waitForTimeout(1100);
 const snap=await a.evaluate(()=>{const s=document.querySelector('#osg-capture-live-panel').shadowRoot;return {needs:s.querySelector('#needs').textContent,batch:s.querySelector('#batch').textContent,queue:s.querySelector('#queue').textContent,title:s.querySelector('summary').textContent,total:GM_getValue('osg-toc-v6:last-run-summary').total}});
 assert.equal(snap.total,3);assert.equal(snap.needs,'TOC');assert.match(snap.title,/全队列补缺6/);assert.doesNotMatch(snap.batch,/765/);assert.match(snap.queue,/正文图（缺 1 张）/);assert.match(snap.queue,/文本/);
 await a.screenshot({path:out+'/tm-missing-toc.png'});
 await a.locator('#osg-immediate-start').click();await a.waitForFunction(()=>__opened.length===2);assert.equal(await a.evaluate(()=>__opened[0].tab.closed),true);
 await b.locator('#osg-immediate-start').click();await b.waitForFunction(()=>__opened.length===1);await a.waitForFunction(()=>__opened[1].tab.closed===true);
 const stale=await a.evaluate(async()=>T.finishPairedJob(__opened[1].job,{status:'success'},[],''));assert.equal(stale.reason,'manual_run_superseded');
 await b.evaluate(async()=>T.finishPairedJob(__opened[0].job,{status:'success',toc:{status:'stored'},figures:{status:'not_requested'},fulltext:{status:'not_requested'}},[],''));
 await b.waitForFunction(()=>__opened.length===2,null,{timeout:6000});await b.waitForTimeout(1100);
 const body=await b.evaluate(()=>document.querySelector('#osg-capture-live-panel').shadowRoot.querySelector('#needs').textContent);assert.match(body,/文本/); // JACS text-only paper precedes same-batch Angew by journal priority.
 await b.screenshot({path:out+'/tm-missing-text.png'});
 assert.equal(await b.evaluate(()=>GM_getValue('saved-fixture').retained),true);
 assert.equal(report.consoleErrors.length,0);assert.equal(report.pageErrors.length,0);assert.equal(report.failedRequests.length,0);
 report.passed=true;report.cases=['765 inventory ->3 missing tasks','TOC-only work labelled','body/text gaps visible','no full-corpus denominator','repeat click restarts immediately','second-page takeover','late result fenced','text-only next job','saved data preserved'];
 await b.evaluate(()=>T.requestControllerPause());
}finally{await context.tracing.stop({path:out+'/tm-missing-browser-trace.zip'});await fs.writeFile(out+'/tm-missing-browser-report.json',JSON.stringify(report,null,2));console.log('MISSING_BROWSER_REPORT',JSON.stringify(report));await browser.close();server.close()}
