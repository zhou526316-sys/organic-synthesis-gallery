import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {angewOfficialGaEvidenceError, importLocalCapture} from '../cloudflare/worker/src/local-captures.js';

const doi='10.1002/anie.4335022';
const articleUrl='https://onlinelibrary.wiley.com/doi/full/'+doi;
const ga='https://onlinelibrary.wiley.com/cms/asset/a/anie4335022-gra-0001-m.jpg';
const alternate='https://onlinelibrary.wiley.com/cms/asset/a/anie5624001-gra-0001-m.jpg';
const neutral='https://onlinelibrary.wiley.com/cms/asset/a/figure-original.jpg';
const make=(overrides={})=>({
  doi,kind:'official',captureVersion:'6.2.20',jobId:'12345678-1234-1234-1234-123456789012',
  pageDoi:doi,articleUrl,sourceUrl:ga,caption:'Graphical Abstract',
  candidateSource:'wiley_ga_labeled_section_url',assetType:'graphical_abstract',
  source:'tampermonkey-toc-mainline',...overrides
});
let passed=0;
function verify(name,check){assert.ok(check,name);passed++;console.log('ANGEW_GA_INTEGRITY_PASS '+name);}

verify('genuine same-DOI Wiley -gra- official source passes',
  angewOfficialGaEvidenceError(make())==='');
verify('numbered Scheme and substrate scope cannot be official',
  angewOfficialGaEvidenceError(make({caption:'Scheme 3. Substrate scope'}))==='angew_body_figure_not_official_toc');
verify('single-image heading fallback is never sufficient',
  angewOfficialGaEvidenceError(make({candidateSource:'wiley_ga_labeled_section_single_image'}))==='angew_unverified_single_image_toc');
verify('foreign article GA filename cannot be reused for current DOI',
  angewOfficialGaEvidenceError(make({sourceUrl:alternate}))==='angew_cross_article_ga_asset');
verify('unlabelled ordinary Wiley body image is not official',
  angewOfficialGaEvidenceError(make({sourceUrl:neutral}))==='angew_ga_role_not_proven');
verify('untrusted image host never accepted',
  angewOfficialGaEvidenceError(make({sourceUrl:'https://evil.example/anie4335022-gra-0001-m.jpg'}))==='angew_ga_source_not_wiley');
verify('article must contain the exact DOI',
  angewOfficialGaEvidenceError(make({articleUrl:'https://onlinelibrary.wiley.com/doi/10.1002/anie.5624001'}))==='angew_article_doi_evidence_missing');
verify('confirmed article-head publisher metadata remains eligible',
  angewOfficialGaEvidenceError(make({sourceUrl:neutral,candidateSource:'article_head_metadata',assetType:'graphical_abstract'}))==='');
verify('other publishers and legitimate Figure 1 fallback unchanged',
  angewOfficialGaEvidenceError(make({doi:'10.1021/jacs.6c06476'}))==='' &&
  angewOfficialGaEvidenceError(make({kind:'figure1',caption:'Figure 1. Reaction'}))==='');

// A changed candidate may be kept as an immutable local forensic receipt, but
// must never replace an already available, different-hash production TOC.
const mediaWrites=[];
const env={
  MEDIA:{
    get:async()=>null,
    put:async(key,data)=>{mediaWrites.push(key);}
  },
  DB:{
    prepare:sql=>({
      bind:()=>({
        first:async()=>({available:1,r2_key:'toc-cache/existing.jpg',content_hash:'abcd'.repeat(8)})
      })
    })
  }
};
const gif=Buffer.concat([Buffer.from('GIF89a'),Buffer.alloc(120)]);
const old=await importLocalCapture({url:'https://api.gczhouwld.com/api/media/local-capture/import'},env,
  make({imageData:'data:image/gif;base64,'+gif.toString('base64')}));
verify('different SHA-256 does not overwrite an existing official TOC',
  old.status===409&&old.body.code==='official_toc_conflict_review_required'&&
  old.body.productionTocStored===false&&old.body.localStored===true);
verify('conflict leaves forensic local image but never imports production TOC',
  mediaWrites.some(key=>key.includes('/images/'))&&!mediaWrites.some(key=>key.startsWith('toc-cache/')));

const writesBefore=mediaWrites.length;
const bad=await importLocalCapture({url:'https://api.gczhouwld.com/api/media/local-capture/import'},env,
  make({caption:'Scheme 4. Substrate scope',imageData:'data:image/gif;base64,'+gif.toString('base64')}));
