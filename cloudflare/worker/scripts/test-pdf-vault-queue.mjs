import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { PDF_VAULT_QUEUE_LIMITS, readPdfVaultQueue, mutatePdfVaultQueue } from '../src/pdf-vault-queue.js';

const SCHEMA = fs.readFileSync(new URL('../../pdf-vault-queue.sql', import.meta.url), 'utf8');
const API = 'https://api.gczhouwld.com/api/user-ui/pdf-vault/queue';
const TOKEN_A = 'fixture-queue-session-a';
const TOKEN_B = 'fixture-queue-session-b';
const HASH_A = createHash('sha256').update(TOKEN_A).digest('hex');
const HASH_B = createHash('sha256').update(TOKEN_B).digest('hex');
const TABLE = 'user_pdf_acquisition_queue';
const DOI = '10.9999/pdf-vault-queue-example';

class Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    if (this.db.beforeFirst) await this.db.beforeFirst(this);
    return this.db.sqlite.prepare(this.sql).get(...this.args) || null;
  }
  async all() {
    if (this.db.beforeAll) await this.db.beforeAll(this);
    const rows = this.db.sqlite.prepare(this.sql).all(...this.args);
    return { success: true, results: rows, meta: {} };
  }
  async run() {
    const out = this.db.sqlite.prepare(this.sql).run(...this.args);
    return { success: true, results: [], meta: { changes: Number(out.changes || 0) } };
  }
}
class D1 {
  constructor({ schema = true } = {}) {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE user_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
      CREATE TABLE user_library_state (user_id TEXT PRIMARY KEY, state_json TEXT NOT NULL);
      CREATE TABLE private_pdf_documents (doi TEXT PRIMARY KEY, active INTEGER NOT NULL);
      INSERT INTO users VALUES ('fixture-user-a'), ('fixture-user-b');
      INSERT INTO user_library_state VALUES ('fixture-user-a','{"privateNote":"unchanged"}');
      INSERT INTO private_pdf_documents VALUES ('10.9999/owner-only',1);`);
    if (schema) this.sqlite.exec(SCHEMA);
    this.sqlite.prepare('INSERT INTO user_sessions VALUES (?,?,?)').run(HASH_A, 'fixture-user-a', Date.now() + 600_000);
    this.sqlite.prepare('INSERT INTO user_sessions VALUES (?,?,?)').run(HASH_B, 'fixture-user-b', Date.now() + 600_000);
  }
  prepare(sql) { return new Statement(this, sql); }
  close() { this.sqlite.close(); }
}
function setup(t, options = {}) {
  const DB = new D1(options);
  t.after(() => DB.close());
  return { DB, USER_LIBRARY_V3_WRITE_ENABLED: '0', USER_LIBRARY_V3_WRITE_ROLLOUT_BPS: '0' };
}
function get(env, query = '', token = TOKEN_A) {
  return readPdfVaultQueue(new Request(API + query, { headers: token ? { authorization: `Bearer ${token}` } : {} }), env);
}
function post(env, payload = { doi: DOI, action: 'queue', expectedRevision: 0 }, token = TOKEN_A, overrides = {}) {
  const request = new Request(API, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...overrides.headers },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
  return mutatePdfVaultQueue(request, env);
}
function count(env, state) {
  return env.DB.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${TABLE} WHERE user_id='fixture-user-a'${state ? ' AND state=?' : ''}`).get(...(state ? [state] : [])).n;
}
function seed(env, amount, state = 'pending', userId = 'fixture-user-a', prefix = 'seed') {
  const stmt = env.DB.sqlite.prepare(`INSERT INTO ${TABLE} VALUES (?,?,?,1,10,10)`);
  env.DB.sqlite.exec('BEGIN');
  try {
    for (let index = 0; index < amount; index += 1) stmt.run(userId, `10.9999/${prefix}-${String(index).padStart(5, '0')}`, state);
    env.DB.sqlite.exec('COMMIT');
  } catch (error) { env.DB.sqlite.exec('ROLLBACK'); throw error; }
}

