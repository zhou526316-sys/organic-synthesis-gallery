// Re-open ONLY when substantive DOI-verified metadata has changed.
// Never promote an exclusion to include without new two-pass semantic review.
const text=value=>String(value||'').replace(/<[^>]*>/g,' ')
  .replace(/\s+/g,' ').trim().toLowerCase();
export function exclusionEvidenceRecheckReason(candidate,previous,{confirmedExcluded=false}={}){
  if(confirmedExcluded||!previous||previous.decision!=='exclude')return '';
  const currentAbstract=text(candidate.abstract),oldAbstract=text(previous.abstract);
  if(currentAbstract.length>=140&&oldAbstract.length<140)
    return 'new_substantive_abstract_after_previous_exclusion';
  if(currentAbstract.length>=220&&oldAbstract.length>=140
    &&currentAbstract.slice(0,180)!==oldAbstract.slice(0,180))
    return 'changed_substantive_abstract';
  const currentTitle=text(candidate.title),oldTitle=text(previous.title);
  if(currentTitle&&oldTitle&&currentTitle!==oldTitle)return 'changed_article_title';
  if(candidate.journal&&previous.journal&&candidate.journal!==previous.journal)
    return 'changed_journal_identity';
  if(candidate.date&&previous.date&&candidate.date!==previous.date)
    return 'changed_publication_date';
  return '';
}
