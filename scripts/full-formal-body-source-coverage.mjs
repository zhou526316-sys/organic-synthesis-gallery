// Full FORMAL DOI catalog source census, not a 20-article historical sample.
// A single workflow fans out every formally published DOI. Public body writes
// and publisher/PDF/SI/media requests are deliberately absent from this file.
import {createHash} from 'node:crypto';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {inspect,limitedGet,loadPublishedHistorical,doi as canonicalDoi} from './lib/historical-open-xml-pilot.mjs';

export const SCHEMA='full-formal-body-source-coverage-v1';
const SHA=/^[a-f0-9]{64}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const hash=s=>createHash('sha256').update(s).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const flag=(name,fallback='')=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3)??fallback;
const integer=(value,name)=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw Error(name+'_invalid');return n;};
const category=date=>!DATE.test(date)?'date_unverified':date<'2026-07-01'?'pre_july':date<'2026-10-01'?'july_september':'october_plus';
const safeState=state=>/^[a-z][a-z0-9_]*$/.test(String(state||''))?state:'unknown';

export function makeFullPlan(release,articles,chunkSize=100){
  if(!SHA.test(String(release?.architectureCatalogId||''))||
     !Number.isSafeInteger(release?.productionCards)||
     !Array.isArray(release?.dois)||
     release.dois.length!==release.productionCards||
     !Array.isArray(articles)||
     articles.length!==release.dois.length)
    throw Error('formal_catalog_size_or_generation_mismatch');
  if(!Number.isSafeInteger(chunkSize)||chunkSize<1||chunkSize>250)
    throw Error('technical_chunk_size_invalid');
  const ids=release.dois.map(canonicalDoi),allowed=new Set(ids);
  if(allowed.size!==ids.length||ids.some(x=>!x))throw Error('formal_doi_list_invalid');
  const rows=[],seen=new Set();
  for(const value of articles){
    const key=canonicalDoi(value?.doi);
    const date=String(value?.date||'');
    if(!allowed.has(key)||seen.has(key)||
       !SHA.test(String(value?.revision||''))||
       !String(value?.journal||'').trim()||
       (date&&!DATE.test(date)))throw Error('formal_catalog_identity_or_revision_invalid');
    seen.add(key);
    rows.push({doi:key,journal:String(value.journal),date,revision:value.revision,scope:category(date)});
  }
  if(seen.size!==allowed.size)throw Error('formal_catalog_missing_member');
  rows.sort((a,b)=>a.doi.localeCompare(b.doi));
  const catalogId=release.architectureCatalogId;
  const planSha256=hash(catalogId+'\n'+rows.map(r=>r.doi+'|'+r.revision+'|'+r.date).join('\n'));
  const shards=[];
  for(let offset=0;offset<rows.length;offset+=chunkSize)
    shards.push({offset,count:Math.min(chunkSize,rows.length-offset)});
  const scopeCounts={};
  for(const row of rows)scopeCounts[row.scope]=(scopeCounts[row.scope]||0)+1;
  return {schemaVersion:SCHEMA,readOnly:true,catalogId,planSha256,
    totalFormalDois:rows.length,scopeCounts,technicalChunkSize:chunkSize,
    shards,rows,publicBodyImports:0,originalXmlStored:0,publisherVisits:0,pdfDownloads:0};
}

export function validateFullPlan(plan){
  if(plan?.schemaVersion!==SCHEMA||plan.readOnly!==true||
     !SHA.test(String(plan.catalogId||''))||
     !SHA.test(String(plan.planSha256||''))||
     !Array.isArray(plan.rows)||!Array.isArray(plan.shards)||
     plan.rows.length!==plan.totalFormalDois)
    throw Error('full_plan_invalid');
  const expected=hash(plan.catalogId+'\n'+plan.rows.map(r=>r.doi+'|'+r.revision+'|'+r.date).join('\n'));
  if(expected!==plan.planSha256)throw Error('full_plan_digest_changed');
  let cursor=0;const seen=new Set();
  for(const shard of plan.shards){
    if(!Number.isSafeInteger(shard.offset)||shard.offset!==cursor||
       !Number.isSafeInteger(shard.count)||shard.count<1||shard.count>250)
      throw Error('full_plan_noncontiguous_shards');
    cursor+=shard.count;
  }
  if(cursor!==plan.rows.length)throw Error('full_plan_incomplete_shards');
  for(const r of plan.rows){
    if(!canonicalDoi(r.doi)||!SHA.test(r.revision)||seen.has(r.doi))
      throw Error('full_plan_doi_duplicate_or_invalid');
    seen.add(r.doi);
  }
  return plan;
}

