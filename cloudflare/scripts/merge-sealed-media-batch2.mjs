import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,copyFile,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeDoi,embeddedDois,readPapers,trueToc} from './merge-reviewed-toc.mjs';
const ID='sealed-media-batch2-20260923',CUTOVER=1790082000000;
const hash=b=>createHash('sha256').update(b).digest('hex');
const demand=(ok,reason)=>{if(!ok)throw new Error(reason);};
export function verifySealedBytes(item,bytes){
 demand(item.approved===true&&['official','figure1'].includes(item.kind),'unapproved_role');
 demand(/^[a-f0-9]{64}$/.test(item.sha256||'')&&hash(bytes)===item.sha256,'sealed_digest_mismatch');
 demand(/^[a-f0-9]{32}$/.test(item.contentHash||'')&&item.sha256.startsWith(item.contentHash),'original_hash_mismatch');
 demand(bytes.length===item.byteLength&&bytes.length>=100&&bytes.length<=4000000,'sealed_size_mismatch');
 demand(item.originalUpdatedAt>0&&item.originalUpdatedAt<CUTOVER,'not_sealed_generation');
 const doi=normalizeDoi(item.doi),page=embeddedDois(item.articleUrl),source=embeddedDois(item.sourceUrl);
 demand(doi&&page.length===1&&page[0]===doi&&!source.some(x=>x!==doi),'sealed_page_source_conflict');
 if(item.roleEvidence.startsWith('dual_doi_')){
  demand(source.length===1&&source[0]===doi,'dual_doi_required');
  demand(item.kind==='official'? /_Figa_HTML\.png$/i.test(item.sourceUrl): /(?:_Fig1_HTML\.png|_0001\.svg)$/i.test(item.sourceUrl),'source_role_conflict');
 }else demand(item.roleEvidence==='wiley_graphical_abstract_receipt'&&item.kind==='official','unsupported_proof_mode');
 if(item.contentType==='image/jpeg'){
  demand(bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217,'invalid_jpeg');return 'jpg';
 }
 if(item.contentType==='image/png'){
  demand(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'invalid_png');return 'png';
 }
 demand(item.contentType==='image/svg+xml','unsupported_image_type');
 const s=bytes.toString('utf8');demand(/<svg[\s>]/i.test(s)&&! /<!DOCTYPE|<!ENTITY|<(?:script|foreignObject|iframe|object|embed|animate|set)\b|\son[a-z]+\s*=/i.test(s),'unsafe_svg');
 for(const m of s.matchAll(/(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi))demand(m[2].startsWith('#')||/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(m[2]),'external_svg_reference');
 demand(!/url\(\s*["']?\s*(?:https?:|\/\/|data:)/i.test(s),'external_svg_css');return 'svg';
}
export function verifyHistoricalReceipt(item,raw){
 demand(hash(raw)===item.proofSha256,'proof_hash_mismatch');
 const r=JSON.parse(raw),t=r.trace||[];
 demand(r.doi===item.doi&&r.articleUrl===item.articleUrl&&r.sourceUrl===item.sourceUrl,'receipt_identity_mismatch');
 demand(r.status==='success'&&r.candidateKind==='official'&&r.assetType==='graphical_abstract','receipt_role_mismatch');
 demand(/^https:\/\/onlinelibrary\.wiley\.com\/cms\/asset\/[0-9a-f-]+\/anie\d+-gra-0001-m\.jpg$/i.test(item.sourceUrl),'unreviewed_wiley_asset');
 demand(r.updatedAt>0&&r.updatedAt<CUTOVER,'receipt_not_historical');
 demand(t.some(e=>e.stage==='job'&&e.event==='start'&&e.url===item.articleUrl&&/^v6\.2\.(?:[0-9]|1[0-5]);/.test(e.message||'')),'pre_incident_capture_required');
 demand(t.some(e=>e.stage==='page'&&e.url===item.articleUrl&&/doiMatch=true/.test(e.message||'')),'page_identity_evidence_missing');
 demand(t.some(e=>e.stage==='candidate_discovery'&&e.event==='candidate'&&e.status==='official'&&e.url===item.sourceUrl&&e.message==='graphical_abstract'),'exact_role_evidence_missing');
 demand(t.some(e=>e.stage==='r2_upload'&&e.event==='start'&&e.url===item.sourceUrl&&e.byteLength===item.byteLength),'source_upload_evidence_missing');
 demand(t.some(e=>e.stage==='r2_upload'&&e.event==='complete'&&e.status==='ok'&&e.byteLength===item.byteLength&&new URL(e.url).pathname==='/media/'+item.originalR2Key),'exact_stored_object_receipt_missing');
 return true;
}
async function existingFile(root,url){
 if(typeof url!=='string'||!/^media-mirror\/[A-Za-z0-9._-]+$/.test(url))return false;
 try{await access(path.join(root,'public',url));return true;}catch{return false;}
}
export async function mergeSealedMediaBatch2(root=process.cwd()){
 const p=path.join(root,'audit/media-recovery/batch2/manifest.json'),plan=JSON.parse(await readFile(p,'utf8'));
 demand(plan.recoveryId===ID&&plan.cutoverMs===CUTOVER&&plan.approvedCount===plan.items.length&&plan.items.length===20,'invalid_sealed_manifest');
 const papers=await readPapers(root),manifestPath=path.join(root,'public/media-index.json'),media=JSON.parse(await readFile(manifestPath,'utf8'));media.items||={};
 const prepared=[],seen=new Set(),hashOwners=new Map();
 for(const item of plan.items){
  demand(!seen.has(item.doi),'duplicate_sealed_doi');seen.add(item.doi);
  demand(/^audit\/media-recovery\/batch2\/assets\/[a-f0-9]{64}\.(jpg|png|svg)$/.test(item.assetPath),'invalid_asset_path');
  const bytes=await readFile(path.join(root,item.assetPath));const ext=verifySealedBytes(item,bytes);
  demand(!hashOwners.has(item.sha256)||hashOwners.get(item.sha256)===item.doi,'cross_doi_duplicate_bytes');hashOwners.set(item.sha256,item.doi);
  if(item.roleEvidence==='wiley_graphical_abstract_receipt'){
   demand(/^audit\/media-recovery\/batch2\/proofs\/[a-f0-9]{64}\.json$/.test(item.proofPath),'invalid_proof_path');verifyHistoricalReceipt(item,await readFile(path.join(root,item.proofPath)));
  }
  prepared.push({item,ext});
 }
 const result={recoveryId:ID,generatedAt:Date.now(),approved:prepared.length,restoredOfficial:0,restoredFigure1:0,alreadyAvailable:[],notPublished:[],restored:[],quarantineUnchanged:true,productionLiteratureWrites:0};
 await mkdir(path.join(root,'public/media-mirror'),{recursive:true});
 for(const {item,ext} of prepared){
  const doi=item.doi;if(!papers.has(doi)){result.notPublished.push(doi);continue;}
  const record=media.items[doi]||{doi,toc:{available:false,doi},figures:{available:false,doi,figures:[]}};
  const priorFigures=record.figures?.figures||[];
  if(item.kind==='official'&&trueToc(record.toc)&&await existingFile(root,record.toc.imageUrl)){result.alreadyAvailable.push(doi);continue;}
  if(item.kind==='figure1'&&await existingFile(root,priorFigures.find(f=>f.id==='figure-1'||/^Figure 1$/i.test(f.label||''))?.imageUrl)){result.alreadyAvailable.push(doi);continue;}
  const imageUrl='media-mirror/sealed-'+item.sha256+'.'+ext;
  await copyFile(path.join(root,item.assetPath),path.join(root,'public',imageUrl));
  const data={doi,articleUrl:item.articleUrl,sourceUrl:item.sourceUrl,imageUrl,contentHash:item.contentHash,verifiedSha256:item.sha256,recoveryId:ID,sourceRepository:'Reviewed sealed media',source:'verified-sealed-capture',originalUpdatedAt:item.originalUpdatedAt,cacheHit:true,cacheState:'hit'};
  if(item.kind==='official'){
   record.toc={...data,available:true,reason:'reviewed_official_toc_recovery'};result.restoredOfficial++;
  }else{
   const figure={...data,id:'figure-1',label:'Figure 1',caption:item.caption,captionSource:'reviewed-description',order:0};
   const figures=[figure,...priorFigures.filter(f=>f.id!=='figure-1'&&!/^Figure 1$/i.test(f.label||''))];
   record.figures={...(record.figures||{}),available:true,doi,articleUrl:item.articleUrl,figures};
   if(!trueToc(record.toc))record.toc={...data,available:true,reason:'reviewed_figure1_fallback'};
   result.restoredFigure1++;
  }
  const hasToc=trueToc(record.toc),count=record.figures?.figures?.length||0;
  record.inventory={...(record.inventory||{}),status:hasToc?(count?'complete':'large_only'):(count?'figures_only':'missing'),largeSource:hasToc?'toc':count?'figure1':'none',figureCount:count,tocStored:hasToc,tocMissing:!hasToc,fullArticleFiguresVerified:false};
  media.items[doi]=record;result.restored.push({doi,kind:item.kind,imageUrl,sha256:item.sha256,journal:papers.get(doi).journal,title:papers.get(doi).title});
 }
 media.generatedAt=Date.now();result.totalOfficialToc=Object.values(media.items).filter(r=>trueToc(r.toc)).length;result.retainedBatch1=Object.values(media.items).filter(r=>r.toc?.recoveryId==='toc-batch1-20260922').length;
 await writeFile(manifestPath,JSON.stringify(media));await writeFile(path.join(root,'public/sealed-media-recovery-status.json'),JSON.stringify(result));
 console.log('SEALED_MEDIA_RECOVERY '+JSON.stringify(result));return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await mergeSealedMediaBatch2();
