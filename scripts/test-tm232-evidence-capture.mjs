import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const source = await fs.readFile('public/toc-mainline.user.js','utf8');
const names = [
  'evidenceCaptureEligible',
  'evidenceSectionType',
  'evidenceArticleRoot',
  'collectArticleEvidenceSections',
  'collectArticleEvidenceCaptions',
  'collectArticleEvidenceTables',
  'buildArticleEvidencePacket',
  'tryCaptureArticleEvidence',
  'evidenceBackfillJobs',
  'pairedJobs',
  'captureQueueTier',
];
const exposed = source.replace(
  '  installMenu();',
  '  globalThis.__tm232={' + names.join(',') + '}; return;\n  installMenu();',
);

const doi='10.1021/jacs.6c08636';
const jobId='12345678-1234-1234-1234-123456789012';
const browser=await chromium.launch({headless:true});
let passed=0;
function test(name,condition){assert.ok(condition,name);passed++;console.log('TM232_EVIDENCE_PASS '+name);}
function repeat(text,count){return Array.from({length:count},()=>text).join(' ');}

try{
  const page=await browser.newPage();
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='pubs.acs.org')return route.fulfill({
      status:200,contentType:'text/html',
      body:'<html><head><meta name="citation_doi" content="'+doi+'"><link rel="canonical" href="https://pubs.acs.org/doi/'+doi+'"></head><body><article id="article"></article></body></html>',
    });
    return route.abort();
  });
  await page.goto('https://pubs.acs.org/doi/'+doi+'#osg-job='+jobId);
  await page.evaluate(({doi,jobId})=>{
    const active={doi,jobId,captureVersion:'6.2.20',publisher:'acs',mediaNeed:'figures',captureToc:false,title:'Evidence fixture title',journal:'JACS',queueGeneratedAt:'2026-09-25T00:00:00Z',startedAt:new Date().toISOString()};
    const storage={'osg-toc-v6:active-job':active,'osg-toc-v6:write-token':'fixture-write-token'};
    window.__gm=storage;window.__evidencePosts=[];window.__evidenceTransport='success';
    window.GM_getValue=(k,d)=>k in storage?storage[k]:d;
    window.GM_setValue=(k,v)=>{storage[k]=v;};
    window.GM_deleteValue=k=>{delete storage[k];};
    window.GM_listValues=()=>Object.keys(storage);
    window.GM_registerMenuCommand=()=>{};
    window.GM_openInTab=()=>{};
    window.GM_xmlhttpRequest=options=>{
      if(!String(options.url).includes('/api/article-summary/fulltext/import'))throw new Error('unexpected GM request '+options.url);
      const payload=JSON.parse(String(options.data||'{}'));window.__evidencePosts.push(payload);
      if(window.__evidenceTransport==='fail'){queueMicrotask(()=>options.onerror({error:'fixture_network_failure'}));return;}
      const chars=(payload.sections||[]).reduce((n,r)=>n+String(r.text||'').length,0)+(payload.captions||[]).reduce((n,r)=>n+String(r.text||'').length,0)+(payload.tables||[]).reduce((n,r)=>n+String(r.text||'').length,0);
      queueMicrotask(()=>options.onload({status:200,responseText:JSON.stringify({
        stored:true,state:'evidence_ready',doi,schemaVersion:'article-evidence-v2',
        evidenceLevel:payload.fulltextStatus,chars,sections:(payload.sections||[]).length,
        sourceHash:'a'.repeat(64),evidencePacketHash:'b'.repeat(64),
      }),responseHeaders:'content-type: application/json\r\n'}));
    };
    sessionStorage.setItem('osg-toc-v6:tab-job-binding',jobId);
  },{doi,jobId});
  await page.addScriptTag({content:exposed});

  const fixture={
    abstract:repeat('The abstract describes a catalytic bond-forming reaction with high chemoselectivity and synthetic utility.',10),
    intro:repeat('The introduction defines the synthetic problem and prior limitations.',15),
    results:repeat('Results describe catalyst loading, reagent equivalents, solvent, temperature, reaction time, yields, selectivity, and substrate scope.',25),
    mechanism:repeat('Mechanistic studies report control experiments while the authors separately propose a catalytic cycle.',15),
    conclusion:repeat('The conclusion summarizes scope, limitations, and synthetic significance.',12),
  };
  await page.evaluate(f=>{
    document.querySelector('#article').innerHTML=`
      <h1>Evidence fixture title</h1>
      <div class="article__abstract"><h2>Abstract</h2><p>${f.abstract}</p></div>
      <section><h2>Introduction</h2><p>${f.intro}</p></section>
      <section><h2>Results and Discussion</h2><p>${f.results}</p>
        <figure><figcaption>Scheme 1. Representative catalytic transformation under optimized conditions.</figcaption></figure>
        <table><caption>Table 1. Optimization</caption><tbody><tr><td>Catalyst 2 mol%</td><td>82% yield</td></tr><tr><td>-20 °C</td><td>95% ee</td></tr></tbody></table>
      </section>
      <section><h2>Mechanistic Studies</h2><p>${f.mechanism}</p></section>
      <section><h2>Conclusion</h2><p>${f.conclusion}</p></section>
      <section class="references"><h2>References</h2><p>FOREIGN_REFERENCE_TEXT_SHOULD_NEVER_ENTER_EVIDENCE</p></section>
      <aside class="recommended"><p>RECOMMENDED_ARTICLE_TEXT_SHOULD_NEVER_ENTER_EVIDENCE</p></aside>`;
  },fixture);

  const extracted=await page.evaluate(()=>{
    const job=window.__gm['osg-toc-v6:active-job'];
    const packet=__tm232.buildArticleEvidencePacket(job,[]);
    return {packet,eligible:{
      toc:__tm232.evidenceCaptureEligible({mediaNeed:'toc'}),
      figures:__tm232.evidenceCaptureEligible({mediaNeed:'figures'}),
      paired:__tm232.evidenceCaptureEligible({mediaNeed:'toc+figures'}),
      evidence:__tm232.evidenceCaptureEligible({mediaNeed:'evidence'}),
    }};
  });
  test('legacy raw TOC trigger alone does not force evidence',!extracted.eligible.toc&&extracted.eligible.figures&&extracted.eligible.paired&&extracted.eligible.evidence);
  const explicitCombinedEligible=await page.evaluate(()=>__tm232.evidenceCaptureEligible({mediaNeed:'toc',captureEvidence:true}));
  test('explicit missing-evidence flag makes a TOC-triggered visit capture text',explicitCombinedEligible);
  test('structured full article is classified complete',extracted.packet.fulltextStatus==='complete'&&extracted.packet.schemaVersion==='article-evidence-v2');
  test('packet binds DOI and Bridge 2.2.33',extracted.packet.doi===doi&&extracted.packet.pageDoi===doi&&extracted.packet.controllerRevision==='2.2.33');
  const types=extracted.packet.sections.map(r=>r.type);
  test('semantic sections are retained',['abstract','results','mechanism','conclusion'].every(t=>types.includes(t)));
  const all=JSON.stringify({sections:extracted.packet.sections,captions:extracted.packet.captions,tables:extracted.packet.tables});
  test('references and recommendations are excluded',!all.includes('FOREIGN_REFERENCE_TEXT')&&!all.includes('RECOMMENDED_ARTICLE_TEXT'));
  test('scheme caption and optimization table are retained',extracted.packet.captions.some(r=>/Scheme 1/.test(r.text))&&extracted.packet.tables.some(r=>/82% yield/.test(r.text)&&/95% ee/.test(r.text)));

  const stored=await page.evaluate(async()=>{
    const job=window.__gm['osg-toc-v6:active-job'];
    const result=await __tm232.tryCaptureArticleEvidence(job,[],'fixture-write-token',0);
    return {result,posts:window.__evidencePosts.slice()};
  });
  test('complete evidence stores once',stored.result.status==='stored'&&stored.result.evidenceLevel==='complete'&&stored.posts.length===1);
  test('private upload carries provenance and no fixture metrics',!('_metrics' in stored.posts[0])&&stored.posts[0].jobId===jobId&&stored.posts[0].captureVersion==='6.2.20');

  const abstractOnly=await page.evaluate(async()=>{
    const article=document.querySelector('#article');
    article.innerHTML='<h1>Abstract-only fixture</h1><div class="article__abstract"><h2>Abstract</h2><p>Short abstract reporting a catalytic C–C bond formation under mild conditions with useful selectivity.</p></div>';
    const job=window.__gm['osg-toc-v6:active-job'];
    const packet=__tm232.buildArticleEvidencePacket(job,[]);
    const result=await __tm232.tryCaptureArticleEvidence(job,[],'fixture-write-token',0);
    return {packet,result,post:window.__evidencePosts.at(-1)};
  });
  test('abstract-only page is preserved instead of rejected',abstractOnly.packet.fulltextStatus==='abstract_only'&&abstractOnly.result.status==='stored'&&abstractOnly.result.evidenceLevel==='abstract_only');
  test('abstract-only upload contains the Abstract text',abstractOnly.post.sections.length===1&&/Short abstract/.test(abstractOnly.post.sections[0].text));

  const noLimit=await page.evaluate(()=>{
    const longText='Detailed chemistry evidence sentence with reaction conditions and scope. '.repeat(15000);
    document.querySelector('#article').innerHTML='<h1>Long fixture</h1><section><h2>Results and Discussion</h2><p>'+longText+'</p></section><section><h2>Conclusion</h2><p>Conclusion text.</p></section>';
    const job=window.__gm['osg-toc-v6:active-job'];
    const packet=__tm232.buildArticleEvidencePacket(job,[]);
    const normalized=longText.replace(/\r\n?/g,'\n').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
    return {expected:normalized.length,actual:packet.sections.find(r=>r.type==='results')?.text.length||0};
  });
  test('long article text is not cut by an application total-text budget',noLimit.actual===noLimit.expected);

  const tocOnly=await page.evaluate(async()=>{
    const before=window.__evidencePosts.length;
    const active=window.__gm['osg-toc-v6:active-job'];
    const result=await __tm232.tryCaptureArticleEvidence({...active,mediaNeed:'toc'},[],'fixture-write-token',0);
    return {result,before,after:window.__evidencePosts.length};
  });
  test('a visit with captureEvidence=false performs zero evidence writes',tocOnly.result.status==='not_requested'&&tocOnly.before===tocOnly.after);
  const combinedTocEvidence=await page.evaluate(async()=>{
    const before=window.__evidencePosts.length;
    window.__evidenceTransport='success';
    const active=window.__gm['osg-toc-v6:active-job'];
    const result=await __tm232.tryCaptureArticleEvidence({...active,mediaNeed:'toc',captureEvidence:true},[],'fixture-write-token',0);
    return {result,before,after:window.__evidencePosts.length};
  });
  test('TOC-triggered visit with missing evidence stores evidence before closing',combinedTocEvidence.result.status==='stored'&&combinedTocEvidence.after===combinedTocEvidence.before+1);

  const backfill=await page.evaluate(()=>{
    const q={latestAddedDate:'2026-09-25',articles:[
      {doi:'10.1021/jacs.6c10001',journal:'JACS',addedDate:'2026-09-24'},
      {doi:'10.1021/jacs.6c10002',journal:'JACS',addedDate:'2026-09-24'},
      {doi:'10.1021/jacs.6c10003',journal:'JACS',addedDate:'2026-09-25'},
      {doi:'10.1021/jacs.6c10004',journal:'JACS',addedDate:'2026-09-24'},
    ]};
    const media={items:{
      '10.1021/jacs.6c10001':{toc:{available:true,imageUrl:'official.svg',reason:'official'}},
      '10.1021/jacs.6c10002':{toc:{available:true,imageUrl:'official.svg',reason:'official'}},
      '10.1021/jacs.6c10003':{toc:{available:true,imageUrl:'official.svg',reason:'official'}},
      '10.1021/jacs.6c10004':{toc:{available:true,imageUrl:'official.svg',reason:'official'}},
    }};
    const inv={items:[
      {doi:'10.1021/jacs.6c10001',available:true,evidenceLevel:'abstract_only'},
      {doi:'10.1021/jacs.6c10004',available:true,evidenceLevel:'complete'},
    ]};
    const rows=__tm232.evidenceBackfillJobs(q,media,inv);
    return {rows:rows.map(r=>({doi:r.doi,state:r.state,level:r.existingEvidenceLevel})),tier:__tm232.captureQueueTier(rows[0],'2026-09-25')};
  });
  test('any stored evidence level leaves the normal backlog without repeated reopening',
    !backfill.rows.some(r=>r.doi==='10.1021/jacs.6c10001') &&
    !backfill.rows.some(r=>r.doi==='10.1021/jacs.6c10004'));
  test('missing evidence stays in the lowest-priority backfill queue',
    backfill.rows.some(r=>r.doi==='10.1021/jacs.6c10002'&&r.state==='evidence_gap'));
  test('evidence-only backlog is lower priority than historical body figures',backfill.tier===3);

  const combinedPlan=await page.evaluate(()=>{
    const q={latestAddedDate:'2026-09-25',webpageDoiCount:2,mediaGeneration:1790082000000,articles:[
      {doi:'10.1002/anie.5617321',journal:'Angew',addedDate:'2026-09-24'},
      {doi:'10.1021/jacs.6c10009',journal:'JACS',addedDate:'2026-09-25'},
    ]};
    const media={items:{
      '10.1002/anie.5617321':{toc:{available:false},figures:{available:false,figures:[]}},
      '10.1021/jacs.6c10009':{toc:{available:true,imageUrl:'official.svg',reason:'official'},figures:{available:false,figures:[]}},
    }};
    const jobs=__tm232.pairedJobs(q,media);
    const wiley=jobs.find(r=>r.doi==='10.1002/anie.5617321');
    const inv={items:[]};
    const evidence=__tm232.evidenceBackfillJobs(q,media,inv);
    return {
      wiley:{mediaNeed:wiley.mediaNeed,captureToc:wiley.captureToc,captureFigures:wiley.captureFigures,captureEvidence:wiley.captureEvidence},
      evidenceDois:evidence.map(r=>r.doi)
    };
  });
  test('historical missing-TOC media trigger also requests body discovery in the same visit',
    combinedPlan.wiley.mediaNeed==='toc'&&combinedPlan.wiley.captureToc===true&&combinedPlan.wiley.captureFigures===true);
  test('missing evidence remains eligible even before an official TOC exists',
    combinedPlan.evidenceDois.includes('10.1002/anie.5617321'));
  test('scheduler code merges evidence need into an existing media DOI instead of opening twice',
    source.includes('var merged=new Map();')&&source.includes('merged.get(doi).captureEvidence=true'));

  const isolatedFailure=await page.evaluate(async()=>{
    window.__evidenceTransport='fail';
    const active=window.__gm['osg-toc-v6:active-job'];
    return __tm232.tryCaptureArticleEvidence({...active,mediaNeed:'evidence'},[],'fixture-write-token',0);
  });
  test('evidence transport failure is contained',isolatedFailure.status==='failed'&&/fixture_network_failure/.test(isolatedFailure.reason));

  test('controller revision changes without capture protocol migration',source.includes("var VERSION = '6.2.20';")&&source.includes("var CONTROLLER_REVISION = '2.2.33';"));
  test('2.2.33 requires Evidence v2 Worker capability',source.includes("caps.evidenceSchemaVersion!==EVIDENCE_SCHEMA_VERSION")&&source.includes("evidenceCaptureMinControllerRevision"));

  console.log('TM233_EVIDENCE_TEST_SUMMARY '+JSON.stringify({passed,browser:'Chromium',productionWrites:0,publisherNetwork:false,captureProtocol:'6.2.20',controllerRevision:'2.2.33',totalTextBudget:null,abstractOnly:true}));
}finally{await browser.close();}