test('independent queue schema is idempotent and does not change owner or existing account state', async t => {
  const env = setup(t);
  env.DB.sqlite.exec(SCHEMA);
  const added = await post(env);
  assert.equal(added.status, 200);
  assert.equal(env.USER_LIBRARY_V3_WRITE_ENABLED, '0');
  assert.equal(env.USER_LIBRARY_V3_WRITE_ROLLOUT_BPS, '0');
  assert.equal(env.DB.sqlite.prepare('SELECT state_json FROM user_library_state').get().state_json, '{"privateNote":"unchanged"}');
  assert.equal(env.DB.sqlite.prepare('SELECT active FROM private_pdf_documents').get().active, 1);
  assert.deepEqual(env.DB.sqlite.prepare(`PRAGMA table_info(${TABLE})`).all().map(row => row.name), ['user_id', 'doi', 'state', 'revision', 'created_at', 'updated_at']);
  assert.throws(() => env.DB.sqlite.prepare(`UPDATE ${TABLE} SET user_id='fixture-user-b',revision=2`).run(), /identity_or_revision/);
  assert.throws(() => env.DB.sqlite.prepare(`UPDATE ${TABLE} SET state='completed'`).run(), /identity_or_revision/);
});

test('anonymous, invalid and expired sessions never read or mutate queue records', async t => {
  const env = setup(t);
  assert.equal((await get(env, '', '')).status, 401);
  assert.equal((await post(env, undefined, 'invalid-fixture-session')).status, 401);
  env.DB.sqlite.prepare('UPDATE user_sessions SET expires_at=? WHERE token_hash=?').run(Date.now() - 10, HASH_A);
  assert.equal((await get(env)).status, 401);
  assert.equal((await post(env)).status, 401);
  assert.equal(count(env), 0);
});

test('missing bindings, schema and database errors fail closed with bounded generic responses', async t => {
  const env = setup(t, { schema: false });
  assert.deepEqual(await get({}), { status: 503, body: { error: 'pdf_vault_queue_unavailable' } });
  assert.equal((await get(env)).status, 503);
  assert.deepEqual(await post(env), { status: 503, body: { error: 'pdf_vault_queue_unavailable' } });
  const broken = { DB: { prepare() { throw new Error('private-db-connection-detail'); } } };
  const response = await get(broken);
  assert.equal(response.status, 503);
  assert.ok(!JSON.stringify(response).includes('private-db'));
});

test('valid unlisted DOI can be queued and normalized; response is a strict metadata allowlist', async t => {
  const env = setup(t);
  assert.deepEqual(await get(env, '?doi=10.9999/not-in-catalog'), { status: 200, body: { userId: 'fixture-user-a', item: null } });
  const response = await post(env, { doi: 'https://doi.org/10.9999/NOT-IN-CATALOG', action: 'queue', expectedRevision: 0 });
  assert.equal(response.status, 200);
  assert.equal(response.body.item.doi, '10.9999/not-in-catalog');
  assert.equal(response.body.item.state, 'pending');
  assert.equal(response.body.item.revision, 1);
  assert.deepEqual(Object.keys(response.body), ['userId', 'item']);
  assert.deepEqual(Object.keys(response.body.item), ['doi', 'state', 'revision', 'createdAt', 'updatedAt']);
  assert.ok(response.body.item.updatedAt >= response.body.item.createdAt);
});

