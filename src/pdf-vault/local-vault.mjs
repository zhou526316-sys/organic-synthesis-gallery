import { normalizeDoi, toCopyManifest, toDocumentManifest, PDF_VERSION_KINDS, PDF_PROBE_MAX_AGE_MS } from '../../shared/pdf-vault-v1.mjs';

export const PDF_VAULT_LOCAL_DB = 'gallery-pdf-vault-local-v1';
export const PDF_VAULT_MAX_BYTES = 50 * 1024 * 1024;
export const PDF_VAULT_LOCAL_CHANGE_KEY = 'gallery-pdf-vault-local-change-v1';
export const PDF_VAULT_LOCAL_DENY_BEFORE_KEY = 'gallery-pdf-vault-local-deny-before-v1';
export const PDF_VAULT_CARD_DOI_LIMIT = 50;
const TOKEN = /^[A-Za-z0-9_-]{1,128}$/;
const ROOT_FOLDER = 'Gallery PDF Vault';

/** A device-local, short-lived receipt. This never constructs a read grant or
 * accepts last_verified_at as a substitute for actually reading the file. */
export function selectLocalPdfProbe(copy, candidates, { userId, deviceId, now = Date.now(), denyBefore = 0 } = {}) {
  try { toCopyManifest(copy); } catch { return null; }
  if (copy.user_id !== userId || copy.device_id !== deviceId || !['local_folder', 'opfs'].includes(copy.storage_kind) ||
      ['deleted', 'revoked'].includes(copy.state) || !Number.isSafeInteger(now) || now < 0) return null;
  const valid = (Array.isArray(candidates) ? candidates : []).filter(probe => probe &&
    probe.user_id === userId && probe.device_id === deviceId && probe.copy_id === copy.id &&
    normalizeDoi(probe.doi) === copy.doi && probe.content_hash === copy.content_hash &&
    Number.isSafeInteger(probe.checked_at) && probe.checked_at >= 0 && probe.checked_at <= now &&
    now - probe.checked_at <= PDF_PROBE_MAX_AGE_MS &&
    ['readable', 'missing', 'permission_required', 'unavailable'].includes(probe.status));
  valid.sort((a, b) => b.checked_at - a.checked_at || Number(a.status === 'readable') - Number(b.status === 'readable'));
  const probe = valid[0];
  if (!probe || (probe.status === 'readable' && (copy.state !== 'available' || (denyBefore > 0 && probe.checked_at <= denyBefore)))) return null;
  return {
    user_id: userId, doi: copy.doi, copy_id: copy.id, content_hash: copy.content_hash,
    device_id: deviceId, status: probe.status, checked_at: probe.checked_at,
  };
}

export class LocalPdfVaultError extends Error {
  constructor(code, message = code, extra = {}) {
    super(message);
    this.name = 'LocalPdfVaultError';
    this.code = code;
    Object.assign(this, extra);
  }
}

function failure(error, fallback = 'storage_failed') {
  if (error instanceof LocalPdfVaultError) return error;
  const code = ({
    AbortError: 'operation_cancelled',
    NotAllowedError: 'permission_required',
    SecurityError: 'permission_required',
    QuotaExceededError: 'quota_exceeded',
    NotFoundError: 'file_missing',
    DataCloneError: 'persistence_failed',
    InvalidStateError: 'storage_unavailable',
  })[error?.name] || fallback;
  // Browser messages can contain local paths. Keep platform details out of UI.
  return new LocalPdfVaultError(code);
}

/** Browser-local storage only: no fetch, server grants, automatic downloads or
 * directory scans. Each controller belongs to one account and one session.
 * Handles and paths are stored only in IndexedDB, outside the P0 manifests. */
