import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {chromium} from 'playwright';
const out=process.env.RUNNER_TEMP||'/tmp';
const source=await fs.readFile('public/toc-mainline.user.js','utf8');
const cut=source.lastIndexOf('  installManualRestartListener();');assert.ok(cut>0);
const script=source.slice(0,cut)+`
 isGalleryPage=()=>true;writeToken=()=> 'fixture';enqueueCaptureReport=()=>true;
 getJson=async url=>url.includes('capabilities')?{captureVersion:VERSION,mediaGeneration:1790082000000,mode:'verified-staging',mediaControllerRevision:CONTROLLER_REVISION,evidenceSchemaVersion:EVIDENCE_SCHEMA_VERSION}:{latestAddedDate:'2026-10-01',generatedAt:'2026-10-01T05:00:00Z',webpageDoiCount:2,mediaGeneration:1790082000000,articles:[{doi:'10.1038/s41586-026-old',journal:'Nature',addedDate:'2026-09-30'},{doi:'10.1021/jacs.6c90002',journal:'JACS',addedDate:'2026-10-01'}]};
 observeArchitectureMembership=async(queue)=>{var dois=queue.articles.map(a=>normalizeDoi(a.doi));return {ok:true,revision:'fixture-active-v2',publicationSlot:'2026-10-01T08:00:00+08:00',catalogId:'a'.repeat(64),asOfDate:'2026-10-01',cutoff:'2026-07-01',memberCount:dois.length,activeCount:dois.length,hotCount:dois.length,archiveCount:0,recentAdditionCount:0,activeDois:dois,archiveDois:[],memberDois:dois,withdrawn:[]};};
 readMissingCaptureInventory=async(q)=>({media:{items:q.articles.map(a=>({doi:a.doi,figureCount:0,tocStored:false,capturedFigures:[]}))},tocs:{items:[],count:0},figures:{complete:true,items:[]},evidence:{items:[],count:0},errors:[]});
 globalThis.T={forceStartFromHead,finishPairedJob,owner:CONTROLLER_ID,requestControllerPause};
 installManualRestartListener();installMenu();mountCaptureLivePanel();})();`;
const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end('<!doctype html><html lang="zh"><meta charset="utf-8"><title>Immediate restart fixture</title><body><h1>立即开始任务 · 从头抓</h1></body></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1050,height:800}});
await context.tracing.start({screenshots:true,snapshots:true,sources:true});
const report={mockedGM:true,publisherNetworkRequests:0,productionWrites:0,consoleErrors:[],pageErrors:[],failedRequests:[],responses:[],passed:false};
try{
 await context.addInitScript(()=>{
  const listeners=[];window.__opened=[];window.__menus={};window.__clicks=[];
  window.GM_getValue=(k,d)=>{const x=localStorage.getItem(k);return x===null?d:JSON.parse(x);};
  window.GM_setValue=(k,v)=>{const old=GM_getValue(k,null);localStorage.setItem(k,JSON.stringify(v));for(const x of listeners.filter(x=>x.k===k))x.f(k,old,v,false);};
  window.GM_deleteValue=k=>localStorage.removeItem(k);window.GM_listValues=()=>Object.keys(localStorage);
  window.GM_addValueChangeListener=(k,f)=>listeners.push({k,f});window.addEventListener('storage',e=>{for(const x of listeners.filter(x=>x.k===e.key))x.f(e.key,e.oldValue?JSON.parse(e.oldValue):null,e.newValue?JSON.parse(e.newValue):null,true);});
  window.GM_registerMenuCommand=(k,f)=>window.__menus[k]=f;
  window.GM_openInTab=url=>{const j=GM_getValue('osg-toc-v6:active-job');const tab={closed:false,close(){this.closed=true;}};__opened.push({url,job:j,at:performance.now(),tab});return tab;};
 });
 const a=await context.newPage(),b=await context.newPage();
 for(const page of [a,b]){page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});page.on('pageerror',e=>report.pageErrors.push(String(e)));page.on('requestfailed',r=>report.failedRequests.push(r.url()));page.on('response',r=>report.responses.push({url:r.url(),status:r.status()}));await page.goto('http://127.0.0.1:'+server.address().port);await page.addScriptTag({content:script});}
 await a.evaluate(()=>{GM_setValue('osg-toc-v6:controller-lease',{owner:T.owner,expiresAt:Date.now()+90000});GM_setValue('osg-toc-v6:active-job',{doi:'10.1021/old',jobId:'old'});GM_setValue('osg-toc-v6:enabled',false);GM_setValue('osg-toc-v6:abort-request',{at:Date.now()});GM_setValue('saved-fixture',{retained:true});});
 await b.locator('#osg-immediate-start').click();
 await b.waitForFunction(()=>__opened.length===1,null,{timeout:3000});
 const first=await b.evaluate(()=>__opened[0].job);assert.equal(first.doi,'10.1021/jacs.6c90002');
 await b.locator('#osg-immediate-start').click();
 await b.waitForFunction(()=>__opened.length===2,null,{timeout:3000});
 const second=await b.evaluate(()=>__opened[1].job);assert.equal(second.doi,first.doi);assert.notEqual(first.manualRunId,second.manualRunId);assert.equal(await b.evaluate(()=>__opened[0].tab.closed),true);
 await a.locator('#osg-immediate-start').click();
 await a.waitForFunction(()=>__opened.length===1,null,{timeout:3000});
 await b.waitForFunction(()=>__opened[1].tab.closed===true,null,{timeout:3000});
 const third=await a.evaluate(()=>__opened[0].job);assert.notEqual(third.manualRunId,second.manualRunId);
 const stale=await b.evaluate(async job=>T.finishPairedJob(job,{status:'success',reason:'late'},[],''),second);assert.equal(stale.reason,'manual_run_superseded');
 assert.equal(await a.evaluate(()=>GM_getValue('osg-toc-v6:last-run-summary').controllerRunId),'manual:'+third.manualRunId);
 assert.equal(await a.evaluate(()=>GM_getValue('saved-fixture').retained),true);
 await a.waitForTimeout(1100);await a.screenshot({path:out+'/tm-immediate-active.png'});
 assert.equal(report.consoleErrors.length,0);assert.equal(report.pageErrors.length,0);assert.equal(report.failedRequests.length,0);
 report.cases=['click starts under unexpired foreign lease','latest DOI first','same-page second click starts again','old task closed without waiting','second-page ownership transfer','late result fenced','saved data retained'];report.passed=true;
 await a.evaluate(()=>T.requestControllerPause());
}finally{await context.tracing.stop({path:out+'/tm-immediate-browser-trace.zip'});await fs.writeFile(out+'/tm-immediate-browser-report.json',JSON.stringify(report,null,2));console.log('IMMEDIATE_BROWSER_REPORT',JSON.stringify(report));await browser.close();server.close();}
