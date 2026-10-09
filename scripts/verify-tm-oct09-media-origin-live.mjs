import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const SITE='https://gallery.gczhouwld.com';
const API='https://api.gczhouwld.com';
const missingTarget=[
  '10.1016/j.chempr.2026.103008',
  '10.1016/j.chempr.2026.103043',
  '10.1039/d6sc06407h',
  '10.1039/d6gc03748h'
];
const featuredAngew=['10.1002/anie.4335022','10.1002/anie.5624001'];
const allTargets=[...featuredAngew,...missingTarget];
const report={
  schemaVersion:'tm-oct09-media-origin-live-readonly-v1',
  checkedAt:new Date().toISOString(),
  readOnly:true,
  productionWrites:0,
  ownerPdfRequests:0,
  publisherVisits:0,
  mediaImports:0,
  targetDois:allTargets,
  errors:[],
  status:'unverified'
};
function cleanUrl(value) {
  try {
    const url=new URL(String(value||''));
    return /^https:$/.test(url.protocol) ? url.origin+url.pathname.slice(0,450) : '';
  } catch { return ''; }
}
function limited(value,n=160) {
  return String(value??'').replace(/[\r\n\t]+/g,' ').trim().slice(0,n);
}
async function get(url,cap=3_000_000) {
  const r=await fetch(url,{
    method:'GET',redirect:'follow',
    headers:{'cache-control':'no-cache','accept':'application/json,text/plain;q=0.8'},
    signal:AbortSignal.timeout(15000)
  });
  assert.equal(r.status,200,'read-only HTTP '+r.status+' '+new URL(url).pathname);
  const len=Number(r.headers.get('content-length')||0);
  assert.ok(!len||len<=cap,'response content-length exceeds cap');
  const raw=await r.text();
  assert.ok(raw.length<=cap,'response exceeds cap');
  return raw;
}
function itemList(value) {
  const items=value?.items;
  if (Array.isArray(items))return items;
  if(items&&typeof items==='object')return Object.values(items);
  return [];
}
function gaSignal(value) {
  const p=cleanUrl(value);
  return /-gra-\d+(?:[-_.]|$)|graphical[-_]abstract|visual[-_]abstract|(?:^|[\/_-])(?:ga|fx)0*1(?:[-_.]|$)/i.test(p);
}
function bodyOnlyCaption(value) {
  const s=limited(value,450);
  return /^(?:Fig(?:ure)?\.?|Scheme|Chart)\s*[1-9]\d*[a-z]?\b/i.test(s)
    || /\b(?:substrate|reaction|product)\s+(?:scope|screening|expansion)\b|\bscope\s+of\s+substrates\b/i.test(s);
}
function wileyAssetNumberEvidence(value,doi) {
  const expected=/^10\.1002\/anie\.([0-9]{5,8})/i.exec(String(doi||''))?.[1]||'';
  const candidate=cleanUrl(value);
  const observed=[...candidate.matchAll(/anie[._-]?([0-9]{5,8})(?=[^0-9]|$)/gi)].map(m=>m[1]);
  return {doiNumericSuffix:expected,sourceNumericSuffixes:observed,
    discrepant:!!expected&&observed.length>0&&observed.some(n=>n!==expected)};
}
function captureEvidence(row,doi) {
  const role=limited(row?.candidateSource,100);
  const url=cleanUrl(row?.sourceUrl);
  const caption=limited(row?.caption,120);
  let articleHost='';
  try {articleHost=new URL(String(row?.articleUrl||'')).hostname;}catch{}
  const numeric=wileyAssetNumberEvidence(url,doi);
  const flagged=bodyOnlyCaption(caption)||role==='wiley_ga_labeled_section_single_image';
  const uncertain=!gaSignal(url)&&role!=='article_head_metadata';
  return {
    source:limited(row?.source,50),
    role:role||'legacy_origin_unknown',
    assetType:limited(row?.assetType,50),
    caption,
    sourceUrl:url,
    articleHost,
    hash:limited(row?.contentHash,80),
    updatedAt:Number(row?.updatedAt||0),
    publisherAssetIdentity:numeric,
    category:flagged?'suspected_body_image':
      uncertain?'unverified_graphical_abstract_origin':'publisher_ga_signal',
  };
}
try {
  const installer=await get(SITE+'/gallery-vpn-bridge.user.js?media_origin_audit='+Date.now(),2_000_000);
  const bridge=installer.match(/^\/\/ @version\s+(\S+)/m)?.[1]||'';
  const engine=installer.match(/var INSTALL_REVISION = '([^']+)'/)?.[1]||'';
  const controller=installer.match(/var CONTROLLER_REVISION = '([^']+)'/)?.[1]||'';
  report.installer={bridge,engine,controller,bytes:installer.length};
  assert.equal(bridge,'2.2.76','unexpected production Bridge revision');
  assert.equal(engine,'6.2.57','unexpected production TOC engine revision');
  assert.equal(controller,'2.2.41','unexpected production controller revision');

  const queue=JSON.parse(await get(SITE+'/toc-demand-live.json?media_origin_audit='+Date.now(),3_000_000));
  assert.ok(Array.isArray(queue.articles),'canonical literature queue unavailable');
  const eligibleAngew=queue.articles.filter(p=>
    /^10\.1002\/anie\./i.test(String(p?.doi||'')) &&
    String(p?.addedDate||'')>='2026-10-01'
  ).map(p=>String(p.doi).toLowerCase());
  const angews=[...new Set([...featuredAngew,...eligibleAngew])].slice(0,45);
  report.queue={generatedAt:limited(queue.generatedAt,50),rows:queue.articles.length,
    eligibleAngewCount:eligibleAngew.length,queryAngewCount:angews.length};

  // The public R2 index is observation only: provenance from old captures
  // must not by itself be treated as proof an existing production image is wrong.
  const index=JSON.parse(await get(API+'/api/media/local-capture-index?readonly='+Date.now(),6_000_000));
  const rows=itemList(index);
  const byDoi=new Map();
  for(const r of rows) {
    const doi=String(r?.doi||'').toLowerCase();
    if(!angews.includes(doi) || String(r?.kind||'').toLowerCase()!=='official')continue;
    if(!byDoi.has(doi))byDoi.set(doi,[]);
    byDoi.get(doi).push(captureEvidence(r,doi));
  }
  report.captureIndex={updatedAt:Number(index.updatedAt||0),rows:rows.length,
    eligibleAngewOfficialCaptures:[...byDoi.values()].reduce((sum,a)=>sum+a.length,0)};
  const doGet=async doi=>{
    const toc=JSON.parse(await get(API+'/api/toc?doi='+encodeURIComponent(doi)+'&audit='+Date.now(),300_000));
    return {
      doi,
      available:toc.available===true,
      reason:limited(toc.reason,100),
      contentHash:limited(toc.contentHash,80),
      imageUrl:cleanUrl(toc.imageUrl),
      articleUrl:cleanUrl(toc.articleUrl),
    };
  };
  const unique=[...new Set([...allTargets,...angews])];
  const status=[];
  for(let i=0;i<unique.length;i+=5){
    const group=unique.slice(i,i+5);
    const outcomes=await Promise.all(group.map(doGet));
    status.push(...outcomes);
  }
  const statusByDoi=new Map(status.map(s=>[s.doi,s]));
  report.fourProvenance=missingTarget.map(doi=>({doi,
    sources:rows.filter(r=>String(r?.doi||'').toLowerCase()===doi).map(row=>({
      kind:limited(row?.kind,30),publisherSource:cleanUrl(row?.sourceUrl),
      articleUrl:cleanUrl(row?.articleUrl),caption:limited(row?.caption,180),
      candidateSource:limited(row?.candidateSource,100),assetType:limited(row?.assetType,70),
      contentHash:limited(row?.contentHash,80),updatedAt:Number(row?.updatedAt||0),
      liveHashMatch:limited(row?.contentHash,80)===statusByDoi.get(doi)?.contentHash
        &&statusByDoi.get(doi)?.available===true
    }))
  }));
  report.fourMissing=missingTarget.map(doi=>statusByDoi.get(doi));
  report.exactAngewQuarantine = statusByDoi.get('10.1002/anie.4335022');
  assert.notEqual(report.exactAngewQuarantine?.contentHash,
    '35f10c5321cd43179a4c71c73e388da8',
    'the confirmed Angew substrate grid must no longer be visible as primary TOC');
  report.oct09Angew=featuredAngew.map(doi=>({...statusByDoi.get(doi),
    capturedSources:byDoi.get(doi)||[]}));
  report.oct09BodyCrosscheck=[];
  for(const doi of featuredAngew){
    try {
      const packet=JSON.parse(await get(API+'/api/article-figures/staged?doi='+encodeURIComponent(doi)+'&audit='+Date.now(),2_000_000));
      const publicToc=statusByDoi.get(doi);
      const evidence=(byDoi.get(doi)||[]).filter(x=>x.hash&&x.hash===publicToc?.contentHash);
      const hits=itemList(packet).filter(row=>evidence.some(x=>{
        const bodySource=cleanUrl(row?.sourceUrl);
        const bodyHash=String(row?.contentHash||row?.sha256||'').toLowerCase();
        return bodySource===x.sourceUrl||bodyHash.startsWith(x.hash);
      })).map(row=>({label:limited(row?.label,70),sourceUrl:cleanUrl(row?.sourceUrl)}));
      report.oct09BodyCrosscheck.push({doi,stagedCount:itemList(packet).length,
        matchingPublishedToc:hits,numberedBodyCollision:hits.length>0});
    }catch(e){report.oct09BodyCrosscheck.push({doi,checkUnavailable:limited(e?.message||e,160)});}
  }
  report.recentAngew=angews.map(doi=>({
    ...statusByDoi.get(doi),
    origins:(byDoi.get(doi)||[]).map(s=>({...s,
      matchingPublishedHash:s.hash!==''&&s.hash===statusByDoi.get(doi)?.contentHash}))
  }));
  // Wiley -gra- internal asset numbering is NOT a DOI field. Count the
  // mismatches as descriptive publisher metadata, not content violations.
  report.internalAssetIdDiffersFromDoi=report.recentAngew.filter(x=>x.origins.some(o=>o.matchingPublishedHash && o.publisherAssetIdentity?.discrepant)).length;
  report.anomalyCandidates=report.recentAngew.filter(x=>x.origins.some(o=>
    o.matchingPublishedHash && (o.category==='suspected_body_image' || o.category==='unverified_graphical_abstract_origin'
      || (x.doi==='10.1002/anie.4335022' && o.hash==='35f10c5321cd43179a4c71c73e388da8'))
  )).map(x=>({doi:x.doi,reason:x.reason,category:x.origins.filter(o=>o.matchingPublishedHash)
    .map(o=>o.category),sourceUrls:x.origins.filter(o=>o.matchingPublishedHash).map(o=>o.sourceUrl),
    numericIds:x.origins.filter(o=>o.matchingPublishedHash).map(o=>o.publisherAssetIdentity)}));
  report.remainingCacheMiss=report.fourMissing.filter(x=>!x?.available).map(x=>x.doi);
  report.completedAt=new Date().toISOString();
  report.status='read_only_complete';
} catch(error) {
  report.status='read_only_incomplete';
  report.errors.push(limited(error?.message||error,450));
  process.exitCode=1;
}
const output=path.join(process.env.RUNNER_TEMP||'/tmp','tm-oct09-media-origin-live.json');
await mkdir(path.dirname(output),{recursive:true});
await writeFile(output,JSON.stringify(report,null,2)+'\n','utf8');
console.log('TM_OCT09_LIVE_SUMMARY '+JSON.stringify({
  checkedAt:report.checkedAt,status:report.status,
  installer:report.installer,queue:report.queue,captureIndex:report.captureIndex,
  fourMissing:report.fourMissing,fourProvenance:report.fourProvenance,exactAngewQuarantine:report.exactAngewQuarantine,oct09Angew:report.oct09Angew,
  recentAngewInspected:report.recentAngew?.length,
  anomalyCandidates:report.anomalyCandidates,
  internalAssetIdDiffersFromDoi:report.internalAssetIdDiffersFromDoi,
  oct09BodyCrosscheck:report.oct09BodyCrosscheck,
  remainingCacheMiss:report.remainingCacheMiss,errors:report.errors,
  readOnly:true,productionWrites:0,publisherVisits:0
}));
