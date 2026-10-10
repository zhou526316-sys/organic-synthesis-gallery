// Read-only, DOI-complete gap audit. No paper admission, reviewer writes,
// publisher fetch, PDF, SI or media acquisition.
import {writeFile} from 'node:fs/promises';
import {classifyPublishedAbstractGap} from './lib/classify-gallery-abstract-gap.mjs';
const SITE=new URL(process.env.GALLERY_SITE_URL||'https://gallery.gczhouwld.com/');
const API=new URL(process.env.GALLERY_API_URL||'https://api.gczhouwld.com/');
const TOKEN=String(process.env.BRIDGE_WRITE_TOKEN||'').trim();
const OUTPUT=process.env.GALLERY_ABSTRACT_GAP_REPORT||'/tmp/gallery-abstract-gap-audit.json';
const hash=/^[a-f0-9]{64}$/;
const norm=value=>String(value||'').trim().toLowerCase()
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'');
const assert=(value,message)=>{if(!value)throw Error(message);};
async function get(url,auth=false){
  const requestUrl=new URL(url);
  const response=await fetch(requestUrl,{
    headers:{'accept':'application/json','cache-control':'no-cache',
      ...(auth?{authorization:'Bearer '+TOKEN}:{})},
    signal:AbortSignal.timeout(18_000)
  });
  if(!response.ok)throw Error('read_http_'+response.status+':'+requestUrl.pathname);
  return response.json();
}
async function missingCoverage(catalogId,expectedTotal){
  const rows=[],seen=new Set();
  let afterDoi='',total=null,original=null,reviewed=null;
  for(let page=0;page<300;page++){
    const query=new URLSearchParams({catalogId,limit:'200'});
    if(afterDoi)query.set('afterDoi',afterDoi);
    const response=await get(new URL('/api/admin/literature-search-enrichment/coverage?'+query,API),true);
    assert(response.ok===true&&response.ready===true&&response.catalogId===catalogId,'abstract_coverage_generation_invalid');
    if(total===null){
      total=Number(response.missingOriginalAbstracts);
      original=Number(response.originalAbstracts);
      reviewed=Number(response.approvedDescriptions);
      assert(Number(response.total)===expectedTotal,'abstract_coverage_member_count_invalid');
    }else assert(total===Number(response.missingOriginalAbstracts)
      &&original===Number(response.originalAbstracts),'abstract_coverage_changed_during_read');
    for(const row of response.items||[]){
      const doi=norm(row.doi);
      assert(/^10\.\d{4,9}\/\S+$/.test(doi)&&hash.test(row.revision)&&!seen.has(doi),'invalid_or_duplicate_abstract_gap');
      rows.push({doi,revision:row.revision});seen.add(doi);
    }
    if(!response.hasMore){
      assert(rows.length===total,'partial_abstract_gap_list');
      return {rows,original,missing:total,approvedDescriptions:reviewed};
    }
    assert(response.nextAfterDoi&&response.nextAfterDoi!==afterDoi,'abstract_gap_cursor_stalled');
    afterDoi=response.nextAfterDoi;
  }
  throw Error('abstract_gap_page_budget_exhausted');
}
async function mapLimited(entries,limit,work){
  const results=Array(entries.length);let index=0;
  await Promise.all(Array.from({length:Math.min(limit,entries.length)},async()=>{
    while(index<entries.length){
      const position=index++;
      results[position]=await work(entries[position]);
    }
  }));
  return results;
}
const report={schemaVersion:'gallery-abstract-gap-audit-v1',startedAt:new Date().toISOString(),
  ok:false,readOnly:true,productionWrites:0};
