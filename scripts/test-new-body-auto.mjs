import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {gzipSync} from 'node:zlib';
import {buildBodyReviewMarker,BODY_MEDIA_GENERATION} from '../shared/body-media-evidence.js';
import {validateNewBodyMetadata,validateNewBodyBytes,conflictKeys,createImageDecoder,exactKey,sha256} from '../cloudflare/scripts/new-body-auto-validation.mjs';
import {mergeNewBodyAuto,fetchStored,assertSnapshotCoherence,strongOfficialCapture} from '../cloudflare/scripts/merge-new-body-auto.mjs';

const fixture=process.env.BODY_AUTO_FIXTURE;assert.ok(fixture,'frozen controlled evidence fixture required');
const evidence=JSON.parse(await readFile(path.join(fixture,'evidence.json'),'utf8'));
const realRows=evidence.images.filter(r=>r.reviewMarker?.revision==='1');assert.equal(realRows.length,9);
const policy=JSON.parse(await readFile('audit/media-auto-policy.json','utf8'));
assert.equal(policy.targetNewArticles,20);assert.equal(policy.maxNewArticles,25);assert.equal(policy.tailFlushAfterMinutes,15);assert.equal(policy.requireOfficialTocInBuild,true);
const now=Date.now();let passed=0;
async function test(name,fn){await fn();passed++;console.log('NEW_BODY_AUTO_PASS '+name);}
const realData=new Map();for(const r of realRows)realData.set(exactKey(r),await readFile(path.join(fixture,r.file)));
const vector=realRows.find(r=>r.contentType==='image/svg+xml'),png=realRows.find(r=>r.contentType==='image/png');

await test('nine real current server-marked files still pass independent metadata and byte validation',async()=>{for(const r of realRows){await validateNewBodyMetadata(r,policy,now);validateNewBodyBytes(r,realData.get(exactKey(r)));}});
await test('old sealed generation cannot enter the new-image path',async()=>assert.rejects(()=>validateNewBodyMetadata({...vector,updatedAt:1790081999999,mediaGeneration:0},policy,now),/generation/));
await test('unmarked capture is not assumed safe because it is new',async()=>assert.rejects(()=>validateNewBodyMetadata({...vector,reviewMarker:undefined},policy,now),/marker_missing/));
await test('caption mutation cannot reuse server evidence',async()=>assert.rejects(()=>validateNewBodyMetadata({...vector,caption:vector.caption+' changed'},policy,now),/marker_changed/));
await test('TOC caption is not promoted into a body figure',async()=>{const r={...vector,caption:'Visual Abstract: graphical overview'};r.reviewMarker=await buildBodyReviewMarker(r,r.sha256);await assert.rejects(()=>validateNewBodyMetadata(r,policy,now),/toc_role/);});
await test('tampered PNG bytes fail before decode',()=>assert.throws(()=>validateNewBodyBytes(png,Buffer.alloc(realData.get(exactKey(png)).length)),/digest/));
await test('network helper still refuses publisher downloads and arbitrary hosts',async()=>{await assert.rejects(()=>fetchStored(vector.sourceUrl),/not_stored/);await assert.rejects(()=>fetchStored('https://example.org/image.png'),/not_stored/);});
const native=await createImageDecoder();
try{await test('isolated Chromium still decodes all nine actual stored files',async()=>{for(const r of realRows){const d=await native.decode(r,realData.get(exactKey(r)));assert.ok(d.width>0&&d.height>0);}});}finally{await native.close();}

async function makeRow(i,updatedAt=now-i*1000){
  const code='6c9'+String(i).padStart(4,'0'),doi='10.1021/jacs.'+code,id='figure-1';
  const raw=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="420" viewBox="0 0 900 420"><path d="M10 20 L880 390" stroke="black"/><text x="80" y="120">Batch '+i+' reaction scope</text><!-- '+String(i).padStart(4,'0')+' --></svg>');
  const full=sha256(raw),source='https://acs.silverchair-cdn.com/acs/content_public/journal/jacs/pap/10.1021_jacs.'+code+'/1/m_ja'+code+'_0001.svg';
  const row={doi,id,label:'Figure 1',caption:'Figure 1. Controlled paired TOC and body publication fixture '+i+'.',
    articleUrl:'https://pubs.acs.org/jacs/article/doi/10.1021/jacs.'+code+'/controlled-fixture-'+i,sourceUrl:source,
    captureVersion:'6.2.20',pageDoi:doi,jobId:'batch20-job-'+String(i).padStart(8,'0'),mediaGeneration:BODY_MEDIA_GENERATION,
    contentHash:full.slice(0,32),sha256:full,byteLength:raw.length,contentType:'image/svg+xml',width:900,height:420,sortOrder:0,
    updatedAt,r2Key:'local-captures/article-figures/images/'+sha256(Buffer.from(doi)).slice(0,24)+'/'+id+'-'+full.slice(0,16)+'.svg'};
  row.reviewMarker=await buildBodyReviewMarker(row,full);assert.equal(row.reviewMarker.state,'pending_review');return {row,raw};
}
const synthetic=[];for(let i=1;i<=26;i++)synthetic.push(await makeRow(i));
await test('twenty-six synthetic current records have unique byte/source identities',()=>{assert.equal(new Set(synthetic.map(x=>x.row.sha256)).size,26);assert.equal(conflictKeys(synthetic.map(x=>x.row)).size,0);});

