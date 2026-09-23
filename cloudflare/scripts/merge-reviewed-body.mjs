import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeDoi,embeddedDois,readPapers,trueToc} from './merge-reviewed-toc.mjs';

const LEGACY_ID='reviewed-body-batch1-20260923',CUTOVER=1790082000000,EVIDENCE_SCHEMA='body-capture-evidence-v1';
const hash=b=>createHash('sha256').update(b).digest('hex');
function demand(ok,reason){if(!ok)throw new Error(reason);}
export function figureId(value){
 const m=String(value||'').trim().match(/^(figure|fig\.?|scheme|chart)[ -]*(\d{1,3})$/i);
 return m?`${/^fig/i.test(m[1])?'figure':m[1].toLowerCase()}-${Number(m[2])}`:'';
}
function captureEvidenceFingerprint(item){
 const payload=[EVIDENCE_SCHEMA,String(item.doi||''),String(item.id||''),String(item.label||''),String(item.caption||''),String(item.articleUrl||''),String(item.sourceUrl||''),String(item.pageDoi||''),String(item.jobId||''),String(item.captureVersion||''),Number(item.mediaGeneration||0),String(item.originalR2Key||''),String(item.contentHash||''),String(item.sha256||''),Number(item.byteLength||0),Number(item.width||0),Number(item.height||0),Number(item.order||0)];
 return hash(Buffer.from(JSON.stringify(payload)));
}
export function verifyReviewedBody(item,bytes,{requireEvidenceFingerprint=false}={}){
 const doi=normalizeDoi(item.doi);
 demand(doi&&item.approved===true&&item.role==='article_figure','body_approval_required');
 demand(item.id===figureId(item.label)&&item.id===figureId(item.id),'body_label_identity_mismatch');
 demand(item.captureVersion==='6.2.20'&&item.pageDoi===doi&&/^[a-z0-9-]{16,80}$/i.test(item.jobId||''),'bound_capture_required');
 demand(item.mediaGeneration===CUTOVER&&item.originalUpdatedAt>=CUTOVER,'wrong_media_generation');
 for(const url of [item.articleUrl,item.sourceUrl]){
  const ds=embeddedDois(url);demand(ds.length===1&&ds[0]===doi,'body_source_doi_mismatch');
 }
 demand(/^[a-f0-9]{64}$/.test(item.sha256||'')&&hash(bytes)===item.sha256,'body_digest_mismatch');
 demand(/^[a-f0-9]{32}$/.test(item.contentHash||'')&&item.sha256.startsWith(item.contentHash),'body_stored_hash_mismatch');
 demand(item.byteLength===bytes.length&&bytes.length>=100&&bytes.length<=4000000,'body_size_mismatch');
 demand(item.width>0&&item.height>0&&Number.isInteger(item.order)&&item.order>=0,'body_dimensions_or_order_invalid');
 if(requireEvidenceFingerprint){
  demand(item.evidenceSchema===EVIDENCE_SCHEMA&&/^[a-f0-9]{64}$/.test(item.evidenceFingerprint||''),'body_evidence_fingerprint_required');
  demand(captureEvidenceFingerprint(item)===item.evidenceFingerprint,'body_evidence_fingerprint_mismatch');
  demand(typeof item.semanticReview==='string'&&item.semanticReview.length>=40,'body_semantic_review_required');
 }
 let ext;
 if(item.contentType==='image/png'){
  demand(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'body_not_png');
  demand(bytes.readUInt32BE(16)===item.width&&bytes.readUInt32BE(20)===item.height,'body_png_dimensions_mismatch');ext='png';
 }else if(item.contentType==='image/webp'){
  demand(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'&&bytes.readUInt32LE(4)+8===bytes.length,'body_not_webp');ext='webp';
 }else{
  demand(item.contentType==='image/svg+xml','body_unsupported_type');
  const s=bytes.toString('utf8');
  demand(/<svg[\s>]/i.test(s)&&! /<!DOCTYPE|<!ENTITY|<(?:script|foreignObject|iframe|object|embed|animate|set)\b|\son[a-z]+\s*=/i.test(s),'body_unsafe_svg');
  for(const m of s.matchAll(/(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi))demand(m[2].startsWith('#')||/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(m[2]),'body_external_svg');
  demand(!/@import|url\(\s*["']?\s*(?:https?:|\/\/|data:)/i.test(s),'body_external_svg_css');ext='svg';
 }
 const expected=`local-captures/article-figures/images/${hash(Buffer.from(doi)).slice(0,24)}/${item.id}-${item.sha256.slice(0,16)}.${ext}`;
 demand(item.originalR2Key===expected,'body_object_binding_mismatch');
 if(doi.startsWith('10.1038/')){
  const n=item.id.match(/^figure-(\d+)$/)?.[1];
  demand(n&&new RegExp('_Fig'+n+'_HTML\\.png$','i').test(item.sourceUrl),'nature_figure_number_mismatch');
 }
 return ext;
}
async function readJson(file){return JSON.parse(await readFile(file,'utf8'));}
async function loadPlans(root){
 const plans=[];
 const legacyPath=path.join(root,'audit/media-recovery/body-batch1/manifest.json');
 const legacy=await readJson(legacyPath);
 demand(legacy.publicationId===LEGACY_ID&&legacy.cutoverMs===CUTOVER&&legacy.approvedCount===32&&legacy.items.length===32,'invalid_legacy_body_review_plan');
 plans.push({plan:legacy,manifestPath:legacyPath,assetPrefix:'audit/media-recovery/body-batch1/assets/',requireEvidenceFingerprint:false});
 const dir=path.join(root,'audit/media-recovery/body-batches');
 let entries=[];try{entries=await readdir(dir,{withFileTypes:true});}catch(error){if(error?.code!=='ENOENT')throw error;}
 for(const entry of entries.filter(e=>e.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))){
  const manifestPath=path.join(dir,entry.name,'manifest.json');
  let plan;try{plan=await readJson(manifestPath);}catch(error){if(error?.code==='ENOENT')continue;throw error;}
  demand(plan.batchId===entry.name&&/^body-batch\d+-[A-Za-z0-9-]+$/.test(plan.batchId),'invalid_body_batch_id');
  demand(/^reviewed-body-batch\d+-[A-Za-z0-9-]+$/.test(plan.publicationId||'')&&plan.publicationId!==LEGACY_ID,'invalid_body_publication_id');
  demand(plan.cutoverMs===CUTOVER&&plan.semanticApproval===true&&plan.captureEvidenceSchema===EVIDENCE_SCHEMA,'invalid_body_review_plan_contract');
  demand(Number.isInteger(plan.approvedCount)&&plan.approvedCount>=1&&plan.approvedCount<=30&&plan.items?.length===plan.approvedCount,'invalid_body_review_plan_count');
  demand(plan.completeArticleInventoryVerified===false,'body_batch_must_not_claim_complete_inventory');
  plans.push({plan,manifestPath,assetPrefix:`audit/media-recovery/body-batches/${entry.name}/assets/`,requireEvidenceFingerprint:true});
 }
 demand(new Set(plans.map(x=>x.plan.publicationId)).size===plans.length,'duplicate_body_publication_id');
 return plans;
}
async function usableExisting(root,figure){
 const url=figure?.imageUrl;
 if(typeof url!=='string'||!/^media-mirror\/[A-Za-z0-9._-]+$/.test(url))return false;
 try{
  const b=await readFile(path.join(root,'public',url));if(b.length<100)return false;
  const s=b.subarray(0,1024).toString('utf8');
  return /<svg[\s>]/i.test(s)||b[0]===137&&b[1]===80||b[0]===255&&b[1]===216||b.toString('ascii',0,4)==='RIFF'||b.toString('ascii',0,3)==='GIF';
 }catch{return false;}
}
export async function mergeReviewedBody(root=process.cwd()){
 const planEntries=await loadPlans(root);
 const papers=await readPapers(root),mediaPath=path.join(root,'public/media-index.json'),media=JSON.parse(await readFile(mediaPath,'utf8'));media.items||={};
 const tocBefore=JSON.stringify(Object.fromEntries(Object.entries(media.items).map(([d,r])=>[d,r.toc])));
 const seen=new Set(),hashOwners=new Map(),sources=new Map(),prepared=[];
 for(const meta of planEntries){
  for(const item of meta.plan.items){
   const doi=normalizeDoi(item.doi),key=doi+'|'+item.id;
   demand(!seen.has(key),'duplicate_body_identity_across_batches');seen.add(key);
   const escaped=meta.assetPrefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   demand(new RegExp('^'+escaped+'[a-f0-9]{64}\\.(svg|png|webp)$').test(item.assetPath),'invalid_body_asset_path');
   const bytes=await readFile(path.join(root,item.assetPath));const ext=verifyReviewedBody(item,bytes,{requireEvidenceFingerprint:meta.requireEvidenceFingerprint});
   demand(!hashOwners.has(item.sha256)||hashOwners.get(item.sha256)===doi,'cross_doi_duplicate_body');hashOwners.set(item.sha256,doi);
   demand(!sources.has(item.sourceUrl)||sources.get(item.sourceUrl)===key,'shared_source_under_other_label');sources.set(item.sourceUrl,key);
   prepared.push({item,ext,publicationId:meta.plan.publicationId,batchId:meta.plan.batchId||'body-batch1',legacy:meta.plan.publicationId===LEGACY_ID});
  }
 }
 const batchMap=new Map(planEntries.map(meta=>[meta.plan.publicationId,{batchId:meta.plan.batchId||'body-batch1',publicationId:meta.plan.publicationId,approved:meta.plan.approvedCount,added:[],retainedExisting:[],notPublished:[],perDoi:[],sourceEvidenceArtifactId:meta.plan.sourceEvidenceArtifactId||null,sourceEvidenceArchiveSha256:meta.plan.sourceEvidenceArchiveSha256||null,completeArticleInventoryVerified:false}]));
 await mkdir(path.join(root,'public/media-mirror'),{recursive:true});
 for(const {item,ext,publicationId} of prepared){
  const doi=normalizeDoi(item.doi),batch=batchMap.get(publicationId);
  if(!papers.has(doi)){batch.notPublished.push({doi,id:item.id});continue;}
  const record=media.items[doi]||{doi,toc:{available:false,doi},figures:{available:false,doi,figures:[]}};
  const before=record.figures?.figures||[];
  const old=before.find(f=>figureId(f.id)===item.id||figureId(f.label)===item.id);
  if(old&&await usableExisting(root,old)){
   batch.retainedExisting.push({doi,id:item.id,imageUrl:old.imageUrl,reason:'existing_published_figure_preserved',existingSha256:old.verifiedSha256||null});continue;
  }
  const imageUrl=`media-mirror/body-reviewed-${item.sha256}.${ext}`;
  await copyFile(path.join(root,item.assetPath),path.join(root,'public',imageUrl));
  const figure={id:item.id,label:item.label,caption:item.caption,doi,articleUrl:item.articleUrl,sourceUrl:item.sourceUrl,imageUrl,
   order:item.order,width:item.width,height:item.height,contentType:item.contentType,contentHash:item.contentHash,verifiedSha256:item.sha256,
   publicationId,originalUpdatedAt:item.originalUpdatedAt,quality:item.quality,role:'article_figure',source:'reviewed-bound-staged-capture',
   ...(item.evidenceFingerprint?{evidenceFingerprint:item.evidenceFingerprint,evidenceSchema:item.evidenceSchema}:{}),
  };
  const figures=[...before.filter(f=>f!==old),figure].sort((a,b)=>Number(a.order||0)-Number(b.order||0)||String(a.id).localeCompare(String(b.id),'en',{numeric:true}));
  record.figures={...(record.figures||{}),available:true,doi,articleUrl:item.articleUrl,figures};
  const official=trueToc(record.toc);record.inventory={...(record.inventory||{}),status:official?'complete':'figures_only',largeSource:official?'toc':record.toc?.available?'figure1':'figure',figureCount:figures.length,fullArticleFiguresVerified:false};
  media.items[doi]=record;batch.added.push({doi,id:item.id,label:item.label,imageUrl,sha256:item.sha256,quality:item.quality,evidenceFingerprint:item.evidenceFingerprint||null});
 }
 const priorDois=Object.keys(JSON.parse(tocBefore));
 demand(JSON.stringify(Object.fromEntries(priorDois.map(d=>[d,media.items[d].toc])))===tocBefore,'toc_was_modified');
 for(const batch of batchMap.values()){
  const dois=[...new Set(prepared.filter(x=>x.publicationId===batch.publicationId).map(x=>normalizeDoi(x.item.doi)))];
  for(const doi of dois){
   if(!papers.has(doi))continue;
   const record=media.items[doi];batch.perDoi.push({doi,title:papers.get(doi).title,journal:papers.get(doi).journal,figures:record?.figures?.figures?.length||0,added:batch.added.filter(r=>r.doi===doi).length,retainedExisting:batch.retainedExisting.filter(r=>r.doi===doi).length});
  }
 }
 const batches=[...batchMap.values()];
 const legacy=batches.find(b=>b.publicationId===LEGACY_ID);demand(legacy,'legacy_body_batch_missing');
 const common={generatedAt:Date.now(),stagingWrites:0,stagingDeletes:0,quarantineUnchanged:true,completeArticleInventoryVerified:false,totalFigureEntries:Object.values(media.items).reduce((n,r)=>n+(r.figures?.figures?.length||0),0),retainedBatch1:Object.values(media.items).filter(r=>r.toc?.recoveryId==='toc-batch1-20260922').length,retainedBatch2Official:Object.values(media.items).filter(r=>r.toc?.recoveryId==='sealed-media-batch2-20260923'&&!/fallback/i.test(r.toc?.reason||'')).length};
 const result={publicationId:LEGACY_ID,reviewed:legacy.approved,added:legacy.added,retainedExisting:legacy.retainedExisting,notPublished:legacy.notPublished,perDoi:legacy.perDoi,...common,batchCount:batches.length,latestPublicationId:batches.at(-1)?.publicationId||LEGACY_ID};
 const index={version:2,cutoverMs:CUTOVER,...common,batches,totals:{approved:batches.reduce((n,b)=>n+b.approved,0),added:batches.reduce((n,b)=>n+b.added.length,0),retainedExisting:batches.reduce((n,b)=>n+b.retainedExisting.length,0),notPublished:batches.reduce((n,b)=>n+b.notPublished.length,0)}};
 media.generatedAt=common.generatedAt;await writeFile(mediaPath,JSON.stringify(media));await writeFile(path.join(root,'public/body-publication-status.json'),JSON.stringify(result));await writeFile(path.join(root,'public/body-publication-index.json'),JSON.stringify(index));
 console.log('REVIEWED_BODY_PUBLICATION '+JSON.stringify({publicationId:result.publicationId,batchCount:result.batchCount,latestPublicationId:result.latestPublicationId,totals:index.totals,totalFigureEntries:result.totalFigureEntries,stagingWrites:0,stagingDeletes:0}));return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await mergeReviewedBody();