try{
  assert(TOKEN,'authorized_read_token_missing');
  const delivery=await get(new URL('release-delivery.json',SITE));
  const catalogId=String(delivery.architectureCatalogId||'').toLowerCase();
  assert(hash.test(catalogId)&&Array.isArray(delivery.dois),'invalid_verified_delivery');
  const allowed=new Set(delivery.dois.map(norm));
  assert(allowed.size===delivery.dois.length,'published_doi_duplicate');
  const [liveRegistry,summaries,cov]=await Promise.all([
    get(new URL('toc-demand-live.json',SITE)),
    get(new URL('scheduled-article-summaries.json',SITE)),
    missingCoverage(catalogId,allowed.size)
  ]);
  assert(cov.original+cov.missing===allowed.size,'abstract_source_count_parity');
  const papers=new Map((liveRegistry.articles||[]).map(x=>[norm(x.doi),x]));
  assert(papers.size===allowed.size&&[...papers.keys()].every(x=>allowed.has(x)),'registry_generation_mismatch');
  const approved=new Map(Object.entries(summaries.items||{})
    .filter(([doi,item])=>item?.status==='approved'&&allowed.has(norm(doi)))
    .map(([doi,item])=>[norm(doi),item]));
  const gaps=[];
  const raw=await mapLimited(cov.rows,4,async row=>{
    const p=papers.get(row.doi);
    assert(p&&allowed.has(row.doi),'unpublished_doi_gap');
    try{
      const ui=await get(new URL('/api/user-ui/article-summary?doi='+encodeURIComponent(row.doi),API));
      assert(ui.doi===row.doi,'doi_crossed_in_live_summary');
      return {row,p,ui};
    }catch(error){return {row,p,ui:null,error:String(error?.message||error).slice(0,140)}}
  });
  const journal={};const states={},evidenceCategories={},failureReasons={};
  let recorded=0,liveAvailable=0,liveErrors=0;
  for(const item of raw){
    const row=item.row,p=item.p;
    const record=approved.get(row.doi)||null;
    const rec=Boolean(record);
    const uiReady=item.ui?.available===true;
    const classification=classifyPublishedAbstractGap(record,item.ui,item.error);
    if(rec)recorded++;
    if(uiReady)liveAvailable++;
    if(item.error)liveErrors++;
    const name=String(p.journal||'unknown');
    journal[name]||={missingOriginal:0,withExistingApprovedSummaryRecord:0,liveAvailable:0};
    journal[name].missingOriginal++;
    if(rec)journal[name].withExistingApprovedSummaryRecord++;
    if(uiReady)journal[name].liveAvailable++;
    const state=item.error?'api_read_failed':uiReady?'summary_live_available':'no_live_summary';
    states[state]=(states[state]||0)+1;
    evidenceCategories[classification.category]=(evidenceCategories[classification.category]||0)+1;
    if(classification.reason)failureReasons[classification.reason]=(failureReasons[classification.reason]||0)+1;
    gaps.push({doi:row.doi,revision:row.revision,
      journal:name,firstOnlineDate:p.date||null,addedDate:p.addedDate||null,
      title:String(p.title||'').slice(0,220),approvedSummaryRecord:rec,
      liveSummaryAvailable:uiReady,liveSource:item.ui?.source||null,
      state,...classification,...(item.error?{error:item.error}:{})});
  }
  report.catalogId=catalogId;
  report.publishedDoiCount=allowed.size;
  report.originalAbstracts=cov.original;
  report.missingOriginalAbstracts=cov.missing;
  report.approvedDescriptions=cov.approvedDescriptions;
  report.approvedSummaryRecordsAcrossMissing=recorded;
  report.liveSummaryAvailableAcrossMissing=liveAvailable;
  report.withoutOriginalOrLiveSummary=cov.missing-liveAvailable-liveErrors;
  report.liveSummaryApiErrors=liveErrors;
  report.byJournal=journal;report.byCardState=states;
  report.byEvidenceReason=evidenceCategories;report.byApiReason=failureReasons;
  report.missingDois=gaps;
  report.ok=liveErrors===0;report.finishedAt=new Date().toISOString();
  if(!report.ok)process.exitCode=1;
}catch(error){
  report.error=String(error?.message||error).slice(0,220);
  report.failedAt=new Date().toISOString();
  process.exitCode=1;
}finally{
  await writeFile(OUTPUT,JSON.stringify(report,null,2)+'\n');
  console.log('GALLERY_ABSTRACT_GAP_AUDIT '+JSON.stringify({
    ok:report.ok,catalogId:report.catalogId,published:report.publishedDoiCount,
    originalAbstracts:report.originalAbstracts,missingOriginalAbstracts:report.missingOriginalAbstracts,
    missingWithApprovedRecord:report.approvedSummaryRecordsAcrossMissing,
    missingWithLiveSummary:report.liveSummaryAvailableAcrossMissing,
    missingWithNeither:report.withoutOriginalOrLiveSummary,
    errors:report.liveSummaryApiErrors,journals:report.byJournal,
    evidenceReasons:report.byEvidenceReason,apiReasons:report.byApiReason,
    error:report.error
  }));
}
