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
  "globalThis.T={rscRouteParts,rscArticleHtmlUrl,rscPdfPreviewUrl,rscBodyFigureContext,rscGraphicalAbstractCandidates,rscSearchResultUrl,rscIssuePageUrls,rscIssueTocCandidatesFromDocument,elsevierGraphicalAbstractCandidates,ccsAssetFigureLabel,ccsTocIndexUrlFromCrossrefPayload,ccsTocIndexUrls,ccsTocIndexCandidatesFromDocument};",
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

  await tc('RSC page-preview PDF GIF is never accepted as graphical abstract',async()=>{
    const result=await page.evaluate(()=>{
      const root=document.querySelector('#fixture');
      root.innerHTML='<section class="abstract_graphical"><h2>Graphical abstract</h2>'+
        '<img alt="Graphical abstract" src="/image/article/d6sc06421c.pdf.gif">'+
        '<img alt="Graphical abstract reaction" src="/image/article/d6sc06421c-ga.png"></section>';
      return {
        preview:T.rscPdfPreviewUrl('https://pubs.rsc.org/image/article/d6sc06421c.pdf.gif'),
        candidates:T.rscGraphicalAbstractCandidates(
          {doi:'10.1039/d6sc06421c',publisher:'rsc'},root,
          'https://pubs.rsc.org/en/content/articlehtml/2026/sc/d6sc06421c'
        ).map(x=>x.url)
      };
    });
    assert.equal(result.preview,true);
    assert.equal(result.candidates.length,1);
    assert.match(result.candidates[0],/d6sc06421c-ga\.png/);
    assert.ok(!result.candidates.some(url=>/\.pdf\.gif(?:$|[?#])/i.test(url)));
    assert.ok(source.includes("stage:'rsc_toc_candidate',event:'pdf_preview_rejected'"));
    assert.ok(source.includes("stage:'rsc_figure_candidate',event:'pdf_preview_rejected'"));
  });

  await tc('RSC exact-DOI search page can recover a non-preview article visual',async()=>{
    const result=await page.evaluate(()=>{
      const root=document.querySelector('#fixture');
      root.innerHTML='<section class="search-result"><a href="/gc/article/doi/10.1039/D6GC03161G/1364936">10.1039/D6GC03161G</a>'+
        '<img alt="Graphical abstract" src="https://rscj.silverchair-cdn.com/rscj/content_public/journal/gc/pap/10.1039_d6gc03161g/1/d6gc03161g-ga.png">'+
        '<img alt="Article PDF first page preview" src="https://rscj.silverchair-cdn.com/rscj/content_public/journal/gc/jam/10.1039_d6gc03161g/1/d6gc03161g.pdf.gif"></section>'+
        '<section class="search-result"><a href="/gc/article/doi/10.1039/D6GC00000A/1">10.1039/D6GC00000A</a><img src="/other.png"></section>';
      return {
        searchUrl:T.rscSearchResultUrl({doi:'10.1039/d6gc03161g',publisher:'rsc'}),
        rows:T.rscIssueTocCandidatesFromDocument({doi:'10.1039/d6gc03161g',publisher:'rsc'},root,'https://pubs.rsc.org/en/results?searchtext=10.1039%2Fd6gc03161g')
          .map(x=>({url:x.url,kind:x.kind,source:x.source}))
      };
    });
    assert.match(result.searchUrl,/\/en\/results\?searchtext=10\.1039%2Fd6gc03161g$/i);
    assert.equal(result.rows.length,1);
    assert.equal(result.rows[0].kind,'official');
    assert.match(result.rows[0].url,/d6gc03161g-ga\.png/);
    assert.doesNotMatch(result.rows[0].url,/pdf\.gif/);
  });

  await tc('RSC issue page binds one non-preview visual to the target DOI',async()=>{
    const result=await page.evaluate(()=>{
      const root=document.querySelector('#fixture');
      root.innerHTML='<meta name="citation_volume" content="18"><meta name="citation_issue" content="42">'+
        '<a href="/sc/issue/18/42">Current issue</a>'+
        '<article class="issue-item"><a href="/sc/article/doi/10.1039/D6SC06421C/1">10.1039/D6SC06421C</a>'+
        '<img alt="Graphical abstract" src="/assets/d6sc06421c-ga.png"><img alt="Article PDF first page preview" src="/assets/d6sc06421c.pdf.gif"></article>'+
        '<article class="issue-item"><a href="/sc/article/doi/10.1039/D6SC00000A/2">10.1039/D6SC00000A</a><img src="/assets/other.png"></article>';
      return {
        urls:T.rscIssuePageUrls({doi:'10.1039/d6sc06421c',publisher:'rsc'},root,'https://pubs.rsc.org/sc/article/doi/10.1039/D6SC06421C/1'),
        rows:T.rscIssueTocCandidatesFromDocument({doi:'10.1039/d6sc06421c',publisher:'rsc'},root,'https://pubs.rsc.org/sc/issue/18/42')
          .map(x=>({url:x.url,kind:x.kind,source:x.source}))
      };
    });
    assert.ok(result.urls.some(url=>/\/sc\/issue\/18\/42/.test(url)));
    assert.equal(result.rows.length,1);assert.equal(result.rows[0].kind,'official');
    assert.match(result.rows[0].url,/d6sc06421c-ga\.png/);assert.doesNotMatch(result.rows[0].url,/pdf\.gif/);
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

  await tc('CCS asset names distinguish Figure from Scheme deterministically',async()=>{
    const labels=await page.evaluate(()=>[
      T.ccsAssetFigureLabel('https://www.chinesechemsoc.org/cms/asset/x/f1.gif'),
      T.ccsAssetFigureLabel('https://www.chinesechemsoc.org/cms/asset/x/f12.jpg'),
      T.ccsAssetFigureLabel('https://www.chinesechemsoc.org/cms/asset/x/sf1.gif'),
      T.ccsAssetFigureLabel('https://www.chinesechemsoc.org/cms/asset/x/sf03.png'),
      T.ccsAssetFigureLabel('https://www.chinesechemsoc.org/specs/ux3/releasedAssets/images/loader.gif')
    ]);
    assert.deepEqual(labels,['Figure 1','Figure 12','Scheme 1','Scheme 3','']);
  });

  await tc('CCS Crossref volume issue maps to deterministic journal TOC route',async()=>{
    const rows=await page.evaluate(()=>[
      T.ccsTocIndexUrlFromCrossrefPayload(
        {doi:'10.31635/ccschem.026.202607659',publisher:'ccs'},
        {message:{volume:'8',issue:'10','journal-issue':{issue:'10'}}},
        'https://www.chinesechemsoc.org/doi/10.31635/ccschem.026.202607659'
      ),
      T.ccsTocIndexUrlFromCrossrefPayload(
        {doi:'10.31635/ccschem.026.202607659',publisher:'ccs'},
        {message:{volume:'8'}},
        'https://www.chinesechemsoc.org/'
      )
    ]);
    assert.equal(rows[0],'https://www.chinesechemsoc.org/toc/ccschem/8/10');
    assert.equal(rows[1],'');
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
    assert.ok(source.includes("https://api.crossref.org/works/"));
    assert.ok(source.includes("var crossrefTocUrl=await ccsCrossrefTocIndexUrl(job,trace);"));
    assert.ok(source.includes("stage:'ccs_toc_route',event:'crossref_volume_issue'"));
  });

  await tc('Chem and RSC publisher binding wait is adaptive but DOI-safe',async()=>{
    assert.ok(source.includes("if(publisher==='elsevier')return 45000;"));
    assert.ok(source.includes("if(publisher==='rsc')return 30000;"));
    assert.ok(source.includes("writePublisherHeartbeat(job,'publisher_binding_wait')"));
    assert.ok(source.includes("status:'publisher_binding_wait'"));
    assert.ok(source.includes("if(String(error.message)!=='page_doi_unverified')throw error;"));
    assert.ok(source.includes("if(!interstitial&&Date.now()-started>8000&&bodyLength>1200)throw error;"));
  });

  await tc('CCS recovered key image persists and CCS body order is DOM order',async()=>{
    assert.ok(source.includes('var toc=[],figures=[],recoveredOfficialToc=[];'));
    assert.ok(source.includes('if(wantsToc&&!toc.length&&recoveredOfficialToc.length)toc=recoveredOfficialToc.slice();'));
    assert.ok(source.includes('recoveredOfficialToc=recovered.slice();'));
    assert.ok(source.includes("message:'official='+String(toc.length)+';persisted=1'"));
    assert.ok(source.includes("if(job.publisher!=='ccs')rows.sort"));
    assert.ok(source.includes("stage:'ccs_figure_label',event:'conflict',status:'rejected'"));
    assert.ok(source.includes("allowFigureOne:publisherForDoi(doi)!=='ccs'"));
    assert.ok(source.includes("allowFigureOne && publisher !== 'ccs'"));
  });

  await tc('capture protocol and core controller stay unchanged',async()=>{
    assert.ok(source.includes("var VERSION = '6.2.20'"));
    assert.ok(source.includes("var CONTROLLER_REVISION = '2.2.41'"));
    assert.ok(source.includes("PUBLISHER_MEDIA_REVISION = '20261007-rsc-search-fallback-v14'"));
    assert.ok(source.includes("PUBLISHER_TASK_BINDING_REVISION = '20261005-interstitial-bind-v4'"));
  });
}finally{await browser.close()}
console.log(JSON.stringify({passed,targetJournals:['Chem','Chemical Science','Green Chemistry','CCS Chemistry']}));
