/**
 * Read-only 2026-Q3 historic DOI and scope backlog reconciliation.
 * Local GitHub staging JSON only. Never call production D1, publisher APIs,
 * academic include/exclude authorizers or any media/PDF writer.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {TARGET_JOURNALS} from '../shared/literature-journals.js';
import {TRIAGE_SCHEMA} from './historical-review-triage.mjs';
export const Q3_SCHEMA='gallery-historical-q3-source-and-scope-v1';
export const MONTHS=Object.freeze(['2026-07','2026-08','2026-09']);
const normalize=s=>String(s||'').trim().toLowerCase();
const ensure=(ok,msg)=>{if(!ok)throw Error(msg)};
const knownDate=(row)=>/^2026-(07|08|09)-\d\d$/.test(row.date||'')
  && !(row.flags||[]).some(x=>[
    'publisher_first_online_date_unverified','discovered_window_date_mismatch',
    'source_publication_date_disagreement'].includes(x));
const validDoi=v=>/^10\.\d{4,9}\/\S+$/.test(v||'');
const rank=v=>/^[P][0-3]$/.test(v||'')?Number(v.slice(1)):3;
const cellId=(journal,month)=>journal+'|'+month;
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-');
const publishedQ3=date=>/^2026-(07|08|09)-\d\d$/.test(date||'');
export function expectedQ3Roots(journals=TARGET_JOURNALS){
  const roots=[];
  for(const month of MONTHS)for(const j of journals){
    const last=new Date(Date.UTC(2026,Number(month.slice(5,7)),0)).getUTCDate();
    for(const [from,to] of [[1,7],[8,14],[15,21],[22,last]]){
      const day=n=>String(n).padStart(2,'0');
      roots.push({id:month+'-'+day(from)+'_'+month+'-'+day(to)+'_'+slug(j.name),
        journal:j.name,month});
    }
  }
  return roots;
}
const cell=(journal,month)=>({journal,month,expectedSourceRoots:4,
  completedSourceRoots:0,formalQ3:0,uniqueSourceCandidates:0,
  apiQ3DatedCandidates:0,undatedOrAmbiguousSourceCandidates:0,
  alreadyPublished:0,approvedWaiting08:0,sourcePending:0,explicitExcluded:0,
  unreviewed:0,publisherResearchIssueComplete:false,
  firstOnlineDateFullyPublisherVerified:false});
export function reconcileQ3({
  state,triage,shards,formal,manifest,corrections,
  journals=TARGET_JOURNALS,limit=320,page=0,reference=1000
}={}){
  ensure(state?.schema==='gallery-historical-nightly-staging-v1'
    &&state.mode==='candidate_discovery_only'&&Array.isArray(state.completed)
    &&triage?.schemaVersion===TRIAGE_SCHEMA
    &&triage.mode==='review_queue_only_not_publication'
    &&triage.rootSummaries&&Array.isArray(shards),
    'q3_untrusted_history_root_authority');
  ensure(Array.isArray(formal?.articles)
    &&formal.articles.length===formal.webpageDoiCount
    &&Array.isArray(manifest?.accepted)&&Array.isArray(manifest?.pending)
    &&Array.isArray(corrections?.items),'q3_invalid_formal_authority');
  ensure(Number.isSafeInteger(limit)&&limit>=1&&limit<=400
    &&Number.isSafeInteger(page)&&page>=0&&page<=10000
    &&reference===1000,'q3_reference_or_page_invalid');

  const expected=expectedQ3Roots(journals),lookup=new Map(expected.map(x=>[x.id,x]));
  const cells=new Map();
  for(const j of journals)for(const month of MONTHS)
    cells.set(cellId(j.name,month),cell(j.name,month));
  const completed=new Set(state.completed);
  ensure(completed.size===state.completed.length,'q3_duplicate_completed_root');
  const missingRoots=expected.filter(x=>!completed.has(x.id)).map(x=>x.id);
  const shardIds=new Set(),all=new Map();
  let occurrences=0;
  for(const shard of shards){
    const spec=lookup.get(shard?.rootId);
    ensure(spec&&completed.has(shard.rootId)&&!shardIds.has(shard.rootId)
      &&shard.schemaVersion===TRIAGE_SCHEMA
      &&shard.mode==='review_queue_only_not_publication'
      &&shard.journal===spec.journal
      &&shard.sourceSha256===triage.rootSummaries[shard.rootId]?.sourceSha256
      &&Array.isArray(shard.records)
      &&shard.stats?.candidateOccurrences===shard.records.length,
      'q3_invalid_review_shard:'+shard?.rootId);
    shardIds.add(shard.rootId);
    cells.get(cellId(spec.journal,spec.month)).completedSourceRoots++;
    occurrences+=shard.records.length;
    for(const row of shard.records){
      const id=normalize(row.doi);
      ensure(validDoi(id)&&row.journal===spec.journal,
        'q3_invalid_source_doi:'+id);
      if(!all.has(id)){
        all.set(id,{...row,doi:id,sourceMonths:[spec.month],
          sourceRoots:[shard.rootId],sourceHashes:[shard.sourceSha256],
          journalConflict:false,dateConflict:false,
          flags:[...new Set(row.flags||[])]});
      }else{
        const old=all.get(id),sameDate=!old.date||!row.date||old.date===row.date;
        const prefer=Boolean(row.date)&&!Boolean(old.date)?row:old;
        all.set(id,{...prefer,doi:id,
          journal:old.journal,sourceMonths:[...new Set([...old.sourceMonths,spec.month])],
          sourceRoots:[...new Set([...old.sourceRoots,shard.rootId])],
          sourceHashes:[...new Set([...old.sourceHashes,shard.sourceSha256])],
          journalConflict:old.journalConflict||row.journal!==old.journal,
          dateConflict:old.dateConflict||!sameDate,
          flags:[...new Set([...(old.flags||[]),...(row.flags||[])])],
        });
      }
    }
  }
  for(const id of completed)if(lookup.has(id)&&!shardIds.has(id))
    throw Error('q3_complete_source_missing_review_shard:'+id);

  const pub=new Set(formal.articles.map(x=>normalize(x.doi)));
  const accepted=new Set(manifest.accepted.map(x=>normalize(x.doi)));
  const pending=new Set(manifest.pending.map(x=>normalize(x.doi)));
  const excluded=new Set(corrections.items.filter(x=>x.decision==='exclude')
    .map(x=>normalize(x.doi)));
  ensure(pub.size===formal.articles.length
    &&accepted.size===manifest.accepted.length
    &&pending.size===manifest.pending.length
    &&![...accepted].some(id=>pending.has(id)),
    'q3_formal_doi_partition_conflict');

  let formalCount=0;
  for(const paper of formal.articles)if(publishedQ3(paper.date)){
    const c=cells.get(cellId(paper.journal,paper.date.slice(0,7)));
    ensure(c,'q3_formal_unknown_journal:'+paper.journal);
    c.formalQ3++;formalCount++;
  }
  const counters={candidateOccurrences:occurrences,uniqueSourceDois:all.size,
    duplicateSourceDoiOccurrences:occurrences-all.size,
    apiDatedQ3Candidates:0,unknownPublisherOnlineDate:0,
    knownOutsideQ3:0,sourceJournalConflicts:0,sourceDateConflicts:0,
    sourceAlreadyPublished:0,sourceApprovedWaiting08:0,sourcePending:0,
    sourceExplicitlyExcluded:0,unfinishedQ3OrDateVerification:0,
    formalQ3Count:formalCount,reviewedQ3Waiting08:0,
    missingFormalQ3FromSource:0,sourceCompletedRoots:shardIds.size,
    expectedSourceRoots:expected.length,missingSourceRoots:missingRoots.length,
    publisherIssueResearchReconciliationComplete:false};
  for(const row of manifest.accepted)
    if(publishedQ3(row.date)&&!pub.has(normalize(row.doi)))
      counters.reviewedQ3Waiting08++;
  for(const p of formal.articles)if(publishedQ3(p.date)&&!all.has(normalize(p.doi)))
    counters.missingFormalQ3FromSource++;

  const unreviewed=[];
  for(const row of all.values()){
    const candidateDateOk=knownDate(row)&&!row.dateConflict;
    const month=candidateDateOk?row.date.slice(0,7):[...row.sourceMonths].sort()[0];
    const c=cells.get(cellId(row.journal,month));
    ensure(c,'q3_source_month_or_journal_invalid:'+row.doi);
    c.uniqueSourceCandidates++;
    if(row.journalConflict)counters.sourceJournalConflicts++;
    if(row.dateConflict)counters.sourceDateConflicts++;
    if(candidateDateOk){
      counters.apiDatedQ3Candidates++;c.apiQ3DatedCandidates++;
    }else if(row.date&&/^\d{4}-\d\d-\d\d$/.test(row.date)
      &&!(row.flags||[]).some(x=>x.includes('unverified')||x.includes('mismatch'))
      &&!row.dateConflict){
      counters.knownOutsideQ3++;
    }else{
      counters.unknownPublisherOnlineDate++;c.undatedOrAmbiguousSourceCandidates++;
    }
    const status=pub.has(row.doi)?'published':
      accepted.has(row.doi)?'approved_waiting08':
      pending.has(row.doi)?'pending_date_or_scope':
      excluded.has(row.doi)?'explicit_excluded':'unfinished';
    if(status==='published'){c.alreadyPublished++;counters.sourceAlreadyPublished++;}
    if(status==='approved_waiting08'){c.approvedWaiting08++;counters.sourceApprovedWaiting08++;}
    if(status==='pending_date_or_scope'){c.sourcePending++;counters.sourcePending++;}
    if(status==='explicit_excluded'){c.explicitExcluded++;counters.sourceExplicitlyExcluded++;}
    if(status!=='unfinished')continue;
    // An unquestionably out-of-Q3 first-online date remains in the global
    // historical backlog; a source-created date is NEVER guessed as online.
    if(!candidateDateOk&&row.date&&/^\d{4}-\d\d-\d\d$/.test(row.date)
      &&!(row.flags||[]).length&&!row.dateConflict)continue;
    c.unreviewed++;counters.unfinishedQ3OrDateVerification++;
    unreviewed.push({doi:row.doi,journal:row.journal,
      sourceWindowMonth:month,apiDateCandidate:candidateDateOk?row.date:'',
      publisherFirstOnlineDateVerified:false,title:row.title,
      firstAuthor:(row.authors||[])[0]||'',priority:row.priority||'P3',
      flags:[...new Set([...(row.flags||[]),
        ...(row.dateConflict?['date_conflict']:[]),
        ...(row.journalConflict?['journal_conflict']:[])])],
      sourceRootIds:row.sourceRoots,sourceHashes:row.sourceHashes,
      scopeReview:'not_started_requires_independent_two_pass',
      publicationAuthority:false});
  }
  const buckets=new Map([...cells.keys()].map(x=>[x,{normal:[],low:[]}]));
  for(const row of unreviewed){
    const bin=buckets.get(cellId(row.journal,row.sourceWindowMonth));
    (rank(row.priority)>=3?bin.low:bin.normal).push(row);
  }
  for(const b of buckets.values()){
    const cmp=(x,y)=>rank(x.priority)-rank(y.priority)
      ||(y.apiDateCandidate||'').localeCompare(x.apiDateCandidate||'')
      ||x.doi.localeCompare(y.doi);
    b.normal.sort(cmp);b.low.sort(cmp);
  }
  const allOrdered=[];let round=0;
  while(allOrdered.length<unreviewed.length){
    let progress=false;
    for(const key of cells.keys()){
      const b=buckets.get(key);
      const takeLow=round%9===8&&b.low.length>0;
      const next=takeLow?b.low.shift():(b.normal.shift()||b.low.shift());
      if(next){allOrdered.push(next);progress=true;}
    }
    if(!progress)break;round++;
  }
  ensure(allOrdered.length===unreviewed.length&&
    new Set(allOrdered.map(x=>x.doi)).size===allOrdered.length,
    'q3_review_allocation_incomplete');
  const first=page*limit,selected=allOrdered.slice(first,first+limit);
  const byJournal={},byMonth={},byPriority={};let requiringDate=0;
  for(const item of selected){
    byJournal[item.journal]=(byJournal[item.journal]||0)+1;
    byMonth[item.sourceWindowMonth]=(byMonth[item.sourceWindowMonth]||0)+1;
    byPriority[item.priority]=(byPriority[item.priority]||0)+1;
    if(!item.apiDateCandidate)requiringDate++;
  }
  const generatedAt=new Date().toISOString();
  const coverage={schemaVersion:Q3_SCHEMA,generatedAt,period:'2026-07-01..2026-09-30',
    scope:'all_sixteen_journals_source_candidates_not_scope_approved',
    counters,sourceRootsCompleted:shardIds.size,sourceMissingRootIds:missingRoots,
    sourceStateCursor:state.cursor,
    byJournalMonth:[...cells.values()],
    reference:{hypothesis1000PerQuarter:reference,formalMinusHypothesis:formalCount-reference,
      notAutomaticInclusionTarget:true,actualMissingEligibleCountUnknown:true},
    guards:{noD1QueriesOrWrites:true,noMediaOrPdfAcquisition:true,
      noAutoInclusionOrExclusion:true,noEightEveningRelease:true,
      publisherOnlineDateNotEqualsCreatedDate:true,
      officialPublisherIssueCompletenessNotEstablished:true}};
  const worklist={schemaVersion:Q3_SCHEMA,generatedAt,mode:'bounded_review_queue_not_admission',
    page,pageSize:limit,totalPages:Math.ceil(unreviewed.length/limit),
    totalUnreviewedCandidates:unreviewed.length,
    selected:selected.length,nextPage:first+selected.length<allOrdered.length?page+1:null,
    byJournal,byMonth,byPriority,requiringDateVerification:requiringDate,
    sourceWindowsComplete:missingRoots.length===0,
    rows:selected,noAutomaticAcademicDecision:true,noCloudflareD1Access:true};
  return {coverage,worklist};
}
async function readJson(file){return JSON.parse(await readFile(file,'utf8'));}
async function writeAtomic(file,data){
  await mkdir(dirname(file),{recursive:true});
  const tmp=file+'.tmp.'+process.pid;
  await writeFile(tmp,JSON.stringify(data,null,2)+'\n');
  await rename(tmp,file);
}
export async function runQuarterAudit({
  root='audit/historical-staging',
  page=Number(process.env.HISTORICAL_Q3_REVIEW_PAGE||0)
}={}){
  ensure(process.env.HISTORICAL_STAGING_ONLY==='1'&&
    process.env.HISTORICAL_STAGING_BRANCH==='1','q3_staging_only_guard');
  const [state,triage,formal,manifest,corrections]=await Promise.all([
    readJson(root+'/state.json'),readJson(root+'/review-triage-ledger.json'),
    readJson('public/toc-demand-live.json'),
    readJson('audit/historical-reviewed/approved-admissions.json'),
    readJson('audit/literature-scope-corrections.json')
  ]);
  const relevant=new Set(expectedQ3Roots().map(x=>x.id)),shards=[];
  for(const id of state.completed)if(relevant.has(id))
    shards.push(await readJson(root+'/review-queue/'+id+'.json'));
  const {coverage,worklist}=reconcileQ3({
    state,triage,shards,formal,manifest,corrections,page
  });
  await writeAtomic(root+'/quarter-2026-q3-coverage.json',coverage);
  await writeAtomic(root+'/quarter-2026-q3-review-worklist.json',worklist);
  console.log('HISTORICAL_Q3_AUDIT '+JSON.stringify({
    sourceRoots:coverage.counters.sourceCompletedRoots,
    sourceExpected:coverage.counters.expectedSourceRoots,
    formalQ3:coverage.counters.formalQ3Count,
    sourceDois:coverage.counters.uniqueSourceDois,
    unknownOnlineDate:coverage.counters.unknownPublisherOnlineDate,
    worklist:worklist.selected,worklistPage:page,
    zeroD1:true,noPublication:true
  }));
  return {coverage,worklist};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  runQuarterAudit().catch(e=>{console.error('HISTORICAL_Q3_BLOCKED',String(e?.message||e));process.exitCode=1});
