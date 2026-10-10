// Public API review coverage audit: only DOI, current source equality and
// short status codes. Do not read, print or persist private Evidence/abstract
// texts. Does not publish a paper, summary, image or PDF.
import {writeFile} from 'node:fs/promises';
import {classifyPublishedAbstractGap} from './lib/classify-gallery-abstract-gap.mjs';

const SITE=new URL(process.env.GALLERY_SITE_URL||'https://gallery.gczhouwld.com/');
const API=new URL(process.env.GALLERY_API_URL||'https://api.gczhouwld.com/');
const OUT=process.env.GALLERY_APPROVED_SUMMARY_AUDIT_REPORT||'/tmp/gallery-approved-summary-live.json';
const LIMIT=Math.max(1,Math.min(500,Number(process.env.GALLERY_APPROVED_SUMMARY_AUDIT_LIMIT||'500')));
const DOI=/^10\.\d{4,9}\/\S+$/;
const HASH=/^[a-f0-9]{64}$/;
const cleanDoi=value=>String(value||'').trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'');
const assert=(ok,code)=>{if(!ok)throw Error(code);};
async function getJson(url){
  const href=new URL(url);
  const response=await fetch(href,{headers:{accept:'application/json','cache-control':'no-cache'},
    signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw Error('read_http_'+response.status);
  return response.json();
}
async function mapWithConcurrency(list,parallel,fn){
  const output=Array(list.length);
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(parallel,list.length)},async()=>{
    while(cursor<list.length){const i=cursor++;output[i]=await fn(list[i]);}
  }));
  return output;
}
const report={schemaVersion:'gallery-approved-summary-live-audit-v1',
  startedAt:new Date().toISOString(),readOnly:true,productionWrites:0,ok:false};
try{
  const [delivery,summaries,registry]=await Promise.all([
    getJson(new URL('release-delivery.json',SITE)),
    getJson(new URL('scheduled-article-summaries.json',SITE)),
    getJson(new URL('toc-demand-live.json',SITE))
  ]);
  const catalogId=String(delivery.architectureCatalogId||'');
  assert(HASH.test(catalogId)&&Array.isArray(delivery.dois),'catalog_version_invalid');
  const active=new Set(delivery.dois.map(cleanDoi));
  assert(active.size===delivery.dois.length,'duplicate_published_doi');
  const meta=new Map((registry.articles||[]).map(p=>[cleanDoi(p.doi),p]));
  assert(active.size===meta.size&&[...meta.keys()].every(x=>active.has(x)),'registry_membership_mismatch');
  const approved=Object.entries(summaries.items||{}).filter(([,row])=>row?.status==='approved')
    .map(([doi,row])=>({doi:cleanDoi(doi),row}));
  assert(new Set(approved.map(x=>x.doi)).size===approved.length,'duplicate_review_doi');
  assert(approved.every(x=>DOI.test(x.doi)&&active.has(x.doi)&&x.row.doi===x.doi),
    'unpublished_or_cross_doi_review_record');
  approved.sort((a,b)=>a.doi.localeCompare(b.doi));
  const windows=Math.max(1,Math.ceil(approved.length/LIMIT));
  const selectedIndex=windows===1?0:Math.floor(Date.now()/86400000)%windows;
  const selected=approved.slice(selectedIndex*LIMIT,(selectedIndex+1)*LIMIT);
  const rows=await mapWithConcurrency(selected,6,async entry=>{
    const doi=entry.doi;
    let ui=null,error='';
    try{
      ui=await getJson(new URL('/api/user-ui/article-summary?doi='+encodeURIComponent(doi),API));
      assert(ui?.doi===doi,'summary_response_wrong_doi');
    }catch(err){error=String(err?.message||err).slice(0,90);}
    const classified=classifyPublishedAbstractGap(entry.row,ui,error);
    const liveSource=String(ui?.source||'');
    const hasCurrentDeep=ui?.available===true
      &&(liveSource==='scheduled_reviewed_evidence_v2'||liveSource==='reviewed_evidence_v2');
    return {
      doi,journal:String(meta.get(doi)?.journal||'unknown'),
      firstOnlineDate:String(meta.get(doi)?.date||''),
      originalRecordApproved:true,liveAnySummary:ui?.available===true,
      liveCurrentDeepSummary:hasCurrentDeep,liveSummarySource:liveSource||null,
      publicOriginalExcerptVisible:Boolean(ui?.abstractExcerpt),
      ...classified,...(error?{transportError:error}:{})
    };
  });
  const fresh=await getJson(new URL('release-delivery.json',SITE));
  assert(fresh.architectureCatalogId===catalogId
    &&JSON.stringify((fresh.dois||[]).map(cleanDoi).sort())
      ===JSON.stringify([...active].sort()),'catalog_changed_during_summary_audit');
  const categories={},journals={},reasonCounts={};
  let usableDeep=0,usableAny=0,errors=0,withExcerpt=0;
  for(const item of rows){
    categories[item.category]=(categories[item.category]||0)+1;
    if(item.reason)reasonCounts[item.reason]=(reasonCounts[item.reason]||0)+1;
    journals[item.journal]??={reviewRecords:0,liveDeep:0,liveAny:0,unavailable:0};
    const j=journals[item.journal];j.reviewRecords++;
    if(item.liveAnySummary){usableAny++;j.liveAny++}
    else j.unavailable++;
    if(item.liveCurrentDeepSummary){usableDeep++;j.liveDeep++}
    if(item.publicOriginalExcerptVisible)withExcerpt++;
    if(item.transportError)errors++;
  }
  Object.assign(report,{
    catalogId,publishedDoiCount:active.size,approvedReviewRecords:approved.length,
    checkedRecords:rows.length,completeCurrentReviewCoverage:selected.length===approved.length,
    auditWindow:{number:selectedIndex+1,total:windows,limit:LIMIT},
    liveCurrentDeepSummaries:usableDeep,liveAnySummaries:usableAny,
    approvedRecordsUnavailable:rows.length-usableAny-errors,
    originalExcerptVisibleForChecked:withExcerpt,
    apiErrors:errors,byEvidenceState:categories,byApiReason:reasonCounts,byJournal:journals,
    audited:rows,finishedAt:new Date().toISOString(),ok:errors===0
  });
  if(errors>0)process.exitCode=1;
}catch(err){
  report.error=String(err?.message||err).slice(0,190);
  report.finishedAt=new Date().toISOString();
  process.exitCode=1;
}finally{
  await writeFile(OUT,JSON.stringify(report,null,2)+'\n');
  console.log('GALLERY_APPROVED_SUMMARY_LIVE_AUDIT '+JSON.stringify({
    ok:report.ok,approvedRecords:report.approvedReviewRecords,
    checked:report.checkedRecords,complete:report.completeCurrentReviewCoverage,
    liveDeep:report.liveCurrentDeepSummaries,liveAny:report.liveAnySummaries,
    unavailable:report.approvedRecordsUnavailable,errors:report.apiErrors,
    byEvidenceState:report.byEvidenceState,byApiReason:report.byApiReason,
    error:report.error
  }));
}
