import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const ROOT='audit/wechat-working/2026-10-12-live-ui';
const SITE='https://gallery.gczhouwld.com/';
const targetDoi='10.1021/acscatal.6c06048';
const log=[];
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const browser=await chromium.launch({headless:true});
try{
 await mkdir(ROOT,{recursive:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2,locale:'zh-CN',timezoneId:'Asia/Shanghai',serviceWorkers:'block'});
 const page=await context.newPage();
 let blocked=0;
 await page.route('**/*',async route=>{
   const rq=route.request(),u=new URL(rq.url()),method=rq.method();
   if(['GET','HEAD','OPTIONS'].includes(method) || (method==='POST' && ['/api/literature/catalog-view','/api/media/batch'].includes(u.pathname))) return route.continue();
   blocked++;
   return route.fulfill({status:200,contentType:'application/json',body:'{}'});
 });
 const response=await page.goto(SITE+'?edition=2026-10-12',{waitUntil:'domcontentloaded',timeout:70000});
 if(!response||!response.ok())throw new Error('Live site inaccessible: '+response?.status());
 await page.locator('#search').waitFor({timeout:30000});
 await page.waitForTimeout(2500);
 const capture=async (name,kind,notes,loc=null)=>{
   const file=ROOT+'/'+name+'.png';
   let buffer;
   if(loc&&await loc.count()){await loc.first().scrollIntoViewIfNeeded();await page.waitForTimeout(500);buffer=await loc.first().screenshot({animations:'disabled',timeout:20000});}
   else buffer=await page.screenshot({animations:'disabled',timeout:20000});
   await writeFile(file,buffer);
   log.push({name,file,kind,notes,sha256:sha(buffer),bytes:buffer.length,url:page.url(),timestamp:new Date().toISOString()});
 };
 // Genuine on-site screenshot: home and controls, no overlays or fabricated labels.
 await capture('live-home-desktop','live_public_page','2026-10-12 actual Gallery desktop page; no login');
 await capture('live-search-controls','live_public_page','Actual public text search and journal/date controls, screenshot after scrolling',page.locator('#search').locator('..').locator('..'));
 const card=page.locator('.card[data-doi="'+targetDoi+'"]');
 if(await card.count()){
   await capture('live-paper-card','live_public_page','Actual ACS Catalysis card with user operations and figure strip',card);
   const pdf=card.getByText(/本地 PDF|Local PDF/, {exact:false}).first();
   if(await pdf.count())await capture('live-local-pdf-button','live_public_page','Actual Local PDF card entry, not a signed-in/authorized PDF file',pdf.locator('..'));
 }
 await page.goto(SITE+'pdf-vault/open/?doi='+encodeURIComponent(targetDoi),{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForTimeout(1000);
 await capture('live-pdf-guest-entry','live_public_page_guest','Real public /pdf-vault/open page while NOT signed in; not proof of Windows folder permission or PDF download.');
 await context.close();
 const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,locale:'zh-CN',timezoneId:'Asia/Shanghai',serviceWorkers:'block'});
 const mp=await mobile.newPage();
 await mp.route('**/*',async route=>{let req=route.request();if(['GET','HEAD','OPTIONS'].includes(req.method()) || (req.method()==='POST'&&new URL(req.url()).pathname==='/api/literature/catalog-view'))return route.continue();return route.fulfill({status:200,contentType:'application/json',body:'{}'});});
 const mr=await mp.goto(SITE+'?edition=2026-10-12',{waitUntil:'domcontentloaded',timeout:60000});
 if(!mr||!mr.ok())throw new Error('Mobile Gallery page unavailable');
 await mp.waitForTimeout(2000);
 const mobuf=await mp.screenshot({animations:'disabled'});
 await writeFile(ROOT+'/live-mobile-home.png',mobuf);
 log.push({name:'live-mobile-home',file:ROOT+'/live-mobile-home.png',kind:'live_public_page',notes:'Actual 390px phone viewport, not user phone',sha256:sha(mobuf),bytes:mobuf.length,url:mp.url(),timestamp:new Date().toISOString()});
 await mobile.close();
 const evidence={schemaVersion:1,source:'actual public website via Playwright Chromium in GitHub Actions',notUserAuthenticated:true,notWindowsPickerVerified:true,notLocalPdfReadVerified:true,privateDataCapture:false,blockedMutationRequests:blocked,site:SITE,captured:log};
 await writeFile(ROOT+'/capture.json',JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({captured:log.map(x=>({name:x.name,bytes:x.bytes,sha256:x.sha256})),blocked},null,2));
}finally{await browser.close();}
