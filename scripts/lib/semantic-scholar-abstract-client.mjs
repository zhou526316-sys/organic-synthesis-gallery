// Metadata-only Semantic Scholar Academic Graph request.
// Never logs keys, abstracts or publisher text. Strict DOI validation occurs
// again when parsing the result; an API response cannot authorize a card DOI.
const DOI=/^10\.\d{4,9}\/\S+$/i;
const endpoint='https://api.semanticscholar.org/graph/v1/paper/batch?fields=externalIds,abstract,title';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function safeKey(value){return String(value||'').trim();}
function normalize(value){
  const x=String(value||'').trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'');
  return DOI.test(x)?x:'';
}
export function scholarRetryDelay(value,attempt){
  const raw=String(value||'').trim();
  const seconds=raw&&/^\d+$/.test(raw)?Number(raw):null;
  return Math.max(1000,Math.min(12000,Number.isFinite(seconds)?seconds*1000:4000*(attempt+1)));
}
export async function fetchSemanticScholarAbstractBatch(dois,{
  key='',fetchImpl=fetch,sleep=delay,timeoutMs=20000
}={}){
  const ids=(Array.isArray(dois)?dois:[]).map(normalize);
  if(!ids.length||ids.length>100||ids.some(x=>!x)
    ||new Set(ids).size!==ids.length)throw Error('semantic_scholar_invalid_doi_batch');
  const token=safeKey(key);
  const attempts=token?3:2;
  const headers={'accept':'application/json','content-type':'application/json',
    'user-agent':'OrganicSynthesisGallery-ScholarMetadata/1.0',
    ...(token?{'x-api-key':token}:{})};
  for(let attempt=0;attempt<attempts;attempt++){
    const response=await fetchImpl(endpoint,{
      method:'POST',headers,body:JSON.stringify({ids:ids.map(id=>'DOI:'+id)}),
      signal:AbortSignal.timeout(timeoutMs)
    });
    if(response.status===429){
      const retryAfter=response.headers.get('retry-after');
      await response.body?.cancel().catch(()=>{});
      if(attempt+1===attempts)
        throw Error('semantic_scholar_http_429_after_'+attempts+'_attempts');
      await sleep(scholarRetryDelay(retryAfter,attempt));
      continue;
    }
    if(!response.ok){
      await response.body?.cancel().catch(()=>{});
      throw Error('semantic_scholar_http_'+response.status);
    }
    const records=await response.json();
    if(!Array.isArray(records))throw Error('semantic_scholar_invalid_batch_response');
    return {records,attempted:ids.length,retries:attempt,
      authenticated:Boolean(token)};
  }
  throw Error('semantic_scholar_exhausted_attempts');
}
