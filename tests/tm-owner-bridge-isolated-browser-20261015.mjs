import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const site='https://gallery.gczhouwld.com';
const api='https://api.gczhouwld.com';
const owner=site+'/private-pdf-owner-setup.html';
const html=await readFile('public/private-pdf-owner-setup.html','utf8');
const bundle=await readFile('public/gallery-vpn-bridge.user.js','utf8');
assert.match(bundle,/\/\/ @version\s+2\.2\.91/);
assert.ok(bundle.indexOf('owner_isolated_bridge_v2')<bundle.indexOf("const DIAGNOSTIC_ID = 'vpn-lit-bridge-loader-status'"));
assert.ok(bundle.includes("if (!((location.pathname === '/private-pdf-owner-setup.html'"),'Owner page must skip legacy collector');
const browser=await chromium.launch({headless:true});

async function scenario(opts={}){
 const context=await browser.newContext();
 let leaseRequests=0;
 await context.addInitScript(origin=>{
  if(location.origin!==origin)return;
  localStorage.setItem('organic-gallery-session-v1','fixture-session');
  // An old standalone extension may reject the probe before Bridge answers.
  window.addEventListener('message',event=>{
   if(event.origin===location.origin&&event.data?.type==='osg-private-pdf-capture-probe-v1')
    window.postMessage({type:'osg-private-pdf-capture-ready-v1',ok:false,
      requestId:event.data.requestId,reason:'embedded_bridge_required'},location.origin);
  });
 },site);
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url()),method=route.request().method();
  if(u.origin===site&&u.pathname==='/private-pdf-owner-setup.html')
   return route.fulfill({status:200,contentType:'text/html',body:html});
  if(u.origin===api){
   const headers={'access-control-allow-origin':site,
    'access-control-allow-methods':'GET,POST,OPTIONS',
    'access-control-allow-headers':'authorization,content-type'};
   if(method==='OPTIONS')return route.fulfill({status:204,headers});
   if(u.pathname==='/api/user-ui/auth/session')return route.fulfill({
    status:200,contentType:'application/json',headers,body:JSON.stringify({
     authenticated:true,user:{id:'fixture-owner',email:'owner@example.invalid',
      capabilities:['private_pdf_owner','private_pdf_read','private_pdf_capture']}
    })});
   if(u.pathname==='/api/user-ui/private-pdf/capture-lease'){
    leaseRequests++;
    return route.fulfill({status:200,contentType:'application/json',headers,
     body:JSON.stringify({token:'X'.repeat(43),scope:'private_pdf_capture',
      expiresAt:Date.now()+7*86400000})});
   }
   return route.fulfill({status:404,contentType:'application/json',headers,body:'{}'});
  }
  return route.fulfill({status:404,contentType:'text/plain',body:''});
 });
 const page=await context.newPage();
 await page.goto(owner,{waitUntil:'domcontentloaded'});
 await page.locator('#authorize:not([disabled])').waitFor({timeout:10000});
 let cdp=null,contextId=0;
 if(opts.script!==false){
  cdp=await context.newCDPSession(page);
  await cdp.send('Page.enable');
  const {frameTree}=await cdp.send('Page.getFrameTree');
  const isolated=await cdp.send('Page.createIsolatedWorld',{
   frameId:frameTree.frame.id,worldName:'tampermonkey-isolated-owner-test'});
  contextId=isolated.executionContextId;
  const init=[
   "globalThis.__ownerStore=new Map();",
   "globalThis.GM_setValue="+(opts.storeBroken?
      "()=>{throw Error('blocked GM storage')}":
      "(key,value)=>globalThis.__ownerStore.set(key,value)")+";",
   "globalThis.GM_getValue=(key,fallback)=>globalThis.__ownerStore.has(key)?globalThis.__ownerStore.get(key):fallback;",
   "globalThis.GM_registerMenuCommand=()=>{throw Error('Full scraper incorrectly ran on owner setup page')};",
   "globalThis.GM_deleteValue=key=>globalThis.__ownerStore.delete(key);",
   "globalThis.GM_addValueChangeListener=()=>0;",
   "globalThis.GM_listValues=()=>Array.from(globalThis.__ownerStore.keys());",
   "globalThis.GM_xmlhttpRequest=()=>{throw Error('Unexpected media network request')};",
   "globalThis.GM_openInTab=()=>{throw Error('Unexpected publisher tab')};"
  ].join('\n');
  const setup=await cdp.send('Runtime.evaluate',{contextId,expression:init});
  assert.ok(!setup.exceptionDetails,'GM fixture setup failed');
  const full=await cdp.send('Runtime.evaluate',{contextId,expression:bundle});
  assert.ok(!full.exceptionDetails,'Packaged Bridge must run without legacy code on owner page');
 }
 return {context,page,cdp,contextId,get leaseRequests(){return leaseRequests}};
}

try{
 const good=await scenario();
 await good.page.locator('#authorize').click();
 await good.page.locator('#capture-status.ok').getByText(/PDF 捕获授权成功/).waitFor({timeout:16000});
 assert.equal(good.leaseRequests,1);
 const saved=await good.cdp.send('Runtime.evaluate',{contextId:good.contextId,returnByValue:true,
  expression:"(()=>{const x=globalThis.__ownerStore.get('osg-toc-v6:private-pdf-capture-lease-v1');return x?{scope:x.scope,valid:x.expiresAt>Date.now(),tokenLength:x.token.length}:null})()"});
 assert.equal(saved.result.value.scope,'private_pdf_capture');
 assert.equal(saved.result.value.valid,true);
 assert.equal(saved.result.value.tokenLength,43);
 await good.context.close();
 console.log('OWNER_BRIDGE_BROWSER_PASS full isolated Bridge, duplicate-script negative probe ignored');

 const absent=await scenario({script:false});
 await absent.page.locator('#authorize').click();
 await absent.page.locator('#capture-status.bad').getByText(/未检测到新版 VPN Bridge/).waitFor({timeout:12000});
 assert.equal(absent.leaseRequests,0);
 await absent.context.close();
 console.log('OWNER_BRIDGE_BROWSER_PASS no script does not mint owner lease');

 const broken=await scenario({storeBroken:true});
 await broken.page.locator('#authorize').click();
 await broken.page.locator('#capture-status.bad').getByText(/授权写入或回读失败/).waitFor({timeout:12000});
 assert.equal(broken.leaseRequests,1);
 await broken.context.close();
 console.log('OWNER_BRIDGE_BROWSER_PASS GM failure reports NACK');
} finally{
 await browser.close();
}
