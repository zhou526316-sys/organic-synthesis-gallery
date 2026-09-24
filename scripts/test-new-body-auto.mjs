import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {gzipSync} from 'node:zlib';
import {buildBodyReviewMarker,BODY_MEDIA_GENERATION} from '../shared/body-media-evidence.js';
import {validateNewBodyMetadata,validateNewBodyBytes,conflictKeys,createImageDecoder,exactKey,sha256} from '../cloudflare/scripts/new-body-auto-validation.mjs';
import {mergeNewBodyAuto,fetchStored,assertSnapshotCoherence} from '../cloudflare/scripts/merge-new-body-auto.mjs';

const fixture=process.env.BODY_AUTO_FIXTURE;assert.ok(fixture,'frozen controlled evidence fixture required');
const evidence=JSON.parse(await readFile(path.join(fixture,'evidence.json'),'utf8'));
const realRows=evidence.images.filter(r=>r.reviewMarker?.revision==='1');assert.equal(realRows.length,9);
const policy=JSON.parse(await readFile('audit/media-auto-policy.json','utf8'));
assert.equal(policy.minNewArticles,1);assert.equal(policy.maxNewArticles,25);
assert.equal(policy.requireOfficialTocInBuild,true);assert.equal(policy.requireCompletedCapturePacket,true);
assert.equal(policy.backfillStabilityMinutes,15);assert.ok(Number.isFinite(Date.parse(policy.backfillCapturedBefore)));
const now=Math.max(Date.now(),Date.parse(policy.backfillCapturedBefore)+20*60000);let passed=0;
async function test(name,fn){await fn();passed++;console.log('NEW_BODY_AUTO_PASS '+name);}
const realData=new Map();for(const r of realRows)realData.set(exactKey(r),await readFile(path.join(fixture,r.file)));
const vector=realRows.find(r=>r.contentType==='image/svg+xml'),png=realRows.find(r=>r.contentType==='image/png');

await test('real server-marked files retain strict metadata and byte validation',async()=>{for(const r of realRows){await validateNewBodyMetadata(r,policy,now);validateNewBodyBytes(r,realData.get(exactKey(r)));}});
await test('old generation and unmarked captures remain blocked',async()=>{await assert.rejects(()=>validateNewBodyMetadata({...vector,mediaGeneration:0},policy,now),/generation/);await assert.rejects(()=>validateNewBodyMetadata({...vector,reviewMarker:undefined},policy,now),/marker_missing/);});
await test('caption mutation and TOC-role captions remain blocked',async()=>{await assert.rejects(()=>validateNewBodyMetadata({...vector,caption:vector.caption+' changed'},policy,now),/marker_changed/);const r={...vector,caption:'Visual Abstract: graphical overview'};r.reviewMarker=await buildBodyReviewMarker(r,r.sha256);await assert.rejects(()=>validateNewBodyMetadata(r,policy,now),/toc_role/);});
await test('tampered bytes fail before publication',()=>assert.throws(()=>validateNewBodyBytes(png,Buffer.alloc(realData.get(exactKey(png)).length)),/digest/));
await test('network helper refuses publisher downloads and arbitrary hosts',async()=>{await assert.rejects(()=>fetchStored(vector.sourceUrl),/not_stored/);await assert.rejects(()=>fetchStored('https://example.org/image.png'),/not_stored/);});
const native=await createImageDecoder();try{await test('isolated Chromium decodes all frozen accepted files',async()=>{for(const r of realRows){const d=await native.decode(r,realData.get(exactKey(r)));assert.ok(d.width>0&&d.height>0);}});}finally{await native.close();}

