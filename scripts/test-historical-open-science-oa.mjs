import test from 'node:test';import assert from 'node:assert/strict';
import {parseJats,sample,matchMeta,loadPublishedHistorical} from './lib/historical-open-xml-pilot.mjs';
import {normalizeOaTrigger} from './lib/historical-oa-trigger.mjs';
const DOI='10.1038/s41467-026-77482-4',T='Organic synthesis catalysis experiment controls. '.repeat(20);
const xml=(lic='https://creativecommons.org/licenses/by/4.0/',id=DOI,body=true)=>'<article><front><article-meta><article-id pub-id-type="doi">'+id+'</article-id><permissions><license xlink:href="'+lic+'"><license-p>Article license.</license-p></license></permissions></article-meta></front>'+
 (body?'<body><sec><title>Introduction</title><p>'+T+'</p></sec><sec><title>Results and Discussion</title><p>'+T+'</p></sec><sec><title>Conclusion</title><p>'+T+'</p></sec><fig><caption>'+T+'</caption></fig><table-wrap><caption>'+T+'</caption></table-wrap></body>':'')+'<back><ref-list/></back></article>';
test('confirmed DOI and CC-BY scientific OA XML yields only a review candidate',()=>{
 const x=parseJats(xml(),DOI);assert.equal(x.state,'needs_independent_review');
 assert.equal(x.grade,'complete_candidate');assert.equal(x.license,'by/4.0');
 assert.match(x.xmlSha256,/^[a-f0-9]{64}$/);assert.equal('body' in x,false);
});
test('cannot reuse missing DOI, NC/ND, and absence of scientific body',()=>{
 assert.equal(parseJats(xml(undefined,'10.1021/other'),DOI).state,'xml_doi_mismatch');
 assert.equal(parseJats(xml('https://creativecommons.org/licenses/by-nc/4.0/'),DOI).state,'reuse_restricted');
 assert.equal(parseJats(xml('https://creativecommons.org/licenses/by-nd/4.0/'),DOI).state,'reuse_restricted');
 assert.equal(parseJats(xml(undefined,DOI,false),DOI).state,'body_unavailable');
});
test('Europe PMC candidate requires open-access flag, matching DOI and PMCID',()=>{
 const row={doi:DOI,pmcid:'PMC1234567',isOpenAccess:'Y'};
 assert.equal(matchMeta({resultList:{result:[row]}},DOI).state,'pmc_oa_candidate');
 assert.equal(matchMeta({resultList:{result:[{...row,doi:'10.1016/other'}]}},DOI).state,'metadata_doi_missing');
 assert.equal(matchMeta({resultList:{result:[{...row,isOpenAccess:'N'}]}},DOI).state,'pmc_oa_missing');
});
test('sample requires formal DOI membership and date before October',()=>{
 const reg={articles:[{doi:DOI,date:'2026-09-01',journal:'Nature Communications'},
  {doi:'10.1021/jacs.1',date:'2026-08-01',journal:'JACS'},
  {doi:'10.1021/jacs.late',date:'2026-10-03',journal:'JACS'}]};
 const rel={architectureCatalogId:'a'.repeat(64),dois:[DOI,'10.1021/jacs.1'],productionCards:2};
 assert.equal(sample(reg,rel).length,2);
 assert.throws(()=>sample(reg,{...rel,productionCards:9}),/formal_release_invalid/);
});

test('formal DOI catalog pagination includes metadata-only history and rejects mismatched generation',async()=>{
 const id='a'.repeat(64),rev='b'.repeat(64),items=[
   {doi:DOI,journal:'Nature Communications',firstOnlineDate:'2026-09-01',revision:rev},
   {doi:'10.1021/jacs.2026-a',journal:'JACS',firstOnlineDate:'2026-07-02',revision:rev},
   {doi:'10.1021/jacs.2026-old',journal:'JACS',firstOnlineDate:'2021-05-11',revision:rev},
   {doi:'10.1021/jacs.date-pending',journal:'JACS',firstOnlineDate:null,revision:rev}
 ];
 const release={architectureCatalogId:id,productionCards:items.length,dois:items.map(x=>x.doi)};
 const requests=[],get=async url=>{
   requests.push(url);
   if(url.includes('release-delivery'))return JSON.stringify(release);
   const q=new URL(url).searchParams;
   return JSON.stringify({catalogId:id,readPathActive:true,enabled:true,matched:items.length,
     items:q.has('cursor')?items.slice(2):items.slice(0,2),
     hasMore:!q.has('cursor'),nextCursor:q.has('cursor')?null:'p2'});
 };
 const result=await loadPublishedHistorical({get});
 assert.equal(result.matched,4);
 assert.equal(result.historicalDated,3);
 assert.equal(result.historicalUndated,1);
 assert.equal(result.registry.articles.length,4);
 assert.ok(requests.slice(1).every(url=>new URL(url).pathname==='/api/literature/catalog-view'));
 assert.ok(requests.slice(1).every(url=>new URL(url).searchParams.get('dateTo')==='2026-09-30'));
 assert.equal(sample(result.registry,result.release,20,0).length,3);
 await assert.rejects(()=>loadPublishedHistorical({get:async url=>{
   const text=await get(url);
   if(url.includes('catalog-view'))return text.replace(id,'c'.repeat(64));
   return text;
 }}),/formal_catalog_generation_unready/);
});
test('paged DOI source scan covers each formal historical DOI once without a fixed first-20 loop',()=>{
 const articles=Array.from({length:45},(_,i)=>({
   doi:'10.1234/synthetic-oa-'+String(i),date:'2020-02-01',
   journal:i%2?'JACS':'Nature Communications'
 }));
 const reg={articles};
 const release={architectureCatalogId:'a'.repeat(64),productionCards:45,dois:articles.map(x=>x.doi)};
 const first=sample(reg,release,20,0),second=sample(reg,release,20,20),
   third=sample(reg,release,20,40);
 assert.equal(first.length,20);assert.equal(second.length,20);assert.equal(third.length,5);
 assert.equal(new Set([...first,...second,...third].map(x=>x.doi)).size,45);
 assert.equal(sample(reg,release,20,45).length,0);
});

test('owner-triggered OA source window must pin an approved catalog and a bounded page',()=>{
 const x={schemaVersion:1,requestId:'histoa_20261014_0020',
   catalogId:'a'.repeat(64),offset:20,limit:20};
 assert.deepEqual(normalizeOaTrigger(x),{
   requestId:x.requestId,catalogId:x.catalogId,offset:20,limit:20});
 for(const bad of [
   {...x,catalogId:'b'}, {...x,offset:-1}, {...x,offset:1.5},
   {...x,limit:21}, {...x,limit:0}, {...x,extra:'raw_fulltext'},
   {...x,requestId:'?'},{...x,schemaVersion:2}
 ])assert.throws(()=>normalizeOaTrigger(bad),/trigger_/);
});
