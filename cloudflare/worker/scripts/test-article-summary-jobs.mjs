import assert from 'node:assert/strict';
import { getArticleSummary, importArticleFulltext } from '../src/article-summary.js';
import {
  chunkArticleEvidence,
  enqueueArticleSummaryJob,
  mergeDraftFacts,
  processArticleSummaryJobs,
  validateReviewedAudit,
} from '../src/article-summary-jobs.js';

class MemoryObject {
  constructor(value, options = {}) {
    this.value = typeof value === 'string' ? value : new TextDecoder().decode(value);
    this.customMetadata = options.customMetadata || {};
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
      .map(([key, object]) => ({ key, customMetadata: object.customMetadata }));
    return { objects, truncated: false };
  }
}

class MemorySummaryJobStore {
  constructor() { this.rows = new Map(); }
  async upsert(job) {
    const now = Date.now();
    const prior = this.rows.get(job.doi);
    const changed = !prior || prior.source_hash !== job.sourceHash || prior.evidence_packet_hash !== job.evidencePacketHash;
    this.rows.set(job.doi, {
      ...(prior || {}),
      doi: job.doi,
      source_hash: job.sourceHash,
      evidence_packet_hash: job.evidencePacketHash,
      evidence_level: job.evidenceLevel,
      priority: Math.max(Number(prior?.priority || 0), Number(job.priority || 0)),
      state: changed ? 'queued' : prior.state,
      attempts: changed ? 0 : Number(prior?.attempts || 0),
      next_retry_at: changed ? 0 : Number(prior?.next_retry_at || 0),
      lease_owner: changed ? null : prior?.lease_owner || null,
      lease_expires_at: changed ? 0 : Number(prior?.lease_expires_at || 0),
      draft_cursor: changed ? 0 : Number(prior?.draft_cursor || 0),
      draft_chunk_count: changed ? 0 : Number(prior?.draft_chunk_count || 0),
      last_error: changed ? null : prior?.last_error || null,
      created_at: prior?.created_at || now,
      updated_at: now,
      published_at: changed ? null : prior?.published_at || null,
    });
  }
  async claim(owner) {
    const now = Date.now();
    const candidates = [...this.rows.values()]
      .filter(row => ['queued', 'draft_ready', 'audit_running'].includes(row.state))
      .filter(row => Number(row.next_retry_at || 0) <= now)
      .filter(row => !row.lease_owner || Number(row.lease_expires_at || 0) <= now)
      .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || Number(b.updated_at || 0) - Number(a.updated_at || 0));
    const row = candidates[0];
    if (!row) return null;
    row.lease_owner = owner;
    row.lease_expires_at = now + 8 * 60 * 1000;
    row.attempts = Number(row.attempts || 0) + 1;
    row.updated_at = now;
    return structuredClone(row);
  }
  async patch(doi, patch) {
    const row = this.rows.get(doi);
    if (!row) throw new Error('job_missing');
    Object.assign(row, patch, { updated_at: Date.now() });
  }
  async status(limit = 100) {
    return [...this.rows.values()].slice(0, limit).map(row => structuredClone(row));
  }
}

const doi = '10.1021/jacs.6c12345';
const MEDIA = new MemoryR2();
const SUMMARY_JOB_STORE = new MemorySummaryJobStore();
const requests = [];

function factFixture(evidenceId) {
  return {
    researchObjective: ['Develop a selective catalytic C–C bond-forming method.'],
    keyTransformationOrStrategy: ['Catalytic coupling forms a C–C bond.'],
    conditions: {
      catalysts: ['2 mol% catalyst'],
      ligands: [],
      reagents: [],
      additives: [],
      solvents: [],
      temperature: [],
      time: [],
      atmosphere: [],
      lightOrElectrochemistry: [],
      yieldAndSelectivity: ['82% yield'],
    },
    substrateScope: ['The supplied evidence reports representative substrate examples.'],
    limitations: [],
    mechanism: {
      experimentalEvidence: [],
      authorProposal: [],
      modelInference: [],
    },
    noveltyAndSyntheticSignificance: ['The method expands access to synthetically useful products.'],
    questionsForManualVerification: [],
    claims: [{
      claim: 'The reaction uses 2 mol% catalyst and gives 82% yield.',
      claimType: 'experimental_fact',
      evidenceIds: [evidenceId],
      confidence: 'high',
      notes: '',
    }],
  };
}

