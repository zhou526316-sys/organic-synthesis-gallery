import { createHash } from 'node:crypto';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export const PRIVATE_PDF_PROCESSOR_REVISION = 'private-pdf-readable-v2';
const STOP = new Set(['the','and','for','with','from','into','via','using','based','toward','towards','through','over','under','between','their','this','that','these','those','study','new','novel','highly']);

export function normalizeVerifierDoi(value) {
  const raw = String(value || '').trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '')
    .replace(/^doi:\s*/i, '').replace(/[?#].*$/, '').replace(/[).,;]+$/, '');
  return /^10\.\d{4,9}\/\S+$/.test(raw) ? raw : '';
}
function normalizeWords(value) {
  return String(value || '').normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function tokens(value) {
  return [...new Set(normalizeWords(value).split(/\s+/).filter(token => token.length >= 3 && !STOP.has(token)))];
}
function compact(value) { return normalizeWords(value).replace(/\s+/g, ''); }
export function titleScoreMilli(title, text) {
  const titleTokens = tokens(title);
  if (!titleTokens.length) return 0;
  const compactTitle = compact(title), compactText = compact(text);
  if (compactTitle.length >= 12 && compactText.includes(compactTitle)) return 1000;
  const body = new Set(tokens(text));
  return Math.round(1000 * titleTokens.filter(token => body.has(token)).length / titleTokens.length);
}
function authorSurname(value) { const parts = tokens(value); return parts.length ? parts.at(-1) : ''; }
function containsTargetDoi(text, doi) {
  const target = normalizeVerifierDoi(doi);
  if (!target) return false;
  return String(text || '').toLowerCase().replace(/\s+/g, '').includes(target);
}
function hasSupplementMarker(firstPage, metadataTitle, sourceKind) {
  if (sourceKind === 'supplement') return true;
  const metadata = normalizeWords(metadataTitle);
  if (/^(?:supporting information|supplementary information|electronic supplementary information|supplementary material)\b/.test(metadata)) return true;
  if (sourceKind === 'article') return false;
  const start = normalizeWords(firstPage).slice(0, 500);
  const marker = /\b(?:supporting information|supplementary information|electronic supplementary information|supplementary material)\b/.exec(start);
  return Boolean(marker && marker.index <= 80);
}
export function sha256Hex(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

export async function verifyPrivatePdfBytes(bytes, item, { maxPages = 12, maxChars = 250000 } = {}) {
  const base = { pageCount: 0, textChars: 0, doiMatch: false, titleScoreMilli: 0,
    metadataTitleScoreMilli: 0, authorMatches: 0, supplementMarker: false, reason: 'parser_error' };
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1024) return { decision: 'failed', evidence: { ...base, reason: 'pdf_invalid' } };
  if (sha256Hex(bytes) !== String(item?.contentHash || '').toLowerCase()) return { decision: 'failed', evidence: { ...base, reason: 'object_mismatch' } };
  const catalog = item?.catalog;
  if (!catalog?.title) return { decision: 'failed', evidence: { ...base, reason: 'catalog_record_missing' } };

  let loadingTask = null;
  try {
    loadingTask = getDocument({ data: bytes, disableAutoFetch: true, disableRange: true, disableStream: true,
      stopAtErrors: true, isEvalSupported: false, enableXfa: false, useSystemFonts: true, verbosity: 0 });
    const pdf = await loadingTask.promise;
    base.pageCount = Number(pdf.numPages || 0);
    if (!Number.isSafeInteger(base.pageCount) || base.pageCount < 1) return { decision: 'failed', evidence: { ...base, reason: 'pdf_invalid' } };
    let metadataText = '', metadataTitle = '';
    try {
      const metadata = await pdf.getMetadata();
      metadataTitle = String(metadata?.info?.Title || metadata?.metadata?.get?.('dc:title') || '');
      metadataText = [metadataTitle, metadata?.info?.Subject, metadata?.info?.Author, metadata?.info?.Keywords].filter(Boolean).join(' ');
    } catch {}
    const pages = [];
    const count = Math.min(base.pageCount, maxPages);
    let chars = 0;
    for (let pageNumber = 1; pageNumber <= count && chars < maxChars; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent({ disableNormalization: false });
      const pageText = (content.items || []).map(row => typeof row?.str === 'string' ? row.str : '').filter(Boolean).join(' ');
      const clipped = pageText.slice(0, Math.max(0, maxChars - chars));
      pages.push(clipped); chars += clipped.length;
    }
    const firstPage = pages[0] || '', text = pages.join('\n'), combined = text + '\n' + metadataText;
    base.textChars = text.length;
    base.doiMatch = containsTargetDoi(combined, item.doi);
    base.titleScoreMilli = titleScoreMilli(catalog.title, text);
    base.metadataTitleScoreMilli = titleScoreMilli(catalog.title, metadataTitle);
    base.supplementMarker = hasSupplementMarker(firstPage, metadataTitle, item.sourceKind);
    const bodyWords = new Set(tokens(firstPage + ' ' + (pages[1] || '')));
    base.authorMatches = (catalog.authors || []).slice(0, 12).map(authorSurname).filter(Boolean).filter(surname => bodyWords.has(surname)).length;
    if (base.supplementMarker) return { decision: 'failed', evidence: { ...base, reason: 'supplement_detected' } };
    const bestTitleScore = Math.max(base.titleScoreMilli, base.metadataTitleScoreMilli);
    if (!base.doiMatch && !(item.sourceKind === 'article' && bestTitleScore >= 900)) {
      return { decision: 'failed', evidence: { ...base, reason: 'doi_missing' } };
    }
    if (bestTitleScore < 450) return { decision: 'failed', evidence: { ...base, reason: 'title_mismatch' } };
    if (base.textChars < 64) return { decision: 'failed', evidence: { ...base, reason: 'pdf_invalid' } };
    return { decision: 'verified', evidence: { ...base, reason: 'verified_identity' } };
  } catch (error) {
    return { decision: 'failed', evidence: { ...base, reason: error?.name === 'PasswordException' ? 'pdf_password' : 'parser_error' } };
  } finally {
    try { await loadingTask?.destroy(); } catch {}
  }
}
