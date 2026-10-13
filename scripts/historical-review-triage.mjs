/**
 * Candidate-only high-recall review queue: never decides inclusion/exclusion.
 * Runs on the dedicated history staging branch after trusted source discovery.
 * Main's published registry and two-pass manifest are READ ONLY.
 */
import {readFile,mkdir,rename,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {historicalFoundation} from '../shared/historical-journal-founding.mjs';
export const TRIAGE_SCHEMA='gallery-history-review-triage-v1';
const ROOT='audit/historical-staging';
const DOI=/^10\.\d{4,9}\/\S+$/;
const norm=v=>String(v||'').trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'');
const fileDigest=content=>createHash('sha256').update(content).digest('hex');
const filenameId=id=>/^\d{4}-\d\d-\d\d_\d{4}-\d\d-\d\d_[a-z][a-z-]+$/.test(id);
const priorityWords=[
  /(?:total synthesis|formal synthesis|enantioselective|(?:asymmetric|stereoselective)[^\n]{0,90}(?:synthes(?:is|es|ized)|cataly[sz]ed|hydroalkylation|hydrophosphinylation|propargylation|alkylation|arylation|difunctionalization|functionalization|cross.coupling|Mannich|annulation|cyclization|olefination|esterification|hydrogenation|desymmetri[sz]ation)|cross.coupling|decarboxylative|carbonylative|electrochemical.*(?:reaction|synthesis|coupling)|photoredox.*(?:reaction|coupling|synthesis))/i,
  /synthe|annulation|cyclization|cyclisation|functionalization|functionalisation|olefination|amination|alkylation|arylation|hydroboration|phosphonylation|rearrangement|carboxylation|electrosynthesis|photocataly/i,
  /reaction|cataly|transformation|organic|carbon|radical|enantio|chirality|enantioselect/i,
];
const identityWords=/^(?:issue publication information|issue editorial masthead|masthead|cover|table of contents|erratum|correction|retraction|editorial|list of reviewers|author index)\b/i;
export function rankHistoricalCandidate(row){
  const title=String(row?.title||'').trim();
  const index=priorityWords.findIndex(rx=>rx.test(title));
  const flags=[];
  if(!title)flags.push('missing_title');
  if(identityWords.test(title))flags.push('suspected_nonresearch_record_verify_at_publisher');
  if(!row?.date||row?.needsPublisherDateVerification)flags.push('publisher_first_online_date_unverified');
  if(row?.titleSourceConflict)flags.push('cross_source_title_conflict');
  if(row?.publicationDateMayDiffer)flags.push('discovered_window_date_mismatch');
  return {priority:'P'+(index<0?3:index),flags};
}
export function buildReviewShard(source,{published=new Set(),approved=new Set(),pending=new Set(),sourceSha256,sourceId}={}){
  if(source?.recordType!=='historical_discovery_candidate_only'
    ||source.status!=='source_enumeration_complete'||source.consistency?.complete!==true
    ||!Array.isArray(source.records)||!filenameId(sourceId)
    ||source.records.length!==source.candidateCount)throw Error('untrusted_historical_source_batch:'+sourceId);
  historicalFoundation(source.journal);
  const seen=new Set(),records=[];
  for(const row of source.records){
    const doi=norm(row.doi);
    if(!DOI.test(doi)||seen.has(doi))throw Error('invalid_or_duplicate_historical_batch_doi:'+doi);
    seen.add(doi);
    const ranked=rankHistoricalCandidate(row);
    const status=published.has(doi)?'already_published':
      approved.has(doi)?'two_pass_approved_awaiting_08':
      pending.has(doi)?'evidence_pending':'requires_two_pass_review';
    records.push({
      doi,title:String(row.title||''),journal:source.journal,
      date:row.date||'',createdDate:row.createdDate||'',
      year:row.citation?.year||null,
      citation:row.citation||{},authors:Array.isArray(row.authors)?row.authors:[],
      sourceFamilies:row.sources||[row.source].filter(Boolean),
      sourceBatchId:sourceId,sourceBatchSha256:sourceSha256,
      priority:ranked.priority,flags:ranked.flags,
      status,articleEvidenceReview:'not_performed_by_triage',
      publicationRights:'unverified_no_full_abstract_or_body'
    });
  }
  const order={P0:0,P1:1,P2:2,P3:3};
  records.sort((a,b)=>order[a.priority]-order[b.priority]||a.doi.localeCompare(b.doi));
  const stats={candidateOccurrences:records.length,alreadyPublished:0,
    approvedAwaiting08:0,evidencePending:0,requiresTwoPassReview:0,
    priorityP0:0,priorityP1:0,priorityP2:0,priorityP3:0,unverifiedDate:0,
    suspectedNonresearch:0};
  for(const x of records){
    if(x.status==='already_published')stats.alreadyPublished++;
    if(x.status==='two_pass_approved_awaiting_08')stats.approvedAwaiting08++;
    if(x.status==='evidence_pending')stats.evidencePending++;
    if(x.status==='requires_two_pass_review')stats.requiresTwoPassReview++;
    stats['priority'+x.priority]++;
    if(x.flags.includes('publisher_first_online_date_unverified'))stats.unverifiedDate++;
    if(x.flags.includes('suspected_nonresearch_record_verify_at_publisher'))stats.suspectedNonresearch++;
  }
  return {schemaVersion:TRIAGE_SCHEMA,mode:'review_queue_only_not_publication',
    rootId:sourceId,journal:source.journal,range:source.range,
    sourceSha256,sourceCheckedAt:source.checkedAt,
    publisherIssueReconciled:false,legacyNoDoiRecordsReconciled:false,
    titleSignalsAreRankOnly:true,zeroAutomaticExclusions:true,
    completeSourceFamilies:source.consistency.complete,stats,records};
}
const loadJson=async p=>JSON.parse(await readFile(p,'utf8'));
async function putJson(file,data){
  await mkdir(dirname(file),{recursive:true});
  const tmp=file+'.tmp.'+process.pid;
  await writeFile(tmp,JSON.stringify(data,null,2)+'\n','utf8');
  await rename(tmp,file);
}
export async function runHistoricalTriage({root=ROOT,limit=Number(process.env.MAX_HISTORICAL_TRIAGE_ROOTS||120)}={}){
  if(process.env.HISTORICAL_STAGING_ONLY!=='1'||process.env.HISTORICAL_STAGING_BRANCH!=='1')
    throw Error('historical_triage_staging_only_guard');
  if(!Number.isSafeInteger(limit)||limit<1||limit>360)throw Error('invalid_historical_triage_limit');
  const [state,queue,manifest]=await Promise.all([
    loadJson(root+'/state.json'),
    loadJson('public/toc-demand-live.json'),
    loadJson('audit/historical-reviewed/approved-admissions.json')]);
  if(state.schema!=='gallery-historical-nightly-staging-v1'
    ||state.mode!=='candidate_discovery_only'||!Array.isArray(state.completed)
    ||!Array.isArray(queue.articles)||queue.articles.length!==queue.webpageDoiCount
    ||!Array.isArray(manifest.accepted)||!Array.isArray(manifest.pending))
    throw Error('untrusted_historical_triage_sources');
  const published=new Set(queue.articles.map(x=>norm(x.doi)));
  const approved=new Set(manifest.accepted.map(x=>norm(x.doi)));
  const pending=new Set(manifest.pending.map(x=>norm(x.doi)));
  const ledgerPath=root+'/review-triage-ledger.json';
  let ledger;
  try{ledger=await loadJson(ledgerPath)}catch(e){if(e?.code!=='ENOENT')throw e;
    ledger={schemaVersion:TRIAGE_SCHEMA,mode:'review_queue_only_not_publication',nextRootIndex:0,rootSummaries:{}}}
  if(ledger.schemaVersion!==TRIAGE_SCHEMA||ledger.mode!=='review_queue_only_not_publication'
    ||!Number.isSafeInteger(ledger.nextRootIndex)||ledger.nextRootIndex<0
    ||!ledger.rootSummaries||Array.isArray(ledger.rootSummaries))
    throw Error('invalid_historical_triage_checkpoint');
  const roots=state.completed;
  let cursor=ledger.nextRootIndex>=roots.length?0:ledger.nextRootIndex,processed=0;
  const at=new Date().toISOString();
  while(cursor<roots.length&&processed<limit){
    const id=roots[cursor];
    if(!filenameId(id))throw Error('untrusted_history_root_id:'+id);
    const raw=await readFile(root+'/batches/'+id+'.json','utf8');
    const batch=JSON.parse(raw);
    const fingerprint=fileDigest(raw);
    const shard=buildReviewShard(batch,{published,approved,pending,sourceSha256:fingerprint,sourceId:id});
    await putJson(root+'/review-queue/'+id+'.json',shard);
    ledger.rootSummaries[id]={...shard.stats,sourceSha256:fingerprint,
      publisherIssueReconciled:false,legacyNoDoiReconciled:false};
    cursor++;processed++;
    ledger.nextRootIndex=cursor;
    ledger.generatedAt=at;
    ledger.coverageRootsTotal=roots.length;
    ledger.coverageRootsProcessed=Object.keys(ledger.rootSummaries).length;
    ledger.publishedDoiCount=published.size;
    ledger.publisherIssueVerification='not_complete';
    ledger.olderNonDoiCoverage='not_enumerated';
    ledger.productionWrite=false;
    await putJson(ledgerPath,ledger);
  }
  const summary={at,processed,nextRootIndex:cursor,sourceRoots:roots.length,
    queueRootsWithShards:Object.keys(ledger.rootSummaries).length,
    completeForCurrentRootSnapshot:cursor===roots.length&&
      Object.keys(ledger.rootSummaries).length>=roots.length,
    publisherIssueVerification:'not_complete',noDoiCoverage:'not_enumerated',
    noAutomaticScopeDecisions:true,noFormalPublication:true};
  console.log('HISTORICAL_REVIEW_TRIAGE_SUMMARY '+JSON.stringify(summary));
  return summary;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  runHistoricalTriage().catch(e=>{console.error('HISTORICAL_TRIAGE_BLOCKED',String(e?.message||e));process.exitCode=1});
