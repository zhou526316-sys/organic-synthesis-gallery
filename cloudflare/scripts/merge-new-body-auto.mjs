import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readPapers} from './merge-reviewed-toc.mjs';
import {POLICY_ID,sha256,requireBody,exactKey,evidenceKey,validateNewBodyMetadata,validateNewBodyBytes,conflictKeys,createImageDecoder} from './new-body-auto-validation.mjs';
export const SITE='https://zhou526316-sys.github.io/organic-synthesis-gallery/';
export const WORKER='https://organic-synthesis-gallery.zhou526316.workers.dev';
const SNAPSHOT='auto-body-publication.json';
export async function fetchStored(url,maxBytes=20000000,missing=false){
  const u=new URL(url,SITE),site=new URL(SITE);
  const permitted=u.origin===site.origin&&(u.pathname===site.pathname+SNAPSHOT||u.pathname===site.pathname+'media-index.json'||new RegExp('^'+site.pathname+'media-mirror/body-auto-[a-f0-9]{64}\\.(svg|png|webp)$').test(u.pathname))||u.origin===WORKER&&(u.pathname==='/api/article-figures/staged'||/^\/media\/local-captures\/article-figures\/images\/[a-f0-9]{24}\/(figure|scheme|chart)-\d{1,3}-[a-f0-9]{16}\.(svg|png|webp)$/.test(u.pathname));
  requireBody(permitted&&!u.username&&!u.password,'auto_fetch_not_stored_asset');
  const response=await fetch(u,{headers:{'cache-control':'no-cache'},redirect:'error',credentials:'omit',signal:AbortSignal.timeout(20000)});
  if(missing&&response.status===404)return null;
  requireBody(response.ok,'auto_read_http_'+response.status);
  const reader=response.body.getReader();let size=0;const parts=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;requireBody(size<=maxBytes,'auto_read_size_limit');parts.push(Buffer.from(value));}}finally{reader.releaseLock();}
  return Buffer.concat(parts);
}
async function configuration(root){
  const policy=JSON.parse(await readFile(path.join(root,'audit/media-auto-policy.json'),'utf8'));
  requireBody(policy.schemaVersion===1&&policy.policyId===POLICY_ID&&policy.maxNewImages<=30&&policy.maxNewArticles<=5&&policy.maxFiguresPerCard<=10,'auto_invalid_configuration');
  const state=JSON.parse(await readFile(path.join(root,'audit/literature-update-state.json'),'utf8'));
  const holds=new Set([...(policy.heldDois||[]),...(state.pendingScopeReviewBacklog||[])].map(x=>x.doi));
  return {policy,holds,papers:await readPapers(root)};
}
export async function readLiveInputs(){
  const [priorBytes,mediaBytes]=await Promise.all([fetchStored(SNAPSHOT,20000000,true),fetchStored('media-index.json')]);
  const live=JSON.parse(mediaBytes),previous=priorBytes?JSON.parse(priorBytes):{policyId:POLICY_ID,items:[],attempts:{}};
  requireBody(previous.policyId===POLICY_ID&&Array.isArray(previous.items)&&previous.items.length<=2000&&(!priorBytes||previous.count===previous.items.length),'auto_previous_snapshot_invalid');
  requireBody(new Set(previous.items.map(x=>x.record.doi+'|'+x.record.id)).size===previous.items.length,'auto_previous_duplicate_identity');
  if(!priorBytes)requireBody(!Object.values(live.items||{}).some(x=>x.figures?.figures?.some(f=>f.publicationId===POLICY_ID)),'auto_previous_snapshot_missing');
  let stage=null,stageError=null;
  try{stage=JSON.parse(await fetchStored(WORKER+'/api/article-figures/staged'));requireBody(Array.isArray(stage.items)&&stage.count===stage.items.length&&stage.count<=2000,'auto_stage_truncated_or_invalid');}
  catch(e){stageError=String(e.message);stage=null;}
  return {previous,live,stage,stageError};
}
function alreadyIn(media,row){return (media.items?.[row.doi]?.figures?.figures||[]).some(f=>f.id===row.id);}
function heldAttempts(previous,row,now){const a=previous.attempts?.[exactKey(row)];return a?.evidenceSha256===evidenceKey(row)&&(!a.retryAfter||a.retryAfter>now);}
export async function pendingNewRows({root=process.cwd(),inputs,now=Date.now()}){
  const cfg=await configuration(root),{policy,holds,papers}=cfg;
  if(!policy.enabled||!inputs.stage)return {...cfg,rows:[]};
  const oldKeys=new Set(inputs.previous.items.map(x=>exactKey(x.record)));
  const rows=[];
  for(const row of inputs.stage.items){
    if(oldKeys.has(exactKey(row))||!papers.has(row.doi)||holds.has(row.doi)||alreadyIn(inputs.live,row)||heldAttempts(inputs.previous,row,now))continue;
    try{await validateNewBodyMetadata(row,policy,now);rows.push(row);}catch{}
  }
  rows.sort((a,b)=>String(papers.get(b.doi)?.date||'').localeCompare(String(papers.get(a.doi)?.date||''))||Number(!a.doi.startsWith('10.1021/jacs.'))-Number(!b.doi.startsWith('10.1021/jacs.'))||b.updatedAt-a.updatedAt);
  return {...cfg,rows};
}
export async function mergeNewBodyAuto(root=process.cwd(),options={}){
  const now=options.now||Date.now(),inputs=options.inputs||await readLiveInputs();
  const {policy,holds,papers,rows}=await pendingNewRows({root,inputs,now});
  const mediaPath=path.join(root,'public/media-index.json'),media=JSON.parse(await readFile(mediaPath,'utf8'));media.items||={};
  const beforeToc=JSON.stringify(Object.fromEntries(Object.entries(media.items).map(([d,r])=>[d,r.toc]))),originalDois=Object.keys(media.items);
  const decoder=options.decoder||await createImageDecoder();
  const getNew=options.getNew||((row)=>fetchStored(WORKER+'/media/'+row.r2Key,4000000));
  const getOld=options.getOld||((old)=>fetchStored(old.imageUrl,4000000));
  const attempts={...(inputs.previous.attempts||{})},prepared=[],retained=[],held=[],added=[],newDois=new Set();
  const conflicts=conflictKeys((inputs.stage?.items||[]).filter(x=>x.mediaGeneration===policy.mediaGeneration&&x.updatedAt>=policy.mediaGeneration));
  try{
    // An unreadable prior published auto file stops deployment rather than silently removing it.
    for(const old of inputs.previous.items){
      const row=old.record;if(!papers.has(row.doi))continue;
      if(alreadyIn(media,row))continue;
      await validateNewBodyMetadata(row,policy,now);
      requireBody(old.policyId===POLICY_ID&&old.evidenceSha256===evidenceKey(row),'auto_prior_evidence_changed');
      const {ext}=await validateNewBodyMetadata(row,policy,now);
      requireBody(old.imageUrl==='media-mirror/body-auto-'+row.sha256+'.'+ext,'auto_previous_image_path');
      const bytes=await getOld(old);validateNewBodyBytes(row,bytes);await decoder.decode(row,bytes);
      prepared.push({row,bytes,ext,admittedAt:old.admittedAt});retained.push({doi:row.doi,id:row.id});
    }
    for(const row of rows){
      if(added.length>=policy.maxNewImages)break;
      if(!newDois.has(row.doi)&&newDois.size>=policy.maxNewArticles)continue;
      if(alreadyIn(media,row))continue;
      const key=exactKey(row),fingerprint=evidenceKey(row),identity=row.doi+'|'+row.id;
      try{
        requireBody(!conflicts.has(identity),'auto_cross_identity_conflict');
        const count=(media.items[row.doi]?.figures?.figures?.length||0)+prepared.filter(p=>p.row.doi===row.doi).length;
        requireBody(count<policy.maxFiguresPerCard,'auto_card_display_limit');
        const {ext}=await validateNewBodyMetadata(row,policy,now);
        const bytes=await getNew(row);validateNewBodyBytes(row,bytes);await decoder.decode(row,bytes);
        prepared.push({row,bytes,ext,admittedAt:now});newDois.add(row.doi);added.push({doi:row.doi,id:row.id,sha256:row.sha256});delete attempts[key];
      }catch(e){
        const reason=String(e.message).slice(0,180),n=(attempts[key]?.attempts||0)+1;
        const transient=/auto_read_http_5|fetch failed|timeout|aborted/i.test(reason);
        attempts[key]={doi:row.doi,id:row.id,evidenceSha256:fingerprint,reason,attempts:n,checkedAt:now,retryAfter:transient?now+(n<3?900000:3600000):null};
        held.push({doi:row.doi,id:row.id,reason});
      }
    }
  }finally{await decoder.close();}
  // No output is modified until every previously displayed auto file has been revalidated.
  await mkdir(path.join(root,'public/media-mirror'),{recursive:true});
  const entries=[];
  for(const {row,bytes,ext,admittedAt} of prepared){
    const imageUrl='media-mirror/body-auto-'+row.sha256+'.'+ext;
    await writeFile(path.join(root,'public',imageUrl),bytes);
    const record=media.items[row.doi]||{doi:row.doi,toc:{doi:row.doi,available:false},figures:{doi:row.doi,available:false,figures:[]}};
    const f={doi:row.doi,id:row.id,label:row.label,caption:row.caption,articleUrl:row.articleUrl,sourceUrl:row.sourceUrl,imageUrl,order:row.sortOrder,width:row.width,height:row.height,contentType:row.contentType,contentHash:row.contentHash,verifiedSha256:row.sha256,evidenceSha256:evidenceKey(row),originalUpdatedAt:row.updatedAt,publicationId:POLICY_ID,role:'article_figure',source:'automated-verified-new-capture',validationMode:'automated_provenance_bytes_and_decode',individualSemanticReview:false};
    const figures=[...(record.figures?.figures||[]),f].sort((a,b)=>Number(a.order||0)-Number(b.order||0)||String(a.id).localeCompare(String(b.id),'en',{numeric:true}));
    record.figures={...(record.figures||{}),available:true,doi:row.doi,articleUrl:row.articleUrl,figures};
    record.inventory={...(record.inventory||{}),status:record.toc?.available?'complete':'figures_only',figureCount:figures.length,fullArticleFiguresVerified:false};media.items[row.doi]=record;
    entries.push({policyId:POLICY_ID,record:row,imageUrl,evidenceSha256:evidenceKey(row),admittedAt,validationMode:'automated_provenance_bytes_and_decode',individualSemanticReview:false});
  }
  requireBody(JSON.stringify(Object.fromEntries(originalDois.map(d=>[d,media.items[d].toc])))===beforeToc,'auto_modified_toc');
  const ledgerPath=path.join(root,'public/body-publication-ledger.json');
  const ledger=JSON.parse(await readFile(ledgerPath,'utf8'));requireBody(Array.isArray(ledger.items),'auto_ledger_contract');
  ledger.items=ledger.items.filter(x=>x.publicationId!==POLICY_ID);
  for(const e of entries)ledger.items.push({assetKey:exactKey(e.record),doi:e.record.doi,id:e.record.id,sha256:e.record.sha256,evidenceSha256:e.evidenceSha256,label:e.record.label,imageUrl:e.imageUrl,state:'published',publicationId:POLICY_ID,validationMode:e.validationMode,individualSemanticReview:false,originalUpdatedAt:e.record.updatedAt});
  ledger.count=ledger.items.length;ledger.generatedAt=now;ledger.mediaManifestGeneratedAt=now;media.generatedAt=now;
  const snapshot={schemaVersion:1,policyId:POLICY_ID,generatedAt:now,mediaGeneration:policy.mediaGeneration,items:entries,count:entries.length,attempts};
  const status={schemaVersion:1,policyId:POLICY_ID,checkedAt:now,enabled:policy.enabled,stageRows:inputs.stage?.count??null,stageReadError:inputs.stageError||null,newEligible:rows.length,added,retained,held,autoPublishedCount:entries.length,totalPublicFigures:Object.values(media.items).reduce((n,r)=>n+(r.figures?.figures?.length||0),0),stagingWrites:0,stagingDeletes:0,publisherRequests:0,individualSemanticReview:false};
  await writeFile(mediaPath,JSON.stringify(media));await writeFile(ledgerPath,JSON.stringify(ledger));await writeFile(path.join(root,'public',SNAPSHOT),JSON.stringify(snapshot));await writeFile(path.join(root,'public/auto-body-status.json'),JSON.stringify(status));
  console.log('NEW_BODY_AUTO_PUBLICATION '+JSON.stringify(status));return {status,snapshot,media,ledger};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.includes('--poll')){
    const inputs=await readLiveInputs(),{rows}=await pendingNewRows({inputs});
    console.log('NEW_BODY_AUTO_PENDING '+JSON.stringify({count:rows.length,stageError:inputs.stageError}));
    if(process.env.GITHUB_OUTPUT)await writeFile(process.env.GITHUB_OUTPUT,'changed='+(rows.length?'true':'false')+'\n',{flag:'a'});
  }else await mergeNewBodyAuto();
}
