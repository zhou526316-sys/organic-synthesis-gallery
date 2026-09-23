import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base='https://zhou526316-sys.github.io/organic-synthesis-gallery/';
const out=process.env.RUNNER_TEMP+'/body-live';await mkdir(out,{recursive:true});
async function get(p){const r=await fetch(new URL(p,base),{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(25000)});assert.equal(r.status,200,p);return Buffer.from(await r.arrayBuffer());}
const report={checkedAt:new Date().toISOString(),productionWrites:0,publicationId:'reviewed-body-batch1-20260923',files:[],cards:[],browserRenderingVerified:false,browserErrors:[],failureSnapshot:null};
try{
 const status=JSON.parse(await get('body-publication-status.json?audit='+Date.now()));
 const media=JSON.parse(await get('media-index.json?audit='+Date.now()));
 const plan=JSON.parse(await readFile('audit/media-recovery/body-batch1/manifest.json','utf8'));
 assert.equal(status.publicationId,report.publicationId);assert.equal(status.reviewed,32);assert.equal(status.notPublished.length,0);
 assert.equal(status.added.length+status.retainedExisting.length,32);assert.equal(status.perDoi.length,5);assert.equal(status.retainedBatch1,83);assert.equal(status.retainedBatch2Official,18);
 report.status=status;let mirrored=0;
 for(const paper of status.perDoi){
  const record=media.items[paper.doi];assert.equal(record.figures.figures.length,paper.figures);assert.ok(record.toc?.available);
  for(const f of record.figures.figures){
   assert.match(f.imageUrl,/^media-mirror\/[a-zA-Z0-9._-]+$/);
   const bytes=await get(f.imageUrl);const digest=createHash('sha256').update(bytes).digest('hex');
   if(f.publicationId===report.publicationId){
    const approved=plan.items.find(x=>x.doi===paper.doi&&x.id===f.id);assert.ok(approved);assert.equal(digest,approved.sha256);assert.equal(digest,f.verifiedSha256);mirrored++;
   }else assert.ok(status.retainedExisting.some(x=>x.doi===paper.doi&&x.id===f.id&&x.imageUrl===f.imageUrl));
   report.files.push({doi:paper.doi,id:f.id,bytes:bytes.length,sha256:digest,reviewed:f.publicationId===report.publicationId,ok:true});
  }
 }
 assert.equal(mirrored,status.added.length);assert.equal(report.files.length,32);
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1360,height:1000}});
  await context.route('**/*',route=>{
   const r=route.request();if(!['GET','HEAD','OPTIONS'].includes(r.method()))return route.fulfill({status:503,body:'read-only browser acceptance; production write blocked'});
   return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>report.browserErrors.push(String(e.message).slice(0,500)));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});await page.locator('#search').waitFor({timeout:30000});
  for(const [i,paper] of status.perDoi.entries()){
   const selector='.figure-strip-slot[data-figure-doi="'+paper.doi+'"]';
   try{
    await page.locator('#search').fill(paper.doi);
    // Normal keyboard dismissal, without rewriting card DOM or replacing application data.
    await page.locator('#search').press('Escape');
    const strip=page.locator(selector);await strip.waitFor({timeout:20000});await strip.scrollIntoViewIfNeeded();
    await page.waitForFunction(({doi,n})=>document.querySelectorAll('.figure-strip-slot[data-figure-doi="'+doi+'"] .figure-thumb img').length===n,{doi:paper.doi,n:paper.figures},{timeout:20000});
    await strip.locator('.figure-thumb img').evaluateAll(images=>images.forEach(image=>{image.loading='eager';}));
    await page.waitForFunction(doi=>[...document.querySelectorAll('.figure-strip-slot[data-figure-doi="'+doi+'"] .figure-thumb img')].every(x=>x.complete&&x.naturalWidth>0),paper.doi,{timeout:25000});
    const figures=await strip.locator('.figure-thumb img').evaluateAll(images=>images.map(x=>({label:x.alt,url:x.currentSrc||x.src,width:x.naturalWidth,height:x.naturalHeight})));
    assert.equal(figures.length,paper.figures);assert.ok(await strip.isVisible());
    const rect=await strip.boundingBox();assert.ok(rect&&rect.height>0&&rect.width>0);
    const card=strip.locator('xpath=ancestor::article[1]');await card.screenshot({path:out+'/card-'+i+'.png'});
    report.cards.push({doi:paper.doi,visible:true,figures:figures.length,allImagesDecoded:true,lazyImagesMadeEagerForDecodeCheck:true,images:figures,screenshot:'card-'+i+'.png'});
   }catch(e){
    report.failureSnapshot=await page.evaluate(({selector,doi})=>({doi,search:document.querySelector('#search')?.value,count:document.querySelectorAll(selector+' .figure-thumb img').length,html:document.querySelector(selector)?.outerHTML?.slice(0,20000)}),{selector,doi:paper.doi});
    await page.screenshot({path:out+'/failure.png'});throw e;
   }
  }
  report.browserRenderingVerified=true;
 }finally{await browser.close();}
 report.completedAt=new Date().toISOString();report.result='passed';
}catch(error){report.result='failed';report.error=String(error.message);throw error;}
finally{await writeFile(out+'/acceptance.json',JSON.stringify(report,null,2));console.log('BODY_LIVE_ACCEPTANCE '+JSON.stringify({result:report.result,checkedAt:report.checkedAt,files:report.files.length,cards:report.cards.length,browserRenderingVerified:report.browserRenderingVerified,error:report.error}));}
