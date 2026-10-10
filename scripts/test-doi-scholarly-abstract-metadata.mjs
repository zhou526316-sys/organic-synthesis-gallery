import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boundedMetadataWindow,cleanScholarlyAbstract,
  matchSemanticScholarAbstracts,matchEuropePmcAbstracts}
  from './lib/doi-scholarly-abstract-metadata.mjs';

const DOI='10.31635/ccschem.026.202507094';
const TEXT='The study reports a copper-catalyzed radical pathway for divergent functionalization of unactivated alkenes, demonstrating synthetically useful selectivity and mechanistic insight in a range of N-fluorocarboxamide substrates.';

test('exact DOI metadata, not title similarity, selects Semantic Scholar abstracts',()=>{
  const input=[
    {title:'Same title',externalIds:{DOI:'10.31635/ccschem.026.notthis'},abstract:TEXT},
    {title:'Correct',externalIds:{DOI:'https://doi.org/'+DOI.toUpperCase()},abstract:TEXT},
    {title:'Other',externalIds:{DOI:'10.1234/foreign'},abstract:TEXT}
  ];
  const result=matchSemanticScholarAbstracts([DOI],input);
  assert.equal(result.size,1);
  assert.equal(result.get(DOI),TEXT);
});
test('Europe PMC metadata requires exact DOI and safely strips formatting',()=>{
  const html='The article describes <i>stereoselective</i> chemistry with C<sup>2</sup>–H activation &amp; catalytic functionalization in complex molecular substrates. It highlights an alternative route to valuable organic products with evidence for the proposed reaction pathway.';
  const r=matchEuropePmcAbstracts([DOI],{resultList:{result:[
    {doi:'10.1234/other',abstractText:TEXT},
    {doi:DOI,abstractText:html}
  ]}});
  assert.equal(r.size,1);
  assert.match(r.get(DOI),/stereoselective chemistry/);
  assert.match(r.get(DOI),/activation & catalytic/);
});
test('DOI absent, short texts and challenge pages cannot become scientific abstracts',()=>{
  assert.equal(matchSemanticScholarAbstracts([DOI],[{title:'Exact title',abstract:TEXT}]).size,0);
  assert.equal(cleanScholarlyAbstract('A short sentence.'),'');
  assert.equal(cleanScholarlyAbstract('Verify you are human '+TEXT),'');
  assert.equal(matchEuropePmcAbstracts([DOI],{resultList:{result:[{doi:DOI,abstractText:null}]}}).size,0);
});
test('bounded windows revisit all gaps despite outer rotating historical partitions',()=>{
  const dois=Array.from({length:300},(_,i)=>'10.1234/'+String(i).padStart(3,'0'));
  const all=new Set();
  for(let day=0;day<60;day+=6){
    const window=boundedMetadataWindow(dois,50,day,6);
    for(const doi of window.selected)all.add(doi);
  }
  assert.equal(all.size,300);
  const allAtOnce=boundedMetadataWindow(dois,1000,0,1);
  assert.equal(allAtOnce.selected.length,100);
});
