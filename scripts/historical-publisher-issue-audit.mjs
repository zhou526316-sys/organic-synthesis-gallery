/**
 * Read-only DOI-exact publisher-issue Research-section reconciliation.
 * Publisher issue manifest is reviewed separately; this verifies metadata
 * against frozen source batches and NEVER authorizes an organic scope include.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const ISSUE_SCHEMA='gallery-publisher-issue-research-reconciliation-v1';
const norm=s=>String(s||'').normalize('NFKC').toLowerCase()
  .replace(/[–—‐−]/g,'-').replace(/\s+/g,' ').trim();
const assert=(yes,why)=>{if(!yes)throw Error(why)};
const doi=s=>String(s||'').trim().toLowerCase();
export function reconcilePublisherIssueResearch(evidence,sources){
  assert(evidence?.schemaVersion===ISSUE_SCHEMA
    &&evidence.mode==='publisher_issue_review_source_only',
    'invalid_issue_reconciliation_schema');
  assert(evidence.publisherSection==='Research'&&evidence.journal==='Nature Synthesis'
    &&evidence.publisherIssuePage==='https://www.nature.com/natsynth/volumes/5/issues/8'
    &&evidence.publisherIssue?.volume==='5'&&evidence.publisherIssue.issue==='8',
    'publisher_issue_source_not_verified');
  assert(evidence.issuePublisherResearchTitlesCaptured===true
    &&evidence.publisherHtmlCryptographicSnapshotAvailable===false,
    'publisher_issue_provenance_not_explicit');
  assert(evidence.policy?.productionChanges===false
    &&evidence.policy?.noAutomaticScopeInclusion===true
    &&evidence.policy?.noRawAbstractBodyImagesOrPdfCopied===true,
    'publisher_issue_permission_or_production_guard_missing');
  assert(Array.isArray(evidence.sourceSnapshots)&&evidence.sourceSnapshots.length>0
    &&Array.isArray(evidence.researchArticles)
    &&evidence.articleCountOnPublisherPage===evidence.researchArticles.length
    &&Array.isArray(evidence.excludedOtherIssueContent),
    'publisher_issue_research_count_invalid');
  assert(Array.isArray(sources)&&sources.length===evidence.sourceSnapshots.length,
    'publisher_issue_batch_count_mismatch');
  const batchByPath=new Map();
  for(let i=0;i<evidence.sourceSnapshots.length;i++){
    const spec=evidence.sourceSnapshots[i],batch=sources[i];
    assert(spec?.path?.startsWith('audit/historical-staging/batches/')
      &&/^[a-f0-9]{40}$/.test(spec.gitBlobSha||'')
      &&batch?.recordType==='historical_discovery_candidate_only'
      &&batch.status==='source_enumeration_complete'
      &&batch.consistency?.complete===true
      &&batch.journal===evidence.journal&&Array.isArray(batch.records)
      &&batch.candidateCount===batch.records.length,
      'publisher_issue_batch_untrusted');
    assert(!batchByPath.has(spec.path),'publisher_issue_duplicate_batch');
    batchByPath.set(spec.path,batch);
  }
  const byDoi=new Map();
  for(const [path,batch]of batchByPath){
    for(const row of batch.records){
      const id=doi(row.doi);
      if(row.citation?.volume!==evidence.publisherIssue.volume
        ||row.citation?.issue!==evidence.publisherIssue.issue)continue;
      assert(!byDoi.has(id),'publisher_issue_same_doi_in_multiple_batches:'+id);
      byDoi.set(id,{...row,sourcePath:path});
    }
  }
  const listed=new Set(),omitted=[];
  for(const paper of evidence.researchArticles){
    const id=doi(paper.doi);
    assert(/^10\.\d{4,9}\/\S+$/.test(id)&&!listed.has(id),
      'publisher_issue_research_doi_duplicate_or_invalid:'+id);
    listed.add(id);
    const source=byDoi.get(id);
    if(!source){omitted.push(id);continue}
    const expected=String(paper.sourceBatchId||'');
    const spec=evidence.sourceSnapshots.find(s=>s.path==='audit/historical-staging/batches/'+expected+'.json');
    assert(spec&&source.sourcePath===spec.path&&paper.sourceBatchSha===spec.gitBlobSha
      &&norm(source.title)===norm(paper.title)
      &&source.date===paper.firstOnlineDate
      &&source.citation.volume===evidence.publisherIssue.volume
      &&source.citation.issue===evidence.publisherIssue.issue,
      'publisher_issue_research_identity_or_online_date_mismatch:'+id);
  }
  const nonresearch=new Set();
  for(const row of evidence.excludedOtherIssueContent){
    const id=doi(row.doi);
    assert(byDoi.has(id)&&!listed.has(id)&&!nonresearch.has(id)
      &&['News & Views','Research Briefings','Amendments & Corrections'].includes(row.publisherSection),
      'unverified_issue_nonresearch_exclusion:'+id);
    nonresearch.add(id);
  }
  const extra=[...byDoi.keys()].filter(id=>!listed.has(id)&&!nonresearch.has(id));
  assert(!omitted.length&&extra.length===0,'publisher_research_issue_coverage_not_closed:'+
    JSON.stringify({omitted,extra}));
  return {schemaVersion:ISSUE_SCHEMA,status:'publisher_research_section_reconciled',
    journal:evidence.journal,issue:evidence.publisherIssue,publisherIssuePage:evidence.publisherIssuePage,
    publisherResearchCount:listed.size,stageResearchCount:listed.size,
    publisherResearchMissingFromStaging:omitted,extraUnaccountedStageIssueRecords:extra,
    publisherNonResearchStageRows:nonresearch.size,onlineDatesOutsideIssueMonth:
      evidence.researchArticles.filter(x=>!x.firstOnlineDate.startsWith(evidence.publisherIssue.displayMonth)).length,
    publisherIssueResearchSectionMatched:true,publisherHtmlCryptographicSnapshotAvailable:false,
    allPublisherSectionsAudited:false,noAutomaticInclusion:true,noFormalPublication:true,
    auditPerformedAt:new Date().toISOString()};
}
function git(...args){return execFileSync('git',args,{encoding:'utf8',maxBuffer:5*1024*1024}).trim()}
export async function auditFromCurrentStaging({
  evidenceFile='audit/historical-publisher-issues/nature-synthesis-2026-volume5-issue8.json',
  stagingRef='origin/staging/historical-archive-nightly'}={}){
  const evidence=JSON.parse(await readFile(evidenceFile,'utf8'));
  const sources=[];
  for(const s of evidence.sourceSnapshots){
    const rev=stagingRef+':'+s.path;
    assert(git('rev-parse',rev)===s.gitBlobSha,'publisher_issue_source_blob_changed:'+s.path);
    sources.push(JSON.parse(git('show',rev)));
  }
  return reconcilePublisherIssueResearch(evidence,sources);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let result;
  try{result=await auditFromCurrentStaging()}catch(e){result={status:'blocked',error:String(e?.message||e),noFormalPublication:true};process.exitCode=1}
  const output=process.env.HISTORICAL_ISSUE_AUDIT_REPORT||'/tmp/historical-publisher-issue-audit.json';
  await writeFile(output,JSON.stringify(result,null,2)+'\n');
  console.log('HISTORICAL_PUBLISHER_ISSUE_AUDIT '+JSON.stringify(result));
}