test('identical DOI and revisions stay independent across accounts; body userId is rejected', async t => {
  const env = setup(t);
  const a = await post(env);
  assert.equal(a.status, 200);
  assert.deepEqual((await get(env, `?doi=${DOI}`, TOKEN_B)).body, { userId: 'fixture-user-b', item: null });
  const b = await post(env, undefined, TOKEN_B);
  assert.equal(b.status, 200);
  assert.equal(b.body.item.revision, 1);
  const cancelled = await post(env, { doi: DOI, action: 'cancel', expectedRevision: 1 }, TOKEN_B);
  assert.equal(cancelled.body.item.state, 'cancelled');
  assert.equal((await get(env, `?doi=${DOI}`)).body.item.state, 'pending');
  const forged = await post(env, { doi: DOI, action: 'complete', expectedRevision: 1, userId: 'fixture-user-a' }, TOKEN_B);
  assert.equal(forged.status, 400);
  assert.equal((await get(env, `?doi=${DOI}`)).body.item.revision, 1);
});

test('completed/cancelled tombstones retain versions and reject stale replay or implicit recreate', async t => {
  const env = setup(t);
  assert.equal((await post(env, { doi: DOI, action: 'complete', expectedRevision: 0 })).status, 409);
  assert.equal((await post(env)).status, 200);
  const complete = await post(env, { doi: DOI, action: 'complete', expectedRevision: 1 });
  assert.equal(complete.body.item.state, 'completed');
  assert.equal(complete.body.item.revision, 2);
  assert.equal((await get(env)).body.items.length, 0);
  const replay = await post(env);
  assert.equal(replay.status, 409);
  assert.equal(replay.body.error, 'pdf_vault_queue_revision_conflict');
  assert.equal(replay.body.item.state, 'completed');
  const requeue = await post(env, { doi: DOI, action: 'queue', expectedRevision: 2 });
  assert.equal(requeue.body.item.revision, 3);
  const repeat = await post(env, { doi: DOI, action: 'queue', expectedRevision: 3 });
  assert.equal(repeat.body.item.revision, 4);
  assert.equal(count(env), 1);
  assert.equal(count(env, 'pending'), 1);
  const cancel = await post(env, { doi: DOI, action: 'cancel', expectedRevision: 4 });
  assert.equal(cancel.body.item.state, 'cancelled');
  assert.equal(cancel.body.item.revision, 5);
  assert.equal((await get(env, `?doi=${DOI}`)).body.item.state, 'cancelled');
});

test('two concurrent same-revision mutations have exactly one SQL CAS winner', async t => {
  const env = setup(t);
  await post(env);
  const results = await Promise.all([
    post(env, { doi: DOI, action: 'cancel', expectedRevision: 1 }),
    post(env, { doi: DOI, action: 'complete', expectedRevision: 1 }),
  ]);
  assert.deepEqual(results.map(row => row.status).sort(), [200, 409]);
  assert.equal((await get(env, `?doi=${DOI}`)).body.item.revision, 2);
});

test('pending capacity is atomically enforced across competing inserts and requeue', async t => {
  const env = setup(t);
  seed(env, PDF_VAULT_QUEUE_LIMITS.maxPending - 1);
  const results = await Promise.all(['a', 'b'].map(suffix => post(env, { doi: `10.9999/new-${suffix}`, action: 'queue', expectedRevision: 0 })));
  assert.deepEqual(results.map(row => row.status).sort(), [200, 429]);
  assert.equal(count(env, 'pending'), 500);
  assert.equal(results.find(row => row.status === 429).body.error, 'pdf_vault_queue_pending_limit');
  assert.equal((await post(env, { doi: '10.9999/seed-00000', action: 'queue', expectedRevision: 1 })).status, 200);
  seed(env, 1, 'completed', 'fixture-user-a', 'already-done');
  const blocked = await post(env, { doi: '10.9999/already-done-00000', action: 'queue', expectedRevision: 1 });
  assert.equal(blocked.status, 429);
  assert.equal((await get(env, '?doi=10.9999/already-done-00000')).body.item.revision, 1);
  assert.equal((await post(env, { doi: '10.9999/seed-00000', action: 'complete', expectedRevision: 2 })).status, 200);
  assert.equal((await post(env, { doi: '10.9999/already-done-00000', action: 'queue', expectedRevision: 1 })).status, 200);
  assert.equal(count(env, 'pending'), 500);
});

