import {
  ARTICLE_REVIEWED_SUMMARY_SCHEMA_VERSION,
  articleSummaryStorageKeys,
  getArticleEvidenceInventory,
  readArticleEvidencePacket,
} from './article-summary.js';

const DRAFT_MODEL = 'gpt-5.6-terra';
const AUDIT_MODEL = 'gpt-5.6-sol';
const DRAFT_PROMPT_VERSION = 'summary-draft-v2.1';
const AUDIT_VERSION = 'summary-audit-v2.1';
const REVIEW_CONTRACT_VERSION = 'summary-review-contract-v2';
const DRAFT_PREFIX = 'private/article-summary-draft/';
const AUDIT_PREFIX = 'private/article-summary-audit/';
const CHUNK_TARGET_CHARS = 300_000;
const MAX_DRAFT_CHUNKS_PER_RUN = 3;
const LEASE_MS = 8 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function normalizeDoi(value) {
  const raw = String(value || '').trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '')
    .replace(/^doi:\s*/i, '');
  return /^10\.\d{4,9}\/\S+$/.test(raw) ? raw.replace(/[).,;]+$/, '') : '';
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function safeText(value, max = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function dedupeStrings(values) {
  const out = [];
  const seen = new Set();
  for (const raw of values || []) {
    const value = String(raw || '').trim();
    if (!value) continue;
    const key = value.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function priorityForEvidence(level) {
  return level === 'complete' ? 100 : level === 'partial' ? 70 : level === 'abstract_only' ? 50 : 20;
}

function retryDelayMs(attempts) {
  return Math.min(12 * 60 * 60 * 1000, Math.max(60_000, 60_000 * Math.pow(2, Math.max(0, attempts - 1))));
}

function rowsFromEvidence(evidence) {
  const rows = [];
  for (const row of evidence?.sections || []) {
    rows.push({
      id: String(row.sectionId || ''),
      kind: 'section',
      type: String(row.type || 'other'),
      heading: String(row.heading || ''),
      hash: String(row.hash || ''),
      text: String(row.text || ''),
    });
  }
  for (const row of evidence?.captions || []) {
    rows.push({
      id: String(row.evidenceId || ''),
      kind: 'caption',
      type: String(row.type || 'figure'),
      heading: String(row.label || ''),
      hash: String(row.hash || ''),
      text: String(row.text || ''),
    });
  }
  for (const row of evidence?.tables || []) {
    rows.push({
      id: String(row.evidenceId || ''),
      kind: 'table',
      type: 'table',
      heading: [row.label, row.title].filter(Boolean).join(' — '),
      hash: String(row.hash || ''),
      text: String(row.text || ''),
    });
  }
  return rows.filter(row => row.id && row.text);
}

function splitUnit(row, targetChars) {
  const text = String(row.text || '');
  if (text.length <= targetChars) return [{ ...row, part: 1, parts: 1 }];
  const parts = Math.ceil(text.length / targetChars);
  const out = [];
  for (let index = 0; index < parts; index += 1) {
    out.push({
      ...row,
      text: text.slice(index * targetChars, (index + 1) * targetChars),
      part: index + 1,
      parts,
    });
  }
  return out;
}

export function chunkArticleEvidence(evidence, targetChars = CHUNK_TARGET_CHARS) {
  const units = rowsFromEvidence(evidence).flatMap(row => splitUnit(row, targetChars));
  const chunks = [];
  let current = [];
  let chars = 0;
  for (const unit of units) {
    const cost = unit.text.length + unit.heading.length + 100;
    if (current.length && chars + cost > targetChars) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(unit);
    chars += cost;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

const stringArray = { type: 'array', items: { type: 'string' } };
const claimSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    claim: { type: 'string' },
    claimType: {
      type: 'string',
      enum: ['experimental_fact', 'author_conclusion', 'author_proposal', 'metadata_fact', 'model_inference', 'insufficient_evidence'],
    },
    evidenceIds: stringArray,
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    notes: { type: 'string' },
  },
  required: ['claim', 'claimType', 'evidenceIds', 'confidence', 'notes'],
};

const conditionsSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    catalysts: stringArray,
    ligands: stringArray,
    reagents: stringArray,
    additives: stringArray,
    solvents: stringArray,
    temperature: stringArray,
    time: stringArray,
    atmosphere: stringArray,
    lightOrElectrochemistry: stringArray,
    yieldAndSelectivity: stringArray,
  },
  required: ['catalysts', 'ligands', 'reagents', 'additives', 'solvents', 'temperature', 'time', 'atmosphere', 'lightOrElectrochemistry', 'yieldAndSelectivity'],
};

const mechanismSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    experimentalEvidence: stringArray,
    authorProposal: stringArray,
    modelInference: stringArray,
  },
  required: ['experimentalEvidence', 'authorProposal', 'modelInference'],
};

const factSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    researchObjective: stringArray,
    keyTransformationOrStrategy: stringArray,
    conditions: conditionsSchema,
    substrateScope: stringArray,
    limitations: stringArray,
    mechanism: mechanismSchema,
    noveltyAndSyntheticSignificance: stringArray,
    questionsForManualVerification: stringArray,
    claims: { type: 'array', items: claimSchema },
  },
  required: ['researchObjective', 'keyTransformationOrStrategy', 'conditions', 'substrateScope', 'limitations', 'mechanism', 'noveltyAndSyntheticSignificance', 'questionsForManualVerification', 'claims'],
};

const draftSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    doi: { type: 'string' },
    evidenceLevel: { type: 'string', enum: ['abstract_only', 'partial', 'complete', 'unknown'] },
    chunkIndex: { type: 'integer' },
    chunkCount: { type: 'integer' },
    facts: factSchema,
  },
  required: ['doi', 'evidenceLevel', 'chunkIndex', 'chunkCount', 'facts'],
};

const issueSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    claim: { type: 'string' },
    reason: { type: 'string' },
    evidenceIds: stringArray,
  },
  required: ['claim', 'reason', 'evidenceIds'],
};

const auditSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['pass', 'needs_manual_review', 'reject'] },
    correctedFacts: factSchema,
    unsupportedClaims: { type: 'array', items: issueSchema },
    numericalIssues: { type: 'array', items: issueSchema },
    coverageWarnings: stringArray,
    manualReviewQuestions: stringArray,
    zh: { type: 'string' },
    en: { type: 'string' },
  },
  required: ['verdict', 'correctedFacts', 'unsupportedClaims', 'numericalIssues', 'coverageWarnings', 'manualReviewQuestions', 'zh', 'en'],
};

function responseOutputText(response) {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) return response.output_text.trim();
  for (const item of response?.output || []) {
    if (item?.type !== 'message') continue;
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text.trim();
    }
  }
  return '';
}

async function openAiStructured(env, { model, schema, schemaName, system, user, maxOutputTokens = 14000 }) {
  if (!env?.OPENAI_API_KEY) throw Object.assign(new Error('openai_api_key_missing'), { nonRetryable: true });
  const requester = typeof env.OPENAI_FETCH === 'function' ? env.OPENAI_FETCH : fetch;
  const response = await requester('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      store: false,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: schemaName,
          strict: true,
          schema,
        },
      },
      max_output_tokens: maxOutputTokens,
    }),
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) {
    const code = safeText(body?.error?.code || body?.error?.type || '', 120);
    const error = new Error(`openai_http_${response.status}:${code || 'unknown'}`);
    error.httpStatus = response.status;
    error.retryable = [408, 409, 425, 429, 500, 502, 503, 504].includes(response.status);
    throw error;
  }
  const text = responseOutputText(body);
  if (!text) throw new Error('openai_structured_output_missing');
  try {
    return { data: JSON.parse(text), response: body };
  } catch {
    throw new Error('openai_structured_output_invalid_json');
  }
}

function evidenceChunkText(evidence, units, chunkIndex, chunkCount) {
  const header = {
    doi: evidence.doi,
    title: evidence.title,
    journal: evidence.journal,
    evidenceLevel: evidence.evidenceLevel || evidence.fulltextStatus || 'unknown',
    chunkIndex,
    chunkCount,
  };
  const rendered = units.map(unit => [
    `EVIDENCE_ID: ${unit.id}`,
    `KIND: ${unit.kind}`,
    `TYPE: ${unit.type}`,
    unit.heading ? `HEADING: ${unit.heading}` : '',
    unit.parts > 1 ? `PART: ${unit.part}/${unit.parts}` : '',
    unit.text,
  ].filter(Boolean).join('\n')).join('\n\n---\n\n');
  return `${JSON.stringify(header)}\n\n${rendered}`;
}

