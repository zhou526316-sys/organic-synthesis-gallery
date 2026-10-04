/** Shared DOI identity for the new read model; does not rewrite legacy production identifiers. */
export function normalizeDoi(value) {
  if (typeof value !== 'string') return null;
  let doi = value.trim().replace(/^doi:\s*/i, '');
  if (/^https?:\/\//i.test(doi)) {
    try {
      const url = new URL(doi);
      if (!['doi.org', 'dx.doi.org'].includes(url.hostname.toLowerCase())) return null;
      doi = decodeURIComponent(url.pathname.slice(1));
    } catch { return null; }
  }
  doi = doi.toLowerCase();
  return /^10\.\d{4,9}\/\S+$/.test(doi) && !/[\u0000-\u0020\u007f?#]/.test(doi) ? doi : null;
}
