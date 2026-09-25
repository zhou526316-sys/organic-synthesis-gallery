import assert from 'node:assert/strict';
import {
  ARTICLE_EVIDENCE_SCHEMA_VERSION,
  getArticleSummary,
  importArticleFulltext,
} from '../src/article-summary.js';
import {
  getSummaryReviewStatus,
  runSummaryReviewCycle,
  SUMMARY_AUDIT_PROMPT_VERSION,
  SUMMARY_DRAFT_PROMPT_VERSION,
} from '../src/summary-review.js';

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
      .sort(([a],[b]) => a.localeCompare(b))
      .slice(0, limit)
      .map(([key, object]) => ({ key, size: object.size, customMetadata: object.customMetadata }));
    return { objects, truncated: false };
  }
}

const MEDIA = new MemoryR2();
const baseEnv = {
  MEDIA,
  SUMMARY_REVIEW_ENABLED: '1',
  SUMMARY_ALLOW_UNKNOWN_POLICY: '1',
  OPENAI_API_KEY: 'test-only-key',
  SUMMARY_DRAFT_MODEL: 'gpt-5.6-terra',
  SUMMARY_AUDIT_MODEL: 'gpt-5.6-sol',
};

const sectionText = [
  'This study reports a catalytic C-C bond-forming reaction under defined conditions.',
  'Optimization identifies catalyst loading, solvent, temperature, reaction time, and reagent equivalents.',
  'The substrate scope covers electronically diverse partners and reports yields and selectivities.',
  'Control reactions and radical-probe observations provide mechanistic evidence, while the authors separately propose a catalytic cycle.',
  'The conclusion states synthetic utility and notes limitations for selected substrate classes.',
].join(' ').repeat(6);

function payload(doi, capturedAt, extra = {}) {
  return {
    schemaVersion: ARTICLE_EVIDENCE_SCHEMA_VERSION,
    doi,
    pageDoi: doi,
    title: 'GPT review fixture',
    journal: 'JACS',
    publisher: 'acs',
    articleUrl: 'https://pubs.acs.org/doi/' + doi,
    sourceUrl: 'https://pubs.acs.org/doi/' + doi,
    captureVersion: '6.2.20',
    controllerRevision: '2.2.32',
    jobId: crypto.randomUUID(),
    queueGeneratedAt: '2026-09-25T00:08:01.137Z',
    capturedAt,
    fulltextStatus: 'complete',
    textProcessingPolicy: 'unknown',
    sections: [
      { type: 'abstract', heading: 'Abstract', order: 0, text: sectionText },
      { type: 'results', heading: 'Results and Discussion', order: 1, text: sectionText },
      { type: 'mechanism', heading: 'Mechanistic Studies', order: 2, text: sectionText },
      { type: 'conclusion', heading: 'Conclusion', order: 3, text: sectionText },
    ],
    captions: [
      { label: 'Scheme 1', type: 'scheme', text: 'Scheme 1. Representative catalytic coupling and product formation.' },
    ],
    tables: [
      { label: 'Table 1', title: 'Optimization', text: 'Catalyst loading 2 mol%; -20 °C; 12 h; 82% yield; 95% ee.' },
    ],
    ...extra,
  };
}

function draftFor(doi, evidenceLevel = 'complete', badEvidence = false) {
  return {
    doi,
    evidenceLevel,
    researchObjective: 'Develop a selective catalytic C-C bond-forming reaction.',
    keyTransformationOrStrategy: 'Catalytic coupling to form a C-C bond.',
    conditions: [
      { name: 'Catalyst loading', value: '2 mol%', role: 'catalyst loading', evidenceIds: [badEvidence ? 't999' : 't001'] },
      { name: 'Temperature', value: '-20 °C', role: 'reaction temperature', evidenceIds: ['t001'] },
      { name: 'Time', value: '12 h', role: 'reaction time', evidenceIds: ['t001'] },
    ],
    substrateScope: {
      summary: 'The captured results describe electronically diverse partners with reported yields and selectivities.',
      supportedTrends: ['Electronic diversity is represented in the captured scope discussion.'],
      limitations: ['Selected substrate classes are reported as limitations.'],
      evidenceIds: ['s002', 's004'],
    },
    mechanism: {
      experimentalEvidence: [
        { statement: 'Control reactions and radical-probe observations are reported.', evidenceIds: ['s003'] },
      ],
      authorProposal: [
        { statement: 'The authors separately propose a catalytic cycle.', evidenceIds: ['s003'] },
      ],
      modelInference: [],
    },
    noveltyAndSyntheticSignificance: 'The method addresses a selective bond-construction problem and provides synthetically useful products.',
    limitations: ['The captured conclusion notes limitations for selected substrate classes.'],
    questionsForManualVerification: [],
    claims: [
      {
        claim: 'The optimization table reports 82% yield and 95% ee.',
        claimType: 'experimental_fact',
        evidenceIds: ['t001'],
        confidence: 'high',
        notes: '',
      },
      {
        claim: 'The authors propose a catalytic cycle.',
        claimType: 'author_proposal',
        evidenceIds: ['s003'],
        confidence: 'high',
        notes: 'Proposal is kept distinct from mechanistic evidence.',
      },
    ],
    draftZh: '该研究建立了一种选择性催化 C–C 成键反应；优化条件包含 2 mol% 催化剂、−20 °C 和 12 h，并报告 82% 收率和 95% ee。机理部分区分控制实验与作者提出的催化循环。',
    draftEn: 'The study establishes a selective catalytic C-C bond-forming reaction. The captured optimization reports 2 mol% catalyst, -20 °C, 12 h, 82% yield, and 95% ee. Mechanistic evidence is kept distinct from the authors proposed catalytic cycle.',
  };
}

