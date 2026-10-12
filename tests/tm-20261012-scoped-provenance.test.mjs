import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {getLocalCaptureIndex,getStagedArticleFigures} from '../cloudflare/worker/src/local-captures.js';

const a='10.1039/d6sc06407h',b='10.1039/d6gc03161g',epoch=1790082000000;
const asset=doi=>'https://rscj.silverchair-cdn.com/rscj/content_public/journal/sc/pap/'
  +doi.replace('/','_')+'/1/official-graphic.png';
const entry=doi=>({doi,pageDoi:doi,captureVersion:'6.2.20',mediaGeneration:epoch,
  kind:'official',r2Key:'local-captures/images/'+doi.replace('/','_')+'.png',
  articleUrl:'https://pubs.rsc.org/en/content/articlelanding/2026/sc/'+doi.split('/')[1],
  sourceUrl:asset(doi),contentHash:'a'.repeat(32),updatedAt:epoch+1000,
  contentType:'image/png',width:950,height:450,label:'Figure 1'});
const docs={
  'local-captures/index.json':{version:1,updatedAt:epoch+2000,items:{first:entry(a),second:entry(b)}},
  'local-captures/article-figures/stage-index.json':{version:1,items:{first:entry(a),second:entry(b)}},
  'local-captures/tampermonkey/report-index.json':{version:2,items:{}}
};
const env={MEDIA:{get:async key=>docs[key]?{text:async()=>JSON.stringify(docs[key])}:null}};
const req=url=>new Request('https://api.gczhouwld.com'+url);

