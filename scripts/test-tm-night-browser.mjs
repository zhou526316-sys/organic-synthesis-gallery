import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const source=await fs.readFile('public/toc-mainline.user.js','utf8');
const exposed=source.replace('  installMenu();','  globalThis.__nightTest={bindPublisherCaptureJob,assertBoundCaptureJob,runPublisherJob,readCaptureCheckpoint,nightRetryState,stableCaptureGeneration}; return;\n  installMenu();');
const browser=await chromium.launch({headless:true});let passed=0;
const check=(n,c)=>{assert.ok(c,n);passed++;console.log('NIGHT_BROWSER_PASS '+n);};
const doi='10.1021/acs.joc.6c01302',nonce='12345678-1234-1234-1234-123456789012';
const store={'osg-toc-v6:active-job':{doi,jobId:nonce,captureVersion:'6.2.20',publisher:'acs',mediaNeed:'toc+figures',captureToc:true,startedAt:new Date().toISOString()},'osg-toc-v6:write-token':'fixture-only'};
const tabs=new WeakMap(),posts=[];
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="150" viewBox="0 0 320 150"><path d="M5,5L300,140L20,100Z" fill="none" stroke="black"/><text x="40" y="60">Reaction overview</text></svg>';
try{
 const context=await browser.newContext();
 await context.exposeBinding('__getTab',({page})=>tabs.get(page)||{});
 await context.exposeBinding('__saveTab',({page},value)=>{tabs.set(page,value);});
 await context.exposeBinding('__saveGm',(_,{key,value})=>{store[key]=value;});
 await context.addInitScript(({store})=>{
   window.__gm=structuredClone(store);
   window.GM_getValue=(k,d)=>k in __gm?__gm[k]:d;
   window.GM_setValue=(k,v)=>{__gm[k]=v;__saveGm({key:k,value:v});};
   window.GM_deleteValue=k=>{delete __gm[k];};
   window.GM_listValues=()=>Object.keys(__gm);
   window.GM_getTab=callback=>__getTab().then(callback);
   window.GM_saveTab=tab=>{__saveTab(tab);};
   window.GM_registerMenuCommand=()=>{};
   window.GM_xmlhttpRequest=opts=>fetch(opts.url,{method:opts.method||'GET',body:opts.data,headers:opts.headers}).then(async r=>opts.onload({status:r.status,responseText:await r.text()})).catch(opts.onerror);
 },{store});
 await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type'};
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
   if(req.method()==='POST'){
     const p=req.postDataJSON();posts.push({path:u.pathname,p});
     return route.fulfill({json:{stored:true,staged:u.pathname.endsWith('/stage'),apiAvailable:true,doi:p.doi,id:p.id,kind:p.kind,contentHash:'fixture-content',imageUrl:'https://object.test/a.svg'},headers});
   }
   if(u.pathname.endsWith('.svg'))return route.fulfill({body:svg,contentType:'image/svg+xml',headers});
   if(u.hostname==='pubs.acs.org'&&!u.searchParams.has('authenticated'))return route.fulfill({status:302,headers:{location:'https://auth.example.test/login'}});
   if(u.hostname==='auth.example.test')return route.fulfill({status:302,headers:{location:'https://pubs.acs.org/doi/full/'+doi+'?authenticated=1#'}});
   const body=u.pathname.endsWith('capture-launch.html')?'<html><body>Binding task</body></html>':'<html><head><meta name="citation_doi" content="'+doi+'"></head><body><article><figure id="graphicalAbstract"><figcaption>Visual Abstract</figcaption><img src="/10.1021_acs.joc.6c01302/toc.svg"></figure><figure><figcaption>Scheme 1. Scope</figcaption><img src="/10.1021_acs.joc.6c01302/scheme.svg"></figure></article></body></html>';
   return route.fulfill({body,contentType:'text/html'});
 });
 const page=await context.newPage();
 await page.goto('https://zhou526316-sys.github.io/organic-synthesis-gallery/capture-launch.html#osg-job='+nonce);
 await page.addScriptTag({content:exposed}).catch(()=>{});
 await page.waitForURL(u=>u.hostname==='pubs.acs.org'&&u.searchParams.has('authenticated'),{timeout:15000});
 await page.addScriptTag({content:exposed});
 check('launcher persists nonce before cross-origin navigation',tabs.get(page)?.osgBoundCapture?.jobId===nonce);
 check('redirect chain can finish without relying on URL fragment',!new URL(page.url()).hash);
 const bound=await page.evaluate(()=>__nightTest.bindPublisherCaptureJob(__gm['osg-toc-v6:active-job']));
 check('persistent tab binding survives login-origin redirects',bound===doi);
 const result=await page.evaluate(()=>__nightTest.runPublisherJob(__gm['osg-toc-v6:active-job']));
 check('bound visit obtains both TOC and body receipts',result.toc.status==='stored'&&result.figuresStaged===1&&result.figuresImported===1);
 const before=posts.filter(r=>!r.path.includes('report')).length;
 const resumed=await page.evaluate(()=>__nightTest.runPublisherJob(__gm['osg-toc-v6:active-job']));
 check('resumed job reuses saved TOC and figure checkpoints',posts.filter(r=>!r.path.includes('report')).length===before&&resumed.figures.resumed===1);
 const manual=await context.newPage();
 await manual.goto('https://pubs.acs.org/doi/full/'+doi+'?authenticated=1#osg-job='+nonce);
 await manual.addScriptTag({content:exposed});
 let rejected=false;try{await manual.evaluate(()=>__nightTest.bindPublisherCaptureJob(__gm['osg-toc-v6:active-job']));}catch(e){rejected=String(e).includes('capture_tab_job_mismatch');}
 check('manual same-DOI tab cannot steal task by copying fragment',rejected);
 await page.evaluate(()=>{__gm['osg-toc-v6:active-job'].jobId='87654321-1234-1234-1234-123456789012';});
 rejected=false;try{await page.evaluate(({doi,nonce})=>__nightTest.assertBoundCaptureJob({doi,jobId:nonce,captureVersion:'6.2.20'}),{doi,nonce});}catch(e){rejected=String(e).includes('capture_job_stale_or_unbound');}
 check('old publisher after job change cannot upload',rejected);
 console.log('NIGHT_BROWSER_TEST_SUMMARY '+JSON.stringify({passed,realBrowser:'Chromium',tampermonkeyApis:'mocked',crossOriginRedirects:true,realPublisherAccess:false,productionWrites:0}));
}finally{await browser.close();}
