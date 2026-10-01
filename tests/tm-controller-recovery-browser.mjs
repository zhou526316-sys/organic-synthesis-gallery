import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {chromium} from 'playwright';
const output=process.env.RUNNER_TEMP||'/tmp';
const source=await fs.readFile('public/toc-mainline.user.js','utf8');
const cut=source.lastIndexOf('  installMenu();');assert.ok(cut>0);
const script=source.slice(0,cut)+`
 isGalleryPage=()=>true;
 controllerRun=()=>{globalThis.__testStarts=(globalThis.__testStarts||0)+1;badge('测试：已恢复单一控制器','#374151');};
 globalThis.T={owner:CONTROLLER_ID,renewLease,requestControllerStart,requestControllerPause,pollControllerResume,controllerLifecycleSnapshot};
 installMenu();mountCaptureLivePanel();
})();`;
const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end('<!doctype html><html lang="zh"><meta charset="utf-8"><title>Controller recovery regression</title><body><h1>Controller recovery fixture</h1><button id="resume">继续媒体抓取主线</button></body></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1000,height:800}});
await context.tracing.start({screenshots:true,snapshots:true,sources:true});
const report={environment:'Chromium with mocked synchronous GM storage, not a live installed extension',publisherRequests:0,mediaWrites:0,consoleErrors:[],pageErrors:[],failedRequests:[],responses:[],passed:false};
try{
 await context.addInitScript(()=>{
  window.__menus={};window.__testStarts=0;
  window.GM_getValue=(k,d)=>{const v=localStorage.getItem(k);return v===null?d:JSON.parse(v);};
  window.GM_setValue=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  window.GM_deleteValue=k=>localStorage.removeItem(k);
  window.GM_listValues=()=>Object.keys(localStorage);
  window.GM_registerMenuCommand=(k,v)=>{window.__menus[k]=v;};
  window.GM_xmlhttpRequest=()=>{throw Error('Unexpected production request');};
  window.GM_openInTab=()=>{throw Error('Unexpected publisher open');};
 });
 const a=await context.newPage(),b=await context.newPage();
 for(const page of [a,b]){
  page.on('pageerror',e=>report.pageErrors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
  page.on('requestfailed',r=>report.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
  page.on('response',r=>report.responses.push({url:r.url(),status:r.status()}));
  await page.goto(base);await page.addScriptTag({content:script});
  await page.evaluate(()=>document.querySelector('#resume').onclick=()=>__menus['继续媒体抓取主线']());
 }
 await a.evaluate(()=>{GM_setValue('osg-toc-v6:enabled',false);GM_setValue('osg-toc-v6:abort-request',{at:Date.now()});GM_setValue('osg-toc-v6:controller-lease',{owner:T.owner,expiresAt:Date.now()+90000});GM_setValue('organicGalleryCloudflareBridgeWriteToken','test-only-preserve');GM_setValue('osg-toc-v6:verified-capture:test',{retained:true});});
 await b.locator('#resume').click();
 await b.waitForFunction(()=>T.controllerLifecycleSnapshot().resumePending===true);
 await b.waitForFunction(()=>document.querySelector('#osg-capture-live-panel').shadowRoot.textContent.includes('等待旧任务收尾后自动恢复'));
 assert.equal(await b.evaluate(()=>__testStarts),0);
 const originalOwner=await a.evaluate(()=>T.owner);
 assert.equal(await b.evaluate(()=>GM_getValue('osg-toc-v6:controller-lease').owner),originalOwner);
 await b.screenshot({path:output+'/tm-controller-waiting.png'});
 assert.equal(await a.evaluate(()=>T.renewLease()),false);
 await b.waitForFunction(()=>__testStarts===1,{},{timeout:5000});
 assert.equal(await a.evaluate(()=>__testStarts),0);
 assert.equal(await b.evaluate(()=>GM_getValue('organicGalleryCloudflareBridgeWriteToken')),'test-only-preserve');
 assert.equal(await b.evaluate(()=>GM_getValue('osg-toc-v6:verified-capture:test').retained),true);
 await b.screenshot({path:output+'/tm-controller-resumed.png'});
 assert.equal(report.pageErrors.length,0);assert.equal(report.consoleErrors.length,0);assert.equal(report.failedRequests.length,0);
 report.passed=true;report.cases=['resume queue shown in real panel','live lease not stolen','paused idle owner releases','requesting page resumes once','other page does not start','credential and receipt retained'];
}finally{
 await context.tracing.stop({path:output+'/tm-controller-browser-trace.zip'});
 await fs.writeFile(output+'/tm-controller-browser-report.json',JSON.stringify(report,null,2));
 console.log('CONTROLLER_BROWSER_REPORT',JSON.stringify(report));
 await browser.close();server.close();
}
