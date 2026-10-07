import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { gzipSync } from 'node:zlib';

const root=path.resolve('dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://x');
  if(u.pathname==='/publisher-fallback.html'){res.writeHead(200,{'content-type':'text/html'});res.end('<h1 id="fallback">publisher</h1>');return;}
  if(u.pathname==='/private-hit.html'){res.writeHead(200,{'content-type':'text/html'});res.end('<h1 id="private">private pdf route</h1>');return;}
  let rel=decodeURIComponent(u.pathname).replace(/^\/+/, '')||'index.html';
  let file=path.join(root,rel);
  try{const st=await fs.stat(file);if(st.isDirectory())file=path.join(file,'index.html');const body=await fs.readFile(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(body);}
  catch{res.writeHead(404);res.end('not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;

const output=path.resolve(process.env.PRIVATE_PDF_BROWSER_OUTPUT||'test-results/private-pdf-access-browser');
await fs.mkdir(output,{recursive:true});
let browser;
try{browser=await chromium.launch({headless:true});}
catch(error){
 await fs.writeFile(path.join(output,'summary.json'),JSON.stringify({schemaVersion:1,ok:false,passed:0,cases:[],error:String(error?.stack||error)},null,2)+'\n');
 server.close();throw error;
}
const SESSION_KEY='organic-gallery-session-v1';
const API_ROUTE=/^https:\/\/(?:api\.gczhouwld\.com|organic-synthesis-gallery\.zhou526316\.workers\.dev)\//;
const activeContexts=new Set(),cases=[];
let passed=0,currentCase=null;
const boundedPush=(rows,value)=>{if(rows.length<80)rows.push(value);};
async function newTrackedContext(options={}){
 const context=await browser.newContext(options);activeContexts.add(context);
 context.setDefaultTimeout(7000);context.setDefaultNavigationTimeout(10000);
 await context.tracing.start({screenshots:true,snapshots:true,sources:true});
 const diagnostic=currentCase;
 // Every API response is a fixture; an unhandled external request must never reach production.
 await context.route('**/*',route=>{
  if(new URL(route.request().url()).origin===base)return route.continue();
  boundedPush(diagnostic.unmockedExternalRequests,route.request().url());
  return route.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"error":"unmocked_external_request"}'});
 });
 context.on('close',()=>activeContexts.delete(context));
 context.on('page',page=>{
  page.on('pageerror',error=>boundedPush(diagnostic.pageErrors,String(error)));
  page.on('console',message=>{if(message.type()==='error')boundedPush(diagnostic.consoleErrors,message.text());});
  page.on('requestfailed',request=>boundedPush(diagnostic.failedRequests,{url:request.url(),error:request.failure()?.errorText||''}));
  page.on('response',response=>{if(response.url().includes('/api/'))boundedPush(diagnostic.responses,{url:response.url(),status:response.status()});});
 });
 return context;
}
async function test(name,fn){
 const record={name,status:'running',pageErrors:[],consoleErrors:[],failedRequests:[],responses:[],unmockedExternalRequests:[]};
 cases.push(record);currentCase=record;const started=Date.now();
 try{await fn();assert.equal(record.pageErrors.length,0,'uncaught browser error');assert.deepEqual(record.unmockedExternalRequests,[],'all external requests must use fixtures');record.status='passed';passed++;console.log('PRIVATE_PDF_BROWSER_PASS '+name);}
 catch(error){
  record.status='failed';record.error=String(error?.stack||error);
  const slug=String(cases.length).padStart(2,'0')+'-'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,55);
  let index=0;record.screenshots=[];record.traces=[];
  for(const context of activeContexts){
   for(const page of context.pages()){
    const filename=slug+'-'+(++index)+'.png';
    try{await page.screenshot({path:path.join(output,filename),fullPage:true});record.screenshots.push(filename);}catch{}
   }
   const trace=slug+'-context-'+index+'.zip';
   try{await context.tracing.stop({path:path.join(output,trace)});record.traces.push(trace);}catch{}
  }
  await fs.writeFile(path.join(output,slug+'-diagnostics.json'),JSON.stringify(record,null,2)+'\n');
  throw error;
 }finally{
  record.durationMs=Date.now()-started;
  for(const context of [...activeContexts])await context.close().catch(()=>{});
 }
}
const today=new Date(Date.now()+8*60*60*1000).toISOString().slice(0,10);
const papers=Array.from({length:72},(_,index)=>({
 journal:'JACS',title:'Private PDF browser fixture '+String(index).padStart(3,'0'),
 doi:'10.9999/private-pdf-fixture-'+String(index).padStart(3,'0'),
 date:today,addedDate:today,new:true,url:null,authors:['Fixture Author'],
}));
const encodedPapers=gzipSync(JSON.stringify(papers)).toString('base64');
async function contextWith(capabilities,openResult={available:true,url:base+'/private-hit.html?token=opaque'},options={}){
 const context=await newTrackedContext({viewport:options.viewport||{width:1280,height:900}});
 const state={privateCalls:0,authTokens:[],pendingOwner:[],releasedOwner:0};
 await context.addInitScript(()=>{
  if(localStorage.getItem('private-pdf-browser-fixture-seeded')!=='1'){
   localStorage.setItem('organic-gallery-session-v1','fixture-session');
   localStorage.setItem('private-pdf-browser-fixture-seeded','1');
  }
  window.__pdfCap=null;window.__pdfCapabilityEvents=[];
  window.addEventListener('gallery-private-pdf-capability',event=>{
   window.__pdfCap=event.detail;window.__pdfCapabilityEvents.push(event.detail?.read);
  });
 });
 await context.route(base+'/**',async route=>{
  const pathname=new URL(route.request().url()).pathname;
  if(pathname==='/release-delivery.json')return route.fulfill({status:404,body:'fixture selects local legacy catalog'});
  if(pathname.startsWith('/architecture-v1/')){await new Promise(resolve=>setTimeout(resolve,50));return route.fulfill({status:404,body:'fixture'});}
  if(pathname==='/papers.gz.b64')return route.fulfill({status:200,body:encodedPapers});
  if(['/total-synthesis.json','/manual-supplement.json','/final-audit-supplement.json'].includes(pathname))
   return route.fulfill({status:200,contentType:'application/json',body:'{"papers":[]}'});
  return route.continue();
 });
 await context.route(API_ROUTE,async route=>{
  const url=new URL(route.request().url());
  const reply=body=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
  if(url.pathname==='/api/user-ui/auth/session'){
   const token=String(route.request().headers().authorization||'').replace(/^Bearer /,'');
   state.authTokens.push(token);
   const allowed=token==='fixture-session'?capabilities:[];
   if(options.holdOwner&&token==='fixture-session'){
    await new Promise(resolve=>state.pendingOwner.push(resolve));state.releasedOwner++;
   }
   return reply({authenticated:Boolean(token),user:token?{id:token==='fixture-session'?'fixture-owner':'fixture-ordinary',email:'fixture@example.invalid',capabilities:allowed}:null});
  }
  if(url.pathname.startsWith('/api/user-ui/private-pdf/')){state.privateCalls++;return reply(openResult);}
  if(url.pathname==='/api/user-ui/integrations')return reply({auth:{local:true,google:false,wechat:false,qq:false,email:false},payments:{wechat:false,alipay:false}});
  if(url.pathname.includes('reader-counts'))return reply({counts:{}});
  if(url.pathname==='/api/user-ui/pageview')return reply({ok:true});
  if(url.pathname==='/api/literature/supplement')return reply({papers:[]});
  return route.fulfill({status:404,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{}'});
 });
 return {context,state};
}
async function gallery(context,read){
 const page=await context.newPage();await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.locator('.card a.open').first().waitFor();
 await page.waitForFunction(expected=>window.__pdfCap?.read===expected,read,{timeout:7000});
 return page;
}
async function waitForNode(page,predicate){
 for(let attempt=0;attempt<100;attempt++){if(predicate())return;await page.waitForTimeout(25);}
 assert.ok(predicate(),'expected mocked request did not arrive');
}
async function popup(page,locator){
 const opened=page.waitForEvent('popup');await locator.click();const target=await opened;
 await target.waitForLoadState('domcontentloaded');return target;
}
async function assertPdfHidden(page){
 assert.equal(await page.locator('.card .private-pdf-button:visible').count(),0);
 assert.equal(await page.locator('html').getAttribute('data-private-pdf-read'),'false');
}
async function replaceToken(page,value,event=true){
 return page.evaluate(({value,event,key})=>{
  if(value)localStorage.setItem(key,value);else localStorage.removeItem(key);
  if(event)window.dispatchEvent(new Event('gallery-auth-session-changed'));
  return document.documentElement.dataset.privatePdfRead;
 },{value,event,key:SESSION_KEY});
}
try{
 await test('owner PDF button is independent and original link remains publisher-only',async()=>{
  const {context,state}=await contextWith(['private_pdf_read']);const page=await gallery(context,true);
  const card=page.locator('.card').first(),original=card.locator('a.open'),pdf=card.locator('a.private-pdf-button');
  assert.ok(await pdf.isVisible());assert.equal(await pdf.getAttribute('target'),'_blank');
  const publisher=await original.getAttribute('href'),viewer=new URL(await pdf.getAttribute('href'),base);
  assert.equal(viewer.pathname,'/pdf/');assert.equal(viewer.searchParams.get('doi'),await card.getAttribute('data-doi'));
  assert.equal(viewer.searchParams.get('fallback'),publisher);
  await original.evaluate(anchor=>{anchor.href='/publisher-fallback.html';});
  const publisherPage=await popup(page,original);assert.match(publisherPage.url(),/publisher-fallback\.html/);
  assert.equal(state.privateCalls,0);await publisherPage.close();
  const target=await popup(page,pdf);assert.match(target.url(),/\/pdf\/?\?doi=/);
  await target.waitForFunction(()=>document.querySelector('#pdf-frame')?.getAttribute('src')?.includes('/private-hit.html'),undefined,{timeout:7000});
  assert.equal(state.privateCalls,1);
 });
 for(const capabilities of [[],['private_pdf_owner','private_pdf_capture']]){
  await test(capabilities.length?'capture-only account has no PDF read button or private lookup':'ordinary account hides PDF button and retains publisher original',async()=>{
   const {context,state}=await contextWith(capabilities);const page=await gallery(context,false);
   await assertPdfHidden(page);
   const original=page.locator('.card a.open').first();await original.evaluate(anchor=>{anchor.href='/publisher-fallback.html';});
   const target=await popup(page,original);assert.match(target.url(),/publisher-fallback\.html/);assert.equal(state.privateCalls,0);
  });
 }
 await test('owner without a verified copy sees viewer and explicit publisher fallback',async()=>{
  const {context}=await contextWith(['private_pdf_read'],{available:false});const page=await gallery(context,true);
  const pdf=page.locator('.card a.private-pdf-button').first();
  const expected=new URL(await pdf.getAttribute('href'),base).searchParams.get('fallback');
  const target=await popup(page,pdf);assert.match(target.url(),/\/pdf\/?\?doi=/);
  await target.getByText('该论文尚无已验证的私有 PDF。').waitFor();
  assert.equal(await target.locator('#publisher-fallback').getAttribute('href'),expected);
 });
 for(const [width,expected] of [[1280,24],[390,12]]){
  await test('new '+expected+'-card result pages inherit PDF visibility without per-card requests',async()=>{
   const {context,state}=await contextWith(['private_pdf_read'],undefined,{viewport:{width,height:900}});
   const page=await gallery(context,true);
   assert.equal(await page.locator('.card').count(),expected);assert.equal(await page.locator('.card .private-pdf-button:visible').count(),expected);
   if(width===390){
    const card=page.locator('.card').first(),box=await card.boundingBox();
    assert.ok(box&&box.width>0&&box.height>0);
    for(const selector of ['a.private-pdf-button','a.open']){
     const button=await card.locator(selector).boundingBox();
     assert.ok(button&&button.width>0&&button.height>0,selector+' has a visible box');
     assert.ok(button.x>=box.x-1&&button.x+button.width<=Math.min(width,box.x+box.width)+1,selector+' fits the card and viewport');
    }
    const footer=await card.locator('.cardfoot').evaluate(element=>({client:element.clientWidth,scroll:element.scrollWidth,right:element.getBoundingClientRect().right}));
    assert.ok(footer.scroll<=footer.client+1&&footer.right<=Math.min(width,box.x+box.width)+1,'card footer has no horizontal overflow');
   }
   const first=await page.locator('.card').first().getAttribute('data-doi');
   await page.locator('#nextResultPage').click();
   await page.waitForFunction(previous=>document.querySelector('.card')?.getAttribute('data-doi')!==previous,first,{timeout:7000});
   assert.equal(await page.locator('.card').count(),expected);assert.equal(await page.locator('.card .private-pdf-button:visible').count(),expected);
   assert.equal(state.privateCalls,0);
   await page.locator('#previousResultPage').click();
   await page.waitForFunction(previous=>document.querySelector('.card')?.getAttribute('data-doi')===previous,first,{timeout:7000});
  });
 }
 await test('logout notification hides all PDF buttons synchronously',async()=>{
  const {context,state}=await contextWith(['private_pdf_read']);const page=await gallery(context,true);
  assert.equal(await replaceToken(page,''),'false');await assertPdfHidden(page);
  await page.waitForTimeout(850);await assertPdfHidden(page);assert.equal(state.privateCalls,0);
 });
 await test('ordinary account switch in another tab revokes owner PDF capability',async()=>{
  const {context,state}=await contextWith(['private_pdf_read']);const page=await gallery(context,true);
  const other=await context.newPage();await other.goto(base+'/publisher-fallback.html');
  const reloaded=page.waitForNavigation({waitUntil:'domcontentloaded'});
  await other.evaluate(()=>localStorage.setItem('organic-gallery-session-v1','ordinary-session'));
  await reloaded;await page.locator('.card a.open').first().waitFor();
  await page.waitForFunction(()=>document.documentElement.dataset.privatePdfRead==='false',undefined,{timeout:3000});
  await waitForNode(page,()=>state.authTokens.includes('ordinary-session'));await assertPdfHidden(page);assert.equal(state.privateCalls,0);
 });
 await test('late owner capability response cannot reopen PDF after account switch',async()=>{
  const {context,state}=await contextWith(['private_pdf_read'],undefined,{holdOwner:true});const page=await gallery(context,false);
  await waitForNode(page,()=>state.pendingOwner.length>0);
  await replaceToken(page,'ordinary-session');await waitForNode(page,()=>state.authTokens.includes('ordinary-session'));
  const waiting=state.pendingOwner.splice(0);for(const release of waiting)release();
  await waitForNode(page,()=>state.releasedOwner>=waiting.length);
  await page.waitForTimeout(850);await assertPdfHidden(page);
  assert.equal(await page.evaluate(()=>window.__pdfCapabilityEvents.includes(true)),false);assert.equal(state.privateCalls,0);
 });
 await test('click and auxclick fence a changed token before the watcher runs',async()=>{
  for(const type of ['click','auxclick']){
   const {context,state}=await contextWith(['private_pdf_read']);const page=await gallery(context,true);
   const allowed=await page.evaluate(type=>{
    localStorage.setItem('organic-gallery-session-v1','ordinary-session');
    return document.querySelector('a.private-pdf-button').dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,button:type==='auxclick'?1:0}));
   },type);
   assert.equal(allowed,false,type+' must cancel navigation');await assertPdfHidden(page);
   assert.equal(context.pages().length,1);assert.equal(state.privateCalls,0);await context.close();
  }
 });
 await test('token watcher revokes PDF when a same-tab writer emits no event',async()=>{
  const {context,state}=await contextWith(['private_pdf_read']);const page=await gallery(context,true);
  await replaceToken(page,'ordinary-session',false);
  await page.waitForFunction(()=>document.documentElement.dataset.privatePdfRead==='false',undefined,{timeout:3000});
  await assertPdfHidden(page);assert.equal(state.privateCalls,0);
 });
 await test('owner setup page shows current account and claims only after explicit confirmation',async()=>{
  const context=await newTrackedContext();await context.addInitScript(()=>localStorage.setItem('organic-gallery-session-v1','fixture-session'));let claim=0;
  await context.route(API_ROUTE,async route=>{const u=new URL(route.request().url());if(u.pathname==='/api/user-ui/auth/session')return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({authenticated:true,user:{id:'u1',email:'owner@example.invalid',capabilities:[]}})});if(u.pathname==='/api/user-ui/private-pdf/bootstrap-owner'){claim++;return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({claimed:true,capabilities:['private_pdf_owner','private_pdf_read']})});}return route.fulfill({status:404,headers:{'access-control-allow-origin':'*'},body:'{}'});});
  const page=await context.newPage();await page.goto(base+'/private-pdf-owner-setup.html#code=fixture-secret');await page.locator('#claim:not([disabled])').waitFor();assert.equal(await page.locator('#account').textContent(),'owner@example.invalid');assert.equal(claim,0);await page.locator('#claim').click();await page.locator('#status.ok').waitFor();assert.equal(claim,1);await context.close();
 });
 await test('existing owner can authorize PDF capture without healthcheck CORS preflight',async()=>{
  const context=await newTrackedContext();
  await context.addInitScript(()=>{
    localStorage.setItem('organic-gallery-session-v1','fixture-session');
    window.addEventListener('message',event=>{
      if(event.origin!==location.origin||event.data?.type!=='osg-private-pdf-capture-lease-v1')return;
      window.postMessage({
        type:'osg-private-pdf-capture-lease-ack-v1',
        expiresAt:event.data.expiresAt,
      },location.origin);
    });
  });
  let healthCalls=0,leaseCalls=0;
  await context.route(API_ROUTE,async route=>{
    const u=new URL(route.request().url());
    if(u.pathname==='/api/_healthcheck'){healthCalls++;return route.abort('failed');}
    if(u.pathname==='/api/user-ui/auth/session')return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({authenticated:true,user:{id:'u1',email:'owner@example.invalid',capabilities:['private_pdf_owner','private_pdf_read','private_pdf_capture']}})});
    if(u.pathname==='/api/user-ui/private-pdf/capture-lease'){leaseCalls++;return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({token:'A'.repeat(48),expiresAt:Date.now()+7*86400000,scope:'private_pdf_capture'})});}
    return route.fulfill({status:404,headers:{'access-control-allow-origin':'*'},body:'{}'});
  });
  const page=await context.newPage();
  await page.goto(base+'/private-pdf-owner-setup.html');
  await page.locator('#authorize:not([disabled])').waitFor();
  assert.equal(healthCalls,0);
  assert.equal(await page.locator('#capture-status').textContent(),'可单独授权本浏览器的 PDF 捕获模块。');
  await page.locator('#authorize').click();
  await page.getByText(/PDF 捕获授权成功/).waitFor();
  assert.equal(leaseCalls,1);
  assert.equal(healthCalls,0);
  await context.close();
 });

}catch(error){console.error('PRIVATE_PDF_BROWSER_FAIL '+String(error?.stack||error));process.exitCode=1;}
finally{
 for(const context of [...activeContexts])await context.close().catch(()=>{});
 await browser.close();await new Promise(resolve=>server.close(resolve));
 const summary={schemaVersion:1,ok:!process.exitCode,passed,total:cases.length,cases:cases.map(({name,status,durationMs,error})=>({name,status,durationMs,...(error?{error}:{} )})),completedAt:new Date().toISOString()};
 await fs.writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');
 console.log('PRIVATE_PDF_BROWSER_SUMMARY '+JSON.stringify(summary));
}
