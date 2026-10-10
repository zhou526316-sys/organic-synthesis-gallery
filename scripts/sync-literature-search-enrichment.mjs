// Search-only metadata enrichment. Reads the already published DOI set; never
// changes literature admission, static cards, dates, media or PDF inventories.
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';

const SITE=new URL(process.env.SITE_URL||'https://gallery.gczhouwld.com/');
const WORKER=new URL(process.env.WORKER_URL||'https://organic-synthesis-gallery.zhou526316.workers.dev/');
const TOKEN=String(process.env.BRIDGE_WRITE_TOKEN||'').trim();
const OPENALEX_KEY=String(process.env.OPENALEX_API_KEY||'').trim();
const REPORT=process.env.SEARCH_ENRICHMENT_REPORT||'/tmp/literature-search-enrichment-report.json';
const SHA=/^[a-f0-9]{64}$/;
const DOI=/^10\.\d{4,9}\/\S+$/;
const LIMIT=8;
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const digest=value=>createHash('sha256').update(String(value)).digest('hex');
const normalizeDoi=value=>{
  const x=String(value||'').toLowerCase().trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'');
  return DOI.test(x)?x:'';
};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(url,{method='GET',body,authorized=false,retries=2}={}){
  const address=new URL(url);
  for(let n=0;n<=retries;n++){
    try {
      const result=await fetch(address,{
        method,
        headers:{
          accept:'application/json',
          ...(authorized?{authorization:'Bearer '+TOKEN}:{}),
          ...(body?{'content-type':'application/json'}:{}),
          'user-agent':'OrganicSynthesisGallery-SearchEnrichment/1.0 (metadata indexing)',
        },
        ...(body?{body:JSON.stringify(body)}:{}),
        signal:AbortSignal.timeout(22000),
      });
      if(!result.ok) {
        if(n<retries&&[429,500,502,503,504].includes(result.status)){
          await pause(700*(n+1));continue;
        }
        throw new Error('metadata_http_'+result.status+':'+address.host+address.pathname);
      }
      return result.json();
    }catch(error){
      if(n===retries)throw error;
      await pause(700*(n+1));
    }
  }
}
const api=(path,options={})=>request(new URL(path,WORKER),{...options,authorized:true});
function decodeInvertedIndex(index){
  if(!index||typeof index!=='object')return '';
  const text=[];
  for(const [word,positions] of Object.entries(index)){
    if(!Array.isArray(positions)||typeof word!=='string')continue;
    for(const p of positions){
      if(Number.isInteger(p)&&p>=0&&p<3600)text[p]=word;
    }
  }
  return text.filter(Boolean).join(' ').slice(0,16000).replace(/\s+/g,' ').trim();
}
function decodeEntities(text){
  const map={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi,(m,code)=>{
    const value=code.toLowerCase();
    if(value.startsWith('#')){
      const cp=value.startsWith('#x')?parseInt(value.slice(2),16):parseInt(value.slice(1),10);
      return Number.isInteger(cp)&&cp>=32&&cp<=0x10ffff?String.fromCodePoint(cp):' ';
    }
    return map[value]??m;
  });
}
function crossrefAbstract(xml) {
  if(typeof xml!=='string')return '';
  // Crossref supplies JATS XML, not verified publisher full text.
  return decodeEntities(xml.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim().slice(0,16000);
}
async function openalexBatch(dois){
  const url=new URL('https://api.openalex.org/works');
  url.searchParams.set('filter','doi:'+dois.map(doi=>'https://doi.org/'+doi).join('|'));
  url.searchParams.set('per-page','50');
  url.searchParams.set('select','doi,abstract_inverted_index');
  if(OPENALEX_KEY)url.searchParams.set('api_key',OPENALEX_KEY);
  const data=await request(url,{retries:1});
  const allowed=new Set(dois),out=new Map();
  for(const record of data.results||[]){
    const doi=normalizeDoi(record?.doi);
    if(!allowed.has(doi))continue;
    const text=decodeInvertedIndex(record.abstract_inverted_index);
    if(text)out.set(doi,text);
  }
  return out;
}
async function publishedIndexRows(catalogId,count){
  const rows=[],seen=new Set();let afterDoi='';
  for(let n=0;n<500;n++){
    const params=new URLSearchParams({catalogId,limit:'200'});
    if(afterDoi)params.set('afterDoi',afterDoi);
    const response=await api('/api/admin/literature-catalog-index/rows?'+params.toString());
    assert(response.catalogId===catalogId,'search_index_catalog_changed');
    for(const row of response.items||[]){
      const doi=normalizeDoi(row.doi);
      assert(doi&&SHA.test(row.revision)&&!seen.has(doi),'invalid_index_doi_revision');
      rows.push({doi,revision:row.revision});seen.add(doi);
    }
    if(!response.hasMore)break;
    assert(response.nextAfterDoi&&response.nextAfterDoi!==afterDoi,'search_index_cursor_stalled');
    afterDoi=response.nextAfterDoi;
  }
  assert(rows.length===count,'base_catalog_index_not_complete');
  return rows;
}
async function hydrateAbstracts(dois,report){
  const found=new Map();
  // OR-filter lookup is cheap and bounded (35 DOI per call); no publisher auth.
  for(let i=0;i<dois.length;i+=35){
    const batch=dois.slice(i,i+35);
    try{
      const enriched=await openalexBatch(batch);
      for(const [doi,abstract] of enriched)found.set(doi,{abstract,source:'openalex'});
    }catch(error){
      report.openAlexErrors.push({offset:i,error:String(error.message||error).slice(0,180)});
    }
  }
  // Prefer deposited Crossref abstracts for a bounded sample of OpenAlex misses.
  // Later published generations can retry unresolved DOI metadata.
  const misses=dois.filter(doi=>!found.has(doi));
  // Fetch all initially missing DOI metadata across bounded nightly passes,
  // rather than silently limiting fallback to the first 40 forever.
  const crossrefLimit=Math.min(misses.length,Math.max(1,Math.min(400,
    Number(process.env.CROSSREF_FALLBACK_LIMIT??'280'))));
  const batch=misses.slice(0,crossrefLimit);
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(5,batch.length)},async()=>{
    for(;;){
      const position=cursor++;
      if(position>=batch.length)return;
      const doi=batch[position];
      try{
        const response=await request('https://api.crossref.org/works/'+encodeURIComponent(doi),{retries:1});
        const record=response.message;
        if(normalizeDoi(record?.DOI)!==doi)continue;
        const abstract=crossrefAbstract(record.abstract);
        if(abstract)found.set(doi,{abstract,source:'crossref'});
      }catch(error){
        report.crossrefErrors.push({doi,error:String(error.message||error).slice(0,150)});
      }
    }
  }));
  report.crossrefAttempted=crossrefLimit;
  report.unattemptedOpenAlexMisses=misses.length-crossrefLimit;
  return found;
}
// Bounded paged administrative read; public read never exposes raw full abstracts.
async function currentMissingAbstractRows(catalogId){
  const items=[];let afterDoi='',previous=null;
  for(let page=0;page<500;page++){
    const params=new URLSearchParams({catalogId,limit:'200'});
    if(afterDoi)params.set('afterDoi',afterDoi);
    const status=await api('/api/admin/literature-search-enrichment/coverage?'+params);
    assert(status.ok===true&&status.catalogId===catalogId&&status.ready===true,
      'search_enrichment_coverage_unavailable');
    if(previous===null)previous=status;
    else assert(status.total===previous.total && status.missingOriginalAbstracts===previous.missingOriginalAbstracts,
      'search_enrichment_coverage_generation_changed');
    for(const row of status.items||[]){
      const doi=normalizeDoi(row.doi);
      assert(doi&&SHA.test(row.revision)&&(!items.length||items.at(-1).doi<doi),
        'search_enrichment_coverage_cursor_invalid');
      items.push({doi,revision:row.revision});
    }
    if(!status.hasMore){
      assert(items.length===status.missingOriginalAbstracts,'search_enrichment_missing_list_incomplete');
      return {items,totals:status};
    }
    assert(status.nextAfterDoi&&status.nextAfterDoi!==afterDoi,'search_enrichment_coverage_cursor_stalled');
    afterDoi=status.nextAfterDoi;
  }
  throw new Error('search_enrichment_coverage_page_limit');
}
async function replenishReadyGeneration(catalogId,sourceHash,report){
  const coverage=await currentMissingAbstractRows(catalogId);
  const max=Math.min(400,Math.max(1,Number(process.env.SEARCH_ABSTRACT_RETRY_LIMIT||300)));
  // Rotate across ALL missing DOI windows. Rechecking the first 300 gaps
  // every night would permanently starve the rest if those 300 have no
  // deposited abstract in either metadata source.
  const windows=Math.max(1,Math.ceil(coverage.items.length/max));
  const epochDay=Math.floor(Date.now()/86400000);
  const windowIndex=epochDay%windows;
  const selected=coverage.items.slice(windowIndex*max,(windowIndex+1)*max);
  report.incrementalWindow={number:windowIndex+1,windows,selected:selected.length,
    totalMissing:coverage.items.length};
  const found=await hydrateAbstracts(selected.map(row=>row.doi),report);
  const readyRows=selected.filter(row=>found.has(row.doi)).map(row=>({
    ...row,abstract:found.get(row.doi).abstract,
    abstractSource:found.get(row.doi).source,summaryEn:'',summaryZh:''
  }));
  let refreshed=0;
  for(let i=0;i<readyRows.length;i+=LIMIT){
    const result=await api('/api/admin/literature-search-enrichment/refresh',{
      method:'POST',body:{catalogId,sourceHash,rows:readyRows.slice(i,i+LIMIT)}
    });
    assert(result.ok===true&&result.ready===true,
      'search_enrichment_refresh_failed_'+i);
    refreshed+=Number(result.refreshed||0);
    if(i%80===0)console.log('SEARCH_ABSTRACT_REFRESH',JSON.stringify({refreshed,requested:readyRows.length}));
  }
  const after=await api('/api/admin/literature-search-enrichment/coverage?'+
    new URLSearchParams({catalogId,limit:'1'}));
  assert(after.ready===true&&after.total===coverage.totals.total
    &&after.originalAbstracts>=coverage.totals.originalAbstracts,'search_enrichment_refresh_parity');
  Object.assign(report,{ok:true,alreadyReady:true,catalogId,recordCount:coverage.totals.total,
    originalAbstracts:after.originalAbstracts,originalAbstractsBefore:coverage.totals.originalAbstracts,
    remainingWithoutOriginalAbstract:after.missingOriginalAbstracts,
    approvedDescriptions:after.approvedDescriptions,
    incrementalChecked:selected.length,incrementalRecovered:refreshed,
    metadataAvailableIncomplete:after.missingOriginalAbstracts>0,
    currentPublishedGeneration:true,finishedAt:new Date().toISOString()});
}

