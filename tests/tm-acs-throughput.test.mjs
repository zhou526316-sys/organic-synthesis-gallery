import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
const worker=fs.readFileSync('cloudflare/worker/src/local-captures.js','utf8');
assert.match(source,/\/\/ @version\s+6\.2\.60/);
assert.ok(source.includes("ACS_MEDIA_RECOVERY_REVISION = '20261008-acs-viewer-upload-v1'"));
assert.ok(source.includes("IMAGE_UPLOAD_TOTAL_BUDGET_MS = 24000"));
assert.ok(source.includes("if (candidate.kind === 'figure1' && result.productionFallbackStored !== true)"));
assert.ok(worker.includes("} else if (kind === 'figure1' && image.contentType !== 'image/svg+xml')"));
assert.ok(worker.includes("productionFallbackStored: kind === 'figure1' ? Boolean(productionFallback) : false"));

function snippet(start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a+1);
 assert.ok(a>0&&b>a,'missing helper '+start);return source.slice(a,b);
}

const viewerCtx=vm.createContext({
 URL,location:{href:'https://pubs.acs.org/doi/10.1021/acs.joc.6c01847'},
 normalizeUrl(v,base){try{const x=new URL(v,base);return /^https?:$/.test(x.protocol)?x.href:'';}catch{return '';}}
});
vm.runInContext(snippet('  function acsViewerStem(', '  async function acsViewerHtml('),viewerCtx);
const assetUrls=vm.runInContext('acsViewerAssetUrls',viewerCtx);

test('ACS viewer assets are extracted from actual same-figure HTML only',()=>{
 const viewer='https://pubs.acs.org/view-large/figure/258582638/jo6c01847_0002.tif';
 const html=`<img src="https://acs.silverchair-cdn.com/acs/content_public/journal/joceah/pap/10.1021_acs.joc.6c01847/1/m_jo6c01847_0002.png">
 <a href="https://acs.silverchair-cdn.com/acs/content_public/journal/joceah/pap/10.1021_acs.joc.6c01847/1/jo6c01847_0002.svg">high</a>
 <img src="https://acs.silverchair-cdn.com/acs/content_public/journal/joceah/pap/10.1021_acs.joc.6c01847/1/jo6c01847_0003.svg">
 <a href="https://example.org/jo6c01847_0002.svg">outside</a>`;
 const values=assetUrls(viewer,html);
 assert.equal(values.length,2);
 assert.ok(values[0].endsWith('/jo6c01847_0002.svg'));
 assert.ok(values[1].endsWith('/m_jo6c01847_0002.png'));
});

test('ACS viewer does not invent filenames from an empty or unrelated page',()=>{
 const viewer='https://pubs.acs.org/view-large/figure/258582638/jo6c01847_0002.tif';
 assert.equal(assetUrls(viewer,'<html><body>Access denied</body></html>').length,0);
 assert.equal(assetUrls(viewer,'<img src="https://acs.silverchair-cdn.com/jo6c01847_0001.svg">').length,0);
});

const budgetCtx=vm.createContext({
 Date,Math,Number,String,JSON,Promise,Error,
 IMAGE_UPLOAD_TOTAL_BUDGET_MS:24000,IMAGE_UPLOAD_MAX_BUDGET_MS:48000,
 headerValue:()=>'',autoReportText:e=>String(e||''),
 shouldNativeRetryUpload:()=>false,
 uploadResponseError(status){const err=new Error('upload_http_'+status);err.httpStatus=status;return err;},
 gmRequest:async()=>({status:200,responseText:'{"stored":true}'}),
 fetchPostJson:async()=>({stored:true})
});
vm.runInContext(snippet('  async function postJsonBudgeted(', '  function shouldNativeRetryUpload('),budgetCtx);
const budgeted=vm.runInContext('postJsonBudgeted',budgetCtx);
const call=()=>budgeted('https://api.gczhouwld.com/api/article-figures/stage',{label:'Figure 1'},'fixture',24000);

test('quick GM upload returns its receipt without duplicate network writes',async()=>{
 let gmCalls=0,fetchCalls=0;
 budgetCtx.gmRequest=async()=>{gmCalls++;return {status:200,responseText:'{"stored":true,"staged":true}' }};
 budgetCtx.fetchPostJson=async()=>{fetchCalls++;return {stored:true};};
 const result=await call();assert.equal(result.staged,true);assert.equal(gmCalls,1);assert.equal(fetchCalls,0);
});

test('explicit 403 is terminal and cannot route around GM access control',async()=>{
 let fetchCalls=0;
 budgetCtx.gmRequest=async()=>({status:403,responseText:'{"error":"access_denied"}'});
 budgetCtx.fetchPostJson=async()=>{fetchCalls++;return {stored:true};};
 await assert.rejects(call,/upload_http_403/);assert.equal(fetchCalls,0);
});

test('immediate extension transport error may use one bounded browser fallback',async()=>{
 let fetchCalls=0;
 budgetCtx.gmRequest=async()=>{throw new Error('gm_request_error:Failed to fetch');};
 budgetCtx.fetchPostJson=async(url,payload,token,timeoutMs)=>{fetchCalls++;assert.ok(timeoutMs>1000&&timeoutMs<=24000);return {stored:true};};
 assert.equal((await call()).stored,true);assert.equal(fetchCalls,1);
});

test('ambiguous GM timeout does not trigger a concurrent second upload',async()=>{
 let fetchCalls=0;
 budgetCtx.gmRequest=async()=>{throw new Error('gm_request_timeout');};
 budgetCtx.fetchPostJson=async()=>{fetchCalls++;return {stored:true};};
 await assert.rejects(call,/gm_request_timeout/);assert.equal(fetchCalls,0);
});

test('stored Figure 1 counts as complete only when production-backed',()=>{
 assert.ok(source.includes("var fallback=Boolean(media&&(media.primaryKind==='figure1'||media.figureOneStored))"));
 assert.ok(source.includes("existingTocKind:productionOfficial?'official':localOfficial?'official_local':fallback?'figure1':localFigureOne?'figure1_local':''"));
 assert.ok(source.includes("if(candidate.kind==='figure1')image=await rasterizeVerifiedFigureOne(image,trace)"));
 assert.ok(source.includes("if(!verdict||!verdict.usable)return Promise.reject(new Error('figure1_svg_unsafe_or_invalid'))"));
});

console.log('TM_ACS_THROUGHPUT_SUMMARY '+JSON.stringify({tests:7,publisherNetworkRequests:0,productionWrites:0}));
