/**
 * Independent historical archive admission contract.
 * A two-pass scope decision is not a publication. Only the already-authorized
 * 08:00 fixed-slot literature writer may turn these records into Gallery cards.
 */
export const HISTORICAL_APPROVED_PATH='audit/historical-reviewed/approved-admissions.json';
const DOI=/^10\.\d{4,9}\/\S+$/;
const SHA=/^[a-f0-9]{40}$/;
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)
  &&Number.isFinite(Date.parse(v+'T00:00:00Z'))
  &&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const doi=v=>String(v||'').trim().toLowerCase();
const s=v=>typeof v==='string'?v.trim():'';
function requireValid(ok,message){if(!ok)throw Error(message)}
export const normalizeHistoricalDoi=doi;
export function validateHistoricalApproval(artifact){
  requireValid(artifact?.schemaVersion==='gallery-historical-scope-reviewed-pilot-v1'
    &&artifact.mode==='scope_review_only_not_publication'
    &&Array.isArray(artifact.accepted)&&Array.isArray(artifact.pending),
    'historical_review_untrusted_schema');
  requireValid(artifact?.auditGuards?.noPublication===true
    &&artifact.auditGuards.noMediaWrites===true
    &&artifact.auditGuards.noPDF===true
    &&artifact.auditGuards.notDailyNew===true
    &&artifact.auditGuards.notHot===true
    &&artifact.auditGuards.requiresFixed08Release===true,
    'historical_review_safety_flags_missing');
  requireValid(artifact?.scopeRulesFile==='docs/literature-scope-contract.md'
    &&artifact.scopeCorrectionsFile==='audit/literature-scope-corrections.json'
    &&SHA.test(s(artifact.scopeRulesBlobSha))
    &&SHA.test(s(artifact.scopeCorrectionsBlobSha)),
    'historical_review_scope_fingerprint_missing');
  requireValid(artifact?.summary?.include===artifact.accepted.length
    &&artifact.summary.pending===artifact.pending.length
    &&artifact.summary.checked===artifact.accepted.length+artifact.pending.length,
    'historical_review_partition_incomplete');
  const all=new Set();
  for(const item of [...artifact.accepted,...artifact.pending]){
    const id=doi(item?.doi);
    requireValid(DOI.test(id)&&id===item.doi&&!all.has(id),
      'historical_review_doi_invalid_or_duplicate:'+id);
    all.add(id);
    requireValid(s(item.title).length>=14&&date(item.date),'historical_review_identity_invalid:'+id);
  }
  for(const item of artifact.accepted){
    const id=item.doi,policy=item.date<'2026-07-01'?'metadata_only'
      :item.date<='2026-09-30'?'toc_only':null;
    requireValid(policy!==null&&item.ingestionChannel==='historical_backfill'
      &&item.mediaPolicy===policy&&item.addedDate===''&&item.new===false,
      'historical_review_wrong_capture_or_newness:'+id);
    requireValid(item.decision==='include'&&item.reviewPasses===2
      &&item.firstPassDecision==='include'&&item.challengeDecision==='include'
      &&item.reviewStatus==='two_pass_scope_include_awaiting_fixed_slot',
      'historical_review_two_pass_missing:'+id);
    requireValid(s(item.journal).length>1&&/[\u3400-\u9fff]/u.test(s(item.titleZh))
      &&Array.isArray(item.authors)&&item.authors.length>0
      &&doi(item.citation?.doi)===id,
      'historical_review_bibliography_missing:'+id);
    for(const key of ['primaryContribution','preparativeTransformation','generalityEvidence',
      'sourceEvidence','boundaryChallenge']){
      requireValid(s(item.scopeAssessment?.[key]).length>=35,
        'historical_review_scope_evidence_missing:'+key+':'+id);
    }
    requireValid(s(item.reason).length>=25&&s(item.evidenceBasis).length>=80
      &&s(item.challengeReason).length>=40,
      'historical_review_challenge_missing:'+id);
    const ev=item.reviewEvidence;
    requireValid(ev?.publisherOnlineDate===item.date
      &&typeof ev.publisherPage==='string'
      &&ev.publisherPage.startsWith('https://')
      &&ev.publisherPage.toLowerCase().includes('/'+id)
      &&ev.stageBranch==='staging/historical-archive-nightly'
      &&SHA.test(s(ev.stageBatchSha))
      &&s(ev.stageBatchId).includes('_')
      &&Array.isArray(ev.crossrefOpenalexSources)
      &&ev.crossrefOpenalexSources.length>0
      &&ev.abstractCopied===false&&ev.figureFetched===false&&ev.pdfFetched===false,
      'historical_review_source_identity_missing:'+id);
    requireValid(item.publisherAbstractRights==='not_verified_do_not_republish_full_text'
      &&item.abstract===undefined&&item.abstractText===undefined
      &&item.fullText===undefined&&item.pdf===undefined,
      'historical_review_rights_not_verified:'+id);
  }
  for(const item of artifact.pending){
    requireValid(item.decision==='pending'&&item.challengeDecision==='pending'
      &&item.reviewStatus==='pending_source_date_conflict'
      &&s(item.evidenceNeeded).length>=40&&s(item.nextAction).length>=25,
      'historical_review_pending_conflated_with_include:'+item.doi);
  }
  return artifact.accepted;
}
export function selectHistoricalAdmissions(artifact,{published=new Set(),excluded=new Set(),dailyDois=new Set()}={}){
  const approved=validateHistoricalApproval(artifact);
  const selected=[];
  for(const row of approved){
    const id=doi(row.doi);
    requireValid(!excluded.has(id),'historical_review_excluded_doi:'+id);
    requireValid(!dailyDois.has(id),'historical_review_daily_overlap:'+id);
    if(!published.has(id))selected.push(row);
  }
  return selected;
}
export function historicCard(row){
  const policy=row.date<'2026-07-01'?'metadata_only':'toc_only';
  return {
    journal:row.journal,title:row.title,titleZh:row.titleZh,doi:row.doi,
    date:row.date,authors:[...row.authors],url:'https://doi.org/'+row.doi,
    ingestionChannel:'historical_backfill',mediaPolicy:policy,addedDate:'',new:false,
    ...(row.title.toLowerCase().startsWith('total synthesis of ')?{totalSynthesis:true,cardLabel:'Total Synthesis'}:{})
  };
}
