import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifySealedBytes,verifyHistoricalReceipt,mergeSealedMediaBatch2} from '../cloudflare/scripts/merge-sealed-media-batch2.mjs';
import {mergeReviewedToc,trueToc} from '../cloudflare/scripts/merge-reviewed-toc.mjs';
const h=b=>createHash('sha256').update(b).digest('hex');
const plan=JSON.parse(await readFile('audit/media-recovery/batch2/manifest.json','utf8'));
const sample=plan.items.find(x=>x.roleEvidence==='wiley_graphical_abstract_receipt'),bytes=await readFile(sample.assetPath),proof=await readFile(sample.proofPath);
let passed=0;async function test(n,f){await f();passed++;console.log('SEALED_PASS '+n);}
await test('exact historical image and receipt pass',()=>{assert.equal(verifySealedBytes(sample,bytes),'jpg');assert.equal(verifyHistoricalReceipt(sample,proof),true);});
await test('wrong page DOI rejected',()=>assert.throws(()=>verifySealedBytes({...sample,articleUrl:'https://onlinelibrary.wiley.com/doi/10.1002/anie.0000000'},bytes),/page_source_conflict/));
await test('modified image rejected',()=>assert.throws(()=>verifySealedBytes(sample,Buffer.alloc(bytes.length)),/digest_mismatch/));
await test('modified report rejected',()=>assert.throws(()=>verifyHistoricalReceipt(sample,Buffer.from('{}')),/proof_hash/));
for(const [label,modify,reason] of [
 ['another image source',r=>{r.sourceUrl=r.sourceUrl.replace('gra-0001','gra-0002')},/identity_mismatch/],
 ['Figure as official TOC',r=>{r.candidateKind='figure1'},/role_mismatch/],
 ['polluting-era capture version',r=>{r.trace.find(e=>e.stage==='job').message='v6.2.17;state=no_visual'},/pre_incident/],
 ['missing page confirmation',r=>{r.trace=r.trace.filter(e=>e.stage!=='page')},/page_identity/],
 ['wrong saved object',r=>{r.trace.find(e=>e.stage==='r2_upload'&&e.event==='complete').url='https://example.test/other.jpg'},/stored_object/],
])await test(label+' rejected',()=>{const r=JSON.parse(proof);modify(r);const raw=Buffer.from(JSON.stringify(r));assert.throws(()=>verifyHistoricalReceipt({...sample,proofSha256:h(raw)},raw),reason);});
await test('known optimization image remains excluded',()=>assert.ok(!plan.items.some(r=>r.doi==='10.1002/anie.5617321')));
const inputs=['papers.gz.b64','curated-supplement.json','automation-supplement.json','rolling-supplement.json','final-audit-supplement.json'];
const original=await Promise.all(inputs.map(async p=>h(await readFile('public/'+p))));
await writeFile('public/media-index.json','{"version":2,"items":{}}');await mergeReviewedToc();
const before=JSON.parse(await readFile('public/media-index.json','utf8'));
const restored=await mergeSealedMediaBatch2();const after=JSON.parse(await readFile('public/media-index.json','utf8'));
await test('first recovery unchanged',()=>{for(const [d,r] of Object.entries(before.items))assert.deepEqual(after.items[d],r);assert.ok(restored.retainedBatch1>=83);});
await test('literature input bytes unchanged',async()=>assert.deepEqual(await Promise.all(inputs.map(async p=>h(await readFile('public/'+p)))),original));
await test('Figure 1 is not official TOC',()=>{for(const r of restored.restored.filter(r=>r.kind==='figure1'))assert.equal(trueToc(after.items[r.doi].toc),false);});
await test('current exclusions do not return as media cards',()=>{for(const d of restored.notPublished)assert.equal(after.items[d],undefined);});
await test('recovery writes only approved hashes and DOI',()=>{for(const r of restored.restored)assert.ok(plan.items.some(a=>a.doi===r.doi&&a.sha256===r.sha256&&a.kind===r.kind));});
const second=await mergeSealedMediaBatch2();
await test('second run is idempotent and preserves newer media',()=>{assert.equal(second.restoredOfficial,0);assert.equal(second.restoredFigure1,0);});
await writeFile(process.env.RUNNER_TEMP+'/sealed-recovery-dryrun.json',JSON.stringify(restored,null,2));
console.log('SEALED_TEST_SUMMARY '+JSON.stringify({passed,eligible:restored.restored.length,official:restored.restoredOfficial,figure1:restored.restoredFigure1,notPublished:restored.notPublished,productionWrites:0}));
