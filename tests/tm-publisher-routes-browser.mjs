import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const source=await fs.readFile('public/toc-mainline.user.js','utf8');
const routing=await fs.readFile('scripts/tm-rsc-elsevier-routing.inc.js','utf8');

const ai=source.indexOf('  function articleUrl(job) {');
const aj=source.indexOf('\n\n  function resultKey(',ai);
assert.ok(ai>0&&aj>ai,'articleUrl extraction failed');
const articleUrlSource=source.slice(ai,aj);

const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
await page.setContent('<!doctype html><main id="root"></main>');
const harness=[
'(function(){',
"'use strict';",
"var VERSION='6.2.20',CONTROLLER_REVISION='2.2.39',P='osg-toc-v6:';",
"function normalizeDoi(v){return String(v||'').trim().toLowerCase().replace(/^https?:\\/\\/(?:dx\\.)?doi\\.org\\//,'').replace(/^doi:\\s*/,'').replace(/[?#].*$/,'').replace(/[).,;]+$/,'')}",
"function publisherForDoi(d){d=normalizeDoi(d);if(d.startsWith('10.1039/'))return 'rsc';if(d.startsWith('10.1016/'))return 'elsevier';return 'other'}",
"function normalizeUrl(v,b){try{return new URL(v,b||location.href).href}catch{return ''}}",
"function currentCaptureJob(){return true}",
"function GM_getValue(){return null};function GM_setValue(){};function GM_deleteValue(){};",
"function writePublisherHeartbeat(){};function progressKey(){return 'progress'};function nowIso(){return new Date().toISOString()}",
"function sleep(){return Promise.resolve()};function traceKey(){return 'trace'};function resultKey(){return 'result'};function enqueueCaptureReport(){};",
routing,
articleUrlSource,
"globalThis.T={rscArticleRoute,elsevierSearchRoute,elsevierSearchTargetFromDocument,articleUrl};",
'})();'
].join('\n');
await page.addScriptTag({content:harness});

let passed=0;
async function tc(name,fn){await fn();passed++;console.log('PUBLISHER_ROUTE_PASS '+name)}
try{
  await tc('Chem starts on ScienceDirect exact DOI search instead of DOI redirect',async()=>{
    const url=await page.evaluate(()=>T.articleUrl({doi:'10.1016/j.chempr.2026.103282',publisher:'elsevier',captureToc:true}));
    assert.equal(url,'https://www.sciencedirect.com/search?qs=10.1016%2Fj.chempr.2026.103282');
    assert.ok(!url.includes('doi.org'));
  });

  await tc('RSC TOC-only uses articlelanding',async()=>{
    const url=await page.evaluate(()=>T.articleUrl({doi:'10.1039/D6SC06246F',publisher:'rsc',captureToc:true,captureFigures:false,captureEvidence:false}));
    assert.equal(url,'https://pubs.rsc.org/en/content/articlelanding/2026/sc/d6sc06246f');
  });

  await tc('RSC figure/evidence visit uses articlehtml',async()=>{
    const urls=await page.evaluate(()=>[
      T.articleUrl({doi:'10.1039/D6SC06246F',publisher:'rsc',captureFigures:true}),
      T.articleUrl({doi:'10.1039/D6GC03578G',publisher:'rsc',captureEvidence:true})
    ]);
    assert.deepEqual(urls,[
      'https://pubs.rsc.org/en/content/articlehtml/2026/sc/d6sc06246f',
      'https://pubs.rsc.org/en/content/articlehtml/2026/gc/d6gc03578g'
    ]);
  });

  await tc('Elsevier exact DOI card selects the bound PII among multiple results',async()=>{
    const target=await page.evaluate(()=>{
      document.querySelector('#root').innerHTML=
        '<article><p>10.1016/j.other.2026.1</p><a href="/science/article/pii/S0000000000000001">wrong</a></article>'+
        '<article><p>DOI 10.1016/j.chempr.2026.103282</p><a href="/science/article/pii/S2451929426003487">target</a></article>';
      return T.elsevierSearchTargetFromDocument(
        {doi:'10.1016/j.chempr.2026.103282',publisher:'elsevier'},
        document,
        'https://www.sciencedirect.com/search?qs=10.1016%2Fj.chempr.2026.103282'
      );
    });
    assert.equal(target,'https://www.sciencedirect.com/science/article/pii/S2451929426003487');
  });

  await tc('Elsevier exact-query single-result fallback is allowed',async()=>{
    const target=await page.evaluate(()=>{
      document.querySelector('#root').innerHTML='<article><a href="/science/article/pii/S2451929426003487">one result</a></article>';
      return T.elsevierSearchTargetFromDocument(
        {doi:'10.1016/j.chempr.2026.103282',publisher:'elsevier'},
        document,
        'https://www.sciencedirect.com/search?qs=10.1016%2Fj.chempr.2026.103282'
      );
    });
    assert.equal(target,'https://www.sciencedirect.com/science/article/pii/S2451929426003487');
  });

  await tc('Elsevier ambiguous unbound search results fail closed',async()=>{
    const target=await page.evaluate(()=>{
      document.querySelector('#root').innerHTML=
        '<a href="/science/article/pii/S2451929426003487">one</a>'+
        '<a href="/science/article/pii/S2451929426009999">two</a>';
      return T.elsevierSearchTargetFromDocument(
        {doi:'10.1016/j.chempr.2026.103282',publisher:'elsevier'},
        document,
        'https://www.sciencedirect.com/search?qs=10.1016%2Fj.chempr.2026.103282'
      );
    });
    assert.equal(target,'');
  });

  await tc('RSC and CCS same-origin TOC fallbacks are wired into paired discovery',async()=>{
    assert.ok(source.includes("publisher === 'rsc' && location.hostname.endsWith('pubs.rsc.org')"));
    assert.ok(source.includes("add(rscArticleRoute(job, false));"));
    assert.ok(source.includes("add(rscArticleRoute(job, true));"));
    assert.ok(source.includes("ccsTocIndexCandidatesFromDocument(job, doc, current)"));
    assert.ok(source.includes("job.publisher==='acs'||job.publisher==='wiley'||job.publisher==='rsc'||job.publisher==='ccs'"));
  });

  await tc('Elsevier search resolver runs before strict article-page DOI binding',async()=>{
    const route=source.indexOf('if (String(job.publisher || publisherForDoi(normalizeDoi(job.doi))) === \'elsevier\' && isElsevierSearchRoute(job))');
    const bind=source.indexOf('await bindPublisherCaptureJob(job);',route);
    assert.ok(route>0&&bind>route);
  });

  assert.ok(source.includes("var PUBLISHER_MEDIA_REVISION = '20261004-publisher-routes-v9';"));
  assert.ok(source.includes("var VERSION = '6.2.20';"));
  assert.ok(source.includes("var INSTALL_REVISION = '6.2.23';"));
}finally{
  await browser.close();
}
console.log(JSON.stringify({passed,scope:['Chem','Chemical Science','Green Chemistry','CCS Chemistry']}));
