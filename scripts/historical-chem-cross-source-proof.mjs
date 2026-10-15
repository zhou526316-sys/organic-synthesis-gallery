
/**
 * DOI-exact publisher resolution for contradictory historical Crossref/OpenAlex
 * first-online candidates. The original immutable source rows remain intact.
 * Date proof and SCIENCE verdict never give formal publication permission.
 */
export const SCHEMA='gallery-historical-chem-cross-source-online-v1';
export const EMPTY=Object.freeze({
  schemaVersion:SCHEMA,mode:'publisher_verified_cross_source_date_conflict_not_admission',
  rows:[]
});
const ensure=(ok,what)=>{if(!ok)throw Error('q3_chem_cross_source_'+what)};
const knownDOI=id=>/^10\.1016\/j\.chempr\.2026\.\d{6}$/.test(id||'');
const PINNED_PUBLISHER_RECEIPTS=new Map([
  ['10.1016/j.chempr.2026.103127',{
    online:'2026-07-06',pii:'S2451929426001932'
  }]
]);
const q3=date=>/^2026-(07|08|09)-\d\d$/.test(date||'');
const validDay=date=>{
  try{return /^2026-\d\d-\d\d$/.test(date) &&
    new Date(date+'T00:00:00Z').toISOString().startsWith(date)}
  catch{return false}
};
export function bindChemCrossSourceProof({
  dateEvidence=EMPTY,scienceAssessments=[],all,shards,gitBlobByRoot,
  pub,accepted,pending,excluded,publisherNonOriginal,reviewedScope,
  correctedChemDates,chemReviewedPending,chemReviewedExcluded
}={}){
  ensure(dateEvidence?.schemaVersion===SCHEMA &&
    dateEvidence.mode===EMPTY.mode &&
    Array.isArray(dateEvidence.rows) && Array.isArray(scienceAssessments),
    'schema_invalid');
  const resolved=new Map(),sciencePending=new Map();
  for(const d of dateEvidence.rows){
    const id=String(d?.doi||'').trim().toLowerCase(),src=all?.get(id);
    const proofs=d?.originalSourceRows;
    let url=null;
    try{url=new URL(d?.officialPublisherArticlePage||'')}catch{}
    const occurrences=(shards||[]).flatMap(shard=>(shard.records||[])
      .filter(row=>String(row.doi||'').toLowerCase()===id)
      .map(row=>({rootId:shard.rootId,sourceRootSha256:shard.sourceSha256,
        gitBlobSha:shard.gitBlobSha,row})));
    const receipt=PINNED_PUBLISHER_RECEIPTS.get(id);
    const rootIds=new Set(proofs?.map(x=>x.rootId)||[]);
    const conflictingDates=new Set(proofs?.map(x=>x.sourceDate)||[]);
    ensure(knownDOI(id)&&receipt
      &&d.publisherFirstOnlineDate===receipt.online
      &&url?.pathname==='/science/article/pii/'+receipt.pii
      &&d.doi===id&&src?.journal==='Chem'
      &&src.title===d.title&&src.dateConflict===true&&!src.journalConflict
      &&Array.isArray(proofs)&&proofs.length===2
      &&rootIds.size===2&&conflictingDates.size===2
      &&d.publisherArticleType==='Research article'
      &&q3(d.publisherFirstOnlineDate)&&validDay(d.publisherFirstOnlineDate)
      &&d.verifiedPublicationQuarter==='2026-Q3'
      &&conflictingDates.has(d.publisherFirstOnlineDate)
      &&url?.protocol==='https:'&&url.hostname==='www.sciencedirect.com'
      &&/^\/science\/article\/pii\/S2451929426(?:\d{6}|\d{5}X)$/.test(url.pathname)
      &&d.doiResolver==='https://doi.org/'+id
      &&d.academicScopeDecision==='not_made_by_publication_date_evidence'
      &&d.originalFrozenRootRowsUnmodified===true
      &&d.publisherDateOverrulesConflictingSourceForQuarter===true
      &&occurrences.length===2&&src.sourceRoots.length===2
      &&src.sourceRoots.every(r=>rootIds.has(r))
      &&proofs.every(p=>occurrences.some(o=>
        o.rootId===p.rootId&&o.row.date===p.sourceDate
        &&o.row.title===d.title&&o.row.journal==='Chem'
        &&o.sourceRootSha256===p.sourceRootSha256
        &&src.sourceHashes.includes(p.sourceRootSha256)
        &&Array.isArray(p.sourceFamilies)&&p.sourceFamilies.length>0
        &&p.sourceFamilies.every(f=>(o.row.sourceFamilies||[]).includes(f))
        &&gitBlobByRoot.get(p.rootId)?.has(p.reviewQueueGitBlobSha)
        &&p.sourceReviewQueuePath==='audit/historical-staging/review-queue/'+p.rootId+'.json'
        &&p.sourceBatchPath==='audit/historical-staging/batches/'+p.rootId+'.json'
        &&/^[a-f0-9]{40}$/.test(p.rawSourceBatchGitBlobSha||'')))
      &&!resolved.has(id)
      &&!pub.has(id)&&!accepted.has(id)&&!pending.has(id)
      &&!excluded.has(id)&&!publisherNonOriginal.has(id)
      &&!reviewedScope.has(id)&&!correctedChemDates.has(id)
      &&!chemReviewedPending.has(id)&&!chemReviewedExcluded.has(id),
      'publisher_provenance_invalid:'+id);
    resolved.set(id,d);
  }
  for(const a of scienceAssessments){
    const id=String(a?.doi||'').trim().toLowerCase(),d=resolved.get(id);
    const ev=a?.reviewEvidence,sc=a?.scopeAssessment;
    ensure(d&&a.doi===id&&a.journal==='Chem'&&a.title===d.title
      &&a.publisherArticleType==='Research article'
      &&a.date===d.publisherFirstOnlineDate
      &&a.decision==='pending'&&a.firstPassDecision==='pending'
      &&a.challengeDecision==='pending'&&a.reviewPasses===2
      &&a.missingEvidenceMustNotMeanNoEvidenceExists===true
      &&a.pendingNotAdmitted===true
      &&a.firstPassReason?.length>=80
      &&a.independentChallengeReason?.length>=80
      &&a.firstPassReason!==a.independentChallengeReason
      &&a.evidenceNeeded?.length>=70&&a.nextAction?.length>=70
      &&['primaryContribution','preparativeTransformation','generalityEvidence',
        'sourceEvidence','boundaryChallenge'].every(k=>sc?.[k]?.length>=35)
      &&ev?.publisherArticlePage===d.officialPublisherArticlePage
      &&ev?.publisherOnlineDate===d.publisherFirstOnlineDate
      &&ev?.frozenSourceDateConflictRetained===true
      &&Array.isArray(ev.sourceRootIds)&&ev.sourceRootIds.length===2
      &&d.originalSourceRows.every(r=>ev.sourceRootIds.includes(r.rootId))
      &&!sciencePending.has(id),'science_pending_invalid:'+id);
    sciencePending.set(id,a);
  }
  ensure(resolved.size===sciencePending.size,'date_scope_partition_incomplete');
  return {resolved,sciencePending};
}