test('total capacity is atomically enforced while existing rows remain editable', async t => {
  const env = setup(t);
  seed(env, PDF_VAULT_QUEUE_LIMITS.maxRows - 1, 'completed');
  const responses = await Promise.all(['a', 'b'].map(suffix => post(env, { doi: `10.9999/last-${suffix}`, action: 'queue', expectedRevision: 0 })));
  assert.deepEqual(responses.map(row => row.status).sort(), [200, 429]);
  assert.equal(count(env), 10_000);
  assert.equal(responses.find(row => row.status === 429).body.error, 'pdf_vault_queue_total_limit');
  assert.equal((await post(env, { doi: '10.9999/seed-00000', action: 'queue', expectedRevision: 1 })).status, 200);
  assert.equal(count(env), 10_000);
});

test('pending keyset reads are bounded and batches return only requested account rows', async t => {
  const env = setup(t);
  seed(env, 55);
  seed(env, 2, 'completed', 'fixture-user-a', 'done');
  seed(env, 1, 'pending', 'fixture-user-b', 'b-only');
  const first = await get(env);
  assert.equal(first.body.items.length, 50);
  assert.equal(first.body.hasMore, true);
  assert.equal(first.body.nextAfter, '10.9999/seed-00049');
  const last = await get(env, `?after=${first.body.nextAfter}&limit=50`);
  assert.equal(last.body.items.length, 5);
  assert.equal(last.body.hasMore, false);
  assert.equal(last.body.nextAfter, null);
  const batch = await get(env, '?doi=10.9999/done-00000&doi=10.9999/seed-00000&doi=10.9999/b-only-00000&doi=10.9999/missing');
  assert.deepEqual(batch.body.items.map(item => [item.doi, item.state]), [['10.9999/done-00000', 'completed'], ['10.9999/seed-00000', 'pending']]);
  const repeated = await get(env, '?doi=10.9999/SEED-00000&doi=10.9999/seed-00000');
  assert.equal(repeated.body.item.doi, '10.9999/seed-00000');
  assert.equal((await get(env, '?' + Array.from({ length: 25 }, (_, i) => `doi=10.9999/batch-${i}`).join('&'))).status, 400);
});

test('unknown query fields, mixed modes, duplicate pagination and invalid DOI fail before queue mutation', async t => {
  const env = setup(t);
  for (const query of ['?userId=fixture-user-b', '?doi=bad', '?doi=https://example.com/private', '?doi=10.9999/a&limit=1', '?after=bad', '?limit=0', '?limit=51', '?limit=1.5', '?limit=01', '?limit=1&limit=2', '?after=&after=', '?doi=']) {
    assert.equal((await get(env, query)).status, 400, query);
  }
  for (const doi of ['not-a-doi', 'https://example.com/10.9999/a', '10.9999/a?secret=value', '10.9999/a#fragment', '10.9999/with space', '10.9999/' + 'x'.repeat(505)]) {
    assert.equal((await post(env, { doi, action: 'queue', expectedRevision: 0 })).status, 400, doi.slice(0, 40));
  }
  assert.equal(count(env), 0);
});

test('body allowlist rejects PDF material, foreign account, token and malformed values', async t => {
  const env = setup(t);
  const base = { doi: DOI, action: 'queue', expectedRevision: 0 };
  for (const key of ['pdf', 'bytes', 'hash', 'content_hash', 'path', 'handle', 'provider', 'userId', 'sessionToken']) {
    assert.equal((await post(env, { ...base, [key]: 'not-permitted' })).status, 400, key);
  }
  for (const payload of [null, [], {}, { ...base, action: ['queue'] }, { ...base, action: 'capture' }, { ...base, action: '__proto__' }, { ...base, expectedRevision: '0' }, { ...base, expectedRevision: -1 }, { ...base, expectedRevision: 0.5 }, { ...base, expectedRevision: Number.MAX_SAFE_INTEGER }]) {
    assert.equal((await post(env, payload)).status, 400);
  }
  assert.equal((await post(env, '{')).status, 400);
  assert.equal((await post(env, JSON.stringify(base).slice(0, -1) + ',"__proto__":{}}')).status, 400);
  assert.equal((await post(env, base, TOKEN_A, { headers: { 'content-type': 'application/octet-stream' } })).status, 415);
  assert.equal(count(env), 0);
});

