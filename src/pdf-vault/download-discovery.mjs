import { normalizeDoi } from '../../shared/pdf-vault-v1.mjs';
import { filenameDoiHint } from './doi-identity.mjs';
import { PDF_VAULT_MAX_BYTES, LocalPdfVaultError } from './local-vault.mjs';

const INDEX_PREFIX = 'gallery-pdf-vault-download-index-v1:';
// Version 2 incorrectly treated permanent negative parse results as truth.
// Migrate only successful hints and explicit unlink suppressions.
const CACHE_VERSION = 3;
const MAX_INDEX_RECORDS = 3200;
const MAX_DEPTH = 5;
const MAX_VISITED_PER_PASS = 1800;
const MAX_FILES_PER_BATCH = 120;
const MAX_PARSE_PER_PASS = 40;
const MAX_SCAN_MS = 9500;
const FILE_IDENTITY_TIMEOUT_MS = 6500;
const NEGATIVE_RETRY_MS = 90_000;

function cacheKey({ userId, deviceId, directoryId }) {
  return INDEX_PREFIX + [userId, deviceId, directoryId].join(':');
}
function readCache(scope) {
  let data;
  try { data = JSON.parse(localStorage.getItem(cacheKey(scope)) || 'null'); }
  catch { /* Optional local cache. */ }
  if (data?.version === CACHE_VERSION && data.files && data.suppressed &&
      typeof data.files === 'object' && typeof data.suppressed === 'object') return data;
  const files = {};
  if (data?.version === 2 && data.files && typeof data.files === 'object') {
    for (const [path, value] of Object.entries(data.files)) {
      // A previous positive is only an index hint and will be re-parsed
      // against the real file before linking. All old failures are retried.
      if (value?.status === 'match' && normalizeDoi(value.doi)) files[path] = value;
    }
  }
  return { version: CACHE_VERSION, files,
    suppressed: data?.suppressed && typeof data.suppressed === 'object' ? data.suppressed : {},
    walk: null, pendingFiles: [] };
}
function writeCache(scope, cache) {
  try {
    const entries = Object.entries(cache.files);
    if (entries.length > MAX_INDEX_RECORDS) {
      entries.sort((a, b) => (b[1].seenAt || 0) - (a[1].seenAt || 0));
      cache.files = Object.fromEntries(entries.slice(0, MAX_INDEX_RECORDS));
    }
    localStorage.setItem(cacheKey(scope), JSON.stringify(cache));
  } catch { /* No cached entry may grant file access. */ }
}
export function suppressDownloadedNames(scope, doi, names = []) {
  const target = normalizeDoi(doi);
  if (!target) return;
  const cache = readCache(scope);
  const old = Array.isArray(cache.suppressed[target]) ? cache.suppressed[target] : [];
  const selected = names.filter(name => typeof name === 'string' && name.length <= 300);
  cache.suppressed[target] = [...new Set([...old, ...selected])].slice(-100);
  writeCache(scope, cache);
}
export function unsuppressDownloadedDoi(scope, doi) {
  const target = normalizeDoi(doi);
  if (!target) return;
  const cache = readCache(scope);
  delete cache.suppressed[target];
  writeCache(scope, cache);
}
export function resetDownloadedIndex(scope) {
  // The explicit reset is local and never changes the user's retained PDFs
  // or the separate user-denied association list.
  const cache = readCache(scope);
  cache.files = {};
  cache.walk = null;
  cache.pendingFiles = [];
  writeCache(scope, cache);
}

