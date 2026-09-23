import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {sha256,checkNewBodyIdentity,verifyNewBodyBytes,scopedHolds} from '../cloudflare/scripts/new-body-auto-validation.mjs';
import {readPapers} from '../cloudflare/scripts/merge-reviewed-toc.mjs';
const base='https://zhou526316-sys.github.io/organic-synthesis-gallery/';
const out=process.env.RUNNER_TEMP+'/new-body-auto-live';await mkdir(out,{recursive:true});
async function get(p){const u=new URL(p,base);assert.equal(u.origin,new URL(base).origin);const r=await fetch(u,{headers:{'cache-control':'no-cache'},redirect:'error',signal:AbortSignal.timeout(25000)});assert.equal(r.status,200,u.pathname);const b=Buffer.from(await r.arrayBuffer());assert.ok(b.length<=12000000);return b;}
const report={checkedAt:new Date().toISOString(),productionWrites:0,files:[],cards:[],browserErrors:[],browserRenderingVerified:false};
try{
 const [media,status,ledger]=await Promise.all(['media-index.json','new-body-auto-status.json','new-body-auto-ledger.json'].map(async n=>JSON.parse(await get(n+'?accept='+Date.now()))));
 const policy=JSON.parse(await readFile('shared/new-body-auto-policy.json','utf8'));
 const state=JSON.parse(await readFile('audit/literature-update-state.json','utf8'));
 const corpus=await readPapers(process.cwd()),held=scopedHolds(state,policy);
 assert.equal(status.policyRevision,policy.revision);assert.equal(ledger.policyRevision,policy.revision);assert.equal(ledger.count,ledger.items.length);
 assert.ok(status.added.length<=30);assert.ok(status.newPapers.length<=5);assert.equal(status.stagingWrites,0);assert.equal(status.stagingDeletes,0);
 assert.equal(status.totalAutoFiles,ledger.items.length);
 report.status=status;report.totalPublicFigures=Object.values(media.items||{}).reduce((n,r)=>n+(r.figures?.figures?.length||0),0);
 report.retainedTocBatch1=Object.values(media.items||{}).filter(r=>r.toc?.recoveryId==='toc-batch1-20260922').length;
 report.retainedTocBatch2=Object.values(media.items||{}).filter(r=>r.toc?.recoveryId==='sealed-media-batch2-20260923'&&!/fallback/i.test(r.toc?.reason||'')).length;
 const keys=new Set();
 for(const entry of ledger.items){
  const r=entry.capture;await checkNewBodyIdentity(r,{...policy,enabled:true},corpus,held);
  const k=r.doi+'|'+r.id;assert.ok(!keys.has(k));keys.add(k);
  const f=media.items[r.doi]?.figures?.figures?.find(x=>x.id===r.id);assert.ok(f,k);
  assert.equal(f.source,'machine-validated-new-capture');assert.equal(f.verifiedSha256,r.sha256);assert.equal(f.evidenceSha256,r.reviewMarker.evidenceSha256);assert.equal(f.imageUrl,entry.imageUrl);assert.equal(f.label,r.label);
  assert.equal(entry.validation.decision,'machine_validated');assert.equal(entry.validation.semanticReview,'not_performed');assert.equal(entry.validation.sourceRole,'isolated_figure_caption');assert.equal(r.reviewMarker.semanticReview,'not_reviewed');
 }
 const wantedKeys=new Set(status.added.map(r=>r.doi+'|'+r.id));
 const selected=ledger.items.filter(r=>wantedKeys.has(r.doi+'|'+r.id));assert.equal(selected.length,status.added.length);
 const carrySample=ledger.items.filter(r=>!wantedKeys.has(r.doi+'|'+r.id)).slice(0,10);
 for(const entry of [...selected,...carrySample]){
  assert.match(entry.imageUrl,/^media-mirror\/auto-body-[a-f0-9]{64}\.(svg|png)$/);
  const bytes=await get(entry.imageUrl);verifyNewBodyBytes(entry.capture,bytes);
  report.files.push({doi:entry.doi,id:entry.id,sha256:sha256(bytes),bytes:bytes.length,newInThisBuild:wantedKeys.has(entry.doi+'|'+entry.id),ok:true});
 }
 report.checkedNewFiles=selected.length;report.checkedCarrySample=carrySample.length;report.ledgerRecordsVerified=ledger.items.length;
 const browserRows=selected.length?selected:carrySample;
 const dois=[...new Set(browserRows.map(r=>r.doi))].slice(0,5);
 if(dois.length){
  const browser=await chromium.launch({headless:true});
  try{
   const context=await browser.newContext({viewport:{width:1360,height:1000}});
   await context.route('**/*',r=>!['GET','HEAD','OPTIONS'].includes(r.request().method())?r.fulfill({status:503,body:'read-only media acceptance blocks production writes'}):r.continue());
   const page=await context.newPage();page.on('pageerror',e=>report.browserErrors.push(String(e.message).slice(0,500)));
   await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('#search').waitFor({timeout:30000});
   for(const [i,doi] of dois.entries()){
    await page.locator('#search').fill(doi);await page.locator('#search').press('Escape');
    const selector='.figure-strip-slot[data-figure-doi="'+doi+'"]',strip=page.locator(selector);
    await strip.waitFor({timeout:20000});await strip.scrollIntoViewIfNeeded();
    const expected=browserRows.filter(r=>r.doi===doi).map(r=>({url:new URL(r.imageUrl,base).href,label:r.capture.label}));
    await page.waitForFunction(({s,expected})=>{const imgs=[...document.querySelectorAll(s+' .figure-thumb img')];return expected.every(e=>imgs.some(x=>(x.currentSrc||x.src)===e.url&&x.alt===e.label));},{s:selector,expected},{timeout:25000});
    await strip.locator('.figure-thumb img').evaluateAll(xs=>xs.forEach(x=>{x.loading='eager';}));
    await page.waitForFunction(({s,expected})=>{const imgs=[...document.querySelectorAll(s+' .figure-thumb img')];return expected.every(e=>imgs.some(x=>(x.currentSrc||x.src)===e.url&&x.alt===e.label&&x.complete&&x.naturalWidth>0));},{s:selector,expected},{timeout:25000});
    assert.ok(await strip.isVisible());
    const images=await strip.locator('.figure-thumb img').evaluateAll(xs=>xs.map(x=>({label:x.alt,url:x.currentSrc||x.src,width:x.naturalWidth,height:x.naturalHeight})));
    await strip.locator('xpath=ancestor::article[1]').screenshot({path:out+'/card-'+i+'.png'});
    report.cards.push({doi,verifiedRequestedFigures:expected.length,totalRendered:images.length,images,visible:true,labelsAndUrlsMatched:true});
   }
   report.browserRenderingVerified=true;
  }finally{await browser.close();}
 }
 const installer=(await get('gallery-vpn-bridge.user.js')).toString();report.installerVersion=installer.match(/\/\/\s*@version\s+(\S+)/)?.[1]||null;
 report.result=ledger.items.length?'passed':'no_eligible_files_published';report.completedAt=new Date().toISOString();
}catch(error){report.result='failed';report.error=String(error.message);throw error;}
finally{await writeFile(out+'/acceptance.json',JSON.stringify(report,null,2));console.log('NEW_BODY_AUTO_LIVE '+JSON.stringify({result:report.result,newFiles:report.checkedNewFiles,carrySample:report.checkedCarrySample,cards:report.cards.length,ledgerRecords:report.ledgerRecordsVerified,browserRenderingVerified:report.browserRenderingVerified,error:report.error}));}
