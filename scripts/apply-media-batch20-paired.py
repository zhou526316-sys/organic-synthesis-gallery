from pathlib import Path
import json

def once(s,a,b):
    if s.count(a)!=1: raise RuntimeError('Expected one anchor: '+a[:140])
    return s.replace(a,b,1)
def save(p,s): Path(p).write_text(s)

# Production policy: target 20 articles, but flush a stable tail below 20.
p=Path('audit/media-auto-policy.json');policy=json.loads(p.read_text())
policy['targetNewArticles']=20
policy['maxNewArticles']=25
policy['tailFlushAfterMinutes']=15
policy['maxNewImages']=150
policy['requireOfficialToc']=True
policy['notes']='New server-marked current-generation ACS body figures only. Target 20–25 distinct articles per deployment. If only 1–19 remain and no eligible TOC/body evidence has changed for 15 minutes, flush that stable tail instead of waiting indefinitely. Every published article must have an official TOC already deployed or captured and merged in the same Pages build. No historical unquarantine, publisher downloads, TOC fallback substitution, image replacement, or literature additions. Opaque sources remain held.'
p.write_text(json.dumps(policy,ensure_ascii=False,indent=2)+'\n')

p=Path('cloudflare/scripts/merge-new-body-auto.mjs');s=p.read_text()
s=s.replace("import {readPapers} from './merge-reviewed-toc.mjs';","import {readPapers,normalizeDoi} from './merge-reviewed-toc.mjs';",1)
anchor="const SNAPSHOT='auto-body-publication.json';\n"
addition=r"""const SNAPSHOT='auto-body-publication.json';
export function officialToc(record){
  const toc=record?.toc;
  return Boolean(toc?.available&&toc?.imageUrl&&!/fallback/i.test(String(toc.reason||''))&&!String(toc.reason||'').startsWith('figure_fallback:'));
}
function acsDoisInUrl(value){
  let text=String(value||'').split(/[?#]/,1)[0];
  for(let i=0;i<3;i+=1){try{const n=decodeURIComponent(text);if(n===text)break;text=n;}catch{break;}}
  const found=new Set();
  for(const m of text.matchAll(/10\.1021[\/_]([a-z0-9._()-]+)/ig)){const d=normalizeDoi('10.1021/'+m[1]);if(d)found.add(d);}
  return [...found];
}
export function strongOfficialCapture(row){
  const doi=normalizeDoi(row?.doi||'');
  if(!doi||!doi.startsWith('10.1021/')||String(row?.kind||'').toLowerCase()!=='official')return false;
  if(row.captureVersion!=='6.2.20'||normalizeDoi(row.pageDoi||'')!==doi||Number(row.mediaGeneration)!==1790082000000||Number(row.updatedAt||0)<1790082000000)return false;
  for(const value of [row.articleUrl,row.sourceUrl]){
    const ids=acsDoisInUrl(value);
    if(ids.length!==1||ids[0]!==doi)return false;
  }
  return true;
}
function tocReadyDois(inputs){
  const ready=new Set();
  for(const [doi,record] of Object.entries(inputs.live?.items||{}))if(officialToc(record))ready.add(doi);
  for(const row of inputs.localCaptures?.items||[])if(strongOfficialCapture(row))ready.add(normalizeDoi(row.doi));
  return ready;
}
function articleOrder(a,b,papers){
  const date=String(papers.get(b)?.date||'').localeCompare(String(papers.get(a)?.date||''));
  if(date)return date;
  const aj=a.startsWith('10.1021/jacs.'),bj=b.startsWith('10.1021/jacs.');
  if(aj!==bj)return aj?-1:1;
  return a.localeCompare(b);
}
export function tailFlushState(rows,inputs,policy,now=Date.now()){
  const candidateDois=new Set(rows.map(r=>normalizeDoi(r?.doi||'')).filter(Boolean));
  let newest=0;
  for(const row of rows)newest=Math.max(newest,Number(row?.updatedAt||0));
  for(const row of inputs.localCaptures?.items||[]){
    const doi=normalizeDoi(row?.doi||'');
    if(candidateDois.has(doi)&&strongOfficialCapture(row))newest=Math.max(newest,Number(row?.updatedAt||0));
  }
  const waitMs=Math.max(1,Number(policy.tailFlushAfterMinutes||15))*60*1000;
  const stable=rows.length>0&&newest>0&&now-newest>=waitMs;
  return {stable,newestEvidenceAt:newest,ageMs:newest?Math.max(0,now-newest):null,waitMs};
}
export function selectArticleBatch(rows,media,papers,policy,{readyOverride=null,target=policy.targetNewArticles,allowTail=false}={}){
  const grouped=new Map();
  for(const row of rows){
    const doi=normalizeDoi(row?.doi||'');if(!doi)continue;
    if(!grouped.has(doi))grouped.set(doi,[]);
    const g=grouped.get(doi);
    if(!g.some(x=>x.id===row.id))g.push(row);
  }
  const selected=[],dois=[];
  for(const doi of [...grouped.keys()].sort((a,b)=>articleOrder(a,b,papers))){
    if(dois.length>=policy.maxNewArticles)break;
    const tocOk=readyOverride?readyOverride.has(doi):officialToc(media.items?.[doi]);
    if(!tocOk)continue;
    const existing=new Set((media.items?.[doi]?.figures?.figures||[]).map(f=>String(f.id||'')));
    const group=grouped.get(doi).filter(r=>!existing.has(String(r.id||''))).sort((a,b)=>Number(a.sortOrder||0)-Number(b.sortOrder||0)||String(a.id).localeCompare(String(b.id),undefined,{numeric:true}));
    if(!group.length)continue;
    if(existing.size+group.length>policy.maxFiguresPerCard)continue; // Never publish a partial article merely to fit the card.
    if(selected.length+group.length>policy.maxNewImages)continue;
    selected.push(...group);dois.push(doi);
  }
  const release=dois.length>=target?'target_reached':allowTail&&dois.length>0?'stable_tail':'waiting';
  return {rows:release==='waiting'?[]:selected,dois:release==='waiting'?[]:dois,readyArticles:dois.length,target,release};
}
"""
s=once(s,anchor,addition)
s=s.replace("u.pathname==='/api/article-figures/staged'||", "u.pathname==='/api/article-figures/staged'||u.pathname==='/api/media/local-capture-index'||",1)
old="""async function configuration(root){
  const policy=JSON.parse(await readFile(path.join(root,'audit/media-auto-policy.json'),'utf8'));
  requireBody(policy.schemaVersion===1&&policy.policyId===POLICY_ID&&policy.maxNewImages<=30&&policy.maxNewArticles<=5&&policy.maxFiguresPerCard<=10,'auto_invalid_configuration');"""
