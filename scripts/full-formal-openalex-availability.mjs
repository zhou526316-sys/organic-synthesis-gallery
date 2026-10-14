// OpenAlex DOI-level metadata availability across the ENTIRE formal catalog.
// NO full article, GROBID XML, PDF, publisher page, or image is downloaded.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadPublishedHistorical,doi as canonicalDoi} from './lib/historical-open-xml-pilot.mjs';
import {makeFullPlan,validateFullPlan,latestGenerationMatches} from './full-formal-body-source-coverage.mjs';
import {classifyOpenAlex} from './historical-text-source-audit.mjs';
export const SCHEMA='full-formal-openalex-availability-v1';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const flag=(k,d='')=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const int=(v,name)=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<0)throw Error(name+'_invalid');return n;};
const safe=s=>String(s||'').replace(/[^a-z0-9_]/gi,'_').slice(0,90);
const VALID=/^https:\/\/content\.openalex\.org\/works\/W\d+\.grobid-xml$/i;

export function selectMetadata(row,work){
  const identity=classifyOpenAlex(row,work);
  if(identity.state!=='verified')return {state:'metadata_doi_mismatch'};
  const tei=Boolean(identity.tei&&VALID.test(String(work?.content_urls?.grobid_xml||'').split('?')[0]));
  const matches=(work?.locations||[]).map(x=>String(x?.license||'').trim().toLowerCase())
    .filter(x=>x&&x.length<=60);
  const licenses=[...new Set(matches)].slice(0,15);
  const oa=identity.oa===true;
  const license=identity.license;
  const kind=tei?'tei_available':'tei_not_available';
  return {state:'verified',oa,tei,sourceFormat:kind,
    oaLicenseSignal:license||null,locationLicenses:licenses,
    oaLocationCount:Math.min(1000,(work?.locations||[]).length),
    openalexId:/^https:\/\/openalex\.org\/W\d+$/.test(String(work?.id||''))?work.id:null,
    isRetracted:work?.is_retracted===true,
    rightsReviewRequired:true,xmlDownloaded:false,
    // Availability and metadata are NOT evidence of a reusable complete article.
    textCompleteness:'not_examined'};
}
export async function fetchOpenAlex(row,{apiKey='',get=fetch}={}){
  const endpoint=new URL('https://api.openalex.org/works/https://doi.org/'+encodeURI(row.doi));
  // Never log a URL bearing credentials; use the Authorization header.
  const headers={accept:'application/json','user-agent':'OrganicSynthesisGallery-openalex-availability/1.0'};
  if(apiKey)headers.authorization='Bearer '+apiKey;
  for(let attempt=0;attempt<2;attempt++){
    const result=await get(endpoint,{headers,redirect:'error',signal:AbortSignal.timeout(15000)});
    if(result.status===404)return {state:'not_found'};
    if(result.status===429){
      if(attempt===0){
        const raw=Number(result.headers.get('retry-after'));
        await sleep(Number.isFinite(raw)&&raw>0?Math.min(raw*1000,5000):2000);
        continue;
      }
      return {state:'source_rate_limited'};
    }
    if(!result.ok)return {state:'source_http_'+result.status};
    if(!String(result.headers.get('content-type')||'').includes('json'))
      return {state:'source_non_json'};
    const body=await result.text();
    if(body.length>1000000)return {state:'source_response_too_large'};
    let work;
    try{work=JSON.parse(body);}catch{return {state:'source_invalid_json'};}
    return selectMetadata(row,work);
  }
  return {state:'source_unavailable'};
}

