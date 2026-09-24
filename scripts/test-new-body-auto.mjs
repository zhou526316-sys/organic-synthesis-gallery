import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {buildBodyReviewMarker} from '../shared/body-media-evidence.js';
import {validateNewBodyMetadata,validateNewBodyBytes,createImageDecoder,exactKey,sha256} from '../cloudflare/scripts/new-body-auto-validation.mjs';
import {fetchStored} from '../cloudflare/scripts/merge-new-body-auto.mjs';

const fixture=process.env.BODY_AUTO_FIXTURE;assert.ok(fixture,'frozen controlled evidence fixture required');
const evidence=JSON.parse(await readFile(path.join(fixture,'evidence.json'),'utf8'));
const rows=evidence.images.filter(r=>r.reviewMarker?.revision==='1');assert.equal(rows.length,9);
const policy=JSON.parse(await readFile('audit/media-auto-policy.json','utf8'));
assert.equal(policy.minNewArticles,1);assert.equal(policy.maxNewArticles,25);
assert.equal(policy.requireOfficialTocInBuild,true);assert.equal(policy.requireCompletedCapturePacket,true);
assert.equal(policy.backfillStabilityMinutes,15);
const now=Math.max(Date.now(),Date.parse(policy.backfillCapturedBefore)+20*60000);
let passed=0;async function test(name,fn){await fn();passed++;console.log('NEW_BODY_AUTO_PASS '+name);}
const data=new Map();for(const row of rows)data.set(exactKey(row),await readFile(path.join(fixture,row.file)));
const vector=rows.find(r=>r.contentType==='image/svg+xml'),png=rows.find(r=>r.contentType==='image/png');

await test('frozen server-marked files retain strict metadata and byte validation',async()=>{for(const row of rows){await validateNewBodyMetadata(row,policy,now);validateNewBodyBytes(row,data.get(exactKey(row)));}});
await test('old generation and unmarked captures remain blocked',async()=>{await assert.rejects(()=>validateNewBodyMetadata({...vector,mediaGeneration:0},policy,now),/generation/);await assert.rejects(()=>validateNewBodyMetadata({...vector,reviewMarker:undefined},policy,now),/marker_missing/);});
await test('evidence mutation cannot reuse a server marker',async()=>assert.rejects(()=>validateNewBodyMetadata({...vector,caption:vector.caption+' changed'},policy,now),/marker_changed/));
await test('TOC-role caption is not promoted as a body figure',async()=>{const row={...vector,caption:'Visual Abstract: graphical overview'};row.reviewMarker=await buildBodyReviewMarker(row,row.sha256);await assert.rejects(()=>validateNewBodyMetadata(row,policy,now),/toc_role/);});
await test('tampered bytes fail before decode',()=>assert.throws(()=>validateNewBodyBytes(png,Buffer.alloc(data.get(exactKey(png)).length)),/digest/));
await test('publication network helper still refuses publisher downloads',async()=>{await assert.rejects(()=>fetchStored(vector.sourceUrl),/not_stored/);await assert.rejects(()=>fetchStored('https://example.org/image.png'),/not_stored/);});
await test('ACS Catalysis year-style Silverchair filenames remain DOI-bound',async()=>{
  const doi='10.1021/acscatal.6c05422';
  const row={...vector,doi,pageDoi:doi,id:'figure-4',label:'Figure 4',caption:'Figure 4. Verified catalytic reaction data and mechanistic comparison.',
    articleUrl:'https://pubs.acs.org/accacs/article/doi/'+doi+'/fixture',
    sourceUrl:'https://acs.silverchair-cdn.com/acs/content_public/journal/accacs/pap/10.1021_acscatal.6c05422/1/m_cs-2026-05422t_0004.svg'};
  row.r2Key='local-captures/article-figures/images/'+sha256(Buffer.from(doi)).slice(0,24)+'/figure-4-'+row.sha256.slice(0,16)+'.svg';
  row.reviewMarker=await buildBodyReviewMarker(row,row.sha256);
  assert.equal(row.reviewMarker.state,'pending_review');
  await validateNewBodyMetadata(row,policy,now);
  const foreign={...row,sourceUrl:row.sourceUrl.replace('05422t_0004','05423t_0004')};
  foreign.reviewMarker=await buildBodyReviewMarker(foreign,foreign.sha256);
  assert.equal(foreign.reviewMarker.state,'pending_review');
  await assert.rejects(()=>validateNewBodyMetadata(foreign,policy,now),/not_numbered_body_asset/);
});
const decoder=await createImageDecoder();try{await test('isolated Chromium decodes all frozen accepted files',async()=>{for(const row of rows){const d=await decoder.decode(row,data.get(exactKey(row)));assert.ok(d.width>0&&d.height>0);}});}finally{await decoder.close();}

await import('./test-tm230-packet-publication.mjs');
console.log('NEW_BODY_AUTO_TESTS '+JSON.stringify({passed,realStoredFilesDecoded:9,packetMinimumArticles:1,packetMaximumArticles:25,pairedOfficialTocRequired:true,completedPacketRequired:true,historicalBackfillStabilityMinutes:15,productionWrites:0,publisherRequests:0}));
