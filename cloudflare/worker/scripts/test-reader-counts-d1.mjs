import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Miniflare } from 'miniflare';
import { markReader, readerCounts } from '../src/user-ui.js';

// Pinned Miniflare 4 uses the documented top-level D1 API. This is fully local:
// no remote D1, deployed /mark endpoint, or real visitor identity is used.
test('local D1 binding enforces the reader-ledger transaction', async t => {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("isolated reader test"); } };',
    compatibilityDate: '2025-09-01',
    d1Databases: { DB: '11111111-1111-4111-8111-111111111111' },
  });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  await db.prepare('CREATE TABLE paper_open_readers_v3 (doi TEXT NOT NULL, ip_hash TEXT NOT NULL, first_opened_at INTEGER NOT NULL, PRIMARY KEY(doi,ip_hash))').run();
  await db.prepare('CREATE TABLE paper_open_reader_counts_v3 (doi TEXT PRIMARY KEY, count INTEGER NOT NULL, updated_at INTEGER NOT NULL)').run();
  const env = { DB: db, READER_HASH_SECRET: 'isolated-d1-secret' };
  const mark = (doi, ip='203.0.113.10') => markReader(env, {doi}, new Request('https://example.invalid/test', { headers:{'CF-Connecting-IP':ip} }));

  await t.test('successful and duplicate opens retain one IP/DOI record', async () => {
    const first = await mark('10.1000/d1-a'); const repeat = await mark('10.1000/d1-a');
    assert.equal(first.body.count,1); assert.equal(first.body.unique,true);
    assert.equal(repeat.body.count,1); assert.equal(repeat.body.unique,false);
    const second = await mark('10.1000/d1-a','203.0.113.11'); assert.equal(second.body.count,2);
  });
  await t.test('a real SQL trigger failure rolls back the event as well as its count', async () => {
    await db.prepare("CREATE TRIGGER reader_test_failure BEFORE INSERT ON paper_open_reader_counts_v3 WHEN NEW.doi='10.1000/d1-fail' BEGIN SELECT RAISE(ABORT, 'injected_d1_counter_failure'); END").run();
    await assert.rejects(mark('10.1000/d1-fail'),/injected_d1_counter_failure/);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM paper_open_readers_v3 WHERE doi=?').bind('10.1000/d1-fail').first()).n,0);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM paper_open_reader_counts_v3 WHERE doi=?').bind('10.1000/d1-fail').first()).n,0);
    await db.prepare('DROP TRIGGER reader_test_failure').run();
    const retry = await mark('10.1000/d1-fail'); assert.equal(retry.body.unique,true);assert.equal(retry.body.count,1);
  });
  await t.test('an old missing aggregate is repaired from the ledger on a duplicate', async () => {
    await db.prepare('DELETE FROM paper_open_reader_counts_v3 WHERE doi=?').bind('10.1000/d1-a').run();
    const repaired = await mark('10.1000/d1-a');assert.equal(repaired.body.unique,false);assert.equal(repaired.body.count,2);
  });
  await t.test('concurrent calls keep distinct IP counts exact', async () => {
    const results = await Promise.all(Array.from({length:20},(_,i)=>mark('10.1000/d1-parallel',`203.0.113.${20+i%5}`)));
    assert.equal(results.filter(result=>result.body.unique).length,5);
    const read = await readerCounts(env,{dois:['10.1000/d1-a','10.1000/d1-parallel','10.1000/unopened']});
    assert.deepEqual(read.body.counts,{'10.1000/d1-a':2,'10.1000/d1-parallel':5,'10.1000/unopened':0});
  });
  await t.test('all materialized rows exactly match current authoritative ledger totals', async () => {
    const wrong = await db.prepare('SELECT c.doi FROM paper_open_reader_counts_v3 c WHERE c.count != (SELECT COUNT(*) FROM paper_open_readers_v3 r WHERE r.doi=c.doi)').all();
    assert.equal(wrong.results.length,0);
    const missing = await db.prepare('SELECT DISTINCT r.doi FROM paper_open_readers_v3 r LEFT JOIN paper_open_reader_counts_v3 c ON r.doi=c.doi WHERE c.doi IS NULL').all();
    assert.equal(missing.results.length,0);
  });
});
