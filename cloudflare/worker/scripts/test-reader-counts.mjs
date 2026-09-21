import assert from 'node:assert/strict';
import { markReader, readerCounts } from '../src/user-ui.js';

class MemoryDb {
  constructor() {
    this.rows = new Map();
  }

  seed(doi, profileId, firstReadAt = Date.now(), firstStatusId = null) {
    this.rows.set(`${doi}|${profileId}`, { doi, profile_id: profileId, first_read_at: firstReadAt, first_status_id: firstStatusId });
  }

  prepare(sql) {
    const db = this;
    return {
      bind(...args) {
        return {
          async run() {
            if (!sql.includes('INSERT OR IGNORE INTO paper_readers')) throw new Error(`Unsupported run SQL: ${sql}`);
            const [doi, profileId, firstReadAt] = args;
            const key = `${doi}|${profileId}`;
            const existed = db.rows.has(key);
            if (!existed) db.seed(doi, profileId, firstReadAt, 'card-open');
            return { meta: { changes: existed ? 0 : 1 } };
          },
          async first() {
            if (!sql.includes('SELECT COUNT(*) AS count FROM paper_readers')) throw new Error(`Unsupported first SQL: ${sql}`);
            const [doi] = args;
            const count = [...db.rows.values()].filter(row => row.doi === doi && row.profile_id.startsWith('ip:')).length;
            return { count };
          },
          async all() {
            if (!sql.includes('FROM paper_readers') || !sql.includes("profile_id LIKE 'ip:%'")) throw new Error(`Unsupported all SQL: ${sql}`);
            const wanted = new Set(args);
            const counts = new Map();
            for (const row of db.rows.values()) {
              if (!wanted.has(row.doi) || !row.profile_id.startsWith('ip:')) continue;
              counts.set(row.doi, (counts.get(row.doi) || 0) + 1);
            }
            return { results: [...counts].map(([doi, count]) => ({ doi, count })) };
          },
        };
      },
    };
  }
}

function request(ip) {
  return new Request('https://organic-synthesis-gallery.example/api/user-ui/reader-counts/mark', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': ip },
  });
}

const db = new MemoryDb();
const env = { DB: db, READER_HASH_SECRET: 'reader-count-test-secret' };
const doi = '10.1021/jacs.6c08636';

// Historical browser/account rows must not contribute to the new public count.
db.seed(doi, 'profile:legacy-browser');
db.seed(doi, 'user:legacy-account');

const first = await markReader(env, { doi }, request('203.0.113.10'));
assert.equal(first.status, 200);
assert.equal(first.body.unique, true);
assert.equal(first.body.count, 1);

const repeat = await markReader(env, { doi }, request('203.0.113.10'));
assert.equal(repeat.status, 200);
assert.equal(repeat.body.unique, false);
assert.equal(repeat.body.count, 1);

const secondIp = await markReader(env, { doi }, request('203.0.113.11'));
assert.equal(secondIp.status, 200);
assert.equal(secondIp.body.unique, true);
assert.equal(secondIp.body.count, 2);

const aggregate = await readerCounts(env, { dois: [doi] });
assert.equal(aggregate.status, 200);
assert.deepEqual(aggregate.body.counts, { [doi]: 2 });

const readerRows = [...db.rows.values()].filter(row => row.profile_id.startsWith('ip:'));
assert.equal(readerRows.length, 2);
assert.ok(readerRows.every(row => !row.profile_id.includes('203.0.113.')));
assert.ok(readerRows.every(row => /^ip:[a-f0-9]{64}$/.test(row.profile_id)));

const unavailable = await markReader({ DB: new MemoryDb(), READER_HASH_SECRET: 'x' }, { doi }, request(''));
assert.equal(unavailable.status, 400);
assert.equal(unavailable.body.error, 'reader_ip_unavailable');

console.log(JSON.stringify({
  sameIpSameDoiDeduped: true,
  distinctIpsCounted: 2,
  legacyRowsExcluded: true,
  rawIpNotStored: true,
}));
