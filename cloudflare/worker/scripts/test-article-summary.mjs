import assert from 'node:assert/strict';
import {
  ARTICLE_EVIDENCE_SCHEMA_VERSION,
  ARTICLE_REVIEWED_SUMMARY_SCHEMA_VERSION,
  getArticleEvidenceInventory,
  getArticleSummary,
  importArticleFulltext,
} from '../src/article-summary.js';

class MemoryObject {
  constructor(value, options = {}) {
    this.value = typeof value === 'string' ? value : new TextDecoder().decode(value);
    this.customMetadata = options.customMetadata || {};
    this.httpMetadata = options.httpMetadata || {};
    this.size = new TextEncoder().encode(this.value).length;
  }
  async text() { return this.value; }
}

class MemoryR2 {
  constructor() { this.map = new Map(); }
  async put(key, value, options = {}) { this.map.set(key, new MemoryObject(value, options)); }
  async get(key) { return this.map.get(key) || null; }
  async delete(key) { this.map.delete(key); }
  async list({ prefix = '', limit = 1000 } = {}) {
    const objects = [...this.map.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .slice(0, limit)
      .map(([key, object]) => ({ key, size: object.size, customMetadata: object.customMetadata }));
    return { objects, truncated: false };
  }
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function storageKeys(doi) {
  const id = (await sha256Hex(doi)).slice(0, 32);
  return {
    evidence: `private/article-evidence-v2/${id}.json`,
    legacy: `private/article-fulltext/${id}.txt`,
    summary: `private/article-summary/${id}.json`,
  };
}

const MEDIA = new MemoryR2();
let aiCalls = 0;
const AI = { async run() { aiCalls += 1; throw new Error('GET must never invoke AI'); } };
const env = { MEDIA, AI, SCHEDULED_SUMMARY_HANDOFF_ENABLED: '0' };
const doi = '10.1021/jacs.6c08636';

const sectionText = [
  'This catalytic study reports a selective organic transformation under defined reaction conditions.',
  'Optimization evaluates catalyst loading, reagent equivalents, solvent, temperature, and reaction time.',
  'The substrate scope includes electronically and sterically diverse partners with reported yields and selectivities.',
  'Mechanistic experiments include control reactions and radical-probe observations, while the authors separately propose a catalytic cycle.',
  'The conclusion describes synthetic utility and explicitly notes limitations for selected substrate classes.',
].join(' ').repeat(5);

function evidencePayload(extra = {}) {
  return {
    schemaVersion: ARTICLE_EVIDENCE_SCHEMA_VERSION,
    doi,
    pageDoi: doi,
    title: 'Fixture catalytic reaction',
    journal: 'JACS',
    publisher: 'acs',
    articleUrl: 'https://pubs.acs.org/doi/10.1021/jacs.6c08636',
    sourceUrl: 'https://pubs.acs.org/doi/10.1021/jacs.6c08636',
    captureVersion: '6.2.20',
    controllerRevision: '2.2.32',
    jobId: '12345678-1234-1234-1234-123456789012',
    queueGeneratedAt: '2026-09-24T15:49:28.181Z',
    capturedAt: '2026-09-24T16:00:00Z',
    fulltextStatus: 'complete',
    textProcessingPolicy: 'unknown',
    sections: [
      { type: 'abstract', heading: 'Abstract', order: 0, text: sectionText },
      { type: 'results_and_discussion', heading: 'Results and Discussion', order: 1, text: sectionText },
      { type: 'mechanistic_studies', heading: 'Mechanistic Studies', order: 2, text: sectionText },
      { type: 'references', heading: 'References', order: 3, text: 'This excluded section must not enter the evidence packet.'.repeat(20) },
    ],
    captions: [
      { label: 'Scheme 1', type: 'scheme', text: 'Scheme 1. Standard reaction and representative product formation under optimized conditions.' },
    ],
    tables: [
      { label: 'Table 1', title: 'Optimization', text: 'Entries compare catalyst loading, solvent, temperature, conversion, yield, and selectivity.' },
    ],
    ...extra,
  };
}

const missing = await getArticleSummary(env, doi);
assert.equal(missing.status, 200);
assert.equal(missing.body.available, false);
assert.equal(missing.body.fulltextAvailable, false);
assert.equal(missing.body.reason, 'fulltext_missing');
assert.equal(aiCalls, 0);

const wrongDoi = await importArticleFulltext(env, evidencePayload({ pageDoi: '10.1021/jacs.6c99999' }));
assert.equal(wrongDoi.status, 400);
assert.equal(wrongDoi.body.error, 'page_doi_mismatch');

const wrongHost = await importArticleFulltext(env, evidencePayload({
  articleUrl: 'https://example.org/doi/10.1021/jacs.6c08636',
  sourceUrl: 'https://example.org/doi/10.1021/jacs.6c08636',
}));
assert.equal(wrongHost.status, 400);
assert.equal(wrongHost.body.error, 'publisher_source_mismatch');

const wrongArticle = await importArticleFulltext(env, evidencePayload({
  articleUrl: 'https://pubs.acs.org/doi/10.1021/jacs.6c99999',
  sourceUrl: 'https://pubs.acs.org/doi/10.1021/jacs.6c99999',
}));
assert.equal(wrongArticle.status, 400);
assert.equal(wrongArticle.body.error, 'article_url_doi_mismatch');

const oldController = await importArticleFulltext(env, evidencePayload({ controllerRevision: '2.2.31' }));
assert.equal(oldController.status, 400);
assert.equal(oldController.body.error, 'controller_revision_too_old');

const partial = await importArticleFulltext(env, evidencePayload({ fulltextStatus: 'partial' }));
assert.equal(partial.status, 200);
assert.equal(partial.body.evidenceLevel, 'partial');

const invalidLevel = await importArticleFulltext(env, evidencePayload({ fulltextStatus: 'invalid' }));
assert.equal(invalidLevel.status, 400);
assert.equal(invalidLevel.body.error, 'invalid_evidence_status');

const challenge = await importArticleFulltext(env, evidencePayload({
  sections: [
    { type: 'abstract', heading: 'Abstract', order: 0, text: ('Verify you are human. Access denied. ' + sectionText).repeat(8) },
    { type: 'results', heading: 'Results', order: 1, text: sectionText },
  ],
}));
assert.equal(challenge.status, 400);
assert.equal(challenge.body.error, 'challenge_or_auth_page_detected');

const imported = await importArticleFulltext(env, evidencePayload());
assert.equal(imported.status, 200);
assert.equal(imported.body.stored, true);
assert.equal(imported.body.state, 'evidence_ready');
assert.equal(imported.body.schemaVersion, ARTICLE_EVIDENCE_SCHEMA_VERSION);
assert.equal(imported.body.evidenceLevel, 'complete');
assert.ok(imported.body.chars > 0);
assert.equal(imported.body.sections, 3);
assert.match(imported.body.sourceHash, /^[a-f0-9]{64}$/);
assert.match(imported.body.evidencePacketHash, /^[a-f0-9]{64}$/);
const abstractDoi = '10.1021/jacs.6c08637';
const shortAbstract = 'Short abstract: catalytic C–C bond formation proceeds selectively under mild conditions.';
const abstractOnly = await importArticleFulltext(env, evidencePayload({
  doi: abstractDoi,
  pageDoi: abstractDoi,
  articleUrl: 'https://pubs.acs.org/doi/10.1021/jacs.6c08637',
  sourceUrl: 'https://pubs.acs.org/doi/10.1021/jacs.6c08637',
  fulltextStatus: 'abstract_only',
  sections: [{ type: 'abstract', heading: 'Abstract', order: 0, text: shortAbstract }],
  captions: [],
  tables: [],
}));
assert.equal(abstractOnly.status, 200);
assert.equal(abstractOnly.body.evidenceLevel, 'abstract_only');
assert.equal(abstractOnly.body.sections, 1);
const abstractKeys = await storageKeys(abstractDoi);
const abstractStored = JSON.parse(await (await MEDIA.get(abstractKeys.evidence)).text());
assert.equal(abstractStored.sections[0].text, shortAbstract);

const noLimitDoi = '10.1021/jacs.6c08638';
const hugeText = 'Large evidence body with chemistry facts, conditions, scope, and mechanistic detail. '.repeat(30000);
const noLimit = await importArticleFulltext(env, evidencePayload({
  doi: noLimitDoi,
  pageDoi: noLimitDoi,
  articleUrl: 'https://pubs.acs.org/doi/10.1021/jacs.6c08638',
  sourceUrl: 'https://pubs.acs.org/doi/10.1021/jacs.6c08638',
  sections: [
    { type: 'abstract', heading: 'Abstract', order: 0, text: hugeText },
    { type: 'results', heading: 'Results', order: 1, text: hugeText },
  ],
  captions: [],
  tables: [],
}));
assert.equal(noLimit.status, 200);
const noLimitKeys = await storageKeys(noLimitDoi);
const noLimitStored = JSON.parse(await (await MEDIA.get(noLimitKeys.evidence)).text());
assert.equal(noLimitStored.sections[0].text.length, hugeText.trim().length);
assert.equal(noLimitStored.sections[1].text.length, hugeText.trim().length);

const abstractPending = await getArticleSummary(env, abstractDoi);
assert.equal(abstractPending.body.available, false);
assert.equal(abstractPending.body.fulltextAvailable, false);
assert.equal(abstractPending.body.evidenceAvailable, true);
assert.equal(abstractPending.body.evidenceLevel, 'abstract_only');
assert.equal(abstractPending.body.reason, 'scheduled_summary_pending');

const manyRowsDoi = '10.1021/jacs.6c08639';
const manyRows = Array.from({ length: 120 }, (_, index) => ({
  type: index === 0 ? 'abstract' : index % 3 === 0 ? 'mechanism' : 'results',
  heading: 'Section ' + index,
  order: index,
  text: ('Evidence row ' + index + ' with chemistry detail. ').repeat(4),
}));
const manyRowsResult = await importArticleFulltext(env, evidencePayload({
  doi: manyRowsDoi,
  pageDoi: manyRowsDoi,
  articleUrl: 'https://pubs.acs.org/doi/10.1021/jacs.6c08639',
  sourceUrl: 'https://pubs.acs.org/doi/10.1021/jacs.6c08639',
  sections: manyRows,
  captions: [],
  tables: [],
}));
assert.equal(manyRowsResult.status, 200);
assert.equal(manyRowsResult.body.sections, 120);

const pending = await getArticleSummary(env, doi);
assert.equal(pending.status, 200);
assert.equal(pending.body.available, false);
assert.equal(pending.body.fulltextAvailable, true);
assert.equal(pending.body.evidenceAvailable, true);
assert.equal(pending.body.state, 'evidence_ready');
assert.equal(pending.body.reason, 'scheduled_summary_pending');
assert.equal(aiCalls, 0);

const keys = await storageKeys(doi);
await MEDIA.put(keys.summary, JSON.stringify({
  schemaVersion: ARTICLE_REVIEWED_SUMMARY_SCHEMA_VERSION,
  status: 'approved',
  doi,
  sourceHash: imported.body.sourceHash,
  evidencePacketHash: imported.body.evidencePacketHash,
  zh: '该摘要已经过证据链审核，不由公开 GET 请求现场生成。',
  en: 'This summary was approved against the evidence packet and is never generated by the public GET request.',
  model: 'test-model',
  modelSnapshot: 'test-snapshot',
  promptVersion: 'summary-draft-v1',
  auditVersion: 'summary-audit-v1',
  generatedAt: 1790265600000,
  reviewedAt: 1790265660000,
}));

const approved = await getArticleSummary(env, doi);
assert.equal(approved.status, 200);
assert.equal(approved.body.available, true);
assert.equal(approved.body.state, 'published');
assert.equal(approved.body.source, 'reviewed_evidence_v2');
assert.equal(approved.body.evidenceLevel, 'complete');
assert.match(approved.body.zh, /证据链审核/);
assert.match(approved.body.en, /approved against the evidence packet/);
assert.equal(aiCalls, 0);

const changed = evidencePayload({
  sections: evidencePayload().sections.map((row, index) => index === 1
    ? { ...row, text: row.text + ' Newly synchronized correction changes the source hash.' }
    : row),
  capturedAt: '2026-09-24T17:00:00Z',
});
const reimported = await importArticleFulltext(env, changed);
assert.equal(reimported.status, 200);
assert.notEqual(reimported.body.sourceHash, imported.body.sourceHash);

const stale = await getArticleSummary(env, doi);
assert.equal(stale.status, 200);
assert.equal(stale.body.available, false);
assert.equal(stale.body.state, 'superseded');
assert.equal(stale.body.reason, 'summary_stale');
assert.equal(aiCalls, 0);

const inventory = await getArticleEvidenceInventory(env);
assert.equal(inventory.status, 200);
assert.ok(inventory.body.count >= 3);
assert.equal(inventory.body.items.find(row => row.doi === abstractDoi)?.evidenceLevel, 'abstract_only');

const legacyDoi = '10.1021/jacs.6c08640';
const legacyKeys = await storageKeys(legacyDoi);
await MEDIA.put(legacyKeys.legacy, 'Legacy full text '.repeat(200));
const legacy = await getArticleSummary(env, legacyDoi);
assert.equal(legacy.status, 200);
assert.equal(legacy.body.available, false);
assert.equal(legacy.body.fulltextAvailable, true);
assert.equal(legacy.body.evidenceAvailable, false);
assert.equal(legacy.body.state, 'legacy_fulltext');
assert.equal(legacy.body.reason, 'evidence_v2_required');

console.log(JSON.stringify({
  getIsReadOnly: true,
  aiCalls,
  provenanceGuards: ['page_doi', 'publisher_host', 'article_url_doi', 'capture_version', 'controller_revision', 'job_id'],
  evidenceLevels: ['complete', 'partial', 'abstract_only'],
  totalTextBudget: null,
  shortAbstractPreserved: true,
  privateInventory: true,
  evidenceSchema: ARTICLE_EVIDENCE_SCHEMA_VERSION,
  reviewedSummarySchema: ARTICLE_REVIEWED_SUMMARY_SCHEMA_VERSION,
  sourceHashInvalidatesSummary: true,
  legacySummaryNotAutoApproved: true,
}));
