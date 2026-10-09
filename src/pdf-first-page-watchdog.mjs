/**
 * Bound the PDF.js first-page parse + paint handshake for *both* buffered and
 * Range-backed documents. A timed-out job is explicitly torn down by its
 * caller; this helper never grants access or manipulates signed file URLs.
 */
export async function waitForPdfFirstPage(job, rangeFailure, timeoutMs) {
  if (!job || typeof job.then !== 'function')
    throw new TypeError('pdf_first_page_invalid_job');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw new TypeError('pdf_first_page_invalid_deadline');
  if (rangeFailure != null && typeof rangeFailure.then !== 'function')
    throw new TypeError('pdf_first_page_invalid_failure_signal');
  let id = null;
  const deadline = new Promise((_, reject) => {
    id = setTimeout(() => reject(new Error('pdf_first_page_timeout')), timeoutMs);
  });
  try {
    return await Promise.race(rangeFailure ? [job, rangeFailure, deadline] : [job, deadline]);
  } finally {
    if (id !== null) clearTimeout(id);
  }
}
