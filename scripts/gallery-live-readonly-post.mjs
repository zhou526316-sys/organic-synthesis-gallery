// Exact read-only POST routes used by the public Gallery to hydrate/archive
// literature and original media. GitHub browser acceptance must allow them
// while rejecting every production write, authentication, and PDF mutation.
const BACKEND_ORIGINS = new Set([
  'https://api.gczhouwld.com',
  'https://organic-synthesis-gallery.zhou526316.workers.dev',
]);
const READ_ONLY_POSTS = new Set([
  '/api/literature/catalog-view',
  '/api/media/batch',
  '/api/media/inventory',
]);

export function safeLiveVerificationRequest(method, inputUrl) {
  const verb = String(method || '').toUpperCase();
  if (verb === 'GET' || verb === 'HEAD' || verb === 'OPTIONS') return true;
  if (verb !== 'POST') return false;
  try {
    const url = new URL(inputUrl);
    return BACKEND_ORIGINS.has(url.origin)
      && READ_ONLY_POSTS.has(url.pathname)
      && !url.username && !url.password && !url.hash && !url.search;
  } catch { return false; }
}