function draftSystemPrompt() {
  return [
    'You are the evidence-extraction stage for an organic synthesis literature review pipeline.',
    `Follow ${REVIEW_CONTRACT_VERSION}.`,
    'Extract only facts supported by the supplied evidence chunk.',
    'Every substantive claim must cite one or more supplied EVIDENCE_ID values.',
    'Separate experimental mechanistic evidence from the authors\' proposed mechanism.',
    'modelInference must be an empty array; do not fill gaps using chemistry knowledge.',
    'If a condition, substrate-scope detail, limitation, numerical value, or mechanistic detail is absent, leave it absent and add a manual-verification question when scientifically important.',
    'For abstract_only evidence, do not expand generic phrases such as broad scope into detailed scope claims.',
    'Preserve explicit numerical conditions and selectivity values exactly.',
  ].join('\n');
}

function mergeConditions(rows) {
  const keys = ['catalysts', 'ligands', 'reagents', 'additives', 'solvents', 'temperature', 'time', 'atmosphere', 'lightOrElectrochemistry', 'yieldAndSelectivity'];
  return Object.fromEntries(keys.map(key => [key, dedupeStrings(rows.flatMap(row => row?.[key] || []))]));
}

export function mergeDraftFacts(drafts) {
  const facts = drafts.map(row => row?.facts || {});
  const claims = [];
  const seenClaims = new Set();
  for (const claim of facts.flatMap(row => row.claims || [])) {
    const normalized = String(claim?.claim || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const ids = dedupeStrings(claim?.evidenceIds || []).sort();
    const key = normalized + '|' + ids.join(',');
    if (!normalized || seenClaims.has(key)) continue;
    seenClaims.add(key);
    claims.push({ ...claim, evidenceIds: ids });
  }
  return {
    researchObjective: dedupeStrings(facts.flatMap(row => row.researchObjective || [])),
    keyTransformationOrStrategy: dedupeStrings(facts.flatMap(row => row.keyTransformationOrStrategy || [])),
    conditions: mergeConditions(facts.map(row => row.conditions || {})),
    substrateScope: dedupeStrings(facts.flatMap(row => row.substrateScope || [])),
    limitations: dedupeStrings(facts.flatMap(row => row.limitations || [])),
    mechanism: {
      experimentalEvidence: dedupeStrings(facts.flatMap(row => row.mechanism?.experimentalEvidence || [])),
      authorProposal: dedupeStrings(facts.flatMap(row => row.mechanism?.authorProposal || [])),
      modelInference: dedupeStrings(facts.flatMap(row => row.mechanism?.modelInference || [])),
    },
    noveltyAndSyntheticSignificance: dedupeStrings(facts.flatMap(row => row.noveltyAndSyntheticSignificance || [])),
    questionsForManualVerification: dedupeStrings(facts.flatMap(row => row.questionsForManualVerification || [])),
    claims,
  };
}

function evidenceMap(evidence) {
  const map = new Map();
  for (const row of rowsFromEvidence(evidence)) map.set(row.id, row);
  return map;
}

function auditEvidenceBundle(evidence, mergedFacts) {
  const map = evidenceMap(evidence);
  const cited = new Set();
  for (const claim of mergedFacts.claims || []) for (const id of claim.evidenceIds || []) cited.add(id);
  const evidenceIndex = [...map.values()].map(row => ({
    id: row.id,
    kind: row.kind,
    type: row.type,
    heading: row.heading,
    hash: row.hash,
    chars: row.text.length,
  }));
  const citedEvidence = [...cited].map(id => map.get(id)).filter(Boolean).map(row => ({
    id: row.id,
    kind: row.kind,
    type: row.type,
    heading: row.heading,
    text: row.text,
  }));
  return { evidenceIndex, citedEvidence };
}

function auditSystemPrompt() {
  return [
    'You are the independent senior-organic-chemistry audit stage.',
    `Follow ${REVIEW_CONTRACT_VERSION} and auditVersion ${AUDIT_VERSION}.`,
    'Verify the merged draft against the cited evidence. Do not reward fluent prose over evidence.',
    'Distinguish experimental facts, author conclusions, and author-proposed mechanism.',
    'A proposed catalytic cycle must not be rewritten as experimentally demonstrated.',
    'Any model-only mechanistic inference makes the record ineligible for automatic publication.',
    'Check explicit yields, ee, dr, temperatures, times, catalyst loadings, equivalents, wavelengths, potentials and currents against cited evidence.',
    'For abstract_only evidence, the public text must say that it is Abstract-based and must not imply full-paper coverage.',
    'For partial evidence, disclose partial coverage and do not fill missing scope/conditions/mechanism.',
    'Verdict pass only if every public factual claim is supported and the bilingual summaries express the same reviewed facts.',
    'Write concise but information-dense scientific Chinese and English. Do not quote long passages.',
  ].join('\n');
}

function extractNumberTokens(text) {
  const matches = String(text || '').match(/[-+]?\d+(?:\.\d+)?\s*(?:%|°\s*C|K|h|min|s|mol\s*%|equiv|V|mA|A|nm|M|mM|μM|uM)?/gi) || [];
  return dedupeStrings(matches.map(value => value.replace(/\s+/g, '').toLowerCase()));
}

function normalizedForNumberSearch(text) {
  return String(text || '').replace(/\s+/g, '').toLowerCase();
}

export function validateReviewedAudit(evidence, audit) {
  const issues = [];
  if (!audit || audit.verdict !== 'pass') issues.push('audit_verdict_not_pass');
  if ((audit?.unsupportedClaims || []).length) issues.push('unsupported_claims_present');
  if ((audit?.numericalIssues || []).length) issues.push('numerical_issues_present');
  if (!String(audit?.zh || '').trim() || !String(audit?.en || '').trim()) issues.push('bilingual_summary_missing');
  if ((audit?.correctedFacts?.mechanism?.modelInference || []).length) issues.push('model_inference_present');

  const map = evidenceMap(evidence);
  for (const claim of audit?.correctedFacts?.claims || []) {
    if (claim.claimType === 'model_inference') issues.push('claim_model_inference');
    const ids = dedupeStrings(claim.evidenceIds || []);
    if (!ids.length && claim.claimType !== 'insufficient_evidence') {
      issues.push('claim_without_evidence:' + safeText(claim.claim, 80));
      continue;
    }
    const rows = ids.map(id => map.get(id)).filter(Boolean);
    if (rows.length !== ids.length) {
      issues.push('unknown_evidence_id:' + ids.filter(id => !map.has(id)).join(','));
      continue;
    }
    const support = normalizedForNumberSearch(rows.map(row => row.text).join('\n'));
    for (const token of extractNumberTokens(claim.claim)) {
      if (!support.includes(token)) issues.push('numeric_evidence_missing:' + token);
    }
  }
  return { ok: issues.length === 0, issues: dedupeStrings(issues) };
}

async function artifactBase(doi, sourceHash) {
  const id = (await sha256Hex(doi)).slice(0, 32);
  return `${id}/${sourceHash}`;
}

async function putJson(env, key, value) {
  await env.MEDIA.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
  });
}

