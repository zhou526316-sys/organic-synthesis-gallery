import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { seedMediaJobs, claimMediaJobs, startMediaJob, completeMediaJob, failMediaJob } from '../cloudflare/worker/src/media-jobs.js';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../cloudflare/schema.sql', import.meta.url), 'utf8'));
const DB = { prepare(sql) { return { bind(...values) { return {
  async all() { return { results: sqlite.prepare(sql).all(...values) }; },
  async first() { return sqlite.prepare(sql).get(...values) || null; },
  async run() { return { meta: sqlite.prepare(sql).run(...values) }; },
}; } }; }, async batch(statements) { return Promise.all(statements.map(s => s.run())); } };
const env = { DB };
const dois = Array.from({ length: 12 }, (_, i) => `10.1021/test.${i}`);
await seedMediaJobs(env, [...dois, '10.1021/jacs.6c13738']);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM media_jobs').get().n, 12);
const claims = await Promise.all(Array.from({ length: 6 }, (_, i) => claimMediaJobs(env, { owner: `owner-${i}`, limit: 4 })));
const leased = claims.flatMap(c => c.body.items);
assert.equal(leased.length, 12);
assert.equal(new Set(leased.map(j => j.doi)).size, 12, 'concurrent consumers cannot share a DOI');
const job = leased[0], owner = job.lease_owner;
assert.equal((await startMediaJob(env, { doi: job.doi, owner: 'other' })).status, 409);
assert.equal((await startMediaJob(env, { doi: job.doi, owner })).status, 200);
sqlite.prepare('UPDATE media_jobs SET lease_expires_at = ? WHERE doi = ?').run(Date.now() - 1, job.doi);
assert.equal((await failMediaJob(env, { doi: job.doi, owner, reason: 'timeout' })).status, 409);
assert.equal((await completeMediaJob(env, { doi: job.doi, owner, visualKind: 'figure1' })).status, 409);
const recovered = await claimMediaJobs(env, { owner: 'recovery', limit: 1 });
assert.equal(recovered.body.items[0].doi, job.doi);
await startMediaJob(env, { doi: job.doi, owner: 'recovery' });
assert.equal((await completeMediaJob(env, { doi: job.doi, owner: 'recovery', visualKind: 'figure1' })).body.state, 'upgrade_wait');
await seedMediaJobs(env, [job.doi]);
assert.equal((await claimMediaJobs(env, { owner: 'retry', limit: 50 })).body.items.length, 0, 'seeding cannot hot-loop uploaded media');
const manual = leased[1];
await failMediaJob(env, { doi: manual.doi, owner: manual.lease_owner, reason: 'publisher_http_403' });
assert.equal(sqlite.prepare('SELECT state FROM media_jobs WHERE doi=?').get(manual.doi).state, 'manual_required');
console.log('PASS: atomic claims, owner isolation, expired lease rejection/recovery, upgrade cadence, exclusion, manual pause');
