import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {chromium} from 'playwright';

const source=await fs.readFile('public/toc-mainline.user.js','utf8');
const exports=['candidateRequestUrl','visualScope','collectCandidates','collectArticleFigureCandidates','svgQuality','measuredQuality','acquireBestVisual','runPublisherJob','pairedJobs','waitForResult'];
const exposed=source.replace('  installMenu();','  globalThis.__captureTest={'+exports.join(',')+'}; return;\n  installMenu();');
const browser=await chromium.launch({headless:true});
let passed=0;
function test(name,condition){assert.ok(condition,name);passed++;console.log('PAIRED_CAPTURE_PASS '+name);}
const doi='10.1021/acs.joc.6c01302';
const foreign='10.1021/jacs.6c13517';
const base='https://pubs.acs.org';
const dir='/10.1021_acs.joc.6c01302/';
const jobId='12345678-1234-1234-1234-123456789012';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="150" viewBox="0 0 320 150"><path d="M5,5L300,140L20,100Z" fill="none" stroke="black"/><text x="40" y="60">Reaction overview</text></svg>';
try{
 const page=await browser.newPage();
 const posts=[];
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(req.method()==='OPTIONS') return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type'}});
  if(req.method()==='POST'){
   const p=req.postDataJSON();posts.push({url:u.pathname,payload:p});
   if(u.pathname.includes('tampermonkey-report'))return route.fulfill({json:{stored:true},headers:{'access-control-allow-origin':'*'}});
   return route.fulfill({json:{stored:true,staged:u.pathname.endsWith('/stage'),doi:p.doi,id:p.id,kind:p.kind,width:p.width,height:p.height,contentHash:'test-hash',imageUrl:'https://example.test/object.svg'},headers:{'access-control-allow-origin':'*'}});
  }
  if(/\.svg$/.test(u.pathname))return route.fulfill({body:svg,contentType:'image/svg+xml',headers:{'access-control-allow-origin':'*'}});
  return route.fulfill({body:'<html><head><meta name="citation_doi" content="'+doi+'"></head><body><article><h1>Article</h1></article></body></html>',contentType:'text/html'});
 });
 await page.goto(base+'/doi/full/'+doi+'#osg-job='+jobId);
 await page.evaluate(({doi,jobId})=>{
  const storage={'osg-toc-v6:active-job':{doi,jobId,captureVersion:'6.2.20',publisher:'acs',mediaNeed:'toc+figures',captureToc:true,startedAt:new Date().toISOString()},'osg-toc-v6:write-token':'fixture-only-no-production-token'};
  window.__gm=storage;window.GM_getValue=(k,d)=>k in storage?storage[k]:d;window.GM_setValue=(k,v)=>{storage[k]=v;};window.GM_deleteValue=k=>{delete storage[k];};
  window.GM_listValues=()=>Object.keys(storage);window.GM_registerMenuCommand=()=>{};
  window.GM_xmlhttpRequest=opts=>{
   fetch(opts.url,{method:opts.method||'GET',body:opts.data,headers:opts.headers}).then(async r=>{const text=await r.text();opts.onload({status:r.status,responseText:text});}).catch(opts.onerror);
  };
  sessionStorage.setItem('osg-toc-v6:tab-job-binding',jobId);
 },{doi,jobId});
 await page.addScriptTag({content:exposed});
 await page.evaluate(({dir,foreign})=>{
  document.querySelector('article').innerHTML=`<h1>Article</h1><figure id="graphicalAbstract"><figcaption>Visual Abstract</figcaption><img src="${dir}toc.svg"></figure><figure id="scheme1"><figcaption>Scheme 1. Substrate scope with references to Figure 2.</figcaption><a href="${dir}scheme-large.svg">Original</a><img src="${dir}scheme-small.svg"></figure><figure id="fig2"><figcaption>Figure 2. Mechanism</figcaption><img src="${dir}fig2.svg"></figure><aside class="recommended"><figure><figcaption>Figure 3. Recommended other paper</figcaption><img src="/10.1021_jacs.6c13517/other.svg"></figure></aside><div class="figure"><div class="caption">Scheme 8. Old context</div><div class="caption">Scheme 9. Wrong shared context</div><img src="${dir}shared.svg"></div>`;
 },{dir,foreign});
 const found=await page.evaluate(()=>{
  const t=__captureTest,j=__gm['osg-toc-v6:active-job'];
  return {toc:t.collectCandidates(j,[],document,location.href,'test',true).map(r=>({url:r.url,kind:r.kind})),fig:t.collectArticleFigureCandidates(j,[],document,location.href,'test').map(r=>({label:r.label,text:r.text,url:r.url})),request:t.candidateRequestUrl({url:'https://example.test/large.png',element:{currentSrc:'https://example.test/small.png'}})};
 });
 test('selected high URL cannot be replaced by thumbnail currentSrc',found.request==='https://example.test/large.png');
 test('TOC is isolated from adjacent Scheme',found.toc.length===1&&found.toc[0].url.endsWith('toc.svg'));
 test('body labels are scoped to own captions',new Set(found.fig.map(r=>r.label)).size===2&&found.fig.every(r=>['Scheme 1','Figure 2'].includes(r.label)));
 test('recommendations and shared multi-figure ancestors are rejected',found.fig.every(r=>!/(other|shared)\.svg/.test(r.url)));
 const quality=await page.evaluate(svg=>{
  const t=__captureTest;const wrap=s=>({imageData:'data:image/svg+xml;base64,'+btoa(s),contentType:'image/svg+xml',width:320,height:150});
  return {vector:t.measuredQuality(wrap(svg),'figure'),malicious:t.measuredQuality(wrap(svg.replace('</svg>','<script>alert(1)</script></svg>')),'figure'),raster:t.measuredQuality({contentType:'image/png',width:320,height:150},'figure')};
 },svg);
 test('small display dimensions do not reject genuine SVG vectors',quality.vector.usable&&quality.vector.quality==='vector');
 test('SVG active content rejected',!quality.malicious.usable);
 test('low-resolution raster threshold not loosened',!quality.raster.usable);
 const plan=await page.evaluate(({doi,foreign})=>{
  const q={mediaGeneration:1790082000000,webpageDoiCount:2,articles:[{doi,date:'2026-09-22'},{doi:foreign,date:'2026-09-21'}]};
  const out=__captureTest.pairedJobs(q,{items:{[doi]:{toc:{available:true,imageUrl:'restored.svg',reason:'reviewed_official_toc_recovery'}}}});
  let rejectsOld=false;try{__captureTest.pairedJobs({webpageDoiCount:512,visibleGaps:[]},{items:{}});}catch(_){rejectsOld=true;}
  return {out,rejectsOld};
 },{doi,foreign});
 test('one job per DOI requests paired capture',plan.out.length===2&&plan.out.every(j=>j.mediaNeed==='toc+figures'));
 test('restored TOC not needlessly overwritten while body still requested',plan.out[0].captureToc===false&&plan.out[1].captureToc===true);
 test('old incomplete queue is rejected rather than falsely called complete',plan.rejectsOld);
 // Real Chromium DOM + data-image decoding + HTTP storage receipts, with no external writes.
 const result=await page.evaluate(async()=>__captureTest.runPublisherJob(__gm['osg-toc-v6:active-job']));
 test('one publisher visit captures TOC and main-text figures',result.toc.status==='stored'&&result.figuresStaged===2&&result.status==='success');
 test('two body figures go directly to stage and never locked import',posts.filter(r=>r.url.endsWith('/stage')).length===2&&!posts.some(r=>r.url==='/api/article-figures/import'));
 test('paired success does not claim publication',result.published===false&&result.figuresImported===0);
 test('nonce-specific result acknowledgement is written',await page.evaluate(jobId=>__gm['osg-toc-v6:result:10.1021/acs.joc.6c01302'].jobId===jobId,jobId));
 const before=posts.length;
 await page.evaluate(()=>document.querySelector('#graphicalAbstract').remove());
 const partial=await page.evaluate(async()=>__captureTest.runPublisherJob(__gm['osg-toc-v6:active-job']));
 test('missing TOC does not stop body capture',partial.figuresStaged===2&&partial.toc.status==='not_found'&&partial.status==='partial');
 test('body still receives two storage receipts without TOC',posts.slice(before).filter(r=>r.url.endsWith('/stage')).length===2);
 await page.evaluate(()=>{__gm['osg-toc-v6:active-job'].jobId='old-task-must-not-bind';});
 let rejected=false;try{await page.evaluate(({doi,jobId})=>__captureTest.runPublisherJob({doi,jobId,captureVersion:'6.2.20'}),{doi,jobId});}catch(_){rejected=true;}
 test('stale task is refused before capture',rejected);
 const out=process.env.RUNNER_TEMP||'/tmp';
 await page.screenshot({path:out+'/paired-capture-fixture.png',fullPage:true});
 console.log('PAIRED_CAPTURE_TEST_SUMMARY '+JSON.stringify({passed,realBrowser:'Chromium',externalPublisherAccess:false,productionWrites:0,fixturePosts:posts.length}));
}finally{await browser.close();}
