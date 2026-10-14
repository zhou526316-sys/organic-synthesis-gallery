/** Bind a frozen publisher-science assessment to DOI-exact source proof.
 * This adapter has no IO and never authorizes admission or publication.
 */
export const REVIEWED_SCOPE_SCHEMA='gallery-historical-q3-reviewed-scope-source-proof-v1';
export const REVIEWED_SCOPE_AUTHORITY_SCHEMA='gallery-historical-q3-verified-reviewed-scope-v1';
export const EMPTY_REVIEWED_SCOPE=Object.freeze({
  schemaVersion:REVIEWED_SCOPE_AUTHORITY_SCHEMA,
  mode:'scientific_review_and_source_identity_only_not_publication',
  reviewed:[]
});
const check=(ok,msg)=>{if(!ok)throw Error(msg)};
const normalize=s=>String(s||'').trim().toLowerCase();
const sha40=s=>/^[a-f0-9]{40}$/.test(s||'');
const sha64=s=>/^[a-f0-9]{64}$/.test(s||'');
export function bindReviewedQ3ScopeProof({proof,science,scienceGitBlobSha}={}){
  check(proof?.schemaVersion===REVIEWED_SCOPE_SCHEMA
    &&proof.mode==='frozen_source_proof_for_scientific_scope_reviews_not_publication'
    &&Array.isArray(proof.reviewed)
    &&science?.schemaVersion==='gallery-historical-supplemental-scope-assessment-v1'
    &&science.mode==='academic_assessment_only_not_admission_authority'
    &&Array.isArray(science.assessments)
    &&sha40(scienceGitBlobSha)
    &&proof.scientificEvidenceBlobSha===scienceGitBlobSha,
    'q3_reviewed_scope_frozen_science_hash_or_schema_mismatch');
  check(proof.sourceBranch==='staging/historical-archive-nightly'
    &&proof.scientificEvidenceFile==='audit/historical-scope-assessments/2026-10-14-nature-catalysis-issues-07-09.json'
    &&proof.period==='2026-07-01..2026-09-30'
    &&science.period===proof.period
    &&proof.limits?.notPermanentOwnerExclusions===true
    &&proof.limits?.notAcademicAdmissions===true
    &&proof.limits?.sourceShardsRemainImmutable===true,
    'q3_reviewed_scope_source_authority_invalid');
  const scienceRows=new Map();
  for(const r of science.assessments){
    const id=normalize(r.doi);
    check(/^10\.1038\/s41929-026-\d{5}-[0-9a-z]$/.test(id)
      &&id===r.doi&&!scienceRows.has(id)
      &&science.journal==='Nature Catalysis',
      'q3_reviewed_scope_science_doi_invalid:'+id);
    scienceRows.set(id,r);
  }
  check(scienceRows.size===proof.reviewed.length
    &&scienceRows.size===science.accounting?.assessmentCount
    &&science.accounting?.integratedIntoQuarterReconciliation===false,
    'q3_reviewed_scope_reviewed_set_mismatch');
  const bound=[],seen=new Set();
  for(const p of proof.reviewed){
    const id=normalize(p?.doi),r=scienceRows.get(id);
    check(r&&!seen.has(id)&&p.doi===id
      &&p.date===r.date&&p.publisherArticleType===r.publisherArticleType
      &&p.publisherPage===r.publisherPage
      &&p.scientificDecision===r.decision
      &&p.journal==='Nature Catalysis'
      &&typeof p.sourceRootId==='string'
      &&p.sourceShardPath==='audit/historical-staging/review-queue/'+p.sourceRootId+'.json'
      &&sha40(p.stageBatchGitBlobSha)&&sha64(p.stageSourceSha256)
      &&Array.isArray(p.sourceFamilies)&&p.sourceFamilies.length>0
      &&p.sourceFamilies.every(x=>['crossref','openalex'].includes(x))
      &&new Set(p.sourceFamilies).size===p.sourceFamilies.length,
      'q3_reviewed_scope_proof_row_invalid:'+id);
    seen.add(id);
    bound.push({...p,assessment:r});
  }
  const excluded=bound.filter(x=>x.scientificDecision==='exclude').length;
  const pending=bound.filter(x=>x.scientificDecision==='pending').length;
  check(excluded===proof.summary?.scopeExclude
    &&pending===proof.summary?.scopeEvidencePending
    &&excluded+pending===proof.summary?.total
    &&proof.summary?.total===bound.length,
    'q3_reviewed_scope_counter_mismatch');
  return {
    schemaVersion:REVIEWED_SCOPE_AUTHORITY_SCHEMA,
    mode:'scientific_review_and_source_identity_only_not_publication',
    scientificEvidenceBlobSha:scienceGitBlobSha,
    sourceBranch:proof.sourceBranch,
    reviewed:bound
  };
}
