import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readPapers,normalizeDoi} from './merge-reviewed-toc.mjs';
import {sourceDois} from '../../shared/body-media-evidence.js';
import {POLICY_ID,sha256,requireBody,exactKey,evidenceKey,validateNewBodyMetadata,validateNewBodyBytes,conflictKeys,createImageDecoder} from './new-body-auto-validation.mjs';
export const SITE='https://gallery.gczhouwld.com/';
export const WORKER='https://organic-synthesis-gallery.zhou526316.workers.dev';
const SNAPSHOT='auto-body-publication.json';
export async function fetchStored(url,maxBytes=20000000,missing=false){
  const u=new URL(url,SITE),site=new URL(SITE);
  const permitted=u.origin===site.origin&&(u.pathname===site.pathname+SNAPSHOT||u.pathname===site.pathname+'media-index.json'||new RegExp('^'+site.pathname+'media-mirror/body-auto-[a-f0-9]{64}\\.(svg|png|webp|jpg)$').test(u.pathname))||u.origin===WORKER&&(u.pathname==='/api/article-figures/staged'||u.pathname==='/api/media/local-capture-index'||u.pathname==='/api/media/tampermonkey-reports'||/^\/media\/local-captures\/article-figures\/images\/[a-f0-9]{24}\/(figure|scheme|chart)-\d{1,3}-[a-f0-9]{16}\.(svg|png|webp|jpg)$/.test(u.pathname));
  requireBody(permitted&&!u.username&&!u.password,'auto_fetch_not_stored_asset');
  const response=await fetch(u,{headers:{'cache-control':'no-cache'},redirect:'error',credentials:'omit',signal:AbortSignal.timeout(20000)});
  if(missing&&response.status===404)return null;
  requireBody(response.ok,'auto_read_http_'+response.status);
  const reader=response.body.getReader();let size=0;const parts=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;requireBody(size<=maxBytes,'auto_read_size_limit');parts.push(Buffer.from(value));}}finally{reader.releaseLock();}
  return Buffer.concat(parts);
}
export function assertSnapshotCoherence(previous,live){
  const prior=new Map();
  for(const entry of previous.items){
    const key=entry.record.doi+'|'+entry.record.id;
    requireBody(!prior.has(key),'auto_previous_duplicate_identity');prior.set(key,entry);
  }
  const published=[];
  for(const [doi,item] of Object.entries(live.items||{}))for(const figure of item.figures?.figures||[])if(figure.publicationId===POLICY_ID)published.push({doi,figure});
  requireBody(prior.size===published.length,'auto_public_snapshots_incoherent_count');
  for(const {doi,figure} of published){
    const entry=prior.get(doi+'|'+figure.id);
    requireBody(entry&&entry.record.sha256===figure.verifiedSha256&&entry.imageUrl===figure.imageUrl&&entry.evidenceSha256===figure.evidenceSha256&&entry.record.label===figure.label,'auto_public_snapshots_incoherent_identity');
  }
}
async function configuration(root){
  const policy=JSON.parse(await readFile(path.join(root,'audit/media-auto-policy.json'),'utf8'));
  requireBody(policy.schemaVersion===1&&policy.policyId===POLICY_ID&&Number.isInteger(policy.minNewArticles)&&policy.minNewArticles>=1&&Number.isInteger(policy.maxNewArticles)&&policy.maxNewArticles>=policy.minNewArticles&&policy.maxNewArticles<=25&&Number.isInteger(policy.maxNewImages)&&policy.maxNewImages>=policy.maxNewArticles&&policy.maxNewImages<=250&&policy.maxFiguresPerCard<=10&&policy.requireOfficialTocInBuild===true&&policy.requireCompletedCapturePacket===true&&Number.isInteger(policy.backfillStabilityMinutes)&&policy.backfillStabilityMinutes>=5&&policy.backfillStabilityMinutes<=120&&Number.isFinite(Date.parse(policy.backfillCapturedBefore)),'auto_invalid_configuration');
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
  assertSnapshotCoherence(previous,live);
  let stage=null,stageError=null,localCaptures=null,localCaptureError=null,reports=null,reportError=null;
  try{stage=JSON.parse(await fetchStored(WORKER+'/api/article-figures/staged'));requireBody(Array.isArray(stage.items)&&stage.count===stage.items.length&&stage.count<=2000,'auto_stage_truncated_or_invalid');}
  catch(e){stageError=String(e.message);stage=null;}
  try{localCaptures=JSON.parse(await fetchStored(WORKER+'/api/media/local-capture-index'));requireBody(Array.isArray(localCaptures.items)&&localCaptures.count===localCaptures.items.length&&localCaptures.count<=2000,'auto_local_capture_index_invalid');}
  catch(e){localCaptureError=String(e.message);localCaptures=null;}
  try{reports=JSON.parse(await fetchStored(WORKER+'/api/media/tampermonkey-reports?limit=200'));requireBody(Array.isArray(reports.items)&&reports.items.length<=200,'auto_report_index_invalid');}
  catch(e){reportError=String(e.message);reports=null;}
  return {previous,live,stage,stageError,localCaptures,localCaptureError,reports,reportError};
}
function alreadyIn(media,row){return (media.items?.[row.doi]?.figures?.figures||[]).some(f=>f.id===row.id);}
function heldAttempts(previous,row,now){const a=previous.attempts?.[exactKey(row)];return a?.evidenceSha256===evidenceKey(row)&&(!a.retryAfter||a.retryAfter>now);}
export function officialToc(record){
  const toc=record?.toc;
  return Boolean(toc?.available&&toc?.imageUrl&&!/fallback/i.test(String(toc.reason||''))&&!String(toc.reason||'').startsWith('figure_fallback:'));
}
function embeddedAcsDois(value){
  let text=String(value||'').split(/[?#]/,1)[0];
  for(let i=0;i<3;i+=1){try{const next=decodeURIComponent(text);if(next===text)break;text=next;}catch{break;}}
  const found=new Set();
  for(const match of text.matchAll(/10\.1021[\/_]([a-z0-9._()-]+)/ig)){
    const doi=normalizeDoi('10.1021/'+match[1]);if(doi)found.add(doi);
  }
  return [...found];
}
function hostIs(host,suffix){return host===suffix||host.endsWith('.'+suffix);}
function officialPublisherHosts(doi,pageHost,sourceHost){
  if(doi.startsWith('10.1021/'))return pageHost==='pubs.acs.org'&&['acs.silverchair-cdn.com','pubs.acs.org'].includes(sourceHost);
  if(doi.startsWith('10.1002/'))return hostIs(pageHost,'onlinelibrary.wiley.com')&&(hostIs(sourceHost,'wiley.com')||hostIs(sourceHost,'wiley.com.cn'));
  if(doi.startsWith('10.1038/'))return hostIs(pageHost,'nature.com')&&(hostIs(sourceHost,'nature.com')||hostIs(sourceHost,'springernature.com'));
  if(doi.startsWith('10.1126/'))return hostIs(pageHost,'science.org')&&hostIs(sourceHost,'science.org');
  if(doi.startsWith('10.1039/'))return hostIs(pageHost,'rsc.org')&&hostIs(sourceHost,'rsc.org');
  if(doi.startsWith('10.1016/'))return (hostIs(pageHost,'sciencedirect.com')||hostIs(pageHost,'cell.com'))&&(hostIs(sourceHost,'sciencedirect.com')||hostIs(sourceHost,'cell.com')||hostIs(sourceHost,'els-cdn.com'));
  if(doi.startsWith('10.31635/'))return hostIs(pageHost,'ccspublishing.org.cn')&&hostIs(sourceHost,'ccspublishing.org.cn');
  return false;
}
export function strongOfficialCapture(row){
  const doi=normalizeDoi(row?.doi||'');
  if(!doi||String(row?.kind||'').toLowerCase()!=='official')return false;
  if(row.captureVersion!=='6.2.20'||normalizeDoi(row.pageDoi||'')!==doi||Number(row.mediaGeneration)!==1790082000000||Number(row.updatedAt||0)<1790082000000)return false;
  let page,source;try{page=new URL(String(row.articleUrl||''));source=new URL(String(row.sourceUrl||''));}catch{return false;}
  if(page.protocol!=='https:'||source.protocol!=='https:'||!officialPublisherHosts(doi,page.hostname,source.hostname))return false;
  const articleIds=sourceDois(row.articleUrl);
  if(articleIds.length!==1||articleIds[0]!==doi)return false;
  const sourceIds=sourceDois(row.sourceUrl);
  if(sourceIds.length===1&&sourceIds[0]===doi)return true;
  if(sourceIds.length)return false;
  if(doi.startsWith('10.1038/')&&hostIs(source.hostname,'springernature.com')){
    const slug=doi.slice('10.1038/'.length).replace(/[.*+?^$()|[\]\\]/g,'\\  for(const value of [row.articleUrl,row.sourceUrl]){
    const ids=sourceDois(value);
    if(ids.length!==1||ids[0]!==doi)return false;
  }
  return true;');
    return new RegExp('(?:^|[/_-])'+slug+'(?:[/_.-]|$)','i').test(decodeURIComponent(source.pathname));
  }
  return false;
}
export function completedPacketMap(inputs){
  const map=new Map();
  for(const row of inputs?.reports?.items||[]){
    const doi=normalizeDoi(row?.doi||'');
    const jobId=String(row?.jobId||'');
    if(!doi||!row.final||row.status!=='success'||row.captureVersion!=='6.2.20'||!/^[a-z0-9-]{16,80}$/i.test(jobId))continue;
    if(Number(row.figuresStored||0)!==Number(row.figuresDiscovered||0))continue;
    map.set(doi,row);
  }
  return map;
}
export function tocReadyDois(inputs){
  const ready=new Set();
  for(const [doi,record] of Object.entries(inputs?.live?.items||{}))if(officialToc(record))ready.add(normalizeDoi(doi)||doi);
  for(const row of inputs?.localCaptures?.items||[])if(strongOfficialCapture(row))ready.add(normalizeDoi(row.doi));
  return ready;
}
export function adaptiveBatchGate(rows,policy,now=Date.now()){
  const dois=new Set();
  let latestUpdatedAt=0,oldestUpdatedAt=0;
  for(const row of rows||[]){
    const doi=normalizeDoi(row?.doi||'');if(doi)dois.add(doi);
    const updated=Number(row?.updatedAt||0);
    if(Number.isFinite(updated)&&updated>0){
      if(updated>latestUpdatedAt)latestUpdatedAt=updated;
      if(!oldestUpdatedAt||updated<oldestUpdatedAt)oldestUpdatedAt=updated;
    }
  }
  const articleCount=dois.size;
  const idleMinutes=latestUpdatedAt?Math.max(0,(Number(now)-latestUpdatedAt)/60000):null;
  const backlogAgeMinutes=oldestUpdatedAt?Math.max(0,(Number(now)-oldestUpdatedAt)/60000):null;
  const targetReady=articleCount>=policy.minNewArticles;
  const tailReady=!targetReady&&articleCount>=policy.tailFlushMinArticles&&idleMinutes!==null&&idleMinutes>=policy.tailFlushIdleMinutes;
  const backlogReady=!targetReady&&!tailReady&&articleCount>=policy.tailFlushMinArticles&&backlogAgeMinutes!==null&&backlogAgeMinutes>=policy.backlogMaxWaitMinutes;
  return {ready:targetReady||tailReady||backlogReady,mode:targetReady?'target_batch':tailReady?'quiet_tail':backlogReady?'aged_backlog':'waiting',articleCount,targetArticles:policy.minNewArticles,latestUpdatedAt,oldestUpdatedAt,idleMinutes,backlogAgeMinutes,targetReady,tailReady,backlogReady};
}
export async function pendingNewRows({root=process.cwd(),inputs,now=Date.now()}){
  assertSnapshotCoherence(inputs.previous,inputs.live);
  const cfg=await configuration(root),{policy,holds,papers}=cfg;
  if(!policy.enabled||!inputs.stage)return {...cfg,rows:[]};
  const oldKeys=new Set(inputs.previous.items.map(x=>exactKey(x.record))),tocReady=tocReadyDois(inputs),packets=completedPacketMap(inputs);
  const cutoff=Date.parse(policy.backfillCapturedBefore),stabilityMs=policy.backfillStabilityMinutes*60000;
  const stageByDoi=new Map();
  for(const row of inputs.stage.items){
    const doi=normalizeDoi(row?.doi||'');if(!doi)continue;
    if(!stageByDoi.has(doi))stageByDoi.set(doi,[]);
    stageByDoi.get(doi).push(row);
  }
  const packetCoverage=new Map();
  for(const [doi,packet] of packets){
    const available=new Set([...(stageByDoi.get(doi)||[]).map(x=>String(x.label||'')),...(inputs.live.items?.[doi]?.figures?.figures||[]).map(x=>String(x.label||''))]);
    const labels=Array.isArray(packet.figureLabels)?packet.figureLabels.filter(Boolean):[];
    packetCoverage.set(doi,labels.every(label=>available.has(String(label))));
  }
  const rows=[];
  for(const raw of inputs.stage.items){
    const row={...raw},doi=normalizeDoi(row.doi);
    if(!doi||oldKeys.has(exactKey(row))||!papers.has(doi)||holds.has(doi)||alreadyIn(inputs.live,row)||heldAttempts(inputs.previous,row,now)||!tocReady.has(doi))continue;
    const historical=Number(row.updatedAt||0)<=cutoff&&Number(now)-Number(row.updatedAt||0)>=stabilityMs;
    const packet=packets.get(doi);
    const packetReady=Boolean(packet&&packetCoverage.get(doi));
    if(!historical&&!packetReady)continue;
    if(!historical&&Array.isArray(packet.figureLabels)&&packet.figureLabels.length&&!packet.figureLabels.includes(String(row.label||'')))continue;
    try{
      await validateNewBodyMetadata(row,policy,now);
      row._packetMode=historical?'historical_backfill':'completed_job';
      row._packetJobId=packet?.jobId||'';
      rows.push(row);
    }catch{}
  }
  const priority=journal=>{
    const j=String(journal||'').trim();
    if(j==='Nature')return 0;if(j==='Science')return 1;if(/^Nature\s+/i.test(j))return 2;if(/^Science\s+/i.test(j))return 3;
    if(j==='JACS')return 4;if(j==='Angew')return 5;if(j==='Chem')return 6;return 7;
  };
  rows.sort((a,b)=>priority(papers.get(a.doi)?.journal)-priority(papers.get(b.doi)?.journal)
    ||String(papers.get(b.doi)?.date||'').localeCompare(String(papers.get(a.doi)?.date||''))
    ||Number(a.updatedAt||0)-Number(b.updatedAt||0)
    ||String(a.doi).localeCompare(String(b.doi))
    ||Number(a.sortOrder||0)-Number(b.sortOrder||0));
  return {...cfg,rows,tocReady,packets};
}
export async function mergeNewBodyAuto(root=process.cwd(),options={}){
  const now=options.now||Date.now(),inputs=options.inputs||await readLiveInputs();
  const {policy,holds,papers,rows}=await pendingNewRows({root,inputs,now});
  const mediaPath=path.join(root,'public/media-index.json'),media=JSON.parse(await readFile(mediaPath,'utf8'));media.items||={};
  const ledgerPath=path.join(root,'public/body-publication-ledger.json'),ledger=JSON.parse(await readFile(ledgerPath,'utf8'));requireBody(Array.isArray(ledger.items),'auto_ledger_contract');
  const beforeToc=JSON.stringify(Object.fromEntries(Object.entries(media.items).map(([d,r])=>[d,r.toc]))),originalDois=Object.keys(media.items);
  const decoder=options.decoder||await createImageDecoder();
  const getNew=options.getNew||((row)=>fetchStored(WORKER+'/media/'+row.r2Key,4000000));
  const getOld=options.getOld||((old)=>fetchStored(old.imageUrl,4000000));
  const attempts={...(inputs.previous.attempts||{})},retained=[],supersededByReviewed=[],held=[],added=[],newDois=new Set(),tocWaitingDois=new Set();
  let prepared=[];
  const candidateDois=[];
  for(const row of rows)if(!candidateDois.includes(row.doi)&&candidateDois.length<policy.maxNewArticles)candidateDois.push(row.doi);
  const candidateDoiSet=new Set(candidateDois);
  const eligibleArticleCount=new Set(rows.map(row=>row.doi)).size;
  const conflicts=conflictKeys((inputs.stage?.items||[]).filter(x=>x.mediaGeneration===policy.mediaGeneration&&x.updatedAt>=policy.mediaGeneration));
  try{
    for(const old of inputs.previous.items){
      const row=old.record;if(!papers.has(row.doi))continue;
      await validateNewBodyMetadata(row,policy,now);
      requireBody(old.policyId===POLICY_ID&&old.evidenceSha256===evidenceKey(row),'auto_prior_evidence_changed');
      const {ext}=await validateNewBodyMetadata(row,policy,now);
      requireBody(old.imageUrl==='media-mirror/body-auto-'+row.sha256+'.'+ext,'auto_previous_image_path');
      const existing=(media.items?.[row.doi]?.figures?.figures||[]).find(f=>f.id===row.id);
      if(existing){
        const sameAuto=existing.publicationId===POLICY_ID&&existing.verifiedSha256===row.sha256&&existing.imageUrl===old.imageUrl&&existing.evidenceSha256===old.evidenceSha256&&existing.label===row.label;
        const reviewedHandoff=!sameAuto&&existing.verifiedSha256===row.sha256&&existing.evidenceSha256===old.evidenceSha256&&existing.label===row.label&&ledger.items.some(item=>item.publicationId!==POLICY_ID&&item.state==='published'&&item.doi===row.doi&&item.id===row.id&&item.sha256===row.sha256&&item.evidenceSha256===old.evidenceSha256&&item.label===row.label&&item.imageUrl===existing.imageUrl);
        requireBody(sameAuto||reviewedHandoff,'auto_prior_publication_changed');
        if(reviewedHandoff){supersededByReviewed.push({doi:row.doi,id:row.id,sha256:row.sha256,publicationId:existing.publicationId,imageUrl:existing.imageUrl});continue;}
      }
      const bytes=await getOld(old);validateNewBodyBytes(row,bytes);await decoder.decode(row,bytes);
      prepared.push({row,bytes,ext,admittedAt:old.admittedAt,isNew:false,alreadyPublished:Boolean(existing),existingImageUrl:existing?.imageUrl||null});retained.push({doi:row.doi,id:row.id});
    }
    for(const doi of candidateDois){
      const packetRows=rows.filter(row=>row.doi===doi&&!alreadyIn(media,row));
      if(!packetRows.length)continue;
      if(policy.requireOfficialTocInBuild&&!officialToc(media.items[doi])){
        held.push({doi,id:null,reason:'waiting_for_official_toc_in_same_build'});tocWaitingDois.add(doi);continue;
      }
      const baseCount=(media.items[doi]?.figures?.figures?.length||0);
      if(baseCount+packetRows.length>policy.maxFiguresPerCard){
        held.push({doi,id:null,reason:'auto_card_display_limit'});continue;
      }
      const packetPrepared=[],packetAdded=[];
      let packetFailure=null;
      for(const row of packetRows){
        if(added.length+packetAdded.length>=policy.maxNewImages){packetFailure='auto_packet_image_limit';break;}
        const key=exactKey(row),fingerprint=evidenceKey(row),identity=row.doi+'|'+row.id;
        try{
          requireBody(!conflicts.has(identity),'auto_cross_identity_conflict');
          const {ext}=await validateNewBodyMetadata(row,policy,now);
          const bytes=await getNew(row);validateNewBodyBytes(row,bytes);await decoder.decode(row,bytes);
          packetPrepared.push({row,bytes,ext,admittedAt:now,isNew:true});
          packetAdded.push({doi:row.doi,id:row.id,sha256:row.sha256});
        }catch(e){
          const reason=String(e.message).slice(0,180),n=(attempts[key]?.attempts||0)+1;
          const transient=/auto_read_http_5|fetch failed|timeout|aborted/i.test(reason);
          attempts[key]={doi:row.doi,id:row.id,evidenceSha256:fingerprint,reason,attempts:n,checkedAt:now,retryAfter:transient?now+(n<3?900000:3600000):null};
          packetFailure=reason;break;
        }
      }
      if(packetFailure){
        held.push({doi,id:null,reason:'packet_held:'+packetFailure});continue;
      }
      for(const item of packetPrepared){prepared.push(item);delete attempts[exactKey(item.row)];}
      for(const item of packetAdded)added.push(item);
      newDois.add(doi);
    }
  }finally{await decoder.close();}
  const validatedRows=prepared.filter(item=>item.isNew).map(item=>item.row);
  const releaseGate=adaptiveBatchGate(validatedRows,policy,now);
  const validatedNewArticleCount=newDois.size;
  const meetsMinimumBatch=releaseGate.ready;
  const waitingForMinimumBatch=candidateDois.length>0&&!releaseGate.ready;
  if(!releaseGate.ready){
    prepared=prepared.filter(item=>!item.isNew);
    added.length=0;
    newDois.clear();
  }
  await mkdir(path.join(root,'public/media-mirror'),{recursive:true});
  const entries=[];
  for(const {row,bytes,ext,admittedAt,alreadyPublished,existingImageUrl} of prepared){
    const imageUrl=existingImageUrl||('media-mirror/body-auto-'+row.sha256+'.'+ext);
    if(!alreadyPublished){
      await writeFile(path.join(root,'public',imageUrl),bytes);
      const record=media.items[row.doi]||{doi:row.doi,toc:{doi:row.doi,available:false},figures:{doi:row.doi,available:false,figures:[]}};
      const f={doi:row.doi,id:row.id,label:row.label,caption:row.caption,articleUrl:row.articleUrl,sourceUrl:row.sourceUrl,imageUrl,order:row.sortOrder,width:row.width,height:row.height,contentType:row.contentType,contentHash:row.contentHash,verifiedSha256:row.sha256,evidenceSha256:evidenceKey(row),originalUpdatedAt:row.updatedAt,publicationId:POLICY_ID,role:'article_figure',source:'automated-verified-new-capture',validationMode:'automated_provenance_bytes_and_decode',individualSemanticReview:false};
      const figures=[...(record.figures?.figures||[]),f].sort((a,b)=>Number(a.order||0)-Number(b.order||0)||String(a.id).localeCompare(String(b.id),'en',{numeric:true}));
      record.figures={...(record.figures||{}),available:true,doi:row.doi,articleUrl:row.articleUrl,figures};
      record.inventory={...(record.inventory||{}),status:record.toc?.available?'complete':'figures_only',figureCount:figures.length,fullArticleFiguresVerified:false};media.items[row.doi]=record;
    }
    entries.push({policyId:POLICY_ID,record:row,imageUrl,evidenceSha256:evidenceKey(row),admittedAt,validationMode:'automated_provenance_bytes_and_decode',individualSemanticReview:false});
  }
  requireBody(JSON.stringify(Object.fromEntries(originalDois.map(d=>[d,media.items[d].toc])))===beforeToc,'auto_modified_toc');
  ledger.items=ledger.items.filter(x=>x.publicationId!==POLICY_ID);
  for(const e of entries)ledger.items.push({assetKey:exactKey(e.record),doi:e.record.doi,id:e.record.id,sha256:e.record.sha256,evidenceSha256:e.evidenceSha256,label:e.record.label,imageUrl:e.imageUrl,state:'published',publicationId:POLICY_ID,validationMode:e.validationMode,individualSemanticReview:false,originalUpdatedAt:e.record.updatedAt});
  ledger.count=ledger.items.length;ledger.generatedAt=now;ledger.mediaManifestGeneratedAt=now;media.generatedAt=now;
  const snapshot={schemaVersion:1,policyId:POLICY_ID,generatedAt:now,mediaGeneration:policy.mediaGeneration,items:entries,count:entries.length,attempts};
  const status={schemaVersion:1,policyId:POLICY_ID,checkedAt:now,enabled:policy.enabled,stageRows:inputs.stage?.count??null,stageReadError:inputs.stageError||null,localCaptureError:inputs.localCaptureError||null,newEligible:rows.length,eligibleArticles:eligibleArticleCount,candidateArticles:candidateDois.length,validatedNewArticles:validatedNewArticleCount,releaseReady:releaseGate.ready,preferredTargetMet:releaseGate.targetReady,tailFlushReady:releaseGate.tailReady,releaseMode:releaseGate.mode,eligibleIdleMinutes:releaseGate.idleMinutes,oldestEligibleAgeMinutes:releaseGate.backlogAgeMinutes,backlogMaxWaitMinutes:policy.backlogMaxWaitMinutes,agedBacklogReady:releaseGate.backlogReady,tailFlushIdleMinutes:policy.tailFlushIdleMinutes,targetBatchArticles:policy.minNewArticles,maximumBatchArticles:policy.maxNewArticles,waitingForMore:candidateDois.length>0&&!releaseGate.ready,tocPairedRequired:policy.requireOfficialTocInBuild,tocWaitingArticles:tocWaitingDois.size,publishedNewArticles:new Set(added.map(x=>x.doi)).size,added,retained,supersededByReviewed,held,autoPublishedCount:entries.length,totalPublicFigures:Object.values(media.items).reduce((n,r)=>n+(r.figures?.figures||[]).length,0),stagingWrites:0,stagingDeletes:0,publisherRequests:0,individualSemanticReview:false};
  await writeFile(mediaPath,JSON.stringify(media));await writeFile(ledgerPath,JSON.stringify(ledger));await writeFile(path.join(root,'public',SNAPSHOT),JSON.stringify(snapshot));await writeFile(path.join(root,'public/auto-body-status.json'),JSON.stringify(status));
  console.log('NEW_BODY_AUTO_PUBLICATION '+JSON.stringify(status));return {status,snapshot,media,ledger};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.includes('--poll')){
    const inputs=await readLiveInputs(),{rows,policy}=await pendingNewRows({inputs});
    const gate=adaptiveBatchGate(rows,policy,Date.now());
    console.log('NEW_BODY_AUTO_PENDING '+JSON.stringify({count:rows.length,articles:gate.articleCount,targetArticles:gate.targetArticles,ready:gate.ready,mode:gate.mode,idleMinutes:gate.idleMinutes,oldestEligibleAgeMinutes:gate.backlogAgeMinutes,backlogMaxWaitMinutes:policy.backlogMaxWaitMinutes,tailFlushIdleMinutes:policy.tailFlushIdleMinutes,stageError:inputs.stageError,localCaptureError:inputs.localCaptureError}));
    if(process.env.GITHUB_OUTPUT)await writeFile(process.env.GITHUB_OUTPUT,'changed='+(gate.ready?'true':'false')+'\narticles='+gate.articleCount+'\nmode='+gate.mode+'\n',{flag:'a'});
  }else await mergeNewBodyAuto();
}
