import { normalizeDoi } from '../../shared/pdf-vault-v1.mjs';
import { filenameDoiHint } from './doi-identity.mjs';
import { PDF_VAULT_MAX_BYTES, LocalPdfVaultError } from './local-vault.mjs';

const INDEX_PREFIX = 'gallery-pdf-vault-download-index-v1:';
const CACHE_VERSION = 2;
const MAX_ENTRIES = 1600;
const MAX_PARSING_PER_VISIT = 180;
const MAX_SCAN_MS = 20_000;
const FILE_IDENTITY_TIMEOUT_MS = 7500;
const MAX_RECORDS = 1600;

function cacheKey({ userId, deviceId, directoryId }) {
  return INDEX_PREFIX + [userId, deviceId, directoryId].join(':');
}
function readCache(scope) {
  try {
    const data = JSON.parse(localStorage.getItem(cacheKey(scope)) || 'null');
    if (data?.version === CACHE_VERSION && data.files && data.suppressed) return data;
  } catch { /* Treat disabled storage as an empty optional index. */ }
  return { version: CACHE_VERSION, files: {}, suppressed: {} };
}
function writeCache(scope, cache) {
  try {
    const entries = Object.entries(cache.files);
    if (entries.length > MAX_RECORDS) {
      entries.sort((a, b) => (b[1].seenAt || 0) - (a[1].seenAt || 0));
      cache.files = Object.fromEntries(entries.slice(0, MAX_RECORDS));
    }
    localStorage.setItem(cacheKey(scope), JSON.stringify(cache));
  } catch { /* An unavailable optional index must never grant a file read. */ }
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
  const cache = readCache(scope);
  if (cache.suppressed[doi]) {
    delete cache.suppressed[doi];
    writeCache(scope, cache);
  }
}
export function resetDownloadedIndex(scope) {
  try { localStorage.removeItem(cacheKey(scope)); } catch { /* Optional cache only. */ }
}

async function collectFiles(directory, assertCurrent) {
  const entries = [];
  let overflow = false, visited = 0;
  const started = Date.now();
  const walk = async (handle, depth, prefix) => {
    for await (const entry of handle.values()) {
      assertCurrent();
      visited += 1;
      if (entries.length >= MAX_ENTRIES || visited > MAX_ENTRIES * 4 ||
          Date.now() - started > MAX_SCAN_MS) { overflow = true; return; }
      if (entry.kind === 'directory') {
        if (depth === 0) {
          await walk(entry, 1, prefix + entry.name + '/');
          if (overflow) return;
        }
      } else if (entry.kind === 'file' && /\.pdf$/i.test(entry.name) &&
                 entry.name.length <= 260) {
        entries.push({ handle: entry, name: entry.name, relativeName: prefix + entry.name });
      }
    }
  };
  await walk(directory, 0, '');
  return { entries, overflow };
}

async function identify(file, assertCurrent) {
  const controller = new AbortController();
  let timer;
  const promise = (async () => {
    const reader = await import('./reader.mjs');
    assertCurrent();
    return reader.validateLocalPdf(file, {
      identityOnly: true, assertCurrent, signal: controller.signal,
    });
  })();
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new LocalPdfVaultError('pdf_identity_timeout'));
        }, FILE_IDENTITY_TIMEOUT_MS);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

/**
 * Only reads files inside an explicitly granted folder. The optional index is
 * scoped by account, device and directory ID; a filename hint never authorizes
 * DOI association. A real first-page/metadata match is required.
 *
 * Each open enumerates this folder to find new downloads. Previously inspected
 * unchanged PDFs are not reparsed; fresh downloads are prioritized by mtime.
 * No background upload, network request, global disk scan or file mutation.
 */
export async function discoverDownloadedPdf({
  vault, doi: rawDoi, scope: oldScope, assertCurrent = () => true,
  onProgress = () => {},
} = {}) {
  const doi = normalizeDoi(rawDoi);
  if (!doi) throw new LocalPdfVaultError('invalid_doi');
  const directory = await vault.getDownloadDirectory();
  assertCurrent();
  if (!directory) return { status: 'no_directory', scanned: 0, total: 0 };
  const scope = { ...oldScope, directoryId: directory.id };
  const cache = readCache(scope);
  const suppressed = new Set(cache.suppressed[doi] || []);
  const started = Date.now();
  const { entries, overflow } = await collectFiles(directory.handle, assertCurrent);
  assertCurrent();
  const fileEntries = [];
  for (const entry of entries) {
    if (Date.now() - started > MAX_SCAN_MS) break;
    assertCurrent();
    let file;
    try { file = await entry.handle.getFile(); } catch (error) {
      if (['NotAllowedError', 'SecurityError'].includes(error?.name)) {
        throw new LocalPdfVaultError('permission_required');
      }
      continue;
    }
    if (!file || file.size < 16 || file.size > PDF_VAULT_MAX_BYTES) continue;
    const old = cache.files[entry.relativeName];
    const unchanged = old?.size === file.size && old?.lastModified === file.lastModified;
    fileEntries.push({ ...entry, file, old: unchanged ? old : null,
      priority: filenameDoiHint(entry.name, doi) ? 2 : unchanged && old.doi === doi ? 3 : 0 });
  }
  // DOI-indexed or DOI-shaped filenames first, then newly downloaded files,
  // then older uncategorized files. Never trust these hints as a DOI proof.
  fileEntries.sort((a, b) => b.priority - a.priority ||
    (b.file.lastModified || 0) - (a.file.lastModified || 0));
  let parsed = 0, processed = 0;
  let partial = overflow || fileEntries.length < entries.length;
  for (const entry of fileEntries) {
    assertCurrent();
    if (Date.now() - started > MAX_SCAN_MS || parsed >= MAX_PARSING_PER_VISIT) {
      partial = true;
      break;
    }
    processed += 1;
    if (suppressed.has(entry.name) || suppressed.has(entry.relativeName)) continue;
    let record = entry.old;
    if (!record) {
      parsed += 1;
      try {
        const document = await identify(entry.file, assertCurrent);
        assertCurrent();
        const identity = document.identity;
        record = {
          size: entry.file.size, lastModified: entry.file.lastModified || 0,
          doi: identity?.status === 'match' ? identity.doi : null,
          status: identity?.status || 'unknown', seenAt: Date.now(),
        };
      } catch (error) {
        if (error?.code === 'account_changed') throw error;
        record = { size: entry.file.size, lastModified: entry.file.lastModified || 0,
          doi: null, status: 'unreadable', seenAt: Date.now() };
      }
      cache.files[entry.relativeName] = record;
    }
    if (processed % 12 === 0) onProgress({ processed, total: fileEntries.length, parsed });
    if (record?.status === 'match' && record.doi === doi) {
      assertCurrent();
      // Both the original-file handle and its file bytes remain on this device.
      // linkPdfHandle independently rehashes the actual file before committing.
      const saved = await vault.linkPdfHandle({ doi, handle: entry.handle });
      assertCurrent();
      writeCache(scope, cache);
      return { status: 'matched', copyId: saved.copy.id, filename: entry.name,
        total: fileEntries.length, scanned: processed, parsed };
    }
  }
  writeCache(scope, cache);
  return { status: partial ? 'partial' : 'not_found', total: fileEntries.length,
    scanned: processed, parsed, directoryName: directory.name };
}