function validPart(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 260 &&
    name !== '.' && name !== '..' && !/[\\/\u0000]/.test(name);
}
function validParts(parts) {
  return Array.isArray(parts) && parts.length <= MAX_DEPTH && parts.every(validPart);
}
function fileKey(item) {
  return [...item.parts, item.name].join('/');
}
async function resolveFolder(root, parts, assertCurrent) {
  if (!validParts(parts)) throw new LocalPdfVaultError('invalid_directory_cursor');
  let folder = root;
  for (const part of parts) {
    folder = await folder.getDirectoryHandle(part, { create: false });
    assertCurrent();
  }
  return folder;
}
async function resolveFile(root, item, assertCurrent) {
  if (!validParts(item.parts) || !validPart(item.name)) throw new LocalPdfVaultError('invalid_directory_cursor');
  const folder = await resolveFolder(root, item.parts, assertCurrent);
  const handle = await folder.getFileHandle(item.name, { create: false });
  assertCurrent();
  return handle;
}
function startWalk(cache) {
  if (!cache.walk?.queue?.length && !cache.pendingFiles?.length) {
    cache.walk = { queue: [{ parts: [], offset: 0 }] };
  }
  if (!Array.isArray(cache.pendingFiles)) cache.pendingFiles = [];
}
async function collectBatch(root, cache, deadline, assertCurrent, stats) {
  startWalk(cache);
  const queue = cache.walk?.queue || [];
  let visited = 0;
  while (queue.length && cache.pendingFiles.length < MAX_FILES_PER_BATCH &&
         Date.now() < deadline && visited < MAX_VISITED_PER_PASS) {
    assertCurrent();
    const cursor = queue[0];
    if (!validParts(cursor.parts) || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0) {
      queue.shift();
      stats.skippedDirectories++;
      continue;
    }
    let folder;
    try { folder = await resolveFolder(root, cursor.parts, assertCurrent); }
    catch (error) {
      if (['NotAllowedError', 'SecurityError'].includes(error?.name)) throw new LocalPdfVaultError('permission_required');
      queue.shift();
      stats.skippedDirectories++;
      continue;
    }
    let index = 0, finished = true;
    try {
      for await (const entry of folder.values()) {
        assertCurrent();
        index++;
        if (index <= cursor.offset) continue;
        if (Date.now() >= deadline || visited >= MAX_VISITED_PER_PASS ||
            cache.pendingFiles.length >= MAX_FILES_PER_BATCH) {
          finished = false;
          break;
        }
        cursor.offset = index;
        visited++;
        stats.entriesVisited++;
        if (!validPart(entry.name)) continue;
        if (entry.kind === 'directory') {
          if (cursor.parts.length < MAX_DEPTH) {
            queue.push({ parts: [...cursor.parts, entry.name], offset: 0 });
          } else stats.deepDirectories++;
        } else if (entry.kind === 'file' && /\.pdf$/i.test(entry.name)) {
          cache.pendingFiles.push({ parts: cursor.parts, name: entry.name });
          stats.pdfCandidates++;
        }
      }
    } catch (error) {
      if (['NotAllowedError', 'SecurityError'].includes(error?.name)) throw new LocalPdfVaultError('permission_required');
      finished = false;
      stats.skippedDirectories++;
      // If a directory is inaccessible for reasons other than permission,
      // advance past it; don't loop forever at its old cursor.
      queue.shift();
    }
    if (finished) queue.shift();
    if (!finished) break;
  }
  if (!queue.length) cache.walk = null;
  return Boolean(queue.length || cache.pendingFiles.length);
}

async function identify(file, assertCurrent) {
  const controller = new AbortController();
  let timeout;
  const task = (async () => {
    const reader = await import('./reader.mjs');
    assertCurrent();
    return reader.validateLocalPdf(file, {
      identityOnly: true, assertCurrent, signal: controller.signal,
    });
  })();
  try {
    return await Promise.race([
      task,
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new LocalPdfVaultError('pdf_identity_timeout'));
        }, FILE_IDENTITY_TIMEOUT_MS);
      }),
    ]);
  } finally { clearTimeout(timeout); }
}
function statusFromError(error) {
  if (error?.code === 'pdf_identity_timeout') return 'timeout';
  if (error?.code === 'pdf_doi_supporting') return 'supporting';
  return 'unreadable';
}
function safeStats() {
  return { entriesVisited: 0, pdfCandidates: 0, checked: 0, parsed: 0,
    cachedNegative: 0, unrecognized: 0, ambiguous: 0, supporting: 0,
    differentDoi: 0, parseErrors: 0, timeouts: 0, oversized: 0,
    deepDirectories: 0, skippedDirectories: 0, pendingFiles: 0, remainingDirectories: 0 };
}
function addOutcome(stats, record, target) {
  if (record?.status === 'match' && record.doi !== target) stats.differentDoi++;
  else if (record?.status === 'unknown') stats.unrecognized++;
  else if (record?.status === 'ambiguous') stats.ambiguous++;
  else if (record?.status === 'supporting') stats.supporting++;
  else if (record?.status === 'timeout') stats.timeouts++;
  else if (record?.status === 'unreadable') stats.parseErrors++;
}
function result(status, stats, cache, extra = {}) {
  stats.pendingFiles = cache.pendingFiles?.length || 0;
  stats.remainingDirectories = cache.walk?.queue?.length || 0;
  return { status, ...extra, stats, scanned: stats.checked,
    total: stats.checked + stats.pendingFiles };
}

/**
 * Account- and device-bound, read-only, resumable PDF discovery.
 *
 * The scanner descends up to five folder levels, persists a bounded walk
 * cursor/pending file list on each pass, and never treats the negative cache as
 * permanent. Explicit retries reparse previously rejected PDFs. A positive
 * cached DOI is only a shortcut to a fresh parse + independent byte hash.
 * PDF bytes, directory handles, names and hashes never reach Gallery servers.
 */