async function getJsonObject(env, key) {
  const object = await env.MEDIA.get(key);
  if (!object) return null;
  try { return JSON.parse(await object.text()); } catch { return null; }
}

function d1Store(env) {
  return {
    async upsert(job) {
      const now = Date.now();
      await env.DB.prepare(`
        INSERT INTO article_summary_jobs (
          doi, source_hash, evidence_packet_hash, evidence_level, state, priority,
          attempts, next_retry_at, lease_expires_at, draft_cursor, draft_chunk_count,
          prompt_version, audit_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'queued', ?, 0, 0, 0, 0, 0, ?, ?, ?, ?)
        ON CONFLICT(doi) DO UPDATE SET
          source_hash = excluded.source_hash,
          evidence_packet_hash = excluded.evidence_packet_hash,
          evidence_level = excluded.evidence_level,
          priority = MAX(article_summary_jobs.priority, excluded.priority),
          state = CASE
            WHEN article_summary_jobs.source_hash != excluded.source_hash
              OR article_summary_jobs.evidence_packet_hash != excluded.evidence_packet_hash
            THEN 'queued' ELSE article_summary_jobs.state END,
          attempts = CASE
            WHEN article_summary_jobs.source_hash != excluded.source_hash
              OR article_summary_jobs.evidence_packet_hash != excluded.evidence_packet_hash
            THEN 0 ELSE article_summary_jobs.attempts END,
          next_retry_at = CASE
            WHEN article_summary_jobs.source_hash != excluded.source_hash
              OR article_summary_jobs.evidence_packet_hash != excluded.evidence_packet_hash
            THEN 0 ELSE article_summary_jobs.next_retry_at END,
          lease_owner = CASE
            WHEN article_summary_jobs.source_hash != excluded.source_hash
              OR article_summary_jobs.evidence_packet_hash != excluded.evidence_packet_hash
            THEN NULL ELSE article_summary_jobs.lease_owner END,
          lease_expires_at = CASE
            WHEN article_summary_jobs.source_hash != excluded.source_hash
              OR article_summary_jobs.evidence_packet_hash != excluded.evidence_packet_hash
            THEN 0 ELSE article_summary_jobs.lease_expires_at END,
          draft_cursor = CASE
            WHEN article_summary_jobs.source_hash != excluded.source_hash
              OR article_summary_jobs.evidence_packet_hash != excluded.evidence_packet_hash
            THEN 0 ELSE article_summary_jobs.draft_cursor END,
          draft_chunk_count = CASE
            WHEN article_summary_jobs.source_hash != excluded.source_hash
              OR article_summary_jobs.evidence_packet_hash != excluded.evidence_packet_hash
            THEN 0 ELSE article_summary_jobs.draft_chunk_count END,
          last_error = CASE
            WHEN article_summary_jobs.source_hash != excluded.source_hash
              OR article_summary_jobs.evidence_packet_hash != excluded.evidence_packet_hash
            THEN NULL ELSE article_summary_jobs.last_error END,
          published_at = CASE
            WHEN article_summary_jobs.source_hash != excluded.source_hash
              OR article_summary_jobs.evidence_packet_hash != excluded.evidence_packet_hash
            THEN NULL ELSE article_summary_jobs.published_at END,
          updated_at = excluded.updated_at
      `).bind(
        job.doi, job.sourceHash, job.evidencePacketHash, job.evidenceLevel,
        job.priority, DRAFT_PROMPT_VERSION, AUDIT_VERSION, now, now,
      ).run();
    },
    async claim(owner) {
      const now = Date.now();
      const row = await env.DB.prepare(`
        SELECT * FROM article_summary_jobs
        WHERE state IN ('queued','draft_ready','audit_running')
          AND next_retry_at <= ?
          AND (lease_owner IS NULL OR lease_expires_at <= ?)
        ORDER BY priority DESC, updated_at DESC
        LIMIT 1
      `).bind(now, now).first();
      if (!row) return null;
      const result = await env.DB.prepare(`
        UPDATE article_summary_jobs
        SET lease_owner = ?, lease_expires_at = ?, attempts = attempts + 1, updated_at = ?
        WHERE doi = ?
          AND state = ?
          AND (lease_owner IS NULL OR lease_expires_at <= ?)
      `).bind(owner, now + LEASE_MS, now, row.doi, row.state, now).run();
      if (Number(result?.meta?.changes || 0) !== 1) return null;
      return { ...row, lease_owner: owner, lease_expires_at: now + LEASE_MS, attempts: Number(row.attempts || 0) + 1 };
    },
    async patch(doi, patch) {
      const keys = Object.keys(patch);
      if (!keys.length) return;
      const values = keys.map(key => patch[key]);
      await env.DB.prepare(`UPDATE article_summary_jobs SET ${keys.map(key => key + ' = ?').join(', ')}, updated_at = ? WHERE doi = ?`)
        .bind(...values, Date.now(), doi).run();
    },
    async status(limit = 100) {
      const result = await env.DB.prepare(`
        SELECT doi, source_hash, evidence_packet_hash, evidence_level, state, priority,
               attempts, next_retry_at, lease_owner, lease_expires_at, draft_cursor,
               draft_chunk_count, draft_model, audit_model, prompt_version, audit_version,
               last_error, created_at, updated_at, published_at
        FROM article_summary_jobs
        ORDER BY updated_at DESC
        LIMIT ?
      `).bind(Math.max(1, Math.min(500, Number(limit || 100)))).all();
      return result?.results || [];
    },
  };
}