async function makeRow(i,{doi='10.1021/jacs.6c9'+String(i).padStart(4,'0'),id='figure-1',label='Figure 1',updatedAt=now}={}){
  const code=doi.split('.').pop(),n=id.split('-').pop();
  const raw=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="420" viewBox="0 0 900 420"><path d="M10 20 L880 390" stroke="black"/><text x="80" y="120">'+label+' reaction scope '+i+'</text></svg>');
  const full=sha256(raw),source='https://acs.silverchair-cdn.com/acs/content_public/journal/jacs/pap/10.1021_jacs.'+code+'/1/m_ja'+code+'_'+String(n).padStart(4,'0')+'.svg';
  const row={doi,id,label,caption:label+'. Controlled reaction scope and substrate expansion '+i+'.',articleUrl:'https://pubs.acs.org/jacs/article/doi/'+doi+'/controlled-fixture',sourceUrl:source,
    captureVersion:'6.2.20',pageDoi:doi,jobId:'packet-job-'+String(i).padStart(8,'0'),mediaGeneration:BODY_MEDIA_GENERATION,
    contentHash:full.slice(0,32),sha256:full,byteLength:raw.length,contentType:'image/svg+xml',width:900,height:420,sortOrder:Number(n)-1,
    updatedAt,r2Key:'local-captures/article-figures/images/'+sha256(Buffer.from(doi)).slice(0,24)+'/'+id+'-'+full.slice(0,16)+'.svg'};
  row.reviewMarker=await buildBodyReviewMarker(row,full);assert.equal(row.reviewMarker.state,'pending_review');return {row,raw};
}
const one=await makeRow(1),twoA=await makeRow(2,{doi:'10.1021/jacs.6c90002',id:'figure-1',label:'Figure 1'}),twoB=await makeRow(22,{doi:'10.1021/jacs.6c90002',id:'figure-2',label:'Figure 2'});
await test('synthetic packet records have unique identities',()=>assert.equal(conflictKeys([one.row,twoA.row,twoB.row]).size,0));

