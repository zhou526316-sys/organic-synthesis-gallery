import {isRetrospectiveAdmission,paperMediaPolicy} from './historical-literature-policy.js';

// Independent release verifier: match the card renderer's existing policy,
// not the queue's acquisition policy. Ordinary Sep cards can retain previously
// published figures; Oct late-admissions of Sep DOIs display TOC only.
export function liveCardMediaMode(article) {
  if(!article||typeof article!=='object'||!/^10\.\d{4,9}\//i.test(String(article.doi||'')))
    throw new Error('live_card_missing_verified_doi');
  const expected=paperMediaPolicy(article);
  const declared=article.mediaPolicy;
  if(declared && declared!==expected) throw new Error('live_card_queue_policy_conflict:'+article.doi);
  return isRetrospectiveAdmission(article)?expected:'standard';
}
export function liveCardArticleByDoi(queue) {
  if(!Array.isArray(queue?.articles)||queue.articles.length!==queue.webpageDoiCount)
    throw new Error('live_card_canonical_queue_incomplete');
  const map=new Map();
  for(const article of queue.articles) {
    const doi=String(article?.doi||'').trim().toLowerCase();
    if(!/^10\.\d{4,9}\//.test(doi)||map.has(doi))
      throw new Error('live_card_duplicate_or_invalid_doi');
    map.set(doi,article);
  }
  return map;
}
export function liveCardModeForDoi(byDoi,doi) {
  const key=String(doi||'').trim().toLowerCase(),article=byDoi.get(key);
  if(!article)throw new Error('live_card_doi_not_in_current_queue:'+key);
  return liveCardMediaMode(article);
}
