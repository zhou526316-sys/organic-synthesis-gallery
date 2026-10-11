import { normalizeDoi } from '../../shared/pdf-vault-v1.mjs';

const DOI_REGEX = /10\.\d{4,9}\s*\/\s*[-._;()/:a-z0-9%]+/ig;
const MAX_TEXT = 24_000;

// Identifies a DOI in document text or publisher PDF metadata. Filenames are
// never treated as evidence of a document DOI. The first page is deliberately
// used rather than searching a reference list on later pages.
export function extractPdfDois(source) {
  if (typeof source !== 'string') return [];
  const text = source.slice(0, MAX_TEXT).replace(/\u200b|\u200c|\u200d/g, '');
  const found = new Set();
  for (const match of text.matchAll(DOI_REGEX)) {
    const compact = match[0].replace(/\s+/g, '');
    const value = normalizeDoi(compact.replace(/[.,;:)}\]]+$/g, ''));
    if (value && value.length <= 512) found.add(value);
  }
  return [...found];
}

export function filenameDoiHint(name, doi) {
  const target = normalizeDoi(doi);
  if (!target || typeof name !== 'string') return false;
  const suffix = target.slice(target.indexOf('/') + 1).replace(/[^a-z0-9]/g, '');
  const flat = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  // The suffix is only a scan ordering hint; it does NOT establish identity.
  return suffix.length >= 7 && flat.includes(suffix);
}

function supportingInformation(firstPageText, name = '') {
  // Use the title/first-page region, not "see Supporting Information" in the
  // footnote of an otherwise valid paper.
  const lead = String(firstPageText || '').slice(0, 1100);
  const filename = String(name || '');
  return /(?:^|[\s_-])(?:supporting|supplementary)\s+(?:information|material|data)(?:\b|$)/i.test(lead) ||
    /(?:^|[._-])(?:si|supporting|supplementary)(?:[._-]|$)/i.test(filename);
}

export function evaluatePdfDoiIdentity({ metadataText = '', firstPageText = '', filename = '' } = {}, doi) {
  const target = normalizeDoi(doi);
  if (!target) return { status: 'unknown', doi: null, foundDois: [] };
  const meta = extractPdfDois(metadataText);
  const page = extractPdfDois(firstPageText);
  const found = [...new Set([...meta, ...page])];
  if (supportingInformation(firstPageText, filename)) {
    return { status: 'supporting', doi: target, foundDois: found };
  }
  // A publisher-supplied unique DOI in the metadata takes precedence over
  // incidental DOIs mentioned on page one; contradictory metadata fails.
  if (meta.length === 1 && meta[0] === target) {
    return { status: 'match', doi: target, foundDois: found, evidence: 'metadata' };
  }
  if (meta.length > 1) return { status: 'ambiguous', doi: target, foundDois: found };
  if (meta.length === 1 && meta[0] !== target) {
    return { status: 'mismatch', doi: target, foundDois: found };
  }
  if (page.length === 1 && page[0] === target) {
    return { status: 'match', doi: target, foundDois: found, evidence: 'first_page' };
  }
  if (page.length > 1) return { status: 'ambiguous', doi: target, foundDois: found };
  if (page.length === 1) return { status: 'mismatch', doi: target, foundDois: found };
  return { status: 'unknown', doi: target, foundDois: [] };
}
