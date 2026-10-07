import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';

// Execute the actual module, replacing only its unrelated session-auth import.
// All network/storage are local fakes; no publisher or production request occurs.
const source = await readFile(new URL('../src/private-pdf.js', import.meta.url), 'utf8');
const sessionImport = "import { authenticatedSessionUserId } from './integrations.js';";
assert.equal(source.split(sessionImport).length, 2, 'session import must match exactly');
const isolatedSource = source.replace(sessionImport,
  'const authenticatedSessionUserId = async () => { throw new Error("unexpected session authentication"); };');
globalThis.crypto ??= webcrypto;
const { importPrivatePdf } = await import('data:text/javascript;base64,' + Buffer.from(isolatedSource).toString('base64'));

const doi = '10.1021/jacs.6c12345';
const token = 'local-only-test-capture-lease';
const tokenHash = createHash('sha256').update(token).digest('hex');
const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2048, 65), Buffer.from('\n%%EOF')]);
const contentHash = createHash('sha256').update(pdf).digest('hex');
const r2Key = 'private-pdf/raw/10.1021_jacs.6c12345/' + contentHash + '.pdf';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function setup({ concurrent = false, insertFailure = null, commitBeforeFailure = false,
  recoveryFailure = null, delayWinner = false } = {}) {
  const docs = new Map(), objects = new Map();
  const readsReady = deferred(), winnerReady = deferred();
  const stats = { reads: 0, puts: 0, inserts: 0, deletes: 0 };
  const uniqueError = new Error('D1_ERROR: UNIQUE constraint failed: private_pdf_documents.doi, private_pdf_documents.content_hash');
  const db = {
    prepare(sql) {
      const q = sql.replace(/\s+/g, ' ').trim();
      return { bind(...args) { return {
        async first() {
          if (q.includes('FROM private_pdf_capture_leases l')) {
            assert.equal(args[0], 'private_pdf_capture');
            return args[1] === tokenHash
              ? { user_id: 'local-owner', expires_at: Date.now() + 60_000, revoked_at: null }
              : null;
          }
          assert.match(q, /FROM private_pdf_documents WHERE doi = \? AND content_hash = \?/);
          const read = ++stats.reads;
          const row = [...docs.values()].find(doc => doc.doi === args[0] && doc.content_hash === args[1]);
          // Both initial SELECTs see the same empty database before either PUT/INSERT.
          if (concurrent && read <= 2) {
            if (read === 2) readsReady.resolve();
            await readsReady.promise;
            return row ? { ...row } : null;
          }
          if (recoveryFailure && stats.inserts > 0) throw recoveryFailure;
          return row ? { ...row } : null;
        },
        async run() {
          assert.match(q, /^INSERT INTO private_pdf_documents/);
          const attempt = ++stats.inserts;
          if (delayWinner && attempt === 1) {
            await winnerReady.promise;
          } else if (delayWinner && attempt === 2) {
            throw insertFailure;
          }
          if (docs.has(args[0]) || [...docs.values()].some(doc => doc.doi === args[1] && doc.content_hash === args[6])) {
            throw uniqueError;
          }
          if (insertFailure && !commitBeforeFailure && !delayWinner) throw insertFailure;
          docs.set(args[0], { id: args[0], doi: args[1], content_hash: args[6], r2_key: args[7],
            byte_length: args[8], processing_state: 'raw', active: 0 });
          if (insertFailure && commitBeforeFailure) throw insertFailure;
          return { success: true };
        },
      }; } };
    },
  };
  const bucket = {
    async put(key, value) { stats.puts++; objects.set(key, Buffer.from(value)); },
    async delete(key) { stats.deletes++; objects.delete(key); },
  };
  return { env: { DB: db, PDF_PRIVATE: bucket, PRIVATE_PDF_CAPTURE_ENABLED: '1' },
    docs, objects, stats, uniqueError, releaseWinner: winnerReady.resolve };
}

function upload({ auth = token, bytes = pdf, sourceHost = 'pubs.acs.org', controller = '2.2.41' } = {}) {
  const url = new URL('https://local.invalid/api/private-pdf/import');
  url.search = new URLSearchParams({ doi, publisher: 'acs',
    articleUrl: 'https://pubs.acs.org/doi/full/' + doi,
    sourceUrl: 'https://' + sourceHost + '/doi/pdf/' + doi,
    versionKind: 'unknown', controllerRevision: controller }).toString();
  return new Request(url, { method: 'POST', headers: { authorization: 'Bearer ' + auth,
    'content-type': 'application/pdf' }, body: bytes });
}

function assertPrivateObject(state) {
  assert.equal(state.objects.size, 1);
  assert.deepEqual(state.objects.get(r2Key), pdf);
  assert.equal(state.stats.deletes, 0);
}