const root=await mkdtemp(path.join(tmpdir(),'new-body-batch20-'));
try{
  await mkdir(path.join(root,'audit'),{recursive:true});await mkdir(path.join(root,'public'),{recursive:true});
  await writeFile(path.join(root,'audit/media-auto-policy.json'),JSON.stringify(policy));
  await writeFile(path.join(root,'audit/literature-update-state.json'),JSON.stringify({pendingScopeReviewBacklog:[]}));
  const papers=[...synthetic.map((x,i)=>({doi:x.row.doi,journal:'JACS',title:'Controlled paired batch '+(i+1),date:'2026-09-23'})),...Array.from({length:110},(_,i)=>({doi:'10.1021/fixture.'+i,journal:'JACS'}))];
  await writeFile(path.join(root,'public/papers.gz.b64'),gzipSync(Buffer.from(JSON.stringify(papers))).toString('base64'));
  for(const n of ['total-synthesis','manual-supplement','final-audit-supplement','curated-supplement','automation-supplement','rolling-supplement'])await writeFile(path.join(root,'public',n+'.json'),'{"papers":[]}');
  const mediaPath=path.join(root,'public/media-index.json'),ledgerPath=path.join(root,'public/body-publication-ledger.json');
  const bytesByKey=new Map(synthetic.map(x=>[exactKey(x.row),x.raw]));
  function record(doi,official){
    return {doi,toc:official?{available:true,doi,imageUrl:'media-mirror/local-toc-'+doi.replace(/[^a-z0-9]/gi,'-')+'.svg',reason:'local_vpn_official_toc',contentHash:'toc-'+doi}:{available:false,doi,reason:'cache_miss'},figures:{available:false,doi,figures:[]}};
  }
  function mediaFor(count,officialCount=count){return {items:Object.fromEntries(synthetic.slice(0,count).map((x,i)=>[x.row.doi,record(x.row.doi,i<officialCount)]))};}
  function localOfficial(row,updatedAt=row.updatedAt){
    const code=row.doi.split('/')[1];
    return {doi:row.doi,kind:'official',captureVersion:'6.2.20',pageDoi:row.doi,mediaGeneration:BODY_MEDIA_GENERATION,updatedAt,
      articleUrl:row.articleUrl,sourceUrl:'https://acs.silverchair-cdn.com/acs/content_public/journal/jacs/pap/10.1021_'+code+'/1/m_ja'+code.replace(/^jacs\./,'')+'_0006.svg'};
  }
  async function reset(media){await writeFile(mediaPath,JSON.stringify(media));await writeFile(ledgerPath,JSON.stringify({schemaVersion:1,count:0,items:[]}));}
  function inputs(count,{previous={policyId:policy.policyId,items:[],attempts:{}},liveOfficial=count,localOfficialCount=0,stageRows=null}={}){
    const rows=stageRows||synthetic.slice(0,count).map(x=>x.row);
    return {previous,live:mediaFor(count,liveOfficial),stage:{count:rows.length,items:rows},stageError:null,
      localCaptures:{count:localOfficialCount,items:synthetic.slice(0,localOfficialCount).map(x=>localOfficial(x.row))},localCaptureError:null};
  }
  const decoder={decode:async row=>({width:row.width,height:row.height}),close:async()=>{}};
  const getNew=async r=>bytesByKey.get(exactKey(r)),getOld=async e=>bytesByKey.get(exactKey(e.record));

  await reset(mediaFor(19));
  const nineteenRecent=await mergeNewBodyAuto(root,{inputs:inputs(19),now,decoder,getNew,getOld});
  await test('nineteen recently changing articles wait for the target',()=>{assert.equal(nineteenRecent.status.eligibleArticles,19);assert.equal(nineteenRecent.status.releaseReason,'waiting');assert.equal(nineteenRecent.status.added.length,0);assert.equal(nineteenRecent.snapshot.count,0);assert.equal(nineteenRecent.status.waitingForTargetOrTail,true);});

  const oldRows=synthetic.slice(0,19).map(x=>({...x.row,updatedAt:now-20*60*1000}));
  await reset(mediaFor(19));
  const nineteenTail=await mergeNewBodyAuto(root,{inputs:inputs(19,{stageRows:oldRows}),now,decoder,getNew,getOld});
  await test('nineteen quiet articles flush as a stable tail',()=>{assert.equal(nineteenTail.status.releaseReason,'stable_tail');assert.equal(nineteenTail.status.meetsReleaseBatch,true);assert.equal(nineteenTail.status.publishedNewArticles,19);assert.equal(nineteenTail.status.added.length,19);assert.equal(nineteenTail.snapshot.count,19);});

  await reset(mediaFor(20));
  const twenty=await mergeNewBodyAuto(root,{inputs:inputs(20),now,decoder,getNew,getOld});
  await test('twenty articles publish immediately as the target batch',()=>{assert.equal(twenty.status.releaseReason,'target_reached');assert.equal(twenty.status.meetsReleaseBatch,true);assert.equal(twenty.status.publishedNewArticles,20);assert.equal(twenty.status.added.length,20);assert.equal(twenty.snapshot.count,20);});
  await test('automatic body publication preserves every official TOC unchanged',()=>{const expected=mediaFor(20);for(const [doi,r] of Object.entries(expected.items))assert.deepEqual(twenty.media.items[doi].toc,r.toc);});

  await reset(mediaFor(20));
  const sameBuild=await mergeNewBodyAuto(root,{inputs:inputs(20,{liveOfficial:0,localOfficialCount:20}),now,decoder,getNew,getOld});
  await test('fresh official TOC evidence can trigger body publication in the same Pages build',()=>{assert.equal(sameBuild.status.releaseReason,'target_reached');assert.equal(sameBuild.status.publishedNewArticles,20);assert.ok(sameBuild.status.added.every(x=>sameBuild.media.items[x.doi].toc.reason==='local_vpn_official_toc'));});

  await reset(mediaFor(20,19));
  const missingOne=await mergeNewBodyAuto(root,{inputs:inputs(20,{liveOfficial:19}),now,decoder,getNew,getOld});
  await test('one DOI without official TOC leaves nineteen recent articles waiting instead of body-only publishing',()=>{assert.equal(missingOne.status.eligibleArticles,19);assert.equal(missingOne.status.releaseReason,'waiting');assert.equal(missingOne.status.added.length,0);});

  await reset(mediaFor(25,20));
  const twentyOfTwentyFive=await mergeNewBodyAuto(root,{inputs:inputs(25,{liveOfficial:20}),now,decoder,getNew,getOld});
  await test('twenty TOC-ready articles publish while five TOC-incomplete articles stay outside the batch',()=>{assert.equal(twentyOfTwentyFive.status.eligibleArticles,20);assert.equal(twentyOfTwentyFive.status.releaseReason,'target_reached');assert.equal(twentyOfTwentyFive.status.publishedNewArticles,20);assert.equal(twentyOfTwentyFive.status.added.length,20);});

  await reset(mediaFor(26));
  const capped=await mergeNewBodyAuto(root,{inputs:inputs(26),now,decoder,getNew,getOld});
  await test('one deployment admits at most twenty-five article identities',()=>{assert.equal(capped.status.candidateArticles,25);assert.equal(capped.status.publishedNewArticles,25);assert.equal(capped.status.added.length,25);assert.equal(capped.snapshot.count,25);});

  await reset(mediaFor(20));
  const first=await mergeNewBodyAuto(root,{inputs:inputs(20),now,decoder,getNew,getOld});
  const carriedInput={previous:first.snapshot,live:first.media,stage:null,stageError:'controlled stage outage',localCaptures:{count:0,items:[]},localCaptureError:null};
  await writeFile(mediaPath,JSON.stringify(first.media));await writeFile(ledgerPath,JSON.stringify(first.ledger));
  const carried=await mergeNewBodyAuto(root,{inputs:carriedInput,now:now+1000,decoder,getNew,getOld});
  await test('stage outage preserves all previously published automatic files',()=>{assert.equal(carried.snapshot.count,20);assert.equal(carried.status.retained.length,20);assert.equal(carried.status.stageReadError,'controlled stage outage');});
  await test('shorter stale publication snapshot is still rejected',()=>{const stale={...first.snapshot,items:first.snapshot.items.slice(0,-1)};assert.throws(()=>assertSnapshotCoherence(stale,first.media),/snapshots_incoherent/);});
  await test('same-build official capture evidence remains exact-DOI bound',()=>{const good=localOfficial(synthetic[0].row);assert.equal(strongOfficialCapture(good),true);assert.equal(strongOfficialCapture({...good,sourceUrl:good.sourceUrl.replace('6c90001','6c90002')}),false);});
}finally{await rm(root,{recursive:true,force:true});}

console.log('NEW_BODY_AUTO_TESTS '+JSON.stringify({passed,realStoredFilesDecoded:9,targetArticles:20,maximumArticles:25,tailFlushAfterMinutes:15,pairedOfficialTocRequired:true,productionWrites:0,publisherRequests:0}));
