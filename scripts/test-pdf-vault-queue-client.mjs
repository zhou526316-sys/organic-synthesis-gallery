import assert from 'node:assert/strict';
import test from 'node:test';
import { createPdfQueueClient } from '../src/pdf-vault/queue-client.mjs';
import { normalizeDoi } from '../shared/pdf-vault-v1.mjs';

// All responses are supplied by fetchImpl; this suite never contacts the API.
const USER_ID = 'fixture_queue_user';
const TOKEN = 'fixture_queue_session';
const MAX_RESPONSE_BYTES = 192 * 1024;
const encoder = new TextEncoder();
const item = Object.freeze({ doi: '10.9999/queue-client-a', state: 'pending', revision: 1, createdAt: 1, updatedAt: 1 });
const secondItem = Object.freeze({ ...item, doi: '10.9999/queue-client-b' });

function replaceGlobal(t, key, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  });
}

const operations = [
  { name: 'list', payload: { userId: USER_ID, items: [item], nextAfter: null, hasMore: false }, invoke: client => client.list() },
  { name: 'get', payload: { userId: USER_ID, item }, invoke: client => client.get(item.doi) },
  { name: 'states', payload: { userId: USER_ID, items: [item, secondItem] }, invoke: client => client.states([item.doi, secondItem.doi]) },
  { name: 'mutate', payload: { userId: USER_ID, item }, invoke: client => client.mutate(item.doi, 'queue', 0) },
];

for (const operation of operations) {
  test(`${operation.name} rejects an account change between response completion and its outer continuation`, async t => {
    const notifications = [];
    const storageWrites = [];
    replaceGlobal(t, 'dispatchEvent', event => { notifications.push(event.type); return true; });
    replaceGlobal(t, 'localStorage', { setItem: (...args) => storageWrites.push(args) });
    replaceGlobal(t, 'fetch', () => { throw new Error('unexpected_live_fetch'); });

    let client;
    let fetches = 0;
    let released = false;
    let invalidated = false;
    let finalInternalCheckPassed = false;
    client = createPdfQueueClient({
      userId: USER_ID,
      token: TOKEN,
      assertCurrent() {
        if (released && !invalidated) finalInternalCheckPassed = true;
        return !invalidated;
      },
      fetchImpl: async () => {
        fetches += 1;
        const response = new Response(JSON.stringify(operation.payload), { status: 200 });
        return {
          status: response.status,
          ok: response.ok,
          body: {
            getReader() {
              const reader = response.body.getReader();
              return {
                read: () => reader.read(),
                cancel: () => reader.cancel(),
                releaseLock() {
                  reader.releaseLock();
                  released = true;
                  // The response is complete. Let request() finish its final
                  // synchronous checks, then revoke before its caller resumes.
                  queueMicrotask(() => { invalidated = true; client.close(); });
                },
              };
            },
          },
        };
      },
    });
    t.after(() => client.close());

    await assert.rejects(operation.invoke(client), { name: 'PdfQueueError', code: 'account_changed' });
    assert.equal(fetches, 1);
    assert.equal(finalInternalCheckPassed, true, 'the account must remain valid through the inner request checks');
    assert.equal(invalidated, true);
    assert.deepEqual(notifications, [], 'an old account must not notify the new account');
    assert.deepEqual(storageWrites, [], 'an old account must not write a cross-tab notification');
  });
}

test('a valid 50-item UTF-8 page larger than 64 KiB remains readable', async t => {
  const items = Array.from({ length: 50 }, (_, index) => ({
    ...item,
    doi: `10.9999/${String(index).padStart(2, '0')}${'文'.repeat(490)}`,
  }));
  for (const row of items) {
    assert.equal(normalizeDoi(row.doi), row.doi);
    assert.ok(row.doi.length <= 512);
    assert.ok(encoder.encode(JSON.stringify({ doi: row.doi, action: 'queue', expectedRevision: 0 })).byteLength <= 2048);
  }
  const payload = JSON.stringify({ userId: USER_ID, items, nextAfter: null, hasMore: false });
  const bytes = encoder.encode(payload).byteLength;
  assert.ok(bytes > 64 * 1024 && bytes < MAX_RESPONSE_BYTES, `expected a valid approximately 77 KiB page; received ${bytes} bytes`);
  replaceGlobal(t, 'fetch', () => { throw new Error('unexpected_live_fetch'); });
  const client = createPdfQueueClient({
    userId: USER_ID,
    token: TOKEN,
    assertCurrent: () => true,
    fetchImpl: async () => new Response(payload, { status: 200 }),
  });
  t.after(() => client.close());

  assert.deepEqual(await client.list({ limit: 50 }), { items, nextAfter: null, hasMore: false });
});

test('a response exceeding 192 KiB is cancelled before its remaining bytes are read', async t => {
  const payload = encoder.encode(JSON.stringify({
    userId: USER_ID, items: [], nextAfter: null, hasMore: false, padding: 'x'.repeat(MAX_RESPONSE_BYTES + 32768),
  }));
  const chunks = [payload.subarray(0, MAX_RESPONSE_BYTES), payload.subarray(MAX_RESPONSE_BYTES, MAX_RESPONSE_BYTES + 1), payload.subarray(MAX_RESPONSE_BYTES + 1)];
  let pulls = 0;
  let cancellations = 0;
  const stream = new ReadableStream({
    pull(controller) {
      const chunk = chunks[pulls++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() { cancellations += 1; },
  }, { highWaterMark: 0 });
  replaceGlobal(t, 'fetch', () => { throw new Error('unexpected_live_fetch'); });
  const client = createPdfQueueClient({
    userId: USER_ID,
    token: TOKEN,
    assertCurrent: () => true,
    fetchImpl: async () => new Response(stream, { status: 200 }),
  });
  t.after(() => client.close());

  await assert.rejects(client.list(), { name: 'PdfQueueError', code: 'invalid_response' });
  assert.equal(pulls, 2, 'stop immediately when the observed size is 192 KiB plus one byte');
  assert.equal(cancellations, 1);
  assert.equal(stream.locked, false, 'release the response reader after cancelling');
});
