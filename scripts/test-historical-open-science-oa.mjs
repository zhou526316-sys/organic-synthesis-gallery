import test from 'node:test';import assert from 'node:assert/strict';
import {parseJats,sample,matchMeta} from './lib/historical-open-xml-pilot.mjs';
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
