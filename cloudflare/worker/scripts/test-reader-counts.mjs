import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { markReader, readerCounts } from '../src/user-ui.js';

// Execute the product's actual SQL. The adapter supplies D1's documented atomic
// batch semantics, not a hard-coded map that guesses what an INSERT means.
class SqliteD1 {
  constructor() {
    this.sql = new DatabaseSync(':memory:');
    this.failNext = null;
    this.batches = 0;
    this.sql.exec(`
      CREATE TABLE paper_open_readers_v3 (
        doi TEXT NOT NULL, ip_hash TEXT NOT NULL, first_opened_at INTEGER NOT NULL,
        PRIMARY KEY (doi, ip_hash));
      CREATE TABLE paper_open_reader_counts_v3 (
        doi TEXT PRIMARY KEY, count INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE legacy_readers (doi TEXT, profile_id TEXT);
    `);
  }
  execute(text, args, kind) {
    if (this.failNext?.test(text)) { this.failNext = null; throw new Error('injected_database_failure'); }
    const stmt = this.sql.prepare(text);
    if (kind === 'first') return stmt.get(...args) || null;
    if (kind === 'all' || stmt.columns().length) return { success: true, results: stmt.all(...args), meta: { changes: 0 } };
    const result = stmt.run(...args);
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }
  prepare(text) {
    return { bind: (...args) => ({
      text, args,
      run: async () => this.execute(text, args, 'run'),
      first: async () => this.execute(text, args, 'first'),
      all: async () => this.execute(text, args, 'all'),
    }) };
  }
  async batch(statements) {
    this.batches++;
    this.sql.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(({ text, args }) => this.execute(text, args, 'batch'));
      this.sql.exec('COMMIT');
      return results;
    } catch (error) { this.sql.exec('ROLLBACK'); throw error; }
  }
  totals(doi) {
    const real = this.sql.prepare('SELECT COUNT(*) AS n FROM paper_open_readers_v3 WHERE doi=?').get(doi).n;
    const materialized = this.sql.prepare('SELECT count FROM paper_open_reader_counts_v3 WHERE doi=?').get(doi)?.count || 0;
    return { real, materialized };
  }
  close() { this.sql.close(); }
}
const DOI = '10.1021/jacs.6c08636';
const OTHER = '10.1000/other-test-only';
const env = db => ({ DB: db, READER_HASH_SECRET: 'reader-count-test-secret' });
const request = (ip = '203.0.113.10') => new Request('https://example.invalid/isolated-test', { headers: { 'CF-Connecting-IP': ip } });
async function mark(db, doi = DOI, ip = '203.0.113.10') { return markReader(env(db), { doi }, request(ip)); }
function setup(t) { const db = new SqliteD1(); t.after(() => db.close()); return db; }

test('legacy status rows stay excluded; same IP/DOI dedupes and distinct IPs count', async t => {
  const db = setup(t);
  for (let i=0; i<6; i++) db.sql.prepare('INSERT INTO legacy_readers VALUES (?,?)').run(DOI, `profile:${i}`);
  assert.deepEqual((await readerCounts(env(db), { dois: [DOI] })).body.counts, { [DOI]: 0 });
  const first = await mark(db);
  assert.equal(first.status,200); assert.equal(first.body.unique,true); assert.equal(first.body.count,1);
  assert.equal(first.body.generation,'article-open-v3');
  const repeated = await mark(db);
  assert.equal(repeated.body.unique,false); assert.equal(repeated.body.count,1);
  const second = await mark(db,DOI,'203.0.113.11');
  assert.equal(second.body.unique,true); assert.equal(second.body.count,2);
  assert.deepEqual((await readerCounts(env(db),{dois:[DOI,OTHER]})).body.counts,{[DOI]:2,[OTHER]:0});
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM legacy_readers').get().n,6);
  for (const row of db.sql.prepare('SELECT ip_hash FROM paper_open_readers_v3').all()) assert.match(row.ip_hash,/^[a-f0-9]{64}$/);
});

