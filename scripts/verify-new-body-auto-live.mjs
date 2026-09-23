import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {sha256,exactKey,evidenceKey,validateNewBodyMetadata,validateNewBodyBytes} from '../cloudflare/scripts/new-body-auto-validation.mjs';
const base='https://zhou526316-sys.github.io/organic-synthesis-gallery/';
const out=process.env.RUNNER_TEMP+'/new-body-auto-live';await mkdir(out,{recursive:true});
async function get(p){const u=new URL(p,base);assert.equal(u.origin,new URL(base).origin);assert.ok(u.pathname.startsWith('/organic-synthesis-gallery/'));const r=await fetch(u,{redirect:'error',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(25000)});assert.equal(r.status,200,u.pathname);return Buffer.from(await r.arrayBuffer());}
const result={checkedAt:new Date().toISOString(),readOnly:true,productionWrites:0,files:[],cards:[],pairedToc:[],browserRenderingVerified:false,individualSemanticReview:false};
try{
 const status=JSON.parse(await get('auto-body-status.json?t='+Date.now()));
 const snapshot=JSON.parse(await get('auto-body-publication.json?t='+Date.now()));
 const media=JSON.parse(await get('media-index.json?t='+Date.now()));
 const ledger=JSON.parse(await get('body-publication-ledger.json?t='+Date.now()));
 const policy=JSON.parse(await readFile('audit/media-auto-policy.json','utf8'));
 assert.equal(status.policyId,policy.policyId);assert.equal(snapshot.policyId,policy.policyId);assert.equal(policy.minNewArticles,20);assert.ok(policy.maxNewArticles>=20&&policy.maxNewArticles<=25);assert.equal(policy.requireOfficialTocInBuild,true);
 assert.equal(snapshot.count,snapshot.items.length);assert.equal(status.autoPublishedCount,snapshot.count);assert.ok(snapshot.count>0,'no actual automatically published figure yet');
 assert.equal(snapshot.generatedAt,status.checkedAt);assert.equal(ledger.mediaManifestGeneratedAt,status.checkedAt);
 // The existing sanitizer stamps its later execution time. Exact assets/labels below,
 // not equality with that later timestamp, establish the shared publication contents.
 assert.ok(media.generatedAt>=ledger.mediaManifestGeneratedAt,'media snapshot predates automatic merge');
 const auto=ledger.items.filter(x=>x.publicationId===policy.policyId);assert.equal(auto.length,snapshot.count);
 for(const entry of snapshot.items){
  const row=entry.record;await validateNewBodyMetadata(row,policy);assert.equal(entry.evidenceSha256,evidenceKey(row));
  const bytes=await get(entry.imageUrl);validateNewBodyBytes(row,bytes);assert.equal(sha256(bytes),row.sha256);
  const published=media.items[row.doi]?.figures?.figures?.find(f=>f.id===row.id);assert.ok(published);assert.equal(published.verifiedSha256,row.sha256);assert.equal(published.imageUrl,entry.imageUrl);assert.equal(published.label,row.label);assert.equal(published.evidenceSha256,entry.evidenceSha256);assert.equal(published.individualSemanticReview,false);
  const receipt=auto.find(x=>x.assetKey===exactKey(row));assert.ok(receipt);assert.equal(receipt.state,'published');assert.equal(receipt.evidenceSha256,entry.evidenceSha256);
  result.files.push({doi:row.doi,id:row.id,label:row.label,imageUrl:entry.imageUrl,sha256:row.sha256,evidenceSha256:entry.evidenceSha256,bytes:bytes.length,ok:true});
 }
 result.status=status;result.manualLedgerEntries=ledger.items.length-auto.length;
 const addedDois=[...new Set(status.added.map(x=>x.doi))];
 if(addedDois.length){assert.ok(addedDois.length>=policy.minNewArticles,'published batch below minimum article count');assert.ok(addedDois.length<=policy.maxNewArticles,'published batch above maximum article count');}
 for(const doi of addedDois){
   const toc=media.items[doi]?.toc;
   assert.ok(toc?.available&&toc?.imageUrl&&!/fallback/i.test(String(toc.reason||''))&&!String(toc.reason||'').startsWith('figure_fallback:'),'body published without official TOC '+doi);
   result.pairedToc.push({doi,imageUrl:toc.imageUrl,contentHash:toc.contentHash||null,reason:toc.reason||null,official:true});
 }
 result.retainedReviewedToc1=Object.values(media.items).filter(x=>x.toc?.recoveryId==='toc-batch1-20260922').length;
 result.retainedReviewedToc2=Object.values(media.items).filter(x=>x.toc?.recoveryId==='sealed-media-batch2-20260923'&&!/fallback/i.test(x.toc.reason||'')).length;
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1360,height:1000},serviceWorkers:'block'});
  await context.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.fulfill({status:503,body:'read-only acceptance blocks production writes'}));
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e.message)));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});await page.locator('#search').waitFor({timeout:30000});
  const dois=[...new Set(status.added.map(x=>x.doi))];
  for(const [i,doi] of dois.entries()){
   await page.locator('#search').fill(doi);await page.locator('#search').press('Escape');
   const selector='.figure-strip-slot[data-figure-doi="'+doi+'"]',strip=page.locator(selector);await strip.waitFor({timeout:20000});await strip.scrollIntoViewIfNeeded();
   const expected=media.items[doi].figures.figures;
   await page.waitForFunction(({s,n})=>document.querySelectorAll(s+' .figure-thumb img').length===n,{s:selector,n:expected.length},{timeout:20000});
   await strip.locator('.figure-thumb img').evaluateAll(images=>images.forEach(x=>{x.loading='eager';}));
   await page.waitForFunction(s=>[...document.querySelectorAll(s+' .figure-thumb img')].every(x=>x.complete&&x.naturalWidth>0),selector,{timeout:25000});
   const images=await strip.locator('.figure-thumb img').evaluateAll(images=>images.map(x=>({label:x.alt,url:x.currentSrc||x.src,width:x.naturalWidth,height:x.naturalHeight})));
   for(const f of expected)assert.ok(images.some(x=>x.url===new URL(f.imageUrl,base).href&&x.label===f.label),'body URL/label mismatch '+doi+' '+f.id);
   assert.ok(await strip.isVisible());await strip.locator('xpath=ancestor::article[1]').screenshot({path:out+'/card-'+i+'.png'});
   result.cards.push({doi,visible:true,allImagesDecoded:true,exactLabelsAndUrls:true,images});
  }
  result.browserErrors=errors;result.browserRenderingVerified=true;
 }finally{await browser.close();}
 result.completedAt=new Date().toISOString();result.result='passed';
}catch(e){result.result='failed';result.error=String(e.message);throw e;}
finally{await writeFile(out+'/acceptance.json',JSON.stringify(result,null,2));console.log('NEW_BODY_AUTO_LIVE '+JSON.stringify({result:result.result,files:result.files.length,cards:result.cards.length,pairedToc:result.pairedToc.length,browserRenderingVerified:result.browserRenderingVerified,error:result.error}));}
