/**
 * Read-only 2026-Q3 historic DOI and scope backlog reconciliation.
 * Local GitHub staging JSON only. Never call production D1, publisher APIs,
 * academic include/exclude authorizers or any media/PDF writer.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {verifyHistoricalReviewerStatusRefresh} from './historical-q3-reviewer-status-refresh.mjs';
import {bindReviewedQ3ScopeProof,EMPTY_REVIEWED_SCOPE,REVIEWED_SCOPE_AUTHORITY_SCHEMA} from './historical-q3-reviewed-scope-proof.mjs';
import {TARGET_JOURNALS} from '../shared/literature-journals.js';
import {TRIAGE_SCHEMA} from './historical-review-triage.mjs';
export const Q3_SCHEMA='gallery-historical-q3-source-and-scope-v1';
export const PUBLISHER_NONRESEARCH_SCHEMA='gallery-historical-q3-publisher-type-exclusions-v1';
export const CHEM_ONLINE_DATE_SCHEMA='gallery-historical-chem-first-online-date-proof-v1';
export const EMPTY_CHEM_ONLINE_DATES=Object.freeze({
  schemaVersion:CHEM_ONLINE_DATE_SCHEMA,
  mode:'publisher_first_online_provenance_only_not_admission',rows:[]
});
export const EMPTY_PUBLISHER_NONRESEARCH=Object.freeze({
  schemaVersion:PUBLISHER_NONRESEARCH_SCHEMA,
  mode:'publisher_verified_non_original_doi_only_not_publication',
  reviewed:[]
});
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
  publisherNonResearchExcluded:0,
  publisherReviewedScopeExcluded:0,publisherReviewedScopePending:0,
  publisherDateDiscrepancies:0,publisherVerifiedOutsideQ3:0,
  unreviewed:0,publisherResearchIssueComplete:false,
  firstOnlineDateFullyPublisherVerified:false});
export function reconcileQ3({
  state,triage,shards,formal,manifest,corrections,
  publisherNonResearch=EMPTY_PUBLISHER_NONRESEARCH,
  publisherReviewedScope=EMPTY_REVIEWED_SCOPE,
  chemPublisherDates=EMPTY_CHEM_ONLINE_DATES,
  reviewerQueueHistoricalBlobAliasesByRoot=new Map(),
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
  ensure(publisherNonResearch?.schemaVersion===PUBLISHER_NONRESEARCH_SCHEMA
    &&publisherNonResearch.mode==='publisher_verified_non_original_doi_only_not_publication'
    &&Array.isArray(publisherNonResearch.reviewed),
    'q3_nonresearch_ledger_untrusted_schema');
  ensure(publisherReviewedScope?.schemaVersion===REVIEWED_SCOPE_AUTHORITY_SCHEMA
    &&publisherReviewedScope.mode==='scientific_review_and_source_identity_only_not_publication'
    &&Array.isArray(publisherReviewedScope.reviewed),
    'q3_reviewed_scope_untrusted_adapter');
  ensure(chemPublisherDates?.schemaVersion===CHEM_ONLINE_DATE_SCHEMA
    &&chemPublisherDates.mode==='publisher_first_online_provenance_only_not_admission'
    &&Array.isArray(chemPublisherDates.rows),
    'q3_chem_publisher_date_untrusted_schema');
  ensure(reviewerQueueHistoricalBlobAliasesByRoot instanceof Map
    &&[...reviewerQueueHistoricalBlobAliasesByRoot].every(([rootId,aliases])=>
      typeof rootId==='string'&&aliases instanceof Set
      &&aliases.size>0&&aliases.size<=5
      &&[...aliases].every(sha=>/^[0-9a-f]{40}$/.test(sha))),
    'q3_review_queue_historical_blob_aliases_untrusted');
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
  const shardIds=new Set(),all=new Map(),gitBlobByRoot=new Map();
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
    if(shard.gitBlobSha)gitBlobByRoot.set(shard.rootId,new Set([
      shard.gitBlobSha,
      ...(reviewerQueueHistoricalBlobAliasesByRoot.get(shard.rootId)||new Set())
    ]));
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

  // Exact publisher-verified commentary exclusions; never keyword inference.
  // Each exclusion is separate from the owner's permanent DOI corrections.
  const publisherNonOriginal=new Set();
  const allowedArticleTypes=new Set(['News & Views','Research Highlight','Research Briefing',
    'Comment','Publisher Correction','Author Correction','Review Article','Editorial','Perspective','Q&A',
    'In Your Element','Thesis','Books & Arts']);
  for(const item of publisherNonResearch.reviewed){
    const id=normalize(item?.doi),src=all.get(id),ev=item?.reviewEvidence;
    ensure(validDoi(id)&&id===item.doi&&src&&!publisherNonOriginal.has(id)
      &&!pub.has(id)&&!accepted.has(id)&&!pending.has(id)&&!excluded.has(id),
      'q3_nonresearch_doi_missing_or_colliding:'+id);
    let url;
    try{url=new URL(ev?.publisherPage||'')}catch{url=null}
    const host=url?.hostname||'',path=url?.pathname.toLowerCase()||'';
    const isOfficial=host==='www.nature.com'||host==='nature.com'
      ? path==='/articles/'+id.split('/')[1]
      : host==='pubs.acs.org'
        ? path.includes('/doi/'+id)
        : false;
    ensure(isOfficial&&allowedArticleTypes.has(ev?.publisherArticleType)
      &&ev?.publisherArticleType===item.publisherArticleType
      &&item.decision==='exclude'&&item.firstPassDecision==='exclude'
      &&item.challengeDecision==='exclude'&&item.reviewPasses===2
      &&typeof item.firstPassReason==='string'&&item.firstPassReason.trim().length>=40
      &&typeof item.independentChallengeReason==='string'
      &&item.independentChallengeReason.trim().length>=40
      &&item.firstPassReason!==item.independentChallengeReason
      &&item.date===src.date&&ev?.publisherArticleDate===item.date
      &&src.sourceRoots.includes(ev.sourceRootId)
      &&src.sourceHashes.includes(ev.stageSourceSha256)
      &&/^[a-f0-9]{40}$/.test(ev.stageBatchGitBlobSha||'')
      &&(!ev.sourceReviewQueueGitBlobSha||(
        gitBlobByRoot.get(ev.sourceRootId)?.has(ev.sourceReviewQueueGitBlobSha)
        &&ev.sourceReviewQueuePath===
          'audit/historical-staging/review-queue/'+ev.sourceRootId+'.json'
        &&item.title===src.title))
      &&ev.verificationKind==='publisher_direct_article_type_and_original_work_provenance',
      'q3_nonresearch_publisher_evidence_invalid:'+id);
    publisherNonOriginal.add(id);
  }

  // Publisher original-research science verdicts are separate from owner corrections,
  // publisher nonresearch categories and the original approval/pending manifest.
  const reviewedScope=new Map();
  for(const proof of publisherReviewedScope.reviewed){
    const id=normalize(proof?.doi),a=proof?.assessment,source=all.get(id);
    const path='/articles/'+id.split('/')[1];
    let url;
    try{url=new URL(proof?.publisherPage||'')}catch{url=null}
    const articleUrlValid=['www.nature.com','nature.com'].includes(url?.hostname)
      &&url?.pathname===path;
    const validScience=proof?.scientificDecision===a?.decision
      &&['exclude','pending'].includes(a?.decision)
      &&a.firstPassDecision===a.decision&&a.challengeDecision===a.decision
      &&a.reviewPasses===2&&a.date===proof.date
      &&a.publisherArticleType===proof.publisherArticleType
      &&a.publisherPage===proof.publisherPage
      &&['Article','Analysis'].includes(a.publisherArticleType)
      &&['primaryContribution','preparativeTransformation','generalityEvidence']
        .every(k=>typeof a[k]==='string'&&a[k].trim().length>=10)
      &&['firstPassReason','independentChallengeReason']
        .every(k=>typeof a[k]==='string'&&a[k].trim().length>=40)
      &&a.firstPassReason!==a.independentChallengeReason
      &&(a.decision!=='pending'||(
        a.missingEvidenceMustNotMeanNoEvidenceExists===true
        &&typeof a.nextAction==='string'&&a.nextAction.length>=40));
    ensure(source&&!reviewedScope.has(id)&&validScience&&articleUrlValid
      &&proof.doi===id&&proof.journal===source.journal
      &&proof.date===source.date&&knownDate(source)&&!source.dateConflict
      &&!source.journalConflict
      &&source.sourceRoots.includes(proof.sourceRootId)
      &&source.sourceHashes.includes(proof.stageSourceSha256)
      &&gitBlobByRoot.get(proof.sourceRootId)?.has(proof.stageBatchGitBlobSha)
      &&proof.sourceShardPath==='audit/historical-staging/review-queue/'+proof.sourceRootId+'.json'
      &&proof.sourceFamilies.every(f=>(source.sourceFamilies||[]).includes(f))
      &&!pub.has(id)&&!accepted.has(id)&&!pending.has(id)
      &&!excluded.has(id)&&!publisherNonOriginal.has(id),
      'q3_reviewed_scope_provenance_or_science_conflict:'+id);
    reviewedScope.set(id,proof);
  }

  // Correct dates are publisher-first-online evidence, not a mutation of
  // frozen Crossref/OpenAlex source roots or an academic include decision.
  const correctedChemDates=new Map();
  for(const r of chemPublisherDates.rows){
    const id=normalize(r?.doi),x=all.get(id);
    let publisherUrl,doiUrl;
    try{
      publisherUrl=new URL(r?.officialPublisherArticlePage||'');
      doiUrl=new URL(r?.doiResolver||'');
    }catch{publisherUrl=null;doiUrl=null;}
    const validPage=publisherUrl?.protocol==='https:'
      &&publisherUrl.hostname==='www.sciencedirect.com'
      &&/^\/science\/article\/pii\/S2451929426\d{7}$/.test(publisherUrl.pathname)
      &&doiUrl?.href==='https://doi.org/'+id;
    const dateOk=/^2026-\d{2}-\d{2}$/.test(r?.publisherFirstOnlineDate||'')
      &&r.publisherFirstOnlineDate!==r.sourceDate
      &&new Date(r.publisherFirstOnlineDate+'T00:00:00Z').toISOString().slice(0,10)===r.publisherFirstOnlineDate;
    ensure(x&&!correctedChemDates.has(id)
      &&id===r.doi&&x.journal==='Chem'&&x.title===r.title
      &&x.date===r.sourceDate&&knownDate(x)&&!x.dateConflict
      &&r.journal==='Chem'&&r.publisherArticleType==='Research article'
      &&r.originalDateFrozenAndUnmodified===true
      &&r.publisherEvidenceDateOverrulesSourceForQuarter===true
      &&r.originalQ3QueueOrigin&&x.sourceRoots.includes(r.originalQ3QueueOrigin)
      &&x.sourceHashes.includes(r.sourceRootSha256)
      &&gitBlobByRoot.get(r.originalQ3QueueOrigin)?.has(r.reviewQueueGitBlobSha)
      &&r.reviewQueuePath==='audit/historical-staging/review-queue/'+r.originalQ3QueueOrigin+'.json'
      &&/^[0-9a-f]{40}$/.test(r.originalSourceBatchGitBlobSha||'')
      &&validPage&&dateOk
      &&!pub.has(id)&&!pending.has(id)&&!excluded.has(id)
      &&!publisherNonOriginal.has(id)&&!reviewedScope.has(id),
      'q3_chem_publisher_date_provenance_conflict:'+id);
    const inQ3=publishedQ3(r.publisherFirstOnlineDate);
    ensure(r.verifiedPublicationQuarter===(inQ3?'2026-Q3':'2026-Q1'),
      'q3_chem_publisher_quarter_mismatch:'+id);
    const admission=manifest.accepted.find(a=>normalize(a.doi)===id);
    if(inQ3){
      ensure(admission?.journal==='Chem'
        &&admission.reviewPasses===2&&admission.decision==='include'
        &&admission.firstPassDecision==='include'
        &&admission.challengeDecision==='include'
        &&admission.date===r.publisherFirstOnlineDate
        &&admission.reviewEvidence?.publisherOnlineDate===r.publisherFirstOnlineDate
        &&admission.reviewEvidence?.firstOnlineDateEvidence?.stageApiDate===r.sourceDate
        &&admission.reviewEvidence?.stageBatchSha===r.originalSourceBatchGitBlobSha
        &&admission.reviewEvidence?.sourceReviewQueueGitBlobSha===r.reviewQueueGitBlobSha,
        'q3_chem_date_conflict_missing_approved_science:'+id);
    }else{
      ensure(!accepted.has(id),
        'q3_chem_pre_q3_original_cannot_be_admitted_as_q3:'+id);
    }
    correctedChemDates.set(id,r);
  }

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
    sourceExplicitlyExcluded:0,sourcePublisherNonResearchExcluded:0,
    sourcePublisherReviewedScopeExcluded:0,sourcePublisherReviewedScopePending:0,
    sourcePublisherDateDiscrepancies:0,sourcePublisherVerifiedOutsideQ3:0,
    unfinishedQ3OrDateVerification:0,
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
    const officialChem=correctedChemDates.get(row.doi);
    if(officialChem){
      counters.sourcePublisherDateDiscrepancies++;c.publisherDateDiscrepancies++;
    }
    const status=pub.has(row.doi)?'published':
      accepted.has(row.doi)?'approved_waiting08':
      pending.has(row.doi)?'pending_date_or_scope':
      excluded.has(row.doi)?'explicit_excluded':
      publisherNonOriginal.has(row.doi)?'publisher_nonresearch_excluded':
      reviewedScope.get(row.doi)?.scientificDecision==='exclude'?'publisher_science_excluded':
      reviewedScope.get(row.doi)?.scientificDecision==='pending'?'publisher_science_pending':
      officialChem&&!publishedQ3(officialChem.publisherFirstOnlineDate)?'publisher_verified_outside_Q3':'unfinished';
    if(status==='published'){c.alreadyPublished++;counters.sourceAlreadyPublished++;}
    if(status==='approved_waiting08'){c.approvedWaiting08++;counters.sourceApprovedWaiting08++;}
    if(status==='pending_date_or_scope'){c.sourcePending++;counters.sourcePending++;}
    if(status==='explicit_excluded'){c.explicitExcluded++;counters.sourceExplicitlyExcluded++;}
    if(status==='publisher_nonresearch_excluded'){
      c.publisherNonResearchExcluded++;counters.sourcePublisherNonResearchExcluded++;
    }
    if(status==='publisher_science_excluded'){
      c.publisherReviewedScopeExcluded++;counters.sourcePublisherReviewedScopeExcluded++;
    }
    if(status==='publisher_science_pending'){
      c.publisherReviewedScopePending++;counters.sourcePublisherReviewedScopePending++;
    }
    if(status==='publisher_verified_outside_Q3'){
      c.publisherVerifiedOutsideQ3++;counters.sourcePublisherVerifiedOutsideQ3++;
    }
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
      officialPublisherIssueCompletenessNotEstablished:true,
      publisherNonResearchExclusionsAreDOISpecificOnly:true,
      publisherResearchScienceAssessmentNotOwnerPermanentExclusion:true,
      publisherResearchEvidencePendingNotApproved:true,
      officialChemFirstOnlineNeverOverwritesFrozenSources:true}};
  const worklist={schemaVersion:Q3_SCHEMA,generatedAt,mode:'bounded_review_queue_not_admission',
    page,pageSize:limit,totalPages:Math.ceil(unreviewed.length/limit),
    totalUnreviewedCandidates:unreviewed.length,
    selected:selected.length,nextPage:first+selected.length<allOrdered.length?page+1:null,
    byJournal,byMonth,byPriority,requiringDateVerification:requiringDate,
    sourceWindowsComplete:missingRoots.length===0,
    rows:selected,noAutomaticAcademicDecision:true,noCloudflareD1Access:true,
    verifiedPublisherNonResearchExcluded:counters.sourcePublisherNonResearchExcluded,
    verifiedPublisherScopeExcluded:counters.sourcePublisherReviewedScopeExcluded,
    verifiedPublisherScopeEvidencePending:counters.sourcePublisherReviewedScopePending,
    publisherOnlineDateCorrections:[...correctedChemDates.values()].map(r=>({doi:r.doi,
      stageSourceDate:r.sourceDate,publisherFirstOnlineDate:r.publisherFirstOnlineDate,
      verifiedPublicationQuarter:r.verifiedPublicationQuarter,
      evidenceUrl:r.officialPublisherArticlePage,sourceRootId:r.originalQ3QueueOrigin})),
    publisherScopeEvidencePending:publisherReviewedScope.reviewed
      .filter(x=>x.scientificDecision==='pending').map(x=>({
        doi:x.doi,journal:x.journal,publisherFirstOnlineDate:x.date,
        evidenceNeeded:x.assessment.generalityEvidence,
        nextAction:x.assessment.nextAction,
        sourceRootId:x.sourceRootId,notOriginalManifestPending:true
      }))};
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
  const [state,triage,formal,manifest,corrections,oldNonOriginal,
    scopedSourceProof,scopedScience,newNonOriginal,lateFiveProof,lateFiveScience,
    residualSourceProof,natsynthFrozen,natsynthTypes,natsynthNonOriginal,
    natsynthScienceProof,natsynthScience,nchemCensus,nchemFrozen,
    nchemNonOriginal,nchemScopeProof,nchemScopeScience,nchemFullScience,
    chemPublisherDates]=await Promise.all([
    readJson(root+'/state.json'),readJson(root+'/review-triage-ledger.json'),
    readJson('public/toc-demand-live.json'),
    readJson('audit/historical-reviewed/approved-admissions.json'),
    readJson('audit/literature-scope-corrections.json'),
    readJson('audit/historical-reviewed/q3-publisher-nonresearch-exclusions.json'),
    readJson('audit/historical-reviewed/q3-natcatal-scope-source-proof.json'),
    readJson('audit/historical-scope-assessments/2026-10-14-nature-catalysis-issues-07-09.json'),
    readJson('audit/historical-reviewed/q3-natcatal-nonoriginal-19-two-pass.json'),
    readJson('audit/historical-reviewed/q3-natcatal-late-online-five-source-proof.json'),
    readJson('audit/historical-scope-assessments/2026-10-14-natcatal-late-online-five.json'),
    readJson('audit/historical-reviewed/q3-natcatal-unfinished-24-source-proof.json'),
    readJson('audit/historical-reviewed/q3-natsynth-44-frozen-source-proof.json'),
    readJson('audit/historical-reviewed/q3-natsynth-publisher-types-44.json'),
    readJson('audit/historical-reviewed/q3-natsynth-nonoriginal-31-two-pass.json'),
    readJson('audit/historical-reviewed/q3-natsynth-13-article-source-proof.json'),
    readJson('audit/historical-scope-assessments/2026-10-14-natsynth-13-original-two-pass.json'),
    readJson('audit/historical-publisher-issues/2026/nature-chemistry-q3-2026-all-types-66.json'),
    readJson('audit/historical-reviewed/q3-nchem-51-frozen-source-proof.json'),
    readJson('audit/historical-reviewed/q3-nchem-27-nonoriginal-two-pass.json'),
    readJson('audit/historical-reviewed/q3-nchem-21-scope-source-proof.json'),
    readJson('audit/historical-scope-assessments/2026-10-14-nchem-21-excluded-pending.json'),
    readJson('audit/historical-scope-assessments/2026-10-14-nchem-24-original-two-pass.json'),
    readJson('audit/historical-publisher-dates/2026/chem-five-first-online-reconciled.json')
  ]);
  const scienceBytes=await readFile(scopedSourceProof.scientificEvidenceFile);
  const scienceGitBlobSha=createHash('sha1').update('blob '+scienceBytes.length).update(Buffer.from([0])).update(scienceBytes).digest('hex');
  const priorReviewedScope=bindReviewedQ3ScopeProof({
    proof:scopedSourceProof,science:scopedScience,scienceGitBlobSha
  });
  const lateBytes=await readFile(lateFiveProof.scientificEvidenceFile);
  const lateBlobSha=createHash('sha1').update('blob '+lateBytes.length)
    .update(Buffer.from([0])).update(lateBytes).digest('hex');
  const lateReviewedScope=bindReviewedQ3ScopeProof({
    proof:lateFiveProof,science:lateFiveScience,scienceGitBlobSha:lateBlobSha
  });
  ensure(newNonOriginal.schemaVersion===PUBLISHER_NONRESEARCH_SCHEMA
    &&newNonOriginal.mode==='publisher_verified_non_original_doi_only_not_publication'
    &&newNonOriginal.sourceProofFile==='audit/historical-reviewed/q3-natcatal-unfinished-24-source-proof.json'
    &&newNonOriginal.reviewed.length===newNonOriginal.summary?.count
    &&Array.isArray(newNonOriginal.reviewed)
    &&residualSourceProof.schemaVersion==='gallery-q3-natcatal-unfinished-24-source-proof-v1'
    &&residualSourceProof.mode==='frozen_publisher_research_triage_provenance_not_scientific_decision'
    &&Array.isArray(residualSourceProof.rows)
    &&newNonOriginal.reviewed.length+lateFiveProof.reviewed.length===residualSourceProof.rows.length,
    'q3_natcatal_24_artifacts_mismatch');
  const proofRows=new Map(residualSourceProof.rows.map(x=>[x.doi,x]));
  ensure(proofRows.size===residualSourceProof.rows.length,
    'q3_natcatal_24_duplicate_source_proof');
  for(const item of newNonOriginal.reviewed){
    const src=proofRows.get(item.doi),ev=item.reviewEvidence;
    ensure(src&&src.date===item.date&&src.title===item.title
      &&src.sourceRootId===ev.sourceRootId
      &&src.sourceRootSha256===ev.stageSourceSha256
      &&src.sourceShardGitBlobSha===ev.sourceReviewQueueGitBlobSha
      &&src.sourceShardPath===ev.sourceReviewQueuePath,
      'q3_natcatal_nonoriginal_source_proof_invalid:'+item.doi);
  }
  for(const item of lateReviewedScope.reviewed){
    const src=proofRows.get(item.doi);
    ensure(src&&src.date===item.date
      &&src.sourceRootSha256===item.stageSourceSha256
      &&src.sourceShardGitBlobSha===item.stageBatchGitBlobSha
      &&src.sourceRootId===item.sourceRootId,
      'q3_natcatal_science_source_proof_invalid:'+item.doi);
  }
  // Nature Synthesis: bind all 44 previously-unreviewed DOI to frozen source
  // and official publisher article categories before changing a single count.
  const nsReviewFile='audit/historical-reviewed/q3-natsynth-publisher-types-44.json';
  const nsReviewBytes=await readFile(nsReviewFile);
  const nsReviewSha=createHash('sha1').update('blob '+nsReviewBytes.length)
    .update(Buffer.from([0])).update(nsReviewBytes).digest('hex');
  ensure(natsynthFrozen.schemaVersion==='gallery-natsynth-q3-frozen-source-44-v1'
    &&natsynthFrozen.mode==='immutable_crossref_openalex_review_shards_publisher_type_not_admission'
    &&natsynthFrozen.publisherTypeLedger===nsReviewFile
    &&natsynthFrozen.publisherTypeLedgerBlob===nsReviewSha
    &&natsynthTypes.schemaVersion==='gallery-natsynth-q3-publisher-type-provisional-v1'
    &&Array.isArray(natsynthTypes.items)&&natsynthTypes.items.length===44
    &&Array.isArray(natsynthFrozen.items)&&natsynthFrozen.items.length===44
    &&natsynthFrozen.sourceRootCount===12
    &&natsynthNonOriginal.schemaVersion===PUBLISHER_NONRESEARCH_SCHEMA
    &&natsynthNonOriginal.mode==='publisher_verified_non_original_doi_only_not_publication'
    &&natsynthNonOriginal.reviewed.length===31
    &&natsynthScienceProof.reviewed.length===13,
    'q3_natsynth_frozen_authority_invalid');
  const nsFrozenMap=new Map(natsynthFrozen.items.map(x=>[x.doi,x]));
  const nsTypeMap=new Map(natsynthTypes.items.map(x=>[x.doi,x]));
  ensure(nsFrozenMap.size===44&&nsTypeMap.size===44,
    'q3_natsynth_frozen_duplicate_doi');
  const originalRawRoots=[...new Set(natsynthFrozen.items.map(x=>x.sourceRootId))];
  ensure(originalRawRoots.length===12,'q3_natsynth_raw_source_root_count_invalid');
  const rawGitShaByRoot=new Map();
  for(const rootId of originalRawRoots){
    const bytes=await readFile(root+'/batches/'+rootId+'.json');
    const gitSha=createHash('sha1').update('blob '+bytes.length)
      .update(Buffer.from([0])).update(bytes).digest('hex');
    rawGitShaByRoot.set(rootId,gitSha);
  }
  for(const item of natsynthFrozen.items){
    const tp=nsTypeMap.get(item.doi);
    ensure(tp&&tp.publisherArticleType===item.publisherArticleType
      &&tp.publisherPage===item.publisherPage
      &&tp.relatedOriginalDoi===item.relatedOriginalDoi
      &&item.rawSourceBatchGitBlobSha===rawGitShaByRoot.get(item.sourceRootId)
      &&item.rawSourceBatchPath==='audit/historical-staging/batches/'+item.sourceRootId+'.json'
      &&item.reviewQueuePath==='audit/historical-staging/review-queue/'+item.sourceRootId+'.json'
      &&item.journal==='Nature Synthesis'
      &&Array.isArray(item.sourceFamilies)
      &&item.sourceFamilies.includes('crossref')
      &&item.sourceFamilies.includes('openalex'),
      'q3_natsynth_publisher_type_or_original_source_proof_invalid:'+item.doi);
  }
  const nsNonOriginalIds=new Set();
  for(const item of natsynthNonOriginal.reviewed){
    const f=nsFrozenMap.get(item.doi),ev=item.reviewEvidence;
    ensure(f&&f.publisherArticleType!=='Article'&&!nsNonOriginalIds.has(item.doi)
      &&item.title===f.title&&item.date===f.date
      &&item.publisherArticleType===f.publisherArticleType
      &&ev.publisherPage===f.publisherPage
      &&ev.stageSourceSha256===f.sourceSha256
      &&ev.stageBatchGitBlobSha===f.rawSourceBatchGitBlobSha
      &&ev.sourceReviewQueueGitBlobSha===f.reviewQueueGitBlobSha
      &&ev.sourceReviewQueuePath===f.reviewQueuePath,
      'q3_natsynth_nonoriginal_frozen_doi_invalid:'+item.doi);
    nsNonOriginalIds.add(item.doi);
  }
  const nsScienceBytes=await readFile(natsynthScienceProof.scientificEvidenceFile);
  const nsScienceBlob=createHash('sha1').update('blob '+nsScienceBytes.length)
    .update(Buffer.from([0])).update(nsScienceBytes).digest('hex');
  const nsScoped=bindReviewedQ3ScopeProof({
    proof:natsynthScienceProof,science:natsynthScience,
    scienceGitBlobSha:nsScienceBlob
  });
  for(const item of nsScoped.reviewed){
    const f=nsFrozenMap.get(item.doi);
    ensure(f&&f.publisherArticleType==='Article'
      &&item.date===f.date&&item.sourceRootId===f.sourceRootId
      &&item.stageSourceSha256===f.sourceSha256
      &&item.stageBatchGitBlobSha===f.reviewQueueGitBlobSha
      &&!nsNonOriginalIds.has(item.doi),
      'q3_natsynth_science_frozen_doi_invalid:'+item.doi);
  }
  ensure(nsNonOriginalIds.size===31&&nsScoped.reviewed.length===13
    &&nsNonOriginalIds.size+nsScoped.reviewed.length===nsFrozenMap.size,
    'q3_natsynth_doi_partition_incomplete');
  // Nature Chemistry: original 66 publisher-listed Q3 DOI must match frozen metadata,
  // including 51 new decisions and three actual Article approvals in the manifest.
  const nchemCensusPath='audit/historical-publisher-issues/2026/nature-chemistry-q3-2026-all-types-66.json';
  const censusBytes=await readFile(nchemCensusPath);
  const censusBlobSha=createHash('sha1').update('blob '+censusBytes.length)
    .update(Buffer.from([0])).update(censusBytes).digest('hex');
  ensure(nchemCensus.schemaVersion==='gallery-q3-nchem-official-online-publisher-census-v1'
    &&nchemCensus.journal==='Nature Chemistry'
    &&nchemCensus.period==='2026-07-01..2026-09-30'
    &&nchemCensus.counters?.publisherQ3AllTypes===66
    &&nchemCensus.counters?.publisherQ3OriginalArticles===37
    &&nchemCensus.counters?.publisherQ3Nonoriginal===29
    &&nchemCensus.counters?.dateMismatches===0
    &&nchemCensus.counters?.absentFromStage===0
    &&Array.isArray(nchemCensus.items)&&nchemCensus.items.length===66
    &&nchemCensus.publisherIndexPages.length===4
    &&nchemFrozen.schemaVersion==='gallery-q3-nchem-51-frozen-source-and-publisher-types-v1'
    &&nchemFrozen.journal==='Nature Chemistry'
    &&nchemFrozen.sourceBranch==='staging/historical-archive-nightly'
    &&nchemFrozen.publisherCensusFile===nchemCensusPath
    &&nchemFrozen.publisherCensusBlobSha===censusBlobSha
    &&nchemFrozen.summary?.officialOriginalArticles===24
    &&nchemFrozen.summary?.publisherNonOriginal===27
    &&nchemFrozen.rootsVerified===12
    &&Array.isArray(nchemFrozen.items)&&nchemFrozen.items.length===51,
    'q3_nchem_publisher_census_or_source_fingerprint_invalid');
  const pAll=new Map(nchemCensus.items.map(x=>[x.doi,x]));
  const pNew=new Map(nchemFrozen.items.map(x=>[x.doi,x]));
  ensure(pAll.size===66&&pNew.size===51,
    'q3_nchem_duplicate_source_doi');
  const nchemRoots=[...new Set(nchemFrozen.items.map(x=>x.sourceRootId))];
  const allNchemRootIds=new Set(nchemCensus.sourceRoots.map(x=>x.rootId));
  ensure(nchemCensus.sourceRoots.length===12&&allNchemRootIds.size===12
    &&nchemRoots.length>0&&nchemRoots.length<=allNchemRootIds.size
    &&nchemRoots.every(id=>allNchemRootIds.has(id))
    &&nchemCensus.items.every(x=>allNchemRootIds.has(x.sourceRootId)),
    'q3_nchem_source_root_count_invalid');
  const nchemRawHashes=new Map();
  for(const id of nchemRoots){
    const bytes=await readFile(root+'/batches/'+id+'.json');
    const gitSha=createHash('sha1').update('blob '+bytes.length)
      .update(Buffer.from([0])).update(bytes).digest('hex');
    nchemRawHashes.set(id,gitSha);
  }
  for(const x of nchemFrozen.items){
    const official=pAll.get(x.doi);
    ensure(official&&official.originalStatus==='unfinished'
      &&official.publisherDate===x.publisherDate
      &&official.publisherArticleType===x.publisherArticleType
      &&official.publisherArticleUrl===x.publisherArticleUrl
      &&official.sourceDate===x.sourceDate
      &&official.sourceRootId===x.sourceRootId
      &&official.reviewQueueGitBlobSha===x.reviewQueueGitBlobSha
      &&official.stageSourceSha256===x.stageSourceSha256
      &&x.originalBatchGitBlobSha===nchemRawHashes.get(x.sourceRootId)
      &&x.originalBatchPath==='audit/historical-staging/batches/'+x.sourceRootId+'.json'
      &&x.reviewQueuePath==='audit/historical-staging/review-queue/'+x.sourceRootId+'.json'
      &&Array.isArray(x.sourceFamilies)
      &&x.sourceFamilies.includes('crossref')&&x.sourceFamilies.includes('openalex')
      &&(!x.sourceFlags||x.sourceFlags.length===0),
      'q3_nchem_source_date_type_or_raw_sha_invalid:'+x.doi);
  }
  ensure(nchemNonOriginal.schemaVersion===PUBLISHER_NONRESEARCH_SCHEMA
    &&nchemNonOriginal.mode==='publisher_verified_non_original_doi_only_not_publication'
    &&nchemNonOriginal.sourceProofFile==='audit/historical-reviewed/q3-nchem-51-frozen-source-proof.json'
    &&nchemNonOriginal.reviewed.length===27,
    'q3_nchem_nonoriginal_schema_or_count_invalid');
  const nchemExcludedIds=new Set();
  for(const x of nchemNonOriginal.reviewed){
    const original=pNew.get(x.doi),ev=x.reviewEvidence;
    ensure(original&&original.publisherArticleType!=='Article'
      &&!nchemExcludedIds.has(x.doi)
      &&x.title===original.sourceTitle&&x.date===original.publisherDate
      &&x.publisherArticleType===original.publisherArticleType
      &&ev.publisherPage===original.publisherArticleUrl
      &&ev.stageSourceSha256===original.stageSourceSha256
      &&ev.stageBatchGitBlobSha===original.originalBatchGitBlobSha
      &&ev.sourceReviewQueueGitBlobSha===original.reviewQueueGitBlobSha
      &&ev.sourceReviewQueuePath===original.reviewQueuePath,
      'q3_nchem_nonoriginal_provenance_invalid:'+x.doi);
    nchemExcludedIds.add(x.doi);
  }
  const nchemScopeBytes=await readFile(nchemScopeProof.scientificEvidenceFile);
  const nchemScopeSha=createHash('sha1').update('blob '+nchemScopeBytes.length)
    .update(Buffer.from([0])).update(nchemScopeBytes).digest('hex');
  const nchemScoped=bindReviewedQ3ScopeProof({
    proof:nchemScopeProof,science:nchemScopeScience,
    scienceGitBlobSha:nchemScopeSha
  });
  const fullSciencePath='audit/historical-scope-assessments/2026-10-14-nchem-24-original-two-pass.json';
  const fullScienceBytes=await readFile(fullSciencePath);
  const fullScienceSha=createHash('sha1').update('blob '+fullScienceBytes.length)
    .update(Buffer.from([0])).update(fullScienceBytes).digest('hex');
  ensure(nchemFullScience.accounting?.assessmentCount===24
    &&nchemFullScience.accounting.include===3
    &&nchemFullScience.accounting.exclude===20
    &&nchemFullScience.accounting.evidencePending===1
    &&nchemScopeScience.parentFullScienceFile===fullSciencePath
    &&nchemScopeScience.parentFullScienceGitBlobSha===fullScienceSha
    &&nchemScoped.reviewed.length===21,
    'q3_nchem_science_partition_or_parent_hash_invalid');
  const nchemFullScienceRows=new Map(nchemFullScience.assessments.map(x=>[x.doi,x]));
  ensure(nchemFullScienceRows.size===24,'q3_nchem_full_science_duplicate_doi');
  const exceptionSet=new Set();
  for(const x of nchemScoped.reviewed){
    const f=pNew.get(x.doi),full=nchemFullScienceRows.get(x.doi);
    ensure(f&&full&&f.publisherArticleType==='Article'
      &&x.date===f.publisherDate&&x.publisherPage===f.publisherArticleUrl
      &&x.stageSourceSha256===f.stageSourceSha256
      &&x.stageBatchGitBlobSha===f.reviewQueueGitBlobSha
      &&full.decision===x.scientificDecision&&!exceptionSet.has(x.doi)
      &&!nchemExcludedIds.has(x.doi),
      'q3_nchem_science_provenance_invalid:'+x.doi);
    exceptionSet.add(x.doi);
  }
  const recentApproved=new Map(manifest.accepted.map(x=>[x.doi,x]));
  const admissionSet=new Set();
  for(const s of nchemFullScience.assessments.filter(x=>x.decision==='include')){
    const f=pNew.get(s.doi),a=recentApproved.get(s.doi);
    ensure(f&&a&&!admissionSet.has(s.doi)&&!nchemExcludedIds.has(s.doi)
      &&!exceptionSet.has(s.doi)
      &&f.publisherArticleType==='Article'
      &&s.date===f.publisherDate&&a.date===s.date
      &&a.title===f.sourceTitle&&a.journal==='Nature Chemistry'
      &&a.reviewPasses===2&&a.firstPassDecision==='include'
      &&a.challengeDecision==='include'&&a.decision==='include'
      &&a.reviewStatus==='two_pass_scope_include_awaiting_fixed_slot'
      &&a.ingestionChannel==='historical_backfill'
      &&a.mediaPolicy==='toc_only'&&a.new===false&&a.addedDate===''
      &&a.reviewEvidence.publisherPage===f.publisherArticleUrl
      &&a.reviewEvidence.publisherOnlineDate===f.publisherDate
      &&a.reviewEvidence.stageBatchId===f.sourceRootId
      &&a.reviewEvidence.stageBatchSha===f.originalBatchGitBlobSha
      &&a.reviewEvidence.sourceReviewQueueGitBlobSha===f.reviewQueueGitBlobSha
      &&a.reviewEvidence.stageSourceSha256===f.stageSourceSha256
      &&s.scopeAssessment.primaryContribution===a.scopeAssessment.primaryContribution
      &&s.scopeAssessment.generalityEvidence===a.scopeAssessment.generalityEvidence
      &&s.scopeAssessment.boundaryChallenge===a.scopeAssessment.boundaryChallenge,
      'q3_nchem_08_admission_source_or_science_conflict:'+s.doi);
    admissionSet.add(s.doi);
  }
  ensure(nchemExcludedIds.size===27&&exceptionSet.size===21
    &&admissionSet.size===3&&nchemExcludedIds.size+exceptionSet.size+admissionSet.size===pNew.size,
    'q3_nchem_51_partition_incomplete');
  const publisherNonResearch={...oldNonOriginal,
    reviewed:[...oldNonOriginal.reviewed,...newNonOriginal.reviewed,
      ...natsynthNonOriginal.reviewed,...nchemNonOriginal.reviewed]};
  const publisherReviewedScope={...priorReviewedScope,
    reviewed:[...priorReviewedScope.reviewed,...lateReviewedScope.reviewed,
      ...nsScoped.reviewed,...nchemScoped.reviewed]};
  const relevant=new Set(expectedQ3Roots().map(x=>x.id)),shards=[];
  for(const id of state.completed)if(relevant.has(id)){
    const bytes=await readFile(root+'/review-queue/'+id+'.json');
    const gitBlobSha=createHash('sha1').update('blob '+bytes.length).update(Buffer.from([0])).update(bytes).digest('hex');
    shards.push({...JSON.parse(bytes.toString('utf8')),gitBlobSha});
  }
  // Only a status-only, byte-for-byte deterministic rebuild from the same
  // immutable publisher-source batch can authorize an older reviewer Git SHA
  // after legitimate historical admissions changed current status counters.
  // Current/reconstructed bytes remain auditable; no global hash bypass.
  const nchemByRoot=new Map();
  for(const evidence of nchemFrozen.items){
    const rootId=evidence.sourceRootId;
    const prior=nchemByRoot.get(rootId);
    const next={
      sourceSha:evidence.stageSourceSha256,
      rawGitSha:evidence.originalBatchGitBlobSha,
      pinnedReviewerGitSha:evidence.reviewQueueGitBlobSha
    };
    ensure(!prior||(
      prior.sourceSha===next.sourceSha
      &&prior.rawGitSha===next.rawGitSha
      &&prior.pinnedReviewerGitSha===next.pinnedReviewerGitSha),
      'q3_nchem_immutable_root_proof_disagrees:'+rootId);
    nchemByRoot.set(rootId,next);
  }
  const shardsByRoot=new Map(shards.map(x=>[x.rootId,x]));
  const reviewerQueueHistoricalBlobAliasesByRoot=new Map();
  const publishedIds=new Set(formal.articles.map(x=>normalize(x.doi)));
  const approvedIds=new Set(manifest.accepted.map(x=>normalize(x.doi)));
  const pendingIds=new Set(manifest.pending.map(x=>normalize(x.doi)));
  for(const [rootId,p] of nchemByRoot){
    const shard=shardsByRoot.get(rootId);
    ensure(shard,'q3_nchem_missing_frozen_source_root:'+rootId);
    if(shard.gitBlobSha===p.pinnedReviewerGitSha)continue;
    const rawBatchText=await readFile(root+'/batches/'+rootId+'.json','utf8');
    const {gitBlobSha:currentReviewerGitBlobSha,...persistedReviewerShard}=shard;
    const oldSha=verifyHistoricalReviewerStatusRefresh({
      rawBatchText,reviewerShard:persistedReviewerShard,rootId,
      expectedRawSha256:p.sourceSha,expectedRawGitBlobSha:p.rawGitSha,
      previousReviewerGitBlobSha:p.pinnedReviewerGitSha,
      published:publishedIds,approved:approvedIds,pending:pendingIds
    });
    ensure(currentReviewerGitBlobSha!==oldSha,
      'q3_nchem_refresh_misidentified_old_blob:'+rootId);
    reviewerQueueHistoricalBlobAliasesByRoot.set(rootId,new Set([oldSha]));
  }
  // Chem reviewer queue status may change after three legitimate admissions.
  // Preserve original reviewer Git SHA only after deterministic re-generation
  // from the exact immutable publisher-source batch and current statuses.
  const chemByRoot=new Map();
  for(const r of chemPublisherDates.rows){
    const rootId=r.originalQ3QueueOrigin;
    const prev=chemByRoot.get(rootId),data={
      sourceSha:r.sourceRootSha256,rawGitSha:r.originalSourceBatchGitBlobSha,
      pinnedReviewerGitSha:r.reviewQueueGitBlobSha
    };
    ensure(!prev||(prev.sourceSha===data.sourceSha
      &&prev.rawGitSha===data.rawGitSha
      &&prev.pinnedReviewerGitSha===data.pinnedReviewerGitSha),
      'q3_chem_immutable_proof_conflict:'+rootId);
    chemByRoot.set(rootId,data);
  }
  for(const [rootId,p] of chemByRoot){
    const shard=shardsByRoot.get(rootId);
    ensure(shard,'q3_chem_missing_source_root:'+rootId);
    const rawBatchText=await readFile(root+'/batches/'+rootId+'.json','utf8');
    const raw=Buffer.from(rawBatchText,'utf8');
    const actualRawSha=createHash('sha256').update(raw).digest('hex');
    const actualRawGitSha=createHash('sha1').update('blob '+raw.length)
      .update(Buffer.from([0])).update(raw).digest('hex');
    ensure(actualRawSha===p.sourceSha&&actualRawGitSha===p.rawGitSha,
      'q3_chem_raw_source_fingerprint_changed:'+rootId);
    if(shard.gitBlobSha===p.pinnedReviewerGitSha)continue;
    const {gitBlobSha:currentReviewerGitBlobSha,...persistedReviewerShard}=shard;
    const oldSha=verifyHistoricalReviewerStatusRefresh({
      rawBatchText,reviewerShard:persistedReviewerShard,rootId,
      expectedRawSha256:p.sourceSha,expectedRawGitBlobSha:p.rawGitSha,
      previousReviewerGitBlobSha:p.pinnedReviewerGitSha,
      published:publishedIds,approved:approvedIds,pending:pendingIds
    });
    ensure(currentReviewerGitBlobSha!==oldSha,
      'q3_chem_review_shard_alias_identical:'+rootId);
    const prior=reviewerQueueHistoricalBlobAliasesByRoot.get(rootId)||new Set();
    ensure(prior.size===0||prior.has(oldSha),'q3_chem_alias_conflict:'+rootId);
    reviewerQueueHistoricalBlobAliasesByRoot.set(rootId,new Set([...prior,oldSha]));
  }
  const {coverage,worklist}=reconcileQ3({
    state,triage,shards,formal,manifest,corrections,publisherNonResearch,
    publisherReviewedScope,chemPublisherDates,
    reviewerQueueHistoricalBlobAliasesByRoot,page
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
    publisherNonResearchExcluded:coverage.counters.sourcePublisherNonResearchExcluded,
    zeroD1:true,noPublication:true
  }));
  return {coverage,worklist};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  runQuarterAudit().catch(e=>{console.error('HISTORICAL_Q3_BLOCKED',String(e?.message||e));process.exitCode=1});