for (const [name, pattern] of [
  ['event insert', /INSERT OR IGNORE INTO paper_open_readers_v3/],
  ['counter write', /INSERT INTO paper_open_reader_counts_v3/],
  ['result read', /SELECT count FROM paper_open_reader_counts_v3/],
]) test(`failure during ${name} rolls back both tables; retry counts exactly once`, async t => {
  const db = setup(t); db.failNext = pattern;
  await assert.rejects(mark(db), /injected_database_failure/);
  assert.deepEqual(db.totals(DOI),{real:0,materialized:0});
  const retry = await mark(db);
  assert.equal(retry.body.unique,true); assert.equal(retry.body.count,1);
  assert.deepEqual(db.totals(DOI),{real:1,materialized:1});
  assert.equal((await mark(db)).body.count,1);
});

test('a retry after a lost response never counts the same reader twice', async t => {
  const db = setup(t);
  await mark(db); // Treat this response as lost; the transaction already committed.
  const retry = await mark(db);
  assert.equal(retry.body.unique,false); assert.equal(retry.body.count,1);
  assert.deepEqual(db.totals(DOI),{real:1,materialized:1});
});

test('a duplicate open repairs an existing missing materialized row without creating a reader', async t => {
  const db = setup(t); await mark(db);
  const firstOpenedAt = db.sql.prepare('SELECT first_opened_at FROM paper_open_readers_v3 WHERE doi=?').get(DOI).first_opened_at;
  db.sql.prepare('DELETE FROM paper_open_reader_counts_v3 WHERE doi=?').run(DOI);
  assert.deepEqual(db.totals(DOI),{real:1,materialized:0});
  const retry = await mark(db);
  assert.equal(retry.body.unique,false); assert.equal(retry.body.count,1);
  assert.deepEqual(db.totals(DOI),{real:1,materialized:1});
  assert.equal(db.sql.prepare('SELECT first_opened_at FROM paper_open_readers_v3 WHERE doi=?').get(DOI).first_opened_at,firstOpenedAt);
});

test('repair derives counts from the ledger, including overcounts, and never touches other DOIs', async t => {
  const db = setup(t);
  for (const ip of ['203.0.113.10','203.0.113.11','203.0.113.12']) await mark(db,DOI,ip);
  await mark(db,OTHER);
  const otherBefore = db.sql.prepare('SELECT * FROM paper_open_reader_counts_v3 WHERE doi=?').get(OTHER);
  for (const wrong of [1,99]) {
    db.sql.prepare('UPDATE paper_open_reader_counts_v3 SET count=? WHERE doi=?').run(wrong,DOI);
    assert.equal((await mark(db)).body.count,3);
    assert.deepEqual(db.totals(DOI),{real:3,materialized:3});
    assert.deepEqual(db.sql.prepare('SELECT * FROM paper_open_reader_counts_v3 WHERE doi=?').get(OTHER),otherBefore);
  }
});

test('overlapping distinct and duplicate calls preserve one event per IP and DOI', async t => {
  const db = setup(t);
  const results = await Promise.all(Array.from({length:60},(_,i)=>mark(db,i%2?DOI:OTHER,`203.0.113.${10+i%10}`)));
  assert.equal(results.filter(result=>result.body.unique).length,10);
  assert.deepEqual(db.totals(DOI),{real:5,materialized:5});
  assert.deepEqual(db.totals(OTHER),{real:5,materialized:5});
});

test('invalid inputs, absent IP and absent database do not write events', async t => {
  const db = setup(t);
  assert.equal((await markReader({}, {doi:DOI},request())).status,503);
  assert.equal((await markReader(env(db), {doi:'not-a-doi'},request())).status,400);
  const noIp = await markReader(env(db),{doi:DOI},request(''));
  assert.equal(noIp.status,400);assert.equal(noIp.body.error,'reader_ip_unavailable');
  const noSecret = await markReader({DB:db},{doi:DOI},request());
  assert.equal(noSecret.status,400);assert.equal(db.batches,0);
  assert.deepEqual(db.totals(DOI),{real:0,materialized:0});
});

test('batch errors are not converted into a successful zero count', async t => {
  const db = setup(t);
  db.batch = async () => [{success:true},{success:false},{success:true,results:[{count:0}]}];
  await assert.rejects(mark(db),/reader_atomic_batch_failed/);
});

test('per-DOI recount uses the existing composite primary-key index', t => {
  const db = setup(t);
  const plan = db.sql.prepare('EXPLAIN QUERY PLAN SELECT COUNT(*) FROM paper_open_readers_v3 WHERE doi=?').all(DOI);
  assert.ok(plan.some(row=>/SEARCH.*INDEX.*doi=/i.test(row.detail)),JSON.stringify(plan));
});
