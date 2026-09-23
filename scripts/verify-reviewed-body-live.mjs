import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const base='https://zhou526316-sys.github.io/organic-synthesis-gallery/';
const out=process.env.RUNNER_TEMP+'/body-live';await mkdir(out,{recursive:true});
async function get(p){const r=await fetch(new URL(p,base),{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(25000)});assert.equal(r.status,200,p);return Buffer.from(await r.arrayBuffer());}
const hash=b=>createHash('sha256').update(b).digest('hex');
const key=(doi,id,sha)=>doi+'|'+id+'|'+sha;
const report={checkedAt:new Date().toISOString(),productionWrites:0,files:[],cards:[],browserRenderingVerified:false,browserErrors:[],failureSnapshot:null};
try{
 const [statusBytes,ledgerBytes,mediaBytes]=await Promise.all([
  get('body-batches-status.json?audit='+Date.now()),get('body-publication-ledger.json?audit='+Date.now()),get('media-index.json?audit='+Date.now())
 ]);
 const status=JSON.parse(statusBytes),ledger=JSON.parse(ledgerBytes),media=JSON.parse(mediaBytes);
 assert.equal(status.schemaVersion,1);assert.equal(status.quarantineUnchanged,true);assert.equal(status.stagingWrites,0);assert.equal(status.stagingDeletes,0);
 assert.equal(ledger.schemaVersion,1);assert.equal(ledger.mediaGeneration,1790082000000);
 const dir='audit/media-recovery/body-batches';
 const names=(await readdir(dir)).filter(n=>/^[a-z0-9][a-z0-9-]*\.json$/.test(n)).sort();
 const batches=[];
 for(const name of names){const batch=JSON.parse(await readFile(dir+'/'+name,'utf8'));assert.equal(batch.schemaVersion,1);assert.equal(batch.mediaGeneration,1790082000000);batches.push(batch);}
 const byKey=new Map(),byBatch=new Map();
 for(const batch of batches){byBatch.set(batch.batchId,batch);for(const item of batch.items||[])byKey.set(key(item.doi,item.id,item.sha256),{...item,batchId:batch.batchId});}
 assert.equal(status.approvedItems,batches.reduce((n,b)=>n+(b.items?.length||0),0));
 assert.deepEqual(new Set(status.batches),new Set(batches.map(b=>b.batchId)));
 const publishedRows=[...(status.added||[]),...(status.alreadyPublished||[])];
 assert.equal(publishedRows.length+(status.retainedDifferentFile?.length||0)+(status.notInCurrentCorpus?.length||0),status.approvedItems);
 const ledgerMap=new Map((ledger.items||[]).map(x=>[key(x.doi,x.id,x.sha256),x]));
 const fileTasks=[];
 for(const row of publishedRows){
  const approved=byKey.get(key(row.doi,row.id,row.sha256));assert.ok(approved,'approval missing '+key(row.doi,row.id,row.sha256));
  const l=ledgerMap.get(key(row.doi,row.id,row.sha256));assert.ok(l,'ledger missing '+key(row.doi,row.id,row.sha256));
  assert.equal(l.state,'published');assert.equal(l.evidenceSha256,approved.review.evidenceSha256);assert.equal(l.imageUrl,row.imageUrl);
  const record=media.items?.[row.doi];assert.ok(record,'media DOI missing '+row.doi);
  const figure=record.figures?.figures?.find(f=>f.id===row.id&&f.verifiedSha256===row.sha256);assert.ok(figure,'media figure missing '+row.doi+' '+row.id);
  assert.equal(figure.imageUrl,row.imageUrl);assert.match(row.imageUrl,/^media-mirror\/[A-Za-z0-9._-]+$/);
  fileTasks.push({row,approved,ledger:l,figure});
 }
 for(let i=0;i<fileTasks.length;i+=8){
  const chunk=fileTasks.slice(i,i+8);const bytes=await Promise.all(chunk.map(x=>get(x.row.imageUrl)));
  for(let j=0;j<chunk.length;j++){const x=chunk[j],digest=hash(bytes[j]);assert.equal(digest,x.row.sha256);report.files.push({doi:x.row.doi,id:x.row.id,sha256:digest,evidenceSha256:x.approved.review.evidenceSha256,imageUrl:x.row.imageUrl,bytes:bytes[j].length,state:'published',ok:true});}
 }
 assert.equal(report.files.length,publishedRows.length);
 // Browser spot-check the five most recently reviewed article groups. This keeps the live check bounded while exact-byte checks cover every approved published item above.
 const ranked=[];
 for(const batch of batches)for(const item of batch.items||[])ranked.push({doi:item.doi,reviewedAt:Date.parse(item.review?.reviewedAt||0)});
 ranked.sort((a,b)=>b.reviewedAt-a.reviewedAt||a.doi.localeCompare(b.doi));
 const selected=[];for(const x of ranked)if(!selected.includes(x.doi)&&selected.length<5)selected.push(x.doi);
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1360,height:1000}});
  await context.route('**/*',route=>{const r=route.request();if(!['GET','HEAD','OPTIONS'].includes(r.method()))return route.fulfill({status:503,body:'read-only browser acceptance; production write blocked'});return route.continue();});
  const page=await context.newPage();page.on('pageerror',e=>report.browserErrors.push(String(e.message).slice(0,500)));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});await page.locator('#search').waitFor({timeout:30000});
  for(const [i,doi] of selected.entries()){
   const selector='.figure-strip-slot[data-figure-doi="'+doi+'"]',record=media.items?.[doi];assert.ok(record);
   const expected=publishedRows.filter(x=>x.doi===doi),expectedCount=record.figures?.figures?.length||0;assert.ok(expected.length>0);assert.ok(expectedCount>=expected.length);
   try{
    await page.locator('#search').fill(doi);await page.locator('#search').press('Escape');
    const strip=page.locator(selector);await strip.waitFor({timeout:20000});await strip.scrollIntoViewIfNeeded();
    await page.waitForFunction(({doi,n})=>document.querySelectorAll('.figure-strip-slot[data-figure-doi="'+doi+'"] .figure-thumb img').length===n,{doi,n:expectedCount},{timeout:20000});
    await strip.locator('.figure-thumb img').evaluateAll(images=>images.forEach(image=>{image.loading='eager';}));
    await page.waitForFunction(doi=>[...document.querySelectorAll('.figure-strip-slot[data-figure-doi="'+doi+'"] .figure-thumb img')].every(x=>x.complete&&x.naturalWidth>0),doi,{timeout:25000});
    const figures=await strip.locator('.figure-thumb img').evaluateAll(images=>images.map(x=>({label:x.alt,url:x.currentSrc||x.src,width:x.naturalWidth,height:x.naturalHeight})));
    assert.equal(figures.length,expectedCount);assert.ok(await strip.isVisible());const rect=await strip.boundingBox();assert.ok(rect&&rect.height>0&&rect.width>0);
    for(const row of expected){const hit=figures.find(f=>new URL(f.url).pathname.endsWith('/'+row.imageUrl));assert.ok(hit,'card missing exact published image '+doi+' '+row.id);assert.ok(hit.width>0&&hit.height>0);}
    const card=strip.locator('xpath=ancestor::article[1]');await card.screenshot({path:out+'/card-'+i+'.png'});
    report.cards.push({doi,visible:true,figures:figures.length,approvedImagesChecked:expected.length,allImagesDecoded:true,tocAvailable:Boolean(record.toc?.available),lazyImagesMadeEagerForDecodeCheck:true,images:figures,screenshot:'card-'+i+'.png'});
   }catch(e){report.failureSnapshot=await page.evaluate(({selector,doi})=>({doi,search:document.querySelector('#search')?.value,count:document.querySelectorAll(selector+' .figure-thumb img').length,html:document.querySelector(selector)?.outerHTML?.slice(0,20000)}),{selector,doi});await page.screenshot({path:out+'/failure.png'});throw e;}
  }
  report.browserRenderingVerified=true;
 }finally{await browser.close();}
 report.status={batches:status.batches,approvedItems:status.approvedItems,publishedExact:publishedRows.length,retainedDifferentFile:status.retainedDifferentFile?.length||0,notInCurrentCorpus:status.notInCurrentCorpus?.length||0,ledgerCount:ledger.count,totalPublishedFigureEntries:status.totalPublishedFigureEntries,selectedCardDois:selected};
 report.completedAt=new Date().toISOString();report.result='passed';
}catch(error){report.result='failed';report.error=String(error.message);throw error;}
finally{await writeFile(out+'/acceptance.json',JSON.stringify(report,null,2));console.log('BODY_LIVE_ACCEPTANCE '+JSON.stringify({result:report.result,checkedAt:report.checkedAt,files:report.files.length,cards:report.cards.length,browserRenderingVerified:report.browserRenderingVerified,error:report.error}));}
