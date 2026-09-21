import assert from 'node:assert/strict';
import { markReader, readerCounts } from '../src/user-ui.js';

class MemoryDb {
  constructor() {
    this.rows = new Map();
    this.states = new Map();
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
            if (sql.includes('INSERT OR IGNORE INTO paper_reader_counts_v2')) {
              const [doi, legacyFloor, ipCount] = args;
              const existed = db.states.has(doi);
              if (!existed) {
                db.states.set(doi, {
                  legacyFloor: Number(legacyFloor),
                  ipCount: Number(ipCount),
                });
              }
              return { meta: { changes: existed ? 0 : 1 } };
            }
            if (sql.includes('UPDATE paper_reader_counts_v2')) {
              const [, doi] = args;
              const state = db.states.get(doi);
              if (!state) return { meta: { changes: 0 } };
              state.ipCount += 1;
              return { meta: { changes: 1 } };
            }
            throw new Error(`Unsupported run SQL: ${sql}`);
          },
          async first() {
            if (sql.includes('FROM paper_reader_counts_v2')) {
              const [doi] = args;
              const state = db.states.get(doi);
              return state
                ? { legacy_floor: state.legacyFloor, ip_count: state.ipCount }
                : null;
            }
            throw new Error(`Unsupported first SQL: ${sql}`);
          },
          async all() {
            if (sql.includes('FROM paper_reader_counts_v2')) {
              const wanted = new Set(args);
              return {
                results: [...db.states.entries()]
                  .filter(([doi]) => wanted.has(doi))
                  .map(([doi, state]) => ({
                    doi,
                    legacy_floor: state.legacyFloor,
                    ip_count: state.ipCount,
                  })),
              };
            }
            if (sql.includes('FROM paper_readers') && sql.includes('legacy_floor') && sql.includes('ip_count')) {
              db.aggregateReads += 1;
              const wanted = new Set(args);
              const aggregate = new Map();
              for (const row of db.rows.values()) {
                if (!wanted.has(row.doi)) continue;
                const state = aggregate.get(row.doi) || { legacyFloor: 0, ipCount: 0 };
                if (row.profile_id.startsWith('ip:')) state.ipCount += 1;
                else state.legacyFloor += 1;
                aggregate.set(row.doi, state);
              }
              return {
                results: [...aggregate.entries()].map(([doi, state]) => ({
                  doi,
                  legacy_floor: state.legacyFloor,
                  ip_count: state.ipCount,
                })),
              };
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

// Five historical pre-IP readers are the conservative floor.
for (let index = 1; index <= 5; index += 1) db.seed(doi, `profile:legacy-${index}`);

const historical = await readerCounts(env, { dois: [doi] });
assert.equal(historical.status, 200);
assert.deepEqual(historical.body.counts, { [doi]: 5 });
assert.deepEqual(db.states.get(doi), { legacyFloor: 5, ipCount: 0 });
assert.equal(db.aggregateReads, 1);

// First new unique IP must NOT collapse 5 historical readers to 1.
const first = await markReader(env, { doi }, request('203.0.113.10'));
assert.equal(first.status, 200);
assert.equal(first.body.unique, true);
assert.equal(first.body.count, 5);
assert.deepEqual(db.states.get(doi), { legacyFloor: 5, ipCount: 1 });
assert.equal(db.aggregateReads, 1);

// Same IP + DOI stays deduplicated.
const repeat = await markReader(env, { doi }, request('203.0.113.10'));
assert.equal(repeat.status, 200);
assert.equal(repeat.body.unique, false);
assert.equal(repeat.body.count, 5);
assert.deepEqual(db.states.get(doi), { legacyFloor: 5, ipCount: 1 });

// More unique IPs stay under the historical floor until they exceed it.
for (let index = 11; index <= 14; index += 1) {
  const result = await markReader(env, { doi }, request(`203.0.113.${index}`));
  assert.equal(result.body.unique, true);
  assert.equal(result.body.count, 5);
}
assert.deepEqual(db.states.get(doi), { legacyFloor: 5, ipCount: 5 });

// Sixth unique IP exceeds the floor, so the public count advances to 6.
const sixth = await markReader(env, { doi }, request('203.0.113.15'));
assert.equal(sixth.body.unique, true);
assert.equal(sixth.body.count, 6);
assert.deepEqual(db.states.get(doi), { legacyFloor: 5, ipCount: 6 });

const aggregate = await readerCounts(env, { dois: [doi] });
assert.deepEqual(aggregate.body.counts, { [doi]: 6 });
assert.equal(db.aggregateReads, 1);

// Repeated reads use v2 materialization and do not rescan paper_readers.
const aggregateAgain = await readerCounts(env, { dois: [doi] });
assert.deepEqual(aggregateAgain.body.counts, { [doi]: 6 });
assert.equal(db.aggregateReads, 1);

// Zero-reader DOI also materializes once.
const emptyDoi = '10.1000/no-readers-yet';
const empty = await readerCounts(env, { dois: [emptyDoi] });
assert.deepEqual(empty.body.counts, { [emptyDoi]: 0 });
assert.deepEqual(db.states.get(emptyDoi), { legacyFloor: 0, ipCount: 0 });
assert.equal(db.aggregateReads, 2);
const emptyAgain = await readerCounts(env, { dois: [emptyDoi] });
assert.deepEqual(emptyAgain.body.counts, { [emptyDoi]: 0 });
assert.equal(db.aggregateReads, 2);

const readerRows = [...db.rows.values()].filter(row => row.profile_id.startsWith('ip:'));
assert.equal(readerRows.length, 6);
assert.ok(readerRows.every(row => !row.profile_id.includes('203.0.113.')));
assert.ok(readerRows.every(row => /^ip:[a-f0-9]{64}$/.test(row.profile_id)));

const unavailable = await markReader({ DB: new MemoryDb(), READER_HASH_SECRET: 'x' }, { doi }, request(''));
assert.equal(unavailable.status, 400);
assert.equal(unavailable.body.error, 'reader_ip_unavailable');

console.log(JSON.stringify({
  historicalFloorPreserved: true,
  firstIpDoesNotCollapseCountToOne: true,
  sameIpSameDoiDeduped: true,
  uniqueIpsAdvanceAfterFloor: true,
  rawIpNotStored: true,
  v2MaterializationAvoidsRescan: true,
  zeroCountMaterialized: true,
}));
