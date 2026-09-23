// Shared by Worker capture receipts and the approved static publication builder.
// A marker is an evidence index, never permission to publish an image.
export const BODY_REVIEW_MARKER_REVISION = '1';
export const BODY_MEDIA_GENERATION = 1790082000000;

const text = value => String(value ?? '').trim();
export function bodyFigureId(value) {
  const match = text(value).match(/^(figure|fig\.?|scheme|chart)[ -]*(\d{1,3})$/i);
  return match ? (/^fig/i.test(match[1]) ? 'figure' : match[1].toLowerCase()) + '-' + Number(match[2]) : '';
}
function sourceUrl(value) {
  try {
    const u = new URL(text(value));
    if (u.protocol !== 'https:' || u.username || u.password) return '';
    u.hash = '';
    return u.toString();
  } catch { return ''; }
}
export function sourceDois(value) {
  let s = sourceUrl(value).split(/[?#]/, 1)[0];
  for (let i = 0; i < 3; i += 1) {
    try { const next = decodeURIComponent(s); if (next === s) break; s = next; } catch { break; }
  }
  const set = new Set([...s.matchAll(/10\.(1021|1002|1038|1126|1039|1016|31635)[/_]([a-z0-9._()-]+)/ig)]
    .map(m => '10.' + m[1] + '/' + m[2].toLowerCase()));
  try {
    const u = new URL(s);
    const m = u.pathname.match(/^\/articles\/(s\d+-\d+-\d+[a-z0-9-]*)/i);
    if (/^(?:www\.)?nature\.com$/i.test(u.hostname) && m) set.add('10.1038/' + m[1].toLowerCase());
  } catch {}
  return [...set].sort();
}
export function bodyEvidenceRecord(item, sha256) {
  // Exclude job/time so a byte-identical recapture can reuse a valid approval.
  // Include role, caption, page and source so relabelling never reuses approval.
  return {
    schema: 'body-evidence-v1', mediaGeneration: Number(item.mediaGeneration || BODY_MEDIA_GENERATION),
    doi: text(item.doi).toLowerCase(), id: text(item.id), role: 'article_figure',
    label: text(item.label), caption: text(item.caption),
    articleUrl: sourceUrl(item.articleUrl), sourceUrl: sourceUrl(item.sourceUrl),
    pageDoi: text(item.pageDoi).toLowerCase(), captureVersion: text(item.captureVersion),
    sha256: text(sha256).toLowerCase(), contentType: text(item.contentType).toLowerCase(),
    byteLength: Number(item.byteLength || 0), width: Number(item.width || 0), height: Number(item.height || 0),
    order: Number(item.sortOrder ?? item.order ?? 0)
  };
}
export function canonicalBodyEvidence(item, sha256) {
  return JSON.stringify(bodyEvidenceRecord(item, sha256));
}
export async function buildBodyReviewMarker(item, sha256) {
  const e = bodyEvidenceRecord(item, sha256);
  const validDoi = /^10\.\d{4,9}\/\S+$/.test(e.doi);
  const articleDois = sourceDois(e.articleUrl), imageDois = sourceDois(e.sourceUrl);
  const conflicts = [...articleDois, ...imageDois].some(d => d !== e.doi);
  const identity = validDoi && e.pageDoi === e.doi && e.captureVersion === '6.2.20' &&
    e.mediaGeneration === BODY_MEDIA_GENERATION && /^[a-z0-9-]{16,80}$/i.test(text(item.jobId));
  const label = Boolean(bodyFigureId(e.label) && bodyFigureId(e.label) === e.id);
  const hashValid = /^[a-f0-9]{64}$/.test(e.sha256);
  const fields = Boolean(e.articleUrl && e.sourceUrl && e.caption && e.byteLength >= 100 && e.byteLength <= 4000000 && e.width > 0 && e.height > 0);
  const reasons = [];
  if (!identity) reasons.push('task_page_binding_incomplete');
  if (!label) reasons.push('figure_label_identity_incomplete');
  if (!hashValid) reasons.push('full_sha256_missing');
  if (!fields) reasons.push('source_caption_or_dimensions_incomplete');
  if (conflicts) reasons.push('source_doi_conflict');
  else if (!articleDois.includes(e.doi) || !imageDois.includes(e.doi)) reasons.push('opaque_source_needs_provenance');
  const bytes = new TextEncoder().encode(JSON.stringify(e));
  const evidenceSha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
  return {
    schemaVersion: 1, revision: BODY_REVIEW_MARKER_REVISION,
    assetKey: e.doi + '|' + e.id + '|' + e.sha256, evidenceSha256,
    sha256: e.sha256, role: 'article_figure',
    state: reasons.length ? 'needs_evidence' : 'pending_review', reasons,
    byteIntegrity: hashValid ? 'server_computed_sha256' : 'unverified',
    semanticReview: 'not_reviewed', published: false,
    authority: 'verified-storage-receipt; publication requires a separate reviewed manifest'
  };
}
