// Springer Nature's official free-tier Meta API exposes DOI-bound scholarly
// metadata with an API key. This parser accepts ONLY a matching journal-article
// DOI and an explicit abstract field; it never touches article bodies or PDF.
import {cleanScholarlyAbstract,normalizeMetadataDoi}
  from './doi-scholarly-abstract-metadata.mjs';

export function matchSpringerNatureMetaAbstract(requestedDoi,payload){
  const expected=normalizeMetadataDoi(requestedDoi);
  if(!expected||!expected.startsWith('10.1038/'))return '';
  if(!payload||!Array.isArray(payload.records))return '';
  for(const row of payload.records.slice(0,30)){
    if(!row||typeof row!=='object')continue;
    if(row.contentType && !/^(?:article|journal article)$/i.test(String(row.contentType)))
      continue;
    const markers=[row.doi,row.identifier].filter(value=>typeof value==='string'&&value.trim());
    if(!markers.length)continue;
    const verified=markers.map(normalizeMetadataDoi);
    if(verified.some(doi=>doi!==expected))continue;
    const abstract=cleanScholarlyAbstract(row.abstract);
    if(abstract)return abstract;
  }
  return '';
}
export function springerNatureMetadataEndpoint(doiValue,key){
  const doi=normalizeMetadataDoi(doiValue),token=String(key||'').trim();
  if(!doi.startsWith('10.1038/')||!token)return null;
  const url=new URL('https://api.springernature.com/meta/v2/json');
  url.searchParams.set('q','doi:'+doi);
  url.searchParams.set('p','1');
  url.searchParams.set('s','1');
  url.searchParams.set('api_key',token);
  return url;
}
