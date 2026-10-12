// Read-only pilot: DOI-bound historical fulltext SOURCE availability, not text acquisition.
// No article/PDF/SI downloaded, no Gallery admissions, no D1/R2 writes.
// Example: node scripts/historical-text-source-audit.mjs --limit=50 --output=/tmp/historical-text-source-audit.json
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

export const CUT_OFF='2026-10-01';
const DOI=/^10\.\d{4,9}\/\S+$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function normalizedDoi(value){
  const v=String(value||'').trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'');
  return DOI.test(v)?v:'';
}
export function selectHistoricalSample(registry, limit=50){
  const count=Math.max(1,Math.min(100,Number(limit)||50));
  const groups=new Map(), seen=new Set();
  for(const row of registry?.articles||[]){
    const doi=normalizedDoi(row?.doi);
    const publication=String(row?.date||row?.firstOnlineDate||'');
    const journal=String(row?.journal||'').trim();
    if(!doi||seen.has(doi)||!DATE.test(publication)||publication>=CUT_OFF||!journal)continue;
    seen.add(doi);
    if(!groups.has(journal))groups.set(journal,[]);
    groups.get(journal).push({doi,journal,publication,mediaPolicy:row?.mediaPolicy||''});
  }
  const journals=[...groups].sort(([a],[b])=>a.localeCompare(b));
  // Stable oldest/newest alternation and journal round-robin avoids a single
  // large journal overwhelming the pilot. No candidates may enter from staging.
  for(const [,rows] of journals)rows.sort((a,b)=>a.publication.localeCompare(b.publication)||a.doi.localeCompare(b.doi));
  const selected=[];
  for(let index=0;selected.length<count;index++){
    let moved=false;
    for(const [,rows] of journals){
      const row=rows.length ? (index%2===0?rows.shift():rows.pop()) : null;
      if(row){selected.push(row);moved=true;}
      if(selected.length===count)break;
    }
    if(!moved)break;
  }
  return selected;
}
export function classifyOpenAlex(row, work){
  if(normalizedDoi(work?.doi)!==row.doi)return {state:'doi_mismatch',tei:false,oa:false,license:null};
  const rawLicense=work?.best_oa_location?.license;
  const license=typeof rawLicense==='string' ? rawLicense.trim().toLowerCase().slice(0,80) : null;
  const tei=work?.has_content?.grobid_xml===true
    && typeof work?.content_urls?.grobid_xml==='string'
    && /^https:\/\/content\.openalex\.org\/works\/W\d+\.grobid-xml(?:\?.*)?$/i.test(work.content_urls.grobid_xml);
  return {state:'verified',tei,oa:work?.open_access?.is_oa===true,license,
    // OA or a present download URL alone never licenses Gallery redistribution.
    rights:'requires_item_license_review'};
}
async function getWork(doi, apiKey){
  const url='https://api.openalex.org/works/https://doi.org/'+encodeURI(doi);
  const target=new URL(url);
  if(apiKey)target.searchParams.set('api_key',apiKey);
  let response;
  for(let attempt=0;attempt<2;attempt++){
    response=await fetch(target,{
      headers:{accept:'application/json','user-agent':'OrganicSynthesisGallery-metadata-pilot/1.0'},
      signal:AbortSignal.timeout(14000)
    });
    if(response.status!==429||attempt===1)break;
    const seconds=Number(response.headers.get('retry-after'));
    await delay(Number.isFinite(seconds)&&seconds>0?Math.min(seconds*1000,5000):1500);
  }
  if(response.status===404)return {state:'not_found'};
  if(!response.ok)return {state:'http_'+response.status};
  const type=response.headers.get('content-type')||'';
  if(!type.includes('json'))return {state:'invalid_response'};
  const raw=await response.text();
  if(raw.length>800000)return {state:'response_too_large'};
  return {state:'ok',work:JSON.parse(raw)};
}
export async function runPilot({registryPath='public/toc-demand-live.json',
  limit=50,output='/tmp/gallery-historical-text-source-pilot.json',
  offline=false,apiKey=process.env.OPENALEX_API_KEY||''}={}){
  const registry=JSON.parse(await readFile(registryPath,'utf8'));
  const sample=selectHistoricalSample(registry,limit);
  const result={schemaVersion:'gallery-historical-text-source-pilot-v1',
    checkedAt:new Date().toISOString(),readOnly:true,productionWrites:0,
    pdfRequests:0,articleTextRequests:0,source:'OpenAlex work metadata',
    catalogGeneratedAt:registry.generatedAt||null,catalogSize:Number(registry.webpageDoiCount||0),
    historicalCandidates:sample.length,sampledDois:sample.map(x=>x.doi),
    byJournal:{},byState:{},entries:[]};
  for(const row of sample){
    result.byJournal[row.journal]=(result.byJournal[row.journal]||0)+1;
    let data={state:offline?'dry_run':'unknown'};
    if(!offline){
      try{
        const fetched=await getWork(row.doi,apiKey);
        data=fetched.state==='ok'?classifyOpenAlex(row,fetched.work):{state:fetched.state,tei:false,oa:false,license:null};
      }catch(error){
        data={state:error?.name==='TimeoutError'?'timeout':'transport_error',tei:false,oa:false,license:null};
      }
      // Bounded, sequential, metered source inspection. No speculative 429 loops.
      await delay(300);
    }
    result.byState[data.state]=(result.byState[data.state]||0)+1;
    result.entries.push({doi:row.doi,journal:row.journal,publication:row.publication,
      ...data});
  }
  result.verifiedTei=result.entries.filter(x=>x.state==='verified'&&x.tei).length;
  result.licensedTei=0; // Availability does not by itself prove permission.
  await writeFile(output,JSON.stringify(result,null,2)+'\n');
  console.log('HISTORICAL_TEXT_SOURCE_PILOT '+JSON.stringify({
    sampled:sample.length,verifiedTei:result.verifiedTei,licensedTei:0,
    offline,byState:result.byState,byJournal:result.byJournal,
    pdfRequests:0,articleTextRequests:0,productionWrites:0
  }));
  return result;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const get=(name,fallback)=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3)||fallback;
  runPilot({registryPath:get('catalog','public/toc-demand-live.json'),
    limit:Number(get('limit','50')),output:get('output','/tmp/gallery-historical-text-source-pilot.json'),
    offline:process.argv.includes('--dry-run')}).catch(error=>{
      console.error('HISTORICAL_TEXT_SOURCE_PILOT_FAILED '+String(error?.message||error).slice(0,180));
      process.exitCode=1;
    });
}