const OPENAI_FETCH = async (_url, init) => {
  const body = JSON.parse(init.body);
  requests.push(body);
  assert.equal(body.store, false);
  assert.equal(body.text?.format?.type, 'json_schema');
  assert.equal(body.text?.format?.strict, true);

  const schemaName = body.text.format.name;
  let payload;
  if (schemaName === 'organic_synthesis_evidence_draft') {
    assert.equal(body.model, 'gpt-5.6-terra');
    const user = String(body.input?.[1]?.content || '');
    const id = user.match(/EVIDENCE_ID:\s*([^\s]+)/)?.[1] || 's001';
    const header = JSON.parse(user.split('\n\n')[0]);
    payload = {
      doi: header.doi,
      evidenceLevel: header.evidenceLevel,
      chunkIndex: header.chunkIndex,
      chunkCount: header.chunkCount,
      facts: factFixture(id),
    };
  } else if (schemaName === 'organic_synthesis_evidence_audit') {
    assert.equal(body.model, 'gpt-5.6-sol');
    const user = JSON.parse(body.input?.[1]?.content || '{}');
    const id = user.citedEvidence?.[0]?.id || user.mergedDraft?.claims?.[0]?.evidenceIds?.[0] || 's001';
    payload = {
      verdict: 'pass',
      correctedFacts: factFixture(id),
      unsupportedClaims: [],
      numericalIssues: [],
      coverageWarnings: [],
      manualReviewQuestions: [],
      zh: '核心反应：该研究建立了催化 C–C 成键方法。关键条件：催化剂用量 2 mol%，示例产率 82%。',
      en: 'Core transformation: the study establishes a catalytic C–C bond-forming method. Key conditions: 2 mol% catalyst and 82% yield in the cited example.',
    };
  } else {
    throw new Error('unexpected schema ' + schemaName);
  }

  return new Response(JSON.stringify({
    id: 'resp_' + requests.length,
    model: body.model,
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(payload) }] }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const env = {
  MEDIA,
  SUMMARY_JOB_STORE,
  OPENAI_API_KEY: 'test-only-key',
  OPENAI_FETCH,
};

const longUnit = ('Detailed chemistry evidence. Catalyst loading 2 mol% gives 82% yield under the reported conditions. ').repeat(2700);
const imported = await importArticleFulltext(env, {
  schemaVersion: 'article-evidence-v2',
  doi,
  pageDoi: doi,
  title: 'Long evidence fixture',
  journal: 'JACS',
  publisher: 'acs',
  articleUrl: 'https://pubs.acs.org/doi/10.1021/jacs.6c12345',
  sourceUrl: 'https://pubs.acs.org/doi/10.1021/jacs.6c12345',
  captureVersion: '6.2.20',
  controllerRevision: '2.2.32',
  jobId: '12345678-1234-1234-1234-123456789012',
  queueGeneratedAt: '2026-09-25T01:00:00Z',
  capturedAt: '2026-09-25T01:00:00Z',
  fulltextStatus: 'complete',
  textProcessingPolicy: 'unknown',
  sections: Array.from({ length: 5 }, (_, index) => ({
    type: index === 0 ? 'abstract' : index === 4 ? 'conclusion' : 'results',
    heading: index === 0 ? 'Abstract' : index === 4 ? 'Conclusion' : 'Results ' + index,
    order: index,
    text: longUnit + ' Section ' + index,
  })),
  captions: [],
  tables: [],
});
assert.equal(imported.status, 200);
assert.equal(imported.body.stored, true);

const evidenceObject = [...MEDIA.map.entries()].find(([key]) => key.startsWith('private/article-evidence-v2/'))?.[1];
const evidence = JSON.parse(await evidenceObject.text());

const smallChunks = chunkArticleEvidence(evidence, 1000);
const reconstructed = smallChunks.flat().reduce((sum, row) => sum + row.text.length, 0);
const originalChars = [...evidence.sections, ...evidence.captions, ...evidence.tables].reduce((sum, row) => sum + row.text.length, 0);
assert.equal(reconstructed, originalChars, 'chunking must not drop evidence text');

const queued = await enqueueArticleSummaryJob(env, {
  doi,
  sourceHash: imported.body.sourceHash,
  evidencePacketHash: imported.body.evidencePacketHash,
  evidenceLevel: imported.body.evidenceLevel,
});
assert.equal(queued.queued, true);

let result = await processArticleSummaryJobs(env, { limit: 1 });
assert.equal(result.processed, 1);
assert.equal(result.results[0].state, 'queued');
assert.ok(SUMMARY_JOB_STORE.rows.get(doi).draft_cursor > 0);
assert.ok(SUMMARY_JOB_STORE.rows.get(doi).draft_chunk_count > 3);

while (SUMMARY_JOB_STORE.rows.get(doi).state === 'queued') {
  SUMMARY_JOB_STORE.rows.get(doi).next_retry_at = 0;
  result = await processArticleSummaryJobs(env, { limit: 1 });
  assert.equal(result.processed, 1);
}
assert.equal(SUMMARY_JOB_STORE.rows.get(doi).state, 'draft_ready');

result = await processArticleSummaryJobs(env, { limit: 1 });
assert.equal(result.results[0].state, 'published');
assert.equal(SUMMARY_JOB_STORE.rows.get(doi).state, 'published');

const summary = await getArticleSummary(env, doi);
assert.equal(summary.status, 200);
assert.equal(summary.body.available, true);
assert.equal(summary.body.state, 'published');
assert.equal(summary.body.source, 'reviewed_evidence_v2');
assert.equal(summary.body.evidenceLevel, 'complete');
assert.match(summary.body.zh, /2 mol%/);
assert.match(summary.body.en, /82%/);

assert.ok(requests.filter(row => row.model === 'gpt-5.6-terra').length >= 4);
assert.equal(requests.filter(row => row.model === 'gpt-5.6-sol').length, 1);
assert.ok(requests.every(row => row.store === false));

const merged = mergeDraftFacts([{ facts: factFixture('s001') }, { facts: factFixture('s001') }]);
assert.equal(merged.claims.length, 1);
assert.equal(merged.conditions.catalysts.length, 1);

const invalidAudit = {
  verdict: 'pass',
  unsupportedClaims: [],
  numericalIssues: [],
  zh: '错误数值 99%。',
  en: 'Incorrect 99%.',
  correctedFacts: {
    ...factFixture('s001'),
    mechanism: { experimentalEvidence: [], authorProposal: [], modelInference: [] },
    claims: [{
      claim: 'The reaction gives 99% yield.',
      claimType: 'experimental_fact',
      evidenceIds: ['s001'],
      confidence: 'high',
      notes: '',
    }],
  },
};
const invalidCheck = validateReviewedAudit(evidence, invalidAudit);
assert.equal(invalidCheck.ok, false);
assert.ok(invalidCheck.issues.some(value => value.includes('numeric_evidence_missing')));

const inferenceAudit = {
  ...invalidAudit,
  correctedFacts: {
    ...factFixture('s001'),
    mechanism: { experimentalEvidence: [], authorProposal: [], modelInference: ['Unsupported inferred radical pathway.'] },
    claims: [],
  },
  zh: '测试。',
  en: 'Test.',
};
const inferenceCheck = validateReviewedAudit(evidence, inferenceAudit);
assert.equal(inferenceCheck.ok, false);
assert.ok(inferenceCheck.issues.includes('model_inference_present'));

SUMMARY_JOB_STORE.rows.get(doi).state = 'audit_running';
SUMMARY_JOB_STORE.rows.get(doi).lease_owner = null;
SUMMARY_JOB_STORE.rows.get(doi).lease_expires_at = 0;
const recovered = await SUMMARY_JOB_STORE.claim('recovery-owner');
assert.equal(recovered.state, 'audit_running');

console.log(JSON.stringify({
  reviewedPipeline: true,
  noTotalEvidenceTruncation: true,
  draftModel: 'gpt-5.6-terra',
  auditModel: 'gpt-5.6-sol',
  storeFalse: true,
  structuredOutputsStrict: true,
  deterministicNumericGuard: true,
  modelInferenceGuard: true,
  crashRecovery: true,
  requests: requests.length,
}));