verify('rejected scope image cannot even enter local official staging',
  bad.status===409&&bad.body.code==='angew_body_figure_not_official_toc'&&mediaWrites.length===writesBefore);

const source=await fs.readFile('public/toc-mainline.user.js','utf8');
const exposed=source.replace('  installMenu();',
  '  globalThis.__tmAngewGa={wileyGraphicalAbstractCandidates,collectCandidates,wileyBodyOnlyVisual,wileyGaAssetMatchesDoi}; return;\n  installMenu();');
assert.notEqual(exposed,source,'mainline exposure marker must exist');
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage();
  await page.route('**/*',route=>route.fulfill({
    status:200,contentType:'text/html',
    body:'<html><head><meta name="citation_doi" content="'+doi+'"></head><body><main><article id="paper"></article></main></body></html>'
  }));
  await page.goto(articleUrl);
  await page.evaluate(()=>{
    window.GM_getValue=(_k,d)=>d;window.GM_setValue=()=>{};window.GM_deleteValue=()=>{};
    window.GM_listValues=()=>[];window.GM_registerMenuCommand=()=>{};
    window.GM_openInTab=()=>{};window.GM_xmlhttpRequest=()=>{};
  });
  await page.addScriptTag({content:exposed});
  async function inspect(html,headMeta=''){
    return page.evaluate(({doi,html,headMeta})=>{
      document.querySelector('article').innerHTML=html;
      document.head.querySelectorAll('meta[name="citation_graphical_abstract"]').forEach(el=>el.remove());
      if(headMeta){
        const meta=document.createElement('meta');meta.name='citation_graphical_abstract';meta.content=headMeta;document.head.appendChild(meta);
      }
      const j={doi,publisher:'wiley',allowFigureOne:true};
      const rows=__tmAngewGa.collectCandidates(j,[],document,location.href,'fixture',true);
      return rows.map(x=>({kind:x.kind,url:x.url,source:x.source}));
    },{doi,html,headMeta});
  }
  const lone=await inspect('<section><h3>Graphical Abstract</h3><img alt="Substrate scope" src="'+neutral+'"></section>');
  verify('lone image near GA heading cannot masquerade as official TOC',!lone.some(x=>x.kind==='official'));
  const authentic=await inspect('<section><h3>Graphical Abstract</h3><img alt="Graphical Abstract" src="'+ga+'"></section>');
  verify('real Wiley -gra- GA survives strict source filter',
    authentic.some(x=>x.kind==='official'&&x.url===ga));
  const foreign=await inspect('<section><h3>Graphical Abstract</h3><img src="'+alternate+'"></section>');
  verify('cross-paper -gra- image is not selected by shared page DOM',foreign.length===0);
  const scope=await inspect('<section><h3>Graphical Abstract</h3><figure><figcaption>Scheme 3. Substrate scope</figcaption><img src="'+ga+'"></figure></section>');
  verify('numbered substrate scope is refused even with GA-looking filename',
    !scope.some(x=>x.kind==='official'));
  const related=await inspect('<article><aside class="related"><img alt="Graphical Abstract" src="'+ga+'"></aside></article>');
  verify('related article cards remain excluded from candidate selection',related.length===0);
  const metaScope=await inspect('<figure><figcaption>Figure 2. Reaction scope</figcaption><img src="'+neutral+'"></figure>',neutral);
  verify('article-head metadata cannot upgrade identical numbered body image',
    !metaScope.some(x=>x.kind==='official'));
  const properMeta=await inspect('<p>Abstract text</p>',neutral);
  verify('explicit publisher citation graphical abstract metadata is retained',
    properMeta.some(x=>x.kind==='official'&&x.source==='article_head_metadata'));
  const fig1=await inspect('<figure><figcaption>Figure 1. Reaction overview</figcaption><img src="https://onlinelibrary.wiley.com/cms/asset/a/anie4335022-fig1.jpg"></figure>');
  verify('genuine numbered Figure 1 remains a distinct fallback, never official',
    fig1.some(x=>x.kind==='figure1')&&!fig1.some(x=>x.kind==='official'));
} finally {await browser.close();}
console.log('ANGEW_GA_INTEGRITY_SUMMARY '+JSON.stringify({
  passed,chromium:true,productionWrites:0,
  forbiddenNumberedFigurePromotion:true,legacyFigure1Kept:true,
  immutableExistingOfficialToc:true
}));
