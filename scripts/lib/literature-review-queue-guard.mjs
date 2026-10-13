// Separate first-online-date uncertainty and changed historical evidence
// from a fresh, fully enumerated 08:00 semantic review handoff.
// No filter in this module is an exclude decision or a production admission.
const VALID_DATE=/^\d{4}-\d{2}-\d{2}$/;

export function publisherOnlyReviewEligible(candidate,primaryStart,endDate) {
  const feed=String(candidate?.publisherFeedUrl||'');
  if(!feed) return true;
  const sources=Array.isArray(candidate?.sources)?candidate.sources:[];
  // Crossref / OpenAlex article-date evidence restores normal machine review.
  if(sources.some(x=>String(x).startsWith('crossref:')||String(x).startsWith('openalex:')))
    return true;
  const actual=String(candidate?.date||'');
  if(VALID_DATE.test(actual))
    return actual>=primaryStart&&actual<=endDate;
  const observed=String(candidate?.feedDate||'');
  // RSS dates are NOT first-online dates. This only chooses which feed-only
  // DOI can be meaningfully checked before the upcoming release.
  return VALID_DATE.test(observed)&&observed>=primaryStart&&observed<=endDate;
}

export function exclusionRecheckBelongsToPrimaryWindow(candidate,primaryStart,endDate) {
  const date=String(candidate?.date||'');
  // Historic reviewed DOI changes remain documented separately. Do not
  // reclassify them as fresh, undiscovered DOI in the 3-day primary window.
  return VALID_DATE.test(date)&&date>=primaryStart&&date<=endDate;
}

export function buildUnverifiedPublisherBacklog(previous,observed,{
  discoveredDoiSet=new Set(),galleryDoiSet=new Set(),confirmedExclusionDoiSet=new Set(),
}={}) {
  const norm=v=>String(v||'').trim().toLowerCase();
  const results=new Map();
  for(const row of [...(previous||[]),...(observed||[])]) {
    const doi=norm(row?.doi);
    if(!/^10\.\d{4,9}\/\S+/.test(doi))continue;
    if(discoveredDoiSet.has(doi)||galleryDoiSet.has(doi)||confirmedExclusionDoiSet.has(doi))continue;
    const former=results.get(doi)||{};
    results.set(doi,{
      doi,journal:String(row.journal||former.journal||''),
      title:String(row.title||former.title||''),
      publisherFeedUrl:String(row.publisherFeedUrl||former.publisherFeedUrl||''),
      feedDate:String(row.feedDate||former.feedDate||''),
      status:'first_online_date_unverified',
      sourceEvidence:'publisher_feed_identity_only',
    });
  }
  return [...results.values()].sort((a,b)=>a.journal.localeCompare(b.journal)||a.doi.localeCompare(b.doi));
}

export function mergeHistoricalRecheckBacklog(previous,current,reviewedHistory,confirmedExclusions) {
  const rows=new Map();
  for(const record of [...(previous||[]),...(current||[])]) {
    const doi=String(record?.doi||'').trim().toLowerCase();
    if(!/^10\.\d{4,9}\/\S+/.test(doi)||confirmedExclusions.has(doi))continue;
    if(reviewedHistory.has(doi)&&reviewedHistory.get(doi).decision!=='exclude')continue;
    const existing=rows.get(doi)||{};
    rows.set(doi,{
      doi,journal:record.journal||existing.journal||'',
      title:record.title||existing.title||'',
      date:record.date||existing.date||'',
      reason:record.reason||existing.reason||'',
      previousReviewFile:record.previousReviewFile||existing.previousReviewFile||'',
      reviewPriority:record.reviewPriority||existing.reviewPriority||'normal',
      status:'historical_evidence_challenge_pending',
    });
  }
  return [...rows.values()].sort((a,b)=>(
    (a.reviewPriority==='high'?0:1)-(b.reviewPriority==='high'?0:1)
    ||String(b.date).localeCompare(String(a.date))||a.doi.localeCompare(b.doi)
  ));
}
