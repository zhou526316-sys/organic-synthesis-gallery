import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

const sourceUrl = new URL('../src/user-ui/account-sync.ts', import.meta.url);
const original = fs.readFileSync(sourceUrl, 'utf8');
assert.match(original, /^import .* from '\.\/shared';$/m);
const source = stripTypeScriptTypes(original.replace(/^import .* from '\.\/shared';\r?\n/m, ''), {
  mode: 'transform',
});
const SESSION_KEY = 'organic-gallery-session-v1';
const USER_KEY = 'organic-gallery-account-sync-user-v1';
const REVISION_KEY = 'organic-gallery-account-sync-revision-v1';

function emptyState() {
  return {
    statuses: [], quickTerms: [], collections: [], aliases: [], actionStyles: {},
    followedSearches: [], searchHistory: [], hideRead: false, papers: {}, metadata: {},
  };
}

function paper(note) {
  return { favorite: true, collections: [], note, quickTerms: [], tags: [], updatedAt: 10 };
}

function populatedState(count) {
  const state = emptyState();
  for (let index = 0; index < count; index += 1) {
    const key = `10.1234/fixture-${String(index).padStart(2, '0')}`;
    state.papers[key] = paper(`pending ${index}`);
    state.metadata[key] = { id: key, doi: key, title: `Paper ${index}`, journal: 'JACS' };
  }
  return state;
}

