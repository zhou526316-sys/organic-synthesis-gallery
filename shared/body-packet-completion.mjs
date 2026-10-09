// Shared terminal body-packet gate. R2 staging is evidence, not publication.
// A separate, verified primary visual plus per-asset validation is mandatory.
export function completedBodyPacket(row) {
  if (!row || row.final !== true || row.captureVersion !== '6.2.20'
    || !/^[a-z0-9-]{16,80}$/i.test(String(row.jobId || ''))
    || !String(row.mediaNeed || '').includes('figures')) return false;
  const discovered = Number(row.figuresDiscovered);
  const stored = Number(row.figuresStored);
  if (!Number.isInteger(discovered) || discovered < 1 || stored !== discovered) return false;
  if (row.status === 'success') return true;
  // Only an independent, explicitly identified PDF HTTP 403 can turn an
  // otherwise complete capture into an acceptable partial body packet.
  // It must not cause the PDF itself to be represented as stored.
  if (row.status !== 'partial' || row.privatePdfStatus !== 'failed'
    || !['stored', 'already_available'].includes(String(row.tocStatus || ''))
    || !['stored', 'not_requested'].includes(String(row.fulltextStatus || ''))) return false;
  const reason = String(row.reason || '');
  const match = reason.match(/^combined_capture;toc=(stored|already_available);figures=(\d+)\/\2;evidence=(stored|not_requested);published=0;pdf=private_pdf_http_403$/);
  if (!match || match[1] !== row.tocStatus || match[3] !== row.fulltextStatus
    || Number(match[2]) !== discovered) return false;
  const labels = Array.isArray(row.figureLabels) ? row.figureLabels.map(String) : [];
  return labels.length === discovered && new Set(labels).size === discovered;
}
