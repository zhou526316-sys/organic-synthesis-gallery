import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const script=fs.readFileSync('public/toc-mainline.user.js','utf8');
const priorityStart=script.indexOf('  function historicalTocAcquisitionTier(');
const priorityEnd=script.indexOf('  function validCapturedFigure(',priorityStart);
assert.ok(priorityStart>0&&priorityEnd>priorityStart);
const priorityScope=vm.createContext({
  String,Number,Array,Set,Date,
  normalizeDoi:x=>String(x||'').toLowerCase(),
  publisherForDoi:d=>d.startsWith('10.1021/')?'acs':d.startsWith('10.1038/')?'nature':d.startsWith('10.1126/')?'science':d.startsWith('10.1039/')?'rsc':d.startsWith('10.1016/')?'elsevier':d.startsWith('10.1002/')?'wiley':'other',
  tocOnlyCaptureEligible:j=>j.mediaPolicy==='toc_only'&&j.date>='2026-07-01'&&j.date<='2026-09-30',
  captureBatchDate:j=>j.addedDate||j.date||'',
  journalPriority:j=>({Nature:0,Science:1,JACS:4,Angew:5,Chem:6})[j.journal]??7
});
vm.runInContext(script.slice(priorityStart,priorityEnd)+
  '\n globalThis.tier=historicalTocAcquisitionTier;globalThis.sort=compareMissingCaptureJobs;',
  priorityScope);
const historical=(publisher,doi,date,addedDate)=>({publisher,doi,date,addedDate,
  mediaPolicy:'toc_only',journal:publisher==='nature'?'Nature':publisher==='acs'?'JACS':publisher});
const recent=(publisher,doi,date,addedDate)=>({publisher,doi,date,addedDate,
  mediaPolicy:'standard',journal:publisher==='nature'?'Nature':publisher==='acs'?'JACS':publisher});
const nat=historical('nature','10.1038/s41467-026-77228-2','2026-09-30','2026-10-01');
const acs=historical('acs','10.1021/acs.orglett.6c03221','2026-09-18','');
const rsc=historical('rsc','10.1039/d6sc05630j','2026-09-26','');
const science=historical('science','10.1126/science.aef3511','2026-09-24','');
const oct=recent('nature','10.1038/s41467-026-79999-1','2026-10-16','2026-10-17');

test('newly added October papers precede every historical TOC-only candidate',()=>{
 const ordered=[nat,acs,science,rsc,oct].sort((a,b)=>priorityScope.sort(a,b));
 assert.equal(ordered[0].doi,oct.doi);
 assert.equal(new Set(ordered.map(x=>x.doi)).size,5);
});

test('official-graphical-TOC publisher routes precede first-look Nature/Science negatives',()=>{
 const ordered=[nat,science,rsc,acs].sort((a,b)=>priorityScope.sort(a,b));
 assert.deepEqual(ordered.map(x=>x.publisher),['acs','rsc','nature','science']);
 assert.equal(priorityScope.tier(nat),3);
 assert.equal(priorityScope.tier(acs),1);
 assert.equal(priorityScope.tier(rsc),2);
 assert.equal(priorityScope.tier(oct),0);
});

test('live controller coverage queue uses the same tier, does not mark papers complete',()=>{
 const start=script.indexOf('  function coveragePending(');
 const end=script.indexOf('  function coverageApplyFreshPlan(',start);
 assert.ok(start>0&&end>start);
 const ctx=vm.createContext({...priorityScope,
   coverageHasNeeds:j=>Boolean(j.captureToc),
   historicalTocAcquisitionTier:priorityScope.tier,
   compareMissingCaptureJobs:priorityScope.sort});
 vm.runInContext(script.slice(start,end)+'\n globalThis.pending=coveragePending;',ctx);
 const rows=[nat,science,rsc,acs,oct].map(job=>({job:{...job,captureToc:true},state:'pending',attempts:0}));
 const results=ctx.pending({coverage:new Map(rows.map(r=>[r.job.doi,r]))});
 assert.deepEqual(results.map(r=>r.job.doi),[oct.doi,acs.doi,rsc.doi,nat.doi,science.doi]);
 assert.ok(results.every(r=>r.state==='pending'),'no pending work may disappear');
});

