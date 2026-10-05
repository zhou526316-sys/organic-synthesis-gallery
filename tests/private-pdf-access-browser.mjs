import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

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
const browser=await chromium.launch({headless:true});
let passed=0;const cases=[];async function test(name,fn){await fn();passed++;cases.push(name);console.log('PRIVATE_PDF_BROWSER_PASS '+name);}
async function contextWith(capabilities,openResult={available:true,url:base+'/private-hit.html?token=opaque'}){
 const context=await browser.newContext();
 await context.addInitScript(()=>{localStorage.setItem('organic-gallery-session-v1','fixture-session');window.__pdfCap=null;window.addEventListener('gallery-private-pdf-capability',e=>{window.__pdfCap=e.detail;});});
 await context.route('https://api.gczhouwld.com/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/user-ui/auth/session')return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({authenticated:true,user:{id:'fixture',email:'owner@example.invalid',capabilities}})});
  if(url.pathname==='/api/user-ui/private-pdf/open')return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(openResult)});
  if(url.pathname==='/api/user-ui/integrations')return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({auth:{local:true,google:false,wechat:false,qq:false,email:false},payments:{wechat:false,alipay:false}})});
  if(url.pathname.includes('reader-counts'))return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({counts:{}})});
  return route.fulfill({status:404,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{}'});
 });
 return context;
}
try{
 await test('owner click routes to private URL only when capability and PDF are available',async()=>{
  const context=await contextWith(['private_pdf_read']);const page=await context.newPage();await page.goto(base);await page.waitForFunction(()=>window.__pdfCap?.read===true,{timeout:5000});await page.locator('.card a.open').first().waitFor();
  await page.locator('.card a.open').first().evaluate(a=>{a.href='/publisher-fallback.html';});
  await page.waitForTimeout(300);
  const before=context.pages().length;await page.locator('.card a.open').first().click();await page.waitForFunction(n=>window.length>=0,before).catch(()=>{});
  for(let i=0;i<30&&context.pages().length===before;i++)await page.waitForTimeout(100);
  assert.equal(context.pages().length,before+1);const target=context.pages().at(-1);await target.waitForURL(/private-hit\.html/,{timeout:5000,waitUntil:'commit'});assert.match(target.url(),/private-hit\.html/);await context.close();
 });
 await test('ordinary account keeps original publisher link with no private lookup',async()=>{
  const context=await contextWith([]);let privateCalls=0;context.on('request',r=>{if(r.url().includes('/private-pdf/open'))privateCalls++;});
  const page=await context.newPage();await page.goto(base);await page.waitForFunction(()=>window.__pdfCap?.read===false,{timeout:5000});await page.locator('.card a.open').first().waitFor();await page.locator('.card a.open').first().evaluate(a=>{a.href='/publisher-fallback.html';});
  await page.waitForTimeout(300);const before=context.pages().length;await page.locator('.card a.open').first().click();for(let i=0;i<30&&context.pages().length===before;i++)await page.waitForTimeout(100);
  const target=context.pages().at(-1);await target.waitForURL(/publisher-fallback\.html/,{timeout:5000,waitUntil:'commit'});assert.match(target.url(),/publisher-fallback\.html/);assert.equal(privateCalls,0);await context.close();
 });
 await test('owner without stored PDF falls back to publisher',async()=>{
  const context=await contextWith(['private_pdf_read'],{available:false});const page=await context.newPage();await page.goto(base);await page.waitForFunction(()=>window.__pdfCap?.read===true,{timeout:5000});await page.locator('.card a.open').first().waitFor();await page.locator('.card a.open').first().evaluate(a=>{a.href='/publisher-fallback.html';});
  await page.waitForTimeout(300);const before=context.pages().length;await page.locator('.card a.open').first().click();for(let i=0;i<30&&context.pages().length===before;i++)await page.waitForTimeout(100);
  const target=context.pages().at(-1);await target.waitForURL(/publisher-fallback\.html/,{timeout:5000,waitUntil:'commit'});assert.match(target.url(),/publisher-fallback\.html/);await context.close();
 });
 await test('owner setup page shows current account and claims only after explicit confirmation',async()=>{
  const context=await browser.newContext();await context.addInitScript(()=>localStorage.setItem('organic-gallery-session-v1','fixture-session'));let claim=0;
  await context.route('https://api.gczhouwld.com/**',async route=>{const u=new URL(route.request().url());if(u.pathname==='/api/user-ui/auth/session')return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({authenticated:true,user:{id:'u1',email:'owner@example.invalid',capabilities:[]}})});if(u.pathname==='/api/user-ui/private-pdf/bootstrap-owner'){claim++;return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({claimed:true,capabilities:['private_pdf_owner','private_pdf_read']})});}return route.fulfill({status:404,headers:{'access-control-allow-origin':'*'},body:'{}'});});
  const page=await context.newPage();await page.goto(base+'/private-pdf-owner-setup.html#code=fixture-secret');await page.locator('#claim:not([disabled])').waitFor();assert.equal(await page.locator('#account').textContent(),'owner@example.invalid');assert.equal(claim,0);await page.locator('#claim').click();await page.locator('#status.ok').waitFor();assert.equal(claim,1);await context.close();
 });
 await test('existing owner can authorize PDF capture without healthcheck CORS preflight',async()=>{
  const context=await browser.newContext();
  await context.addInitScript(()=>{
    localStorage.setItem('organic-gallery-session-v1','fixture-session');
    window.addEventListener('message',event=>{
      if(event.data?.type!=='osg-private-pdf-capture-lease-v1')return;
      window.postMessage({type:'osg-private-pdf-capture-lease-ack-v1',expiresAt:event.data.expiresAt},location.origin);
    });
  });
  let healthCalls=0,leaseCalls=0;
  await context.route('https://api.gczhouwld.com/**',async route=>{
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
}finally{await browser.close();server.close();}
console.log(JSON.stringify({passed,cases}));
