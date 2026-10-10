import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchSpringerNatureMetaAbstract,springerNatureMetadataEndpoint}
  from './lib/springer-nature-meta-abstract.mjs';

const DOI='10.1038/s44160-026-01107-3';
const TEXT='This work demonstrates a stereoconvergent synthesis of functionalized organic compounds. The proposed catalytic pathway is supported by a systematic substrate study, experiments with reactive intermediates and independent control reactions, with limitations stated by the authors.';
test('official Springer Nature Meta API record uses exact DOI and article abstract only',()=>{
  const data={records:[{
    contentType:'Article',identifier:'doi:'+DOI,doi:DOI,
    abstract:'<p>'+TEXT.replace(' and ', ' &amp; ')+'</p>'
  }]};
  const actual=matchSpringerNatureMetaAbstract(DOI,data);
  assert.match(actual,/systematic substrate study/);
  assert.match(actual,/ & independent/);
});
test('foreign DOI, mixed DOI identifiers, book chapters and summaries are rejected',()=>{
  const wrong='10.1038/s44160-026-01199-x';
  assert.equal(matchSpringerNatureMetaAbstract(DOI,{records:[
    {doi:wrong,abstract:TEXT},
    {doi:DOI,identifier:'doi:'+wrong,abstract:TEXT},
    {doi:DOI,contentType:'Chapter',abstract:TEXT},
    {doi:DOI,title:TEXT}
  ]}),'');
  assert.equal(matchSpringerNatureMetaAbstract('10.31635/ccschem.026.202607499',
    {records:[{doi:'10.31635/ccschem.026.202607499',abstract:TEXT}]}),'');
});
test('free metadata key is optional and never printed by helper',()=>{
  assert.equal(springerNatureMetadataEndpoint(DOI,''),null);
  assert.equal(springerNatureMetadataEndpoint('10.1234/unrelated','中文占位密钥'),null);
  const u=springerNatureMetadataEndpoint(DOI,'中文占位密钥');
  assert.equal(u.origin,'https://api.springernature.com');
  assert.equal(u.pathname,'/meta/v2/json');
  assert.equal(u.searchParams.get('q'),'doi:'+DOI);
  assert.equal(u.searchParams.get('api_key'),'中文占位密钥');
});
test('challenged/short or title-only records cannot substitute for science',()=>{
  assert.equal(matchSpringerNatureMetaAbstract(DOI,{records:[
    {doi:DOI,abstract:'Verify you are human. '+TEXT}
  ]}),'');
  assert.equal(matchSpringerNatureMetaAbstract(DOI,{records:[{doi:DOI,abstract:'A good reaction'}]}),'');
});
