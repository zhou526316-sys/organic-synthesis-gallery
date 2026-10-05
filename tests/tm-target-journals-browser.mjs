import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const source=await fs.readFile('public/toc-mainline.user.js','utf8');
const adapters=await fs.readFile('scripts/tm-rsc-elsevier-ccs.inc.js','utf8');

const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
await page.setContent('<!doctype html><main id="fixture"></main>');
const harness=[
  '(function(){',
  "'use strict';",
  "function normalizeDoi(v){return String(v||'').trim().toLowerCase().replace(/^https?:\\/\\/(?:dx\\.)?doi\\.org\\//,'').replace(/^doi:\\s*/,'').replace(/[?#].*$/,'').replace(/[).,;]+$/,'')}",
  "function publisherForDoi(d){d=normalizeDoi(d);if(d.startsWith('10.1039/'))return 'rsc';if(d.startsWith('10.1016/'))return 'elsevier';if(d.startsWith('10.31635/'))return 'ccs';return 'other'}",
  "function normalizeUrl(v,b){try{return new URL(v,b||location.href).href}catch{return ''}}",
  "function candidateBelongsToJob(){return true}",
  "function reject(text,url){return /journal[\\s_-]*cover|issue[\\s_-]*cover|masthead|site[-_ ]?logo|favicon|avatar|advert|banner|spinner|loading|tracking|pixel|cookie|placeholder|qr-code/i.test(String(text||'')+' '+String(url||''))}",
  "function articleFigureLabel(t){const m=String(t||'').match(/^(?:Fig(?:ure)?\\.?|Scheme|Chart)\\s*(\\d+[a-z]?)/i);return m?( /^scheme/i.test(t)?'Scheme ':/^chart/i.test(t)?'Chart ':'Figure ')+m[1]:''}",
  "function articleFigureImageUrls(node,base){const out=[];const add=v=>{try{if(v){const u=new URL(v,base).href;if(!out.includes(u))out.push(u)}}catch{}};['data-full-src','data-full','data-lg-src','data-hi-res-src','data-src-large','data-original','data-src','data-lazy-src','src'].forEach(k=>add(node.getAttribute&&node.getAttribute(k)));if(node.getAttribute){String(node.getAttribute('srcset')||'').split(',').forEach(x=>add(x.trim().split(/\\s+/)[0]));}return out}",
  "function contextFor(node){let out=[];[node.alt,node.title,node.getAttribute&&node.getAttribute('aria-label')].forEach(v=>{if(v)out.push(v)});let root=node.parentElement;for(let d=0;root&&d<4;d++,root=root.parentElement){out.push(String(root.className||''),String(root.id||''),String(root.textContent||'').slice(0,600));}return out.join(' ')}",
  adapters,
  "globalThis.T={rscRouteParts,rscArticleHtmlUrl,rscBodyFigureContext,rscGraphicalAbstractCandidates,elsevierGraphicalAbstractCandidates,ccsTocIndexUrls,ccsTocIndexCandidatesFromDocument};",
  '})();'
].join('\n');
await page.addScriptTag({content:harness});