async function fixture(local, remote, enabled = false) {
  let now = 1_000_000;
  const storage = new Map([[SESSION_KEY, 'fixture-session']]);
  const server = {
    state: structuredClone(remote), revision: 10, enabled,
    requests: [], accepted: [], pauseAfter: false, dropAfter: false, switchAfter: false,
  };
  const listeners = new Map();
  const store = {
    state: structuredClone(local), profileId: 'fixture-profile',
    save() {
      storage.set('state', JSON.stringify(this.state));
      listeners.get('change')?.({ detail: { scope: 'global' } });
    },
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const head = () => ({
    ready: true, revision: server.revision, updatedAt: 10,
    globalState: Object.fromEntries(Object.entries(server.state).filter(([key]) => !['papers', 'metadata'].includes(key))),
    globalRevision: server.revision, paperCount: Object.keys(server.state.papers).length,
    metadataCount: Object.keys(server.state.metadata).length, changeFloorRevision: 10,
    papersSplit: true, metadataSplit: true,
  });
  const identity = () => ({ userId: 'fixture-user', writeEnabled: server.enabled, writeAuthority: 'v3' });
  const reply = (status, body) => ({ ok: status === 200, status, json: async () => body });

  const context = vm.createContext({
    structuredClone, TextEncoder, Set, Map, store, WORKER_API_BASE: 'https://account-sync.invalid',
    document: { documentElement: { dataset: {} } },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    Date: class extends Date { static now() { return now; } },
    // Tests invoke the production poll directly; no real clock or network is used.
    window: { setInterval() { return 1; }, setTimeout() { return 2; }, clearTimeout() {} },
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body);
      server.requests.push(body);
      if (body.mode === 'account-v3-head') {
        return reply(200, { account: { ...identity(), readPath: 'v3-head', ...head() } });
      }
      if (body.mode === 'account-v3-page') {
        assert.ok(body.limit > 0 && body.limit <= 100);
        const all = [...new Set([...Object.keys(server.state.papers), ...Object.keys(server.state.metadata)])]
          .sort().filter(key => key > (body.afterKey || ''));
        const selected = all.slice(0, body.limit);
        const rows = selected.map(paperKey => ({
          paperKey, paperPresent: Object.hasOwn(server.state.papers, paperKey),
          paperState: server.state.papers[paperKey], metadataPresent: Object.hasOwn(server.state.metadata, paperKey),
          metadata: server.state.metadata[paperKey],
        }));
        return reply(200, { account: {
          ...identity(), readPath: 'v3-page', ready: true, scanStartRevision: server.revision,
          head: head(), rows, count: rows.length, hasMore: selected.length < all.length, nextKey: selected.at(-1),
        } });
      }
      if (body.mode === 'account-v3-delta') {
        return reply(200, { account: {
          ...identity(), readPath: 'v3-delta', ready: true,
          resetRequired: body.sinceRevision !== server.revision,
          targetRevision: server.revision, head: head(), changes: [], hasMore: false,
        } });
      }
      if (body.mode === 'account-v3-mutate') {
        if (!server.enabled) return reply(503, { error: 'user_library_v3_write_suspended', ...identity() });
        if (body.expectedRevision !== server.revision) {
          return reply(409, { error: 'user_library_v3_revision_conflict', currentRevision: server.revision });
        }
        assert.ok(body.operations.length <= 32);
        if (body.globalState) Object.assign(server.state, body.globalState);
        for (const operation of body.operations) {
          // Match the API's whole-row replacement and explicit deletion contract.
          if (operation.delete || !Object.hasOwn(operation, 'paperState')) delete server.state.papers[operation.paperKey];
          else server.state.papers[operation.paperKey] = structuredClone(operation.paperState);
          if (operation.delete || !Object.hasOwn(operation, 'metadata')) delete server.state.metadata[operation.paperKey];
          else server.state.metadata[operation.paperKey] = structuredClone(operation.metadata);
        }
        server.revision += 1;
        server.accepted.push(body);
        const response = reply(200, { account: { ...identity(), readPath: 'v3-mutate', ...head() } });
        // These hooks run after commit but before the awaiting client receives
        // the response, fixing the race boundary independently of wall time.
        if (server.pauseAfter && body.operations.length) {
          server.enabled = false;
          server.pauseAfter = false;
        }
        if (server.switchAfter && body.operations.length) {
          server.switchAfter = false;
          storage.set(SESSION_KEY, 'another-fixture-session');
          storage.set(USER_KEY, 'another-fixture-user');
          storage.set(REVISION_KEY, '77');
        }
        if (server.dropAfter && body.operations.length) {
          server.dropAfter = false;
          throw new Error('fixture: response dropped after commit');
        }
        return response;
      }
      throw new Error(`Unexpected account API mode: ${body.mode}`);
    },
  });
  vm.runInContext(`${source}\nglobalThis.api={pullRemote,localDirty};`, context, { filename: sourceUrl.pathname });
  // Drain the finite initial head/page/delta promise chain without sleeping.
  const settle = async () => {
    for (let turn = 0; turn < 60; turn += 1) await new Promise(resolve => setImmediate(resolve));
  };
  await settle();
  return {
    context, server, store, storage,
    async poll(elapsed = 46_000) {
      now += elapsed;
      await context.api.pullRemote();
      await settle();
    },
  };
}

function assertV3Only(server) {
  assert.ok(server.requests.every(body => body.mode.startsWith('account-v3-')));
}

test('dirty suspended account probes with a throttle and resumes without losing local edits or remote metadata', async () => {
  const local = emptyState();
  const remote = emptyState();
  local.papers.a = paper('local pending');
  remote.papers.a = paper('remote committed');
  local.metadata.a = remote.metadata.a = { id: 'a', title: 'old' };
  const env = await fixture(local, remote);
  assert.equal(env.context.document.documentElement.dataset.accountSyncWrite, 'suspended');
  assert.equal(env.context.api.localDirty(), true);
  await env.poll();
  assert.equal(env.server.accepted.length, 0);
  assert.equal(env.storage.get(REVISION_KEY), '10');
  const pausedRequests = env.server.requests.length;
  await env.poll(1000);
  assert.equal(env.server.requests.length, pausedRequests, 'permission probe must be throttled');
  assert.equal(env.store.state.papers.a.note, 'local pending');

  env.server.state.papers.a.note = 'newer remote';
  env.server.state.papers.a.updatedAt = 1_000_000;
  env.server.state.papers.a.tags = ['remote'];
  env.server.state.metadata.a.title = 'new remote title';
  env.server.revision += 1;
  env.server.enabled = true;
  await env.poll();
  assert.equal(env.server.state.papers.a.note, 'local pending');
  assert.deepEqual(env.server.state.papers.a.tags, ['remote']);
  assert.equal(env.server.state.metadata.a.title, 'new remote title');
  assert.equal(env.server.accepted[0].expectedRevision, 11);
  assert.equal(env.context.api.localDirty(), false);
  const acceptedCount = env.server.accepted.length;
  await env.poll();
  assert.equal(env.server.accepted.length, acceptedCount);
  assertV3Only(env.server);
});

