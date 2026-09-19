import assert from 'node:assert/strict';
import { exportOpenSiteFeedback, submitSiteFeedback } from '../src/user-ui.js';
import { serveMediaObject } from '../src/media.js';

class MemoryR2 {
  constructor() { this.map = new Map(); }
  async put(key, body, options = {}) {
    this.map.set(key, { body: String(body), options });
  }
  async get(key) {
    const value = this.map.get(key);
    if (!value) return null;
    return {
      httpEtag: '"test"',
      httpMetadata: value.options.httpMetadata || {},
      writeHttpMetadata() {},
      async text() { return value.body; },
      body: value.body,
    };
  }
  async list({ prefix = '', limit = 1000 } = {}) {
    const objects = [...this.map.keys()]
      .filter(key => key.startsWith(prefix))
      .sort()
      .slice(0, limit)
      .map(key => ({ key }));
    return { objects, truncated: false };
  }
}

const throwingDb = {
  prepare() {
    return {
      bind() {
        return {
          async first() { throw new Error("D1 daily row read limit exceeded [code: 7500]"); },
          async run() { throw new Error("D1 daily row read limit exceeded [code: 7500]"); },
          async all() { throw new Error("D1 daily row read limit exceeded [code: 7500]"); },
        };
      },
    };
  },
};

const media = new MemoryR2();
const env = { DB: throwingDb, MEDIA: media };
const profileId = 'profile-feedback-fallback-test';

for (let index = 0; index < 5; index += 1) {
  const result = await submitSiteFeedback(env, {
    profileId,
    category: 'search',
    message: `fallback feedback ${index}`,
    pagePath: '/',
    language: 'zh',
    searchQuery: 'photoredox',
    viewportWidth: 1280,
    viewportHeight: 900,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.accepted, true);
  assert.equal(result.body.storage, 'r2-fallback');
  assert.match(String(result.body.id), /^r2:/);
}

const limited = await submitSiteFeedback(env, {
  profileId,
  category: 'search',
  message: 'sixth fallback feedback should be rate limited',
});
assert.equal(limited.status, 429);
assert.equal(limited.body.error, 'feedback_rate_limited');

const exported = await exportOpenSiteFeedback(env, 300);
assert.equal(exported.status, 200);
assert.equal(exported.body.count, 5);
assert.equal(exported.body.sources.d1.available, false);
assert.equal(exported.body.sources.r2Fallback.count, 5);
assert.ok(exported.body.feedback.every(item => item.source === 'r2-fallback'));

const privateKey = [...media.map.keys()][0];
assert.ok(privateKey.startsWith('private/site-feedback/open/'));
const privateRead = await serveMediaObject(
  new Request(`https://example.test/media/${privateKey}`),
  { MEDIA: media },
);
assert.equal(privateRead.status, 404);

console.log(JSON.stringify({
  fallbackWrites: 5,
  fallbackRateLimit: true,
  mergedExport: true,
  privateMediaBlocked: true,
}));
