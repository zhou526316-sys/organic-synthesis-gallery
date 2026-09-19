import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Exercise the production orchestration with a challenged publisher and mocked
// remote I/O. No remote session or credentials are used by this regression test.
const source = readFileSync(new URL('../src/background.mjs', import.meta.url), 'utf8');
const orchestration = source.slice(source.indexOf('async function inspectArticleBrowserbase('), source.indexOf('\nasync function publisherFetch('))
  .replace("const { chromium } = await import('playwright-core');", 'const { chromium } = playwright;');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const contextSource = source.slice(source.indexOf('async function browserbaseContext('), source.indexOf('\nfunction localPublisherReady('));
const recoverContext = new AsyncFunction('dependencies', `with (dependencies) { ${contextSource}; return browserbaseContext('acs'); }`);
const recoveryCalls = [];
const recovery = {
  state: { browserbase: { contexts: {} } },
  browserbaseCredentials: () => ({ projectId: 'project-a' }),
  saveState: async () => {}, log: async () => {},
  browserbaseApi: async (url, options) => {
    recoveryCalls.push([url, options.method]);
    if (url === '/contexts') throw new Error('browserbase_http_409:already exists');
    if (url === '/sessions') return [
      { contextId: 'wrong-project', projectId: 'project-b' },
      { contextId: 'original-acs', projectId: 'project-a' },
    ];
    assert.equal(url, '/contexts/original-acs');
    return { id: 'original-acs', name: 'organic-synthesis-gallery-acs', projectId: 'project-a' };
  },
};
assert.equal(await recoverContext(recovery), 'original-acs');
assert.equal(await recoverContext(recovery), 'original-acs');
assert.equal(recoveryCalls.length, 3, 'restored Context is reused without further API calls');
assert.deepEqual(recoveryCalls.map(c => c[1]), ['POST', 'GET', 'GET']);
recovery.state.browserbase.contexts = {};
recovery.browserbaseApi = async url => {
  if (url === '/contexts') throw new Error('browserbase_http_409:already exists');
  return [];
};
await assert.rejects(recoverContext(recovery), /original_id_not_found/);
console.log('PASS: Context 409 recovers original cookies by verified name/project, never creates replacement');
const state = { browserbase: { contexts: { acs: 'acs-context', wiley: 'wiley-context' }, manual: {}, status: {}, lastSuccessDoi: {} } };
let created = 0, closed = 0, handoff;
const calls = [];
const page = { goto: async () => {}, waitForTimeout: async () => {}, url: () => 'https://pubs.acs.org/challenge', content: async () => '<h1>Verify you are human</h1>' };
const dependencies = {
  state, config: {}, stageStatus: '',
  browserbasePublisher: doi => doi.startsWith('10.1021/') ? 'acs' : 'wiley',
  pendingManualHandoff: () => Object.values(state.browserbase.manual).find(r => r.status === 'manual_required'),
  manualBrowserbaseSessions: new Map(), browserbaseCredentials: () => ({ apiKey: 'fixture', projectId: 'fixture-project' }),
  waitForBrowserbaseSlot: async () => {}, browserbaseContext: async p => state.browserbase.contexts[p],
  browserbaseApi: async (url, options) => {
    calls.push(url);
    if (url === '/sessions') {
      created++;
      const payload = JSON.parse(options.body);
      assert.equal(payload.keepAlive, true);
      assert.equal(payload.browserSettings.solveCaptchas, false);
      assert.deepEqual(payload.browserSettings.context, { id: 'acs-context', persist: true });
      return { id: 'original-session', connectUrl: 'wss://fixture.invalid' };
    }
    assert.equal(url, '/sessions/original-session/debug');
    return { debuggerFullscreenUrl: 'https://fixture.invalid/live' };
  },
  playwright: { chromium: { connectOverCDP: async (_, options) => {
    assert.equal(options.timeout, 90000);
    return { contexts: () => [{ pages: () => [page] }], close: async () => { closed++; } };
  } } },
  browserbaseManualRequired: () => true,
  writeManualHandoff: async (publisher, active, debug) => { handoff = { publisher, ...active, liveUrl: debug.debuggerFullscreenUrl }; },
  saveState: async () => {}, log: async () => {}, refreshDashboard: () => {}, manualPublisherLabel: p => p,
  safeError: e => e.message,
};
const run = new AsyncFunction('dependencies', 'doi', `with (dependencies) { ${orchestration}; return inspectArticleBrowserbase(doi, 'https://pubs.acs.org/doi/' + doi); }`);
await assert.rejects(run(dependencies, '10.1021/acs.orglett.6c03622'), /manual_required/);
assert.equal(handoff.sessionId, 'original-session');
assert.equal(handoff.contextId, 'acs-context');
assert.equal(handoff.liveUrl, 'https://fixture.invalid/live');
assert.equal(closed, 0, 'challenged session remains connected');
await assert.rejects(run(dependencies, '10.1002/anie.1537547'), /manual_required_global_pause/);
assert.equal(created, 1, 'manual handoff stops even other publishers from creating a session');
assert.equal(dependencies.manualBrowserbaseSessions.get('acs').sessionId, 'original-session');
console.log('PASS: keepAlive, persistent context, no CAPTCHA solver, original session retained, global pause');
const resume = source.slice(source.indexOf('async function finishManualBrowserbase('), source.indexOf('async function verifyBrowserbaseImage('));
const active = dependencies.manualBrowserbaseSessions.get('acs');
Object.assign(dependencies, {
  restoreManualSession: async () => active,
  browserbaseManualRequired: () => false, browserbaseOwnsDoi: () => true,
  htmlCandidate: () => ({ kind: 'figure1', src: 'https://fixture.invalid/fig1.png' }),
  verifyBrowserbaseImage: async () => ({ imageData: 'fixture-image' }),
  browserbaseApi: async (url, options) => {
    assert.equal(url, '/sessions/original-session');
    assert.equal(JSON.parse(options.body).status, 'REQUEST_RELEASE');
  },
  api: async () => { throw new Error('Read-only acceptance must not upload or claim a lease'); },
});
const continued = await new AsyncFunction('dependencies', `with(dependencies) { ${resume}; return finishManualBrowserbase('acs'); }`)(dependencies);
assert.equal(continued.status, 'verified_readonly');
assert.equal(continued.sessionId, 'original-session');
assert.equal(continued.contextId, 'acs-context');
assert.equal(continued.imageReadable, true);
assert.equal(created, 1);
console.log('PASS: original-session read-only continuation works without a write token');