function summaryStore(env) {
  return env?.SUMMARY_JOB_STORE || d1Store(env);
}

export async function enqueueArticleSummaryJob(env, evidenceMeta) {
  if (!env?.DB && !env?.SUMMARY_JOB_STORE) return { queued: false, reason: 'summary_db_unavailable' };
  const doi = normalizeDoi(evidenceMeta?.doi);
  if (!doi || !evidenceMeta?.sourceHash || !evidenceMeta?.evidencePacketHash) return { queued: false, reason: 'invalid_evidence_meta' };
  const evidenceLevel = ['abstract_only', 'partial', 'complete'].includes(evidenceMeta.evidenceLevel)
    ? evidenceMeta.evidenceLevel : 'unknown';
  try {
    await summaryStore(env).upsert({
      doi,
      sourceHash: String(evidenceMeta.sourceHash),
      evidencePacketHash: String(evidenceMeta.evidencePacketHash),
      evidenceLevel,
      priority: priorityForEvidence(evidenceLevel),
    });
    return { queued: true, doi, evidenceLevel };
  } catch (error) {
    return { queued: false, reason: safeText(error?.message || error, 240) };
  }
}

export async function seedSummaryJobsFromEvidence(env) {
  const inventory = await getArticleEvidenceInventory(env);
  if (inventory.status !== 200) return { seeded: 0, error: inventory.body?.error || 'inventory_unavailable' };
  let seeded = 0;
  for (const row of inventory.body?.items || []) {
    const result = await enqueueArticleSummaryJob(env, {
      doi: row.doi,
      sourceHash: row.sourceHash,
      evidencePacketHash: row.evidencePacketHash,
      evidenceLevel: row.evidenceLevel,
    });
    if (result.queued) seeded += 1;
  }
  return { seeded, inventory: inventory.body?.count || 0 };
}