export async function discoverDownloadedPdf({
  vault, doi: rawDoi, scope: rawScope, assertCurrent = () => true,
  onProgress = () => {}, forceRetry = false,
} = {}) {
  const doi = normalizeDoi(rawDoi);
  if (!doi) throw new LocalPdfVaultError('invalid_doi');
  const directory = await vault.getDownloadDirectory();
  assertCurrent();
  if (!directory) return { status: 'no_directory', scanned: 0, total: 0, stats: safeStats() };
  const scope = { ...rawScope, directoryId: directory.id };
  const cache = readCache(scope), suppressed = new Set(cache.suppressed[doi] || []);
  const stats = safeStats();
  const deadline = Date.now() + MAX_SCAN_MS;

  async function inspect(item, known = null) {
    const key = fileKey(item);
    if (suppressed.has(item.name) || suppressed.has(key)) return null;
    let handle, file;
    try {
      handle = await resolveFile(directory.handle, item, assertCurrent);
      file = await handle.getFile();
      assertCurrent();
    } catch (error) {
      if (error?.code === 'account_changed') throw error;
      if (['NotAllowedError', 'SecurityError'].includes(error?.name)) throw new LocalPdfVaultError('permission_required');
      stats.parseErrors++;
      return null;
    }
    stats.checked++;
    if (file.size < 16 || file.size > PDF_VAULT_MAX_BYTES) {
      stats.oversized++;
      return null;
    }
    const old = known || cache.files[key];
    const unchanged = old?.size === file.size && old?.lastModified === file.lastModified;
    const negative = old?.status && old.status !== 'match';
    const shouldRetry = forceRetry || filenameDoiHint(item.name, doi) ||
      !Number.isSafeInteger(old?.seenAt) || Date.now() - old.seenAt >= NEGATIVE_RETRY_MS;
    let record = unchanged ? old : null;
    if (!record || (negative && shouldRetry)) {
      stats.parsed++;
      try {
        const document = await identify(file, assertCurrent);
        assertCurrent();
        record = { size: file.size, lastModified: file.lastModified,
          status: document.identity?.status || 'unknown',
          doi: document.identity?.status === 'match' ? document.identity.doi : null,
          seenAt: Date.now() };
      } catch (error) {
        if (error?.code === 'account_changed') throw error;
        record = { size: file.size, lastModified: file.lastModified,
          status: statusFromError(error), doi: null, seenAt: Date.now() };
      }
      cache.files[key] = record;
    } else if (negative) stats.cachedNegative++;
    addOutcome(stats, record, doi);
    if (record?.status !== 'match' || record.doi !== doi) return null;

    // A positive index record is never enough for association. Re-open and
    // parse this file before writing a DOI-scoped persistent handle.
    const verified = await identify(file, assertCurrent);
    assertCurrent();
    if (verified.identity?.status !== 'match' || verified.identity.doi !== doi) {
      cache.files[key] = { size: file.size, lastModified: file.lastModified,
        status: verified.identity?.status || 'unknown', doi: null, seenAt: Date.now() };
      return null;
    }
    const saved = await vault.linkPdfHandle({ doi, handle });
    assertCurrent();
    return { copyId: saved.copy.id };
  }

  // Reuse a previously *positively indexed* exact DOI before traversing the
  // folder again. Each candidate still has to pass fresh PDF parsing+hash.
  const known = Object.entries(cache.files)
    .filter(([, value]) => value?.status === 'match' && value.doi === doi)
    .sort((a, b) => (b[1].seenAt || 0) - (a[1].seenAt || 0)).slice(0, 12);
  for (const [key, entry] of known) {
    if (Date.now() >= deadline) break;
    const parts = key.split('/');
    const file = { parts: parts.slice(0, -1), name: parts.at(-1) };
    if (!validParts(file.parts) || !validPart(file.name)) continue;
    const hit = await inspect(file, entry);
    if (hit) { writeCache(scope, cache); return result('matched', stats, cache, hit); }
  }

  // On the next click, process files left by a previous bounded traversal
  // *before* enumerating additional directories. Nothing is thrown away at a
  // deadline, and a large root directory cannot block deeper subdirectories.
  while (Date.now() < deadline && stats.parsed < MAX_PARSE_PER_PASS) {
    if (!cache.pendingFiles?.length) {
      await collectBatch(directory.handle, cache, deadline, assertCurrent, stats);
      if (!cache.pendingFiles?.length) break;
    }
    cache.pendingFiles.sort((a, b) =>
      Number(filenameDoiHint(b.name, doi)) - Number(filenameDoiHint(a.name, doi)));
    const file = cache.pendingFiles.shift();
    if (!file || !validParts(file.parts) || !validPart(file.name)) continue;
    const hit = await inspect(file);
    if (stats.checked % 8 === 0) onProgress({ processed: stats.checked, total: stats.checked + cache.pendingFiles.length, parsed: stats.parsed });
    if (hit) { writeCache(scope, cache); return result('matched', stats, cache, hit); }
  }

  const partial = Boolean(cache.pendingFiles?.length || cache.walk?.queue?.length || stats.deepDirectories);
  writeCache(scope, cache);
  return result(partial ? 'partial' : 'not_found', stats, cache,
    { directoryName: directory.name });
}
