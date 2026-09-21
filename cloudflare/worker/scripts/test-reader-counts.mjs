import assert from 'node:assert/strict';
import { markReader, readerCounts } from '../src/user-ui.js';

class MemoryDb {
  constructor() {
    this.legacyRows = new Map();
    this.openRows = new Map();
    this.counts = new Map();
  }

  seedLegacy(doi, profileId, firstReadAt = Date.now(), firstStatusId = 'deep') {
    this.legacyRows.set(`${doi}|${profileId}`, { doi, profile_id: profileId, first_read_at: firstReadAt, first_status_id: firstStatusId });
  }

  prepare(sql) {
    const db = this;
    return {
      bind(...args) {
        return {
          async run() {
            if (sql.includes('INSERT OR IGNORE INTO paper_open_readers_v3')) {
              const [doi, ipHash, firstOpenedAt] = args;
              const key = `${doi}|${ipHash}`;
              const existed = db.openRows.has(key);
              if (!existed) db.openRows.set(key, { doi, ip_hash: ipHash, first_opened_at: firstOpenedAt });
              return { meta: { changes: existed ? 0 : 1 } };
            }
            if (sql.includes('INSERT INTO paper_open_reader_counts_v3')) {
              const [doi] = args;
              db.counts.set(doi, Number(db.counts.get(doi) || 0) + 1);
              return { meta: { changes: 1 } };
            }
            throw new Error(`Unsupported run SQL: ${sql}`);
          },
          async first() {
            if (sql.includes('FROM paper_open_reader_counts_v3')) {
              const [doi] = args;
              return db.counts.has(doi) ? { count: db.counts.get(doi) } : null;
            }
            throw new Error(`Unsupported first SQL: ${sql}`);
          },
          async all() {
            if (sql.includes('FROM paper_open_reader_counts_v3')) {
              const wanted = new Set(args);
              return {
                results: [...db.counts.entries()]
                  .filter(([doi]) => wanted.has(doi))
                  .map(([doi, count]) => ({ doi, count })),
              };
            }
            throw new Error(`Unsupported all SQL: ${sql}`);
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

// Old reading-status rows and old IP rows are deliberately ignored by v3.
for (let index = 1; index <= 5; index += 1) db.seedLegacy(doi, `profile:legacy-${index}`);
db.seedLegacy(doi, 'ip:old-generation-hash', Date.now(), 'card-open');

const before = await readerCounts(env, { dois: [doi] });
assert.equal(before.status, 200);
assert.deepEqual(before.body.counts, { [doi]: 0 });

// First genuine article-open IP starts the clean generation at 1.
const first = await markReader(env, { doi }, request('203.0.113.10'));
assert.equal(first.status, 200);
assert.equal(first.body.unique, true);
assert.equal(first.body.count, 1);
assert.equal(first.body.generation, 'article-open-v3');

// Same IP + DOI is permanently deduplicated.
const repeat = await markReader(env, { doi }, request('203.0.113.10'));
assert.equal(repeat.status, 200);
assert.equal(repeat.body.unique, false);
assert.equal(repeat.body.count, 1);

// A different IP increments to 2.
const second = await markReader(env, { doi }, request('203.0.113.11'));
assert.equal(second.status, 200);
assert.equal(second.body.unique, true);
assert.equal(second.body.count, 2);

const aggregate = await readerCounts(env, { dois: [doi, '10.1000/unopened'] });
assert.deepEqual(aggregate.body.counts, {
  [doi]: 2,
  '10.1000/unopened': 0,
});

assert.equal(db.openRows.size, 2);
assert.ok([...db.openRows.values()].every(row => !row.ip_hash.includes('203.0.113.')));
assert.ok([...db.openRows.values()].every(row => /^[a-f0-9]{64}$/.test(row.ip_hash)));
assert.equal(db.legacyRows.size, 6);

const unavailable = await markReader({ DB: new MemoryDb(), READER_HASH_SECRET: 'x' }, { doi }, request(''));
assert.equal(unavailable.status, 400);
assert.equal(unavailable.body.error, 'reader_ip_unavailable');

console.log(JSON.stringify({
  legacyRowsIgnored: true,
  firstTrustedGenerationReaderStartsAtOne: true,
  sameIpSameDoiDeduped: true,
  distinctIpsCounted: 2,
  rawIpNotStored: true,
}));
