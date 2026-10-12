/**
 * Independent historical DOI discovery — candidates only, NEVER publication.
 * UTC 15:00 = Beijing 23:00. Output is written on the historical STAGING
 * branch, never to the seven fixed-slot protected literature source files.
 */
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {TARGET_JOURNALS} from '../shared/literature-journals.js';

export const SCHEMA='gallery-historical-nightly-staging-v1';
export const STAGE_ROOT='audit/historical-staging';
export const START={from:'2026-09-22',to:'2026-09-30'};
const FLOOR='1850-01-01';
const MAX_ROWS=100, MAX_PAGES=10;
export const RSC_CREATION_RESCUE_VERSION='rsc-created-date-rescue-20261012-v1';
const RSC_JOURNALS=new Set(['Chemical Science','Green Chemistry']);
export const requiresRscCreationRescue=journal=>RSC_JOURNALS.has(journal?.name);

export function normDoi(value) {
  let s=String(value||'').trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'');
  try{s=decodeURIComponent(s);}catch{}
  return /^10\.\d{4,9}\/\S+$/.test(s)?s:null;
}
const iso=(year,month,day)=>String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
const lastDay=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();
export function previousPeriod(current) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(current?.from||''))throw Error('invalid_history_cursor_date');
  const time=new Date(current.from+'T00:00:00Z').getTime()-86400000;
  if(!Number.isFinite(time))throw Error('invalid_history_cursor_date');
  const d=new Date(time),y=d.getUTCFullYear(),m=d.getUTCMonth()+1,n=d.getUTCDate();
  if(iso(y,m,n)<FLOOR)return null;
  if(iso(y,m,n)>='2026-07-01'){
    const from=n<=7?1:n<=14?8:n<=21?15:22;
    const to=n<=7?7:n<=14?14:n<=21?21:lastDay(y,m);
    return {from:iso(y,m,from),to:iso(y,m,to)};
  }
  if(y>=2015)return {from:iso(y,m,1),to:iso(y,m,lastDay(y,m))};
  if(y>=2000){
    const start=3*Math.floor((m-1)/3)+1;
    return {from:iso(y,start,1),to:iso(y,start+2,lastDay(y,start+2))};
  }
  if(y>=1900){
    const start=m<=6?1:7;
    return {from:iso(y,start,1),to:iso(y,start+5,lastDay(y,start+5))};
  }
  return {from:iso(y,1,1),to:iso(y,12,31)};
}
export function orderedJournals(journals=TARGET_JOURNALS) {
  const pinned=['JACS','Angew'];
  const result=[...journals].sort((a,b)=>{
    const x=pinned.indexOf(a.name),y=pinned.indexOf(b.name);
    return (x<0?1000:x)-(y<0?1000:y);
  });
  if(new Set(result.map(x=>x.name)).size!==result.length)throw Error('duplicate_journal_registry');
  return result;
}
export function nextCursor(cursor,journals=orderedJournals()) {
  if(!cursor || !cursor.range || !Number.isInteger(cursor.journalIndex)
    ||cursor.journalIndex<0||cursor.journalIndex>=journals.length)throw Error('invalid_history_cursor');
  if(cursor.journalIndex+1<journals.length)return {range:cursor.range,journalIndex:cursor.journalIndex+1};
  const prior=previousPeriod(cursor.range);
  return prior?{range:prior,journalIndex:0}:null;
}

const DAY_MS=86_400_000;
const dateText=millis=>new Date(millis).toISOString().slice(0,10);
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)
  &&Number.isFinite(Date.parse(value+'T00:00:00Z'))
  &&dateText(Date.parse(value+'T00:00:00Z'))===value;

/** Split an inclusive date interval with no missing or overlapping calendar days. */
export function bisectDateRange(range){
  if(!validDate(range?.from)||!validDate(range?.to)||range.from>range.to)
    throw Error('invalid_history_slice_range');
  if(range.from===range.to)return null;
  const start=Date.parse(range.from+'T00:00:00Z'),end=Date.parse(range.to+'T00:00:00Z');
  const leftDays=Math.floor(((end-start)/DAY_MS+1)/2);
  const leftEnd=start+(leftDays-1)*DAY_MS;
  return [
    {from:range.from,to:dateText(leftEnd)},
    {from:dateText(leftEnd+DAY_MS),to:range.to}
  ];
}

