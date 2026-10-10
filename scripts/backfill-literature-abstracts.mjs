// Public DOI metadata only. Separate from the 08:00 literature admission writer.
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {ABSTRACT_SCHEMA,cleanAbstract,normalizedDoi,openAlexAbstract,
  validAbstractRecord,emptyAbstractRegistry} from '../shared/literature-abstracts.mjs';

const ROOT=process.cwd();
const FILE=path.join(ROOT,'public/literature-abstracts.json');
const REPORT=path.join(ROOT,'audit/abstract-coverage.json');
const LIMIT=Math.min(1500,Math.max(1,Number(process.env.ABSTRACT_BACKFILL_LIMIT||1200)));
const CONCURRENCY=Math.min(8,Math.max(1,Number(process.env.ABSTRACT_FETCH_CONCURRENCY||5)));
const NOW=new Date().toISOString(),RETRY_MS=5*24*60*60*1000;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const safe=async(p,fallback)=>{try{return JSON.parse(await readFile(p,'utf8'));}catch(e){if(e?.code==='ENOENT')return fallback;throw e;}};
async function getJson(url,maxBytes=2500000){
  let error=null;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(url,{headers:{accept:'application/json',
        'user-agent':'OrganicSynthesisGallery-AbstractMetadata/1.0 (research-indexing)'},
        signal:AbortSignal.timeout(14000)});
      if(response.status===404)return null;
      if([401,403].includes(response.status))throw new Error('access_denied_'+response.status);
      if(!response.ok)throw new Error('metadata_http_'+response.status);
      const length=Number(response.headers.get('content-length')||0);
      if(length>maxBytes)throw new Error('metadata_response_over_budget');
      const raw=await response.text();
      if(Buffer.byteLength(raw)>maxBytes)throw new Error('metadata_response_over_budget');
      return JSON.parse(raw);
    }catch(e){
      error=e;
      if(/access_denied|over_budget/.test(String(e?.message||'')))break;
      if(attempt<2)await sleep((attempt+1)*900);
    }
  }
  throw error||new Error('metadata_unavailable');
}
function record(doi,source,sourceUrl,abstract){
  const text=cleanAbstract(abstract);
  return text?{abstract:text,source,sourceUrl,verifiedAt:NOW,language:'en'}:null;
}
async function crossref(doi){
  const url='https://api.crossref.org/works/'+encodeURIComponent(doi);
  const payload=await getJson(url);
  if(normalizedDoi(payload?.message?.DOI)!==doi)return null;
  return record(doi,'crossref',url,payload.message.abstract);
}
async function openalex(doi){
  const url='https://api.openalex.org/works/https://doi.org/'+doi
    +'?select=doi,abstract_inverted_index';
  const payload=await getJson(url);
  if(normalizedDoi(payload?.doi)!==doi)return null;
  return record(doi,'openalex',url,openAlexAbstract(payload.abstract_inverted_index));
}
async function europepmc(doi){
  const url='https://www.ebi.ac.uk/europepmc/webservices/rest/search?query='+
    encodeURIComponent('DOI:"'+doi+'"')+'&resultType=core&format=json&pageSize=5';
  const payload=await getJson(url);
  const entry=(payload?.resultList?.result||[]).find(item=>normalizedDoi(item.doi)===doi);
  return entry?record(doi,'europepmc',url,entry.abstractText):null;
}
async function resolve(doi){
  const failures=[];
  for(const [name,fn] of [['crossref',crossref],['openalex',openalex],['europepmc',europepmc]]){
    try{const out=await fn(doi);if(out)return {row:out};}
    catch(e){failures.push(name+':'+String(e?.message||e).slice(0,100));}
  }
  return {reason:failures.length?'source_unavailable':'not_deposited',
    errors:failures,checkedAt:NOW};
}
async function atomic(file,body){
  await mkdir(path.dirname(file),{recursive:true});
  const tmp=file+'.new-'+process.pid;
  await writeFile(tmp,JSON.stringify(body,null,2)+'\n','utf8');
  await rename(tmp,file);
}
const queue=await safe(path.join(ROOT,'public/toc-demand-live.json'),null);
if(!Array.isArray(queue?.articles)||queue.articles.length!==queue.webpageDoiCount)
  throw new Error('canonical_public_registry_invalid');
