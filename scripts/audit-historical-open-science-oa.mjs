// Official read-only OA science source audit. Never persists article XML or uploads a body.
// Non-dry runs enumerate the entire formal DOI historical index, including metadata_only.
import {readFile,writeFile} from 'node:fs/promises';
import {sample,inspect,loadPublishedHistorical} from './lib/historical-open-xml-pilot.mjs';
const flag=k=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3);
const dry=process.argv.includes('--dry-run');
const limit=Math.max(1,Math.min(20,Math.floor(Number(flag('limit')||20))));
const offset=Math.max(0,Math.floor(Number(flag('offset')||0)));
const expectedCatalogId=String(flag('expected-catalog-id')||'').trim();
if(expectedCatalogId&&!/^[a-f0-9]{64}$/.test(expectedCatalogId))
  throw Error('historical_oa_expected_catalog_id_invalid');
const formal=dry?null:await loadPublishedHistorical();
const registry=formal?.registry||JSON.parse(await readFile('public/toc-demand-live.json','utf8'));
const release=formal?.release||{architectureCatalogId:'a'.repeat(64),
  dois:registry.articles.map(x=>x.doi),productionCards:registry.articles.length};
if(expectedCatalogId&&release.architectureCatalogId!==expectedCatalogId)
  throw Error('historical_oa_catalog_generation_changed');
const list=sample(registry,release,limit,offset);
const result={schemaVersion:'historical-science-oa-v2',readOnly:true,at:new Date().toISOString(),
  catalogId:release.architectureCatalogId,formalDois:release.dois.length,
  catalogSource:dry?'offline_fixture':'formal_catalog_view',
  formalHistoricalDated:formal?.historicalDated??null,
  formalHistoricalUndated:formal?.historicalUndated??null,
  offset,nextOffset:offset+list.length,
  hasMore:Boolean(formal&&offset+list.length<formal.historicalDated),
  candidateDois:list.length,xmlOriginalsPersisted:0,publicBodyImports:0,
  pdfDownloads:0,publisherVisits:0,entries:[],states:{}};
let throttled=false;
for(const row of list){
  let value={state:dry?'offline':'unknown'};
  if(throttled)value={state:'provider_paused'};
  else if(!dry){
    try{value=await inspect(row);}
    catch(error){
      const msg=String(error?.message||'');
      value={state:msg==='source_rate_limited'?'source_rate_limited':
        msg.startsWith('source_http_')?msg:'source_unavailable'};
      if(msg==='source_rate_limited')throttled=true;
    }
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  result.states[value.state]=(result.states[value.state]||0)+1;
  result.entries.push({doi:row.doi,journal:row.journal,firstOnlineDate:row.date,...value});
}
result.reusableCandidateDois=result.entries.filter(x=>x.state==='needs_independent_review').length;
result.completeCandidates=result.entries.filter(x=>x.grade==='complete_candidate').length;
await writeFile(flag('output')||'/tmp/historical-open-science.json',
  JSON.stringify(result,null,2)+'\n');
console.log('HISTORICAL_OA_SCIENCE_PILOT '+JSON.stringify({
  sampled:result.candidateDois,states:result.states,offset:result.offset,
  nextOffset:result.nextOffset,hasMore:result.hasMore,
  formalHistoricalDated:result.formalHistoricalDated,
  reusableCandidateDois:result.reusableCandidateDois,
  completeCandidates:result.completeCandidates,
  xmlOriginalsPersisted:0,publicBodyImports:0,pdfDownloads:0,publisherVisits:0
}));