async function generateDraftChunk(env, evidence, units, chunkIndex, chunkCount) {
  const result = await openAiStructured(env, {
    model: DRAFT_MODEL,
    schema: draftSchema,
    schemaName: 'organic_synthesis_evidence_draft',
    system: draftSystemPrompt(),
    user: evidenceChunkText(evidence, units, chunkIndex, chunkCount),
    maxOutputTokens: 16000,
  });
  return {
    ...result.data,
    _meta: {
      model: result.response?.model || DRAFT_MODEL,
      responseId: result.response?.id || '',
      promptVersion: DRAFT_PROMPT_VERSION,
      generatedAt: Date.now(),
    },
  };
}

async function auditDraft(env, evidence, mergedFacts) {
  const bundle = auditEvidenceBundle(evidence, mergedFacts);
  const result = await openAiStructured(env, {
    model: AUDIT_MODEL,
    schema: auditSchema,
    schemaName: 'organic_synthesis_evidence_audit',
    system: auditSystemPrompt(),
    user: JSON.stringify({
      doi: evidence.doi,
      title: evidence.title,
      journal: evidence.journal,
      evidenceLevel: evidence.evidenceLevel || evidence.fulltextStatus || 'unknown',
      mergedDraft: mergedFacts,
      evidenceIndex: bundle.evidenceIndex,
      citedEvidence: bundle.citedEvidence,
    }),
    maxOutputTokens: 18000,
  });
  return {
    ...result.data,
    _meta: {
      model: result.response?.model || AUDIT_MODEL,
      responseId: result.response?.id || '',
      auditVersion: AUDIT_VERSION,
      reviewedAt: Date.now(),
    },
  };
}