new="""async function configuration(root){
  const policy=JSON.parse(await readFile(path.join(root,'audit/media-auto-policy.json'),'utf8'));
  requireBody(policy.schemaVersion===1&&policy.policyId===POLICY_ID&&policy.targetNewArticles===20&&policy.maxNewArticles>=20&&policy.maxNewArticles<=25&&policy.tailFlushAfterMinutes>=5&&policy.tailFlushAfterMinutes<=60&&policy.maxNewImages>=20&&policy.maxNewImages<=150&&policy.maxFiguresPerCard<=10&&policy.requireOfficialToc===true,'auto_invalid_configuration');"""
s=once(s,old,new)
old="""  let stage=null,stageError=null;
  try{stage=JSON.parse(await fetchStored(WORKER+'/api/article-figures/staged'));requireBody(Array.isArray(stage.items)&&stage.count===stage.items.length&&stage.count<=2000,'auto_stage_truncated_or_invalid');}
  catch(e){stageError=String(e.message);stage=null;}
  return {previous,live,stage,stageError};"""
new="""  let stage=null,stageError=null,localCaptures=null,localCaptureError=null;
  try{stage=JSON.parse(await fetchStored(WORKER+'/api/article-figures/staged'));requireBody(Array.isArray(stage.items)&&stage.count===stage.items.length&&stage.count<=2000,'auto_stage_truncated_or_invalid');}
  catch(e){stageError=String(e.message);stage=null;}
  try{localCaptures=JSON.parse(await fetchStored(WORKER+'/api/media/local-capture-index'));requireBody(Array.isArray(localCaptures.items)&&localCaptures.count===localCaptures.items.length&&localCaptures.count<=2000,'auto_local_capture_index_invalid');}
  catch(e){localCaptureError=String(e.message);localCaptures=null;}
  return {previous,live,stage,stageError,localCaptures,localCaptureError};"""
s=once(s,old,new)
old="""  const oldKeys=new Set(inputs.previous.items.map(x=>exactKey(x.record)));
  const rows=[];
  for(const row of inputs.stage.items){
    if(oldKeys.has(exactKey(row))||!papers.has(row.doi)||holds.has(row.doi)||alreadyIn(inputs.live,row)||heldAttempts(inputs.previous,row,now))continue;
    try{await validateNewBodyMetadata(row,policy,now);rows.push(row);}catch{}
  }
  rows.sort((a,b)=>String(papers.get(b.doi)?.date||'').localeCompare(String(papers.get(a.doi)?.date||''))||Number(!a.doi.startsWith('10.1021/jacs.'))-Number(!b.doi.startsWith('10.1021/jacs.'))||b.updatedAt-a.updatedAt);
  return {...cfg,rows};"""
