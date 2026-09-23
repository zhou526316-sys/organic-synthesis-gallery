import {createHash} from 'node:crypto';
import {buildBodyReviewMarker} from '../worker/src/body-review-marker.js';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeDoi,embeddedDois,readPapers,trueToc} from './merge-reviewed-toc.mjs';

const ID='reviewed-body-batch1-20260923',CUTOVER=1790082000000;
const hash=b=>createHash('sha256').update(b).digest('hex');
function demand(ok,reason){if(!ok)throw new Error(reason);}
export function figureId(value){
 const m=String(value||'').trim().match(/^(figure|fig\.?|scheme|chart)[ -]*(\d{1,3})$/i);
 return m?`${/^fig/i.test(m[1])?'figure':m[1].toLowerCase()}-${Number(m[2])}`:'';
}
export function verifyReviewedBody(item,bytes){
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
async function usableExisting(root,figure){
 const url=figure?.imageUrl;
 if(typeof url!=='string'||!/^media-mirror\/[A-Za-z0-9._-]+$/.test(url))return false;
 try{
  const b=await readFile(path.join(root,'public',url));if(b.length<100)return false;
  const s=b.subarray(0,1024).toString('utf8');
  return /<svg[\s>]/i.test(s)||b[0]===137&&b[1]===80||b[0]===255&&b[1]===216||b.toString('ascii',0,4)==='RIFF'||b.toString('ascii',0,3)==='GIF';
 }catch{return false;}
}
export async function mergeReviewedBody(root=process.cwd(), release=null){
 const ID=release?.publicationId || 'reviewed-body-batch1-20260923';
 const count=release?.approvedCount || 32;
 const manifestPath=release?.manifestPath || 'audit/media-recovery/body-batch1/manifest.json';
 const statusFile=release?.statusFile || 'body-publication-status.json';
 demand(/^reviewed-body-batch[0-9]+-[0-9]{8}$/.test(ID)&&Number.isInteger(count)&&count>0&&count<=100,'invalid_body_release');
 demand(/^audit\/media-recovery\/body-batch[0-9]+\/manifest\.json$/.test(manifestPath)&&/^body-publication(?:-[a-z0-9-]+)?-status\.json$/.test(statusFile),'invalid_body_release_path');
 const plan=JSON.parse(await readFile(path.join(root,manifestPath),'utf8'));
 demand(plan.publicationId===ID&&plan.cutoverMs===CUTOVER&&plan.approvedCount===count&&plan.items.length===count,'invalid_body_review_plan');
 const papers=await readPapers(root),mediaPath=path.join(root,'public/media-index.json'),media=JSON.parse(await readFile(mediaPath,'utf8'));media.items||={};
 const tocBefore=JSON.stringify(Object.fromEntries(Object.entries(media.items).map(([d,r])=>[d,r.toc])));
 const seen=new Set(),hashOwners=new Map(),sources=new Map(),prepared=[];
 for(const item of plan.items){
  const key=item.doi+'|'+item.id;demand(!seen.has(key),'duplicate_body_identity');seen.add(key);
  demand(/^audit\/media-recovery\/body-batch[0-9]+\/assets\/[a-f0-9]{64}\.(svg|png|webp)$/.test(item.assetPath),'invalid_body_asset_path');
  const bytes=await readFile(path.join(root,item.assetPath));const ext=verifyReviewedBody(item,bytes);
  demand(!hashOwners.has(item.sha256)||hashOwners.get(item.sha256)===item.doi,'cross_doi_duplicate_body');hashOwners.set(item.sha256,item.doi);
  demand(!sources.has(item.sourceUrl)||sources.get(item.sourceUrl)===key,'shared_source_under_other_label');sources.set(item.sourceUrl,key);
  prepared.push({item,ext});
 }
 const result={publicationId:ID,generatedAt:Date.now(),reviewed:prepared.length,added:[],retainedExisting:[],notPublished:[],perDoi:[],stagingWrites:0,stagingDeletes:0,quarantineUnchanged:true,completeArticleInventoryVerified:false};
 await mkdir(path.join(root,'public/media-mirror'),{recursive:true});
 for(const {item,ext} of prepared){
  const doi=item.doi;if(!papers.has(doi)){result.notPublished.push({doi,id:item.id});continue;}
  const record=media.items[doi]||{doi,toc:{available:false,doi},figures:{available:false,doi,figures:[]}};
  const before=record.figures?.figures||[];
  const old=before.find(f=>figureId(f.id)===item.id||figureId(f.label)===item.id);
  if(old&&await usableExisting(root,old)){
   result.retainedExisting.push({doi,id:item.id,imageUrl:old.imageUrl,reason:'existing_published_figure_preserved'});continue;
  }
  const imageUrl=`media-mirror/body-reviewed-${item.sha256}.${ext}`;
  await copyFile(path.join(root,item.assetPath),path.join(root,'public',imageUrl));
  const reviewMarker=await buildBodyReviewMarker(item,item.sha256);
  const figure={reviewEvidenceKey:reviewMarker.evidenceKey,id:item.id,label:item.label,caption:item.caption,doi,articleUrl:item.articleUrl,sourceUrl:item.sourceUrl,imageUrl,
   order:item.order,width:item.width,height:item.height,contentType:item.contentType,contentHash:item.contentHash,verifiedSha256:item.sha256,
   publicationId:ID,originalUpdatedAt:item.originalUpdatedAt,quality:item.quality,role:'article_figure',source:'reviewed-bound-staged-capture'};
  const figures=[...before.filter(f=>f!==old),figure].sort((a,b)=>Number(a.order||0)-Number(b.order||0)||String(a.id).localeCompare(String(b.id),'en',{numeric:true}));
  record.figures={...(record.figures||{}),available:true,doi,articleUrl:item.articleUrl,figures};
  const official=trueToc(record.toc);record.inventory={...(record.inventory||{}),status:official?'complete':'figures_only',largeSource:official?'toc':record.toc?.available?'figure1':'figure',figureCount:figures.length,fullArticleFiguresVerified:false};
  media.items[doi]=record;result.added.push({doi,id:item.id,label:item.label,imageUrl,sha256:item.sha256,quality:item.quality});
 }
 const priorDois=Object.keys(JSON.parse(tocBefore));
 demand(JSON.stringify(Object.fromEntries(priorDois.map(d=>[d,media.items[d].toc])))===tocBefore,'toc_was_modified');
 for(const doi of new Set(prepared.map(p=>p.item.doi))){
  if(!papers.has(doi))continue;
  const record=media.items[doi];result.perDoi.push({doi,title:papers.get(doi).title,journal:papers.get(doi).journal,figures:record?.figures?.figures?.length||0,added:result.added.filter(r=>r.doi===doi).length,retainedExisting:result.retainedExisting.filter(r=>r.doi===doi).length});
 }
 result.totalFigureEntries=Object.values(media.items).reduce((n,r)=>n+(r.figures?.figures?.length||0),0);
 result.retainedBatch1=Object.values(media.items).filter(r=>r.toc?.recoveryId==='toc-batch1-20260922').length;
 result.retainedBatch2Official=Object.values(media.items).filter(r=>r.toc?.recoveryId==='sealed-media-batch2-20260923'&&!/fallback/i.test(r.toc?.reason||'')).length;
 media.generatedAt=Date.now();await writeFile(mediaPath,JSON.stringify(media));await writeFile(path.join(root,'public',statusFile),JSON.stringify(result));
 console.log('REVIEWED_BODY_PUBLICATION '+JSON.stringify(result));return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await mergeReviewedBody();
