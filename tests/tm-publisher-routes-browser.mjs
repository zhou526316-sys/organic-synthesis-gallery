import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const source=await fs.readFile('public/toc-mainline.user.js','utf8');
const routing=await fs.readFile('scripts/tm-rsc-elsevier-routing.inc.js','utf8');

const ai=source.indexOf('  function articleUrl(job) {');
const aj=source.indexOf('\n\n  function resultKey(',ai);
assert.ok(ai>0&&aj>ai,'publisher-route extraction failed');
const publisherSource=source.slice(ai,aj);

const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
await page.setContent('<!doctype html><main id="root"></main>');
const harness=[
'(function(){',
"'use strict';",
"function normalizeDoi(v){return String(v||'').trim().toLowerCase().replace(/^https?:\\/\\/(?:dx\\.)?doi\\.org\\//,'').replace(/^doi:\\s*/,'').replace(/[?#].*$/,'').replace(/[).,;]+$/,'')}",
"function publisherForDoi(d){d=normalizeDoi(d);if(d.startsWith('10.1039/'))return 'rsc';if(d.startsWith('10.1016/'))return 'elsevier';return 'other'}",
"var location={href:'https://gallery.gczhouwld.com/',hostname:'gallery.gczhouwld.com'};",
"var gmRequest=async()=>{throw new Error('not used in this fixture')};",
routing,
publisherSource,
"globalThis.T={rscArticleRoute,articleUrl,elsevierResolvedPublisherUrl,publisherArticleHostAllowed,boundPublisherJobUrl};",
'})();'
].join('\n');
await page.addScriptTag({content:harness});

let passed=0;
async function tc(name,fn){await fn();passed++;console.log('PUBLISHER_ROUTE_PASS '+name)}
try{
  await tc('Chem keeps DOI URL as resolver input',async()=>{
    const url=await page.evaluate(()=>T.articleUrl({doi:'10.1016/j.chempr.2026.103282',publisher:'elsevier',captureToc:true}));
    assert.equal(url,'https://doi.org/10.1016/j.chempr.2026.103282');
  });

  await tc('main Elsevier resolver converts linkinghub PII to ScienceDirect article',async()=>{
    const url=await page.evaluate(()=>T.elsevierResolvedPublisherUrl({
      status:403,
      finalUrl:'https://linkinghub.elsevier.com/retrieve/pii/S2451929426003487',
      responseText:''
    }));
    assert.equal(url,'https://www.sciencedirect.com/science/article/pii/S2451929426003487');
  });

  await tc('Elsevier resolver rejects foreign lookalike hosts',async()=>{
    const values=await page.evaluate(()=>[
      T.publisherArticleHostAllowed('elsevier','https://www.sciencedirect.com/science/article/pii/S2451929426003487'),
      T.publisherArticleHostAllowed('elsevier','https://www.sciencedirect.com.evil.example/science/article/pii/X')
    ]);
    assert.deepEqual(values,[true,false]);
  });

  await tc('RSC TOC-only uses articlelanding',async()=>{
    const url=await page.evaluate(()=>T.articleUrl({doi:'10.1039/D6SC06246F',publisher:'rsc',captureToc:true,captureFigures:false,captureEvidence:false}));
    assert.equal(url,'https://pubs.rsc.org/en/content/articlelanding/2026/sc/d6sc06246f');
  });

  await tc('RSC figure and evidence visits use articlehtml',async()=>{
    const urls=await page.evaluate(()=>[
      T.articleUrl({doi:'10.1039/D6SC06246F',publisher:'rsc',captureFigures:true}),
      T.articleUrl({doi:'10.1039/D6GC03578G',publisher:'rsc',captureEvidence:true})
    ]);
    assert.deepEqual(urls,[
      'https://pubs.rsc.org/en/content/articlehtml/2026/sc/d6sc06246f',
      'https://pubs.rsc.org/en/content/articlehtml/2026/gc/d6gc03578g'
    ]);
  });

  await tc('RSC and CCS same-origin TOC fallbacks are wired',async()=>{
    assert.ok(source.includes("publisher === 'rsc' && location.hostname.endsWith('pubs.rsc.org')"));
    assert.ok(source.includes("add(rscArticleRoute(job, false));"));
    assert.ok(source.includes("add(rscArticleRoute(job, true));"));
    assert.ok(source.includes("ccsTocIndexCandidatesFromDocument(job, doc, current)"));
    assert.ok(source.includes("job.publisher==='acs'||job.publisher==='wiley'||job.publisher==='rsc'||job.publisher==='ccs'"));
  });

  await tc('manual full-queue path uses the same Elsevier resolver as automatic controller',async()=>{
    const start=source.indexOf("badge('连续补缺 · ");
    const end=source.indexOf('  function completeControllerResume()',start);
    assert.ok(start>0&&end>start);
    const manual=source.slice(start,end);
    const resolve=manual.indexOf('taskUrl=await resolvePublisherTaskUrl(job);');
    const store=manual.indexOf('job.resolvedArticleUrl=taskUrl;');
    const open=manual.indexOf('GM_openInTab(boundPublisherJobUrl(taskUrl,job.jobId)');
    assert.ok(resolve>=0&&store>resolve&&open>store);
    assert.ok(!manual.includes("GM_openInTab(articleUrl(job)+'#osg-job='"));
  });

  await tc('automatic controller retains the resolver and bound job URL',async()=>{
    const marker=source.indexOf('taskUrl=await resolvePublisherTaskUrl(job);',source.indexOf('async function controllerRun()'));
    const open=source.indexOf('GM_openInTab(boundPublisherJobUrl(taskUrl,job.jobId)',marker);
    assert.ok(marker>0&&open>marker);
  });

  await tc('duplicate ScienceDirect-search resolver is absent',async()=>{
    assert.ok(!source.includes('function elsevierSearchRoute('));
    assert.ok(!source.includes('elsevier_exact_doi_search_result_not_found'));
  });

  await tc('current revisions are preserved',async()=>{
    assert.ok(source.includes("var PUBLISHER_MEDIA_REVISION = '20261004-publisher-routes-v9';"));
    assert.ok(source.includes("var VERSION = '6.2.20';"));
    assert.ok(source.includes("var INSTALL_REVISION = '6.2.25';"));
  });
}finally{
  await browser.close();
}
console.log(JSON.stringify({passed,scope:['Chem','Chemical Science','Green Chemistry','CCS Chemistry']}));
