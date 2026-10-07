import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Canonical CI only: independent synthetic accounts, no real user documents.
const origin = 'https://api.gczhouwld.com';
const endpoint = `${origin}/api/user-ui/pdf-vault/queue`;
const site = 'https://gallery.gczhouwld.com';
const output = process.env.PDF_QUEUE_LIVE_OUTPUT;
if (!output || !process.env.D1_NAME || !/^\d+$/.test(process.env.GITHUB_RUN_ID || '')) throw new Error('canonical_ci_context_required');
const suffix = `${process.env.GITHUB_RUN_ID}_${randomBytes(8).toString('hex')}`;
const users = [`pdf_queue_smoke_${suffix}_a`, `pdf_queue_smoke_${suffix}_b`];
// Exact IDs recorded by the initial failed canary. Never use a prefix/wildcard
// delete against accounts; retaining these two IDs makes recovery idempotent.
const recoveryUsers = [
  'pdf_queue_smoke_37593331980_8ae5079b1e48de90_a',
  'pdf_queue_smoke_37593331980_8ae5079b1e48de90_b',
];
const workDeadline = Date.now() + 140000;
const tokens = Array.from({ length: 4 }, () => randomBytes(32).toString('hex'));
const hashes = tokens.map(value => createHash('sha256').update(value).digest('hex'));
const quote = value => `'${String(value).replace(/'/g, "''")}'`;
const report = { schemaVersion: 1, suite: 'pdf-vault-queue-live', ok: false, runId: Number(process.env.GITHUB_RUN_ID), sourceCommit: process.env.GITHUB_SHA, origin, productionMutations: true, syntheticAccountsOnly: true, syntheticUserIds: users, recoveryUserIds: recoveryUsers, cleanupVerified: false, cases: [], startedAt: new Date().toISOString() };
const save = () => { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); };
function sql(command, label, cleanup = false) {
  const timeout = cleanup ? 45000 : Math.min(45000, workDeadline - Date.now());
  if (timeout <= 0) throw new Error('work_deadline_exceeded');
  let raw = '';
  try {
    // Small fixtures use the query path. Remote --file uses the import path:
    // it returns import statistics, not the SELECT rows needed for verification.
    raw = execFileSync('npx', ['wrangler', 'd1', 'execute', process.env.D1_NAME, '--remote', '--command', command, '--json'], {
      encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024,
    });
    const data = JSON.parse(raw); const blocks = Array.isArray(data) ? data : [data];
    if (blocks.some(item => item.success === false)) throw new Error('d1_command_failed');
    if (blocks.some(item => !Array.isArray(item.results))) throw new Error('d1_response_shape');
    return blocks.flatMap(item => item.results);
  } catch (error) {
    // Never serialize the exception/command/stdout/stderr: they may contain
    // session hashes, SQL values or Wrangler environment details.
    const stderr = String(error?.stderr || '');
    const reason = error instanceof SyntaxError ? 'invalid_json'
      : error?.code === 'ETIMEDOUT' ? 'timeout'
      : /authentication|authenticate|authorization|permission denied/i.test(stderr) ? 'authentication_failed'
      : /no such (table|column)|constraint failed|SQLITE_ERROR/i.test(stderr) ? 'database_error'
      : ['d1_command_failed', 'd1_response_shape'].includes(error?.message) ? error.message : 'execution_failed';
    (report.diagnostics ||= []).push({ stage: label, reason, exitStatus: Number.isInteger(error?.status) ? error.status : null, stdoutBytes: Buffer.byteLength(raw || String(error?.stdout || '')), stderrBytes: Buffer.byteLength(stderr) });
    throw new Error(`${label}_failed`);
  }
}
async function request(token, query = '', body) {
  const remaining = workDeadline - Date.now();
  if (remaining <= 0) throw new Error('work_deadline_exceeded');
  const response = await fetch(endpoint + query, {
    method: body ? 'POST' : 'GET', headers: { origin: site, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(Math.min(10000, remaining)),
  });
  const text = await response.text();
  if (text.length > 65536) throw new Error('response_too_large');
  let value; try { value = JSON.parse(text); } catch { throw new Error('response_not_json'); }
  assert.equal(response.headers.get('access-control-allow-origin'), site);
  assert.match(response.headers.get('cache-control') || '', /private.*no-store/);
  return { status: response.status, body: value };
}
const pass = name => { report.cases.push({ name, status: 'passed' }); save(); };
save();
let failed = false;
let activeStage = 'unauthenticated_route';
try {
  let unauthorized;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { unauthorized = await request(''); if (unauthorized.status === 401) break; } catch { /* New route propagation is bounded. */ }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 2000));
  }
  assert.equal(unauthorized?.status, 401); pass('unauthenticated route returns 401 with private no-store and canonical CORS');
  const now = Date.now();
  activeStage = 'create_synthetic_accounts';
  sql(users.map(user => `INSERT INTO users(id,display_name,created_at,updated_at) VALUES(${quote(user)},'PDF queue acceptance',${now},${now});`).join('\n') + '\n' +
    hashes.map((hash, index) => `INSERT INTO user_sessions(token_hash,user_id,created_at,expires_at) VALUES(${quote(hash)},${quote(users[index === 2 ? 1 : 0])},${now},${index === 3 ? now - 1 : now + 180000});`).join('\n'), 'create_synthetic_accounts');
  const doi = '10.9999/gallery-pdf-queue-acceptance';
  const lookup = `?doi=${encodeURIComponent(doi)}`;
  activeStage = 'same_account_queue';
  const created = await request(tokens[0], '', { doi, action: 'queue', expectedRevision: 0 });
  assert.equal(created.status, 200); assert.equal(created.body.userId, users[0]); assert.equal(created.body.item.state, 'pending'); assert.equal(created.body.item.revision, 1);
  const desktop = await request(tokens[1], lookup);
  assert.equal(desktop.status, 200); assert.deepEqual(desktop.body.item, created.body.item); pass('second authenticated session of same account reads queued DOI');
  activeStage = 'cross_account_isolation';
  const other = await request(tokens[2], lookup);
  assert.equal(other.status, 200); assert.equal(other.body.userId, users[1]); assert.equal(other.body.item, null); pass('another account cannot read the queued DOI');
  activeStage = 'stale_revision';
  const done = await request(tokens[1], '', { doi, action: 'complete', expectedRevision: 1 });
  assert.equal(done.status, 200); assert.equal(done.body.item.state, 'completed');
  const stale = await request(tokens[0], '', { doi, action: 'cancel', expectedRevision: 1 });
  assert.equal(stale.status, 409); assert.equal(stale.body.item.state, 'completed'); assert.equal(stale.body.item.revision, 2); pass('stale session update cannot overwrite completed task');
  activeStage = 'independent_account_revisions';
  const another = await request(tokens[2], '', { doi, action: 'queue', expectedRevision: 0 });
  assert.equal(another.status, 200); assert.equal(another.body.userId, users[1]); assert.equal(another.body.item.revision, 1);
  const list = await request(tokens[1], '?limit=50');
  assert.equal(list.status, 200); assert.deepEqual(list.body.items, []); pass('same DOI has independent account revisions and pending lists');
  activeStage = 'identity_and_expiry';
  const spoof = await request(tokens[0], '', { doi, action: 'queue', expectedRevision: 2, userId: users[1] });
  assert.equal(spoof.status, 400);
  const expired = await request(tokens[3], lookup); assert.equal(expired.status, 401); pass('extra identity fields and expired sessions are rejected');
} catch (error) {
  failed = true;
  report.failedStage = activeStage;
  report.error = error?.code === 'ERR_ASSERTION' ? 'live_acceptance_assertion_failed' : /^[a-z0-9_]+$/.test(error?.message || '') ? error.message : 'live_acceptance_failed';
} finally {
  try {
    const ids = [...users, ...recoveryUsers].map(quote).join(',');
    sql(`DELETE FROM user_pdf_acquisition_queue WHERE user_id IN (${ids});\nDELETE FROM user_sessions WHERE user_id IN (${ids});\nDELETE FROM users WHERE id IN (${ids});`, 'cleanup_synthetic_accounts', true);
    const result = sql(`SELECT (SELECT COUNT(*) FROM user_pdf_acquisition_queue WHERE user_id IN (${ids})) + (SELECT COUNT(*) FROM user_sessions WHERE user_id IN (${ids})) + (SELECT COUNT(*) FROM users WHERE id IN (${ids})) AS remaining;`, 'verify_synthetic_account_cleanup', true);
    assert.equal(result.length, 1); assert.equal(Number(result[0]?.remaining), 0);
    report.cleanupRemaining = 0; report.cleanupVerified = true;
  } catch { report.cleanupError = 'synthetic_account_cleanup_failed'; failed = true; }
  report.ok = !failed && report.cleanupVerified && report.cases.length === 6;
  report.completedAt = new Date().toISOString(); save();
}
console.log(JSON.stringify({ suite: report.suite, ok: report.ok, passed: report.cases.length, cleanupVerified: report.cleanupVerified }));
if (!report.ok) process.exitCode = 1;
