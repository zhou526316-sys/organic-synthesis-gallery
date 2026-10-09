import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fetchStored, readVerifiedPriorLocalImage, transientAutoMediaError, AUTO_MEDIA_RETRY_DELAYS_MS } from '../cloudflare/scripts/merge-new-body-auto.mjs';
import { sha256 } from '../cloudflare/scripts/new-body-auto-validation.mjs';

const bytes = Buffer.from('immutable stored site media image test payload');
const site = 'https://gallery.gczhouwld.com/';
const response = status => new Response(status === 200 ? bytes : '', { status });

test('transient 503 is retried and verified source bytes are delivered', async () => {
  let calls = 0;
  const sleeps = [];
  const result = await fetchStored(site + 'media-index.json', 500, false, {
    fetchImpl: async (url, options) => {
      assert.equal(url.toString(), site + 'media-index.json');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.redirect, 'error');
      return response(++calls === 1 ? 503 : 200);
    },
    wait: async ms => sleeps.push(ms),
  });
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [AUTO_MEDIA_RETRY_DELAYS_MS[0]]);
  assert.deepEqual(result, bytes);
});

test('persistent 503 retries a bounded four requests, then fails closed', async () => {
  let calls = 0;
  const sleeps = [];
  await assert.rejects(
    () => fetchStored('media-index.json', 500, false, {
      fetchImpl: async () => { calls += 1; return response(503); },
      wait: async ms => sleeps.push(ms),
    }),
    /auto_read_http_503/,
  );
  assert.equal(calls, AUTO_MEDIA_RETRY_DELAYS_MS.length + 1);
  assert.deepEqual(sleeps, [...AUTO_MEDIA_RETRY_DELAYS_MS]);
});

test('a permanent 403 must not retry or be mistaken for a temporary gap', async () => {
  let calls = 0;
  await assert.rejects(
    () => fetchStored('media-index.json', 500, false, {
      fetchImpl: async () => { calls += 1; return response(403); },
      wait: async () => { throw new Error('unexpected delay'); },
    }),
    /auto_read_http_403/,
  );
  assert.equal(calls, 1);
});

test('missing optional 404 returns null; forbidden source fails before fetch', async () => {
  let calls = 0;
  assert.equal(await fetchStored('auto-body-publication.json', 500, true, {
    fetchImpl: async () => { calls += 1; return response(404); },
  }), null);
  assert.equal(calls, 1);
  await assert.rejects(() => fetchStored('https://pubs.acs.org/doi/10.1021/jacs.6c12345', 100, false, {
    fetchImpl: async () => { throw new Error('should not fetch publisher'); },
  }), /auto_fetch_not_stored_asset/);
});

test('oversized content is rejected immediately, never made publishable by retry', async () => {
  let calls = 0;
  await assert.rejects(() => fetchStored('media-index.json', 5, false, {
    fetchImpl: async () => { calls += 1; return response(200); },
    wait: async () => { throw new Error('unexpected delay'); },
  }), /auto_read_size_limit/);
  assert.equal(calls, 1);
});

test('exact digest-addressed old mirror is reusable; missing/corrupt bytes cannot be reused', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gallery-prior-media-'));
  try {
    const digest = sha256(bytes);
    const imageUrl = 'media-mirror/body-auto-' + digest + '.png';
    const old = { imageUrl, record: { sha256: digest } };
    const file = path.join(root, 'public', imageUrl);
    await mkdir(path.dirname(file), { recursive: true });
    assert.equal(await readVerifiedPriorLocalImage(root, old), null);
    await writeFile(file, bytes);
    assert.deepEqual(await readVerifiedPriorLocalImage(root, old), await readFile(file));
    await writeFile(file, Buffer.from('unverified mutation'));
    assert.equal(await readVerifiedPriorLocalImage(root, old), null);
    await assert.rejects(() => readVerifiedPriorLocalImage(root, {
      imageUrl: '../outside.png', record: { sha256: digest },
    }), /auto_previous_image_path/);
    await assert.rejects(() => readVerifiedPriorLocalImage(root, {
      imageUrl, record: { sha256: '0'.repeat(64) },
    }), /auto_previous_image_path/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('only network/server failures qualify as transient', () => {
  assert.equal(transientAutoMediaError(new Error('auto_read_http_503')), true);
  assert.equal(transientAutoMediaError(new Error('auto_read_http_429')), true);
  assert.equal(transientAutoMediaError(new Error('auto_read_http_403')), false);
  assert.equal(transientAutoMediaError(new Error('auto_read_size_limit')), false);
  assert.equal(transientAutoMediaError(new Error('auto_previous_image_path')), false);
});
