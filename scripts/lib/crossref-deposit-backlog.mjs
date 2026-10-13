// Crossref metadata redeposit provenance is NOT a first-online publication
// date. Backfill historically re-deposited DOI through a separate investigative
// queue rather than flooding the sole 08:00 three-day semantic handoff.
const clean=v=>String(v||'').trim();
const norm=v=>clean(v).toLowerCase();
export function needsHistoricalDepositReview(candidate,{journalRescueStart,endDate,
  createdRecently=false,hasIndependentPublicationDiscovery=false}={}) {
  const d=clean(candidate?.date);
  const datePattern=/^\d{4}-\d{2}-\d{2}$/;
  if(createdRecently)return false;
  if(datePattern.test(d)&&d>=journalRescueStart&&d<=endDate)return false;
  if(!d&&hasIndependentPublicationDiscovery)return false;
  return true;
}
export function buildHistoricalCrossrefDepositBacklog(previous, newlyObserved,{
  acceptedDois=new Set(),confirmedExcludedDois=new Set(),reviewedHistory=new Map(),
  recheckReason=()=>'', journalActivationDates=new Map()
}={}) {
  const map=new Map();
  for(const record of [...(previous||[]),...(newlyObserved||[])]) {
    const doi=norm(record?.doi);
    if(!/^10\.\d{4,9}\/\S+$/.test(doi)
      ||acceptedDois.has(doi)||confirmedExcludedDois.has(doi))continue;
    const date=clean(record.date);
    const activation=journalActivationDates.get(clean(record.journal))||'';
    if(activation && date && date<activation)continue;
    const reviewed=reviewedHistory.get(doi);
    const materialChange=reviewed?.decision==='exclude'?
      recheckReason(record,reviewed):'';
    // A complete, unchanged DOI exclusion has been scientifically reviewed
    // already. Keep Crossref source telemetry, not a fake new review task.
    if(reviewed?.decision==='exclude'&&!materialChange)continue;
    if(reviewed?.decision==='include')continue;
    const previousRow=map.get(doi)||{};
    map.set(doi,{
      doi,journal:clean(record.journal||previousRow.journal),
      title:clean(record.title||previousRow.title),date:date||clean(previousRow.date),
      depositedDate:clean(record.depositedDate||previousRow.depositedDate),
      sourceEvidence:'Crossref DOI-verified metadata redeposit; first-online publication date must be verified independently',
      previousReviewFile:clean(record.previousReviewFile||reviewed?.reviewFile||previousRow.previousReviewFile),
      evidenceBasis:materialChange||clean(record.evidenceBasis||previousRow.evidenceBasis),
      reviewPriority:record.reviewPriority||previousRow.reviewPriority||'normal',
      status:'historical_redeposit_requires_doi_evidence_review',
    });
  }
  return [...map.values()].sort((a,b)=>String(b.depositedDate).localeCompare(String(a.depositedDate))
    ||a.journal.localeCompare(b.journal)||a.doi.localeCompare(b.doi));
}
