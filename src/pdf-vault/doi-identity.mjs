import { normalizeDoi } from '../../shared/pdf-vault-v1.mjs';

// First-page evidence only: never search a full reference list and mistake a
// cited article for the PDF's actual identity. Filenames are ordering hints.
const DOI_REGEX = /\b10\.\d{4,9}\/[-._;()/:a-z0-9%]+/ig;
const LABELLED_DOI_REGEX = /(?:\bdoi\s*[:：=]\s*|(?:https?:\/\/)?(?:dx\.)?doi\.org\s*\/\s*)(10\.\d{4,9}\/[-._;()/:a-z0-9%]+)/ig;
const MAX_TEXT = 24_000;

function prepareEvidence(value) {
  if (typeof value !== 'string') return '';
  return value.slice(0, MAX_TEXT).replace(/[\u200b-\u200d\u00ad]/g, '')
    .replace(/10\s*\.\s*(\d{4,9})\s*\/\s*/gi, '10.$1/')
    // PDF.js sometimes separates an ACS DOI suffix after a punctuation mark.
    // Only reconnect a DOI token already ending in DOI punctuation, never
    // arbitrary neighboring words or citations.
    .replace(/(10\.\d{4,9}\/[-._;()/:a-z0-9%]{2,90}[._/-])\s+([a-z0-9]{2,24})\b/gi, '$1$2')
    .replace(/(10\.\d{4,9}\/[-._;()/:a-z0-9%]{2,90}\d[a-z]?)\s+(\d{3,7})\b/gi, '$1$2');
}

function collect(source, regex) {
  const text = prepareEvidence(source);
  const found = new Set();
  regex.lastIndex = 0;
  for (const match of text.matchAll(regex)) {
    const raw = match[1] || match[0];
    const value = normalizeDoi(raw.replace(/[.,;:)}\]]+$/g, ''));
    if (value && value.length <= 512) found.add(value);
  }
  return [...found];
}

export function extractPdfDois(source) {
  return collect(source, DOI_REGEX);
}

export function extractLabelledPdfDois(source) {
  return collect(source, LABELLED_DOI_REGEX);
}

export function filenameDoiHint(name, doi) {
  const target = normalizeDoi(doi);
  if (!target || typeof name !== 'string') return false;
  const suffix = target.slice(target.indexOf('/') + 1).replace(/[^a-z0-9]/g, '');
  const flat = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return suffix.length >= 7 && flat.includes(suffix);
}

function supportingInformation(firstPageText, name = '') {
  const lead = String(firstPageText || '').trim().slice(0, 450);
  const filename = String(name || '');
  return /^(?:electronic\s+)?(?:supporting|supplementary)\s+(?:information|material|data)\b/i.test(lead) ||
    /(?:^|[._-])(?:si|supporting|supplementary)(?:[._-]|$)/i.test(filename);
}

export function inferPdfDoiIdentity({ metadataText = '', firstPageText = '', filename = '' } = {}) {
  const meta = extractPdfDois(metadataText);
  const page = extractPdfDois(firstPageText);
  const labelled = extractLabelledPdfDois(firstPageText);
  const found = [...new Set([...meta, ...page])];
  if (supportingInformation(firstPageText, filename)) {
    return { status: 'supporting', doi: meta[0] || labelled[0] || page[0] || null, foundDois: found };
  }
  if (meta.length > 1) return { status: 'ambiguous', doi: null, foundDois: found };
  if (meta.length === 1) return { status: 'match', doi: meta[0], foundDois: found, evidence: 'metadata' };
  // A clearly labelled DOI/doi.org link identifies the document more
  // reliably than unlabelled citations also appearing on page one.
  if (labelled.length > 1) return { status: 'ambiguous', doi: null, foundDois: found };
  if (labelled.length === 1) return { status: 'match', doi: labelled[0], foundDois: found, evidence: 'first_page_label' };
  if (page.length > 1) return { status: 'ambiguous', doi: null, foundDois: found };
  if (page.length === 1) return { status: 'match', doi: page[0], foundDois: found, evidence: 'first_page' };
  return { status: 'unknown', doi: null, foundDois: [] };
}

export function evaluatePdfDoiIdentity(document, doi) {
  const target = normalizeDoi(doi);
  if (!target) return { status: 'unknown', doi: null, foundDois: [] };
  const result = inferPdfDoiIdentity(document);
  if (result.status !== 'match') return { ...result, expectedDoi: target };
  return result.doi === target
    ? { ...result, expectedDoi: target }
    : { ...result, status: 'mismatch', expectedDoi: target };
}
