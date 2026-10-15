/**
 * Verified publisher landing for publishers with a DOI-identity-preserving
 * deterministic official article URL. All other DOI links remain on doi.org.
 * This is presentation only; DOI identity, admission, metadata and corpus
 * publication timestamps are never rewritten.
 */
import { normalizeDoi } from './literature-identity.mjs';

export function publisherArticleHref(doi, journal) {
  const canonical = normalizeDoi(doi);
  if (!canonical) return null;
  const journalName = String(journal || '').trim();
  // All Springer Nature research DOI in this article form have a matching
  // nature.com/articles/<suffix> route. This avoids third-party doi.org
  // resolver failures while preserving the identical canonical DOI.
  if (/^nature(?:\s|$)/i.test(journalName)
    && /^10\.1038\/s\d{5}-\d{3}-\d{4,6}-[a-z0-9]+$/i.test(canonical)) {
    return 'https://www.nature.com/articles/' + canonical.slice('10.1038/'.length);
  }
  return 'https://doi.org/' + canonical;
}
