/**
 * Read-only production acceptance for DOI-scoped historical admission.
 * A green build or a successful publisher discovery run is never evidence of
 * a live Archive/D1 hit. No media access, no POST writes, no release actions.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const REPORT_SCHEMA='gallery-historical-archive-live-acceptance-v1';
const norm=v=>String(v||'').trim().toLowerCase();
const assert=(condition,message)=>{if(!condition)throw Error(message)};
export function historicalD1Budget(value=16){
  const limit=Number(value);
  assert(Number.isSafeInteger(limit)&&limit>=1&&limit<=24,'historical_d1_budget_invalid');
  let used=0;
  return {
    get used(){return used},
    get limit(){return limit},
    charge(){
      if(used>=limit)throw Error('historical_d1_readback_query_budget_exhausted:'+used+'/'+limit);
      used++;
    }
  };
}
const unique=x=>[...new Set(x)];
export function expectedHistory(marker,manifest){
  if(marker?.mode!=='slot-release'||marker.publicationSlot?.includes('T08:00:00')!==true)
    throw Error('not_valid_08_00_release_marker');
  const ids=marker.historicalAdmittedDois||[];
  const daily=marker.dailyPublishableDois||marker.publishableDois?.filter(x=>!ids.includes(x))||[];
  assert(Array.isArray(ids)&&Array.isArray(daily),'historical_marker_partitions_invalid');
  const historySet=new Set(ids.map(norm)),dailySet=new Set(daily.map(norm));
  assert(historySet.size===ids.length&&dailySet.size===daily.length,'historical_duplicate_partition');
  assert(!ids.some(x=>dailySet.has(norm(x))),'historical_leaked_into_daily_release');
  const approved=new Map((manifest?.accepted||[]).map(x=>[norm(x.doi),x]));
  return ids.map(id=>{
    const row=approved.get(norm(id));
    assert(row,'historical_release_without_source_review:'+id);
    assert(row.ingestionChannel==='historical_backfill'&&row.addedDate===''&&row.new===false,
      'historical_source_marked_daily_new:'+id);
    assert(row.mediaPolicy===(row.date<'2026-07-01'?'metadata_only':'toc_only'),
      'historical_media_policy_mismatch:'+id);
    assert(row.reviewPasses===2&&row.challengeDecision==='include',
      'historical_release_not_double_reviewed:'+id);
    return {doi:norm(id),journal:row.journal,date:row.date,mediaPolicy:row.mediaPolicy};
  });
}
export function verifyDelivery(delivery,marker,expected){
  assert(delivery?.publicationSlot===marker.publicationSlot,'history_pages_not_current_marker');
  assert(delivery.productionCards===marker.productionCards&&
    delivery.dois?.length===marker.productionCards,'historical_pages_card_count_mismatch');
  assert(/^[a-f0-9]{64}$/.test(delivery.architectureCatalogId||''),
    'historical_pages_catalog_generation_missing');
  const members=new Set(delivery.dois.map(norm));
  assert(members.size===delivery.dois.length,'historical_pages_duplicate_doi');
  for(const item of expected)assert(members.has(item.doi),'historical_pages_doi_missing:'+item.doi);
  return delivery.architectureCatalogId;
}
export function verifyIndexedDay(payload,catalogId,requiredDois){
  assert(payload?.catalogId===catalogId&&Array.isArray(payload.items),
    'historical_index_generation_or_result_invalid');
  assert(payload.enabled===true&&payload.readPathActive===true,
    'historical_index_not_active');
  const dois=new Set(payload.items.map(x=>norm(x.doi)));
  assert(dois.size===payload.items.length,'historical_archive_index_duplicate_do_is');
  for(const id of requiredDois)if(dois.has(id))requiredDois.delete(id);
  return {hasMore:payload.hasMore===true,nextCursor:payload.nextCursor};
}
async function fetchJson(url){
  const response=await fetch(url,{headers:{accept:'application/json','cache-control':'no-cache'},
    signal:AbortSignal.timeout(20000)});
  const raw=await response.text();
  if(!response.ok)throw Error('archive_read_http_'+response.status+':'+raw.slice(0,90));
  try{return JSON.parse(raw)}catch{throw Error('archive_read_invalid_json')}
}
export async function inspectProduction({site='https://gallery.gczhouwld.com/',
  api='https://api.gczhouwld.com/',marker,manifest,maxPagesPerDay=3,
  maxD1Queries=Number(process.env.HISTORICAL_D1_MAX_API_QUERIES||16)}={}){
  const budget=historicalD1Budget(maxD1Queries);
  const report={schemaVersion:REPORT_SCHEMA,startedAt:new Date().toISOString(),
    publicationSlot:marker?.publicationSlot,ok:false,readOnly:true,
    d1ReadbackQueryCap:budget.limit,d1RowsReadMeasured:false,
    d1AccountRemainingQuota:'not_available_from_public_api',
    candidateAcquisitionD1Queries:0};
  const expected=expectedHistory(marker,manifest);
  report.expectedHistoricalDois=expected.map(x=>x.doi);
  if(!expected.length){report.status='latest_release_contains_no_historical_admissions';report.ok=true;return report;}
  const delivery=await fetchJson(new URL('release-delivery.json',site));
  const catalogId=verifyDelivery(delivery,marker,expected);
  report.catalogId=catalogId;
  const missing=[];
  const grouped=new Map();
  for(const p of expected){
    if(!grouped.has(p.date))grouped.set(p.date,new Set());
    grouped.get(p.date).add(p.doi);
  }
  const endpoint=new URL('/api/literature/catalog-view',api);
  for(const [date,required]of grouped){
    let cursor=null,pages=0;
    do{
      if(pages>=maxPagesPerDay)throw Error('historical_day_index_budget_hit:'+date);
      const url=new URL(endpoint);
      url.searchParams.set('catalogId',catalogId);
      url.searchParams.set('dateFrom',date);
      url.searchParams.set('dateTo',date);
      url.searchParams.set('sort','oldest');
      url.searchParams.set('limit','100');
      if(cursor)url.searchParams.set('cursor',cursor);
      budget.charge();
      const payload=await fetchJson(url);
      const outcome=verifyIndexedDay(payload,catalogId,required);
      pages++;
      if(!outcome.hasMore)break;
      assert(outcome.nextCursor&&outcome.nextCursor!==cursor,'historical_day_cursor_invalid');
      cursor=outcome.nextCursor;
    }while(required.size);
    if(required.size)missing.push(...required);
  }
  assert(!missing.length,'historical_d1_archive_missing:'+missing.join(','));
  report.d1ReadbackQueriesUsed=budget.used;
  report.status='pages_and_d1_historical_doi_verified';
  report.verifiedDois=expected.map(x=>x.doi);
  report.pagesAndIndexParity=true;
  report.publisherIssueCompletionVerified=false;
  report.allTimeLegacyNoDoiCompletenessVerified=false;
  report.todayHotVisualUiVerified=false;
  report.ok=true;report.completedAt=new Date().toISOString();
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const output=process.env.HISTORICAL_LIVE_REPORT||'/tmp/gallery-historical-live-acceptance.json';
  let report;
  try{
    const [marker,manifest]=await Promise.all([
      readFile('audit/publication-release-state.json','utf8').then(JSON.parse),
      readFile('audit/historical-reviewed/approved-admissions.json','utf8').then(JSON.parse)
    ]);
    report=await inspectProduction({marker,manifest});
  }catch(e){report={schemaVersion:REPORT_SCHEMA,ok:false,readOnly:true,error:String(e?.message||e)};process.exitCode=1}
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log('HISTORICAL_ARCHIVE_LIVE_ACCEPTANCE '+JSON.stringify(report));
}