async function processDraftStage(env, store, row, evidence) {
  const chunks = chunkArticleEvidence(evidence);
  if (!chunks.length) {
    await store.patch(row.doi, { state: 'blocked', last_error: 'evidence_empty', lease_owner: null, lease_expires_at: 0 });
    return { doi: row.doi, state: 'blocked', reason: 'evidence_empty' };
  }
  const base = await artifactBase(row.doi, row.source_hash);
  let cursor = Math.max(0, Number(row.draft_cursor || 0));
  const end = Math.min(chunks.length, cursor + MAX_DRAFT_CHUNKS_PER_RUN);
  for (; cursor < end; cursor += 1) {
    const key = `${DRAFT_PREFIX}${base}/chunk-${String(cursor + 1).padStart(4, '0')}.json`;
    let draft = await getJsonObject(env, key);
    if (!draft) {
      draft = await generateDraftChunk(env, evidence, chunks[cursor], cursor + 1, chunks.length);
      await putJson(env, key, draft);
    }
    await store.patch(row.doi, {
      draft_cursor: cursor + 1,
      draft_chunk_count: chunks.length,
      draft_model: DRAFT_MODEL,
      prompt_version: DRAFT_PROMPT_VERSION,
      lease_expires_at: Date.now() + LEASE_MS,
    });
  }
  if (cursor < chunks.length) {
    await store.patch(row.doi, {
      state: 'queued',
      next_retry_at: Date.now() + 15_000,
      lease_owner: null,
      lease_expires_at: 0,
      last_error: null,
    });
    return { doi: row.doi, state: 'queued', draftCursor: cursor, draftChunks: chunks.length };
  }
  const drafts = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const key = `${DRAFT_PREFIX}${base}/chunk-${String(index + 1).padStart(4, '0')}.json`;
    const draft = await getJsonObject(env, key);
    if (!draft) throw new Error('draft_chunk_missing:' + (index + 1));
    drafts.push(draft);
  }
  const merged = {
    doi: row.doi,
    evidenceLevel: evidence.evidenceLevel || evidence.fulltextStatus || 'unknown',
    sourceHash: evidence.sourceHash,
    evidencePacketHash: evidence.evidencePacketHash,
    promptVersion: DRAFT_PROMPT_VERSION,
    model: DRAFT_MODEL,
    generatedAt: Date.now(),
    facts: mergeDraftFacts(drafts),
  };
  await putJson(env, `${DRAFT_PREFIX}${base}/merged.json`, merged);
  await store.patch(row.doi, {
    state: 'draft_ready',
    next_retry_at: 0,
    lease_owner: null,
    lease_expires_at: 0,
    last_error: null,
    draft_model: DRAFT_MODEL,
    prompt_version: DRAFT_PROMPT_VERSION,
  });
  return { doi: row.doi, state: 'draft_ready', draftChunks: chunks.length };
}

async function processAuditStage(env, store, row, evidence) {
  const base = await artifactBase(row.doi, row.source_hash);
  const merged = await getJsonObject(env, `${DRAFT_PREFIX}${base}/merged.json`);
  if (!merged?.facts) throw new Error('merged_draft_missing');
  await store.patch(row.doi, { state: 'audit_running', audit_model: AUDIT_MODEL, audit_version: AUDIT_VERSION });
  const audit = await auditDraft(env, evidence, merged.facts);
  await putJson(env, `${AUDIT_PREFIX}${base}.json`, audit);
  const deterministic = validateReviewedAudit(evidence, audit);
  if (audit.verdict !== 'pass' || !deterministic.ok) {
    const reason = dedupeStrings([
      ...(audit.unsupportedClaims || []).map(row => 'unsupported:' + row.reason),
      ...(audit.numericalIssues || []).map(row => 'numeric:' + row.reason),
      ...deterministic.issues,
    ]).slice(0, 20).join('; ');
    await store.patch(row.doi, {
      state: 'needs_manual_review',
      lease_owner: null,
      lease_expires_at: 0,
      last_error: safeText(reason || 'audit_needs_manual_review', 1000),
      audit_model: AUDIT_MODEL,
      audit_version: AUDIT_VERSION,
    });
    return { doi: row.doi, state: 'needs_manual_review', issues: deterministic.issues };
  }

  const keys = await articleSummaryStorageKeys(row.doi);
  const now = Date.now();
  const final = {
    schemaVersion: ARTICLE_REVIEWED_SUMMARY_SCHEMA_VERSION,
    status: 'approved',
    source: 'reviewed_evidence_v2',
    doi: row.doi,
    sourceHash: evidence.sourceHash,
    evidencePacketHash: evidence.evidencePacketHash,
    evidenceLevel: evidence.evidenceLevel || evidence.fulltextStatus || 'unknown',
    draftModel: DRAFT_MODEL,
    model: AUDIT_MODEL,
    modelSnapshot: audit._meta?.model || AUDIT_MODEL,
    promptVersion: DRAFT_PROMPT_VERSION,
    auditVersion: AUDIT_VERSION,
    reviewContractVersion: REVIEW_CONTRACT_VERSION,
    facts: audit.correctedFacts,
    zh: String(audit.zh || '').trim(),
    en: String(audit.en || '').trim(),
    generatedAt: now,
    reviewedAt: audit._meta?.reviewedAt || now,
  };
  await putJson(env, keys.summary, final);
  await store.patch(row.doi, {
    state: 'published',
    lease_owner: null,
    lease_expires_at: 0,
    next_retry_at: 0,
    last_error: null,
    audit_model: AUDIT_MODEL,
    audit_version: AUDIT_VERSION,
    published_at: now,
  });
  return { doi: row.doi, state: 'published' };
}

