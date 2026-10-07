import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { inspectLegacyPagesMirror } from './inspect-legacy-pages-mirror.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ACCOUNT = 'a'.repeat(32);
const TOKEN = 'TEST_ONLY_NOT_A_REAL_CREDENTIAL';
const PROJECT = 'organic-synthesis-gallery-public';
const OPTIONS = { token: TOKEN, accountId: ACCOUNT };
const REPORT_KEYS = ['schemaVersion', 'probe', 'readOnly', 'deployed', 'canRestoreAutomatically', 'classification', 'reason', 'httpStatus', 'cloudflareErrorCodes'];
const response = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });

function safeReport(result) {
  assert.deepEqual(Object.keys(result), REPORT_KEYS);
  assert.equal(result.readOnly, true);
  assert.equal(result.deployed, false);
  assert.equal(result.canRestoreAutomatically, false);
  assert.ok(result.cloudflareErrorCodes.length <= 8);
  assert.ok(result.cloudflareErrorCodes.every(code => Number.isSafeInteger(code) && code >= 0 && code <= 99_999_999));
  const serialized = JSON.stringify(result);
  for (const secret of [TOKEN, ACCOUNT, 'upstream-private-value', 'api.cloudflare.com']) assert.equal(serialized.includes(secret), false);
}

