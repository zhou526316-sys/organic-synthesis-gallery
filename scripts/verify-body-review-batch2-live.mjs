import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base='https://zhou526316-sys.github.io/organic-synthesis-gallery/';
const worker='https://organic-synthesis-gallery.zhou526316.workers.dev';
const out=process.env.RUNNER_TEMP+'/body-batch2-live';await mkdir(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
async function get(url){const r=await fetch(new URL(url,base),{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(25000)});assert.equal(r.status,200,url);return Buffer.from(await r.arrayBuffer());}
const report={checkedAt:new Date().toISOString(),readOnly:true,productionWrites:0,files:[],cards:[],realMarkerSamples:[],browserRenderingVerified:false};
try{
 const plan=JSON.parse(await readFile('audit/media-recovery/body-batch2/manifest.json','utf8'));
 const status=JSON.parse(await get('body-publication-batch2-status.json?t='+Date.now()));
 const media=JSON.parse(await get('media-index.json?t='+Date.now()));
 const ledger=JSON.parse(await get('body-publication-ledger.json?t='+Date.now()));
 assert.equal(status.publicationId,'reviewed-body-batch2-20260923');assert.equal(status.reviewed,31);assert.equal(status.notPublished.length,0);assert.equal(status.perDoi.length,6);
 assert.equal(status.retainedBatch1,83);assert.equal(status.retainedBatch2Official,18);
 for(const item of plan.items){
  const figure=media.items[item.doi]?.figures?.figures?.find(f=>f.id===item.id);assert.ok(figure,item.doi+' '+item.id);
  const raw=await get(figure.imageUrl);assert.equal(sha(raw),item.sha256);assert.equal(figure.verifiedSha256,item.sha256);
  const stamp=ledger.items[item.doi+'|'+item.id];assert.equal(stamp.state,'published');assert.equal(stamp.contentSha256,item.sha256);assert.equal(stamp.evidenceKey,figure.reviewEvidenceKey);assert.match(stamp.evidenceKey,/^[a-f0-9]{64}$/);
  report.files.push({doi:item.doi,id:item.id,ok:true,sha256:item.sha256,bytes:raw.length,evidenceKey:stamp.evidenceKey});
 }
 report.status=status;report.publishedReviewLedgerCount=ledger.count;report.totalPublicFigures=Object.values(media.items).reduce((n,r)=>n+(r.figures?.figures?.length||0),0);
 const installer=(await get('gallery-vpn-bridge.user.js')).toString();assert.match(installer,/\/\/ @version\s+2\.2\.23/);report.installerUnchangedVersion='2.2.23';
 for(let i=0;i<6;i++){
  try{const cap=JSON.parse(await get(worker+'/api/media/capture-capabilities?t='+Date.now()));if(cap.bodyReviewMarkers==='body-review-v1'){report.capabilities=cap;break;}}catch(error){report.capabilityLastError=String(error.message).slice(0,200);}
  await new Promise(r=>setTimeout(r,5000));
 }
 assert.equal(report.capabilities?.bodyReviewMarkers,'body-review-v1','deployed marker code not confirmed');assert.equal(report.capabilities.publishedAutomatically,false);
 try{
  const staged=JSON.parse(await get(worker+'/api/article-figures/staged'));
  report.stageRows=staged.count;const marked=(staged.items||[]).filter(r=>r.review?.schema==='body-review-v1');report.realMarkedRows=marked.length;
  for(const row of marked.slice(0,2)){
   assert.equal(row.review.publicationApproved,false);assert.equal(row.review.state,'pending_review');assert.equal(row.fullSha256,row.review.contentSha256);
   const raw=await get(row.imageUrl);assert.equal(sha(raw),row.fullSha256);
   report.realMarkerSamples.push({doi:row.doi,id:row.id,state:row.review.state,eligibility:row.review.eligibility,actualBytesVerified:true,evidenceKey:row.review.evidenceKey});
  }
 }catch(error){report.stageReadError=String(error.message).slice(0,240);}
 const browser=await chromium.launch({headless:true});
 try{
  const ctx=await browser.newContext({viewport:{width:1360,height:1000}});
  await ctx.route('**/*',route=>!['GET','HEAD','OPTIONS'].includes(route.request().method())?route.fulfill({status:503,body:'read-only verification blocks writes'}):route.continue());
  const page=await ctx.newPage();await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('#search').waitFor({timeout:30000});
  for(const [i,paper] of status.perDoi.entries()){
   await page.locator('#search').fill(paper.doi);await page.locator('#search').press('Escape');
   const selector='.figure-strip-slot[data-figure-doi="'+paper.doi+'"]';const strip=page.locator(selector);await strip.waitFor({timeout:20000});await strip.scrollIntoViewIfNeeded();
   await page.waitForFunction(({s,n})=>document.querySelectorAll(s+' .figure-thumb img').length===n,{s:selector,n:paper.figures},{timeout:20000});
   await strip.locator('.figure-thumb img').evaluateAll(images=>images.forEach(i=>{i.loading='eager';}));
   await page.waitForFunction(s=>[...document.querySelectorAll(s+' .figure-thumb img')].every(i=>i.complete&&i.naturalWidth>0),selector,{timeout:25000});
   const figures=await strip.locator('.figure-thumb img').evaluateAll(images=>images.map(i=>({label:i.alt,width:i.naturalWidth,height:i.naturalHeight,url:i.currentSrc||i.src})));
   assert.equal(figures.length,paper.figures);assert.ok(await strip.isVisible());
   await strip.locator('xpath=ancestor::article[1]').screenshot({path:out+'/card-'+i+'.png'});
   report.cards.push({doi:paper.doi,visible:true,figures,allImagesDecoded:true});
  }
  report.browserRenderingVerified=true;
 }finally{await browser.close();}
 report.result='passed';report.completedAt=new Date().toISOString();
}catch(error){report.result='failed';report.error=String(error.message);throw error;}
finally{await writeFile(out+'/acceptance.json',JSON.stringify(report,null,2));console.log('BODY_BATCH2_LIVE '+JSON.stringify({result:report.result,files:report.files.length,cards:report.cards.length,realMarkedRows:report.realMarkedRows,browserRenderingVerified:report.browserRenderingVerified,error:report.error}));}