export function createLocalPdfVault(options = {}) {
  const { userId, deviceId, assertCurrent: sessionAssert = () => true } = options;
  if (typeof userId !== 'string' || !TOKEN.test(userId)) throw new LocalPdfVaultError('invalid_account');
  if (typeof deviceId !== 'string' || !TOKEN.test(deviceId)) throw new LocalPdfVaultError('invalid_device');
  const idb = options.indexedDB ?? globalThis.indexedDB;
  const crypto = options.crypto ?? globalThis.crypto;
  const nav = options.navigator ?? globalThis.navigator;
  const picker = options.showDirectoryPicker ?? globalThis.showDirectoryPicker?.bind(globalThis);
  const eventTarget = options.eventTarget ?? globalThis.window;
  let closed = false;
  let dbPromise;
  let connection;
  let destinationCache;
  const transactions = new Set();
  const copiesCache = new Map();
  const probes = new Map();
  let denyBefore = 0;
  let positiveProbesDisabled = false;

  function localStorage() {
    try { return Object.hasOwn(options, 'localStorage') ? options.localStorage : globalThis.localStorage; }
    catch { return null; }
  }
  function probeDenyBefore() {
    if (positiveProbesDisabled) return Infinity;
    try {
      const stored = Number(localStorage()?.getItem(PDF_VAULT_LOCAL_DENY_BEFORE_KEY));
      if (Number.isSafeInteger(stored) && stored >= 0 && stored <= Date.now()) denyBefore = Math.max(denyBefore, stored);
    } catch { /* The current controller's denial remains authoritative. */ }
    return denyBefore;
  }
  function publishChange() {
    check();
    try { localStorage()?.setItem(PDF_VAULT_LOCAL_CHANGE_KEY, randomId('change_')); } catch { /* Notification only. */ }
    try { eventTarget?.dispatchEvent(new Event('gallery-pdf-vault-local-changed')); } catch { /* Notification only. */ }
    check();
  }
  function denyUnpersistedReceipt() {
    const previous = probeDenyBefore();
    denyBefore = Math.max(Date.now(), Number.isFinite(previous) ? previous : 0);
    try {
      const storage = localStorage();
      if (!storage?.setItem) throw new Error('unavailable');
      storage.setItem(PDF_VAULT_LOCAL_DENY_BEFORE_KEY, String(denyBefore));
      if (storage.getItem(PDF_VAULT_LOCAL_DENY_BEFORE_KEY) !== String(denyBefore)) throw new Error('unavailable');
    } catch { positiveProbesDisabled = true; }
    // A failure fence only withdraws old positive hints. A later actual probe
    // is required for a new positive hint; the signal itself grants nothing.
    publishChange();
  }
  function currentProbe(copy) {
    return selectLocalPdfProbe(copy, [copy.local_probe, probes.get(copy.id)], {
      userId, deviceId, denyBefore: probeDenyBefore(),
    });
  }

  function check() {
    if (closed) throw new LocalPdfVaultError('account_changed');
    try {
      if (sessionAssert() === false) throw new Error('changed');
    } catch {
      close();
      throw new LocalPdfVaultError('account_changed');
    }
  }
  async function boundary(promise) {
    const result = await promise;
    check();
    return result;
  }
  async function operation(action) {
    check();
    try { return await action(); }
    catch (error) {
      check();
      throw failure(error);
    }
  }
  function randomId(prefix) {
    check();
    if (!crypto?.getRandomValues) throw new LocalPdfVaultError('crypto_unavailable');
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return `${prefix}${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
  }
  function now(previous = 0) { return Math.max(Date.now(), previous); }

  function database() {
    check();
    if (!idb?.open) throw new LocalPdfVaultError('storage_unavailable');
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        let request;
        let unavailable = false;
        try { request = idb.open(PDF_VAULT_LOCAL_DB, 1); }
        catch { reject(new LocalPdfVaultError('storage_unavailable')); return; }
        request.onupgradeneeded = () => {
          try {
            check();
            const db = request.result;
            db.createObjectStore('accounts', { keyPath: 'user_id' });
            db.createObjectStore('documents', { keyPath: ['user_id', 'doi'] });
            const copies = db.createObjectStore('copies', { keyPath: ['user_id', 'id'] });
            copies.createIndex('by_user', 'user_id');
            copies.createIndex('by_document', ['user_id', 'doi']);
          } catch (error) {
            request.transaction?.abort();
            reject(failure(error, 'storage_unavailable'));
          }
        };
        request.onerror = () => { unavailable = true; reject(new LocalPdfVaultError('storage_unavailable')); };
        request.onblocked = () => { unavailable = true; reject(new LocalPdfVaultError('storage_unavailable')); };
        request.onsuccess = () => {
          try {
            check();
            if (unavailable) { request.result.close(); return; }
            connection = request.result;
            connection.onversionchange = () => close();
            resolve(connection);
          } catch (error) {
            request.result.close();
            reject(error);
          }
        };
      });
    }
    return boundary(dbPromise);
  }

  async function transact(names, mode, setup) {
    const db = await boundary(database());
    check();
    return boundary(new Promise((resolve, reject) => {
      let tx;
      let output;
      let fault;
      try { tx = db.transaction(names, mode); }
      catch (error) { reject(failure(error)); return; }
      transactions.add(tx);
      const done = () => transactions.delete(tx);
      const abort = error => {
        fault = error;
        try { tx.abort(); } catch { reject(failure(error)); }
      };
      const guarded = callback => event => {
        try { check(); callback(event); }
        catch (error) { abort(error); }
      };
      tx.oncomplete = () => {
        done();
        try { check(); resolve(output); } catch (error) { reject(error); }
      };
      tx.onabort = () => { done(); reject(failure(fault || tx.error)); };
      tx.onerror = () => { fault ||= tx.error; };
      try {
        check();
        setup(tx, value => { check(); output = value; }, guarded);
      } catch (error) { abort(error); }
    }));
  }

  function account() {
    return transact(['accounts'], 'readwrite', (tx, result, guarded) => {
      const store = tx.objectStore('accounts');
      const request = store.get(userId);
      request.onsuccess = guarded(() => {
        if (request.result) { result(request.result); return; }
        const value = { user_id: userId, namespace: randomId('library-'), destination: null };
        store.add(value);
        result(value);
      });
    });
  }

  function readCopy(id) {
    if (!TOKEN.test(id || '')) throw new LocalPdfVaultError('copy_not_found');
    return transact(['copies'], 'readonly', (tx, result, guarded) => {
      const request = tx.objectStore('copies').get([userId, id]);
      request.onsuccess = guarded(() => {
        const value = request.result;
        if (!value || value.user_id !== userId || value.device_id !== deviceId ||
            ['deleted', 'revoked'].includes(value.state)) throw new LocalPdfVaultError('copy_not_found');
        toCopyManifest(value);
        copiesCache.set(id, value);
        result(value);
      });
    });
  }

  async function permission(handle, kind, mode = 'read') {
    check();
    if (!handle?.queryPermission) {
      if (kind === 'opfs') return;
      throw new LocalPdfVaultError('permission_required');
    }
    const state = await boundary(handle.queryPermission({ mode }));
    if (state !== 'granted') throw new LocalPdfVaultError('permission_required');
  }

  async function persistDestination(value) {
    await boundary(transact(['accounts'], 'readwrite', (tx, result, guarded) => {
      const store = tx.objectStore('accounts');
      const request = store.get(userId);
      request.onsuccess = guarded(() => {
        if (!request.result) throw new LocalPdfVaultError('persistence_failed');
        store.put({ ...request.result, destination: value });
        result(value);
      });
    }));
    // Read back the structured-cloned handle before promising persistence.
    const saved = await boundary(account());
    if (!saved.destination?.directory_handle || saved.destination.id !== value.id) {
      throw new LocalPdfVaultError('persistence_failed');
    }
    destinationCache = saved.destination;
    return destinationInfo(destinationCache);
  }
  function destinationInfo(value) {
    return value ? {
      kind: value.kind,
      name: value.name,
      retention: value.kind === 'opfs' ? 'browser_managed' : 'user_folder',
    } : { kind: null, name: null, retention: null };
  }

  async function prepareDestination(root, kind) {
    await boundary(permission(root, kind, 'readwrite'));
    const own = await boundary(account());
    const container = await boundary(root.getDirectoryHandle(ROOT_FOLDER, { create: true }));
    const folder = await boundary(container.getDirectoryHandle(own.namespace, { create: true }));
    return persistDestination({
      id: randomId('dest_'), kind, directory_handle: folder,
      name: kind === 'opfs' ? '浏览器内文献库' : (root.name || '本地文献文件夹'),
    });
  }

  function selectDirectory() {
    check();
    if (!picker) return Promise.reject(new LocalPdfVaultError('directory_picker_unavailable'));
    // Invoke the native picker before any asynchronous storage work, retaining
    // the button's user activation. Other operations never request permission.
    let chosen;
    try { chosen = picker({ id: 'gallery-pdf-vault', mode: 'readwrite' }); }
    catch (error) { return Promise.reject(failure(error)); }
    return operation(async () => prepareDestination(await boundary(chosen), 'local_folder'));
  }

  function useOpfs() {
    return operation(async () => {
      if (!nav?.storage?.getDirectory) throw new LocalPdfVaultError('opfs_unavailable');
      const root = await boundary(nav.storage.getDirectory());
      return prepareDestination(root, 'opfs');
    });
  }

  function getDestination() {
    return operation(async () => {
      const saved = await boundary(account());
      destinationCache = saved.destination;
      return destinationInfo(destinationCache);
    });
  }

  async function inspectFile(file) {
    check();
    if (!file || !Number.isSafeInteger(file.size) || file.size < 16 || typeof file.arrayBuffer !== 'function') {
      throw new LocalPdfVaultError('invalid_pdf');
    }
    if (file.size > PDF_VAULT_MAX_BYTES) throw new LocalPdfVaultError('pdf_too_large');
    if (!crypto?.subtle?.digest) throw new LocalPdfVaultError('crypto_unavailable');
    const bytes = new Uint8Array(await boundary(file.arrayBuffer()));
    if (bytes.byteLength !== file.size || bytes.length > PDF_VAULT_MAX_BYTES) throw new LocalPdfVaultError('invalid_pdf');
    const header = new TextDecoder('latin1').decode(bytes.subarray(0, 9));
    const tail = new TextDecoder('latin1').decode(bytes.subarray(Math.max(0, bytes.length - 1024)));
    if (!/^%PDF-\d\.\d/.test(header) || !/%%EOF[\x00\t\n\f\r ]*$/.test(tail)) {
      throw new LocalPdfVaultError('invalid_pdf');
    }
    const digest = new Uint8Array(await boundary(crypto.subtle.digest('SHA-256', bytes)));
    return {
      bytes,
      hash: Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join(''),
      byteLength: bytes.length,
    };
  }

  function receipt(copy, status) {
    const probe = {
      user_id: userId, doi: copy.doi, copy_id: copy.id,
      content_hash: copy.content_hash, device_id: deviceId,
      status, checked_at: Date.now(),
    };
    return probe;
  }

  function importPdf({ doi: rawDoi, file, versionKind = 'unknown' } = {}) {
    return operation(async () => {
      const doi = normalizeDoi(rawDoi);
      if (!doi || doi.length > 512) throw new LocalPdfVaultError('invalid_doi');
      if (!PDF_VERSION_KINDS.includes(versionKind)) throw new LocalPdfVaultError('invalid_version');
      const inspected = await boundary(inspectFile(file));
      const saved = await boundary(account());
      const destination = saved.destination;
      if (!destination?.directory_handle) throw new LocalPdfVaultError('destination_required');
      const folder = destination.directory_handle;
      await boundary(permission(folder, destination.kind, 'readwrite'));
      const id = randomId('copy_');
      const slug = doi.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 90);
      const name = `${slug}-${id}.pdf`;
      // Fresh unpredictable names prevent replacing a previously imported PDF.
      // File System Access has no portable O_EXCL; fail if the chosen name exists.
      try {
        await boundary(folder.getFileHandle(name));
        throw new LocalPdfVaultError('file_name_collision');
      } catch (error) {
        if (error?.name !== 'NotFoundError') throw error;
        check();
      }
      const handle = await boundary(folder.getFileHandle(name, { create: true }));
      const empty = await boundary(handle.getFile());
      if (empty.size !== 0) throw new LocalPdfVaultError('file_name_collision');
      let writable;
      try {
        // Retain the stream before checking the session, so a session change
        // while createWritable was pending can still abort its temporary write.
        writable = await handle.createWritable({ keepExistingData: false });
        check();
        await boundary(writable.write(inspected.bytes));
        check();
        await boundary(writable.close());
        writable = null;
      } catch (error) {
        // Abort only this write. Never delete or scan files on error: a user
        // may already have edited a file in the selected directory.
        if (writable) { try { await writable.abort(); } catch { /* Already closed. */ } }
        throw error;
      }
      const storedFile = await boundary(handle.getFile());
      const verified = await boundary(inspectFile(storedFile));
      if (verified.hash !== inspected.hash || verified.byteLength !== inspected.byteLength) {
        throw new LocalPdfVaultError('file_changed');
      }
      const timestamp = now();
      const copy = toCopyManifest({
        id, user_id: userId, doi, storage_kind: destination.kind,
        device_id: deviceId, provider: null, provider_ref: null,
        content_hash: verified.hash, byte_length: verified.byteLength, version_kind: versionKind,
        state: 'available', acquired_at: timestamp, last_verified_at: timestamp,
        created_at: timestamp, updated_at: timestamp,
      });
      const probe = receipt(copy, 'readable');
      const local = { ...copy, file_name: name, directory_handle: folder, local_probe: probe, local_revision: 1 };
      const document = await boundary(transact(['documents', 'copies'], 'readwrite', (tx, result, guarded) => {
        const documents = tx.objectStore('documents');
        const request = documents.get([userId, doi]);
        request.onsuccess = guarded(() => {
          const previous = request.result;
          const doc = toDocumentManifest({
            user_id: userId, doi, preferred_content_hash: copy.content_hash,
            preferred_version_kind: versionKind, created_at: previous?.created_at ?? timestamp,
            updated_at: now(previous?.updated_at ?? timestamp),
          });
          check();
          tx.objectStore('copies').add(local);
          documents.put(doc);
          result(doc);
        });
      }));
      const retained = await boundary(readCopy(id));
      if (retained.content_hash !== copy.content_hash || !retained.directory_handle) {
        throw new LocalPdfVaultError('persistence_failed');
      }
      probes.set(id, probe);
      publishChange();
      return { copy: toCopyManifest(retained), document, probe: currentProbe(retained) };
    });
  }

  /** Home-card metadata query: bounded visible DOI lookups in one read-only
   * transaction. Never opens a PDF, probes permission, hashes bytes, selects a
   * directory, initialises an account row or makes a network request. */
  function describeCards({ dois } = {}) {
    return operation(async () => {
      if (!Array.isArray(dois) || dois.length > PDF_VAULT_CARD_DOI_LIMIT) throw new LocalPdfVaultError('invalid_doi_batch');
      const normalized = dois.map(normalizeDoi);
      if (normalized.some(doi => !doi || doi.length > 512)) throw new LocalPdfVaultError('invalid_doi');
      const unique = [...new Set(normalized)];
      if (!unique.length) return { copies: [], probes: [] };
      return transact(['copies'], 'readonly', (tx, result, guarded) => {
        const index = tx.objectStore('copies').index('by_document');
        const copies = [], receipts = [];
        let remaining = unique.length;
        for (const doi of unique) {
          // Bound pathological repeat imports too. Incomplete metadata must
          // fail closed, never silently claim that there are no other copies.
          const request = index.getAll([userId, doi], 65);
          request.onsuccess = guarded(() => {
            if (request.result.length > 64) throw new LocalPdfVaultError('card_metadata_limit');
            for (const value of request.result) {
              if (value.user_id !== userId || value.device_id !== deviceId || normalizeDoi(value.doi) !== doi) continue;
              try {
                const manifest = toCopyManifest(value);
                copies.push(manifest);
                const probe = currentProbe(value);
                if (probe) receipts.push(probe);
              } catch { /* Malformed rows cannot establish a readable copy. */ }
            }
            remaining -= 1;
            if (!remaining) result({ copies, probes: receipts });
          });
        }
      });
    });
  }

  function listCopies({ doi: rawDoi } = {}) {
    return operation(async () => {
      const doi = rawDoi == null ? null : normalizeDoi(rawDoi);
      if (rawDoi != null && !doi) throw new LocalPdfVaultError('invalid_doi');
      return transact(['copies'], 'readonly', (tx, result, guarded) => {
        const store = tx.objectStore('copies');
        const request = doi ? store.index('by_document').getAll([userId, doi]) : store.index('by_user').getAll(userId);
        request.onsuccess = guarded(() => {
          const rows = request.result.filter(value => value.user_id === userId && value.device_id === deviceId &&
            !['deleted', 'revoked'].includes(value.state));
          for (const value of rows) copiesCache.set(value.id, value);
          result(rows.map(toCopyManifest).sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id)));
        });
      });
    });
  }

  async function updateCopy(value, patch, probe) {
    return transact(['copies'], 'readwrite', (tx, result, guarded) => {
      const store = tx.objectStore('copies');
      const request = store.get([userId, value.id]);
      request.onsuccess = guarded(() => {
        const old = request.result;
        if (!old || old.device_id !== deviceId || ['deleted', 'revoked'].includes(old.state) ||
            old.content_hash !== value.content_hash) throw new LocalPdfVaultError('copy_not_found');
        if ((old.local_revision ?? 0) !== (value.local_revision ?? 0)) {
          copiesCache.set(old.id, old);
          throw new LocalPdfVaultError('copy_state_changed');
        }
        const next = { ...old, ...patch, updated_at: now(old.updated_at), local_revision: (old.local_revision ?? 0) + 1 };
        if (probe) next.local_probe = selectLocalPdfProbe(next, [old.local_probe, probe, probes.get(old.id)], { userId, deviceId });
        toCopyManifest(next);
        store.put(next);
        copiesCache.set(next.id, next);
        result(next);
      });
    });
  }

  function openPdf(id) {
    return operation(async () => {
      const value = await boundary(readCopy(id));
      try {
        await boundary(permission(value.directory_handle, value.storage_kind, 'read'));
        const handle = await boundary(value.directory_handle.getFileHandle(value.file_name));
        const file = await boundary(handle.getFile());
        const inspected = await boundary(inspectFile(file));
        if (inspected.hash !== value.content_hash || inspected.byteLength !== value.byte_length) {
          throw new LocalPdfVaultError('file_changed');
        }
        const probe = receipt(value, 'readable');
        const updated = await boundary(updateCopy(value, { state: 'available', last_verified_at: now(value.last_verified_at) }, probe));
        probes.set(id, updated.local_probe || probe);
        publishChange();
        return { file, copy: toCopyManifest(updated), probe: currentProbe(updated) };
      } catch (error) {
        check();
        const mapped = failure(error);
        if (mapped.code === 'copy_state_changed') {
          probes.delete(id);
          publishChange();
          throw mapped;
        }
        const missing = ['file_missing', 'file_changed', 'invalid_pdf', 'pdf_too_large'].includes(mapped.code);
        const probe = receipt(value, missing ? 'missing' : mapped.code === 'permission_required' ? 'permission_required' : 'unavailable');
        probes.set(id, probe);
        try {
          const updated = await boundary(updateCopy(value, missing ? { state: 'missing' } : {}, probe));
          probes.set(id, updated.local_probe || probe);
          publishChange();
        } catch (persistError) {
          check();
          if (persistError?.code === 'copy_state_changed') {
            // Another transaction recorded a newer observation after this
            // operation started. Preserve that record instead of overwriting it.
            probes.delete(id);
            publishChange();
          } else denyUnpersistedReceipt();
        }
        mapped.probe = probe;
        throw mapped;
      }
    });
  }

  function restorePermission(id) {
    return operation(async () => {
      try {
        let value;
        if (id) value = copiesCache.get(id) || await boundary(readCopy(id));
        else value = destinationCache || (await boundary(account())).destination;
        const handle = value?.directory_handle;
        const kind = value?.storage_kind || value?.kind;
        if (!handle) throw new LocalPdfVaultError('destination_required');
        if (kind === 'opfs') return { granted: true };
        if (typeof handle.requestPermission !== 'function') throw new LocalPdfVaultError('permission_required');
        const state = await boundary(handle.requestPermission({ mode: 'readwrite' }));
        if (state !== 'granted') throw new LocalPdfVaultError('permission_required');
        // A permission grant is not a file-readability probe. openPdf rechecks bytes.
        return { granted: true };
      } finally { publishChange(); }
    });
  }

  function describe(filter) {
    return operation(async () => {
      const destination = await boundary(getDestination());
      const copies = await boundary(listCopies(filter));
      return { destination, copies, probes: copies.flatMap(copy => {
        const probe = currentProbe(copiesCache.get(copy.id) || copy);
        return probe ? [probe] : [];
      }) };
    });
  }

  function close() {
    closed = true;
    for (const tx of transactions) { try { tx.abort(); } catch { /* Completed. */ } }
    transactions.clear();
    connection?.close();
    destinationCache = null;
    copiesCache.clear();
    probes.clear();
  }

  return Object.freeze({
    capabilities: () => ({
      directoryPicker: typeof picker === 'function', opfs: typeof nav?.storage?.getDirectory === 'function',
      indexedDB: typeof idb?.open === 'function', crypto: Boolean(crypto?.subtle?.digest && crypto?.getRandomValues),
      maxBytes: PDF_VAULT_MAX_BYTES,
    }),
    selectDirectory, useOpfs, getDestination, importPdf, listCopies, describe, describeCards,
    openPdf, exportFile: openPdf, restorePermission, close,
  });
}