test('oversized Content-Length is rejected without opening its request body reader', async t => {
  const env = setup(t);
  let opened = false;
  const request = {
    method: 'POST', url: API,
    headers: new Headers({ authorization: `Bearer ${TOKEN_A}`, 'content-type': 'application/json', 'content-length': '999999999' }),
    body: { getReader() { opened = true; throw new Error('must-not-open'); } },
  };
  assert.equal((await mutatePdfVaultQueue(request, env)).status, 413);
  assert.equal(opened, false);
  assert.equal(count(env), 0);
});

test('streaming bodies stop after 2048 bytes instead of draining an oversized upload', async t => {
  const env = setup(t);
  let pulls = 0;
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) { pulls += 1; controller.enqueue(new Uint8Array(512)); if (pulls > 1000) controller.close(); },
    cancel() { cancelled = true; },
  });
  const request = new Request(API, { method: 'POST', body: stream, duplex: 'half', headers: { authorization: `Bearer ${TOKEN_A}`, 'content-type': 'application/json' } });
  assert.equal((await mutatePdfVaultQueue(request, env)).status, 413);
  assert.equal(cancelled, true);
  assert.ok(pulls <= 6, `only bounded stream chunks should be consumed; got ${pulls}`);
  assert.equal(count(env), 0);
});

test('2048-byte JSON is accepted and one byte beyond the limit cannot write', async t => {
  const env = setup(t);
  const json = JSON.stringify({ doi: DOI, action: 'queue', expectedRevision: 0 });
  assert.equal((await post(env, json.padEnd(2048, ' '))).status, 200);
  const next = JSON.stringify({ doi: DOI, action: 'cancel', expectedRevision: 1 });
  assert.equal((await post(env, next.padEnd(2049, ' '))).status, 413);
  assert.equal((await get(env, `?doi=${DOI}`)).body.item.state, 'pending');
});

test('session revoked after authentication but before SQL write cannot commit', async t => {
  const env = setup(t);
  let revoked = false;
  env.DB.beforeAll = statement => {
    if (!revoked && statement.sql.startsWith(`INSERT INTO ${TABLE}`)) {
      revoked = true;
      env.DB.sqlite.prepare('DELETE FROM user_sessions WHERE token_hash=?').run(HASH_A);
    }
  };
  assert.equal((await post(env)).status, 401);
  assert.equal(revoked, true);
  assert.equal(count(env), 0);
});

test('session revoked during a queue read yields 401 without account records', async t => {
  const env = setup(t);
  await post(env);
  env.DB.beforeAll = statement => {
    if (statement.sql.startsWith('SELECT doi, state')) env.DB.sqlite.prepare('DELETE FROM user_sessions WHERE token_hash=?').run(HASH_A);
  };
  assert.deepEqual(await get(env), { status: 401, body: { error: 'not_authenticated' } });
});

test('queue completion never creates a document copy or changes owner PDF availability', async t => {
  const env = setup(t);
  const before = env.DB.sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(row => row.name);
  await post(env);
  const result = await post(env, { doi: DOI, action: 'complete', expectedRevision: 1 });
  assert.equal(result.body.item.state, 'completed');
  assert.equal('copy' in result.body, false);
  assert.equal('pdfAvailable' in result.body.item, false);
  assert.deepEqual(env.DB.sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(row => row.name), before);
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM private_pdf_documents').get().n, 1);
});