test('partial batch pause resumes only the remaining rows and preserves remote changes to acknowledged rows', async () => {
  const env = await fixture(populatedState(65), emptyState());
  env.server.enabled = true;
  env.server.pauseAfter = true;
  await env.poll();
  assert.equal(Object.keys(env.server.state.papers).length, 32);
  assert.equal(Object.keys(env.store.state.papers).length, 65);
  assert.equal(env.context.document.documentElement.dataset.accountSyncWrite, 'suspended');
  const acknowledged = env.server.accepted[0].operations.map(operation => operation.paperKey);
  const firstKey = acknowledged[0];
  env.server.state.papers[firstKey].note = 'remote after acknowledgment';
  env.server.state.metadata[firstKey].title = 'remote metadata after acknowledgment';
  env.server.revision += 1;
  env.server.enabled = true;
  await env.poll();
  assert.equal(Object.keys(env.server.state.papers).length, 65);
  assert.equal(env.server.state.papers[firstKey].note, 'remote after acknowledgment');
  assert.equal(env.server.state.metadata[firstKey].title, 'remote metadata after acknowledgment');
  assert.deepEqual(env.server.accepted.map(body => body.operations.length), [32, 32, 1]);
  assert.ok(env.server.accepted.slice(1).flatMap(body => body.operations)
    .every(operation => !acknowledged.includes(operation.paperKey)));
  assert.equal(env.context.api.localDirty(), false);
  assertV3Only(env.server);
});

test('lost response after commit recovers the latest revision and never replays the committed batch', async () => {
  const env = await fixture(populatedState(33), emptyState());
  env.server.enabled = true;
  env.server.dropAfter = true;
  await env.poll();
  assert.equal(env.server.dropAfter, false, 'the committed-response loss hook must run');
  assert.equal(Object.keys(env.server.state.papers).length, 33);
  assert.deepEqual(env.server.accepted.map(body => body.operations.length), [32, 1]);
  assert.deepEqual(env.server.accepted.map(body => body.expectedRevision), [10, 11]);
  const acceptedKeys = env.server.accepted.flatMap(body => body.operations.map(operation => operation.paperKey));
  assert.equal(new Set(acceptedKeys).size, acceptedKeys.length);
  assert.equal(env.context.api.localDirty(), false);
  assertV3Only(env.server);
});

test('session change while awaiting the first batch stops further requests and preserves the next account revision', async () => {
  const env = await fixture(populatedState(65), emptyState());
  env.server.enabled = true;
  env.server.switchAfter = true;
  await env.poll();
  assert.equal(env.server.switchAfter, false, 'the commit/response session boundary hook must run');
  assert.deepEqual(env.server.accepted.map(body => body.operations.length), [32]);
  assert.equal(env.server.accepted[0].sessionToken, 'fixture-session');
  assert.equal(env.server.requests.at(-1).mode, 'account-v3-mutate', 'old attempt must not enter recovery');
  assert.equal(env.storage.get(USER_KEY), 'another-fixture-user');
  assert.equal(env.storage.get(REVISION_KEY), '77');
  const requestCount = env.server.requests.length;
  await env.poll();
  assert.equal(env.server.requests.length, requestCount);
  assertV3Only(env.server);
});
