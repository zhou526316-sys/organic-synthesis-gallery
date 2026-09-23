// Called only after the intake guard and actual object checksum verification.
// A marker is review evidence, never an upload permission or publication approval.
export const BODY_REVIEW_MARKER_SCHEMA = 'body-review-v1';
const CUTOVER = 1790082000000;
const sha = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');
export function bodyFigureId(value) {
  const match = String(value || '').trim().match(/^(figure|fig\.?|scheme|chart)[ -]*(\d{1,3})$/i);
  return match ? (/^fig/i.test(match[1]) ? 'figure' : match[1].toLowerCase()) + '-' + Number(match[2]) : '';
}
function evidenceUrl(value) {
  try { const u = new URL(String(value || '')); return u.protocol === 'https:' ? u.origin + u.pathname : ''; } catch { return ''; }
}
function urlDois(value) {
  let text = evidenceUrl(value);
  for (let i = 0; i < 3; i++) { try { const next = decodeURIComponent(text); if (next === text) break; text = next; } catch { break; } }
  const found = new Set([...text.matchAll(/10\.(1021|1002|1038|1126|1039|1016|31635)[/_]([a-z0-9._()-]+)/ig)].map(m => ('10.' + m[1] + '/' + m[2]).toLowerCase()));
  try { const u = new URL(text); if (/^(?:www\.)?nature\.com$/i.test(u.hostname)) { const m = u.pathname.match(/^\/articles\/(s\d+-\d+-\d+[a-z0-9-]*)/i); if (m) found.add('10.1038/' + m[1].toLowerCase()); } } catch {}
  return [...found];
}
export async function buildBodyReviewMarker(entry, fullSha256) {
  if (!/^[a-f0-9]{64}$/.test(fullSha256 || '')) throw new Error('body_review_full_digest_required');
  const doi = String(entry.doi || '').toLowerCase(), id = String(entry.id || '');
  const articleUrl = evidenceUrl(entry.articleUrl), sourceUrl = evidenceUrl(entry.sourceUrl);
  const pageIds = urlDois(articleUrl), imageIds = urlDois(sourceUrl);
  const checks = {
    pageTaskBinding: /^10\.\d{4,9}\/\S+$/.test(doi) && entry.pageDoi === doi && /^[a-z0-9-]{16,80}$/i.test(entry.jobId || ''),
    currentGeneration: entry.captureVersion === '6.2.20' && entry.mediaGeneration === CUTOVER,
    articleUrlDoi: pageIds.length === 1 && pageIds[0] === doi,
    imageUrlDoi: imageIds.length === 1 && imageIds[0] === doi,
    figureLabel: Boolean(bodyFigureId(id)) && bodyFigureId(id) === bodyFigureId(entry.label),
    individualCaption: Boolean(String(entry.caption || '').trim()),
    imageMetadata: Number(entry.width) > 0 && Number(entry.height) > 0 && Number(entry.byteLength) >= 100 && Number(entry.byteLength) <= 4000000,
    byteDigest: fullSha256.startsWith(String(entry.contentHash || 'invalid')) && /^[a-f0-9]{32}$/.test(entry.contentHash || '')
  };
  const blockers = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  const assetKey = await sha(JSON.stringify([doi, id, fullSha256]));
  // Stable across retries/new job IDs, but changes if a caption, source, role or file changes.
  const evidenceKey = await sha(JSON.stringify([BODY_REVIEW_MARKER_SCHEMA, doi, id, String(entry.label || ''), String(entry.caption || ''), articleUrl, sourceUrl, fullSha256, String(entry.contentType || ''), Number(entry.width || 0), Number(entry.height || 0), CUTOVER]));
  return { schema: BODY_REVIEW_MARKER_SCHEMA, assetKey, evidenceKey, contentSha256: fullSha256,
    role: 'article_figure', state: 'pending_review', eligibility: blockers.length ? 'manual_evidence_required' : 'provenance_ready',
    checks, blockers, publicationApproved: false, published: false };
}
