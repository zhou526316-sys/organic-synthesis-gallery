import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import http from 'node:http';
import {chromium} from 'playwright';
const out=process.env.RUNNER_TEMP||'/tmp';
const source=await fs.readFile('public/toc-mainline.user.js','utf8');
const cut=source.lastIndexOf('  installManualRestartListener();');
const script=source.slice(0,cut)+`
 isGalleryPage=()=>true;writeToken=()=> 'fixture';enqueueCaptureReport=()=>true;
 let fakeNow=Date.now();Date.now=()=>fakeNow;sleep=async(ms)=>{fakeNow+=ms;};
 const ar=Array.from({length:61},(_,n)=>({doi:'10.1021/jacs.6c'+String(n).padStart(5,'0'),journal:'JACS',addedDate:'2026-10-02',date:'2026-10-01'}));
 const q={articles:ar,webpageDoiCount:ar.length,latestAddedDate:'2026-10-02',generatedAt:'2026-10-02T16:00:00Z',mediaGeneration:1790082000000};
 getJson=async(u)=>u.includes('capabilities')?{captureVersion:VERSION,mediaGeneration:1790082000000,mode:'verified-staging',mediaControllerRevision:CONTROLLER_REVISION,evidenceSchemaVersion:EVIDENCE_SCHEMA_VERSION}:q;
 readMissingCaptureInventory=async()=>({media:{items:ar.map(a=>({doi:a.doi,tocStored:false,figureCount:0,capturedFigures:[]}))},tocs:{items:[],count:0},figures:{complete:true,items:ar.map(a=>({doi:a.doi,expectedFigureCount:1,figures:{'Figure 1':{label:'Figure 1',sourceUrl:'https://pubs.acs.org/'+a.doi+'/f1.png',contentHash:'a'.repeat(32),width:1000,height:500,quality:'high'}}}))},evidence:{items:[],count:0},errors:[]});
 globalThis.T={forceStartFromHead,requestControllerPause};
 installManualRestartListener();installMenu();mountCaptureLivePanel();})();`;
const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end('<!doctype html><meta charset="utf-8"><title>Queue coverage regression</title><h1>Queue coverage fixture</h1>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1100,height:1000}});
const report={mockedExtensionAndPublisher:true,consoleErrors:[],pageErrors:[],failedRequests:[],responses:[],productionWrites:0,publisherRequests:0,passed:false};
await context.tracing.start({screenshots:true,snapshots:true,sources:true});
try{
 const page=await context.newPage();page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});page.on('pageerror',e=>report.pageErrors.push(String(e)));page.on('requestfailed',r=>report.failedRequests.push(r.url()));page.on('response',r=>report.responses.push({url:r.url(),status:r.status()}));
 await page.addInitScript(()=>{
  const store=new Map();window.__opened=[];
  window.GM_getValue=(k,d)=>store.has(k)?structuredClone(store.get(k)):d;window.GM_setValue=(k,v)=>store.set(k,structuredClone(v));window.GM_deleteValue=k=>store.delete(k);window.GM_listValues=()=>[...store.keys()];window.GM_registerMenuCommand=()=>{};window.GM_addValueChangeListener=()=>{};
  window.GM_openInTab=()=>{const j=GM_getValue('osg-toc-v6:active-job');__opened.push(j);const failed=j.doi==='10.1021/jacs.6c00020';GM_setValue('osg-toc-v6:result:'+j.doi,{doi:j.doi,jobId:j.jobId,version:'6.2.20',status:failed?'failed':'success',reason:failed?'publisher_access_gate':'combined_capture',toc:{status:failed?'failed':'stored',kind:'official'},figures:{status:'not_requested',discovered:0,stored:0,failed:0,items:[]},fulltext:{status:'not_requested'},finishedAt:new Date().toISOString()});return {closed:false,close(){this.closed=true;}};};
 });
 await page.goto('http://127.0.0.1:'+server.address().port);await page.addScriptTag({content:script});
 await page.locator('#osg-immediate-start').click();await page.waitForFunction(()=>GM_getValue('osg-toc-v6:last-run-summary',{}).finishedAt);
 await page.waitForTimeout(1100);
 const snapshot=await page.evaluate(()=>({summary:GM_getValue('osg-toc-v6:last-run-summary'),opened:__opened.map(j=>({doi:j.doi,run:j.manualRunId})),text:document.querySelector('#osg-capture-live-panel').shadowRoot.querySelector('#gaps').textContent}));
 assert.equal(snapshot.opened.length,61);assert.equal(new Set(snapshot.opened.map(x=>x.run)).size,1);assert.equal(snapshot.summary.total,61);assert.equal(snapshot.summary.visitedCount,61);assert.equal(snapshot.summary.fullyResolved,60);assert.equal(snapshot.summary.unresolvedCount,1);assert.match(snapshot.text,/未补齐 1/);
 assert.equal(report.pageErrors.length,0);assert.equal(report.consoleErrors.length,0);assert.equal(report.failedRequests.length,0);
 report.passed=true;report.visited=61;report.fullyResolved=60;report.unresolved=1;report.oneRunId=true;
 await page.screenshot({path:out+'/tm-queue-coverage-browser.png'});
}finally{
 await context.tracing.stop({path:out+'/tm-queue-coverage-trace.zip'});await fs.writeFile(out+'/tm-queue-coverage-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();server.close();
}