/** Only genuine source-result truncation merits splitting; 429/transport errors remain blocked. */
export function isTruncationOnly(status){
  return status?.complete===false&&Array.isArray(status.issues)&&status.issues.length>0
    &&status.issues.every(issue=>/(?:crossref|openalex):truncated_or_inconsistent$/.test(String(issue)));
}
/** Hitting our per-run request ceiling is expected, not a publisher-source outage. */
export function isBudgetOnlyExhaustion(status){
  return status?.complete===false&&Array.isArray(status.issues)&&status.issues.length>0
    &&status.issues.every(issue=>/nightly_api_budget_exceeded$/.test(String(issue)));
}
const journalBatchId=(range,journal)=>range.from+'_'+range.to+'_'
  +journal.name.toLowerCase().replace(/[^a-z0-9]+/g,'-');

export function mediaPolicy(firstOnlineDate){
  return firstOnlineDate>='2026-07-01'&&firstOnlineDate<='2026-09-30'?'toc_only':'metadata_only';
}
const nonempty=v=>typeof v==='string'?v.trim():'';
function textValue(value){
  return String(value||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&')
    .replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/\s+/g,' ').trim().slice(0,850);
}
function dateParts(value){
  const parts=value?.['date-parts']?.[0]||[];
  if(!Array.isArray(parts)||parts.length!==3||!parts.every(Number.isInteger))return '';
  const exact=iso(parts[0],parts[1],parts[2]);
  return validDate(exact)?exact:'';
}
function yearPart(value){
  const y=value?.['date-parts']?.[0]?.[0];
  return Number.isInteger(y)&&y>=1850&&y<=2100?y:null;
}
function authorName(row){
  return textValue([row?.given,row?.family].filter(Boolean).join(' ')||row?.name);
}
export function fromCrossref(row){
  const doi=normDoi(row?.DOI);
  if(!doi)return null;
  const title=textValue(Array.isArray(row.title)?row.title[0]:row.title);
  // Year-only registration is NOT a first-online date: never invent January 1.
  const date=dateParts(row?.['published-online'])||dateParts(row?.published)||dateParts(row?.issued);
  const datePrecision=date?'day':'unknown';
  const createdDate=dateParts(row?.created);
  const year=yearPart(row?.['published-online'])||yearPart(row?.published)
    ||yearPart(row?.issued)||yearPart(row?.created);
  return {doi,title,authors:(Array.isArray(row.author)?row.author:[]).map(authorName).filter(Boolean).slice(0,75),
    date,datePrecision,createdDate,needsPublisherDateVerification:!date,
    journal:textValue(Array.isArray(row['container-title'])?row['container-title'][0]:row['container-title']),
    citation:{year,volume:nonempty(row.volume),issue:nonempty(row.issue),
      pages:nonempty(row.page),articleNumber:nonempty(row['article-number']),doi},
    abstract:{available:Boolean(row.abstract),displayPermission:'not_verified',source:'crossref',storedText:false},
    source:'crossref',url:nonempty(row.URL)||'https://doi.org/'+doi};
}
export function fromOpenAlex(row,{rscYearOnlyRisk=false}={}){
  const doi=normDoi(row?.doi);
  if(!doi)return null;
  const title=textValue(row.display_name||row.title);
  const names=(Array.isArray(row.authorships)?row.authorships:[]).map(a=>textValue(a?.author?.display_name)).filter(Boolean).slice(0,75);
  let date=validDate(row.publication_date)?row.publication_date:'';
  // OpenAlex has normalized RSC year-only publication dates to Jan 1.
  if(rscYearOnlyRisk&&date.endsWith('-01-01'))date='';
  const b=row.biblio||{};
  return {doi,title,authors:names,date,datePrecision:date?'day':'unknown',
    needsPublisherDateVerification:!date,
    journal:textValue(row?.primary_location?.source?.display_name),
    citation:{year:Number(row.publication_year)||Number(String(row.publication_date||'').slice(0,4))||null,volume:nonempty(b.volume),issue:nonempty(b.issue),
      pages:[b.first_page,b.last_page].filter(Boolean).join('-'),articleNumber:'',doi},
    abstract:{available:row.has_abstract===true||Boolean(row.abstract_inverted_index),
      displayPermission:'not_verified',source:'openalex',storedText:false},
    source:'openalex',url:'https://doi.org/'+doi};
}
export function mergeCandidates(crossref,openalex,published=new Set(),range=START) {
  const map=new Map();
  for(const record of [...crossref,...openalex]){
    if(!record?.doi)continue;
    const prev=map.get(record.doi);
    if(!prev)map.set(record.doi,{...record,sources:[record.source]});
    else {
      const sources=[...new Set([...prev.sources,record.source])];
      map.set(record.doi,{
        ...prev,title:prev.title||record.title,authors:prev.authors.length?prev.authors:record.authors,
        date:prev.date||record.date,journal:prev.journal||record.journal,
        createdDate:prev.createdDate||record.createdDate||'',
        needsPublisherDateVerification:!(prev.date||record.date),
        abstract:{available:prev.abstract.available||record.abstract.available,
          displayPermission:'not_verified',source:sources.join('+'),storedText:false},
        sources, titleSourceConflict:Boolean(prev.title&&record.title
          &&prev.title.toLowerCase()!==record.title.toLowerCase())
      });
    }
  }
  return [...map.values()].sort((a,b)=>a.doi.localeCompare(b.doi)).map(row=>({
    ...row,ingestionChannel:'historical_backfill',mediaPolicy:mediaPolicy(row.date),
    needsPublisherDateVerification:!row.date,
    discoveredIn:range,existingGalleryRecord:published.has(row.doi),
    reviewStatus:published.has(row.doi)?'already_published':'unfinished',
    needsArticleEvidence:!published.has(row.doi),
    publicationDateMayDiffer:!row.date||row.date<range.from||row.date>range.to,
  }));
}
export function completeStatus(crossref,openalex) {
  const issues=[...(crossref.issues||[]),...(openalex.issues||[])];
  return {complete:issues.length===0,issues,sourceCounts:{
    crossref:crossref.rows?.length||0,openalex:openalex.rows?.length||0
  }};
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function saveJson(path,data) {
  await mkdir(dirname(path),{recursive:true});
  const temp=path+'.tmp.'+process.pid;
  await writeFile(temp,JSON.stringify(data,null,2)+'\n','utf8');
  await rename(temp,path);
}
async function loadJson(path,fallback){
  try{return JSON.parse(await readFile(path,'utf8'))}
  catch(e){if(e?.code==='ENOENT')return fallback;throw e}
}
class Budget {
  constructor(max){this.max=max;this.count=0}
  use(){if(this.count>=this.max)throw Error('nightly_api_budget_exceeded');this.count++}
}
async function request(url,budget,source){
  budget.use();
  let response;
  try{response=await fetch(url,{signal:AbortSignal.timeout(20000),
    headers:{accept:'application/json','user-agent':'OrganicSynthesisGallery-HistoryIndex/1.0 (gallery.gczhouwld.com)'}})}
  catch(e){throw Error(source+':transport_'+String(e?.name||'unknown'))}
  if(!response.ok)throw Error(source+':http_'+response.status);
  try{return await response.json()}catch{throw Error(source+':invalid_json')}
}
async function crossrefWindow(journal,range,budget){
  const map=new Map(),issues=[],byIssn=[];
  const lanes=requiresRscCreationRescue(journal)?['created']:['publication'];
  // RSC year-only publication dates may all collapse to January 1 (over
  // 1,300 works in one day). Its bounded authoritative discovery lane is
  // Crossref created-date; the publisher must verify actual first-online
  // date before any historical publication/admission.
  for(const issn of journal.issns){
    for(const lane of lanes){
      let cursor='*',page=0,total=null,count=0;
      try{
        while(page<MAX_PAGES){
          const u=new URL('https://api.crossref.org/journals/'+encodeURIComponent(issn)+'/works');
          const axis=lane==='created'?'created-date':'pub-date';
          u.searchParams.set('filter','from-'+axis+':'+range.from+',until-'+axis+':'+range.to+',type:journal-article');
          u.searchParams.set('rows',String(MAX_ROWS));u.searchParams.set('cursor',cursor);
          const res=await request(u,budget,'crossref');
          if(!res?.message||!Array.isArray(res.message.items))throw Error('crossref:invalid_items');
          const items=res.message.items,reported=Number(res.message['total-results']);
          if(!Number.isSafeInteger(reported)||reported<0)throw Error('crossref:invalid_total');
          if(total!==null&&total!==reported)throw Error('crossref:total_changed');
          total=reported;count+=items.length;page++;
          for(const raw of items){const row=fromCrossref(raw);if(row)map.set(row.doi,row)}
          if(items.length<MAX_ROWS||count>=reported)break;
          const next=res.message['next-cursor'];
          if(typeof next!=='string'||!next||next===cursor)throw Error('crossref:missing_next_cursor');
          cursor=next;
        }
        if(count<(total||0))throw Error('crossref:truncated_or_inconsistent');
        byIssn.push({issn,lane,total,count,pages:page,complete:true});
      }catch(e){
        issues.push('issn_'+issn+':'+lane+':'+String(e?.message||e).slice(0,100));
        byIssn.push({issn,lane,total,count,pages:page,complete:false});
        return {rows:[...map.values()],issues,byIssn};
      }
    }
  }
  return {rows:[...map.values()],issues,byIssn};
}

async function openalexWindow(journal,range,budget) {
  const map=new Map(),issues=[];let cursor='*',count=0,pages=0,total=null;
  try{
    while(pages<MAX_PAGES){
      const u=new URL('https://api.openalex.org/works');
      u.searchParams.set('filter','primary_location.source.issn:'+journal.issns.join('|')
        +',from_publication_date:'+range.from+',to_publication_date:'+range.to);
      u.searchParams.set('per_page',String(MAX_ROWS));u.searchParams.set('cursor',cursor);
      u.searchParams.set('select','id,doi,display_name,publication_date,authorships,primary_location,biblio,abstract_inverted_index,type');
      if(process.env.OPENALEX_API_KEY)u.searchParams.set('api_key',process.env.OPENALEX_API_KEY);
      const data=await request(u,budget,'openalex');
      if(!Array.isArray(data.results)||!data.meta)throw Error('openalex:invalid_response');
      const reported=Number(data.meta.count);
      if(!Number.isSafeInteger(reported)||reported<0)throw Error('openalex:invalid_total');
      if(total!==null&&total!==reported)throw Error('openalex:total_changed');
      total=reported;count+=data.results.length;pages++;
      for(const raw of data.results){
        const row=fromOpenAlex(raw,{rscYearOnlyRisk:requiresRscCreationRescue(journal)});
        if(row)map.set(row.doi,row);
      }
      if(data.results.length<MAX_ROWS||count>=reported)break;
      const next=data.meta.next_cursor;
      if(typeof next!=='string'||!next||next===cursor)throw Error('openalex:missing_next_cursor');
      cursor=next;
    }
    if(count<(total||0))throw Error('openalex:truncated_or_inconsistent');
  }catch(e){issues.push(String(e?.message||e).slice(0,110))}
  return {rows:[...map.values()],issues,total,count,pages};
}
async function publishedSet(){
  const [queue,marker]=await Promise.all([
    loadJson('public/toc-demand-live.json',null),
    loadJson('audit/publication-release-state.json',null)
  ]);
  if(!queue||!marker||!Array.isArray(queue.articles)
    ||queue.articles.length!==queue.webpageDoiCount
    ||queue.webpageDoiCount!==marker.productionCards)throw Error('published_registry_not_verified');
  const ids=queue.articles.map(x=>normDoi(x.doi));
  if(ids.some(x=>!x)||new Set(ids).size!==ids.length)throw Error('published_registry_invalid_or_duplicate');
  return new Set(ids);
}

/**
 * Only promote a split root after every non-overlapping leaf has complete source coverage.
 * Leaf files are audit evidence, not separate admission/search candidates.
 */
async function finalizeSplitRoot(split,journal,published){
  const merged=new Map(),segments=[];
  let crossrefCount=0,openalexCount=0,duplicateDois=0;
  if(!validDate(split.rootRange?.from)||!validDate(split.rootRange?.to)
    ||split.rootRange.from>split.rootRange.to)
    throw Error('split_segment_root_range_invalid');
  if(new Set(split.completed).size!==split.completed.length)
    throw Error('split_segment_duplicate_receipt');
  for(const id of split.completed){
    const batch=await loadJson(STAGE_ROOT+'/batches/'+id+'.json',null);
    if(!batch||batch.recordType!=='historical_discovery_segment_evidence'
      ||batch.parentBatchId!==split.rootId||batch.status!=='source_enumeration_complete'
      ||batch.consistency?.complete!==true||!Array.isArray(batch.records)
      ||batch.journal!==journal.name
      ||!validDate(batch.range?.from)||!validDate(batch.range?.to)
      ||batch.range.from>batch.range.to
      ||id!==split.rootId+'__'+batch.range.from+'_'+batch.range.to)
      throw Error('split_segment_evidence_incomplete:'+id);
    crossrefCount+=batch.consistency.sourceCounts?.crossref||0;
    openalexCount+=batch.consistency.sourceCounts?.openalex||0;
    segments.push({id,range:batch.range,candidates:batch.candidateCount});
    for(const record of batch.records){
      if(!record?.doi||normDoi(record.doi)!==record.doi)
        throw Error('split_segment_invalid_doi');
      if(merged.has(record.doi))duplicateDois++;
      else merged.set(record.doi,record);
    }
  }
  // Validate the union of leaf date windows before claiming the entire root was enumerated.
  // This also rejects malformed, overlapping, forged, or truncated saved checkpoints.
  const ordered=[...segments].sort((a,b)=>a.range.from.localeCompare(b.range.from));
  let nextDate=split.rootRange.from;
  for(const segment of ordered){
    if(segment.range.from!==nextDate)
      throw Error('split_segment_coverage_gap_or_overlap');
    nextDate=dateText(Date.parse(segment.range.to+'T00:00:00Z')+DAY_MS);
  }
  if(nextDate!==dateText(Date.parse(split.rootRange.to+'T00:00:00Z')+DAY_MS))
    throw Error('split_segment_coverage_gap_or_overlap');
  // The 08:00 official DOI registry may have changed between resumed nightly leaves.
  const rows=[...merged.values()].sort((a,b)=>a.doi.localeCompare(b.doi)).map(record=>{
    const existingGalleryRecord=published.has(record.doi);
    return {...record,discoveredIn:split.rootRange,
      existingGalleryRecord,reviewStatus:existingGalleryRecord?'already_published':'unfinished',
      needsArticleEvidence:!existingGalleryRecord};
  });
  const rootRecord={
    schema:SCHEMA,recordType:'historical_discovery_candidate_only',
    journal:journal.name,issns:journal.issns,range:split.rootRange,
    checkedAt:new Date().toISOString(),status:'source_enumeration_complete',
    sourceStatus:{splitSegments:segments},
    consistency:{complete:true,issues:[],sourceCounts:{crossref:crossrefCount,openalex:openalexCount}},
    candidateCount:rows.length,alreadyPublished:rows.filter(x=>x.existingGalleryRecord).length,
    unreviewed:rows.filter(x=>x.reviewStatus==='unfinished').length,
    records:rows,completedBySubwindows:true,duplicateDoisAcrossSubwindows:duplicateDois,
    noFormalPublication:true,noMediaWrites:true,noPDFAcquisition:true,abstractTextsCopied:false,
  };
  await saveJson(STAGE_ROOT+'/batches/'+split.rootId+'.json',rootRecord);
}

export async function runNightly() {
  if(process.env.HISTORICAL_STAGING_ONLY!=='1')throw Error('staging_only_guard_required');
  if(process.env.GITHUB_REF_NAME==='main'&&process.env.HISTORICAL_STAGING_BRANCH!=='1')
    throw Error('refuses_to_write_production_main');
  const articles=await publishedSet();
  const now=new Date().toISOString(),staging=STAGE_ROOT+'/state.json';
  const state=await loadJson(staging,{
    schema:SCHEMA,mode:'candidate_discovery_only',cursor:{range:START,journalIndex:0},
    completed:[],attempts:[],publishedMembershipSnapshot:articles.size
  });
  if(state.schema!==SCHEMA||state.mode!=='candidate_discovery_only'
    ||!Array.isArray(state.completed)||!Array.isArray(state.attempts))
    throw Error('invalid_existing_staging_state');
  const journals=orderedJournals();
  // Once: reopen previously closed RSC publication-date-only windows.
  // Their source "0 results" was not a reliable source-coverage receipt.
  if(!state.rscCreatedRescue){
    const pending=state.completed.map(id=>{
      const match=/^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})_(chemical-science|green-chemistry)$/.exec(id);
      if(!match)return null;
      const name=match[3]==='chemical-science'?'Chemical Science':'Green Chemistry';
      const journalIndex=journals.findIndex(j=>j.name===name);
      return journalIndex<0?null:{range:{from:match[1],to:match[2]},journalIndex};
    }).filter(Boolean);
    state.rscCreatedRescue={version:RSC_CREATION_RESCUE_VERSION,pending,done:[],total:pending.length};
  }
  if(state.rscCreatedRescue.version!==RSC_CREATION_RESCUE_VERSION
    ||!Array.isArray(state.rscCreatedRescue.pending)
    ||!Array.isArray(state.rscCreatedRescue.done))
    throw Error('invalid_existing_rsc_created_rescue_state');
  const maxUnits=Math.max(1,Math.min(64,Math.floor(Number(process.env.MAX_UNITS||8))));
  const budget=new Budget(Math.max(4,Math.min(320,Math.floor(Number(process.env.API_REQUEST_LIMIT||65)))));
  let processed=0,blocked=false,deferredBudget=false;
  state.publishedMembershipSnapshot=articles.size;
  state.lastRunStarted=now;
  while(processed<maxUnits&&state.cursor){
    // Reserve the minimum three calls before beginning an unsplittable source pair.
    if(budget.max-budget.count<3){deferredBudget=true;break;}
    const rescue=state.rscCreatedRescue,nextRecheck=rescue.pending[0];
    const recheckJournal=nextRecheck&&journals[nextRecheck.journalIndex];
    const recheckRoot=nextRecheck&&recheckJournal
      ?journalBatchId(nextRecheck.range,recheckJournal):null;
    // Complete any previous chronological split before beginning RSC repairs.
    const recovering=Boolean(nextRecheck
      &&(!state.activeSplit||state.activeSplit.rootId===recheckRoot));
    const activeCursor=recovering?nextRecheck:state.cursor;
    const rootRange=activeCursor.range,journal=journals[activeCursor.journalIndex];
    if(!journal)throw Error('invalid_history_cursor_journal');
    if(!validDate(rootRange?.from)||!validDate(rootRange?.to)||rootRange.from>rootRange.to)
      throw Error('invalid_history_cursor_date_range');
    const rootId=journalBatchId(rootRange,journal);
    const split=state.activeSplit;
    if(split&&(
      split.rootId!==rootId||split.journalName!==journal.name
      ||split.rootRange?.from!==rootRange.from||split.rootRange?.to!==rootRange.to
      ||!Array.isArray(split.pending)||!split.pending.length
      ||!Array.isArray(split.completed)))
      throw Error('invalid_existing_split_state');
    const range=split?split.pending[0]:rootRange;
    if(!validDate(range?.from)||!validDate(range?.to)||range.from>range.to
      ||range.from<rootRange.from||range.to>rootRange.to)
      throw Error('invalid_pending_split_range');
    const id=split?rootId+'__'+range.from+'_'+range.to:rootId;
    const [cr,oa]=await Promise.all([
      crossrefWindow(journal,range,budget),
      openalexWindow(journal,range,budget)
    ]);
    const status=completeStatus(cr,oa);
    // Publisher 429/transport/malformed data still fails closed; only a pure
    // local request-budget boundary is deferred. No partial batch is promoted,
    // no cursor advances, and a resumable split/recheck receipt stays untouched.
    if(isBudgetOnlyExhaustion(status)){
      deferredBudget=true;
      console.log('HISTORICAL_STAGING_BUDGET_DEFERRED '+JSON.stringify({
        id,requests:budget.count,maxRequests:budget.max,
        cursor:state.cursor,splitPending:state.activeSplit?.pending?.length||0,
        rscRechecksRemaining:state.rscCreatedRescue?.pending?.length||0
      }));
      break;
    }
    const rows=mergeCandidates(cr.rows,oa.rows,articles,range);
    const slices=isTruncationOnly(status)?bisectDateRange(range):null;
    const record={
      schema:SCHEMA,
      recordType:split?'historical_discovery_segment_evidence':'historical_discovery_candidate_only',
      ...(split?{parentBatchId:rootId}:{}),
      journal:journal.name,issns:journal.issns,
      range,checkedAt:new Date().toISOString(),
      status:status.complete?'source_enumeration_complete'
        :(slices?'superseded_by_subwindow_split':'incomplete_sources'),
      sourceStatus:{crossref:cr.byIssn,openalex:{total:oa.total,count:oa.count,pages:oa.pages,issues:oa.issues}},
      consistency:status,candidateCount:rows.length,
      alreadyPublished:rows.filter(x=>x.existingGalleryRecord).length,
      unreviewed:rows.filter(x=>x.reviewStatus==='unfinished').length,
      records:rows,
      noFormalPublication:true,noMediaWrites:true,noPDFAcquisition:true,abstractTextsCopied:false,
    };
    // A failed recheck must not overwrite an older root until a complete
    // source enumeration is available. Leaf evidence goes to batch files.
    const recordTarget=recovering&&!split
      ?STAGE_ROOT+'/rechecks/'+id+'.json'
      :STAGE_ROOT+'/batches/'+id+'.json';
    await saveJson(recordTarget,record);
    state.attempts.push({id,journal:journal.name,range,
      attemptKind:recovering?'rsc_created_recheck':'chronological',
      status:record.status,
      count:record.candidateCount,errors:status.issues,at:record.checkedAt});
    state.attempts=state.attempts.slice(-300);
    processed++;
    if(status.complete){
      if(split){
        split.completed.push(id);
        split.pending.shift();
        if(!split.pending.length){
          await finalizeSplitRoot(split,journal,articles);
          if(recovering){rescue.done.push(rootId);rescue.pending.shift()}
          else {state.completed.push(rootId);state.cursor=nextCursor(state.cursor,journals)}
          delete state.activeSplit;
        }
      }else if(recovering){
        await saveJson(STAGE_ROOT+'/batches/'+rootId+'.json',record);
        rescue.done.push(rootId);rescue.pending.shift();
      }else{
        state.completed.push(rootId);
        state.cursor=nextCursor(state.cursor,journals);
      }
    }else if(slices){
      if(split)split.pending.splice(0,1,...slices);
      else state.activeSplit={rootId,rootRange,journalName:journal.name,
        pending:slices,completed:[]};
    }else{blocked=true}
    await saveJson(staging,state);
    console.log('HISTORICAL_STAGING_WINDOW '+JSON.stringify({id,status:record.status,candidates:record.candidateCount,
      alreadyPublished:record.alreadyPublished,unreviewed:record.unreviewed,
      splitPending:state.activeSplit?.pending.length||0,
      recoveringRsc:recovering,rscRechecksRemaining:rescue.pending.length,
      requests:budget.count,errors:status.issues}));
    if(blocked)break;
    await delay(300);
  }
  state.lastRunFinished=new Date().toISOString();
  state.lastRun={processed,blocked,deferredBudget,requests:budget.count,next:state.cursor,
    verifiedPublishedDois:articles.size,completeWindows:state.completed.length,
    activeSplit:state.activeSplit?{
      rootId:state.activeSplit.rootId,
      completedSegments:state.activeSplit.completed.length,
      pendingSegments:state.activeSplit.pending.length
    }:null,
    rscCreatedRecheck:{remaining:state.rscCreatedRescue.pending.length,
      completed:state.rscCreatedRescue.done.length,total:state.rscCreatedRescue.total},
    noPublication:true,noPdf:true};
  await saveJson(staging,state);
  console.log('HISTORICAL_NIGHTLY_SUMMARY '+JSON.stringify(state.lastRun));
  if(blocked)process.exitCode=2;
  return state.lastRun;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{await runNightly()}catch(e){console.error('HISTORICAL_NIGHTLY_BLOCKED',String(e?.message||e));process.exitCode=1}
}
