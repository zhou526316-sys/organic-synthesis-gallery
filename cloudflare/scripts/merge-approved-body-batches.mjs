import {createHash} from 'node:crypto';
import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readPapers} from './merge-reviewed-toc.mjs';
import {verifyReviewedBody,figureId} from './merge-reviewed-body.mjs';
import {canonicalBodyEvidence,BODY_MEDIA_GENERATION} from '../../shared/body-media-evidence.js';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const demand = (ok, message) => { if (!ok) throw new Error(message); };
export const evidenceDigest = item => digest(Buffer.from(canonicalBodyEvidence(item,item.sha256)));
export function verifyApprovedBodyItem(item,bytes) {
  const ext=verifyReviewedBody(item,bytes);
  demand(item.review?.decision==='approved' && Number.isFinite(Date.parse(item.review?.reviewedAt)) && String(item.review?.note||'').trim().length>=20,'explicit_body_review_required');
  demand(item.review.evidenceSha256===evidenceDigest(item),'body_evidence_changed_since_review');
  demand(/^audit\/media-recovery\/body-batches\/assets\/[a-f0-9]{64}\.(svg|png|webp)$/.test(item.assetPath),'approved_body_path_invalid');
  return ext;
}
async function existingFile(root,figure) {
  if (!/^media-mirror\/[A-Za-z0-9._-]+$/.test(figure?.imageUrl||'')) return null;
  try { const b=await readFile(path.join(root,'public',figure.imageUrl)); return b.length>=100 ? {sha256:digest(b),byteLength:b.length} : null; }
  catch { return null; }
}
export async function mergeApprovedBodyBatches(root=process.cwd()) {
  const dir=path.join(root,'audit/media-recovery/body-batches');
  let names=[];
  try { names=(await readdir(dir)).filter(n=>/^[a-z0-9][a-z0-9-]*\.json$/.test(n)).sort(); }
  catch(e) { if(e.code!=='ENOENT')throw e; }
  const manifestPath=path.join(root,'public/media-index.json');
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));manifest.items||={};
  const papers=await readPapers(root), prepared=[], approved=new Map(), identityHashes=new Map();
  // Include the previously reviewed first batch only to identify its existing publication.
  try { const old=JSON.parse(await readFile(path.join(root,'audit/media-recovery/body-batch1/manifest.json'),'utf8')); for(const i of old.items||[])approved.set(i.doi+'|'+i.id+'|'+i.sha256,i); }
  catch(e) { if(e.code!=='ENOENT')throw e; }
  const batches=[];
  for(const name of names) {
    const batch=JSON.parse(await readFile(path.join(dir,name),'utf8'));
    demand(batch.schemaVersion===1 && batch.mediaGeneration===BODY_MEDIA_GENERATION && /^[a-z0-9-]{8,100}$/.test(batch.batchId||''),'invalid_approved_body_batch');
    demand(Array.isArray(batch.items)&&batch.items.length>0&&batch.items.length<=30&&batch.approvedCount===batch.items.length,'body_batch_limit_or_count_invalid');
    demand(new Set(batch.items.map(i=>i.doi)).size<=5,'body_batch_article_limit');
    batches.push(batch.batchId);
    for(const item of batch.items) {
      demand(typeof item.assetPath==='string'&&/^audit\/media-recovery\/body-batches\/assets\/[a-f0-9]{64}\.(svg|png|webp)$/.test(item.assetPath),'approved_body_path_invalid');
      const bytes=await readFile(path.join(root,item.assetPath)), ext=verifyApprovedBodyItem(item,bytes);
      const key=item.doi+'|'+item.id, prior=identityHashes.get(key);
      demand(!prior||prior===item.sha256,'conflicting_body_approvals_require_resolution');identityHashes.set(key,item.sha256);
      prepared.push({item,ext,batchId:batch.batchId});approved.set(key+'|'+item.sha256,item);
    }
  }
  // Verify all batches before creating any published output.
  const beforeToc=JSON.stringify(Object.fromEntries(Object.entries(manifest.items).map(([d,r])=>[d,r.toc]))),originalDois=Object.keys(manifest.items);
  const summary={schemaVersion:1,generatedAt:Date.now(),batches,approvedItems:prepared.length,added:[],alreadyPublished:[],retainedDifferentFile:[],notInCurrentCorpus:[],quarantineUnchanged:true,stagingWrites:0,stagingDeletes:0};
  await mkdir(path.join(root,'public/media-mirror'),{recursive:true});
  for(const {item,ext,batchId} of prepared) {
    if(!papers.has(item.doi)){summary.notInCurrentCorpus.push({doi:item.doi,id:item.id});continue;}
    const record=manifest.items[item.doi]||{doi:item.doi,toc:{doi:item.doi,available:false},figures:{doi:item.doi,available:false,figures:[]}};
    const figs=record.figures?.figures||[], old=figs.find(f=>figureId(f.id)===item.id||figureId(f.label)===item.id), oldBytes=await existingFile(root,old);
    if(oldBytes){
      if(oldBytes.sha256===item.sha256)summary.alreadyPublished.push({doi:item.doi,id:item.id,sha256:item.sha256});
      else summary.retainedDifferentFile.push({doi:item.doi,id:item.id,approvedSha256:item.sha256,publishedSha256:oldBytes.sha256,reason:'preserved_existing_file; replacement requires separate review'});
      continue;
    }
    const imageUrl='media-mirror/body-approved-'+item.sha256+'.'+ext;
    await copyFile(path.join(root,item.assetPath),path.join(root,'public',imageUrl));
    const f={doi:item.doi,id:item.id,label:item.label,caption:item.caption,articleUrl:item.articleUrl,sourceUrl:item.sourceUrl,imageUrl,order:item.order,width:item.width,height:item.height,
      contentType:item.contentType,contentHash:item.contentHash,verifiedSha256:item.sha256,evidenceSha256:item.review.evidenceSha256,
      publicationId:batchId,originalUpdatedAt:item.originalUpdatedAt,quality:item.quality,role:'article_figure',source:'reviewed-bound-staged-capture'};
    const figures=[...figs.filter(f=>f!==old),f].sort((a,b)=>Number(a.order||0)-Number(b.order||0)||String(a.id).localeCompare(String(b.id),'en',{numeric:true}));
    record.figures={...(record.figures||{}),available:true,doi:item.doi,articleUrl:item.articleUrl,figures};
    record.inventory={...(record.inventory||{}),status:record.toc?.available?'complete':'figures_only',figureCount:figures.length,fullArticleFiguresVerified:false};
    manifest.items[item.doi]=record;summary.added.push({doi:item.doi,id:item.id,sha256:item.sha256,imageUrl,batchId});
  }
  demand(JSON.stringify(Object.fromEntries(originalDois.map(d=>[d,manifest.items[d].toc])))===beforeToc,'existing_toc_changed');
  const ledger={schemaVersion:1,mediaGeneration:BODY_MEDIA_GENERATION,generatedAt:Date.now(),mediaManifestGeneratedAt:manifest.generatedAt,count:0,items:[]};
  for(const [doi,record] of Object.entries(manifest.items)){
    if(!papers.has(doi))continue;
    for(const f of record.figures?.figures||[]) {
      const id=figureId(f.id)||figureId(f.label), sha=f.verifiedSha256;
      if(!id||!sha)continue;
      const key=doi+'|'+id+'|'+sha, a=approved.get(key);if(!a)continue;
      const b=await existingFile(root,f);demand(b&&b.sha256===sha,'published_body_digest_changed');
      ledger.items.push({assetKey:key,doi,id,sha256:sha,evidenceSha256:evidenceDigest(a),label:f.label,imageUrl:f.imageUrl,state:'published',publicationId:f.publicationId,originalUpdatedAt:f.originalUpdatedAt});
    }
  }
  ledger.items.sort((a,b)=>a.assetKey.localeCompare(b.assetKey));ledger.count=ledger.items.length;
  summary.totalPublishedFigureEntries=Object.values(manifest.items).reduce((n,r)=>n+(r.figures?.figures?.length||0),0);
  summary.ledgerCount=ledger.count;
  manifest.generatedAt=summary.generatedAt;ledger.mediaManifestGeneratedAt=manifest.generatedAt;
  await writeFile(manifestPath,JSON.stringify(manifest));
  await writeFile(path.join(root,'public/body-publication-ledger.json'),JSON.stringify(ledger));
  await writeFile(path.join(root,'public/body-batches-status.json'),JSON.stringify(summary));
  console.log('APPROVED_BODY_BATCHES '+JSON.stringify(summary));return summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await mergeApprovedBodyBatches();
