// One-off official OA source pilot; only metadata/coverage and hashes exported.
import {readFile,writeFile} from 'node:fs/promises';
import {sample,inspect,limitedGet} from './lib/historical-open-xml-pilot.mjs';
const flag=k=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3);
const dry=process.argv.includes('--dry-run');
const registry=JSON.parse(await readFile('public/toc-demand-live.json','utf8'));
const release=dry?{architectureCatalogId:'a'.repeat(64),dois:registry.articles.map(x=>x.doi),productionCards:registry.articles.length}
 :JSON.parse(await limitedGet('https://gallery.gczhouwld.com/release-delivery.json','json',6000000));
const list=sample(registry,release,Number(flag('limit')||20));
const output={schemaVersion:'historical-science-oa-v1',readOnly:true,at:new Date().toISOString(),
 catalogId:release.architectureCatalogId,formalDois:release.dois.length,
 candidateDois:list.length,xmlOriginalsPersisted:0,publicBodyImports:0,pdfDownloads:0,publisherVisits:0,entries:[],states:{}};
let throttled=false;
for(const row of list){
 let value={state:dry?'offline':'unknown'};
 if(throttled)value={state:'provider_paused'};
 else if(!dry){try{value=await inspect(row)}catch(e){
   const msg=String(e?.message||'');
   value={state:msg==='source_rate_limited'?'source_rate_limited':msg.startsWith('source_http_')?msg:'source_unavailable'};
   if(msg==='source_rate_limited')throttled=true;
  }
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 output.states[value.state]=(output.states[value.state]||0)+1;
 output.entries.push({doi:row.doi,journal:row.journal,firstOnlineDate:row.date,...value});
}
output.reusableCandidateDois=output.entries.filter(x=>x.state==='needs_independent_review').length;
output.completeCandidates=output.entries.filter(x=>x.grade==='complete_candidate').length;
await writeFile(flag('output')||'/tmp/historical-open-science.json',JSON.stringify(output,null,2)+'\n');
console.log('HISTORICAL_OA_SCIENCE_PILOT '+JSON.stringify({sampled:output.candidateDois,states:output.states,
  reusableCandidateDois:output.reusableCandidateDois,completeCandidates:output.completeCandidates,
  xmlOriginalsPersisted:0,publicBodyImports:0,pdfDownloads:0,publisherVisits:0}));
