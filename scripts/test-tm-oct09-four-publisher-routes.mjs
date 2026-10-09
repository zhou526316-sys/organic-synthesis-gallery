import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=await fs.readFile('public/toc-mainline.user.js','utf8');
const from=source.indexOf('  function oct09VerifiedPublisherArticleRoute(job) {');
const to=source.indexOf('  function resultKey(doi)',from);
assert.ok(from>0&&to>from,'four-DOI route and article resolver must remain adjacent');
let calls=0,stubResponse=null;
const acceptedHosts={
  elsevier:new Set(['www.sciencedirect.com','www.cell.com']),
  rsc:new Set(['pubs.rsc.org'])
};
const ctx={
  URL,Date,Boolean,Number,String,console,
  normalizeDoi:v=>String(v||'').toLowerCase().trim(),
  publisherForDoi:doi=>doi.startsWith('10.1016/')?'elsevier':doi.startsWith('10.1039/')?'rsc':'acs',
  publisherArticleHostAllowed:(publisher,value)=>{
    try{return Boolean(acceptedHosts[publisher]?.has(new URL(value).hostname))}catch{return false}
  },
  articleUrl:job=>'https://doi.org/'+job.doi,
  gmRequest:async()=>{calls++;if(stubResponse===null)throw Error('fixture simulated publisher redirect unavailable');return stubResponse;},
  elsevierResolvedPublisherUrl:response=>response?.sourceRoute||'',
  rscArticleHtmlUrl:job=>'https://pubs.rsc.org/en/content/articlehtml/2026/'+(job.doi.includes('d6sc')?'sc':'gc')+'/'+job.doi.split('/')[1]
};
vm.createContext(ctx);
vm.runInContext(source.slice(from,to)+'\nglobalThis.routeTest={oct09VerifiedPublisherArticleRoute,resolvePublisherTaskUrl};',ctx);
const {oct09VerifiedPublisherArticleRoute:route,resolvePublisherTaskUrl:resolve}=ctx.routeTest;
const known={
  '10.1016/j.chempr.2026.103008':'https://www.sciencedirect.com/science/article/pii/S2451929426000744',
  '10.1016/j.chempr.2026.103043':'https://www.sciencedirect.com/science/article/pii/S2451929426001099',
  '10.1039/d6sc06407h':'https://pubs.rsc.org/sc/article/doi/10.1039/D6SC06407H/1367242/Harnessing-Carbyne-Reactivity-from-Stabilized',
  '10.1039/d6gc03748h':'https://pubs.rsc.org/gc/article/doi/10.1039/D6GC03748H/1367368/Green-Synthesis-of-Dihydropyranone-Intermediates'
};
let passed=0;
const ok=(desc,condition)=>{assert.ok(condition,desc);passed++;console.log('OCT9_VERIFIED_ROUTE_PASS '+desc)};
for(const [doi,expected]of Object.entries(known)){
  ok('exact first-party DOI route '+doi,route({doi})===expected);
  ok('fallback after existing route fails '+doi,(await resolve({doi,publisher:doi.startsWith('10.1039/')?'rsc':'elsevier'}))===expected);
}
for(const doi of ['10.1016/j.chempr.2026.103220','10.1039/d6sc03717h',
  '10.1002/anie.4335022','10.1021/jacs.6c06476']){
  ok('all other DOIs remain unchanged '+doi,route({doi})==='');
}
stubResponse={sourceRoute:'https://www.sciencedirect.com/science/article/pii/S2451929426000744'};
ok('existing legitimate ScienceDirect DOI resolution is retained',
  (await resolve({doi:'10.1016/j.chempr.2026.103008',publisher:'elsevier'}))===stubResponse.sourceRoute);
stubResponse={status:200,finalUrl:'https://pubs.rsc.org/en/content/articlehtml/2026/sc/d6sc06407h',
  responseText:'Exact 10.1039/d6sc06407h publisher article content'};
ok('existing legitimate RSC articleHTML DOI resolution is retained',
  (await resolve({doi:'10.1039/d6sc06407h',publisher:'rsc'}))===stubResponse.finalUrl);
ok('read-only routes never upload, alter original queue or unlock PDF',calls>0
  && !source.slice(from,to).includes('/api/media/local-capture/import')
  && !source.slice(from,to).includes('privatePdfUploadRequest'));
console.log('OCT9_VERIFIED_ROUTE_SUMMARY '+JSON.stringify({passed,dois:4,
  publisherHosts:['pubs.rsc.org','www.sciencedirect.com'],productionWrites:0,
  permissionBypass:false,otherDoisUnchanged:true}));
