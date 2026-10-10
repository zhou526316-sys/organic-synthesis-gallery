// Pure, read-only classification of public summary status against an existing
// reviewed asset. No private evidence content or publisher text is returned.
const REASONS=new Set(['fulltext_missing','evidence_v2_required','scheduled_summary_pending',
  'summary_pending','summary_not_reviewed','summary_stale','summary_invalid']);
export function classifyPublishedAbstractGap(approvedRecord,ui,error=''){
  const approved=approvedRecord?.status==='approved';
  const validApproved=approved&&typeof approvedRecord.zh==='string'
    &&typeof approvedRecord.en==='string'
    &&Boolean(approvedRecord.zh.trim())&&Boolean(approvedRecord.en.trim())
    &&/^[a-f0-9]{64}$/i.test(String(approvedRecord.sourceHash||''))
    &&/^[a-f0-9]{64}$/i.test(String(approvedRecord.evidencePacketHash||''));
  const evidenceAvailable=ui?.evidenceAvailable===true;
  const reason=REASONS.has(String(ui?.reason||''))?String(ui.reason):null;
  const sourceMatches=ui?.sourceHash&&validApproved
    ? ui.sourceHash===approvedRecord.sourceHash:null;
  const packetMatches=ui?.evidencePacketHash&&validApproved
    ? ui.evidencePacketHash===approvedRecord.evidencePacketHash:null;
  let category='';
  if(error||!ui)category='summary_api_unavailable';
  else if(ui.available===true)category='summary_live_available';
  else if(approved&&!validApproved)category='approved_record_invalid';
  else if(!validApproved)category='no_approved_summary_record';
  else if(!evidenceAvailable&&reason==='evidence_v2_required')category='approved_legacy_evidence_only';
  else if(!evidenceAvailable)category='approved_but_evidence_unavailable';
  else if(sourceMatches===false||packetMatches===false)category='approved_evidence_hash_mismatch';
  else if(sourceMatches===true&&packetMatches===true)category='approved_hash_match_but_not_served';
  else category='approved_evidence_state_unknown';
  const remediation={
    summary_api_unavailable:'investigate_api_transport',
    summary_live_available:'none',
    approved_record_invalid:'independently_review_again',
    no_approved_summary_record:'recover_trusted_original_abstract',
    approved_legacy_evidence_only:'revalidate_evidence_v2',
    approved_but_evidence_unavailable:'restore_original_verified_evidence',
    approved_evidence_hash_mismatch:'re_review_against_current_evidence',
    approved_hash_match_but_not_served:'inspect_asset_deployment_and_summary_read',
    approved_evidence_state_unknown:'inspect_verified_evidence_and_review'
  }[category];
  return {category,remediation,reason,
    evidenceAvailable,evidenceLevel:ui?.evidenceLevel||null,
    evidenceSourceHashMatchesApproved:sourceMatches,
    evidencePacketHashMatchesApproved:packetMatches,
    storedReviewedRecord:approved,validReviewedRecord:validApproved};
}
