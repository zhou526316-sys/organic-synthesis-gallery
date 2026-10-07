import { normalizeDoi } from '../../shared/pdf-vault-v1.mjs';

export const PDF_QUEUE_ENDPOINT = 'https://api.gczhouwld.com/api/user-ui/pdf-vault/queue';
export const PDF_QUEUE_CHANGE_KEY = 'gallery-pdf-vault-queue-change-v1';
const ACCOUNT = /^[A-Za-z0-9_-]{1,128}$/;

export class PdfQueueError extends Error {
  constructor(code, item) { super(code); this.name = 'PdfQueueError'; this.code = code; this.item = item; }
}

function doiOf(value) {
  const doi = typeof value === 'string' && value.length <= 512 ? normalizeDoi(value) : '';
  if (!doi || doi.length > 512) throw new PdfQueueError('invalid_doi');
  return doi;
}
function record(value) {
  if (value === null) return null;
  if (!value || doiOf(value.doi) !== value.doi || !['pending', 'cancelled', 'completed'].includes(value.state)
    || !Number.isSafeInteger(value.revision) || value.revision < 1
    || !Number.isSafeInteger(value.createdAt) || value.createdAt < 0
    || !Number.isSafeInteger(value.updatedAt) || value.updatedAt < value.createdAt) throw new PdfQueueError('invalid_response');
  return { doi: value.doi, state: value.state, revision: value.revision, createdAt: value.createdAt, updatedAt: value.updatedAt };
}

/** Metadata only. The session is captured once and checked before and after
 * every asynchronous boundary; no anonymous/local-library state is merged. */
export function createPdfQueueClient({ userId, token, assertCurrent, fetchImpl = globalThis.fetch }) {
  if (!ACCOUNT.test(userId || '') || !token || typeof assertCurrent !== 'function') throw new PdfQueueError('account_changed');
  let closed = false;
  const requests = new Set();
  const check = () => {
    if (closed || assertCurrent() === false) throw new PdfQueueError('account_changed');
  };
  async function request(params, body) {
    check();
    const controller = new AbortController();
    requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetchImpl(`${PDF_QUEUE_ENDPOINT}${params.size ? `?${params}` : ''}`, {
        method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal,
      });
      check();
      if (response.status === 401 || response.status === 403) throw new PdfQueueError('not_authenticated');
      if (response.status !== 200 && response.status !== 409 && response.status !== 429 && response.status !== 400) throw new PdfQueueError('queue_unavailable');
      const reader = response.body?.getReader();
      if (!reader) throw new PdfQueueError('invalid_response');
      let bytes = 0; const chunks = [];
      try {
        for (;;) {
          const next = await reader.read(); check();
          if (next.done) break;
          bytes += next.value.byteLength;
          if (bytes > 196608) { await reader.cancel(); throw new PdfQueueError('invalid_response'); }
          chunks.push(next.value);
        }
      } finally { reader.releaseLock(); }
      const buffer = new Uint8Array(bytes); let offset = 0;
      for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
      let data;
      try { data = JSON.parse(new TextDecoder().decode(buffer)); } catch { throw new PdfQueueError('invalid_response'); }
      check();
      if (data?.userId !== userId && (response.ok || response.status === 409)) throw new PdfQueueError('account_changed');
      if (!response.ok) throw new PdfQueueError(response.status === 409 ? 'revision_conflict' : response.status === 429 ? (data.error === 'pdf_vault_queue_total_limit' ? 'queue_history_limit' : 'queue_limit') : 'invalid_request', response.status === 409 ? record(data.item ?? null) : undefined);
      return data;
    } catch (error) {
      check();
      if (error instanceof PdfQueueError) throw error;
      throw new PdfQueueError('queue_unavailable');
    } finally { clearTimeout(timeout); requests.delete(controller); }
  }
  function changed() {
    try { localStorage.setItem(PDF_QUEUE_CHANGE_KEY, crypto.randomUUID()); } catch { /* Refresh remains available. */ }
    globalThis.dispatchEvent?.(new Event('gallery-pdf-vault-queue-changed'));
  }
  return Object.freeze({
    async list({ after = '', limit = 50 } = {}) {
      const params = new URLSearchParams({ limit: String(Math.max(1, Math.min(50, limit))) });
      if (after) params.set('after', doiOf(after));
      const data = await request(params);
      check();
      if (!Array.isArray(data.items) || data.items.length > 50 || typeof data.hasMore !== 'boolean') throw new PdfQueueError('invalid_response');
      const items = data.items.map(record);
      if (items.some(item => !item || item.state !== 'pending') || new Set(items.map(item => item.doi)).size !== items.length) throw new PdfQueueError('invalid_response');
      const nextAfter = data.nextAfter === null ? null : doiOf(data.nextAfter);
      if (data.hasMore && (!nextAfter || !items.length || nextAfter !== items.at(-1).doi || (after && nextAfter <= after))) throw new PdfQueueError('invalid_response');
      return { items, nextAfter, hasMore: data.hasMore };
    },
    async get(doi) {
      doi = doiOf(doi);
      const data = await request(new URLSearchParams({ doi }));
      check();
      const item = record(data.item ?? null);
      if (item && item.doi !== doi) throw new PdfQueueError('invalid_response');
      return item;
    },
    async states(values) {
      const dois = [...new Set(values.map(doiOf))];
      if (dois.length > 24) throw new PdfQueueError('invalid_request');
      if (!dois.length) return [];
      const params = new URLSearchParams(); dois.forEach(doi => params.append('doi', doi));
      const data = await request(params);
      check();
      const raw = dois.length === 1 ? (data.item ? [data.item] : []) : data.items;
      if (!Array.isArray(raw) || raw.length > dois.length) throw new PdfQueueError('invalid_response');
      const items = raw.map(record);
      if (items.some(item => !item || !dois.includes(item.doi)) || new Set(items.map(item => item.doi)).size !== items.length) throw new PdfQueueError('invalid_response');
      return items;
    },
    async mutate(doi, action, expectedRevision) {
      doi = doiOf(doi);
      if (!['queue', 'cancel', 'complete'].includes(action) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new PdfQueueError('invalid_request');
      const data = await request(new URLSearchParams(), { doi, action, expectedRevision });
      check();
      const item = record(data.item);
      if (!item || item.doi !== doi || item.revision !== expectedRevision + 1 || item.state !== ({ queue: 'pending', cancel: 'cancelled', complete: 'completed' })[action]) throw new PdfQueueError('invalid_response');
      changed();
      return item;
    },
    close() { closed = true; for (const controller of requests) controller.abort(); requests.clear(); },
  });
}
