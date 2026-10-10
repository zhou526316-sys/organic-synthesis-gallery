import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {completedBodyPacket} from '../shared/body-packet-completion.mjs';
import {getArticleEvidenceInventory} from '../cloudflare/worker/src/article-summary.js';

const src=fs.readFileSync('public/toc-mainline.user.js','utf8');
function extract(name){
  const m=src.match(new RegExp('^  (?:async )?function '+name+'\\(','m'));
  assert.ok(m,'source function missing '+name);
  const at=m.index,after=src.slice(at),end=after.indexOf('\n  }\n');
  assert.ok(end>0,'source function incomplete '+name);
  return after.slice(0,end+5);
}
const dois=[
  'd6sc06407h','d6sc03717h','d6sc05761f','d6sc06374h','d6sc05829a',
  'd6sc06573b','d6sc06421c','d6sc06246f',
  'd6gc04458a','d6gc05783g','d6gc04087j','d6gc04772f','d6gc03161g'
];
function context(doi=dois[0],articleId='1365974') {
  let href='https://pubs.rsc.org/'+doi.slice(2,4)+'/article/doi/10.1039/'
    +doi.toUpperCase()+'/'+articleId+'/verified-article';
  const ctx=vm.createContext({
    URL,Number,String,RegExp,Date,Math,
    location:{href},normalizeDoi:v=>String(v||'').toLowerCase(),
    publisherForDoi:v=>String(v||'').startsWith('10.1039/')?'rsc':'other',
    candidateBelongsToJob:(url,j)=>{
      const text=decodeURIComponent(String(url).toLowerCase());
      const match=[...text.matchAll(/10\.1039[/_](d[0-9](?:sc|gc)[a-z0-9]+)/gi)];
      return match.every(x=>x[1]===j.doi.split('/')[1]);
    },
    rscPdfPreviewUrl:u=>/\.pdf\.(?:gif|png|jpe?g|webp)(?:[?#]|$)/i.test(String(u)),
    reject:(text,u)=>/site-logo|favicon|avatar|banner|advert|site-asset/.test(String(text)+' '+String(u))
  });
  vm.runInContext([extract('rscRouteParts'),extract('rscNativeAjaxBoundRoute'),
      extract('rscVerifiedSilverchairMedia')].join('\n'),ctx);
  return ctx;
}
test('all 13 current RSC gaps may use only their DOI-verified articleId Ajax route',()=>{
 for(const d of dois) {
   const c=context(d),job={doi:'10.1039/'+d,publisher:'rsc',addedDate:'2026-10-10'};
   const result=c.rscNativeAjaxBoundRoute(job);
   assert.equal(result.articleId,'1365974',d);
   assert.ok(result.url.includes('/'+d.slice(2,4)+'/PlatformArticle/ArticleAbstractAjax?articleId=1365974'),d);
   assert.equal(c.rscNativeAjaxBoundRoute({...job,doi:'10.1039/d6gc99999a'}),null,d);
 }
});
test('RSC official image binding rejects PDF cover, foreign DOI, guessed CDN and other articleId',()=>{
 const c=context('d6sc06407h'),j={doi:'10.1039/d6sc06407h',publisher:'rsc'};
 assert.equal(c.rscVerifiedSilverchairMedia(j,
   'https://rscj.silverchair-cdn.com/rscj/content_public/journal/sc/1365974/visual-abstract.svg'),true);
 assert.equal(c.rscVerifiedSilverchairMedia(j,
   'https://rscj.silverchair-cdn.com/rscj/content_public/journal/sc/d6sc06407h-figure1.svg'),true);
 for(const url of [
   'https://pubs.rsc.org/sc/d6sc06407h.pdf.gif',
   'https://rscj.silverchair-cdn.com/rscj/content_public/journal/sc/1365999/figure-1.svg',
   'https://rscj.silverchair-cdn.com/rscj/content_public/journal/sc/unbound-image.svg',
   'https://cdn.example.org/1365974/figure-1.svg',
   'https://rscj.silverchair-cdn.com/journal/sc/10.1039/d6gc03161g/1365974/figure.svg'
 ])assert.equal(c.rscVerifiedSilverchairMedia(j,url),false,url);
});
test('RSC body source and object selectors preserve strict media provenance',()=>{
 assert.ok(src.includes("'img,source,object[type^=\"image\"],object[data]'"));
 assert.ok(src.includes("rscVerifiedSilverchairMedia(job,url)"));
 assert.ok(src.includes("rscPdfPreviewUrl(url)"));
 assert.ok(src.includes("var objectUrl=normalizeUrl(node.getAttribute('data')"));
 assert.ok(src.includes("official_unusable_try_figure1"));
 assert.ok(src.includes("figuresOne=discovered.toc.filter"));
});
test('20-page evidence inventory aborts rather than treating missing pages as complete',async()=>{
 const fn=extract('readEvidenceInventoryPaged');
 let calls=0;
 const ctx=vm.createContext({
   URL,encodeURIComponent,Array,Map,Number,String,Promise,Error,
   EVIDENCE_INVENTORY_ENDPOINT:'https://api.example.test/api/article-summary/evidence-inventory',
   EVIDENCE_SCHEMA_VERSION:'article-evidence-v2',INVENTORY_REQUEST_TIMEOUT_MS:16000,
   writeToken:()=> '测试授权占位符',normalizeDoi:x=>String(x||'').toLowerCase(),
   inventoryReadMetadataJson:async options=>{
     calls++;
     const url=new URL(options.url);
     assert.equal(url.searchParams.get('pageLimit'),'200');
     assert.equal(options.headers.authorization,'Bearer 测试授权占位符');
     return calls===1
      ?{schemaVersion:'article-evidence-v2',count:1,items:[{doi:'10.1039/d6sc06407h'}],
          complete:false,truncated:true,nextCursor:'opaque-page-two'}
      :{schemaVersion:'article-evidence-v2',count:1,items:[{doi:'10.1039/d6sc03717h'}],
          complete:true,truncated:false,nextCursor:''};
   }
 });
 vm.runInContext(fn,ctx);
 const result=await ctx.readEvidenceInventoryPaged();
 assert.equal(result.complete,true);
 assert.equal(result.items.length,2);
 assert.equal(calls,2);
 ctx.inventoryReadMetadataJson=async()=>({
   schemaVersion:'article-evidence-v2',count:1,items:[{doi:'10.1039/d6sc06407h'}],
   complete:false,truncated:true,nextCursor:''
 });
 await assert.rejects(ctx.readEvidenceInventoryPaged(),/cursor_invalid/);
 ctx.inventoryReadMetadataJson=async options=>{
   const cursor=new URL(options.url).searchParams.get('cursor');
   return {schemaVersion:'article-evidence-v2',count:1,items:[{doi:'10.1039/d6sc06407h'}],
     complete:cursor!==null,truncated:cursor===null,nextCursor:'second'};
 };
 await assert.rejects(ctx.readEvidenceInventoryPaged(),/duplicate_or_unbound_doi/);
});
test('server R2 inventory remains legacy compatible and supports authenticated bounded one-page reads',async()=>{
 let calls=[],rows=[
  {customMetadata:{doi:'10.1039/d6sc06407h',schemaVersion:'article-evidence-v2'}},
  {customMetadata:{doi:'10.1039/d6gc03161g',schemaVersion:'article-evidence-v2'}}
 ];
 const env={MEDIA:{list:async options=>{
   calls.push(options);
   if(options.limit===2&&!options.cursor)return {objects:rows.slice(0,1),truncated:true,cursor:'next'};
   if(options.limit===2&&options.cursor==='next')return {objects:rows.slice(1),truncated:false};
   return {objects:rows,truncated:false};
 }}};
 const first=await getArticleEvidenceInventory(env,{pageLimit:'2'});
 assert.equal(first.status,200);
 assert.equal(first.body.complete,false);
 assert.equal(first.body.truncated,true);
 assert.equal(first.body.nextCursor,'next');
 const second=await getArticleEvidenceInventory(env,{pageLimit:2,cursor:'next'});
 assert.equal(second.body.complete,true);
 assert.equal(second.body.items.length,1);
 const legacy=await getArticleEvidenceInventory(env);
 assert.equal(legacy.status,200);
 assert.equal(legacy.body.items.length,2);
 assert.equal(Object.hasOwn(legacy.body,'complete'),false);
 assert.equal((await getArticleEvidenceInventory(env,{pageLimit:2,cursor:'\n'})).status,400);
 assert.ok(calls.every(x=>x.include?.includes('customMetadata')));
});
test('completed companion packet can promote figures only when labels, source and primary receipt are exact',()=>{
 const job={
   doi:'10.1021/acs.orglett.6c03915',
   jobId:'12345678-1234-4bbb-8888-123456789012',captureVersion:'6.2.20',
   final:true,mediaNeed:'toc',status:'success',figuresDiscovered:2,figuresStored:2,
   figureLabels:['Figure 1','Figure 2'],tocStatus:'stored',fulltextStatus:'stored'
 };
 assert.equal(completedBodyPacket(job),true);
 assert.equal(completedBodyPacket({...job,figureLabels:['Figure 1']}),false);
 assert.equal(completedBodyPacket({...job,figureLabels:['Figure 1','Figure 1']}),false);
 assert.equal(completedBodyPacket({...job,figuresStored:1}),false);
 assert.equal(completedBodyPacket({...job,tocStatus:'not_found'}),false);
 assert.equal(completedBodyPacket({...job,mediaNeed:'evidence'}),false);
 assert.equal(completedBodyPacket({...job,final:false}),false);
 const pdf403={...job,mediaNeed:'toc',status:'partial',privatePdfStatus:'failed',
   reason:'combined_capture;toc=stored;figures=2/2;evidence=stored;published=0;pdf=private_pdf_http_403'};
 assert.equal(completedBodyPacket(pdf403),true);
 assert.equal(completedBodyPacket({...pdf403,reason:pdf403.reason.replace('403','200')}),false);
});
test('native-browser RSC listing is tried before GM, protects 403 and foreign redirects',async()=>{
 const j={doi:'10.1039/d6sc06421c',publisher:'rsc'};
 const listing='https://pubs.rsc.org/en/results?searchtext=10.1039%2Fd6sc06421c';
 let requests=[],gmCalls=0,parsed=0,traces=[];
 const html='<!doctype html><html><head></head><body><main>Verified RSC issue card</main></body></html>';
 const c=vm.createContext({
   URL,Number,String,Array,Promise,RegExp,Error,AbortController,setTimeout,clearTimeout,
   location:{href:'https://pubs.rsc.org/sc/article/doi/10.1039/D6SC06421C/1364831/test'},
   captureLiveError:x=>String(x),pushTrace:(_t,x)=>{traces.push(x);},
   normalizeDoi:x=>String(x||'').toLowerCase(),
   rscIssueTocCandidatesFromDocument:(_job,doc,url)=>{
     parsed+=1;assert.ok(url===listing);assert.equal(doc.marker,'verified');
     return [{url:'https://rscj.silverchair-cdn.com/rscj/content_public/journal/sc/pap/10.1039_d6sc06421c/1/m_d6sc06421c-ga.png',kind:'official'}];
   },
   DOMParser:class{parseFromString(content,format){assert.equal(format,'text/html');assert.equal(content,html);return {marker:'verified'};}},
   fetch:async(url,opt)=>{
     requests.push({url,opt});return {status:200,url,ok:true,
       headers:{get:()=>String(html.length)},text:async()=>html};
   },
   gmRequest:async()=>{gmCalls++;throw Error('unexpected GM request');}
 });
 vm.runInContext(extract('rscPublisherListingHtmlCandidates'),c);
 let rows=await c.rscPublisherListingHtmlCandidates(j,traces,listing);
 assert.equal(rows.length,1);assert.equal(gmCalls,0);assert.equal(parsed,1);
 assert.equal(requests.length,1);assert.equal(requests[0].opt.credentials,'same-origin');
 assert.equal(requests[0].opt.method,'GET');
 assert.ok(traces.some(x=>x.event==='native_browser_response'&&x.httpStatus===200));
 c.fetch=async(url)=>({status:403,url,ok:false,headers:{get:()=>null},text:async()=>{throw Error('must not read 403')}});
 rows=await c.rscPublisherListingHtmlCandidates(j,traces,listing);
 assert.equal(rows.length,0);assert.equal(gmCalls,0);
 assert.ok(traces.some(x=>x.event==='access_denied'&&/403/.test(x.message)));
 c.fetch=async(url)=>{throw new TypeError('ordinary first-party transport unavailable');};
 c.gmRequest=async options=>{gmCalls++;return {status:200,responseURL:listing,responseText:html};};
 rows=await c.rscPublisherListingHtmlCandidates(j,traces,listing);
 assert.equal(rows.length,1);assert.equal(gmCalls,1);
 c.fetch=async()=>({status:200,url:'https://accounts.example.invalid/login',ok:true,
   headers:{get:()=>String(html.length)},text:async()=>html});
 const beforeParsed=parsed;
 rows=await c.rscPublisherListingHtmlCandidates(j,traces,listing);
 assert.equal(rows.length,0);assert.equal(parsed,beforeParsed);
 const beforeRequests=requests.length;
 assert.equal(await c.rscPublisherListingHtmlCandidates(j,traces,'https://publisher.attacker.invalid/en/results?doi=10.1039/d6sc06421c'),null);
 assert.equal(requests.length,beforeRequests);
});
console.log('TM_OCT10_RSC_INVENTORY_REGRESSION',JSON.stringify({tests:6,productionWrites:0,publisherNetworkRequests:0}));