const root=await mkdtemp(path.join(tmpdir(),'new-body-packet-'));
try{
  await mkdir(path.join(root,'audit'),{recursive:true});await mkdir(path.join(root,'public'),{recursive:true});
  await writeFile(path.join(root,'audit/media-auto-policy.json'),JSON.stringify(policy));
  await writeFile(path.join(root,'audit/literature-update-state.json'),JSON.stringify({pendingScopeReviewBacklog:[]}));
  const papers=[one.row,twoA.row].map((r,i)=>({doi:r.doi,journal:i?'Nature':'JACS',title:'Packet '+i,date:'2026-09-24'}));
  await writeFile(path.join(root,'public/papers.gz.b64'),gzipSync(Buffer.from(JSON.stringify(papers))).toString('base64'));
  for(const n of ['total-synthesis','manual-supplement','final-audit-supplement','curated-supplement','automation-supplement','rolling-supplement'])await writeFile(path.join(root,'public',n+'.json'),'{"papers":[]}');
  const mediaPath=path.join(root,'public/media-index.json'),ledgerPath=path.join(root,'public/body-publication-ledger.json');
  const bytes=new Map([[exactKey(one.row),one.raw],[exactKey(twoA.row),twoA.raw],[exactKey(twoB.row),twoB.raw]]);
  const toc=doi=>({doi,available:true,imageUrl:'media-mirror/toc-'+doi.replace(/[^a-z0-9]/gi,'-')+'.svg',reason:'local_vpn_official_toc'});
  const record=doi=>({doi,toc:toc(doi),figures:{doi,available:false,figures:[]}});
  const reset=async dois=>{await writeFile(mediaPath,JSON.stringify({items:Object.fromEntries(dois.map(d=>[d,record(d)]))}));await writeFile(ledgerPath,JSON.stringify({schemaVersion:1,count:0,items:[]}));};
  const localOfficial=row=>({doi:row.doi,kind:'official',captureVersion:'6.2.20',pageDoi:row.doi,mediaGeneration:BODY_MEDIA_GENERATION,updatedAt:row.updatedAt,articleUrl:row.articleUrl,sourceUrl:row.sourceUrl});
  const report=(row,labels=[row.label],final=true)=>({doi:row.doi,jobId:row.jobId,captureVersion:'6.2.20',controllerRevision:'2.2.30',final,status:'success',figuresDiscovered:labels.length,figuresStored:labels.length,figureLabels:labels});
  const basePrevious={policyId:policy.policyId,items:[],attempts:{}};
  function inputs(rows,reports){return {previous:basePrevious,live:{items:Object.fromEntries([...new Set(rows.map(r=>r.doi))].map(d=>[d,{doi:d,toc:{available:false},figures:{figures:[]}}]))},stage:{count:rows.length,items:rows},stageError:null,localCaptures:{count:rows.length,items:rows.map(localOfficial)},localCaptureError:null,reports:{items:reports},reportError:null};}
  const decoder={decode:async r=>({width:r.width,height:r.height}),close:async()=>{}},getNew=async r=>bytes.get(exactKey(r)),getOld=async e=>bytes.get(exactKey(e.record));

  await reset([one.row.doi]);
  const immediate=await mergeNewBodyAuto(root,{inputs:inputs([one.row],[report(one.row)]),now,decoder,getNew,getOld});
  await test('one completed article packet publishes immediately with its official TOC unchanged',()=>{assert.equal(immediate.status.publishedNewArticles,1);assert.equal(immediate.status.added.length,1);assert.equal(immediate.media.items[one.row.doi].toc.reason,'local_vpn_official_toc');});

  await reset([one.row.doi]);
  const unfinished=await mergeNewBodyAuto(root,{inputs:inputs([one.row],[report(one.row,[one.row.label],false)]),now,decoder,getNew,getOld});
  await test('unfinished current capture never publishes a partial body packet',()=>{assert.equal(unfinished.status.added.length,0);assert.equal(unfinished.snapshot.count,0);});

  const historical={...one.row,updatedAt:Date.parse(policy.backfillCapturedBefore)-20*60000};historical.reviewMarker=await buildBodyReviewMarker(historical,historical.sha256);
  await reset([historical.doi]);
  const backfill=await mergeNewBodyAuto(root,{inputs:inputs([historical],[]),now,decoder,getNew:async()=>one.raw,getOld});
  await test('stable pre-cutover staged body backlog publishes without manual re-review',()=>{assert.equal(backfill.status.added.length,1);assert.equal(backfill.status.publishedNewArticles,1);});

  const recentNoFinal={...one.row,updatedAt:Date.parse(policy.backfillCapturedBefore)+60000};recentNoFinal.reviewMarker=await buildBodyReviewMarker(recentNoFinal,recentNoFinal.sha256);
  await reset([recentNoFinal.doi]);
  const blockedRecent=await mergeNewBodyAuto(root,{inputs:inputs([recentNoFinal],[]),now,decoder,getNew:async()=>one.raw,getOld});
  await test('post-cutover body capture without final packet stays unpublished',()=>assert.equal(blockedRecent.status.added.length,0));

  await reset([twoA.row.doi]);
  const badBytes=new Map(bytes);badBytes.set(exactKey(twoB.row),Buffer.alloc(twoB.raw.length));
  const atomic=await mergeNewBodyAuto(root,{inputs:inputs([twoA.row,twoB.row],[report(twoA.row,[twoA.row.label,twoB.row.label])]),now,decoder,getNew:async r=>badBytes.get(exactKey(r)),getOld});
  await test('one invalid figure holds the entire DOI packet instead of publishing a partial set',()=>{assert.equal(atomic.status.added.length,0);assert.equal(atomic.media.items[twoA.row.doi].figures.figures.length,0);assert.ok(atomic.status.held.some(x=>x.doi===twoA.row.doi&&String(x.reason).startsWith('packet_held:')));});

  await test('shorter stale publication snapshot is rejected',()=>{const stale={...immediate.snapshot,items:[]};assert.throws(()=>assertSnapshotCoherence(stale,immediate.media),/snapshots_incoherent/);});
}finally{await rm(root,{recursive:true,force:true});}

console.log('NEW_BODY_AUTO_TESTS '+JSON.stringify({passed,packetMinimumArticles:1,packetMaximumArticles:25,historicalBackfillStabilityMinutes:15,pairedOfficialTocRequired:true,completedPacketRequired:true,productionWrites:0,publisherRequests:0}));