let passed=0;async function tc(name,fn){await fn();passed++;console.log('TARGET_JOURNAL_PASS '+name)}
try{
  await tc('Chemical Science and Green Chemistry map to 2026 RSC SC/GC routes',async()=>{
    const rows=await page.evaluate(()=>[
      T.rscRouteParts({doi:'10.1039/D6SC02478E',publisher:'rsc'}),
      T.rscRouteParts({doi:'10.1039/D6GC02452A',publisher:'rsc'}),
      T.rscArticleHtmlUrl({doi:'10.1039/D6SC02478E',publisher:'rsc'}),
      T.rscArticleHtmlUrl({doi:'10.1039/D6GC02452A',publisher:'rsc'})
    ]);
    assert.equal(rows[0].year,'2026');assert.equal(rows[0].code,'sc');
    assert.equal(rows[1].year,'2026');assert.equal(rows[1].code,'gc');
    assert.equal(rows[2],'https://pubs.rsc.org/en/content/articlehtml/2026/sc/d6sc02478e');
    assert.equal(rows[3],'https://pubs.rsc.org/en/content/articlehtml/2026/gc/d6gc02452a');
  });

  await tc('RSC graphical abstract and Figure 1 remain separate',async()=>{
    const result=await page.evaluate(()=>{
      const root=document.querySelector('#fixture');
      root.innerHTML='<section class="abstract_graphical"><h2>Graphical abstract</h2><img alt="Graphical abstract: test reaction" src="/images/ga.jpg"></section>'+
        '<div class="image_table"><span class="image_title">Fig. 1 Reaction scheme</span><img id="f1" src="/images/f1.jpg"></div>';
      const ga=T.rscGraphicalAbstractCandidates({doi:'10.1039/d6sc02478e',publisher:'rsc'},root,'https://pubs.rsc.org/en/content/articlelanding/2026/sc/d6sc02478e');
      const fig=T.rscBodyFigureContext(document.querySelector('#f1'),null);
      return {ga:ga.map(x=>({kind:x.kind,source:x.source,url:x.url})),fig};
    });
    assert.equal(result.ga.length,1);assert.equal(result.ga[0].kind,'official');
    assert.match(result.ga[0].source,/rsc_graphical_abstract/);
    assert.equal(result.fig.label,'Figure 1');assert.equal(result.fig.official,false);
  });

  await tc('Chem graphical abstract is isolated from numbered figures',async()=>{
    const result=await page.evaluate(()=>{
      const root=document.querySelector('#fixture');
      root.innerHTML='<section id="graphical-abstract"><h2>Graphical abstract</h2><img src="/asset/ga.jpg" alt="Image, graphical abstract"></section>'+
        '<figure><figcaption>Figure 1. Mechanism.</figcaption><img src="/asset/f1.jpg" alt="Figure 1"></figure>';
      return T.elsevierGraphicalAbstractCandidates({doi:'10.1016/j.chempr.2026.103282',publisher:'elsevier'},root,'https://www.sciencedirect.com/science/article/pii/S2451929426009999').map(x=>({kind:x.kind,url:x.url}));
    });
    assert.equal(result.length,1);assert.equal(result[0].kind,'official');assert.match(result[0].url,/ga\.jpg/);
  });

  await tc('CCS accepts only target DOI key image as official TOC',async()=>{
    const rows=await page.evaluate(()=>{
      const root=document.querySelector('#fixture');
      root.innerHTML='<div class="paper"><a href="/doi/10.31635/ccschem.026.OTHER">10.31635/ccschem.026.OTHER</a><span>key image</span><img alt="key image" src="/wrong.jpg"></div>'+
        '<div class="paper"><a href="/doi/10.31635/ccschem.026.202608315">10.31635/ccschem.026.202608315</a><span>key image</span><img alt="key image" src="/right.jpg"></div>';
      return T.ccsTocIndexCandidatesFromDocument({doi:'10.31635/ccschem.026.202608315',publisher:'ccs'},root,'https://www.chinesechemsoc.org/toc/ccschem/0/0').map(x=>({source:x.source,url:x.url,kind:x.kind}));
    });
    assert.equal(rows.length,1);assert.equal(rows[0].source,'ccs_toc_index_key_image');
    assert.equal(rows[0].kind,'official');assert.match(rows[0].url,/right\.jpg/);
  });

  await tc('manual from-head uses the same resolved bound URL path as automatic capture',async()=>{
    assert.ok(source.includes('var manualTaskUrl=await resolvePublisherTaskUrl(job);'));
    assert.ok(source.includes('GM_openInTab(boundPublisherJobUrl(manualTaskUrl,job.jobId)'));
    assert.ok(!source.includes("GM_openInTab(articleUrl(job)+'#osg-job='"));
  });

  await tc('Elsevier direct resolution and RSC/CCS fallbacks are present',async()=>{
    assert.ok(source.includes("resolvedHost === 'linkinghub.elsevier.com'"));
    assert.ok(source.includes("'https://www.sciencedirect.com/science/article/pii/' + pii[1]"));
    assert.ok(source.includes("publisher === 'rsc'"));
    assert.ok(source.includes("rscArticleHtmlUrl(job)"));
    assert.ok(source.includes("job.publisher==='acs'||job.publisher==='wiley'||job.publisher==='rsc'||job.publisher==='ccs'"));
    assert.ok(source.includes("ccsTocIndexCandidatesFromDocument(job,doc,current)"));
  });

  await tc('Chem and RSC publisher binding wait is adaptive but DOI-safe',async()=>{
    assert.ok(source.includes("if(publisher==='elsevier')return 45000;"));
    assert.ok(source.includes("if(publisher==='rsc')return 30000;"));
    assert.ok(source.includes("writePublisherHeartbeat(job,'publisher_binding_wait')"));
    assert.ok(source.includes("status:'publisher_binding_wait'"));
    assert.ok(source.includes("if(String(error.message)!=='page_doi_unverified')throw error;"));
    assert.ok(source.includes("if(!interstitial&&Date.now()-started>8000&&bodyLength>1200)throw error;"));
  });

  await tc('capture protocol and core controller stay unchanged',async()=>{
    assert.ok(source.includes("var VERSION = '6.2.20'"));
    assert.ok(source.includes("var CONTROLLER_REVISION = '2.2.39'"));
    assert.ok(source.includes("PUBLISHER_MEDIA_REVISION = '20261004-rsc-elsevier-ccs-v9'"));
    assert.ok(source.includes("PUBLISHER_TASK_BINDING_REVISION = '20261005-interstitial-bind-v4'"));
  });
}finally{await browser.close()}
console.log(JSON.stringify({passed,targetJournals:['Chem','Chemical Science','Green Chemistry','CCS Chemistry']}));