test('DOI-scoped official TOC inventory returns exact verified subset, legacy remains unchanged',async()=>{
 const scoped=await getLocalCaptureIndex(req('/api/media/local-capture-index?dois='+encodeURIComponent(a)),env);
 assert.equal(scoped.status,200);
 assert.equal(scoped.body.scopeRevision,'doi-scoped-inventory-v1');
 assert.equal(scoped.body.complete,true);
 assert.deepEqual(scoped.body.requestedDois,[a]);
 assert.equal(scoped.body.scopeRequestedCount,1);
 assert.deepEqual(scoped.body.items.map(x=>x.doi),[a]);
 const legacy=await getLocalCaptureIndex(req('/api/media/local-capture-index'),env);
 assert.equal(legacy.status,200);
 assert.equal(legacy.body.items.length,2);
 assert.equal('scopeRevision' in legacy.body,false);
});
test('scoped staged-figure inventory never includes a different DOI, returns complete empty scope',async()=>{
 const one=await getStagedArticleFigures(req('/api/article-figures/staged?inventory=1&dois='+encodeURIComponent(a)),env);
 assert.equal(one.status,200);
 assert.equal(one.body.complete,true);
 assert.deepEqual(one.body.requestedDois,[a]);
 assert.equal(one.body.count,1);
 assert.deepEqual(one.body.items.map(x=>x.doi),[a]);
 const absent='10.1039/d6sc99999a';
 const none=await getStagedArticleFigures(req('/api/article-figures/staged?inventory=1&dois='+encodeURIComponent(absent)),env);
 assert.equal(none.status,200);
 assert.equal(none.body.complete,true);
 assert.equal(none.body.scopeRequestedCount,1);
 assert.equal(none.body.count,0);
});
test('reject invalid or unbounded scopes before data reads and without any writes',async()=>{
 for(const suffix of ['',a+','+a,'not-a-doi',Array.from({length:81},(_,i)=>'10.1039/d6sc'+String(i).padStart(5,'0')+'a').join(',')]){
   const u='/api/media/local-capture-index?dois='+encodeURIComponent(suffix);
   assert.equal((await getLocalCaptureIndex(req(u),env)).status,400,suffix.slice(0,30));
   const v='/api/article-figures/staged?inventory=1&dois='+encodeURIComponent(suffix);
   assert.equal((await getStagedArticleFigures(req(v),env)).status,400,suffix.slice(0,30));
 }
});
const src=readFileSync('public/toc-mainline.user.js','utf8');
function functionSource(name){
 const pattern=new RegExp('^  (?:async )?function '+name+'\\(','m');
 const m=pattern.exec(src);assert.ok(m,'missing '+name);
 const rest=src.slice(m.index),end=rest.indexOf('\n  }\n');
 assert.ok(end>0,'missing close '+name);
 return rest.slice(0,end+5);
}
test('client requires validated scoped metadata and does not convert failures into empty inventories',()=>{
 assert.match(src,/scopeRevision!=='doi-scoped-inventory-v1'/);
 assert.match(src,/scopeRequestedCount!==part.length/);
 assert.match(src,/requestedDois\[i\]/);
 assert.match(src,/complete:complete,count:all.length,items:all/);
 assert.match(src,/var batches=\[\];for\(var i=0;i<dois.length;i\+=12\)/);
 assert.match(src,/tocsKnown:Boolean\(inv.tocs&&inv.tocs.complete!==false\)/);
 assert.ok(src.includes("INVENTORY_SCOPED_BATCH_SIZE = 80"));
 assert.ok(src.includes("pageLimit=120"));
 assert.ok(!src.includes("if(dois.length<=1200)"));
});
function runFunctions(names,extra={}){
 const ctx=vm.createContext({URL,Date,Boolean,Number,String,RegExp,Math,Array,Set,Map,Promise,
   location:{hostname:'pubs.rsc.org',pathname:'/sc/article/doi/10.1039/D6SC06407H/1365974/example',
     href:'https://pubs.rsc.org/sc/article/doi/10.1039/D6SC06407H/1365974/example'},
   normalizeDoi:s=>String(s||'').toLowerCase(),
   publisherForDoi:d=>d.startsWith('10.1039/')?'rsc':'nature',
   rscPdfPreviewUrl:s=>/\.pdf\.(gif|png|jpe?g|webp)/i.test(s),
   candidateBelongsToJob:(url,j)=>{
     const found=[...String(url).matchAll(/10\.1039[/_](d\d(?:sc|gc)[a-z0-9]+)/gi)];
     return found.every(z=>'10.1039/'+z[1].toLowerCase()===j.doi);
   },
   reject:()=>false,
   normalizeUrl:(s,base)=>{try{return new URL(s,base).href;}catch{return ''}},
   ...extra
 });
 vm.runInContext(names.map(functionSource).join('\n'),ctx);
 return ctx;
}
test('RSC genuine issue card may bind DOI-less publisher artwork, never foreign DOI/logo/preview',()=>{
 const good='https://rscj.silverchair-cdn.com/rscj/content_public/journal/sc/pap/a1234/ga.png';
 const ctx=runFunctions(['rscSemanticCardPublisherAsset','rscDoiFromTextOrHref',
   'rscIssueCardForDoiAnchor','rscIssueTocCandidatesFromDocument'],{
   contextFor:()=> 'Graphical Abstract',
   articleFigureImageUrls:()=>[good]
 });
 assert.equal(ctx.rscDoiFromTextOrHref('/en/content/articlelanding/2026/SC/D6SC06407H'),a);
 const item={tagName:'IMG',getAttribute:()=>'',parentElement:{getAttribute:()=>''}};
 const card={textContent:'Table of contents graphical abstract',
  parentElement:null,querySelectorAll(selector){
   if(selector==='a[href],[data-doi]')return [anchor];
   if(selector==='img,picture,source,object[type^="image"]'||selector==='img,source,object[type^="image"]')return [item];
   return [];
  }};
 const anchor={parentElement:card,textContent:'',
   getAttribute:key=>key==='href'?'/en/content/articlelanding/2026/SC/D6SC06407H':''};
 const doc={querySelectorAll:()=>[anchor]};
 const job={doi:a,publisher:'rsc'};
 const result=ctx.rscIssueTocCandidatesFromDocument(job,doc,'https://pubs.rsc.org/en/results');
 assert.equal(result.length,1);
 assert.equal(result[0].kind,'official');
 assert.equal(result[0].source,'rsc_issue_card_graphic');
 assert.equal(ctx.rscSemanticCardPublisherAsset(job,'https://rscj.silverchair-cdn.com/rscj/logo.png'),false);
 assert.equal(ctx.rscSemanticCardPublisherAsset(job,'https://rscj.silverchair-cdn.com/rscj/10.1039_d6gc03161g/ga.png'),false);
 assert.equal(ctx.rscSemanticCardPublisherAsset(job,'https://example.com/ga.png'),false);
 assert.equal(ctx.rscSemanticCardPublisherAsset(job,'https://pubs.rsc.org/example.pdf.png'),false);
 card.textContent='Figure 1';
 ctx.contextFor=()=> 'Figure 1';
 assert.equal(ctx.rscIssueTocCandidatesFromDocument(job,doc,'https://pubs.rsc.org/en/results').length,0);
});
test('Nature historical official issue search is bounded and cannot equate Figure1 with official TOC',async()=>{
 let fetches=0,store=new Map(),now=1800000000000;
 class Clock extends Date{static now(){return now}}
 const nature='10.1038/s41467-026-77482-4',suffix=nature.split('/')[1];
 const issue='https://www.nature.com/ncomms/volumes/17/issues/1';
 const source={
   querySelectorAll:()=>[{getAttribute:key=>key==='href'?issue:''}]
 };
 const loc={hostname:'www.nature.com',pathname:'/articles/'+suffix,href:'https://www.nature.com/articles/'+suffix};
 const ctx=runFunctions(['natureLinkedOfficialIssueUrls','natureAuthoritativeIssueCandidates',
   'natureSourceRecheckKey','natureOfficialRecheckDeferred','noteNatureOfficialNotObserved'],{
     location:loc,Date:Clock,document:source,
     tocOnlyCaptureEligible:j=>j.mediaPolicy==='toc_only',
     currentCaptureJob:()=>true,
     GM_getValue:(key,def)=>store.get(key)??def,
     GM_setValue:(key,val)=>store.set(key,val),
     P:'osg-toc-v6:',NATURE_OFFICIAL_SOURCE_REVISION:'20261012-bound-issue-source-v1',
     NATURE_OFFICIAL_RECHECK_MS:72*3600*1000,
     pushTrace:()=>{},captureLiveError:e=>String(e),
     AbortController,setTimeout,clearTimeout,
     fetch:async()=>{fetches++;return {status:403,ok:false}}
   });
 const job={doi:nature,publisher:'nature',mediaPolicy:'toc_only'};
 assert.deepEqual(Array.from(ctx.natureLinkedOfficialIssueUrls(job,source,loc.href)),[issue]);
 const unauthorized=await ctx.natureAuthoritativeIssueCandidates(job,[]);
 assert.equal(unauthorized.checked,false);
 assert.equal(fetches,1);
 ctx.noteNatureOfficialNotObserved(job,'checked_article_no_official');
 assert.equal(ctx.natureOfficialRecheckDeferred(job).notPermanentExclusion,true);
 now+=73*3600*1000;
 assert.equal(ctx.natureOfficialRecheckDeferred(job),null);
 assert.match(src,/nature_official_source_not_observed/);
 assert.match(src,/!tocOnlyCaptureEligible\(raw\)/);
});
console.log('TM_20261012_SCOPED_PROVENANCE_READONLY '+JSON.stringify({publisherRequests:0,productionWrites:0,sourceTests:true}));
