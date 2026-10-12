import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';

const original=await readFile('public/gallery-historical-text-pilot.user.js','utf8');
const anchor="  if(location.hostname==='gallery.gczhouwld.com'){";
assert.ok(original.includes(anchor));
const source=original.replace(anchor,"  globalThis.__batchTest={batchHistoricalPapers,batchLicenseEvidence,batchWorker};\n"+anchor);
const DOI='10.1021/jacs.6c08636',TOKEN='a'.repeat(24),RUN='b'.repeat(24);
function fixture({license='https://creativecommons.org/licenses/by/4.0/',pageDoi=DOI}={}){
  const values=new Map([['gallery-historical-text-batch-v2:job',{
    doi:DOI,publication:'2026-09-14',journal:'JACS',
    title:'A catalytic process',runId:RUN,token:TOKEN,expiresAt:Date.now()+20000
  }]]);
  const nodes=[
    {tagName:'H2',textContent:'Abstract'},
    {tagName:'P',textContent:'A methodology addresses selective carbon-carbon bond forming reactions. '.repeat(5)},
    {tagName:'H2',textContent:'Mechanistic Studies'},
    {tagName:'P',textContent:'LMCT ligands modulate radical pathways in experimental investigations. '.repeat(5)}
  ];
  const footer={id:'',className:'',parentElement:null};
  for(const n of nodes)Object.assign(n,{id:'',className:'',parentElement:footer,closest(){return null;}});
  const figure={textContent:'Scheme 1. Photoredox reaction mechanism',id:'',className:'',parentElement:footer,closest(){return null;}};
  const table={textContent:'Table 1. Reaction optimization data',id:'',className:'',parentElement:footer,closest(){return null;}};
  const root={querySelectorAll(selector){
    if(selector==='h2,h3,p')return nodes;
    if(selector.startsWith('figure figcaption'))return [figure];
    if(selector==='table')return [table];
    if(selector.startsWith('[itemprop="license"]'))return [];
    throw Error('unexpected selector '+selector);
  }};
  const document={body:footer,
    querySelectorAll(selector){
      if(selector.startsWith('meta[name="citation_doi"'))return [{content:pageDoi}];
      if(selector.startsWith('link[rel="license"'))return license?[{content:license}]:[];
      throw Error('unexpected doc selector '+selector);
    },
    querySelector(selector){return selector.startsWith('main article')?root:null;},
    createElement(){return {style:{},click(){},remove(){}};}
  };
  const context={
    location:{hostname:'pubs.acs.org',origin:'https://pubs.acs.org',
      pathname:'/doi/'+DOI,hash:'#gallery-historical-job='+TOKEN},
    document,window:{alert(){},confirm:()=>true},TextEncoder,Blob,crypto:webcrypto,URL,
    GM_getValue:(key,def)=>values.has(key)?values.get(key):def,
    GM_setValue:(key,value)=>values.set(key,value),
    GM_deleteValue:key=>values.delete(key),
    GM_registerMenuCommand:()=>{},
    setTimeout:fn=>{queueMicrotask(fn);return 1;},
    console
  };
  vm.runInNewContext(source,context,{timeout:3000});
  return {context,values,root};
}
const registry={pairedCaptureRegistry:true,webpageDoiCount:5,articles:[
  {doi:DOI,date:'2026-09-14',journal:'JACS'},
  {doi:'10.1038/s44160-026-01100-1',date:'2021-02-02',journal:'Nature Synthesis'},
  {doi:'10.1002/anie.123456',date:'2026-10-04',journal:'Angew'},
  {doi:'10.1021/acs.orglett.2026fake',date:'2025-01-01',journal:'Organic Letters'},
  {doi:DOI,date:'2026-09-14',journal:'JACS'}
]};
test('batch only selects unique formal historical DOI',()=>{
  const {context}=fixture();
  const rows=context.__batchTest.batchHistoricalPapers(registry);
  assert.equal(rows.length,3);
  assert.equal(new Set(rows.map(x=>x.doi)).size,3);
  assert.ok(rows.every(x=>x.publication<'2026-10-01'));
  assert.throws(()=>context.__batchTest.batchHistoricalPapers({...registry,webpageDoiCount:100}),/目录不一致/);
});
test('explicit article license gate allows BY/CC0 and excludes NC-ND or unlicensed',()=>{
  assert.equal(fixture().context.__batchTest.batchLicenseEvidence(fixture().root)?.kind,'cc-by');
  const zero=fixture({license:'https://creativecommons.org/publicdomain/zero/1.0/'});
  assert.equal(zero.context.__batchTest.batchLicenseEvidence(zero.root)?.kind,'cc0');
  const nd=fixture({license:'https://creativecommons.org/licenses/by-nc-nd/4.0/'});
  assert.equal(nd.context.__batchTest.batchLicenseEvidence(nd.root),null);
  const missing=fixture({license:''});
  assert.equal(missing.context.__batchTest.batchLicenseEvidence(missing.root),null);
});
test('publisher worker emits only DOI verified local packet without PDF, media or upload',async()=>{
  const {context,values}=fixture();
  await context.__batchTest.batchWorker();
  const result=values.get('gallery-historical-text-batch-v2:result');
  assert.equal(result.status,'ok');
  assert.equal(result.doi,DOI);
  assert.equal(result.runId,RUN);
  assert.equal(result.packet.publicUploadAllowed,false);
  assert.equal(result.packet.pdfDownloaded,false);
  assert.equal(result.packet.mediaDownloaded,false);
  assert.equal(result.packet.rightsBasis,'cc-by');
  assert.ok(result.packet.sections.some(x=>x.text.includes('LMCT')));
  assert.match(result.packet.sourceSha256,/^[a-f0-9]{64}$/);
});
test('worker cannot claim another tab, expired job, or unlicensed article',async()=>{
  const other=fixture({pageDoi:'10.1021/jacs.other'});
  await other.context.__batchTest.batchWorker();
  assert.equal(other.values.has('gallery-historical-text-batch-v2:result'),false);
  const unlicensed=fixture({license:'https://creativecommons.org/licenses/by-nc-nd/4.0/'});
  await unlicensed.context.__batchTest.batchWorker();
  assert.equal(unlicensed.values.get('gallery-historical-text-batch-v2:result')?.status,'license_not_verified');
  const expired=fixture();
  expired.values.set('gallery-historical-text-batch-v2:job',
    {...expired.values.get('gallery-historical-text-batch-v2:job'),expiresAt:0});
  expired.values.delete('gallery-historical-text-batch-v2:result');
  await expired.context.__batchTest.batchWorker();
  assert.equal(expired.values.has('gallery-historical-text-batch-v2:result'),false);
});
test('historical batch does not write into media, PDF or Evidence interfaces',()=>{
  const body=original.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/,'');
  for(const forbidden of [
    'osg-toc-v6:','/api/article-summary/fulltext/import','/api/private-pdf/import',
    'api/local-captures/import','importBodyFigure','capturePrivatePdf','GM_download('
  ])assert.ok(!body.includes(forbidden),'isolation breach: '+forbidden);
  assert.ok(original.includes("GM_openInTab('https://doi.org/'"));
  assert.ok(original.includes('一键补抓全部缺项'));
  assert.ok(original.includes('BATCH_MIN_GAP_MS=2000'));
});