const unique=new Set();
for(const article of queue.articles){
  const doi=normalizedDoi(article?.doi);
  if(!doi||unique.has(doi))throw new Error('canonical_registry_duplicate_or_invalid_doi');
  unique.add(doi);
}
// Later history generations may add an independent, verified non-new archive registry.
// Do not invent or collect unrelated DOI records during this metadata-only task.
const optional=await safe(path.join(ROOT,'public/literature-archive-dois.json'),null);
if(optional){
  if(optional.schemaVersion!=='gallery-reviewed-archive-dois-v1'||!Array.isArray(optional.dois))
    throw new Error('historical_archive_doi_registry_unverified');
  for(const raw of optional.dois){
    const doi=normalizedDoi(raw);
    if(!doi)throw new Error('historical_archive_invalid_doi');
    unique.add(doi);
  }
}
const raw=await safe(FILE,emptyAbstractRegistry());
if(raw.schemaVersion!==ABSTRACT_SCHEMA||!raw.items||typeof raw.items!=='object'
  ||Array.isArray(raw.items)||!raw.unavailable||typeof raw.unavailable!=='object')
  throw new Error('abstract_registry_invalid');
const index=raw;
for(const doi of Object.keys(index.items)){
  if(!unique.has(doi))delete index.items[doi];
  else if(!validAbstractRecord(doi,index.items[doi]))throw new Error('abstract_record_unverified:'+doi);
}
for(const doi of Object.keys(index.unavailable))if(!unique.has(doi)||index.items[doi])delete index.unavailable[doi];
const work=[...unique].sort().filter(doi=>{
  if(index.items[doi])return false;
  const previous=index.unavailable[doi];
  if(!previous?.checkedAt)return true;
  return Date.now()-Date.parse(previous.checkedAt)>=RETRY_MS;
}).slice(0,LIMIT);
let next=0,attempted=0,readyNew=0,missingNew=0,errors=0;
async function worker(){
  while(true){
    const i=next++;
    if(i>=work.length)return;
    const doi=work[i],result=await resolve(doi);
    attempted++;
    if(result.row){index.items[doi]=result.row;delete index.unavailable[doi];readyNew++;}
    else{
      index.unavailable[doi]=result;
      missingNew++;if(result.errors?.length)errors++;
    }
    if(attempted%40===0){
      const done={done:attempted,requested:work.length,readyNew,missingNew,errors};
      console.log('ABSTRACT_BATCH '+JSON.stringify(done));
      // Periodic local checkpoint; only verified snapshots are committed by the workflow.
      await atomic(FILE,{...index,generatedAt:NOW});
    }
  }
}
await Promise.all(Array.from({length:Math.min(CONCURRENCY,work.length||1)},worker));
const sources={};for(const item of Object.values(index.items))sources[item.source]=(sources[item.source]||0)+1;
const inScope=unique.size,ready=Object.keys(index.items).length;
index.schemaVersion=ABSTRACT_SCHEMA;
index.generatedAt=NOW;
index.coverage={inScope,ready,missing:Object.keys(index.unavailable).length,
  unchecked:inScope-ready-Object.keys(index.unavailable).length,sources};
await atomic(FILE,index);
const report={schemaVersion:'gallery-abstract-coverage-v1',generatedAt:NOW,
  indexSchema:ABSTRACT_SCHEMA,canonicalRegistryCount:queue.webpageDoiCount,
  archiveRegistryCount:inScope-queue.webpageDoiCount,
  ...index.coverage,attempted,readyNew,missingNew,sourceFailures:errors,
  remainingRetryEligible:[...unique].filter(d=>!index.items[d]&&!index.unavailable[d]).length,
  notYetPubliclyAvailableDois:Object.keys(index.unavailable).slice(0,100),
  note:'DOI-bound original abstract metadata; missing != absent article. This job does not admit, reorder or create literature cards.'};
await atomic(REPORT,report);
console.log('ABSTRACT_COVERAGE '+JSON.stringify(report));
