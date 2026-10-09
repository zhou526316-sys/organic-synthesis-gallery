import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { gzipSync } from 'node:zlib';

const root=path.resolve('dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.wasm':'application/wasm'};
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
const TEST_SCOPE=String(process.env.PRIVATE_PDF_BROWSER_SCOPE||'all');
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
  console.error('PDF_CONTINUOUS_FIXTURE_ERROR '+JSON.stringify({
    pageErrors:record.pageErrors.slice(0,4),
    consoleErrors:record.consoleErrors.slice(0,4),
    failedRequests:record.failedRequests.slice(0,4),
    unmockedExternalRequests:record.unmockedExternalRequests.slice(0,4),
  }));
  for (const context of activeContexts) {
    for (const page of context.pages()) {
      const details = await page.evaluate(() => ({
        pathname: location.pathname,
        viewerState: document.documentElement.dataset.privatePdfViewer || '',
        phase: document.documentElement.dataset.privatePdfPhase || '',
        initFailure: document.documentElement.dataset.pdfContinuousInitFailure || '',
        message: document.querySelector('#status')?.textContent?.slice(0,180) || '',
        stageChildren: document.querySelector('#stage')?.children.length ?? null,
        pageSlots: document.querySelectorAll('.pdfViewer .page').length,
        renderedCanvases: document.querySelectorAll('.pdfViewer .page canvas').length,
        mainHeight: document.querySelector('#main')?.clientHeight || 0,
        mainWidth: document.querySelector('#main')?.clientWidth || 0,
        stageHeight: document.querySelector('#stage')?.clientHeight || 0,
        pageLabel: document.querySelector('#page-count')?.textContent || '',
      })).catch(() => ({ inaccessible: true }));
      console.error('PDF_CONTINUOUS_VIEWPORT_STATE ' + JSON.stringify(details));
    }
  }
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
async function contextWith(capabilities,openResult={available:true,url:'https://api.gczhouwld.com/api/user-ui/private-pdf/file?token=opaque'},options={}){
 const context=await newTrackedContext({viewport:options.viewport||{width:1280,height:900},locale:options.locale||'en-US'});
 const state={privateCalls:0,privateFileCalls:0,privateRangeCalls:0,privateHeaderProbeCalls:0,privateFullFileCalls:0,privateFileDownloads:0,rangeInFlight:0,maxConcurrentRanges:0,openModes:[],openOrigins:[],authTokens:[],authSessionChecks:0,sessionUnavailable:false,capabilities:[...capabilities],pendingOwner:[],releasedOwner:0,queueReads:[],pendingQueue:[],releasedQueue:0,holdQueue:Boolean(options.holdQueue),queueRows:new Map()};
 const filePdf=options.largePdf?largeCardPdf:cardPdf;
 if(options.pendingQueue)state.queueRows.set('fixture-owner',new Map(papers.map(paper=>[paper.doi,{doi:paper.doi,state:'pending',revision:1,createdAt:Date.now(),updatedAt:Date.now()}])));
 await context.addInitScript(fixtureOrigin=>{
  if(location.origin!==fixtureOrigin)return;
  if(localStorage.getItem('private-pdf-browser-fixture-seeded')!=='1'){
   localStorage.setItem('organic-gallery-session-v1','fixture-session');
   localStorage.setItem('private-pdf-browser-fixture-seeded','1');
  }
  window.__pdfCap=null;window.__pdfCapabilityEvents=[];
  window.addEventListener('gallery-private-pdf-capability',event=>{
   window.__pdfCap=event.detail;window.__pdfCapabilityEvents.push(event.detail?.read);
  });
  // These counters observe real file APIs; the main card binding must never
  // probe permissions, read PDF bytes, or hash a file to decorate its buttons.
  window.__vaultIo={getFile:0,queryPermission:0,arrayBuffer:0,digest:0};
  if(window.FileSystemFileHandle){
   const original=FileSystemFileHandle.prototype.getFile;
   FileSystemFileHandle.prototype.getFile=function(...args){window.__vaultIo.getFile++;return original.apply(this,args);};
  }
  if(window.FileSystemHandle?.prototype.queryPermission){
   const original=FileSystemHandle.prototype.queryPermission;
   FileSystemHandle.prototype.queryPermission=function(...args){window.__vaultIo.queryPermission++;return original.apply(this,args);};
  }
  const arrayBuffer=File.prototype.arrayBuffer;
  File.prototype.arrayBuffer=function(...args){window.__vaultIo.arrayBuffer++;return arrayBuffer.apply(this,args);};
  if(window.crypto?.subtle){
   const digest=crypto.subtle.digest.bind(crypto.subtle);
   crypto.subtle.digest=(...args)=>{window.__vaultIo.digest++;return digest(...args);};
  }
 },base);
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
   state.authTokens.push(token);state.authSessionChecks++;
   if(state.sessionUnavailable)return route.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"error":"temporary_unavailable"}'});
   if(Number(options.transientFalseSessions||0)>=state.authSessionChecks)return reply({authenticated:false,user:null});
   const allowed=token==='fixture-session'?state.capabilities:[];
   if(options.holdOwner&&token==='fixture-session'){
    await new Promise(resolve=>state.pendingOwner.push(resolve));state.releasedOwner++;
   }
   return reply({authenticated:Boolean(token),user:token?{id:token==='fixture-session'?'fixture-owner':'fixture-ordinary',email:'fixture@example.invalid',capabilities:allowed}:null});
  }
  if(url.pathname==='/api/user-ui/pdf-vault/queue'){
   const token=String(route.request().headers().authorization||'').replace(/^Bearer /,'');
   const userId=token==='fixture-session'?'fixture-owner':token?'fixture-ordinary':null;
   const dois=url.searchParams.getAll('doi');
   state.queueReads.push({userId,dois,method:route.request().method()});
   if(!userId)return route.fulfill({status:401,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"error":"not_authenticated"}'});
   if(route.request().method()!=='GET'||dois.length>24){
    boundedPush(currentCase.unmockedExternalRequests,'queue card lookup exceeded the read-only fixture contract');
    return route.fulfill({status:400,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{}'});
   }
   const rows=state.queueRows.get(userId)||new Map();
   let result;
   if(dois.length===1)result={userId,item:rows.get(dois[0])||null};
   else if(dois.length>1)result={userId,items:dois.flatMap(doi=>rows.has(doi)?[rows.get(doi)]:[])};
   else result={userId,items:[...rows.values()].filter(row=>row.state==='pending').slice(0,50),hasMore:false,nextAfter:null};
   // Capture the old user's response before allowing a token switch, so the
   // late-response case cannot accidentally return the new user's empty list.
   result=JSON.parse(JSON.stringify(result));
   if(state.holdQueue&&userId==='fixture-owner'){
    await new Promise(resolve=>state.pendingQueue.push(resolve));state.releasedQueue++;
   }
   return reply(result);
  }
  if(url.pathname==='/api/user-ui/private-pdf/file'){
   state.privateFileCalls++;
   const range=String(route.request().headers().range||'');
   if(range){
    state.rangeInFlight++;
    state.maxConcurrentRanges=Math.max(state.maxConcurrentRanges,state.rangeInFlight);
   }
   try {
    if(options.fileDelayMs)await new Promise(resolve=>setTimeout(resolve,Number(options.fileDelayMs)));
    const download=url.searchParams.get('download')==='1';
    if(download)state.privateFileDownloads++;
    const common={'access-control-allow-origin':base,'access-control-allow-credentials':'true','access-control-allow-headers':'range, authorization','access-control-expose-headers':'content-length, content-range, accept-ranges, content-type, x-gallery-pdf-status','accept-ranges':'bytes','cache-control':'private, no-store','content-disposition':download?'attachment; filename="fixture.pdf"':'inline; filename="fixture.pdf"'};
    if(options.fileStatus){
     return route.fulfill({status:options.fileStatus,contentType:'application/json',headers:{...common,'x-gallery-pdf-status':'pdf_ticket_invalid'},body:'{"error":"pdf_ticket_invalid"}'});
    }
    if(range){
     state.privateRangeCalls++;
     if(range==='bytes=0-15')state.privateHeaderProbeCalls++;
     if(options.rangeUnsupported)return route.fulfill({status:200,contentType:'application/pdf',headers:{...common,'content-length':String(filePdf.length)},body:filePdf});
     const match=/^bytes=(\d+)-(\d*)$/.exec(range);
     const start=match?Number(match[1]):0,end=match&&match[2]?Math.min(Number(match[2]),filePdf.length-1):filePdf.length-1;
     const body=filePdf.subarray(start,end+1);
     return route.fulfill({status:206,contentType:'application/pdf',headers:{...common,'content-range':`bytes ${start}-${end}/${filePdf.length}`,'content-length':String(body.length)},body});
    }
    state.privateFullFileCalls++;
    return route.fulfill({status:200,contentType:'application/pdf',headers:{...common,'content-length':String(filePdf.length)},body:filePdf});
   } finally {
    if(range)state.rangeInFlight--;
   }
  }
  if(url.pathname==='/api/user-ui/private-pdf/open'){
   if(route.request().method()==='OPTIONS'){
    return route.fulfill({status:204,headers:{
     'access-control-allow-origin':base,
     'access-control-allow-methods':'GET, HEAD, POST, OPTIONS',
     'access-control-allow-headers':'content-type, authorization, range',
     'access-control-max-age':'86400',
     'vary':'Origin',
    }});
   }
   state.privateCalls++;
   const mode=url.searchParams.get('mode')||'view';
   state.openModes.push(mode);
   state.openOrigins.push(url.origin);
   if(url.origin==='https://api.gczhouwld.com' && options.primaryOpenStatus) {
    return route.fulfill({status:options.primaryOpenStatus,contentType:'application/json',
     headers:{'access-control-allow-origin':base},body:JSON.stringify({error:'fixture_denied'})});
   }
   if(url.origin==='https://organic-synthesis-gallery.zhou526316.workers.dev' && options.backupOpenStatus) {
    return route.fulfill({status:options.backupOpenStatus,contentType:'application/json',
     headers:{'access-control-allow-origin':base},body:JSON.stringify({error:'fixture_unavailable'})});
   }
   if(url.origin==='https://api.gczhouwld.com' && options.primaryOpenDelayMs) {
    await new Promise(resolve=>setTimeout(resolve,options.primaryOpenDelayMs));
   }
   if(openResult?.available!==true)return reply(openResult);
   const source=new URL(openResult.url);
   if(url.origin==='https://organic-synthesis-gallery.zhou526316.workers.dev') {
    // Both authorized gateways return a signed ticket on their own host.
    source.host=url.host;
   }
   if(mode==='download')source.searchParams.set('download','1');
   else source.searchParams.delete('download');
   try {
    const data={...openResult,mode,url:source.toString(),
     ...(options.omitByteLength?{}:{byteLength:filePdf.length})};
    if(options.withOpenTiming){
     return route.fulfill({status:200,contentType:'application/json',headers:{
      'access-control-allow-origin':base,
      'access-control-expose-headers':'server-timing',
      'server-timing':'session;dur=8, capability;dur=12, document;dur=3, r2_get;dur=146, r2_body;dur=4, total;dur=177',
     },body:JSON.stringify(data)});
    }
    return await reply(data);
   } catch(error) {
    // Browser may cancel a delayed losing authorization request after the
    // verified secondary gateway has already won.
    if(options.primaryOpenDelayMs && url.origin==='https://api.gczhouwld.com') return;
    throw error;
   }
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
function localCardPdf(extraSecondPadding=0){
 const stream='q 0.2 0.5 0.8 rg 20 20 180 180 re f Q\n' + ('% range-stream-padding 0123456789abcdef\n'.repeat(42000));
 const second='q 0.8 0.2 0.4 rg 40 40 120 140 re f Q\n'
   + ('% second-page-size-padding 0123456789abcdef\n'.repeat(extraSecondPadding));
 const objects=[
   '<< /Type /Catalog /Pages 2 0 R >>',
   '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
   '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 240] /Resources << >> /Contents 4 0 R >>',
   '<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'endstream',
   '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 240] /Resources << >> /Contents 6 0 R >>',
   '<< /Length '+Buffer.byteLength(second)+' >>\nstream\n'+second+'endstream',
 ];
 let body='%PDF-1.7\n% Gallery self-generated two-page card fixture.\n% '+('fixture-padding '.repeat(80))+'\n';const offsets=[];
 for(let index=0;index<objects.length;index++){offsets.push(Buffer.byteLength(body));body+=(index+1)+' 0 obj\n'+objects[index]+'\nendobj\n';}
 const start=Buffer.byteLength(body);body+='xref\n0 7\n0000000000 65535 f \n';
 for(const offset of offsets)body+=String(offset).padStart(10,'0')+' 00000 n \n';
 return Buffer.from(body+'trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n');
}
const cardPdf=localCardPdf(),largeCardPdf=localCardPdf(200000),vaultBy=(page,name)=>page.getByTestId('pdf-vault-'+name);
async function waitLocalStatus(page,status){await page.waitForFunction(status=>document.querySelector('[data-testid="pdf-vault-status"]')?.dataset.status===status,status);}
async function importCardPdf(page,doi){
 const before=await vaultBy(page,'list').locator('article[data-copy-id]').count();
 await vaultBy(page,'doi').fill(doi);
 await vaultBy(page,'file').setInputFiles({name:'card-private-fixture.pdf',mimeType:'application/pdf',buffer:cardPdf});
 await vaultBy(page,'import').click();await waitLocalStatus(page,'success');
 assert.equal(await vaultBy(page,'list').locator('article[data-copy-id]').count(),before+1,'a real import creates one account-scoped copy');
}
async function waitCardState(page,doi,state){await page.waitForFunction(({doi,state})=>[...document.querySelectorAll('.card')].find(card=>card.dataset.doi===doi)?.querySelector('.local-pdf-button')?.dataset.pdfVaultState===state,{doi,state});}
async function assertNoCardFileIo(page){assert.deepEqual(await page.evaluate(()=>window.__vaultIo),{getFile:0,queryPermission:0,arrayBuffer:0,digest:0},'main cards use metadata only, with no PDF bytes or permission prompts');}
async function scrollPdfToPage(target, pageNumber = 2) {
  await target.locator('#main').evaluate((root, page) => {
    const slot = root.querySelector(`.pdfViewer .page[data-page-number="${page}"]`);
    if (!slot) throw new Error('continuous_pdf_page_slot_missing');
    root.scrollTop = Math.max(0, slot.offsetTop - root.offsetTop - 8);
    root.dispatchEvent(new Event('scroll', { bubbles: false }));
  }, pageNumber);
  await target.waitForFunction(page =>
    document.querySelector(`.pdfViewer .page[data-page-number="${page}"] canvas`)
      ?.dataset.renderedPage === String(page) &&
    (document.querySelector('#page-count')?.textContent || '').includes(`第 ${page} /`),
    pageNumber, { timeout: 15000 });
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
  const popupPromise=page.waitForEvent('popup');await pdf.click();const target=await popupPromise;
  await waitForNode(page,()=>state.privateRangeCalls>=1);
  await waitForNode(page,()=>state.privateFileCalls>=2);
  await target.waitForFunction(()=>document.documentElement.dataset.privatePdfViewer==='ready',undefined,{timeout:12000});
  assert.equal(state.privateCalls,1,'default reading mints one view ticket');
  assert.deepEqual(state.openModes,['view']);
  assert.equal(state.privateFullFileCalls,0,'small PDF uses parallel bounded ranges');
  assert.ok(state.privateRangeCalls>=3&&state.privateRangeCalls<=8,'small PDF fetches bounded ranges');
  assert.equal(await target.locator('#pdf-canvas').getAttribute('data-rendered-page'),'1');
  await scrollPdfToPage(target, 2);
  assert.equal(state.privateFullFileCalls,0,'page turn uses local assembled bytes');
  assert.equal(await target.locator('#native-pdf-frame').count(),0,'the blocked cross-origin iframe must not be used');
  assert.equal(await page.locator('.private-pdf-more').first().isVisible(),true,'owner can access separate download/compatibility controls');
  await page.locator('.private-pdf-more summary').first().click();
  const optionsMenu=page.locator('.private-pdf-more').first();
  assert.match(await optionsMenu.locator('.private-pdf-download-button').getAttribute('href'),/mode=download/);
  assert.match(await optionsMenu.locator('.private-pdf-compat-button').getAttribute('href'),/compat=1/);
 });
 await test('edge-validated PDF fast path skips the redundant browser header probe',async()=>{
  const verified={available:true,headerVerified:true,url:'https://api.gczhouwld.com/api/user-ui/private-pdf/file?token=fixture-fast'};
  const {context,state}=await contextWith(['private_pdf_read'],verified);
  const page=await gallery(context,true);
  const opened=page.waitForEvent('popup');
  await page.locator('.card .private-pdf-button').first().click();
  const target=await opened;
  await waitForNode(page,()=>state.privateFileCalls>=1);
  assert.equal(state.privateCalls,1);
  assert.equal(state.privateHeaderProbeCalls,0,'edge-verified signed ticket must not fetch bytes 0-15 a second time');
  assert.deepEqual(state.openModes,['view']);
  await target.close();
 });
 await test('slow primary PDF authorization falls back to the same owner Worker without bypassing entitlement',async()=>{
  const owner={available:true,headerVerified:true,url:'https://api.gczhouwld.com/api/user-ui/private-pdf/file?token=fixture-fast'};
  const {context,state}=await contextWith(['private_pdf_read'],owner,{primaryOpenDelayMs:8000});
  const page=await gallery(context,true);
  const opened=page.waitForEvent('popup');await page.locator('.card .private-pdf-button').first().click();
  const target=await opened;
  const csp=await target.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  assert.match(csp||'',/connect-src[^;]*https:\/\/organic-synthesis-gallery\.zhou526316\.workers\.dev/,
   'reader CSP explicitly permits only the known fallback Worker origin');
  await target.waitForFunction(()=>document.documentElement.dataset.privatePdfViewer==='ready',undefined,{timeout:11000});
  assert.equal(await target.locator('html').getAttribute('data-private-pdf-authorize-path'),'backup',
   JSON.stringify({routes:state.openOrigins,requests:state.privateCalls}));
  assert.ok(state.openOrigins.includes('https://api.gczhouwld.com'));
  assert.ok(state.openOrigins.includes('https://organic-synthesis-gallery.zhou526316.workers.dev'));
  assert.equal(await target.locator('html').getAttribute('data-private-pdf-transfer-strategy'),'parallel-ranges');
  assert.equal(await target.locator('#pdf-canvas').getAttribute('data-rendered-page'),'1');
  assert.equal(state.privateFileCalls>=1,true);
 });
 await test('backup authorization failure does not cancel a slower valid canonical response',async()=>{
  const owner={available:true,headerVerified:true,url:'https://api.gczhouwld.com/api/user-ui/private-pdf/file?token=fixture-fast'};
  const {context,state}=await contextWith(['private_pdf_read'],owner,{primaryOpenDelayMs:5500,backupOpenStatus:403});
  const page=await gallery(context,true);
  const target=await popup(page,page.locator('.card .private-pdf-button').first());
  await target.waitForFunction(()=>document.documentElement.dataset.privatePdfViewer==='ready',undefined,{timeout:12000});
  assert.equal(await target.locator('html').getAttribute('data-private-pdf-authorize-path'),'primary');
  assert.ok(state.openOrigins.includes('https://api.gczhouwld.com'));
  assert.ok(state.openOrigins.includes('https://organic-synthesis-gallery.zhou526316.workers.dev'));
  assert.equal(await target.locator('#pdf-canvas').getAttribute('data-rendered-page'),'1');
 });
 await test('explicit PDF permission denial never initiates backup authorization',async()=>{
  const {context,state}=await contextWith(['private_pdf_read'],
   {available:true,headerVerified:true,url:'https://api.gczhouwld.com/api/user-ui/private-pdf/file?token=fixture-fast'},
   {primaryOpenStatus:403});
  const page=await gallery(context,true);
  const target=await popup(page,page.locator('.card .private-pdf-button').first());
  await target.waitForFunction(()=>document.documentElement.dataset.privatePdfViewer==='error',undefined,{timeout:8000});
  assert.match(await target.locator('#pdf-diagnostic').textContent(),/open_http_403/);
  assert.deepEqual(state.openOrigins,['https://api.gczhouwld.com']);
  assert.equal(state.privateFileCalls,0,'denied accounts never receive PDF bytes');
 });
 await test('authenticated owner open displays sanitized D1/R2 stage timings without sensitive values',async()=>{
  const owner={available:true,headerVerified:true,url:'https://api.gczhouwld.com/api/user-ui/private-pdf/file?token=fixture-private-opaque'};
  const {context,state}=await contextWith(['private_pdf_read'],owner,{withOpenTiming:true});
  const page=await gallery(context,true);
  const target=await popup(page,page.locator('.card .private-pdf-button').first());
  await target.waitForFunction(()=>document.documentElement.dataset.privatePdfViewer==='ready',undefined,{timeout:12000});
  const stage=await target.locator('html').getAttribute('data-private-pdf-auth-attempts');
  assert.match(stage||'',/primary:完成/);
  assert.match(stage||'',/r2_get=146ms/);
  assert.match(stage||'',/capability=12ms/);
  assert.doesNotMatch(stage||'',/token|fixture-private|Bearer|owner-token|r2_key|pdf-private/i);
  assert.equal(state.privateCalls,1);
  assert.equal(await target.locator('#pdf-canvas').getAttribute('data-rendered-page'),'1');
 });
 await test('high-RTT small file uses concurrent ranges and local page turns',async()=>{
  const fast={available:true,headerVerified:true,url:'https://api.gczhouwld.com/api/user-ui/private-pdf/file?token=fixture-fast'};
  const {context,state}=await contextWith(['private_pdf_read'],fast,{fileDelayMs:450});
  const page=await gallery(context,true);
  const popupPromise=page.waitForEvent('popup');
  await page.locator('.card .private-pdf-button').first().click();
  const target=await popupPromise;
  await target.waitForFunction(()=>document.documentElement.dataset.privatePdfViewer==='ready',undefined,{timeout:12000});
  assert.equal(state.privateCalls,1);
  assert.equal(state.privateFullFileCalls,0);
  assert.ok(state.privateRangeCalls>=3&&state.privateRangeCalls<=8);
  assert.ok(state.maxConcurrentRanges>=2,'slow responses must overlap');
  assert.equal(state.privateHeaderProbeCalls,0,'no duplicate edge-verified header probe');
  assert.equal(await target.locator('html').getAttribute('data-private-pdf-mode'),'single-transfer');
  assert.equal(await target.locator('html').getAttribute('data-private-pdf-transfer-strategy'),'parallel-ranges');
  assert.ok(Number(await target.locator('html').getAttribute('data-private-pdf-transfer-bytes'))>1_000_000);
  assert.equal(await target.locator('#full-open').isVisible(),true);
  const requestsAfterFirst=state.privateFileCalls;
  await scrollPdfToPage(target, 2);
  assert.equal(state.privateFileCalls,requestsAfterFirst,'page two makes no network calls');
 });
 await test('small PDF falls back to full GET if Range responses are unsupported',async()=>{
  const fast={available:true,headerVerified:true,url:'https://api.gczhouwld.com/api/user-ui/private-pdf/file?token=fixture-fast'};
  const {context,state}=await contextWith(['private_pdf_read'],fast,{rangeUnsupported:true});
  const page=await gallery(context,true);
  const target=await popup(page,page.locator('.card .private-pdf-button').first());
  await target.waitForFunction(()=>document.documentElement.dataset.privatePdfViewer==='ready',undefined,{timeout:12000});
  assert.equal(state.privateFullFileCalls,1,'exactly one fallback GET');
  assert.equal(await target.locator('html').getAttribute('data-private-pdf-transfer-strategy'),'single-fallback');
  assert.equal(state.privateHeaderProbeCalls,0);
  assert.equal(await target.locator('#pdf-canvas').getAttribute('data-rendered-page'),'1');
 });
 await test('large multi-megabyte PDF displays page one from ranges before whole-file transfer',async()=>{
  const fast={available:true,headerVerified:true,url:'https://api.gczhouwld.com/api/user-ui/private-pdf/file?token=fixture-large'};
  const {context,state}=await contextWith(['private_pdf_read'],fast,{largePdf:true,fileDelayMs:300});
  const page=await gallery(context,true);
  const popupPromise=page.waitForEvent('popup');
  await page.locator('.card .private-pdf-button').first().click();
  const target=await popupPromise;
  await target.waitForFunction(()=>document.documentElement.dataset.privatePdfViewer==='ready',undefined,{timeout:20000});
  assert.equal(await target.locator('html').getAttribute('data-private-pdf-mode'),'range-first');
  const timings=await target.locator('html').evaluate(root=>({
   auth:root.dataset.privatePdfAuthorizeMs,
   engine:root.dataset.privatePdfEngineMs,
   ranges:root.dataset.privatePdfRangeCalls,
   bytes:root.dataset.privatePdfRangeBytes,
  }));
  assert.match(timings.auth||'',/^\d+$/,'permission timing must be recorded without tokens');
  assert.match(timings.engine||'',/^\d+$/,'PDF.js loading timing must be recorded');
  assert.ok(Number(timings.ranges)>=1,'real Range attempts are counted');
  assert.ok(Number(timings.bytes)>0,'accepted bytes are counted');
  assert.equal(state.privateFullFileCalls,0,'first page must not wait for a full PDF download');
  assert.ok(state.privateRangeCalls>=2&&state.privateRangeCalls<=12,'header/trailer warmup and normal PDF ranges');
  assert.ok(largeCardPdf.length>6*1048576,'large file fixture must exceed the adaptive threshold');
  assert.equal(await target.locator('#full-open').isVisible(),true,'manual full-transfer fallback remains available');
  assert.match(await target.locator('#full-open').getAttribute('href'),/full=1/);
  await scrollPdfToPage(target, 2);
 });
 await test('large PDF Range errors show prompt sanitized stage timings instead of a blank reader',async()=>{
  const fast={available:true,headerVerified:true,url:'https://api.gczhouwld.com/api/user-ui/private-pdf/file?token=fixture-fast'};
  const {context}=await contextWith(['private_pdf_read'],fast,{largePdf:true,fileStatus:503});
  const page=await gallery(context,true);
  const target=await popup(page,page.locator('.card .private-pdf-button').first());
  await target.waitForFunction(()=>document.documentElement.dataset.privatePdfViewer==='error',undefined,{timeout:12000});
  const diagnostic=await target.locator('#pdf-diagnostic').textContent();
  assert.match(diagnostic,/file_http_503/);
  assert.match(diagnostic,/授权:\d+ms/);
  assert.match(diagnostic,/分段请求:\d+次/);
  assert.doesNotMatch(diagnostic,/token=|fixture-fast|fixture-session/);
 });
 await test('older Worker without byteLength preserves readable single-transfer fallback',async()=>{
  const original={available:true,headerVerified:true,url:'https://api.gczhouwld.com/api/user-ui/private-pdf/file?token=old-worker'};
  const {context,state}=await contextWith(['private_pdf_read'],original,{omitByteLength:true});
  const page=await gallery(context,true);
  const viewer=new URL(await page.locator('.card a.private-pdf-button').first().getAttribute('href'),base);
  viewer.searchParams.set('compat','1');
  const target=await context.newPage();
  await target.goto(viewer.toString(),{waitUntil:'domcontentloaded'});
  await target.waitForFunction(()=>document.documentElement.dataset.privatePdfViewer==='ready',undefined,{timeout:12000});
  assert.equal(await target.locator('html').getAttribute('data-private-pdf-mode'),'single-transfer');
  assert.equal(state.privateFullFileCalls,1);
 });
 await test('explicit browser-native mode remains available for large or unusual PDFs',async()=>{
  const {context,state}=await contextWith(['private_pdf_read']);
  const page=await gallery(context,true);
  const viewer=new URL(await page.locator('.card .private-pdf-button').first().getAttribute('href'),base);
  viewer.searchParams.set('native','1');
  const target=await context.newPage();await target.goto(viewer.toString(),{waitUntil:'domcontentloaded'});
  await target.waitForFunction(()=>document.documentElement.dataset.privatePdfViewer==='handoff',undefined,{timeout:7000}).catch(()=>{});
  await waitForNode(page,()=>state.privateFileCalls>=2);
  assert.equal(state.privateCalls,1);
  assert.ok(state.privateRangeCalls>=1,'native fallback retains protective file preflight');
 });
 await test('a rejected PDF header stays in safe Gallery shell rather than navigating to Unauthorized',async()=>{
  const {context,state}=await contextWith(['private_pdf_read'],undefined,{fileStatus:401});
  const page=await gallery(context,true);
  const target=await popup(page,page.locator('.card .private-pdf-button').first());
  await target.waitForFunction(()=>document.documentElement.dataset.privatePdfViewer==='error',undefined,{timeout:7000});
  assert.match(target.url(),/\/pdf\/\?doi=/);
  assert.match(await target.locator('#pdf-diagnostic').textContent(),/file_http_401/);
  assert.equal(state.privateCalls,2,'a rejected short-lived ticket is reminted exactly once');
 });
 await test('compatibility reader download mints an attachment ticket on every click',async()=>{
  const {context,state}=await contextWith(['private_pdf_read']);
  const page=await gallery(context,true);
  const viewer=new URL(await page.locator('.card .private-pdf-button').first().getAttribute('href'),base);
  viewer.searchParams.set('compat','1');
  const target=await context.newPage();
  await target.goto(viewer.toString(),{waitUntil:'domcontentloaded'});
  await target.waitForFunction(()=>document.documentElement.dataset.privatePdfViewer==='ready',undefined,{timeout:7000});
  const downloadEvent=target.waitForEvent('download',{timeout:7000});
  await target.locator('#download').click();
  const received=await downloadEvent;
  assert.match(received.suggestedFilename(),/\.pdf$/);
  assert.deepEqual(state.openModes,['view','download']);
  assert.ok(state.privateFileDownloads>=2,'preflight and attachment navigation must be download-intent requests');
 });
 await test('PDF.js compatibility mode remains available with bounded range reads',async()=>{
  const {context,state}=await contextWith(['private_pdf_read']);const page=await gallery(context,true);
  const pdf=page.locator('.card a.private-pdf-button').first();
  const viewer=new URL(await pdf.getAttribute('href'),base);viewer.searchParams.set('compat','1');
  const target=await context.newPage();await target.goto(viewer.toString(),{waitUntil:'domcontentloaded'});
  await target.waitForFunction(()=>document.documentElement.dataset.privatePdfViewer==='ready',undefined,{timeout:7000});
  const rendered=await target.locator('#pdf-canvas').evaluate(canvas=>({page:canvas.dataset.renderedPage,width:canvas.width,height:canvas.height}));
  assert.equal(rendered.page,'1');assert.ok(rendered.width>0&&rendered.height>0);
  assert.ok(state.privateRangeCalls>=1);assert.ok(state.privateRangeCalls<=8);
  assert.match(await target.locator('#page-count').textContent(),/1 \/ 2/);
  await scrollPdfToPage(target, 2);
 });
 for(const capabilities of [[],['private_pdf_owner','private_pdf_capture']]){
  await test(capabilities.length?'capture-only account has no PDF read button or private lookup':'ordinary account hides PDF button and retains publisher original',async()=>{
   const {context,state}=await contextWith(capabilities);const page=await gallery(context,false);
   await assertPdfHidden(page);
   const card=page.locator('.card').first(),local=card.locator('a.local-pdf-button');
   assert.equal(await local.isVisible(),true,'ordinary users can manage their own local PDF');
   const localUrl=new URL(await local.getAttribute('href'),base);
   assert.equal(localUrl.pathname,'/pdf-vault/');
   assert.equal(localUrl.searchParams.get('doi'),await card.getAttribute('data-doi'));
   assert.deepEqual([...localUrl.searchParams.keys()],['doi'],'the card URL must contain no session or file data');
   const original=page.locator('.card a.open').first();await original.evaluate(anchor=>{anchor.href='/publisher-fallback.html';});
   const target=await popup(page,original);assert.match(target.url(),/publisher-fallback\.html/);assert.equal(state.privateCalls,0);
  });
 }
 await test('transient session negatives after PDF navigation never erase the stored login token',async()=>{
  const {context,state}=await contextWith(['private_pdf_read'],undefined,{transientFalseSessions:2});
  const page=await context.newPage();await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('.card a.open').first().waitFor();
  await waitForNode(page,()=>state.authSessionChecks>=3);
  assert.equal(await page.evaluate(()=>localStorage.getItem('organic-gallery-session-v1')),'fixture-session');
  await page.waitForFunction(()=>document.documentElement.dataset.privatePdfRead==='true',undefined,{timeout:7000});
 });
 await test('verified owner PDF button survives a transient session endpoint outage',async()=>{
  const {context,state}=await contextWith(['private_pdf_read']);
  const first=await gallery(context,true);
  assert.equal(await first.locator('.card .private-pdf-button:visible').count()>0,true);
  await first.close();
  state.sessionUnavailable=true;
  const page=await context.newPage();await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('.card a.open').first().waitFor();
  await page.waitForFunction(()=>document.documentElement.dataset.privatePdfRead==='true',undefined,{timeout:7000});
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.card .private-pdf-button:visible').count()>0,true);
  assert.match(await page.locator('html').getAttribute('data-private-pdf-read-source')||'',/cache/);
 });
 await test('explicit server denial clears a cached owner PDF entitlement',async()=>{
  const {context,state}=await contextWith(['private_pdf_read']);
  const first=await gallery(context,true);await first.close();
  state.capabilities=[];
  const page=await context.newPage();await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('.card a.open').first().waitFor();
  await page.waitForFunction(()=>document.documentElement.dataset.privatePdfRead==='false',undefined,{timeout:7000});
  assert.equal(await page.locator('.card .private-pdf-button:visible').count(),0);
  assert.equal(await page.locator('html').getAttribute('data-private-pdf-read-source'),'server-denied');
 });
 await test('owner without a verified copy sees viewer and explicit publisher fallback',async()=>{
  const {context}=await contextWith(['private_pdf_read'],{available:false});const page=await gallery(context,true);
  const pdf=page.locator('.card a.private-pdf-button').first();
  const expected=new URL(await pdf.getAttribute('href'),base).searchParams.get('fallback');
  const target=await popup(page,pdf);assert.match(target.url(),/\/pdf\/?\?doi=/);
  await target.getByText(/该论文暂无可读取的私有 PDF/).waitFor();
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
    for(const selector of ['a.local-pdf-button','a.private-pdf-button','a.open']){
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
  const context=await newTrackedContext();await context.addInitScript(fixtureOrigin=>{
   if(location.origin!==fixtureOrigin)return;
   localStorage.setItem('organic-gallery-session-v1','fixture-session');
  },base);let claim=0;
  await context.route(API_ROUTE,async route=>{const u=new URL(route.request().url());if(u.pathname==='/api/user-ui/auth/session')return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({authenticated:true,user:{id:'u1',email:'owner@example.invalid',capabilities:[]}})});if(u.pathname==='/api/user-ui/private-pdf/bootstrap-owner'){claim++;return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({claimed:true,capabilities:['private_pdf_owner','private_pdf_read']})});}return route.fulfill({status:404,headers:{'access-control-allow-origin':'*'},body:'{}'});});
  const page=await context.newPage();await page.goto(base+'/private-pdf-owner-setup.html#code=fixture-secret');await page.locator('#claim:not([disabled])').waitFor();assert.equal(await page.locator('#account').textContent(),'owner@example.invalid');assert.equal(claim,0);await page.locator('#claim').click();await page.locator('#status.ok').waitFor();assert.equal(claim,1);await context.close();
 });
 await test('existing owner can authorize PDF capture without healthcheck CORS preflight',async()=>{
  const context=await newTrackedContext();
  await context.addInitScript(fixtureOrigin=>{
    if(location.origin!==fixtureOrigin)return;
    localStorage.setItem('organic-gallery-session-v1','fixture-session');
    window.addEventListener('message',event=>{
      if(event.origin!==location.origin||event.data?.type!=='osg-private-pdf-capture-lease-v1')return;
      window.postMessage({
        type:'osg-private-pdf-capture-lease-ack-v1',
        expiresAt:event.data.expiresAt,
      },location.origin);
    });
  },base);
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

 await test('ordinary 24 and 12 card pages use one queue batch and no local file reads',async()=>{
  for(const [width,expected] of [[1280,24],[390,12]]){
   const {context,state}=await contextWith([],undefined,{viewport:{width,height:900},locale:'zh-CN',pendingQueue:true});
   const page=await gallery(context,false);
   await page.waitForFunction(count=>document.querySelectorAll('.card .local-pdf-button[data-pdf-vault-state="queue"]').length===count,expected);
   await assertPdfHidden(page);assert.equal(state.privateCalls,0);
   assert.equal(await page.locator('.card').count(),expected);
   const first=await page.locator('.card').first().getAttribute('data-doi');
   const queueLabel=await page.locator('.card .local-pdf-button').first().textContent();
   assert.match(queueLabel,/待电脑/);assert.doesNotMatch(queueLabel,/获取中/);
   assert.equal(state.queueReads.length,1,'the initial visible page uses one DOI batch');
   assert.equal(state.queueReads[0].dois.length,expected);
   assert.equal(new Set(state.queueReads[0].dois).size,expected);
   await page.locator('#nextResultPage').click();
   await page.waitForFunction(previous=>document.querySelector('.card')?.getAttribute('data-doi')!==previous,first);
   await page.waitForFunction(count=>document.querySelectorAll('.card .local-pdf-button[data-pdf-vault-state="queue"]').length===count,expected);
   assert.equal(state.queueReads.length,2,'pagination adds one batch, never one request per card');
   assert.equal(state.queueReads[1].dois.length,expected);
   assert.ok(state.authTokens.length<=6,'account checks do not grow with the number of cards');
   assert.equal(state.privateCalls,0);await assertPdfHidden(page);await assertNoCardFileIo(page);
   if(width===390){
    const box=await page.locator('.card').first().boundingBox(),button=await page.locator('.card .local-pdf-button').first().boundingBox();
    assert.ok(box&&button&&button.x>=box.x-1&&button.x+button.width<=Math.min(width,box.x+box.width)+1,'queued state fits a mobile card');
   }else{
    // A queue response captured before a second tab cancels the tasks must not
    // refill the invalidated cache with those older pending rows.
    state.holdQueue=true;
    await page.evaluate(()=>window.dispatchEvent(new Event('gallery-pdf-vault-queue-changed')));
    await waitForNode(page,()=>state.pendingQueue.length>0);
    for(const [doi,item] of state.queueRows.get('fixture-owner'))state.queueRows.get('fixture-owner').set(doi,{...item,state:'cancelled',revision:item.revision+1,updatedAt:Date.now()});
    await page.evaluate(()=>window.dispatchEvent(new Event('gallery-pdf-vault-queue-changed')));
    state.holdQueue=false;for(const release of state.pendingQueue.splice(0))release();
    await waitForNode(page,()=>state.queueReads.length>=4);
    await page.waitForFunction(count=>document.querySelectorAll('.card .local-pdf-button[data-pdf-vault-state="none"]').length===count,expected);
    await assertNoCardFileIo(page);
   }
   await context.close();
  }
 });
 if(TEST_SCOPE!=='owner'){
 // The owner/capability cases above create many full-page contexts and PDF.js
 // workers. Start the local-vault integration cases with a fresh headless
 // browser process; assertions remain unchanged and the P1 suite independently
 // exercises the same real IndexedDB/OPFS path.
 await browser.close();
 browser=await chromium.launch({headless:true});
 await test('real local import updates another tab and missing or expired evidence downgrades cards',async()=>{
  const {context,state}=await contextWith([],undefined,{locale:'zh-CN'});const page=await gallery(context,false);
  const card=page.locator('.card').first(),doi=await card.getAttribute('data-doi');
  const local=await popup(page,card.locator('a.local-pdf-button'));
  await local.waitForFunction(()=>document.documentElement.dataset.pdfVaultAuth==='authenticated');
  assert.equal(await vaultBy(local,'doi').inputValue(),doi,'the card opens its own DOI management page');
  assert.equal(await vaultBy(local,'reader').isVisible(),false,'card navigation does not read or render a PDF');
  await vaultBy(local,'opfs').click();await waitLocalStatus(local,'success');
  await importCardPdf(local,doi);await waitCardState(page,doi,'local');
  assert.match(await card.locator('.local-pdf-button').textContent(),/PDF · 本机/);
  assert.equal(new URL(await card.locator('.local-pdf-button').getAttribute('href'),base).searchParams.get('open'),'1','readable local copies deep-link directly to the reader');
  const quick=await popup(page,card.locator('.local-pdf-button'));
  await quick.waitForFunction(()=>document.querySelector('[data-testid="pdf-vault-reader"]')?.open === true,undefined,{timeout:7000});
  await quick.waitForFunction(()=>document.querySelector('[data-testid="pdf-vault-reader-canvas"]')?.dataset.renderedPage === '1',undefined,{timeout:7000});
  await quick.close();
  await assertNoCardFileIo(page);await assertPdfHidden(page);assert.equal(state.privateCalls,0);
  const signal=await page.evaluate(()=>localStorage.getItem('gallery-pdf-vault-local-change-v1'));
  assert.match(signal,/^change_[a-f0-9]+$/,'cross-tab signal carries only an opaque random change marker');
  state.holdQueue=true;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await waitForNode(page,()=>state.pendingQueue.length>0);
  // The row and its FileSystemDirectoryHandle come from actual IndexedDB.
  // Removing the actual OPFS file leaves the manifest present for the next open.
  await local.evaluate(async doi=>{
   const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('gallery-pdf-vault-local-v1',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
   const rows=await new Promise((resolve,reject)=>{const request=db.transaction('copies','readonly').objectStore('copies').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});db.close();
   const row=rows.find(row=>row.user_id==='fixture-owner'&&row.doi===doi);
   if(!row?.directory_handle)throw new Error('fixture requires a real persisted file handle');
   await row.directory_handle.removeEntry(row.file_name);
  },doi);
  await vaultBy(local,'list').locator('article[data-copy-id]').first().getByTestId('pdf-vault-open').click();
  await waitLocalStatus(local,'error');
  await page.waitForFunction(doi=>[...document.querySelectorAll('.card')].find(card=>card.dataset.doi===doi)?.querySelector('.local-pdf-button')?.dataset.pdfVaultState!=='local',doi);
  await page.evaluate(doi=>{
   const anchor=[...document.querySelectorAll('.card')].find(card=>card.dataset.doi===doi).querySelector('.local-pdf-button');
   window.__localStateAfterDenial=[];
   new MutationObserver(records=>{for(const record of records)window.__localStateAfterDenial.push(record.oldValue,anchor.dataset.pdfVaultState);}).observe(anchor,{attributes:true,attributeFilter:['data-pdf-vault-state'],attributeOldValue:true});
  },doi);
  state.holdQueue=false;for(const release of state.pendingQueue.splice(0))release();
  await waitCardState(page,doi,'check');
  assert.equal(new URL(await card.locator('.local-pdf-button').getAttribute('href'),base).searchParams.has('open'),false,'unverified local copies never keep the quick-open hint');
  assert.equal(await page.evaluate(()=>window.__localStateAfterDenial.includes('local')),false,'an older pending queue response cannot repaint a rejected local receipt');
  assert.equal(await vaultBy(local,'reader').isVisible(),false);await assertNoCardFileIo(page);
  await importCardPdf(local,doi);await waitCardState(page,doi,'local');
  // Cross-tab receipts above use the real shared wall clock. Install the
  // virtual clock only for this bounded expiry check, then refresh metadata
  // so its expiry timer is created under that clock. The one-second lead
  // avoids artificial future receipts from separate virtual-clock realms.
  await page.clock.install({time:new Date(Date.now()+1000)});
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await waitCardState(page,doi,'local');
  await page.clock.fastForward(61_001);await waitCardState(page,doi,'check');
  await assertNoCardFileIo(page);await assertPdfHidden(page);assert.equal(state.privateCalls,0);
 });
 await test('late ordinary-account queue response cannot relabel cards after switch or logout',async()=>{
  const {context,state}=await contextWith([],undefined,{pendingQueue:true,holdQueue:true});
  const page=await gallery(context,false);
  await waitForNode(page,()=>state.pendingQueue.length>0);
  await replaceToken(page,'ordinary-session');
  await waitForNode(page,()=>state.queueReads.some(request=>request.userId==='fixture-ordinary'));
  state.holdQueue=false;const pending=state.pendingQueue.splice(0);for(const release of pending)release();
  await waitForNode(page,()=>state.releasedQueue>=pending.length);
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.card .local-pdf-button[data-pdf-vault-state="none"]').count(),24,'an old queue receipt never enters the new account');
  await assertPdfHidden(page);await assertNoCardFileIo(page);assert.equal(state.privateCalls,0);
  const cleared=await page.evaluate(key=>{
   localStorage.removeItem(key);window.dispatchEvent(new Event('gallery-auth-session-changed'));
   return [...document.querySelectorAll('.card .local-pdf-button')].every(anchor=>anchor.dataset.pdfVaultState==='none');
  },SESSION_KEY);
  assert.equal(cleared,true,'logout clears local and queue labels synchronously');
  await page.waitForTimeout(100);await assertPdfHidden(page);await assertNoCardFileIo(page);
 });
 }

}catch(error){console.error('PRIVATE_PDF_BROWSER_FAIL '+String(error?.stack||error));process.exitCode=1;}
finally{
 for(const context of [...activeContexts])await context.close().catch(()=>{});
 await browser.close();await new Promise(resolve=>server.close(resolve));
 const summary={schemaVersion:1,ok:!process.exitCode,passed,total:cases.length,cases:cases.map(({name,status,durationMs,error})=>({name,status,durationMs,...(error?{error}:{} )})),completedAt:new Date().toISOString()};
 await fs.writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');
 console.log('PRIVATE_PDF_BROWSER_SUMMARY '+JSON.stringify(summary));
}
