import assert from 'node:assert/strict';
import { markReader, readerCounts } from '../src/user-ui.js';

class MemoryDb {
  constructor() {
    this.rows = new Map();
    this.counts = new Map();
    this.aggregateReads = 0;
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
            if (sql.includes('INSERT OR IGNORE INTO paper_readers')) {
              const [doi, profileId, firstReadAt] = args;
              const key = `${doi}|${profileId}`;
              const existed = db.rows.has(key);
              if (!existed) db.seed(doi, profileId, firstReadAt, 'card-open');
              return { meta: { changes: existed ? 0 : 1 } };
            }
            if (sql.includes('INSERT OR IGNORE INTO paper_reader_counts')) {
              const [doi, count] = args;
              const existed = db.counts.has(doi);
              if (!existed) db.counts.set(doi, Number(count));
              return { meta: { changes: existed ? 0 : 1 } };
            }
            if (sql.includes('UPDATE paper_reader_counts')) {
              const [, doi] = args;
              if (!db.counts.has(doi)) return { meta: { changes: 0 } };
              db.counts.set(doi, Number(db.counts.get(doi) || 0) + 1);
              return { meta: { changes: 1 } };
            }
            throw new Error(`Unsupported run SQL: ${sql}`);
          },
          async first() {
            if (sql.includes('SELECT count FROM paper_reader_counts')) {
              const [doi] = args;
              return db.counts.has(doi) ? { count: db.counts.get(doi) } : null;
            }
            throw new Error(`Unsupported first SQL: ${sql}`);
          },
          async all() {
            if (sql.includes('FROM paper_reader_counts')) {
              const wanted = new Set(args);
              return {
                results: [...db.counts.entries()]
                  .filter(([doi]) => wanted.has(doi))
                  .map(([doi, count]) => ({ doi, count })),
              };
            }
            if (sql.includes('FROM paper_readers') && sql.includes("profile_id LIKE 'ip:%'")) {
              db.aggregateReads += 1;
              const wanted = new Set(args);
              const counts = new Map();
              for (const row of db.rows.values()) {
                if (!wanted.has(row.doi) || !row.profile_id.startsWith('ip:')) continue;
                counts.set(row.doi, (counts.get(row.doi) || 0) + 1);
              }
              return { results: [...counts].map(([doi, count]) => ({ doi, count })) };
            }
            throw new Error(`Unsupported all SQL: ${sql}`);
          },
        };
      },
    };
  }

  async batch(statements) {
    return Promise.all(statements.map(statement => statement.run()));
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

// Historical browser/account rows must not contribute to the public unique-IP count.
db.seed(doi, 'profile:legacy-browser');
db.seed(doi, 'user:legacy-account');

const first = await markReader(env, { doi }, request('203.0.113.10'));
assert.equal(first.status, 200);
assert.equal(first.body.unique, true);
assert.equal(first.body.count, 1);
assert.equal(db.aggregateReads, 1);
assert.equal(db.counts.get(doi), 1);

const repeat = await markReader(env, { doi }, request('203.0.113.10'));
assert.equal(repeat.status, 200);
assert.equal(repeat.body.unique, false);
assert.equal(repeat.body.count, 1);
assert.equal(db.aggregateReads, 1);

const secondIp = await markReader(env, { doi }, request('203.0.113.11'));
assert.equal(secondIp.status, 200);
assert.equal(secondIp.body.unique, true);
assert.equal(secondIp.body.count, 2);
assert.equal(db.aggregateReads, 1);
assert.equal(db.counts.get(doi), 2);

const aggregate = await readerCounts(env, { dois: [doi] });
assert.equal(aggregate.status, 200);
assert.deepEqual(aggregate.body.counts, { [doi]: 2 });
assert.equal(db.aggregateReads, 1);

const aggregateAgain = await readerCounts(env, { dois: [doi] });
assert.deepEqual(aggregateAgain.body.counts, { [doi]: 2 });
assert.equal(db.aggregateReads, 1);

const emptyDoi = '10.1000/no-readers-yet';
const empty = await readerCounts(env, { dois: [emptyDoi] });
assert.deepEqual(empty.body.counts, { [emptyDoi]: 0 });
assert.equal(db.counts.get(emptyDoi), 0);
assert.equal(db.aggregateReads, 2);

const emptyAgain = await readerCounts(env, { dois: [emptyDoi] });
assert.deepEqual(emptyAgain.body.counts, { [emptyDoi]: 0 });
assert.equal(db.aggregateReads, 2);

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
  materializedCountReusedWithoutRescan: true,
  zeroCountMaterialized: true,
}));
