import { readFile, mkdir, writeFile, rename, rm, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { normalizeDoi } from '../shared/literature-identity.mjs';
import { buildUnifiedAssetCatalog, verifyUnifiedAssetCatalog, assetStable } from '../architecture/asset-catalog.mjs';

const ROOT=process.cwd();
const API='https://api.gczhouwld.com';
const SITE='https://gallery.gczhouwld.com';
const args=process.argv.slice(2),opts={};
for(let i=0;i<args.length;i++){
  if(args[i]==='--out'&&args[i+1])opts.out=args[++i];
  else throw new Error('unknown_argument:'+args[i]);
}
const OUTPUT=path.resolve(opts.out||'artifacts/gallery-asset-shadow');
const protectedRoots=['public','src','shared','scripts','audit','cloudflare','.github','.git','architecture'].map(name=>path.resolve(ROOT,name));
for(const root of protectedRoots) if(OUTPUT===root||OUTPUT.startsWith(root+path.sep)) throw new Error('asset_shadow_output_must_be_external');
if(OUTPUT===ROOT||ROOT.startsWith(OUTPUT+path.sep))throw new Error('unsafe_asset_shadow_output');
try{await access(OUTPUT);throw new Error('asset_shadow_output_exists');}catch(error){if(error.code!=='ENOENT')throw error;}

const git=(...argv)=>execFileSync('git',argv,{cwd:ROOT,encoding:'utf8'}).trim();
const sha=value=>createHash('sha256').update(value).digest('hex');
const pretty=value=>JSON.stringify(value,null,2)+'\n';
const readJson=async file=>JSON.parse(await readFile(path.join(ROOT,file),'utf8'));
const allowedOrigins=new Set([new URL(API).origin,new URL(SITE).origin]);

async function fetchBytes(url,options={},maxBytes=50_000_000){
  const response=await fetch(url,{...options,headers:{'cache-control':'no-cache',pragma:'no-cache',...(options.headers||{})},signal:AbortSignal.timeout(45_000)});
  if(!response.ok)throw new Error('asset_shadow_http_'+response.status+':'+new URL(url).pathname);
  if(!allowedOrigins.has(new URL(response.url).origin))throw new Error('asset_shadow_unexpected_origin');
  const declared=Number(response.headers.get('content-length')||0);
  if(declared>maxBytes)throw new Error('asset_shadow_object_too_large');
  const buffer=Buffer.from(await response.arrayBuffer());
  if(buffer.length>maxBytes)throw new Error('asset_shadow_object_too_large');
  return {buffer,response};
}
async function fetchJson(url,options={},maxBytes){
  const {buffer,response}=await fetchBytes(url,options,maxBytes);
  let value;try{value=JSON.parse(buffer.toString('utf8'));}catch{throw new Error('asset_shadow_invalid_json:'+new URL(url).pathname);}
  return {value,bytes:buffer.length,sha256:sha(buffer),date:response.headers.get('date')||''};
}
function membershipFromQueue(queue){
  if(!Array.isArray(queue?.articles)||Number(queue.webpageDoiCount)!==queue.articles.length)throw new Error('asset_shadow_queue_incomplete');
  const dois=queue.articles.map(row=>normalizeDoi(row?.doi));
  if(dois.some(doi=>!doi)||new Set(dois).size!==dois.length)throw new Error('asset_shadow_queue_identity_invalid');
  return [...dois].sort();
}

const queue=await readJson('public/toc-demand-live.json');
const membership=membershipFromQueue(queue);
const receipt=await readJson('audit/deployment-delivery-latest.json');
const state=await readJson('audit/literature-update-state.json');
const datasetSha256=sha(pretty(membership));
if(receipt.ok!==true||Number(receipt.productionCards)!==membership.length||receipt.datasetSha256!==datasetSha256)
  throw new Error('asset_shadow_repository_not_latest_verified_generation');
const stateVerification=state?.lastWebsiteSync?.verification;
if(stateVerification?.datasetSha256!==datasetSha256||Number(stateVerification?.galleryDois)!==membership.length)
  throw new Error('asset_shadow_state_generation_mismatch');

const liveBefore=(await fetchJson(SITE+'/release-delivery.json?asset-shadow='+Date.now())).value;
if(liveBefore?.ok!==true||Number(liveBefore.productionCards)!==membership.length||liveBefore.datasetSha256!==datasetSha256)
  throw new Error('asset_shadow_live_generation_mismatch');

const [worker,local,staged,media,summary] = await Promise.all([
  fetchJson(API+'/api/media/inventory?asset-shadow='+Date.now(),{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({dois:membership,readOnly:true})
  },20_000_000),
  fetchJson(API+'/api/media/local-capture-index?asset-shadow='+Date.now(),{},30_000_000),
  fetchJson(API+'/api/article-figures/staged?inventory=1&asset-shadow='+Date.now(),{},50_000_000),
  fetchJson(SITE+'/media-index.json?asset-shadow='+Date.now(),{},50_000_000),
  fetchJson(SITE+'/scheduled-article-summaries.json?asset-shadow='+Date.now(),{},20_000_000),
]);

const liveAfter=(await fetchJson(SITE+'/release-delivery.json?asset-shadow='+Date.now())).value;
if(liveAfter.datasetSha256!==liveBefore.datasetSha256||liveAfter.sourceCommit!==liveBefore.sourceCommit
  ||liveAfter.publicationSlot!==liveBefore.publicationSlot||liveAfter.productionCards!==liveBefore.productionCards)
  throw new Error('asset_shadow_literature_generation_changed_during_build');

const sourceCommit=git('rev-parse','HEAD');
const catalog=buildUnifiedAssetCatalog({
  membershipDois:membership,
  workerInventory:worker.value,
  localCaptureIndex:local.value,
  stagedFigureInventory:staged.value,
  staticMediaIndex:media.value,
  summaryIndex:summary.value,
  source:{
    repositoryCommit:sourceCommit,
    publicationSlot:liveBefore.publicationSlot,
    deploymentSourceCommit:liveBefore.sourceCommit,
    datasetSha256,
    architectureCatalogId:String(liveBefore.architectureCatalogId||''),
    sourceDigests:{
      workerInventory:worker.sha256,
      localCaptureIndex:local.sha256,
      stagedFigureInventory:staged.sha256,
      staticMediaIndex:media.sha256,
      summaryIndex:summary.sha256,
    },
  }
});
const verification=verifyUnifiedAssetCatalog(catalog,membership);
const report={
  schemaVersion:1,phase:'D1-unified-asset-shadow',ok:true,
  repositoryCommit:sourceCommit,publicationSlot:liveBefore.publicationSlot,
  deploymentSourceCommit:liveBefore.sourceCommit,datasetSha256,productionCards:membership.length,
  architectureCatalogId:String(liveBefore.architectureCatalogId||''),
  productionActivation:false,dispatchEnabled:false,writeSideEffects:false,
  crossSourceAtomic:false,
  note:'Dynamic media/capture sources are individually snapshotted and hashed but are not a cross-system transaction. Unknown completeness is preserved as unknown.',
  sourceBytes:{
    workerInventory:worker.bytes,localCaptureIndex:local.bytes,stagedFigureInventory:staged.bytes,
    staticMediaIndex:media.bytes,summaryIndex:summary.bytes,
  },
  ...verification,
};
const temp=OUTPUT+'.tmp-'+process.pid+'-'+Date.now();
await rm(temp,{recursive:true,force:true});await mkdir(temp,{recursive:true});
await writeFile(path.join(temp,'catalog.json'),pretty(catalog),{flag:'wx'});
await writeFile(path.join(temp,'report.json'),pretty(report),{flag:'wx'});
const reloaded=JSON.parse(await readFile(path.join(temp,'catalog.json'),'utf8'));
verifyUnifiedAssetCatalog(reloaded,membership);
await mkdir(path.dirname(OUTPUT),{recursive:true});await rename(temp,OUTPUT);
console.log('GALLERY_ASSET_SHADOW '+JSON.stringify(report));
