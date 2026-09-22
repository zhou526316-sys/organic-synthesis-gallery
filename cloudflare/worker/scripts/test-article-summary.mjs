// Re-run PR checks against the latest main review state.
import assert from 'node:assert/strict';
import { getArticleSummary, importArticleFulltext } from '../src/article-summary.js';

class MemoryObject {
  constructor(value, options = {}) {
    this.value = typeof value === 'string' ? value : new TextDecoder().decode(value);
    this.customMetadata = options.customMetadata || {};
    this.httpMetadata = options.httpMetadata || {};
  }
  async text() { return this.value; }
}

class MemoryR2 {
  constructor() { this.map = new Map(); }
  async put(key, value, options = {}) {
    this.map.set(key, new MemoryObject(value, options));
  }
  async get(key) {
    return this.map.get(key) || null;
  }
  async delete(key) {
    this.map.delete(key);
  }
}

const MEDIA = new MemoryR2();
let aiCalls = 0;
const AI = {
  async run(model, input) {
    aiCalls += 1;
    assert.equal(model, '@cf/google/gemma-4-26b-a4b-it');
    assert.ok(Array.isArray(input.messages));
    assert.match(input.messages.at(-1)?.content || '', /SYNCED FULL TEXT/);
    return {
      response: JSON.stringify({
        zh: '该研究建立了一种基于同步全文生成的中文摘要，概括反应设计、条件、机理、底物范围与局限。',
        en: 'This full-text-backed summary covers the reaction design, conditions, mechanism, substrate scope, limitations, and significance.',
      }),
    };
  },
};
const env = { MEDIA, AI };
const doi = '10.1021/jacs.6c08636';

const missing = await getArticleSummary(env, doi);
assert.equal(missing.status, 200);
assert.equal(missing.body.available, false);
assert.equal(missing.body.fulltextAvailable, false);
assert.equal(missing.body.reason, 'fulltext_missing');
assert.equal(aiCalls, 0);

const text = [
  'Title and abstract. This article describes a new catalytic organic transformation with mechanistic experiments.',
  'Introduction. The work addresses a synthetic limitation in selective bond construction.',
  'Results and discussion. The optimized conditions use a catalyst, reagent, solvent, and controlled temperature.',
  'Mechanistic studies support a radical pathway and explain the observed chemoselectivity.',
  'Substrate scope includes electron-rich and electron-poor partners and identifies limitations.',
  'Conclusion. The method broadens access to synthetically useful products.',
].join('\n\n').repeat(12);

const imported = await importArticleFulltext(env, {
  doi,
  text,
  sourceUrl: 'https://pubs.acs.org/doi/10.1021/jacs.6c08636',
  capturedAt: '2026-09-22T08:00:00Z',
});
assert.equal(imported.status, 200);
assert.equal(imported.body.stored, true);
assert.ok(imported.body.chars > 1000);

const generated = await getArticleSummary(env, doi);
assert.equal(generated.status, 200);
assert.equal(generated.body.available, true);
assert.equal(generated.body.fulltextAvailable, true);
assert.equal(generated.body.source, 'fulltext');
assert.equal(generated.body.cached, false);
assert.match(generated.body.zh, /中文摘要/);
assert.match(generated.body.en, /full-text-backed/);
assert.equal(aiCalls, 1);

const cached = await getArticleSummary(env, doi);
assert.equal(cached.status, 200);
assert.equal(cached.body.available, true);
assert.equal(cached.body.cached, true);
assert.equal(cached.body.zh, generated.body.zh);
assert.equal(cached.body.en, generated.body.en);
assert.equal(aiCalls, 1);

const noAi = await getArticleSummary({ MEDIA }, doi);
assert.equal(noAi.status, 200);
assert.equal(noAi.body.available, true);
assert.equal(noAi.body.cached, true);

const secondDoi = '10.1000/fulltext-no-ai';
const importedSecond = await importArticleFulltext({ MEDIA }, {
  doi: secondDoi,
  text,
  sourceUrl: 'https://example.org/article',
});
assert.equal(importedSecond.status, 200);
const unavailableAi = await getArticleSummary({ MEDIA }, secondDoi);
assert.equal(unavailableAi.status, 200);
assert.equal(unavailableAi.body.available, false);
assert.equal(unavailableAi.body.fulltextAvailable, true);
assert.equal(unavailableAi.body.reason, 'ai_unavailable');

console.log(JSON.stringify({
  missingFulltextExplicit: true,
  bilingualSummaryGenerated: true,
  summaryCached: true,
  aiUnavailableExplicit: true,
  aiCalls,
}));