export async function latestGenerationMatches(plan,get=limitedGet){
  const url='https://gallery.gczhouwld.com/release-delivery.json';
  const release=JSON.parse(await get(url,'json',6000000));
  const ids=Array.isArray(release.dois)?release.dois.map(canonicalDoi):[];
  if(release.architectureCatalogId!==plan.catalogId||
     release.productionCards!==plan.rows.length||
     ids.length!==plan.rows.length)
    throw Error('full_source_catalog_generation_changed');
  const current=new Set(ids);
  if(current.size!==plan.rows.length||plan.rows.some(r=>!current.has(r.doi)))
    throw Error('full_source_catalog_doi_set_changed');
  return true;
}

export function aggregateFullReports(plan,reports){
  validateFullPlan(plan);
  const seen=new Set(),states={},scopes={},articles=[],missingShards=[],badShards=[];
  const byOffset=new Map();
  for(const report of reports){
    if(report?.schemaVersion!==SCHEMA||
       report.catalogId!==plan.catalogId||
       report.planSha256!==plan.planSha256||
       !Number.isSafeInteger(report.offset)||byOffset.has(report.offset)||
       !Array.isArray(report.entries)){
      badShards.push(report?.offset??null);continue;
    }
    byOffset.set(report.offset,report);
  }
  for(const shard of plan.shards){
    const report=byOffset.get(shard.offset);
    if(!report){missingShards.push(shard.offset);continue;}
    if(report.entries.length!==shard.count||report.count!==shard.count){
      badShards.push(shard.offset);continue;
    }
    const local=[];
    for(let i=0;i<shard.count;i++){
      const p=plan.rows[shard.offset+i],item=report.entries[i];
      if(item?.doi!==p.doi||item?.revision!==p.revision||
         item?.journal!==p.journal||seen.has(item.doi)){
        badShards.push(shard.offset);local.length=0;break;
      }
      local.push(item);
    }
    if(!local.length)continue;
    for(const item of local){
      seen.add(item.doi);articles.push(item);
      const state=safeState(item.state);
      states[state]=(states[state]||0)+1;
      const c=category(String(item.publication||''));
      const row=scopes[c]||{doiCount:0,rightsCandidates:0,sourceFailures:0};
      row.doiCount++;
      if(state==='needs_independent_review')row.rightsCandidates++;
      if(state==='provider_paused'||state==='source_unavailable'||
         state==='source_rate_limited'||state.startsWith('source_http_'))
        row.sourceFailures++;
      scopes[c]=row;
    }
  }
  const retryEntries=articles.filter(x=>x.state==='provider_paused'||
    x.state==='source_unavailable'||x.state==='source_rate_limited'||
    String(x.state).startsWith('source_http_')).map(x=>x.doi);
  const missingDois=plan.rows.filter(x=>!seen.has(x.doi)).map(x=>x.doi);
  const rightsCandidates=articles.filter(x=>x.state==='needs_independent_review')
    .map(x=>({doi:x.doi,journal:x.journal,scope:category(x.publication),
      pmcid:x.pmcid||null,license:x.license||null,grade:x.grade||'partial',
      sections:x.sections||0,paragraphs:x.paragraphs||0,figures:x.figures||0,
      tables:x.tables||0,xmlSha256:x.xmlSha256||null}));
  const sourceAuditComplete=missingDois.length===0&&
    retryEntries.length===0&&missingShards.length===0&&badShards.length===0;
  return {schemaVersion:SCHEMA,readOnly:true,generatedAt:new Date().toISOString(),
    catalogId:plan.catalogId,planSha256:plan.planSha256,
    plannedFormalDois:plan.totalFormalDois,enumeratedDois:seen.size,
    sourceCheckedDois:seen.size-retryEntries.length,
    sourceAuditComplete,scopeCounts:plan.scopeCounts,byScope:scopes,byState:states,
    rightsCandidateCount:rightsCandidates.length,rightsCandidates,
    missingShardOffsets:missingShards,badShardOffsets:badShards,
    missingDois,retryDois:retryEntries,
    publicBodyImports:0,rawXmlStored:0,pdfDownloads:0,publisherVisits:0,
    statement:'Source census is NOT scientific/rights approval or public FTS ingestion.'};
}