async function failJob(store, row, error) {
  const attempts = Math.max(1, Number(row.attempts || 1));
  const message = safeText(error?.message || error, 1000);
  if (error?.nonRetryable || attempts >= MAX_ATTEMPTS) {
    await store.patch(row.doi, {
      state: 'blocked',
      lease_owner: null,
      lease_expires_at: 0,
      last_error: message,
    });
    return { doi: row.doi, state: 'blocked', reason: message };
  }
  const resumeState = row.state === 'draft_ready' || row.state === 'audit_running' ? 'draft_ready' : 'queued';
  await store.patch(row.doi, {
    state: resumeState,
    next_retry_at: Date.now() + retryDelayMs(attempts),
    lease_owner: null,
    lease_expires_at: 0,
    last_error: message,
  });
  return { doi: row.doi, state: resumeState, retry: true, reason: message };
}

export async function processArticleSummaryJobs(env, { limit = 2 } = {}) {
  if (!env?.DB && !env?.SUMMARY_JOB_STORE) return { processed: 0, reason: 'summary_db_unavailable' };
  if (!env?.OPENAI_API_KEY) return { processed: 0, reason: 'openai_api_key_missing' };
  const store = summaryStore(env);
  const owner = 'summary-' + crypto.randomUUID();
  const results = [];
  for (let index = 0; index < Math.max(1, Math.min(10, Number(limit || 2))); index += 1) {
    const row = await store.claim(owner);
    if (!row) break;
    try {
      const evidence = await readArticleEvidencePacket(env, row.doi);
      if (!evidence || evidence.sourceHash !== row.source_hash || evidence.evidencePacketHash !== row.evidence_packet_hash) {
        await store.patch(row.doi, {
          state: 'queued',
          lease_owner: null,
          lease_expires_at: 0,
          last_error: 'evidence_changed_before_processing',
          draft_cursor: 0,
          draft_chunk_count: 0,
          next_retry_at: Date.now() + 30_000,
        });
        results.push({ doi: row.doi, state: 'queued', reason: 'evidence_changed_before_processing' });
        continue;
      }
      const result = row.state === 'draft_ready' || row.state === 'audit_running'
        ? await processAuditStage(env, store, row, evidence)
        : await processDraftStage(env, store, row, evidence);
      results.push(result);
    } catch (error) {
      results.push(await failJob(store, row, error));
    }
  }
  return { processed: results.length, results };
}

export async function getArticleSummaryJobStatus(env, limit = 100) {
  if (!env?.DB && !env?.SUMMARY_JOB_STORE) return { status: 503, body: { error: 'summary_db_unavailable' } };
  try {
    const rows = await summaryStore(env).status(limit);
    const counts = {};
    for (const row of rows) counts[row.state] = (counts[row.state] || 0) + 1;
    return {
      status: 200,
      body: {
        draftModel: DRAFT_MODEL,
        auditModel: AUDIT_MODEL,
        promptVersion: DRAFT_PROMPT_VERSION,
        auditVersion: AUDIT_VERSION,
        counts,
        items: rows,
      },
    };
  } catch (error) {
    return { status: 503, body: { error: 'summary_queue_unavailable', detail: safeText(error?.message || error, 240) } };
  }
}

export const ARTICLE_SUMMARY_DRAFT_MODEL = DRAFT_MODEL;
export const ARTICLE_SUMMARY_AUDIT_MODEL = AUDIT_MODEL;
export const ARTICLE_SUMMARY_DRAFT_PROMPT_VERSION = DRAFT_PROMPT_VERSION;
export const ARTICLE_SUMMARY_AUDIT_VERSION = AUDIT_VERSION;
