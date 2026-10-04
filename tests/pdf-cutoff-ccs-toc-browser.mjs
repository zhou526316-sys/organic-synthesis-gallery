import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const ccsRuntime=await fs.readFile('scripts/tm-ccs-toc-index.inc.js','utf8');
const pdfRuntime=await fs.readFile('scripts/tm-private-pdf-capture.inc.js','utf8');
const source=await fs.readFile('public/toc-mainline.user.js','utf8');

const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
await page.setContent('<!doctype html><meta name="citation_volume" content="8"><meta name="citation_issue" content="5"><main id="root"></main>');
const harness=[
'(function(){',
"'use strict';",
"var WORKER='https://api.gczhouwld.com';var P='osg-toc-v6:';",
"function normalizeDoi(v){return String(v||'').trim().toLowerCase().replace(/^https?:\\/\\/(?:dx\\.)?doi\\.org\\//,'').replace(/^doi:\\s*/,'').replace(/[?#].*$/,'').replace(/[).,;]+$/,'')}",
"function publisherForDoi(d){d=normalizeDoi(d);return d.startsWith('10.31635/')?'ccs':'other'}",
"function normalizeUrl(v,b){try{return new URL(v,b||location.href).href}catch{return ''}}",
"function reject(text,url){return /journal[\\s_-]*cover|issue[\\s_-]*cover|masthead|site[-_ ]?logo|favicon|avatar|advert|banner|spinner|loading|tracking|pixel|cookie|placeholder|qr-code/i.test(String(text||'')+' '+String(url||''))}",
"function articleFigureImageUrls(node,base){let out=[];function add(v){try{if(v)out.push(new URL(v,base).href)}catch{}};if(node.tagName==='IMG'){add(node.getAttribute('src'));add(node.getAttribute('data-src'));const p=node.closest('picture');if(p)p.querySelectorAll('source').forEach(s=>String(s.getAttribute('srcset')||'').split(',').forEach(x=>add(x.trim().split(/\\s+/)[0])))}return [...new Set(out)]}",
"function currentCaptureJob(){return true};function GM_getValue(){return null};function GM_setValue(){};function GM_deleteValue(){};",
ccsRuntime,
pdfRuntime,
"globalThis.T={ccsTocIndexUrls,ccsTocIndexCandidatesFromDocument,privatePdfCaptureEligibleByAddedDate,PRIVATE_PDF_ADDED_DATE_CUTOFF};",
'})();'
].join('\n');
await page.addScriptTag({content:harness});

let passed=0;async function tc(name,fn){await fn();passed++;console.log('PDF_CCS_PASS '+name)}
try{
  await tc('CCS exact DOI key image is official TOC and wrong article is ignored',async()=>{
    const rows=await page.evaluate(()=>{
      document.querySelector('#root').innerHTML=
        '<div class="card"><a href="/doi/10.31635/ccschem.026.OTHER">10.31635/ccschem.026.OTHER</a><span>key image</span><img alt="key image" src="/cms/asset/wrong/key.jpg"></div>'+
        '<div class="card"><a href="https://doi.org/10.31635/ccschem.026.202608315">10.31635/ccschem.026.202608315</a><div><span>key image</span><picture><source srcset="/cms/asset/right/key.webp 2x"><img alt="key image" src="/cms/asset/right/key.jpg"></picture></div></div>';
      return T.ccsTocIndexCandidatesFromDocument({doi:'10.31635/ccschem.026.202608315',publisher:'ccs'},document,'https://www.chinesechemsoc.org/toc/ccschem/0/0');
    });
    assert.ok(rows.length>=1);assert.ok(rows.every(x=>x.kind==='official'&&x.assetType==='toc_graphic'&&x.source==='ccs_toc_index_key_image'));
    assert.ok(rows.every(x=>x.url.includes('/right/')));assert.ok(rows.every(x=>!x.url.includes('/wrong/')));
  });
  await tc('CCS Figure 1 alone is never promoted to official key image',async()=>{
    const n=await page.evaluate(()=>{
      document.querySelector('#root').innerHTML='<div class="card"><a href="/doi/10.31635/ccschem.026.202608315">10.31635/ccschem.026.202608315</a><figure><figcaption>Figure 1. Reaction scheme</figcaption><img alt="Figure 1" src="/cms/asset/x/f1.jpg"></figure></div>';
      return T.ccsTocIndexCandidatesFromDocument({doi:'10.31635/ccschem.026.202608315',publisher:'ccs'},document,'https://www.chinesechemsoc.org/toc/ccschem/0/0').length;
    });
    assert.equal(n,0);
  });
  await tc('CCS shared ancestor containing multiple DOI cards is rejected',async()=>{
    const n=await page.evaluate(()=>{
      document.querySelector('#root').innerHTML='<section><a href="/doi/10.31635/ccschem.026.202608315">10.31635/ccschem.026.202608315</a><a href="/doi/10.31635/ccschem.026.OTHER">10.31635/ccschem.026.OTHER</a><span>key image</span><img alt="key image" src="/cms/asset/shared/key.jpg"></section>';
      return T.ccsTocIndexCandidatesFromDocument({doi:'10.31635/ccschem.026.202608315',publisher:'ccs'},document,'https://www.chinesechemsoc.org/toc/ccschem/0/0').length;
    });
    assert.equal(n,0);
  });
  await tc('CCS index candidates cover Ahead of Print, Just Accepted, and exact volume issue',async()=>{
    const urls=await page.evaluate(()=>T.ccsTocIndexUrls({doi:'10.31635/ccschem.026.202608315',publisher:'ccs'},document,'https://www.chinesechemsoc.org/doi/10.31635/ccschem.026.202608315'));
    assert.deepEqual(urls,[
      'https://www.chinesechemsoc.org/toc/ccschem/0/0',
      'https://www.chinesechemsoc.org/toc/ccschem/0/ja',
      'https://www.chinesechemsoc.org/toc/ccschem/8/5'
    ]);
  });
  await tc('PDF cutoff includes Oct 1 website additions',async()=>{
    assert.equal(await page.evaluate(()=>T.privatePdfCaptureEligibleByAddedDate({addedDate:'2026-10-01'})),true);
    assert.equal(await page.evaluate(()=>T.privatePdfCaptureEligibleByAddedDate({addedDate:'2026-10-04'})),true);
  });
  await tc('PDF cutoff excludes Sep30 and missing addedDate even when publication date is newer',async()=>{
    assert.equal(await page.evaluate(()=>T.privatePdfCaptureEligibleByAddedDate({addedDate:'2026-09-30',date:'2026-10-04'})),false);
    assert.equal(await page.evaluate(()=>T.privatePdfCaptureEligibleByAddedDate({date:'2026-10-04'})),false);
  });
  assert.ok(source.includes("job.publisher==='acs'||job.publisher==='wiley'||job.publisher==='rsc'||job.publisher==='ccs'"));
  assert.ok(source.includes("ccsTocIndexCandidatesFromDocument(job, doc, current)"));
  assert.ok(source.includes("PRIVATE_PDF_ADDED_DATE_CUTOFF = '2026-10-01'"));
}finally{await browser.close()}
console.log(JSON.stringify({passed,cutoff:'2026-10-01',cutoffField:'addedDate'}));
