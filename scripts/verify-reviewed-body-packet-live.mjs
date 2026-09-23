import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {evidenceDigest,verifyApprovedBodyItem} from '../cloudflare/scripts/merge-approved-body-batches.mjs';
const base='https://zhou526316-sys.github.io/organic-synthesis-gallery/';
const out=process.env.RUNNER_TEMP+'/body-packet-live';await mkdir(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={checkedAt:new Date().toISOString(),readOnly:true,productionWrites:0,files:[],cards:[],tocChecks:[],browserRenderingVerified:false};
async function get(p){
 const u=new URL(p,base);assert.equal(u.origin,new URL(base).origin);assert.ok(u.pathname.startsWith(new URL(base).pathname));
 const r=await fetch(u,{headers:{'cache-control':'no-cache'},redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,u.pathname);
 const b=Buffer.from(await r.arrayBuffer());assert.ok(b.length<=10000000);return b;
}
try{
 const config=JSON.parse(await readFile('audit/media-recovery/body-live-acceptance.json','utf8'));
 assert.match(config.packetPath,/^audit\/media-recovery\/body-review-packets\/[a-z0-9-]+\.json$/);
 const packet=JSON.parse(await readFile(config.packetPath,'utf8'));
 assert.equal(packet.decision,'individually_reviewed');assert.equal(packet.mediaGeneration,1790082000000);
 assert.ok(packet.decisions.length>0&&packet.decisions.length<=20&&packet.approvedCount<=150);
 report.packetId=packet.packetId;report.expectedArticles=packet.decisions.length;report.expectedImages=packet.approvedCount;
 const decisions=new Map(packet.decisions.flatMap(a=>a.images.map(([rid,id,note])=>[a.doi+'|'+id,{rid,note}])));
 const names=(await readdir('audit/media-recovery/body-batches')).filter(n=>n.startsWith(packet.packetId+'-')&&n.endsWith('.json')).sort();
 const approved=[];
 for(const n of names){const batch=JSON.parse(await readFile('audit/media-recovery/body-batches/'+n));assert.ok(batch.items.length<=30&&new Set(batch.items.map(r=>r.doi)).size<=5);assert.equal(batch.reviewPacket,config.packetPath);approved.push(...batch.items);}
 assert.equal(approved.length,packet.approvedCount);assert.equal(decisions.size,approved.length);
 for(const item of approved){assert.equal(decisions.get(item.doi+'|'+item.id)?.rid,item.reviewId);verifyApprovedBodyItem(item,await readFile(item.assetPath));}
 const media=JSON.parse(await get('media-index.json?packet='+Date.now()));
 const ledger=JSON.parse(await get('body-publication-ledger.json?packet='+Date.now()));
 const status=JSON.parse(await get('body-batches-status.json?packet='+Date.now()));assert.ok(Array.isArray(ledger.items));
 report.mediaGeneratedAt=media.generatedAt;report.ledgerGeneratedAt=ledger.mediaManifestGeneratedAt;
 // The deployed ledger and index must describe one generation, not separate cached releases.
 assert.equal(ledger.mediaManifestGeneratedAt,media.generatedAt);
 async function check(item){
  const f=media.items[item.doi]?.figures?.figures?.find(x=>x.id===item.id);assert.ok(f,item.doi+' '+item.id);assert.equal(f.label,item.label);assert.equal(f.caption,item.caption);
  assert.equal(f.sourceUrl,item.sourceUrl);assert.equal(f.articleUrl,item.articleUrl);assert.match(f.imageUrl,/^media-mirror\/[A-Za-z0-9._-]+$/);
  const b=await get(f.imageUrl);assert.equal(sha(b),item.sha256);assert.equal(f.verifiedSha256,item.sha256);
  const entry=ledger.items.find(r=>r.assetKey===item.doi+'|'+item.id+'|'+item.sha256);assert.ok(entry);assert.equal(entry.state,'published');assert.equal(entry.evidenceSha256,evidenceDigest(item));assert.equal(entry.label,item.label);
  report.files.push({doi:item.doi,id:item.id,label:item.label,imageUrl:f.imageUrl,bytes:b.length,sha256:item.sha256,evidenceSha256:entry.evidenceSha256,ok:true});
 }
 for(let i=0;i<approved.length;i+=4)await Promise.all(approved.slice(i,i+4).map(check));
 for(const x of config.preservedToc||[]){const t=media.items[x.doi]?.toc;assert.equal(t?.available,true);assert.equal(t.contentHash,x.contentHash);report.tocChecks.push({doi:x.doi,contentHash:t.contentHash,preserved:true});}
 report.retainedTocBatch1=Object.values(media.items).filter(r=>r.toc?.recoveryId==='toc-batch1-20260922').length;
 report.retainedTocBatch2=Object.values(media.items).filter(r=>r.toc?.recoveryId==='sealed-media-batch2-20260923'&&!/fallback/i.test(r.toc.reason||'')).length;
 assert.equal(report.retainedTocBatch1,83);assert.equal(report.retainedTocBatch2,18);
 report.totalPublicFigures=Object.values(media.items).reduce((n,r)=>n+(r.figures?.figures||[]).length,0);report.reviewedLedgerCount=ledger.count;
 report.packetPublicationStatus={added:status.added.filter(x=>x.batchId?.startsWith(packet.packetId+'-')).length,notInCorpus:status.notInCurrentCorpus.filter(x=>decisions.has(x.doi+'|'+x.id)),retainedDifferentFile:status.retainedDifferentFile.filter(x=>decisions.has(x.doi+'|'+x.id))};
 assert.equal(report.packetPublicationStatus.notInCorpus.length,0);assert.equal(report.packetPublicationStatus.retainedDifferentFile.length,0);
 const browser=await chromium.launch();
 try{
  const ctx=await browser.newContext({viewport:{width:1360,height:1000}});
  await ctx.route('**/*',route=>!['GET','HEAD','OPTIONS'].includes(route.request().method())?route.fulfill({status:503,body:'read-only media acceptance blocks writes'}):route.continue());
  const page=await ctx.newPage();report.browserErrors=[];page.on('pageerror',e=>report.browserErrors.push(String(e.message).slice(0,300)));
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('#search').waitFor({timeout:30000});
  for(const [i,decision] of packet.decisions.entries()){
   const doi=decision.doi,selected=approved.filter(r=>r.doi===doi);const selector='.figure-strip-slot[data-figure-doi="'+doi+'"]';
   try{
    await page.locator('#search').fill(doi);await page.locator('#search').press('Escape');
    const strip=page.locator(selector);await strip.waitFor({timeout:20000});await strip.scrollIntoViewIfNeeded();
    const wanted=selected.map(x=>({label:x.label,url:new URL(media.items[doi].figures.figures.find(f=>f.id===x.id).imageUrl,base).href}));
    await page.waitForFunction(({s,w})=>{const imgs=[...document.querySelectorAll(s+' .figure-thumb img')];return w.every(y=>imgs.some(x=>x.alt===y.label&&(x.currentSrc||x.src)===y.url));},{s:selector,w:wanted},{timeout:20000});
    await strip.locator('.figure-thumb img').evaluateAll(xs=>xs.forEach(x=>{x.loading='eager';}));
    await page.waitForFunction(s=>[...document.querySelectorAll(s+' .figure-thumb img')].every(x=>x.complete&&x.naturalWidth>0),selector,{timeout:25000});
    const images=await strip.locator('.figure-thumb img').evaluateAll(xs=>xs.map(x=>({label:x.alt,url:x.currentSrc||x.src,width:x.naturalWidth,height:x.naturalHeight})));
    for(const w of wanted)assert.ok(images.some(x=>x.label===w.label&&x.url===w.url&&x.width>0),doi+' '+w.label);
    assert.ok(await strip.isVisible());await strip.locator('xpath=ancestor::article[1]').screenshot({path:out+'/card-'+String(i+1).padStart(2,'0')+'.png'});
    report.cards.push({doi,visible:true,expectedNew:selected.length,actualFigures:images.length,allNewLabelsAndUrlsMatched:true,allDecoded:true,images});
   }catch(e){report.failedCard={doi,error:String(e.message)};await page.screenshot({path:out+'/failure.png'});throw e;}
  }
  report.browserRenderingVerified=true;
 }finally{await browser.close();}
 assert.equal(report.files.length,packet.approvedCount);assert.equal(report.cards.length,packet.decisions.length);
 report.result='passed';report.completedAt=new Date().toISOString();
}catch(e){report.result='failed';report.error=String(e.message);throw e;}
finally{await writeFile(out+'/acceptance.json',JSON.stringify(report,null,2));console.log('BODY_PACKET_LIVE '+JSON.stringify({result:report.result,packetId:report.packetId,files:report.files.length,cards:report.cards.length,existingTocsPreserved:report.tocChecks.length,totalPublicFigures:report.totalPublicFigures,browserRenderingVerified:report.browserRenderingVerified,error:report.error}));}