const routeStart=script.indexOf('  function exactElsevierDoiArticleUrl(');
const routeEnd=script.indexOf('  function resultKey(',routeStart);
assert.ok(routeStart>0&&routeEnd>routeStart);
const doi='10.1016/j.chempr.2026.103282',PII='S2451929426000282';
function routeFixture({crossrefDoi=doi,crossrefStatus=200,openalexStatus=404,openalexDoi=doi,crossrefUrl='https://www.sciencedirect.com/science/article/pii/'+PII}={}){
 const calls=[];
 const ctx=vm.createContext({
  String,Number,Array,JSON,URL,encodeURIComponent,location:{href:'https://gallery.gczhouwld.com/'},
  normalizeDoi:x=>String(x||'').toLowerCase().replace(/^https?:\/\/doi.org\//,''),
  publisherForDoi:x=>x.startsWith('10.1016/')?'elsevier':'rsc',
  publisherArticleHostAllowed:(p,v)=>p==='elsevier'&&/^https:\/\/(?:www\.)?(?:sciencedirect\.com|cell\.com)\//.test(v),
  articleUrl:job=>job.publisher==='elsevier'?'https://doi.org/'+job.doi:
    'https://pubs.rsc.org/en/content/articlehtml/2026/sc/d6sc05630j',
  oct09VerifiedPublisherArticleRoute:()=> '',
  elsevierResolvedPublisherUrl:()=> '',
  rscArticleHtmlUrl:()=> '',
  gmRequest:async opt=>{
    calls.push(opt.url);
    if(opt.url.startsWith('https://doi.org/'))return {status:200,finalUrl:opt.url,responseText:'<html>redirect unresolved</html>'};
    if(opt.url.startsWith('https://api.crossref.org/'))
      return {status:crossrefStatus,finalUrl:opt.url,responseText:JSON.stringify({message:{DOI:crossrefDoi,
        link:[{URL:crossrefUrl}]}})};
    if(opt.url.startsWith('https://api.openalex.org/'))
      return {status:openalexStatus,finalUrl:opt.url,responseText:JSON.stringify({doi:openalexDoi,
        primary_location:{landing_page_url:'https://www.sciencedirect.com/science/article/pii/'+PII}})};
    throw Error('unplanned URL '+opt.url);
  }
 });
 vm.runInContext(script.slice(routeStart,routeEnd)+
   '\n globalThis.resolve=resolvePublisherTaskUrl;globalThis.exact=exactElsevierDoiArticleUrl;',ctx);
 return {ctx,calls};
}
test('Crossref exact-DOI PII resolves direct Chem page after doi.org redirect is insufficient',async()=>{
 const f=routeFixture();
 const url=await f.ctx.resolve({doi,publisher:'elsevier'});
 assert.equal(url,'https://www.sciencedirect.com/science/article/pii/'+PII);
 assert.equal(f.calls.length,2);
 assert.equal(f.calls[1].startsWith('https://api.crossref.org/works/'),true);
});

test('OpenAlex verified DOI supplies PII when Crossref has no article URL',async()=>{
 const f=routeFixture({crossrefStatus:404,openalexStatus:200});
 assert.equal(await f.ctx.resolve({doi,publisher:'elsevier'}),
   'https://www.sciencedirect.com/science/article/pii/'+PII);
 assert.equal(f.calls.length,3);
});

test('mismatched DOI or foreign URL never becomes a publisher visit',async()=>{
 const wrong=routeFixture({crossrefDoi:'10.1016/j.chempr.2026.103215'});
 assert.equal(await wrong.ctx.resolve({doi,publisher:'elsevier'}),'');
 const foreign=routeFixture({crossrefUrl:'https://bad.example/science/article/pii/'+PII});
 assert.equal(await foreign.ctx.resolve({doi,publisher:'elsevier'}),'');
 assert.match(script,/throw new Error\('publisher_article_route_unverified'\)/);
 assert.match(script,/publisher_article_route_unverified\)\$\//);
});

test('metadata 429 does not trigger an alternate metadata service request',async()=>{
 const f=routeFixture({crossrefStatus:429,openalexStatus:200});
 assert.equal(await f.ctx.resolve({doi,publisher:'elsevier'}),'');
 assert.equal(f.calls.length,2);
});

test('known publisher DOI->PII route is accepted without new metadata network calls',async()=>{
 const f=routeFixture();
 f.ctx.oct09VerifiedPublisherArticleRoute=()=> 'https://www.sciencedirect.com/science/article/pii/S2451929426000744';
 assert.equal(await f.ctx.resolve({doi:'10.1016/j.chempr.2026.103008',publisher:'elsevier'}),
  'https://www.sciencedirect.com/science/article/pii/S2451929426000744');
 assert.equal(f.calls.length,0);
});

test('no guessed PII, unverified URL or redirect host is accepted',()=>{
 const f=routeFixture();
 const job={doi,publisher:'elsevier'};
 assert.equal(f.ctx.exact(job,'https://malicious.example/science/article/pii/'+PII),'');
 assert.equal(f.ctx.exact(job,'http://www.sciencedirect.com/science/article/pii/'+PII),'');
 assert.equal(f.ctx.exact(job,'https://www.sciencedirect.com/science/article/pii/not-a-pii'),'');
 assert.equal(f.ctx.exact(job,'https://linkinghub.elsevier.com/retrieve/pii/'+PII),
  'https://www.sciencedirect.com/science/article/pii/'+PII);
});

console.log('TM_HISTORICAL_YIELD_CHEM_ROUTE',{tests:10,livePublisherRequests:0,productionMediaWrites:0});