async function main(){
  assert(TOKEN,'BRIDGE_WRITE_TOKEN_required');
  const report={startedAt:new Date().toISOString(),ok:false,
    openAlexErrors:[],crossrefErrors:[]};
  try{
    const delivery=await request(new URL('release-delivery.json',SITE));
    const catalogId=String(delivery.architectureCatalogId||'');
    assert(SHA.test(catalogId)&&Array.isArray(delivery.dois),'invalid_public_catalog_delivery');
    const publishedDois=delivery.dois.map(normalizeDoi).sort();
    assert(publishedDois.every(Boolean)&&new Set(publishedDois).size===publishedDois.length,
      'invalid_published_doi_membership');
    const rows=await publishedIndexRows(catalogId,publishedDois.length);
    assert(JSON.stringify(rows.map(r=>r.doi).sort())===JSON.stringify(publishedDois),'index_delivery_doi_set_mismatch');
    // These are independently reviewed descriptions, NOT original abstracts.
    let approved={};
    try {
      const summaries=await request(new URL('scheduled-article-summaries.json',SITE));
      for(const [doi,summary] of Object.entries(summaries.items||{})){
        if(summary?.status==='approved'&&normalizeDoi(doi)===doi)approved[doi]=summary;
      }
    }catch(error){report.summaryFetchError=String(error.message||error);}
    const sourceHash=digest(catalogId+':search-enrichment-v1');
    const begin=await api('/api/admin/literature-search-enrichment/begin',{
      method:'POST',body:{catalogId,sourceHash},
    });
    if(begin.ready){
      await replenishReadyGeneration(catalogId,sourceHash,report);
      return;
    }
    const abstracts=await hydrateAbstracts(publishedDois,report);
    let summaryCount=0,abstractCount=0;
    const enriched=rows.map(row=>{
      const metadata=abstracts.get(row.doi)||{};
      const summary=approved[row.doi]||{};
      if(metadata.abstract)abstractCount++;
      if(summary.en||summary.zh)summaryCount++;
      return {doi:row.doi,revision:row.revision,abstract:metadata.abstract||'',
        abstractSource:metadata.source||'',
        summaryEn:typeof summary.en==='string'?summary.en:'',
        summaryZh:typeof summary.zh==='string'?summary.zh:''};
    });
    for(let i=0;i<enriched.length;i+=LIMIT){
      const imported=await api('/api/admin/literature-search-enrichment/import',{
        method:'POST',body:{catalogId,sourceHash,rows:enriched.slice(i,i+LIMIT)},
      });
      assert(imported.ok===true,'search_enrichment_batch_failed_'+i);
      if(i%80===0)console.log('SEARCH_ENRICHMENT_IMPORT',JSON.stringify({imported:i+Math.min(LIMIT,enriched.length-i),total:enriched.length}));
    }
    const finalized=await api('/api/admin/literature-search-enrichment/finalize',{
      method:'POST',body:{catalogId,sourceHash},
    });
    assert(finalized.ready===true&&finalized.recordCount===rows.length,'search_enrichment_finalize_incomplete');
    const deliveryAgain=await request(new URL('release-delivery.json',SITE));
    // An intervening 08:00 release is not an error for its own generation,
    // but never claim that the old generation is currently serving searches.
    const stillCurrent=deliveryAgain.architectureCatalogId===catalogId;
    Object.assign(report,{ok:true,completedAt:new Date().toISOString(),catalogId,recordCount:rows.length,
      originalAbstracts:abstractCount,approvedDescriptions:summaryCount,
      noAbstractOrReviewedDescription:enriched.filter(r=>!r.abstract&&!r.summaryEn&&!r.summaryZh).length,
      currentPublishedGeneration:stillCurrent,
      metadataAvailableIncomplete:abstractCount<rows.length});
  }catch(error){
    report.error=String(error.message||error);
    report.failedAt=new Date().toISOString();
    throw error;
  }finally{
    await writeFile(REPORT,JSON.stringify(report,null,2)+'\n');
    console.log('SEARCH_ENRICHMENT_REPORT '+JSON.stringify(report));
  }
}
await main();
