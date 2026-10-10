import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright';

const baseDir=path.resolve('dist');
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const filename=path.join(baseDir,url.pathname.replace(/^\/+/,''));
 if(!filename.startsWith(baseDir+path.sep)){res.writeHead(404);res.end();return;}
 try{
  const bytes=await fs.readFile(filename);
  res.writeHead(200,{'content-type':filename.endsWith('.html')?'text/html; charset=utf-8':
    filename.endsWith('.js')?'text/javascript; charset=utf-8':'application/octet-stream'});
  res.end(bytes);
 }catch{res.writeHead(404);res.end('not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const site='http://127.0.0.1:'+server.address().port;
let browser;
const cases=[];
const doiA='10.1021/jacs.6c12345',doiB='10.1038/s41467-026-78405-z';
const item=(doi,journal,inventory='ready')=>({
 doi,journal,addedDate:'2026-10-10',inventory,byteLength:1520000,
 identityVerified:inventory==='ready',pdfPages:2,
 storageProbe:inventory==='ready'?'pass':'untested',
 probeReason:inventory==='ready'?'r2_head_tail_verified':'',
 probedAt:Date.now(),browser:'untested',browserCheckedAt:0,
 inventoryCheckedAt:Date.now(),
});
const cors={
 'access-control-allow-origin':site,
 'access-control-allow-methods':'GET,POST,OPTIONS',
 'access-control-allow-headers':'authorization,content-type',
 'access-control-max-age':'60',
 'vary':'origin',
};
async function test(name,fn){
 try{await fn();cases.push({name,status:'pass'});console.log('PDF_AUDIT_DASHBOARD_PASS '+name);}
 catch(e){cases.push({name,status:'fail',error:String(e)});throw e;}
}
try{
 browser=await chromium.launch({headless:true});
 const newCase=async(role)=>{
  const ctx=await browser.newContext({acceptDownloads:true});
  let queries=0,writes=0;
  await ctx.route('https://api.gczhouwld.com/**',async route=>{
   const req=route.request(),url=new URL(req.url()),method=req.method();
   const allowed=req.headers().authorization==='Bearer fixture-owner-secret'&&role==='owner';
   if(method==='OPTIONS')return route.fulfill({status:204,headers:cors});
   if(!allowed)return route.fulfill({status:403,headers:{...cors,'content-type':'application/json'},body:'{"error":"owner_required"}'});
   if(url.pathname.endsWith('/reading')){
    writes++;assert.equal(method,'POST');
    const body=JSON.parse(req.postData());
    assert.equal(body.doi,doiA);
    assert.equal(body.result,'two_pages_rendered');
    return route.fulfill({status:200,headers:{...cors,'content-type':'application/json'},
     body:JSON.stringify({ok:true,doi:doiA,classification:'owner_reported_not_independent'})});
   }
   queries++;assert.equal(method,'GET');
   const after=url.searchParams.get('after'),status=url.searchParams.get('status')||'all';
   const first=!after;
   const items=status==='missing'?[item(doiB,'Nature Communications','missing')]:
      first?[item(doiA,'JACS')]:[item(doiB,'Nature Communications','missing')];
   const result={schemaVersion:1,ready:true,catalogId:'a'.repeat(64),sourceCommit:'b'.repeat(40),
    completedAt:Date.now(),expectedCount:2,
    summary:{total:2,ready:1,pending:0,failed:0,missing:1,identity_verified:1,
     r2_head_tail_pass:1,r2_head_tail_failed:0,owner_reported_browser_pass:0},
    items,hasMore:status==='all'&&first,nextAfter:status==='all'&&first?doiA:null};
   return route.fulfill({status:200,headers:{...cors,'content-type':'application/json'},
    body:JSON.stringify(result)});
  });
  const page=await ctx.newPage();
  // Seed only a fixture credential in the SAME ORIGIN, then reload so the
  // browser tests the actual owner/reader route rather than a login placeholder.
  await page.goto(site+'/pdf-audit.html');
  await page.evaluate(v=>localStorage.setItem('organic-gallery-session-v1',v),
    'fixture-'+role+'-secret');
  assert.equal(await page.evaluate(()=>localStorage.getItem('organic-gallery-session-v1')),
    'fixture-'+role+'-secret');
  return {ctx,page,stats:()=>({queries,writes})};
 };
 await test('reader role is refused without ever seeing DOI rows',async()=>{
  const {ctx,page}=await newCase('reader');
  try{
   await page.goto(site+'/pdf-audit.html');
   await page.waitForFunction(() =>
    (document.querySelector('#notice')?.textContent||'').includes('private_pdf_owner'),
    undefined,{timeout:11000});
   assert.equal(await page.evaluate(() =>
     localStorage.getItem('organic-gallery-session-v1')),'fixture-reader-secret');
   assert.match(await page.locator('#notice').textContent(),/账号没有 private_pdf_owner 权限/);
   assert.equal(await page.getByText(doiA).count(),0);
   assert.doesNotMatch(await page.locator('#results').innerText(),/10\.\d{4,9}\//);
  }finally{await ctx.close();}
 });
 await test('admin dashboard displays separately labeled inventory/R2/browser states and safe Tencent URL',async()=>{
  const {ctx,page}=await newCase('owner');
  try{
   await page.goto(site+'/pdf-audit.html');
   await page.getByText(doiA).waitFor();
   assert.equal(await page.locator('#summary .metric').count(),9);
   assert.match(await page.locator('#results').innerText(),/未实测两页/);
   assert.match(await page.locator('#results').innerText(),/头尾检查通过/);
   const href=await page.locator('#results a').first().getAttribute('href');
   assert.match(href,/\/pdf\/\?doi=/);
   assert.match(href,/pdfIngress=tencent/);
   assert(!href.includes('token=')&&!href.includes('Bearer'));
   await page.locator('#next').click();
   await page.getByText(doiB).waitFor();
   assert.equal(await page.locator('#results tr').count(),2);
  }finally{await ctx.close();}
 });
 await test('owner records explicit manual two-page attestation; no automatic full-read claim',async()=>{
  const {ctx,page,stats}=await newCase('owner');
  try{
   page.on('dialog',dialog=>dialog.accept());
   await page.goto(site+'/pdf-audit.html');
   await page.getByText(doiA).waitFor();
   await page.getByRole('button',{name:'记录两页实测'}).click();
   await page.locator('#results td').getByText('管理员人工确认两页',{exact:true}).waitFor();
   assert.equal(stats().writes,1);
  }finally{await ctx.close();}
 });
 await test('owner local CSV export uses metadata only, no bearer or ticket',async()=>{
  const {ctx,page}=await newCase('owner');
  try{
   await page.goto(site+'/pdf-audit.html');
   await page.getByText(doiA).waitFor();
   const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button',{name:'导出筛选结果 CSV'}).click(),
   ]);
   assert.equal(download.suggestedFilename(),'gallery-pdf-owner-audit.csv');
   const csv=await fs.readFile(await download.path(),'utf8');
   assert(csv.includes(doiA)&&csv.includes(doiB));
   assert(!csv.includes('fixture-owner-secret')&&!csv.includes('token='));
  }finally{await ctx.close();}
 });
 console.log('PDF_AUDIT_DASHBOARD_SUMMARY '+JSON.stringify({ok:true,passed:cases.length,cases}));
}catch(error){
 console.error('PDF_AUDIT_DASHBOARD_FAILED '+JSON.stringify({error:String(error),cases}));
 process.exitCode=1;
}finally{
 if(browser)await browser.close();
 server.close();
}