let passed = 0;
async function test(name, run) {
  await run();
  passed++;
  console.log('PRIVATE_PDF_RACE_PASS ' + name);
}

await test('concurrent identical uploads retain winner object and return two successful receipts', async () => {
  const state = setup({ concurrent: true });
  const results = await Promise.allSettled([importPrivatePdf(upload(), state.env), importPrivatePdf(upload(), state.env)]);
  console.log(JSON.stringify({ case: 'same_doi_hash_race', outcomes: results.map(r => r.status === 'fulfilled'
    ? r.value.status : String(r.reason.message)), documents: state.docs.size,
    objects: state.objects.size, deletes: state.stats.deletes }));
  assert.equal(results.filter(r => r.status === 'rejected').length, 0, 'a committed duplicate must return an idempotent receipt');
  const receipts = results.map(r => r.value).sort((a, b) => a.status - b.status);
  assert.deepEqual(receipts.map(r => r.status), [200, 201]);
  assert.equal(receipts[0].body.duplicate, true);
  assert.equal(receipts[0].body.documentId, receipts[1].body.documentId);
  assert.equal(state.docs.size, 1);
  for (const receipt of receipts) {
    assert.equal(receipt.body.contentHash, contentHash);
    assert.equal(receipt.body.byteLength, pdf.length);
    assert.equal(receipt.body.processingState, 'raw');
    assert.equal(receipt.body.active, false);
    assert.ok(!JSON.stringify(receipt).includes('private-pdf/raw/'));
  }
  assertPrivateObject(state);
});

await test('sequential duplicate retains existing receipt state without another storage write', async () => {
  const state = setup();
  const first = await importPrivatePdf(upload(), state.env);
  const row = state.docs.get(first.body.documentId);
  row.processing_state = 'verified'; row.active = 1;
  const duplicate = await importPrivatePdf(upload(), state.env);
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(duplicate.body.processingState, 'verified');
  assert.equal(duplicate.body.active, true);
  assert.equal(state.stats.puts, 1);
  assert.equal(state.stats.inserts, 1);
  assertPrivateObject(state);
});

await test('database commit with lost acknowledgement recovers the committed receipt', async () => {
  const state = setup({ insertFailure: new Error('lost D1 acknowledgement'), commitBeforeFailure: true });
  const receipt = await importPrivatePdf(upload(), state.env);
  assert.equal(receipt.status, 200);
  assert.equal(receipt.body.duplicate, true);
  assert.equal(state.docs.size, 1);
  assertPrivateObject(state);
});

await test('unconfirmed insertion failure preserves original error and private bytes', async () => {
  const failure = new Error('database temporarily unavailable');
  const state = setup({ insertFailure: failure });
  await assert.rejects(importPrivatePdf(upload(), state.env), error => error === failure);
  assert.equal(state.docs.size, 0);
  assertPrivateObject(state);
});

await test('failed recovery lookup does not replace the original error or delete bytes', async () => {
  const failure = new Error('insert failure');
  const state = setup({ insertFailure: failure, recoveryFailure: new Error('lookup failure') });
  await assert.rejects(importPrivatePdf(upload(), state.env), error => error === failure);
  assertPrivateObject(state);
});

await test('empty recovery lookup cannot delete an object needed by a pending successful insertion', async () => {
  const failure = new Error('transient D1 failure');
  const state = setup({ concurrent: true, insertFailure: failure, delayWinner: true });
  const jobs = [importPrivatePdf(upload(), state.env), importPrivatePdf(upload(), state.env)];
  // The first settled request is the failed second INSERT; the winner is still gated.
  const firstOutcome = await Promise.race(jobs.map(job => job.then(value => ({ value }), error => ({ error }))));
  assert.equal(firstOutcome.error, failure);
  assert.equal(state.docs.size, 0);
  state.releaseWinner();
  const results = await Promise.allSettled(jobs);
  assert.equal(results.filter(r => r.status === 'fulfilled' && r.value.status === 201).length, 1);
  assert.equal(state.docs.size, 1);
  assertPrivateObject(state);
});

await test('unauthorized, stale controller, wrong publisher host and invalid bytes still fail closed', async () => {
  for (const [options, expected] of [[{ auth: 'invalid-local-token' }, 401], [{ controller: '2.2.40' }, 409],
    [{ sourceHost: 'untrusted.invalid' }, 400], [{ bytes: Buffer.alloc(2048, 72) }, 422]]) {
    const state = setup();
    assert.equal((await importPrivatePdf(upload(options), state.env)).status, expected);
    assert.equal(state.docs.size, 0);
    assert.equal(state.objects.size, 0);
    assert.equal(state.stats.puts, 0);
  }
});

console.log(JSON.stringify({ passed, productionRequests: 0, publicWrites: 0 }));
