import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildBodyReviewMarker} from '../cloudflare/worker/src/body-review-marker.js';
import {storeVerifiedStage,STAGE_INDEX_KEY} from '../cloudflare/worker/src/stage-storage.js';
const plan=JSON.parse(await readFile('audit/media-recovery/body-batch2/manifest.json','utf8'));
const sample=plan.items[0],bytes=await readFile(sample.assetPath);
const entry={...sample,r2Key:sample.originalR2Key,updatedAt:sample.originalUpdatedAt,review:{state:'published',publicationApproved:true}};
let passed=0;async function test(name,f){await f();passed++;console.log('BODY_MARKER_PASS '+name);}
const good=await buildBodyReviewMarker(entry,sample.sha256);
await test('known DOI/source/caption/byte identity is ready for review, not publication',()=>{assert.equal(good.eligibility,'provenance_ready');assert.equal(good.state,'pending_review');assert.equal(good.publicationApproved,false);assert.equal(good.published,false);assert.deepEqual(good.blockers,[]);});
await test('repeated byte-identical evidence has the same key',async()=>assert.deepEqual(await buildBodyReviewMarker(entry,sample.sha256),good));
await test('new job does not require rereview of identical evidence',async()=>assert.equal((await buildBodyReviewMarker({...entry,jobId:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'},sample.sha256)).evidenceKey,good.evidenceKey));
await test('caption change requires a new review while retaining the asset identity',async()=>{const m=await buildBodyReviewMarker({...entry,caption:'Different caption'},sample.sha256);assert.notEqual(m.evidenceKey,good.evidenceKey);assert.equal(m.assetKey,good.assetKey);});
await test('source change invalidates old review',async()=>assert.notEqual((await buildBodyReviewMarker({...entry,sourceUrl:entry.sourceUrl.replace('.svg','-other.svg')},sample.sha256)).evidenceKey,good.evidenceKey));
await test('byte change invalidates asset and evidence keys',async()=>{const m=await buildBodyReviewMarker(entry,'0'.repeat(64));assert.notEqual(m.assetKey,good.assetKey);assert.notEqual(m.evidenceKey,good.evidenceKey);assert.ok(m.blockers.includes('byteDigest'));});
await test('opaque Wiley CDN requires more evidence, not assumed DOI match',async()=>{const m=await buildBodyReviewMarker({...entry,sourceUrl:'https://onlinelibrary.wiley.com/cms/asset/a/image.jpg'},sample.sha256);assert.equal(m.eligibility,'manual_evidence_required');assert.ok(m.blockers.includes('imageUrlDoi'));});
await test('foreign image DOI is held even when page/task match',async()=>assert.ok((await buildBodyReviewMarker({...entry,sourceUrl:entry.sourceUrl.replace('6c09678','6c00000')},sample.sha256)).blockers.includes('imageUrlDoi')));
await test('wrong Figure label is not marked ready',async()=>assert.ok((await buildBodyReviewMarker({...entry,label:'Scheme 19'},sample.sha256)).blockers.includes('figureLabel')));
await test('old generation cannot become a trusted current capture',async()=>assert.ok((await buildBodyReviewMarker({...entry,mediaGeneration:0},sample.sha256)).blockers.includes('currentGeneration')));
await test('missing caption remains held',async()=>assert.ok((await buildBodyReviewMarker({...entry,caption:''},sample.sha256)).blockers.includes('individualCaption')));
await test('query credentials are not embedded in markers or stable keys',async()=>assert.deepEqual(await buildBodyReviewMarker({...entry,sourceUrl:entry.sourceUrl+'?token=DO_NOT_LOG#fragment'},sample.sha256),good));
class Bucket{
 constructor(){this.map=new Map();this.rev=0;this.puts=0;this.failIndex=false;}
 seed(k,b){this.map.set(k,{bytes:Buffer.from(b),etag:'v'+(++this.rev)});}
 async get(k){const o=this.map.get(k);if(!o)return null;const b=o.bytes;return {size:b.length,etag:o.etag,text:async()=>b.toString(),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};}
 async put(k,b,opts={}){if(k===STAGE_INDEX_KEY&&this.failIndex)throw Object.assign(new Error('503'),{status:503});const p=this.map.get(k);if(opts.onlyIf?.etagMatches&&p?.etag!==opts.onlyIf.etagMatches||opts.onlyIf?.etagDoesNotMatch==='*'&&p)return null;this.puts++;this.seed(k,b);return {etag:this.map.get(k).etag};}
 async delete(){throw new Error('Markers must never delete image bytes');}
}
const request=new Request('https://worker.test/api/article-figures/stage');
const run=b=>storeVerifiedStage(request,{MEDIA:b},entry,bytes,sample.sha256,r=>r.doi===entry.doi&&r.id===entry.id,{sleep:async()=>{},now:()=>1790140000000});
await test('real storage receipt and committed index contain server marker, not client approval',async()=>{const b=new Bucket();const r=await run(b);assert.equal(r.body.stored,true);assert.equal(r.body.fullSha256,sample.sha256);assert.deepEqual(r.body.review,good);const stored=JSON.parse(b.map.get(STAGE_INDEX_KEY).bytes).items[entry.doi+'|'+entry.id];assert.deepEqual(stored.review,good);assert.equal(stored.review.publicationApproved,false);assert.equal(b.puts,2);});
await test('repeat upload adds no R2 writes and reuses the committed marker',async()=>{const b=new Bucket();await run(b);const n=b.puts;const r=await run(b);assert.equal(b.puts,n);assert.deepEqual(r.body.review,good);});
await test('failed index commit never returns a published or ready receipt',async()=>{const b=new Bucket();b.failIndex=true;const r=await run(b);assert.equal(r.body.stored,false);assert.equal(r.body.indexCommitted,false);assert.equal(r.body.review,undefined);assert.equal(r.body.published,false);});
await test('unmarked old retained row cannot borrow incoming proof',async()=>{const b=new Bucket();b.seed(entry.r2Key,bytes);const old={...entry};delete old.review;b.seed(STAGE_INDEX_KEY,JSON.stringify({items:{[entry.doi+'|'+entry.id]:old}}));const r=await run(b);assert.equal(r.body.review,null);assert.equal(r.body.fullSha256,null);assert.equal(b.puts,0);});
console.log('BODY_REVIEW_MARKER_TEST_SUMMARY '+JSON.stringify({passed,productionWrites:0}));