export function aggregateOpenAlex(plan,reports){
  validateFullPlan(plan);
  const accepted=new Map(),failedShards=[],seenOffsets=new Set();
  for(const report of reports){
    if(report?.schemaVersion!==SCHEMA||report.catalogId!==plan.catalogId||
       report.planSha256!==plan.planSha256||seenOffsets.has(report.offset)||
       !plan.shards.some(s=>s.offset===report.offset&&s.count===report.count)||
       report.entries?.length!==report.count){
      failedShards.push(report?.offset??null);continue;
    }
    seenOffsets.add(report.offset);
    let valid=true;
    for(let i=0;i<report.count;i++){
      const expected=plan.rows[report.offset+i],item=report.entries[i];
      if(item?.doi!==expected?.doi||item?.revision!==expected?.revision||
         accepted.has(item?.doi)){valid=false;break;}
    }
    if(!valid){failedShards.push(report.offset);continue;}
    for(const item of report.entries)accepted.set(item.doi,item);
  }
  const doiLedger=plan.rows.map(r=>{
    const item=accepted.get(r.doi);
    return {doi:r.doi,journal:r.journal,revision:r.revision,
      firstOnlineDate:r.date||null,scope:r.scope,
      source:'OpenAlex metadata',state:item?.state||'not_scanned',
      oa:item?.oa??null,teiAvailable:item?.tei??null,
      oaLicenseSignal:item?.oaLicenseSignal??null,
      locationLicenses:item?.locationLicenses||[],
      openalexId:item?.openalexId||null,isRetracted:item?.isRetracted??null,
      textStored:false,articleRightsApproved:false,publicFtsIndexed:false};
  });
  const states={},scopes={},retryDois=[],metadataVerified=[];
  for(const r of doiLedger){
    states[r.state]=(states[r.state]||0)+1;
    if(r.state==='verified'){
      metadataVerified.push(r);
      scopes[r.scope]=(scopes[r.scope]||0)+1;
    }else if(r.state==='not_scanned'||r.state==='source_rate_limited'||
      r.state==='source_unavailable'||r.state==='source_non_json'||
      r.state.startsWith('source_http_'))
      retryDois.push(r.doi);
  }
  const missingShards=plan.shards.filter(s=>!seenOffsets.has(s.offset)).map(s=>s.offset);
  const ready=retryDois.length===0&&failedShards.length===0&&missingShards.length===0;
  return {schemaVersion:SCHEMA,generatedAt:new Date().toISOString(),
    readOnly:true,catalogId:plan.catalogId,planSha256:plan.planSha256,
    plannedFormalDois:plan.totalFormalDois,reportedDois:accepted.size,
    metadataVerifiedDois:metadataVerified.length,
    oaMetadataDois:metadataVerified.filter(x=>x.oa===true).length,
    teiAvailableDois:metadataVerified.filter(x=>x.teiAvailable===true).length,
    oaTeiDois:metadataVerified.filter(x=>x.teiAvailable===true&&x.oa===true).length,
    sourceAuditComplete:ready,byState:states,verifiedByScope:scopes,
    missingShardOffsets:missingShards,badShardOffsets:failedShards,
    retryDois,doiLedger,
    fullTextDownloads:0,publicBodyImports:0,publicTextSections:0,
    note:'OpenAlex metadata reveals possible text sources; never grants redistribution rights.'};
}
async function plan(){
  const source=await loadPublishedHistorical({dateTo:null});
  if(source.matched!==source.release.productionCards)throw Error('formal_catalog_incomplete');
  const p=makeFullPlan(source.release,source.registry.articles,100);
  await writeFile(flag('output'),JSON.stringify(p,null,2)+'\n');
  console.log('FULL_FORMAL_OPENALEX_PLAN '+JSON.stringify({catalogId:p.catalogId,formal:p.totalFormalDois,shards:p.shards.length}));
}
async function scan(){
  const p=validateFullPlan(JSON.parse(await readFile(flag('plan'),'utf8')));
  const offset=int(flag('offset'),'offset'),count=int(flag('count'),'count');
  if(!p.shards.some(s=>s.offset===offset&&s.count===count))throw Error('unknown_shard');
  await latestGenerationMatches(p);
  const key=process.env.OPENALEX_API_KEY||'';
  const report={schemaVersion:SCHEMA,catalogId:p.catalogId,planSha256:p.planSha256,readOnly:true,
    offset,count,entries:[],fullTextDownloads:0,publicBodyImports:0};
  let paused=false;const path=flag('output');
  for(const row of p.rows.slice(offset,offset+count)){
    let data;
    if(paused)data={state:'provider_paused'};
    else{
      try{data=await fetchOpenAlex(row,{apiKey:key});}
      catch(e){data={state:e?.name==='TimeoutError'?'source_timeout':'source_unavailable'};}
      if(['source_rate_limited','source_http_401'].includes(data.state))paused=true;
      await sleep(500);
    }
    report.entries.push({doi:row.doi,revision:row.revision,...data});
    if(report.entries.length%10===0||report.entries.length===count)
      await writeFile(path,JSON.stringify(report,null,2)+'\n');
  }
  await latestGenerationMatches(p);
  const states={};
  for(const r of report.entries)states[r.state]=(states[r.state]||0)+1;
  console.log('FULL_FORMAL_OPENALEX_WINDOW '+JSON.stringify({offset,count,states,paused,fullTextDownloads:0}));
}
async function aggregate(){
  const p=validateFullPlan(JSON.parse(await readFile(flag('plan'),'utf8')));
  const files=(await readdir(flag('reports-dir'))).filter(x=>/^window-\d+\.json$/.test(x));
  const reports=[];
  for(const f of files){
    try{reports.push(JSON.parse(await readFile(flag('reports-dir')+'/'+f,'utf8')));}
    catch(e){console.error('OPENALEX_SHARD_INVALID '+safe(f));}
  }
  const s=aggregateOpenAlex(p,reports);
  try{await latestGenerationMatches(p);}
  catch(e){s.sourceAuditComplete=false;s.generationCheck=safe(e?.message);}
  await writeFile(flag('output'),JSON.stringify(s,null,2)+'\n');
  console.log('FULL_FORMAL_OPENALEX_SUMMARY '+JSON.stringify({planned:s.plannedFormalDois,
    verified:s.metadataVerifiedDois,oa:s.oaMetadataDois,tei:s.teiAvailableDois,
    oaTei:s.oaTeiDois,complete:s.sourceAuditComplete,states:s.byState,retry:s.retryDois.length}));
  if(!s.sourceAuditComplete)process.exitCode=2;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    const modes=['--plan','--scan','--aggregate'].filter(x=>process.argv.includes(x));
    if(modes.length!==1)throw Error('mode_required');
    if(modes[0]==='--plan')await plan();
    else if(modes[0]==='--scan')await scan();
    else await aggregate();
  }catch(e){
    console.error('FULL_FORMAL_OPENALEX_FAILED '+safe(e?.message||e));
    process.exitCode=1;
  }
}