test('project inspection makes one authenticated GET, rejects redirects and reports no deployment authority', async () => {
  const calls = [];
  const result = await inspectLegacyPagesMirror({ ...OPTIONS, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return response({ success: true, result: { name: PROJECT, sensitive: 'upstream-private-value' } });
  } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/${PROJECT}`);
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.body, undefined);
  assert.equal(calls[0].init.headers.authorization, `Bearer ${TOKEN}`);
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.equal(result.classification, 'readable');
  safeReport(result);
});

test('Cloudflare code 10000 and HTTP authorization failures cannot imply readiness', async t => {
  for (const status of [200, 400, 401, 403]) await t.test(String(status), async () => {
    let calls = 0;
    const result = await inspectLegacyPagesMirror({ ...OPTIONS, fetchImpl: async () => {
      calls += 1;
      return response({ success: false, errors: [{ code: 10000, message: `${TOKEN} ${ACCOUNT} upstream-private-value` }] }, status);
    } });
    assert.equal(calls, 1);
    assert.equal(result.classification, 'authentication_denied');
    assert.equal(result.httpStatus, status);
    assert.deepEqual(result.cloudflareErrorCodes, [10000]);
    safeReport(result);
  });
  for (const status of [401, 403]) {
    const result = await inspectLegacyPagesMirror({ ...OPTIONS, fetchImpl: async () => new Response('not JSON', { status }) });
    assert.equal(result.classification, 'authentication_denied');
    safeReport(result);
  }
});

test('missing, malformed, wrong-project and upstream failures have fixed sanitized classifications', async t => {
  const cases = [
    ['missing', () => new Response('not JSON', { status: 404 }), 'missing'],
    ['bad JSON', () => new Response('upstream-private-value'), 'invalid_response'],
    ['wrong project', () => response({ success: true, result: { name: 'other-project' } }), 'invalid_response'],
    ['API error', () => response({ success: false, errors: [{ code: 12345, message: 'upstream-private-value' }] }), 'invalid_response'],
    ['upstream failure', () => response({ success: false }, 503), 'upstream_error'],
    ['redirect', () => new Response('', { status: 302, headers: { location: 'https://example.invalid/' } }), 'upstream_error'],
  ];
  for (const [name, makeResponse, expected] of cases) await t.test(name, async () => {
    let calls = 0;
    const result = await inspectLegacyPagesMirror({ ...OPTIONS, fetchImpl: async () => { calls += 1; return makeResponse(); } });
    assert.equal(calls, 1);
    assert.equal(result.classification, expected);
    safeReport(result);
  });
});

test('invalid credentials and endpoint components make zero network requests', async t => {
  for (const change of [
    { token: '' }, { token: 'bad\r\ntoken' }, { accountId: '../other-account' },
    { accountId: ACCOUNT + '?extra=1' }, { projectName: '../other' },
    { projectName: 'project?other=1' }, { projectName: 'https://example.invalid' },
  ]) await t.test(Object.keys(change)[0], async () => {
    let calls = 0;
    const result = await inspectLegacyPagesMirror({ ...OPTIONS, ...change, fetchImpl: async () => { calls += 1; throw new Error('must not call'); } });
    assert.equal(calls, 0);
    assert.equal(result.classification, 'configuration_error');
    safeReport(result);
  });
});

test('error-code output is numeric, unique and bounded without losing the authentication marker', async () => {
  const errors = [...Array.from({ length: 20 }, (_, i) => ({ code: i + 1 })), { code: '10000' },
    { code: 'upstream-private-value' }, { code: -1 }, { code: null }, { code: Number.MAX_VALUE }];
  const result = await inspectLegacyPagesMirror({ ...OPTIONS, fetchImpl: async () => response({ success: false, errors }, 400) });
  assert.equal(result.classification, 'authentication_denied');
  assert.equal(result.cloudflareErrorCodes[0], 10000);
  assert.equal(new Set(result.cloudflareErrorCodes).size, result.cloudflareErrorCodes.length);
  safeReport(result);
});

test('transport exception messages are not copied into the report', async () => {
  const result = await inspectLegacyPagesMirror({ ...OPTIONS, fetchImpl: async () => { throw new Error(`${TOKEN} ${ACCOUNT} upstream-private-value`); } });
  assert.equal(result.classification, 'transport_error');
  assert.equal(result.reason, 'request_failed');
  assert.equal(result.httpStatus, 0);
  safeReport(result);
});

test('the complete request has an enforced ten-second timeout even when fetch ignores its signal', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  let calls = 0;
  const operation = inspectLegacyPagesMirror({ ...OPTIONS, fetchImpl: (_url, init) => {
    calls += 1;
    signal = init.signal;
    return new Promise(() => {});
  } });
  t.mock.timers.tick(9999);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  const result = await operation;
  assert.equal(calls, 1);
  assert.equal(signal.aborted, true);
  assert.equal(result.classification, 'transport_error');
  assert.equal(result.reason, 'request_timeout');
  safeReport(result);
});

test('body download shares the same timeout and oversized responses are rejected', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stream = new ReadableStream({ pull: () => new Promise(() => {}) });
  const operation = inspectLegacyPagesMirror({ ...OPTIONS, fetchImpl: async () => new Response(stream) });
  await Promise.resolve();
  await Promise.resolve();
  t.mock.timers.tick(10_000);
  const timeout = await operation;
  assert.equal(timeout.reason, 'request_timeout');
  safeReport(timeout);
  const tooLarge = await inspectLegacyPagesMirror({ ...OPTIONS, fetchImpl: async () => new Response('x'.repeat(128 * 1024 + 1)) });
  assert.equal(tooLarge.classification, 'invalid_response');
  assert.equal(tooLarge.reason, 'response_too_large');
  safeReport(tooLarge);
});

test('CLI persists its caller-chosen report on an unreadable configuration and exits nonzero', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'legacy-pages-inspection-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const output = join(dir, 'audit', 'report.json');
  const child = spawnSync(process.execPath, ['scripts/inspect-legacy-pages-mirror.mjs', '--report', output], {
    cwd: ROOT,
    env: { ...process.env, CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_ACCOUNT_ID: ACCOUNT },
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 1);
  const stored = JSON.parse(await readFile(output, 'utf8'));
  assert.deepEqual(JSON.parse(child.stdout.trim()), stored);
  assert.equal(child.stderr, '');
  assert.equal(stored.classification, 'configuration_error');
  safeReport(stored);
});

function topLevelBlock(source, name) {
  const lines = source.split('\n');
  const start = lines.findIndex(line => line === `${name}:`);
  assert.notEqual(start, -1, `missing ${name}: block`);
  let end = start + 1;
  while (end < lines.length && (!/^\S/.test(lines[end]) || /^#/.test(lines[end]))) end += 1;
  return lines.slice(start + 1, end).join('\n');
}

function declaredEvents(source) {
  return [...topLevelBlock(source, 'on').matchAll(/^  ([a-z][a-z0-9_-]*):/gm)].map(match => match[1]);
}

function runCommands(source) {
  const lines = source.split('\n');
  const commands = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(\s+)run:\s*(.*)$/.exec(lines[i]);
    if (!match) continue;
    const indentation = match[1].length;
    if (!/^[|>][-+]?\s*$/.test(match[2])) { commands.push(match[2]); continue; }
    const body = [];
    while (i + 1 < lines.length) {
      const next = lines[i + 1];
      if (next.trim() && next.match(/^\s*/)[0].length <= indentation) break;
      body.push(next.trim());
      i += 1;
    }
    commands.push(body.join('\n').replace(/\\\s*\n/g, ' ').trim());
  }
  return commands;
}

test('both former Pages writers are manual-only thin callers of the shared read-only workflow', async () => {
  for (const name of ['cloudflare-pages-static.yml', 'cloudflare-pages-browser-api.yml']) {
    const source = await readFile(join(ROOT, '.github/workflows', name), 'utf8');
    assert.deepEqual(declaredEvents(source), ['workflow_dispatch'], name);
    assert.equal(runCommands(source).length, 0, name);
    assert.doesNotMatch(source, /^\s*(?:steps|runs-on):/m, name);
    const uses = [...source.matchAll(/^\s+uses:\s*(\S+)/gm)].map(match => match[1]);
    assert.deepEqual(uses, ['./.github/workflows/legacy-pages-mirror-readonly.yml'], name);
    assert.doesNotMatch(source, /\bwrangler\b|pages\s+deploy|secret\s+(?:bulk|put|delete)/i, name);
  }
});

test('shared mirror workflow only inspects the project and cannot install or deploy a backend', async () => {
  const source = await readFile(join(ROOT, '.github/workflows/legacy-pages-mirror-readonly.yml'), 'utf8');
  const events = declaredEvents(source);
  assert.ok(events.includes('workflow_call'));
  assert.ok(events.every(event => ['workflow_call', 'workflow_dispatch'].includes(event)));
  const commands = runCommands(source);
  assert.equal(commands.length, 1);
  assert.match(commands[0], /^node\s+scripts\/inspect-legacy-pages-mirror\.mjs\s+--report\s+(?:"[^"\r\n]+"|'[^'\r\n]+'|[^\s;&|`$<>]+)$/);
  assert.doesNotMatch(commands[0], /[;&|`<>]|\$\(/);
  assert.doesNotMatch(source, /\bwrangler\b|\bnpx\b|\bnpm\s+(?:install|ci)\b|secret\s+(?:bulk|put|delete)|--remote/i);
  const uses = [...source.matchAll(/^\s+(?:-\s*)?uses:\s*(\S+)/gm)].map(match => match[1]);
  assert.ok(uses.length >= 1);
  assert.ok(uses.every(value => /^actions\/(?:checkout|setup-node|upload-artifact)@/.test(value)));
});