function auditPass() {
  return {
    outcome: 'pass',
    issues: [],
    finalZh: '该研究建立了一种选择性催化 C–C 成键反应。已捕获的优化表显示 2 mol% 催化剂、−20 °C、12 h，可达 82% 收率和 95% ee。底物范围覆盖电子性质不同的反应物；机理证据包括控制实验和自由基探针，而催化循环属于作者提出的机理。文中同时指出部分底物类别存在局限。',
    finalEn: 'The study establishes a selective catalytic C-C bond-forming reaction. The captured optimization table reports 2 mol% catalyst at -20 °C for 12 h, reaching 82% yield and 95% ee. The scope includes electronically diverse partners. Mechanistic evidence consists of control experiments and radical probes, whereas the catalytic cycle is an author proposal. Limitations are reported for selected substrate classes.',
    modelInferencePresent: false,
    unsupportedClaimCount: 0,
    auditNotes: 'All retained claims are supported by cited evidence.',
  };
}

function responseObject(model, value) {
  return new Response(JSON.stringify({
    id: 'resp_test',
    object: 'response',
    model,
    output: [{
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: JSON.stringify(value) }],
    }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

const doi = '10.1021/jacs.6c90001';
const imported = await importArticleFulltext(baseEnv, payload(doi, '2026-09-25T01:00:00Z'));
assert.equal(imported.status, 200);

let requests = [];
const fetchPass = async (_url, init) => {
  const body = JSON.parse(init.body);
  requests.push(body);
  if (requests.length === 1) return responseObject('gpt-5.6-terra-2026-test', draftFor(doi));
  if (requests.length === 2) return responseObject('gpt-5.6-sol-2026-test', auditPass());
  throw new Error('unexpected third OpenAI call');
};

const cycle = await runSummaryReviewCycle(baseEnv, { fetchImpl: fetchPass });
assert.equal(cycle.status, 'published');
assert.equal(cycle.doi, doi);
assert.equal(requests.length, 2);
assert.equal(requests[0].model, 'gpt-5.6-terra');
assert.equal(requests[1].model, 'gpt-5.6-sol');
assert.equal(requests[0].store, false);
assert.equal(requests[1].store, false);
assert.equal(requests[0].text.format.type, 'json_schema');
assert.equal(requests[0].text.format.strict, true);
assert.equal(requests[1].text.format.type, 'json_schema');
assert.equal(requests[1].text.format.strict, true);
assert.match(requests[0].input, /ARTICLE EVIDENCE PACKET/);
assert.match(requests[1].input, /DETERMINISTIC VALIDATION ISSUES/);

const publicSummary = await getArticleSummary(baseEnv, doi);
assert.equal(publicSummary.status, 200);
assert.equal(publicSummary.body.available, true);
assert.equal(publicSummary.body.source, 'reviewed_evidence_v2');
assert.equal(publicSummary.body.evidenceLevel, 'complete');
assert.equal(publicSummary.body.model, 'gpt-5.6-sol');
assert.equal(publicSummary.body.modelSnapshot, 'gpt-5.6-sol-2026-test');
assert.match(publicSummary.body.zh, /82%/);
assert.match(publicSummary.body.en, /95% ee/);

const status = await getSummaryReviewStatus(baseEnv);
assert.equal(status.status, 200);
assert.equal(status.body.enabled, true);
assert.equal(status.body.states.published, 1);
assert.equal(status.body.dailyLimit, 96);
assert.equal(status.body.promptVersion, SUMMARY_DRAFT_PROMPT_VERSION);
assert.equal(status.body.auditVersion, SUMMARY_AUDIT_PROMPT_VERSION);

const limitedDoi = '10.1021/jacs.6c90009';
await importArticleFulltext(baseEnv, payload(limitedDoi, '2026-09-25T01:30:00Z'));
let limitedCalls = 0;
const limited = await runSummaryReviewCycle({ ...baseEnv, SUMMARY_REVIEW_DAILY_LIMIT: '1' }, {
  fetchImpl: async () => { limitedCalls += 1; throw new Error('daily limit must prevent API calls'); },
});
assert.equal(limited.status, 'daily_limit');
assert.equal(limited.dailyLimit, 1);
assert.equal(limitedCalls, 0);

const badDoi = '10.1021/jacs.6c90002';
await importArticleFulltext(baseEnv, payload(badDoi, '2026-09-25T02:00:00Z'));
let badCalls = 0;
const fetchBad = async (_url, init) => {
  badCalls += 1;
  const body = JSON.parse(init.body);
  if (badCalls === 1) {
    assert.equal(body.model, 'gpt-5.6-terra');
    return responseObject('gpt-5.6-terra-2026-test', draftFor(badDoi, 'complete', true));
  }
  throw new Error('audit must not run after deterministic evidence-ID failure');
};
const blocked = await runSummaryReviewCycle(baseEnv, { fetchImpl: fetchBad });
assert.equal(blocked.status, 'needs_manual_review');
assert.equal(blocked.doi, badDoi);
assert.equal(badCalls, 1);
const badPublic = await getArticleSummary(baseEnv, badDoi);
assert.equal(badPublic.body.available, false);

const abstractDoi = '10.1021/jacs.6c90003';
await importArticleFulltext(baseEnv, payload(abstractDoi, '2026-09-25T03:00:00Z', {
  fulltextStatus: 'abstract_only',
  sections: [{ type: 'abstract', heading: 'Abstract', order: 0, text: 'The abstract reports a catalytic coupling with useful selectivity but does not provide detailed optimization, scope examples, or mechanistic controls.' }],
  captions: [],
  tables: [],
}));
let abstractCalls = 0;
const fetchAbstract = async (_url, init) => {
  abstractCalls += 1;
  const body = JSON.parse(init.body);
  assert.match(body.input, /abstract_only/);
  if (abstractCalls === 1) {
    const draft = draftFor(abstractDoi, 'abstract_only');
    draft.conditions = [];
    draft.substrateScope = { summary: 'The abstract states useful selectivity but does not provide detailed scope evidence.', supportedTrends: [], limitations: [], evidenceIds: ['s001'] };
    draft.mechanism = { experimentalEvidence: [], authorProposal: [], modelInference: [] };
    draft.claims = [{
      claim: 'The abstract reports a catalytic coupling with useful selectivity.',
      claimType: 'author_conclusion',
      evidenceIds: ['s001'],
      confidence: 'high',
      notes: 'Abstract-only evidence.',
    }];
    draft.draftZh = '基于 Abstract：文中报告一种具有有用选择性的催化偶联；当前证据未提供详细优化、底物实例或机理控制实验。';
    draft.draftEn = 'Abstract-based: the article reports a catalytic coupling with useful selectivity; the captured evidence does not provide detailed optimization, scope examples, or mechanistic controls.';
    return responseObject('gpt-5.6-terra-2026-test', draft);
  }
  const audit = auditPass();
  audit.finalZh = '基于 Abstract：文中报告一种具有有用选择性的催化偶联；当前证据未提供详细优化、底物实例或机理控制实验。';
  audit.finalEn = 'Abstract-based: the article reports a catalytic coupling with useful selectivity; the captured evidence does not provide detailed optimization, scope examples, or mechanistic controls.';
  return responseObject('gpt-5.6-sol-2026-test', audit);
};
const abstractCycle = await runSummaryReviewCycle(baseEnv, { fetchImpl: fetchAbstract });
assert.equal(abstractCycle.status, 'published');
const abstractSummary = await getArticleSummary(baseEnv, abstractDoi);
assert.equal(abstractSummary.body.available, true);
assert.equal(abstractSummary.body.evidenceLevel, 'abstract_only');
assert.equal(abstractSummary.body.fulltextAvailable, false);
assert.match(abstractSummary.body.zh, /基于 Abstract/);

let disabledCalls = 0;
const disabled = await runSummaryReviewCycle({ MEDIA, SUMMARY_REVIEW_ENABLED: '1' }, {
  fetchImpl: async () => { disabledCalls += 1; throw new Error('must not call'); },
});
assert.equal(disabled.status, 'disabled');
assert.equal(disabled.reason, 'openai_api_key_missing');
assert.equal(disabledCalls, 0);

console.log(JSON.stringify({
  openaiRequests: requests.length + badCalls + abstractCalls,
  storeFalse: true,
  structuredOutputs: true,
  terraDraftSolAudit: true,
  deterministicEvidenceGuard: true,
  abstractOnlySupported: true,
  publicGetRemainsReadOnly: true,
  draftPromptVersion: SUMMARY_DRAFT_PROMPT_VERSION,
  auditPromptVersion: SUMMARY_AUDIT_PROMPT_VERSION,
}));
