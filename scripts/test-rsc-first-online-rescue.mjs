import assert from 'node:assert/strict';
import { exactDay,crossrefFirstOnline,rscFirstPublishedHtml,europePmcFirstOnline,resolveRscFirstOnline } from './lib/rsc-first-online-rescue.mjs';
const doi='10.1039/d6sc06226a',pub=p=>({message:{DOI:doi,'published-online':{'date-parts':[p]},
  created:{'date-parts':[[2026,10,14]]},deposited:{'date-parts':[[2026,10,14]]}}});
assert.equal(exactDay('2026-02-30'),'');
assert.equal(exactDay('2026-10-16'),'2026-10-16');
assert.equal(crossrefFirstOnline(pub([2026]),doi),'');
assert.equal(crossrefFirstOnline(pub([2026,10]),doi),'');
assert.equal(crossrefFirstOnline(pub([2026,10,16]),doi),'2026-10-16');
assert.equal(crossrefFirstOnline(pub([2026,10,16]),'10.1039/d6sc05550h'),'');
const html='<html><meta name="citation_doi" content="'+doi+'"><p>First published on 16th October 2026</p></html>';
assert.equal(rscFirstPublishedHtml(html,doi),'2026-10-16');
assert.equal(rscFirstPublishedHtml(html,'10.1039/d6sc05550h'),'');
assert.equal(rscFirstPublishedHtml('<meta name="citation_doi" content="'+doi+'">'+
  '<meta name="citation_online_date" content="2026/10/16">',doi),'2026-10-16');
const pmc={resultList:{result:[{doi,source:'MED',journalTitle:'Chemical Science',firstPublicationDate:'2026-10-16'}]}};
assert.equal(europePmcFirstOnline(pmc,doi),'2026-10-16');
assert.equal(europePmcFirstOnline({resultList:{result:[{...pmc.resultList.result[0],source:'PPR'}]}},doi),'');
const respond=(body,status=200)=>({ok:status===200,status,async text(){return typeof body==='string'?body:JSON.stringify(body)}});
const partial=async url=>url.includes('crossref')?respond(pub([2026]))
  :url.includes('rsc.org')?respond('',403):respond({resultList:{result:[]}});
let result=await resolveRscFirstOnline(doi,{fetcher:partial,endDate:'2026-10-15'});
assert.equal(result.status,'first_online_date_unavailable');
assert.equal(result.firstOnlineDate,null);
assert.equal(result.attemptedSources.length,3);
assert.equal(result.attemptedSources[1].status,'http_403');
const exact=async url=>url.includes('crossref')?respond(pub([2026,10,16])):respond('');
result=await resolveRscFirstOnline(doi,{fetcher:exact,endDate:'2026-10-15'});
assert.equal(result.status,'future_publication_hold');
assert.equal(result.firstOnlineDate,null);
result=await resolveRscFirstOnline(doi,{fetcher:exact,endDate:'2026-10-16'});
assert.equal(result.status,'verified');
assert.equal(result.firstOnlineDate,'2026-10-16');
assert.equal(result.attemptedSources.length,1);
const publisher=async url=>url.includes('crossref')?respond(pub([2026]))
  :url.includes('rsc.org')?respond(html):respond({resultList:{result:[]}});
result=await resolveRscFirstOnline(doi,{fetcher:publisher,endDate:'2026-10-16'});
assert.equal(result.firstOnlineDate,'2026-10-16');
assert.equal(result.evidenceSource,'rsc_first_published');
const europe=async url=>url.includes('crossref')?respond(pub([2026]))
  :url.includes('rsc.org')?respond('',403):respond(pmc);
result=await resolveRscFirstOnline(doi,{fetcher:europe,endDate:'2026-10-16'});
assert.equal(result.firstOnlineDate,'2026-10-16');
assert.equal(result.evidenceSource,'europe_pmc_first_publication');
console.log(JSON.stringify({ok:true,checks:19,noFabricatedCreatedDate:true,productionDataModified:false}));
