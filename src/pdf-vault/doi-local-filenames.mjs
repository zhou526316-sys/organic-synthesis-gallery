import { normalizeDoi } from '../../shared/pdf-vault-v1.mjs';

/**
 * Browser downloads cannot be intercepted by a normal website. Match only
 * unambiguous DOI-based filenames in the folder explicitly chosen by the user.
 * Publisher-generated opaque names must be imported/associated manually once.
 */
export function downloadedPdfFilenamePriority(filename, rawDoi) {
  const doi = normalizeDoi(rawDoi);
  if (!doi || typeof filename !== 'string' || !/\.pdf$/i.test(filename) || filename.length > 240) return 0;
  const simple = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const basename = simple(filename.slice(0, -4));
  const full = simple(doi);
  const suffix = simple(doi.slice(doi.indexOf('/') + 1));
  if (basename === full) return 2;
  if (suffix.length >= 10 && basename === suffix) return 1;
  return 0;
}

export function doiPublisherUrl(rawDoi) {
  const doi = normalizeDoi(rawDoi);
  if (!doi || doi.length > 512 || !doi.includes('/')) return null;
  return 'https://doi.org/' + doi.split('/').map(encodeURIComponent).join('/');
}