async function planCommand(){
  const loaded=await loadPublishedHistorical({dateTo:null,maxPages:100});
  if(loaded.matched!==loaded.release.productionCards)
    throw Error('full_formal_catalog_not_completely_returned');
  const size=integer(flag('chunk-size','100'),'chunk_size');
  const plan=makeFullPlan(loaded.release,loaded.registry.articles,size);
  await writeFile(flag('output','/tmp/full-formal-plan.json'),JSON.stringify(plan,null,2)+'\n');
  console.log('FULL_FORMAL_SOURCE_PLAN '+JSON.stringify({catalogId:plan.catalogId,
    formalDois:plan.totalFormalDois,scopes:plan.scopeCounts,shards:plan.shards.length,
    no20DoiOverallCap:true}));
}

async function scanCommand(){
  const plan=validateFullPlan(JSON.parse(await readFile(flag('plan'), 'utf8')));
  const offset=integer(flag('offset'),'offset'),count=integer(flag('count'),'count');
  if(!plan.shards.some(s=>s.offset===offset&&s.count===count))
    throw Error('full_source_shard_not_in_plan');
  await latestGenerationMatches(plan);
  const selected=plan.rows.slice(offset,offset+count);
  const result={schemaVersion:SCHEMA,readOnly:true,at:new Date().toISOString(),
    catalogId:plan.catalogId,planSha256:plan.planSha256,
    totalFormalDois:plan.totalFormalDois,offset,count,entries:[],
    originalXmlStored:0,publicBodyImports:0,pdfDownloads:0,publisherVisits:0};
  let paused=false;
  const output=flag('output','/tmp/full-formal-source-window.json');
  for(const row of selected){
    let data={state:'unknown'};
    if(paused)data={state:'provider_paused'};
    else {
      try{data=await inspect(row);}
      catch(e){
        const msg=String(e?.message||'');
        data={state:msg==='source_rate_limited'?'source_rate_limited':
          /^source_http_\d+$/.test(msg)?msg:'source_unavailable'};
        if(msg==='source_rate_limited')paused=true;
      }
      await sleep(500);
    }
    result.entries.push({doi:row.doi,journal:row.journal,publication:row.date,
      revision:row.revision,...data});
    if(result.entries.length%10===0||result.entries.length===selected.length)
      await writeFile(output,JSON.stringify(result,null,2)+'\n');
  }
  await latestGenerationMatches(plan);
  const states={};
  for(const row of result.entries)states[row.state]=(states[row.state]||0)+1;
  console.log('FULL_FORMAL_SOURCE_WINDOW '+JSON.stringify({catalogId:plan.catalogId,
    offset,count,states,paused,rawXmlStored:0,publicBodyImports:0}));
}

async function aggregateCommand(){
  const plan=validateFullPlan(JSON.parse(await readFile(flag('plan'),'utf8')));
  const dir=flag('reports-dir'),files=await readdir(dir),reports=[];
  for(const name of files.filter(x=>/^window-\d+\.json$/.test(x)).sort()){
    try{reports.push(JSON.parse(await readFile(dir+'/'+name,'utf8')));}
    catch(e){console.error('CORRUPT_FULL_SOURCE_REPORT '+name+' '+String(e?.message||''));}
  }
  const summary=aggregateFullReports(plan,reports);
  try{await latestGenerationMatches(plan);}
  catch(error){summary.sourceAuditComplete=false;summary.generationCheck=String(error?.message||'unavailable');}
  await writeFile(flag('output','/tmp/full-formal-source-summary.json'),JSON.stringify(summary,null,2)+'\n');
  console.log('FULL_FORMAL_SOURCE_SUMMARY '+JSON.stringify({
    catalogId:summary.catalogId,planned:summary.plannedFormalDois,
    enumerated:summary.enumeratedDois,checked:summary.sourceCheckedDois,
    sourceAuditComplete:summary.sourceAuditComplete,
    rightsCandidates:summary.rightsCandidateCount,states:summary.byState,
    missingShards:summary.missingShardOffsets,retry:summary.retryDois.length,
    publicBodyImports:0}));
  if(!summary.sourceAuditComplete)process.exitCode=2;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const mode=['--plan','--scan','--aggregate'].filter(m=>process.argv.includes(m));
  try{
    if(mode.length!==1)throw Error('choose_one_full_source_mode');
    if(mode[0]==='--plan')await planCommand();
    else if(mode[0]==='--scan')await scanCommand();
    else await aggregateCommand();
  }catch(e){
    console.error('FULL_FORMAL_SOURCE_FAILED '+String(e?.message||e).slice(0,180));
    process.exitCode=1;
  }
}
