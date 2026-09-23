import {readFile,writeFile,mkdir,mkdtemp,rm,appendFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readPapers} from './merge-reviewed-toc.mjs';
import {sha256,requireBody,snapshotRows,scopedHolds,checkNewBodyIdentity,checkRoleReport,conflictKeys,verifyNewBodyBytes} from './new-body-auto-validation.mjs';
const run=promisify(execFile),SITE='https://zhou526316-sys.github.io/organic-synthesis-gallery/';
const STAGE='local-captures/article-figures/stage-index.json',REPORTS='local-captures/tampermonkey/report-index.json';
async function fetchBytes(url,limit,headers={},allow404=false){
 const r=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(20000)});
 if(allow404&&r.status===404)return null;
 requireBody(r.ok,'read_http_'+r.status);
 const reader=r.body.getReader(),chunks=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;requireBody(size<=limit,'read_limit_exceeded');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 return Buffer.concat(chunks);
}
async function r2(key){
 requireBody(/^(?:local-captures\/article-figures\/(?:stage-index\.json|images\/[a-f0-9]{24}\/(?:figure|scheme|chart)-\d+-[a-f0-9]{16}\.(?:svg|png))|local-captures\/tampermonkey\/(?:report-index\.json|reports\/[a-f0-9]{28}\/[a-z0-9-]+\.json))$/.test(key),'r2_read_key_forbidden');
 const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
 requireBody(/^[a-f0-9]{32}$/.test(account||'')&&Boolean(token),'r2_read_credentials_missing');
 return fetchBytes('https://api.cloudflare.com/client/v4/accounts/'+account+'/r2/buckets/organic-synthesis-gallery-media/objects/'+key,10000000,{Authorization:'Bearer '+token});
}
async function siteJson(name,optional=false){const b=await fetchBytes(SITE+name+'?auto='+Date.now(),12000000,{'cache-control':'no-cache'},optional);return b===null?null:JSON.parse(b);}
function filePath(row){return 'media-mirror/auto-body-'+row.sha256+(row.contentType==='image/png'?'.png':'.svg');}
function identity(row){return row.doi+'|'+row.id;}
function existingFigure(media,row){return media.items?.[row.doi]?.figures?.figures?.find(f=>f.id===row.id);}
async function decode(root,bytes,row){const tmp=await mkdtemp(path.join(tmpdir(),'body-byte-'));try{const f=path.join(tmp,'image');await writeFile(f,bytes);const {stdout}=await run('python3',[path.join(root,'scripts/decode-new-body-image.py'),f,row.contentType],{timeout:15000,maxBuffer:100000});const result=JSON.parse(stdout);requireBody(result.decoded===true,'image_not_decoded');return result;}finally{await rm(tmp,{recursive:true,force:true});}}
export async function loadNewBodyContext(root=process.cwd(),io={}){
 const policy=JSON.parse(await readFile(path.join(root,'shared/new-body-auto-policy.json'),'utf8'));
 const state=JSON.parse(await readFile(path.join(root,'audit/literature-update-state.json'),'utf8'));
 const corpus=await readPapers(root),held=scopedHolds(state,policy);
 const read=io.r2||r2,publicRead=io.siteJson||siteJson;
 const [stageRaw,reportsRaw,live,previous]=await Promise.all([read(STAGE),read(REPORTS),publicRead('media-index.json'),publicRead('new-body-auto-ledger.json',true)]);
 const rows=snapshotRows(JSON.parse(stageRaw)),reportRows=snapshotRows(JSON.parse(reportsRaw));
 requireBody(rows.length>0&&rows.length<10000&&Object.keys(live.items||{}).length>0,'empty_or_incomplete_snapshot');
 if(previous)requireBody(previous.schemaVersion===1&&previous.policyRevision===policy.revision&&Array.isArray(previous.items)&&previous.items.length<10000,'previous_auto_ledger_invalid');
 const conflicts=conflictKeys(rows,live),eligible=[],blocked=[];
 for(const row of rows){
  if(existingFigure(live,row))continue;
  try{await checkNewBodyIdentity(row,policy,corpus,held);requireBody(!conflicts.has(identity(row)),'cross_asset_conflict');eligible.push(row);}
  catch(e){if(row.reviewMarker)blocked.push({doi:row.doi,id:row.id,reason:e.message});}
 }
 eligible.sort((a,b)=>String(corpus.get(b.doi)?.date||'').localeCompare(String(corpus.get(a.doi)?.date||''))||Number(!a.doi.startsWith('10.1021/jacs.'))-Number(!b.doi.startsWith('10.1021/jacs.'))||a.doi.localeCompare(b.doi)||a.sortOrder-b.sortOrder);
 const inputFingerprint=sha256(Buffer.from(JSON.stringify({policy,corpus:[...corpus.keys()].sort(),held:[...held].sort(),eligible:eligible.map(r=>[identity(r),r.reviewMarker.evidenceSha256]),reports:sha256(reportsRaw),published:live.generatedAt})));
 const priorStatus=await publicRead('new-body-auto-status.json',true);
 return {root,policy,corpus,held,read,publicRead,rows,reportRows,live,previous,conflicts,eligible,blocked,inputFingerprint,changed:policy.enabled&&eligible.length>0&&priorStatus?.inputFingerprint!==inputFingerprint,io};
}
export async function mergeNewBodyAuto(context){
 const {root,policy,corpus,held,read,previous,conflicts,eligible,inputFingerprint,reportRows,io}=context;
 const mediaFile=path.join(root,'public/media-index.json'),media=JSON.parse(await readFile(mediaFile,'utf8'));media.items||={};
 const beforeToc=JSON.stringify(Object.fromEntries(Object.entries(media.items).map(([d,r])=>[d,r.toc]))),originalDois=Object.keys(media.items);
 const summary={schemaVersion:1,policyRevision:policy.revision,generatedAt:Date.now(),inputFingerprint,mode:policy.enabled?'bounded_new_body_auto':'disabled',added:[],carried:[],held:context.blocked.slice(0,200),checkedNewFiles:0,readOnlyR2:true,stagingWrites:0,stagingDeletes:0,semanticReview:'not_performed_by_machine',maxNewFigures:policy.maxNewFigures,maxNewPapers:policy.maxNewPapers};
 const ledger={schemaVersion:1,policyRevision:policy.revision,generatedAt:summary.generatedAt,items:[]};
 const prepared=[],paperSet=new Set(),reportsByDoi=new Map(),loadReports=async doi=>{
  if(reportsByDoi.has(doi))return reportsByDoi.get(doi);
  const index=reportRows.find(r=>r.doi===doi),keys=[...new Set((index?.attempts||[index]).filter(Boolean).map(a=>a.reportKey).filter(Boolean))].slice(0,4),reports=[];
  for(const key of keys)try{reports.push({key,report:JSON.parse(await read(key))});}catch{}
  reportsByDoi.set(doi,reports);return reports;
 };
 // Reuse only previously machine-validated exact copies; never import old arbitrary media.
 for(const old of previous?.items||[]){
  const row=old.capture;if(!row||!corpus.has(row.doi)||held.has(row.doi))continue;
  if(existingFigure(media,row))continue;
  try{
   await checkNewBodyIdentity(row,policy,corpus,held);requireBody(old.imageUrl===filePath(row)&&old.validation?.evidenceSha256===row.reviewMarker.evidenceSha256&&old.validation?.policyRevision===policy.revision&&old.validation?.sourceRole==='isolated_figure_caption','prior_auto_proof_invalid');
   requireBody(!conflicts.has(identity(row)),'cross_asset_conflict');
   const bytes=await (io.publicBytes||((p)=>fetchBytes(SITE+p,4000000)))(old.imageUrl);verifyNewBodyBytes(row,bytes);
   prepared.push({row,bytes,entry:old,carried:true});
  }catch(e){throw new Error('previous_published_auto_copy_not_preserved:'+identity(row)+':'+e.message);}
 }
 if(policy.enabled)for(const row of eligible){
  if(summary.checkedNewFiles>=policy.maxNewFigures)break;
  if(existingFigure(media,row)||prepared.some(p=>identity(p.row)===identity(row)))continue;
  if(!paperSet.has(row.doi)&&paperSet.size>=policy.maxNewPapers)continue;
  const count=(media.items[row.doi]?.figures?.figures?.length||0)+prepared.filter(p=>p.row.doi===row.doi).length;
  if(count>=policy.maxFiguresPerCard){summary.held.push({doi:row.doi,id:row.id,reason:'card_display_limit'});continue;}
  paperSet.add(row.doi);summary.checkedNewFiles++;
  try{
   const proof=checkRoleReport(row,await loadReports(row.doi),policy);
   const bytes=await read(row.r2Key);verifyNewBodyBytes(row,bytes);const imageCheck=await (io.decode||((b,r)=>decode(root,b,r)))(bytes,row);
   requireBody(imageCheck.decoded===true,'image_decode_failed');
   // A second full index read prevents using a file whose stored metadata changed mid-check.
   const current=snapshotRows(JSON.parse(await read(STAGE))).find(r=>identity(r)===identity(row));
   requireBody(current?.sha256===row.sha256&&current?.reviewMarker?.evidenceSha256===row.reviewMarker.evidenceSha256,'capture_changed_during_validation');
   const validation={policyRevision:policy.revision,evidenceSha256:row.reviewMarker.evidenceSha256,validatedAt:new Date().toISOString(),decision:'machine_validated',semanticReview:'not_performed',sourceRole:proof.sourceRole,receiptProof:proof,imageCheck};
   const entry={assetKey:row.reviewMarker.assetKey,doi:row.doi,id:row.id,sha256:row.sha256,imageUrl:filePath(row),state:'published',capture:row,validation};
   prepared.push({row,bytes,entry,carried:false});
  }catch(e){summary.held.push({doi:row.doi,id:row.id,reason:e.killed?'decoder_timeout':e.message.slice(0,160)});}
 }
 await mkdir(path.join(root,'public/media-mirror'),{recursive:true});
 for(const {row,bytes,entry,carried} of prepared){
  if(existingFigure(media,row))continue;
  await writeFile(path.join(root,'public',entry.imageUrl),bytes);
  const record=media.items[row.doi]||{doi:row.doi,toc:{available:false,doi:row.doi},figures:{available:false,doi:row.doi,figures:[]}};
  const figure={doi:row.doi,id:row.id,label:row.label,caption:row.caption,articleUrl:row.articleUrl,sourceUrl:row.sourceUrl,imageUrl:entry.imageUrl,order:row.sortOrder,width:row.width,height:row.height,contentType:row.contentType,contentHash:row.contentHash,verifiedSha256:row.sha256,evidenceSha256:row.reviewMarker.evidenceSha256,originalUpdatedAt:row.updatedAt,publicationId:policy.revision,role:'article_figure',source:'machine-validated-new-capture',machineValidation:entry.validation};
  const figures=[...(record.figures?.figures||[]),figure].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
  record.figures={...(record.figures||{}),available:true,doi:row.doi,figures};record.inventory={...(record.inventory||{}),figureCount:figures.length,fullArticleFiguresVerified:false};media.items[row.doi]=record;
  ledger.items.push(entry);summary[carried?'carried':'added'].push({doi:row.doi,id:row.id,sha256:row.sha256,imageUrl:entry.imageUrl});
 }
 requireBody(JSON.stringify(Object.fromEntries(originalDois.map(d=>[d,media.items[d].toc])))===beforeToc,'toc_changed');
 summary.newPapers=[...new Set(summary.added.map(x=>x.doi))];summary.totalAutoFiles=ledger.items.length;summary.totalPublicFigures=Object.values(media.items).reduce((n,r)=>n+(r.figures?.figures?.length||0),0);
 ledger.count=ledger.items.length;media.generatedAt=summary.generatedAt;
 await writeFile(mediaFile,JSON.stringify(media));await writeFile(path.join(root,'public/new-body-auto-ledger.json'),JSON.stringify(ledger));await writeFile(path.join(root,'public/new-body-auto-status.json'),JSON.stringify(summary));
 console.log('NEW_BODY_AUTO '+JSON.stringify(summary));return {summary,ledger,media};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const context=await loadNewBodyContext();
 if(process.argv.includes('--preflight')){if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,'changed='+context.changed+'\n');console.log(JSON.stringify({changed:context.changed,eligible:context.eligible.length,markedHeld:context.blocked.length,inputFingerprint:context.inputFingerprint}));}
 else await mergeNewBodyAuto(context);
}
