import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mergeReviewedBody,verifyReviewedBody} from './merge-reviewed-body.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function requireValue(ok, reason) { if (!ok) throw new Error(reason); }
export async function mergeReviewedBodyReleases(root=process.cwd()) {
  const registry = JSON.parse(await readFile(path.join(root,'audit/media-recovery/body-releases.json'),'utf8'));
  requireValue(registry.version===1 && Array.isArray(registry.releases) && registry.releases.length<=100,'body_registry_invalid');
  const ids=new Set(), assets=new Set();
  // Validate every registered manifest and all approved bytes before changing outputs.
  for(const release of registry.releases) {
    requireValue(/^reviewed-body-batch[0-9]+-[0-9]{8}$/.test(release.publicationId||'')&&!ids.has(release.publicationId),'body_registry_duplicate_or_invalid_id');ids.add(release.publicationId);
    requireValue(/^audit\/media-recovery\/body-batch[0-9]+\/manifest\.json$/.test(release.manifestPath||''),'body_registry_path');
    requireValue(/^body-publication-[a-z0-9-]+-status\.json$/.test(release.statusFile||''),'body_registry_status_path');
    const bytes=await readFile(path.join(root,release.manifestPath));
    requireValue(/^[a-f0-9]{64}$/.test(release.manifestSha256||'')&&digest(bytes)===release.manifestSha256,'body_registry_manifest_hash');
    const plan=JSON.parse(bytes);requireValue(plan.publicationId===release.publicationId&&plan.cutoverMs===1790082000000&&plan.approvedCount===release.approvedCount&&plan.items.length===release.approvedCount,'body_registry_plan_mismatch');
    for(const item of plan.items){
      requireValue(/^audit\/media-recovery\/body-batch[0-9]+\/assets\/[a-f0-9]{64}\.(svg|png|webp)$/.test(item.assetPath||''),'body_registry_asset_path');
      const key=item.doi+'|'+item.id;requireValue(!assets.has(key),'body_registry_duplicate_asset');assets.add(key);
      verifyReviewedBody(item,await readFile(path.join(root,item.assetPath)));
    }
  }
  const batches=[];
  for(const release of registry.releases) batches.push(await mergeReviewedBody(root,release));
  const media=JSON.parse(await readFile(path.join(root,'public/media-index.json'),'utf8'));
  const items={};
  for(const [doi,record] of Object.entries(media.items||{})) {
    for(const figure of record.figures?.figures||[]) {
      if(!figure.publicationId?.startsWith('reviewed-body-batch')||!figure.verifiedSha256)continue;
      items[doi+'|'+figure.id]={doi,id:figure.id,state:'published',publicationId:figure.publicationId,contentSha256:figure.verifiedSha256,evidenceKey:figure.reviewEvidenceKey||null,imageUrl:figure.imageUrl};
    }
  }
  const ledger={version:1,generatedAt:Date.now(),source:'approved-static-publication',count:Object.keys(items).length,items};
  await writeFile(path.join(root,'public/body-publication-ledger.json'),JSON.stringify(ledger));
  const summary={batches:batches.map(b=>({publicationId:b.publicationId,added:b.added.length,retained:b.retainedExisting.length,notPublished:b.notPublished.length})),publishedReviewedFiles:ledger.count,stageWrites:0,stageDeletes:0};
  console.log('BODY_INCREMENTAL_PUBLICATION '+JSON.stringify(summary));return {summary,ledger,batches};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await mergeReviewedBodyReleases();
