import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync('src/platform-api.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const OFFICIAL = '10.1021/acscatal.6c06476';
const SCIENCE = '10.1126/science.aef3001';
const MISSING = '10.1016/j.chempr.2026.103043';
const CANONICAL = 'https://api.gczhouwld.com';
const official = {
  doi: OFFICIAL, toc: { available: true, doi: OFFICIAL,
    imageUrl: '/media/toc-cache/images/verified-original.png', contentHash: 'valid-content-hash',
    reason: 'imported' },
  figures: { available: false, doi: OFFICIAL, figures: [] },
};
const science = {
  doi: SCIENCE, toc: { available: true, doi: SCIENCE, reason: 'figure1_fallback',
    imageUrl: '/media/primary-visual/images/verified/figure1.jpg',
    primary: { kind: 'figure1', imageUrl: '/media/primary-visual/images/verified/figure1.jpg' } },
  figures: { available: false, doi: SCIENCE, figures: [] },
};

function mock(host, { staticItems = {}, dynamicItems = [official, science],
  rejectRemote = false, inventoryItems = [] } = {}) {
  const origin = 'https://' + host;
  const calls = [];
  const warnings = [];
  let clock = 1791510000000;
  let manifestGeneration = 1;
  let manifestUnavailable = false;
  const fetch = async (path, options = {}) => {
    const url = new URL(String(path), origin);
    const method = options.method || 'GET';
    calls.push({ url: url.href, method, body: options.body || '' });
    if (url.origin === origin && url.pathname === '/media-index.json' && method === 'GET') {
      if (manifestUnavailable) return new Response('temporarily unavailable', { status: 503 });
      return new Response(JSON.stringify({ version: 1, generatedAt: manifestGeneration, items: staticItems }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    if (url.origin === CANONICAL && url.pathname.startsWith('/api/media/')) {
      if (rejectRemote) throw Error('canonical_offline');
      if (url.pathname === '/api/media/batch') {
        return new Response(JSON.stringify({ items: dynamicItems, generatedAt: 2 }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      if (url.pathname === '/api/media/inventory') {
        const body = JSON.parse(options.body || '{}');
        assert.equal(body.readOnly, true);
        return new Response(JSON.stringify({ items: inventoryItems, generatedAt: 2 }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
    }
    if (url.origin === origin && url.pathname === '/api/media/batch' && host === '127.0.0.1') {
      return new Response(JSON.stringify({ items: dynamicItems, generatedAt: 3 }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    throw Error('Unexpected or unsafe fetch: ' + method + ' ' + url);
  };
  const sandbox = {
    exports: {}, URL, Headers, fetch, Response,
    Date: class Clock extends Date { static now() { return clock; } },
    location: { hostname: host, protocol: 'https:' },
    document: { baseURI: origin + '/' },
    console: { warn: (...args) => warnings.push(args.map(String).join(' ')) },
  };
  runInNewContext(compiled, sandbox);
  return {
    api: sandbox.exports.api, calls, warnings,
    advance: ms => { clock += ms; },
    setManifest: (items, generatedAt) => { staticItems = items; manifestGeneration = generatedAt; },
    setManifestUnavailable: unavailable => { manifestUnavailable = unavailable; },
  };
}

for (const host of ['gallery.gczhouwld.com',
  'organic-synthesis-gallery-public.pages.dev', 'zhou526316-sys.github.io']) {
  test('static Gallery host ' + host + ' obtains original and Figure 1 from canonical media API', async () => {
    const x = mock(host);
    const reply = await x.api.post('/api/media/batch', { dois: [OFFICIAL, SCIENCE] });
    assert.equal(reply.data.items.length, 2);
    assert.equal(reply.data.items[0].toc.available, true);
    assert.equal(reply.data.items[0].toc.imageUrl,
      CANONICAL + '/media/toc-cache/images/verified-original.png');
    assert.equal(reply.data.items[1].toc.reason, 'figure1_fallback');
    assert.equal(reply.data.items[1].toc.imageUrl,
      CANONICAL + '/media/primary-visual/images/verified/figure1.jpg');
    assert.equal(reply.headers.get('x-gallery-media-source'), 'dynamic');
    const posts = x.calls.filter(row => row.method === 'POST');
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, CANONICAL + '/api/media/batch');
    assert.equal(x.warnings.length, 0);
  });
}

test('read-only inventory for custom Gallery host uses canonical API, not static Pages', async () => {
  const x = mock('gallery.gczhouwld.com', { inventoryItems: [{
    doi: MISSING, status: 'missing', largeSource: 'none', figureCount: 0,
  }] });
  const reply = await x.api.post('/api/media/inventory', { dois: [MISSING], readOnly: true });
  assert.equal(reply.data.items[0].doi, MISSING);
  assert.equal(reply.data.items[0].status, 'missing');
  assert.equal(x.calls.filter(row => row.method === 'POST')[0].url,
    CANONICAL + '/api/media/inventory');
});

test('real missing DOI remains missing and does not acquire an invented TOC', async () => {
  const x = mock('gallery.gczhouwld.com', { dynamicItems: [
    { doi: MISSING, toc: { available: false, reason: 'cache_miss' },
      figures: { available: false, figures: [] } },
  ] });
  const reply = await x.api.post('/api/media/batch', { dois: [MISSING] });
  assert.equal(reply.data.items[0].toc.available, false);
});

test('canonical API outage preserves only already verified static media', async () => {
  const x = mock('gallery.gczhouwld.com', {
    rejectRemote: true, staticItems: { [OFFICIAL]: official },
  });
  const reply = await x.api.post('/api/media/batch', { dois: [OFFICIAL, MISSING] });
  assert.equal(reply.data.items.length, 1);
  assert.equal(reply.data.items[0].doi, OFFICIAL);
  assert.equal(reply.data.items[0].toc.available, true);
  assert.equal(reply.headers.get('x-gallery-media-source'), 'static-fallback');
  assert.equal(x.warnings.length, 1);
  assert.equal(x.calls.filter(row => row.method === 'POST')[0].url,
    CANONICAL + '/api/media/batch');
});

test('local Vite dev uses its existing same-origin isolated API, not production', async () => {
  const x = mock('127.0.0.1');
  const reply = await x.api.post('/api/media/batch', { dois: [OFFICIAL] });
  assert.equal(reply.data.items.length, 1, 'only requested DOI is returned');
  assert.equal(x.calls.filter(row => row.method === 'POST')[0].url,
    'https://127.0.0.1/api/media/batch');
});

test('long-lived custom-domain tab refreshes the static body figures only after bounded TTL', async () => {
  const partial = {
    doi: OFFICIAL,
    toc: { ...official.toc, imageUrl: 'media-mirror/current-toc.png' },
    figures: { available: false, figures: [] },
  };
  const complete = {
    ...partial,
    figures: { available: true, figures: [
      { id: 'figure-1', label: 'Figure 1', imageUrl: 'media-mirror/body-auto-proven-1.png' },
      { id: 'figure-2', label: 'Figure 2', imageUrl: 'media-mirror/body-auto-proven-2.png' },
    ] },
  };
  const x = mock('gallery.gczhouwld.com', { staticItems: { [OFFICIAL]: partial }, dynamicItems: [] });
  const first = await x.api.post('/api/media/batch', { dois: [OFFICIAL] });
  assert.equal(first.data.items[0].figures.available, false);
  x.setManifest({ [OFFICIAL]: complete }, 2);
  const stillCached = await x.api.post('/api/media/batch', { dois: [OFFICIAL] });
  assert.equal(stillCached.data.items[0].figures.available, false);
  assert.equal(x.calls.filter(row => row.url.endsWith('/media-index.json')).length, 1);
  x.advance(5 * 60_000 + 1);
  const updated = await x.api.post('/api/media/batch', { dois: [OFFICIAL] });
  assert.equal(updated.data.items[0].figures.figures.length, 2);
  assert.ok(updated.data.items[0].figures.figures[0].imageUrl.endsWith('body-auto-proven-1.png'));
  assert.equal(updated.headers.get('x-gallery-media-source'), 'static-manifest');
  assert.equal(x.calls.filter(row => row.url.endsWith('/media-index.json')).length, 2);
});

test('live manifest refresh preserves prior original figure files through a 503 or stale CDN edge', async () => {
  const complete = {
    doi: OFFICIAL, toc: { ...official.toc, imageUrl: 'media-mirror/old-good-toc.png' },
    figures: { available: true, figures: [
      { id: 'figure-1', label: 'Figure 1', imageUrl: 'media-mirror/body-auto-good-1.png' },
    ] },
  };
  const x = mock('gallery.gczhouwld.com', { staticItems: { [OFFICIAL]: complete } });
  const first = await x.api.post('/api/media/batch', { dois: [OFFICIAL] });
  assert.equal(first.data.items[0].figures.figures.length, 1);
  x.advance(5 * 60_000 + 1);
  x.setManifestUnavailable(true);
  const outage = await x.api.post('/api/media/batch', { dois: [OFFICIAL] });
  assert.equal(outage.data.items[0].figures.figures.length, 1);
  assert.equal(outage.data.items[0].toc.available, true);
  x.setManifestUnavailable(false);
  x.setManifest({}, 0);
  x.advance(5 * 60_000 + 1);
  const stale = await x.api.post('/api/media/batch', { dois: [OFFICIAL] });
  assert.equal(stale.data.items[0].figures.figures.length, 1);
  assert.equal(stale.data.items[0].toc.available, true);
});