new="""  const oldKeys=new Set(inputs.previous.items.map(x=>exactKey(x.record))),tocReady=tocReadyDois(inputs);
  const rows=[];
  for(const row of inputs.stage.items){
    if(oldKeys.has(exactKey(row))||!papers.has(row.doi)||holds.has(row.doi)||alreadyIn(inputs.live,row)||heldAttempts(inputs.previous,row,now)||!tocReady.has(row.doi))continue;
    try{await validateNewBodyMetadata(row,policy,now);rows.push(row);}catch{}
  }
  rows.sort((a,b)=>articleOrder(a.doi,b.doi,papers)||Number(a.sortOrder||0)-Number(b.sortOrder||0));
  const tail=tailFlushState(rows,inputs,policy,now);
  return {...cfg,rows,tocReady,tail};"""
s=once(s,old,new)
old="""  const {policy,holds,papers,rows}=await pendingNewRows({root,inputs,now});
  const mediaPath=path.join(root,'public/media-index.json'),media=JSON.parse(await readFile(mediaPath,'utf8'));media.items||={};"""
new="""  const pending=await pendingNewRows({root,inputs,now}),{policy,holds,papers,rows}=pending;
  const mediaPath=path.join(root,'public/media-index.json'),media=JSON.parse(await readFile(mediaPath,'utf8'));media.items||={};
  const selection=selectArticleBatch(rows,media,papers,policy,{target:options.testMode===true?1:policy.targetNewArticles,allowTail:options.testMode===true||pending.tail.stable});
  const publishRows=selection.rows;
  const requiredAfterValidation=selection.release==='target_reached'&&!options.testMode?policy.targetNewArticles:publishRows.length?1:Infinity;"""
s=once(s,old,new)
s=s.replace("    for(const row of rows){","    const newPreparedStart=prepared.length;\n    for(const row of publishRows){",1)
old="""    }
  }finally{await decoder.close();}
  await mkdir(path.join(root,'public/media-mirror'),{recursive:true});"""
new="""    }
    if(newDois.size<requiredAfterValidation){
      const rejected=prepared.splice(newPreparedStart);
      for(const x of rejected)held.push({doi:x.row.doi,id:x.row.id,reason:'auto_batch_below_minimum_after_file_validation'});
      added.length=0;newDois.clear();
    }
  }finally{await decoder.close();}
  await mkdir(path.join(root,'public/media-mirror'),{recursive:true});"""
s=once(s,old,new)
old="""  const status={schemaVersion:1,policyId:POLICY_ID,checkedAt:now,enabled:policy.enabled,stageRows:inputs.stage?.count??null,stageReadError:inputs.stageError||null,newEligible:rows.length,added,retained,held,autoPublishedCount:entries.length,totalPublicFigures:Object.values(media.items).reduce((n,r)=>n+(r.figures?.figures?.length||0),0),stagingWrites:0,stagingDeletes:0,publisherRequests:0,individualSemanticReview:false};"""
new="""  const status={schemaVersion:1,policyId:POLICY_ID,checkedAt:now,enabled:policy.enabled,stageRows:inputs.stage?.count??null,stageReadError:inputs.stageError||null,localCaptureError:inputs.localCaptureError||null,newEligible:rows.length,readyArticles:selection.readyArticles,targetArticles:policy.targetNewArticles,tailStable:pending.tail.stable,tailAgeMs:pending.tail.ageMs,selectedArticles:new Set(added.map(x=>x.doi)).size,batchState:added.length?'published_batch':selection.release==='stable_tail'?'tail_validation_held':selection.readyArticles>=policy.targetNewArticles?'validation_held_batch':'waiting_for_target_or_stable_tail',releaseReason:selection.release,added,retained,held,autoPublishedCount:entries.length,totalPublicFigures:Object.values(media.items).reduce((n,r)=>n+(r.figures?.figures?.length||0),0),stagingWrites:0,stagingDeletes:0,publisherRequests:0,individualSemanticReview:false,requiresOfficialToc:true};"""
s=once(s,old,new)
old="""    const inputs=await readLiveInputs(),{rows}=await pendingNewRows({inputs});
    console.log('NEW_BODY_AUTO_PENDING '+JSON.stringify({count:rows.length,stageError:inputs.stageError}));
    if(process.env.GITHUB_OUTPUT)await writeFile(process.env.GITHUB_OUTPUT,'changed='+(rows.length?'true':'false')+'\\n',{flag:'a'});"""
