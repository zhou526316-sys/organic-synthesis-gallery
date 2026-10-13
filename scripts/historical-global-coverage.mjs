/**
 * DOI-deduplicated source/review ledger across all historical staging roots.
 * This never determines academic scope, modifies the formal catalog,
 * or asserts completeness of a publisher's issue collection.
 */
import {readFile,mkdir,rename,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {TARGET_JOURNALS} from '../shared/literature-journals.js';
import {HISTORICAL_FOUNDATIONS,historicalPeriodApplicable} from '../shared/historical-journal-founding.mjs';
import {START,previousPeriod} from './historical-nightly-discovery.mjs';
import {TRIAGE_SCHEMA} from './historical-review-triage.mjs';
export const COVERAGE_SCHEMA='gallery-historical-global-coverage-v1';
const ROOT='audit/historical-staging';
const countNew=()=>({candidateOccurrences:0,distinctCandidateDois:0,
  alreadyPublished:0,approvedAwaiting08:0,evidencePending:0,requiresTwoPassReview:0,
  ambiguousStatus:0,unverifiedPublicationDate:0,suspectedNonresearch:0});
const norm=s=>String(s||'').trim().toLowerCase();
const sha256=s=>createHash('sha256').update(s).digest('hex');
const statuses=['already_published','two_pass_approved_awaiting_08',
  'evidence_pending','requires_two_pass_review'];
function addWindow(period,group){
  if(!group)throw Error('missing_historical_group');
  if(!Number.isSafeInteger(group.plannedRoots)||group.plannedRoots<0)throw Error('bad_historical_group');
  group.plannedRoots++;
}
export function historicalYearPlan(journals=TARGET_JOURNALS,{from=START,floor='1850-01-01'}={}){
  const map=new Map();
  for(const j of journals){
    if(!HISTORICAL_FOUNDATIONS[j.name])throw Error('historical_founding_missing:'+j.name);
    map.set(j.name,new Map());
  }
  let period=from,guard=0;
  while(period&&period.to>=floor){
    if(++guard>1000)throw Error('historical_range_iteration_did_not_end');
    for(const j of journals){
      const year=period.from.slice(0,4);
      const byYear=map.get(j.name);
      if(!byYear.has(year))byYear.set(year,{journal:j.name,sourceWindowYear:year,
        foundedYear:HISTORICAL_FOUNDATIONS[j.name].year,plannedRoots:0,completedRoots:0,
        queuedRoots:0,sourceCandidateOccurrences:0,
        distinctCandidateDois:0,missingPublisherIssueReconciliation:true,
        missingNoDoiIssueCoverage:true});
      if(historicalPeriodApplicable(j,period))addWindow(period,byYear.get(year));
    }
    period=previousPeriod(period);
  }
  return map;
}
export function mergeHistoricalReviewShards(state,triage,shards,{journals=TARGET_JOURNALS}={}){
  if(state?.schema!=='gallery-historical-nightly-staging-v1'
    ||state.mode!=='candidate_discovery_only'||!Array.isArray(state.completed)
    ||triage?.schemaVersion!==TRIAGE_SCHEMA||triage.mode!=='review_queue_only_not_publication'
    ||!triage.rootSummaries||!Array.isArray(shards))throw Error('untrusted_global_history_snapshot');
  const completed=new Set(state.completed);
  if(completed.size!==state.completed.length)throw Error('duplicate_completed_historical_roots');
  const byYear=historicalYearPlan(journals);
  const statusesByDoi=new Map(),journalYears=new Map();
  const existingShards=new Set();
  const counters=countNew();
  const rootTotals={};
  for(const journal of journals)rootTotals[journal.name]={
    journal:journal.name,foundedYear:HISTORICAL_FOUNDATIONS[journal.name].year,
    plannedRoots:0,sourceCompleteRoots:0,queuedRoots:0};
  const countYears=()=>[...byYear.values()].flatMap(x=>[...x.values()]);
  for(const year of countYears())rootTotals[year.journal].plannedRoots+=year.plannedRoots;
  for(const id of completed){
    const parts=/^(\d{4}-\d\d-\d\d)_(\d{4}-\d\d-\d\d)_([a-z-]+)$/.exec(id);
    if(!parts)throw Error('invalid_history_completed_root:'+id);
    const journal=journalNameBySlug(parts[3],journals);
    if(!journal)throw Error('unrecognized_history_root_journal:'+id);
    const year=parts[1].slice(0,4),group=byYear.get(journal).get(year);
    if(!group||group.plannedRoots<1)throw Error('completed_root_outside_founder_plan:'+id);
    group.completedRoots++;
    rootTotals[journal].sourceCompleteRoots++;
  }
  for(const item of shards){
    if(!completed.has(item.rootId)||existingShards.has(item.rootId))
      throw Error('orphan_or_duplicate_historical_review_shard:'+item.rootId);
    existingShards.add(item.rootId);
    const row=triage.rootSummaries[item.rootId];
    if(!row||row.sourceSha256!==item.sourceSha256
      ||item.schemaVersion!==TRIAGE_SCHEMA||item.mode!=='review_queue_only_not_publication'
      ||!Array.isArray(item.records)||item.stats?.candidateOccurrences!==item.records.length)
      throw Error('historical_triage_shard_or_source_hash_invalid:'+item.rootId);
    const parts=/^(\d{4}-\d\d-\d\d)_(\d{4}-\d\d-\d\d)_([a-z-]+)$/.exec(item.rootId);
    const group=byYear.get(item.journal)?.get(parts?.[1]?.slice(0,4));
    if(!group||group.completedRoots<1)throw Error('historical_shard_not_in_root_year:'+item.rootId);
    rootTotals[item.journal].queuedRoots++;
    group.queuedRoots++;
    group.sourceCandidateOccurrences+=item.records.length;
    counters.candidateOccurrences+=item.records.length;
    const setKey=item.journal+'|'+parts[1].slice(0,4);
    if(!journalYears.has(setKey))journalYears.set(setKey,new Set());
    const scoped=journalYears.get(setKey);
    for(const paper of item.records){
      const doi=norm(paper.doi);
      if(!/^10\.\d{4,9}\/\S+$/.test(doi)||!statuses.includes(paper.status))
        throw Error('historical_coverage_untrusted_record:'+doi);
      scoped.add(doi);
      if(!statusesByDoi.has(doi))statusesByDoi.set(doi,{
        statuses:new Set(),journals:new Set(),flags:new Set(),sourceRoots:new Set()});
      const stateRow=statusesByDoi.get(doi);
      stateRow.statuses.add(paper.status);
      stateRow.journals.add(item.journal);
      stateRow.sourceRoots.add(item.rootId);
      for(const flag of paper.flags||[])stateRow.flags.add(flag);
    }
  }
  for(const [key,set]of journalYears){
    const [journal,year]=key.split('|');
    byYear.get(journal).get(year).distinctCandidateDois=set.size;
  }
  for(const row of statusesByDoi.values()){
    counters.distinctCandidateDois++;
    if(row.statuses.size!==1){counters.ambiguousStatus++;continue;}
    const st=[...row.statuses][0];
    if(st==='already_published')counters.alreadyPublished++;
    if(st==='two_pass_approved_awaiting_08')counters.approvedAwaiting08++;
    if(st==='evidence_pending')counters.evidencePending++;
    if(st==='requires_two_pass_review')counters.requiresTwoPassReview++;
    if(row.flags.has('publisher_first_online_date_unverified'))
      counters.unverifiedPublicationDate++;
    if(row.flags.has('suspected_nonresearch_record_verify_at_publisher'))
      counters.suspectedNonresearch++;
  }
  const yearly=[];
  for(const j of journals)for(const year of byYear.get(j.name).values()){
    if(year.plannedRoots){
      yearly.push({...year,
        outstandingRoots:year.plannedRoots-year.completedRoots,
        sourceCoverageStatus:year.completedRoots===year.plannedRoots?'source_api_windows_complete_publisher_unverified':'incomplete_source_api_windows',
        candidateCountsAreScopeDecisions:false,
      });
    }
  }
  const expected=Object.values(rootTotals).reduce((n,x)=>n+x.plannedRoots,0);
  const complete=state.completed.length;
  const queued=existingShards.size;
  const stale=state.completed.filter(x=>!existingShards.has(x)).length;
  const totalStatus=counters.alreadyPublished+counters.approvedAwaiting08+
    counters.evidencePending+counters.requiresTwoPassReview+counters.ambiguousStatus;
  if(totalStatus!==counters.distinctCandidateDois)
    throw Error('historical_distinct_statuses_do_not_reconcile');
  return {
    schemaVersion:COVERAGE_SCHEMA,
    mode:'candidate_discovery_and_review_coverage_only',
    generatedAt:new Date().toISOString(),
    sourceCompletedAt:state.lastRunFinished||null,
    currentCursor:state.cursor||null,
    scannedPeriodStart:START,
    stageSchema:state.schema,triageSchema:triage.schemaVersion,
    counters:{...counters,
      duplicateDoiOccurrences:counters.candidateOccurrences-counters.distinctCandidateDois,
      sourcePlannedRoots:expected,sourceCompletedRoots:complete,
      reviewQueueRoots:queued,completedRootsWithoutQueue:stale,
      publisherIssueMatchedRoots:0,noDoiArchiveSourceComplete:false,
      full16JournalIssueCoverage:false},
    journals:rootTotals,
    yearly,
    guards:{reviewOrPublicationWrites:false,publisherIssueCompletenessUnknown:true,
      DOIlessLegacyNotScanned:true,publisherLicensesNotResolved:true,
      keywordSignalsNeverExclude:true,sourceApiCompleteNotPublisherComplete:true},
  };
}
function journalNameBySlug(slug,journals){
  return journals.find(x=>x.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')===slug)?.name;
}
export async function runHistoricalCoverage({root=ROOT}={}){
  if(process.env.HISTORICAL_STAGING_ONLY!=='1'
    ||process.env.HISTORICAL_STAGING_BRANCH!=='1')
    throw Error('historical_coverage_staging_only_guard_required');
  const [state,triage]=await Promise.all([
    readFile(root+'/state.json','utf8').then(JSON.parse),
    readFile(root+'/review-triage-ledger.json','utf8').then(JSON.parse)]);
  const shards=[];
  for(const id of state.completed){
    if(!triage.rootSummaries[id])continue;
    const raw=await readFile(root+'/review-queue/'+id+'.json','utf8');
    const shard=JSON.parse(raw);
    // Preserve exact batch SHA in the shard/ledger, but never modify or copy publisher media.
    shards.push(shard);
  }
  const output=mergeHistoricalReviewShards(state,triage,shards);
  const dest=root+'/global-coverage-ledger.json';
  await mkdir(dirname(dest),{recursive:true});
  const temp=dest+'.tmp.'+process.pid;
  await writeFile(temp,JSON.stringify(output,null,2)+'\n','utf8');
  await rename(temp,dest);
  console.log('HISTORICAL_GLOBAL_COVERAGE '+JSON.stringify({
    generatedAt:output.generatedAt,distinct:output.counters.distinctCandidateDois,
    occurrences:output.counters.candidateOccurrences,
    complete:output.counters.sourceCompletedRoots,
    total:output.counters.sourcePlannedRoots,
    queued:output.counters.reviewQueueRoots,
    issuerowsVerified:output.counters.publisherIssueMatchedRoots,
    noDoiComplete:false,noFormalPublication:true
  }));
  return output;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  runHistoricalCoverage().catch(e=>{console.error('HISTORICAL_COVERAGE_BLOCKED',String(e?.message||e));process.exitCode=1});