new="""    const inputs=await readLiveInputs(),pending=await pendingNewRows({inputs});
    const selection=selectArticleBatch(pending.rows,inputs.live,pending.papers,pending.policy,{readyOverride:pending.tocReady,target:pending.policy.targetNewArticles,allowTail:pending.tail.stable});
    const changed=selection.dois.length>0;
    console.log('NEW_BODY_AUTO_PENDING '+JSON.stringify({images:selection.rows.length,articles:selection.dois.length,target:pending.policy.targetNewArticles,tailStable:pending.tail.stable,tailAgeMs:pending.tail.ageMs,release:selection.release,changed,stageError:inputs.stageError,localCaptureError:inputs.localCaptureError}));
    if(process.env.GITHUB_OUTPUT)await writeFile(process.env.GITHUB_OUTPUT,'changed='+(changed?'true':'false')+'\\n',{flag:'a'});"""
s=once(s,old,new)
save(p,s)

# Defense in depth in the static local-capture merge: use the same generalized DOI extraction as Worker.
p=Path('cloudflare/scripts/merge-local-captures.mjs');s=p.read_text()
a=s.index('function embeddedNatureDoi(');b=s.index('\nfunction trueToc(',a)
replacement=r"""function embeddedKnownDois(value) {
  let decoded=String(value||'').split(/[?#]/,1)[0];
  for(let i=0;i<3;i+=1){try{const next=decodeURIComponent(decoded);if(next===decoded)break;decoded=next;}catch{break;}}
  const found=new Set();
  for(const match of decoded.matchAll(/10\.(1021|1002|1038|1126|1039|1016|31635)[\/_]([a-z0-9._()-]+)/ig)){
    const doi=normalizeDoi('10.'+match[1]+'/'+match[2]);if(doi)found.add(doi);
  }
  try{const u=new URL(decoded);if(/^(?:www\.)?nature\.com$/i.test(u.hostname)){const m=u.pathname.match(/^\/articles\/(s\d+-\d+-\d+[a-z0-9-]*)/i);if(m)found.add(normalizeDoi('10.1038/'+m[1]));}}catch{}
  return [...found].filter(Boolean);
}
function captureBelongsToDoi(capture,doi){
  const target=normalizeDoi(doi||'');if(!target)return false;
  const embedded=[...new Set([...embeddedKnownDois(capture?.articleUrl||''),...embeddedKnownDois(capture?.sourceUrl||'')])];
  return embedded.every(value=>value===target);
}
"""
s=s[:a]+replacement+s[b:];save(p,s)

# Five-minute inspection; normally target 20+ ready articles, but a stable tail may flush below 20.
p=Path('.github/workflows/new-body-continuous.yml');s=p.read_text()
s=s.replace("    - cron: '7,22,37,52 * * * *'","    - cron: '*/5 * * * *'",1)
s=s.replace('      - name: Read stored metadata and current publication ledger only','      - name: Read stored TOC/body metadata; target twenty articles or flush a stable tail',1)
save(p,s)

# Documentation.
p=Path('docs/body-media-publication.md');s=p.read_text()
s=s.replace('Each batch is at most five papers and thirty images.','Manual review envelopes remain at most five papers and thirty images. The NEW-current-capture automatic publication consumer targets 20 and caps at 25 distinct articles per deployment, up to 150 new body images, and requires an official TOC for every automatically published article. A qualifying official TOC may already be public or may be a verified current local capture that is merged earlier in the SAME Pages build. If fewer than 20 article groups remain, the consumer waits only while the eligible set is still changing; after 15 minutes with no new eligible TOC/body evidence it flushes the stable tail instead of waiting indefinitely.',1)
s += "\n## Paired TOC + body batching (2026-09-23)\n\nFor current server-marked ACS captures, the lightweight consumer checks every five minutes and normally starts a heavy Pages publication at 20–25 distinct current-corpus articles. If only 1–19 eligible articles remain and their qualifying TOC/body evidence has not changed for 15 minutes, that stable tail is released instead of waiting for an artificial twentieth article. Every article must have a true official TOC (never Figure 1 fallback) either already deployed or present as a strongly DOI-bound current local capture. The Pages build merges local official TOCs before body publication, so a newly captured TOC and its validated body figures can appear in the same deployment. If a target-sized batch loses enough articles during actual byte validation to fall below 20, the NEW rows are withheld for a later pass; a deliberately flushed stable tail only requires at least one article survive validation. Prior published media is always carried forward. Failure diagnostics continue through the Tampermonkey report outbox independently of this batching cadence.\n"
p.write_text(s)

# Keep the existing real-byte auto-publication regression in a deliberately small test mode only.
p=Path('scripts/test-new-body-auto.mjs');s=p.read_text()
s=s.replace("const opts={inputs,now,decoder,getNew:", "const opts={inputs,now,testMode:true,decoder,getNew:", 1)
p.write_text(s)
print('BATCH20_PAIRED_PATCH_APPLIED')
