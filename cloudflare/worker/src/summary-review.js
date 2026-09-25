const EVIDENCE_PREFIX = 'private/article-evidence-v2/';
const JOB_PREFIX = 'private/article-summary-jobs/';
const REVIEW_PREFIX = 'private/article-summary-review/';
const SUMMARY_PREFIX = 'private/article-summary/';
const REVIEWED_SUMMARY_SCHEMA_VERSION = 'reviewed-summary-v2';
const JOB_VERSION = 1;
const DRAFT_MODEL_DEFAULT = 'gpt-5.6-terra';
const AUDIT_MODEL_DEFAULT = 'gpt-5.6-sol';
const DRAFT_PROMPT_VERSION = 'gallery-summary-draft-v2';
const AUDIT_PROMPT_VERSION = 'gallery-summary-audit-v2';
const LEASE_MS = 12 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const EVIDENCE_CHUNK_TARGET_CHARS = 300_000;
const REVIEW_CHUNK_PREFIX = 'private/article-summary-review-chunks/';

const CLAIM_TYPES = [
  'experimental_fact',
  'author_conclusion',
  'author_proposal',
  'metadata_fact',
  'model_inference',
  'insufficient_evidence',
];

const ISSUE_TYPES = [
  'unsupported_claim',
  'numeric_mismatch',
  'condition_mismatch',
  'scope_exaggeration',
  'mechanistic_overclaim',
  'missing_limitation',
  'evidence_mismatch',
  'evidence_level_violation',
  'other',
];

const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'doi',
    'evidenceLevel',
    'researchObjective',
    'keyTransformationOrStrategy',
    'conditions',
    'substrateScope',
    'mechanism',
    'noveltyAndSyntheticSignificance',
    'limitations',
    'questionsForManualVerification',
    'claims',
    'draftZh',
    'draftEn',
  ],
  properties: {
    doi: { type: 'string' },
    evidenceLevel: { type: 'string', enum: ['abstract_only', 'partial', 'complete'] },
    researchObjective: { type: 'string' },
    keyTransformationOrStrategy: { type: 'string' },
    conditions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'value', 'role', 'evidenceIds'],
        properties: {
          name: { type: 'string' },
          value: { type: 'string' },
          role: { type: 'string' },
          evidenceIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    substrateScope: {
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'supportedTrends', 'limitations', 'evidenceIds'],
      properties: {
        summary: { type: 'string' },
        supportedTrends: { type: 'array', items: { type: 'string' } },
        limitations: { type: 'array', items: { type: 'string' } },
        evidenceIds: { type: 'array', items: { type: 'string' } },
      },
    },
    mechanism: {
      type: 'object',
      additionalProperties: false,
      required: ['experimentalEvidence', 'authorProposal', 'modelInference'],
      properties: {
        experimentalEvidence: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['statement', 'evidenceIds'],
            properties: {
              statement: { type: 'string' },
              evidenceIds: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        authorProposal: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['statement', 'evidenceIds'],
            properties: {
              statement: { type: 'string' },
              evidenceIds: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        modelInference: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['statement', 'evidenceIds'],
            properties: {
              statement: { type: 'string' },
              evidenceIds: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
    noveltyAndSyntheticSignificance: { type: 'string' },
    limitations: { type: 'array', items: { type: 'string' } },
    questionsForManualVerification: { type: 'array', items: { type: 'string' } },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim', 'claimType', 'evidenceIds', 'confidence', 'notes'],
        properties: {
          claim: { type: 'string' },
          claimType: { type: 'string', enum: CLAIM_TYPES },
          evidenceIds: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          notes: { type: 'string' },
        },
      },
    },
    draftZh: { type: 'string' },
    draftEn: { type: 'string' },
  },
};

const AUDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'outcome',
    'issues',
    'finalZh',
    'finalEn',
    'modelInferencePresent',
    'unsupportedClaimCount',
    'auditNotes',
  ],
  properties: {
    outcome: { type: 'string', enum: ['pass', 'needs_manual_review', 'reject'] },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'severity', 'message', 'evidenceIds'],
        properties: {
          type: { type: 'string', enum: ISSUE_TYPES },
          severity: { type: 'string', enum: ['error', 'warning'] },
          message: { type: 'string' },
          evidenceIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    finalZh: { type: 'string' },
    finalEn: { type: 'string' },
    modelInferencePresent: { type: 'boolean' },
    unsupportedClaimCount: { type: 'integer' },
    auditNotes: { type: 'string' },
  },
};

const AUDIT_CHECK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['outcome', 'issues', 'modelInferencePresent', 'unsupportedClaimCount', 'auditNotes'],
  properties: {
    outcome: { type: 'string', enum: ['pass', 'needs_manual_review', 'reject'] },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'severity', 'message', 'evidenceIds'],
        properties: {
          type: { type: 'string', enum: ISSUE_TYPES },
          severity: { type: 'string', enum: ['error', 'warning'] },
          message: { type: 'string' },
          evidenceIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    modelInferencePresent: { type: 'boolean' },
    unsupportedClaimCount: { type: 'integer' },
    auditNotes: { type: 'string' },
  },
};


function safeText(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function idForDoi(doi) {
  return (await sha256Hex(String(doi || '').toLowerCase())).slice(0, 32);
}

async function keysForDoi(doi) {
  const id = await idForDoi(doi);
  return {
    evidence: `${EVIDENCE_PREFIX}${id}.json`,
    job: `${JOB_PREFIX}${id}.json`,
    review: `${REVIEW_PREFIX}${id}.json`,
    summary: `${SUMMARY_PREFIX}${id}.json`,
  };
}

function evidenceLevelRank(value) {
  return value === 'complete' ? 0 : value === 'partial' ? 1 : 2;
}

function policyAllowsExternalAi(env, policy) {
  if (policy === 'no_external_ai') return false;
  if (policy === 'unknown') return String(env?.SUMMARY_ALLOW_UNKNOWN_POLICY || '') === '1';
  return ['open_access', 'private_cache_allowed', 'transient_processing_only'].includes(policy);
}

function reviewEnabled(env) {
  return String(env?.SUMMARY_REVIEW_ENABLED || '') === '1' && Boolean(String(env?.OPENAI_API_KEY || '').trim());
}

async function listObjects(env, prefix) {
  const items = [];
  let cursor;
  for (let pageNo = 0; pageNo < 10; pageNo += 1) {
    const page = await env.MEDIA.list({
      prefix,
      limit: 1000,
      ...(cursor ? { cursor } : {}),
      include: ['customMetadata'],
    });
    items.push(...(page?.objects || []));
    if (!page?.truncated || !page?.cursor) break;
    cursor = page.cursor;
  }
  return items;
}

function metadataNumber(meta, key) {
  const value = Number(meta?.[key] || 0);
  return Number.isFinite(value) ? value : 0;
}

async function putJob(env, job) {
  const keys = await keysForDoi(job.doi);
  await env.MEDIA.put(keys.job, JSON.stringify(job), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
    customMetadata: {
      doi: job.doi,
      state: job.state,
      evidencePacketHash: job.evidencePacketHash,
      sourceHash: job.sourceHash,
      evidenceLevel: job.evidenceLevel,
      textProcessingPolicy: job.textProcessingPolicy,
      capturedAt: job.capturedAt || '',
      nextRetryAt: String(job.nextRetryAt || 0),
      leaseExpiresAt: String(job.leaseExpiresAt || 0),
      updatedAt: String(job.updatedAt || Date.now()),
      publishedAt: String(job.publishedAt || 0),
    },
  });
  return keys.job;
}

async function readJsonObject(env, key) {
  const object = await env.MEDIA.get(key);
  if (!object) return null;
  try { return JSON.parse(await object.text()); } catch { return null; }
}

async function selectReviewCandidate(env, now = Date.now()) {
  const [evidenceObjects, jobObjects] = await Promise.all([
    listObjects(env, EVIDENCE_PREFIX),
    listObjects(env, JOB_PREFIX),
  ]);
  const jobsByDoi = new Map();
  for (const object of jobObjects) {
    const meta = object?.customMetadata || {};
    if (meta.doi) jobsByDoi.set(String(meta.doi).toLowerCase(), { key: object.key, meta });
  }

  const blockedPolicies = {};
  const candidates = [];
  for (const object of evidenceObjects) {
    const meta = object?.customMetadata || {};
    const doi = String(meta.doi || '').toLowerCase();
    const hash = String(meta.evidencePacketHash || '');
    const sourceHash = String(meta.sourceHash || '');
    if (!doi || !hash || !sourceHash) continue;
    const policy = String(meta.textProcessingPolicy || 'unknown');
    if (!policyAllowsExternalAi(env, policy)) {
      blockedPolicies[policy] = (blockedPolicies[policy] || 0) + 1;
      continue;
    }
    const existing = jobsByDoi.get(doi);
    if (existing && String(existing.meta.evidencePacketHash || '') === hash) {
      const state = String(existing.meta.state || '');
      if (['published', 'needs_manual_review', 'rejected'].includes(state)) continue;
      if (state === 'processing' && metadataNumber(existing.meta, 'leaseExpiresAt') > now) continue;
      if (state === 'retry_wait' && metadataNumber(existing.meta, 'nextRetryAt') > now) continue;
    }
    candidates.push({
      doi,
      evidenceKey: object.key,
      evidencePacketHash: hash,
      sourceHash,
      evidenceLevel: String(meta.evidenceLevel || 'unknown'),
      textProcessingPolicy: policy,
      capturedAt: String(meta.capturedAt || ''),
      existingJobKey: existing?.key || '',
    });
  }
  candidates.sort((a, b) => {
    const dateDelta = String(b.capturedAt || '').localeCompare(String(a.capturedAt || ''));
    if (dateDelta) return dateDelta;
    const levelDelta = evidenceLevelRank(a.evidenceLevel) - evidenceLevelRank(b.evidenceLevel);
    if (levelDelta) return levelDelta;
    return a.doi.localeCompare(b.doi);
  });
  const recentPublishedCount = jobObjects.filter(object => {
    const meta = object?.customMetadata || {};
    return String(meta.state || '') === 'published' && metadataNumber(meta, 'publishedAt') >= now - 24 * 60 * 60 * 1000;
  }).length;
  return {
    candidate: candidates[0] || null,
    evidenceCount: evidenceObjects.length,
    jobCount: jobObjects.length,
    eligibleCount: candidates.length,
    recentPublishedCount,
    blockedPolicies,
  };
}

async function claimReviewLease(env, candidate, owner, now = Date.now()) {
  if (!env?.DB) return true;
  const expiresAt = now + LEASE_MS;
  await env.DB.prepare(`
    INSERT INTO article_summary_review_leases (
      doi, evidence_packet_hash, lease_owner, lease_expires_at, updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(doi) DO UPDATE SET
      evidence_packet_hash = excluded.evidence_packet_hash,
      lease_owner = excluded.lease_owner,
      lease_expires_at = excluded.lease_expires_at,
      updated_at = excluded.updated_at
    WHERE article_summary_review_leases.lease_expires_at <= ?
       OR article_summary_review_leases.evidence_packet_hash != excluded.evidence_packet_hash
  `).bind(candidate.doi, candidate.evidencePacketHash, owner, expiresAt, now, now).run();
  const row = await env.DB.prepare(`
    SELECT evidence_packet_hash, lease_owner, lease_expires_at
    FROM article_summary_review_leases
    WHERE doi = ?
  `).bind(candidate.doi).first();
  return Boolean(
    row
    && row.evidence_packet_hash === candidate.evidencePacketHash
    && row.lease_owner === owner
    && Number(row.lease_expires_at || 0) === expiresAt
  );
}

async function renewReviewLease(env, job, now = Date.now()) {
  if (!env?.DB) return true;
  const expiresAt = now + LEASE_MS;
  const result = await env.DB.prepare(`
    UPDATE article_summary_review_leases
    SET lease_expires_at = ?, updated_at = ?
    WHERE doi = ? AND evidence_packet_hash = ? AND lease_owner = ?
  `).bind(expiresAt, now, job.doi, job.evidencePacketHash, job.leaseOwner).run();
  if (Number(result?.meta?.changes || 0) !== 1) return false;
  job.leaseExpiresAt = expiresAt;
  return true;
}

async function releaseReviewLease(env, job) {
  if (!env?.DB || !job?.doi || !job?.leaseOwner) return;
  await env.DB.prepare(`
    DELETE FROM article_summary_review_leases
    WHERE doi = ? AND evidence_packet_hash = ? AND lease_owner = ?
  `).bind(job.doi, job.evidencePacketHash, job.leaseOwner).run();
}

async function claimCandidate(env, candidate, now = Date.now()) {
  const keys = await keysForDoi(candidate.doi);
  const previous = await readJsonObject(env, keys.job);
  if (previous && previous.evidencePacketHash === candidate.evidencePacketHash) {
    if (previous.state === 'processing' && Number(previous.leaseExpiresAt || 0) > now) return null;
    if (previous.state === 'retry_wait' && Number(previous.nextRetryAt || 0) > now) return null;
    if (['published', 'needs_manual_review', 'rejected'].includes(previous.state)) return null;
  }
  const owner = crypto.randomUUID();
  if (!await claimReviewLease(env, candidate, owner, now)) return null;
  const job = {
    version: JOB_VERSION,
    doi: candidate.doi,
    evidenceKey: candidate.evidenceKey,
    evidencePacketHash: candidate.evidencePacketHash,
    sourceHash: candidate.sourceHash,
    evidenceLevel: candidate.evidenceLevel,
    textProcessingPolicy: candidate.textProcessingPolicy,
    capturedAt: candidate.capturedAt,
    state: 'processing',
    attempts: previous?.evidencePacketHash === candidate.evidencePacketHash ? Number(previous.attempts || 0) + 1 : 1,
    leaseOwner: owner,
    leaseExpiresAt: now + LEASE_MS,
    nextRetryAt: 0,
    lastError: '',
    createdAt: previous?.evidencePacketHash === candidate.evidencePacketHash ? Number(previous.createdAt || now) : now,
    updatedAt: now,
  };
  try {
    await putJob(env, job);
    // R2 remains the durable human-readable job record. D1 is only the atomic
    // call lease; confirm both layers agree before any model request is made.
    const confirmed = await readJsonObject(env, keys.job);
    if (!confirmed || confirmed.leaseOwner !== job.leaseOwner || confirmed.evidencePacketHash !== job.evidencePacketHash) {
      await releaseReviewLease(env, job);
      return null;
    }
    return job;
  } catch (error) {
    await releaseReviewLease(env, job);
    throw error;
  }
}

function evidenceMap(evidence) {
  const map = new Map();
  for (const row of evidence?.sections || []) if (row?.sectionId) map.set(row.sectionId, row.text || '');
  for (const row of evidence?.captions || []) if (row?.evidenceId) map.set(row.evidenceId, row.text || '');
  for (const row of evidence?.tables || []) if (row?.evidenceId) map.set(row.evidenceId, [row.title, row.text].filter(Boolean).join('\n'));
  return map;
}
function evidenceRows(evidence) {
  const rows = [];
  for (const row of evidence?.sections || []) {
    if (!row?.sectionId || !row?.text) continue;
    rows.push({ id: row.sectionId, kind: 'section', type: row.type || 'other', heading: row.heading || '', text: row.text });
  }
  for (const row of evidence?.captions || []) {
    if (!row?.evidenceId || !row?.text) continue;
    rows.push({ id: row.evidenceId, kind: 'caption', type: row.type || 'figure', heading: row.label || '', text: row.text });
  }
  for (const row of evidence?.tables || []) {
    if (!row?.evidenceId || (!row?.title && !row?.text)) continue;
    rows.push({ id: row.evidenceId, kind: 'table', type: 'table', heading: [row.label, row.title].filter(Boolean).join(' — '), text: [row.title, row.text].filter(Boolean).join('\n') });
  }
  return rows;
}

function splitEvidenceRow(row, targetChars) {
  const text = String(row?.text || '');
  const target = Math.max(20_000, Number(targetChars || EVIDENCE_CHUNK_TARGET_CHARS));
  if (text.length <= target) return [{ ...row, part: 1, parts: 1 }];
  const parts = Math.ceil(text.length / target);
  return Array.from({ length: parts }, (_, index) => ({
    ...row,
    text: text.slice(index * target, (index + 1) * target),
    part: index + 1,
    parts,
  }));
}

function chunkEvidence(evidence, targetChars = EVIDENCE_CHUNK_TARGET_CHARS) {
  const target = Math.max(20_000, Number(targetChars || EVIDENCE_CHUNK_TARGET_CHARS));
  const units = evidenceRows(evidence).flatMap(row => splitEvidenceRow(row, target));
  const chunks = [];
  let current = [];
  let chars = 0;
  for (const unit of units) {
    const cost = String(unit.text || '').length + String(unit.heading || '').length + 120;
    if (current.length && chars + cost > target) {
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

function uniqueStrings(values) {
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

function mergeEvidenceIds(rows) {
  return uniqueStrings((rows || []).flatMap(row => Array.isArray(row?.evidenceIds) ? row.evidenceIds : []));
}

function mergeDrafts(drafts, evidence) {
  const conditions = [];
  const conditionKeys = new Set();
  const claims = [];
  const claimKeys = new Set();
  const mechanism = { experimentalEvidence: [], authorProposal: [], modelInference: [] };
  const mechanismKeys = new Set();

  for (const draft of drafts) {
    for (const condition of draft?.conditions || []) {
      const ids = uniqueStrings(condition?.evidenceIds || []).sort();
      const key = [condition?.name, condition?.value, condition?.role, ids.join(',')].map(value => String(value || '').trim().toLowerCase()).join('|');
      if (!key || conditionKeys.has(key)) continue;
      conditionKeys.add(key);
      conditions.push({ ...condition, evidenceIds: ids });
    }
    for (const claim of draft?.claims || []) {
      const ids = uniqueStrings(claim?.evidenceIds || []).sort();
      const key = [claim?.claim, claim?.claimType, ids.join(',')].map(value => String(value || '').trim().toLowerCase()).join('|');
      if (!String(claim?.claim || '').trim() || claimKeys.has(key)) continue;
      claimKeys.add(key);
      claims.push({ ...claim, evidenceIds: ids });
    }
    for (const group of ['experimentalEvidence', 'authorProposal', 'modelInference']) {
      for (const row of draft?.mechanism?.[group] || []) {
        const ids = uniqueStrings(row?.evidenceIds || []).sort();
        const key = group + '|' + String(row?.statement || '').trim().toLowerCase() + '|' + ids.join(',');
        if (!String(row?.statement || '').trim() || mechanismKeys.has(key)) continue;
        mechanismKeys.add(key);
        mechanism[group].push({ ...row, evidenceIds: ids });
      }
    }
  }

  const scopeRows = drafts.map(draft => draft?.substrateScope || {});
  return {
    doi: evidence.doi,
    evidenceLevel: evidence.evidenceLevel || evidence.fulltextStatus,
    researchObjective: uniqueStrings(drafts.map(draft => draft?.researchObjective)).join('\n'),
    keyTransformationOrStrategy: uniqueStrings(drafts.map(draft => draft?.keyTransformationOrStrategy)).join('\n'),
    conditions,
    substrateScope: {
      summary: uniqueStrings(scopeRows.map(row => row?.summary)).join('\n'),
      supportedTrends: uniqueStrings(scopeRows.flatMap(row => row?.supportedTrends || [])),
      limitations: uniqueStrings(scopeRows.flatMap(row => row?.limitations || [])),
      evidenceIds: mergeEvidenceIds(scopeRows),
    },
    mechanism,
    noveltyAndSyntheticSignificance: uniqueStrings(drafts.map(draft => draft?.noveltyAndSyntheticSignificance)).join('\n'),
    limitations: uniqueStrings(drafts.flatMap(draft => draft?.limitations || [])),
    questionsForManualVerification: uniqueStrings(drafts.flatMap(draft => draft?.questionsForManualVerification || [])),
    claims,
    draftZh: uniqueStrings(drafts.map(draft => draft?.draftZh)).join('\n\n'),
    draftEn: uniqueStrings(drafts.map(draft => draft?.draftEn)).join('\n\n'),
  };
}

function evidenceChunkPrompt(evidence, units, index, total) {
  return JSON.stringify({
    doi: evidence.doi,
    title: evidence.title,
    journal: evidence.journal,
    publisher: evidence.publisher,
    evidenceLevel: evidence.evidenceLevel || evidence.fulltextStatus,
    chunkIndex: index,
    chunkCount: total,
    evidence: units.map(unit => ({
      evidenceId: unit.id,
      kind: unit.kind,
      type: unit.type,
      heading: unit.heading,
      part: unit.parts > 1 ? unit.part : undefined,
      parts: unit.parts > 1 ? unit.parts : undefined,
      text: unit.text,
    })),
  });
}

function collectDraftEvidenceIds(draft) {
  const ids = [];
  for (const row of draft?.conditions || []) ids.push(...(row?.evidenceIds || []));
  ids.push(...(draft?.substrateScope?.evidenceIds || []));
  for (const group of ['experimentalEvidence', 'authorProposal', 'modelInference']) {
    for (const row of draft?.mechanism?.[group] || []) ids.push(...(row?.evidenceIds || []));
  }
  for (const claim of draft?.claims || []) ids.push(...(claim?.evidenceIds || []));
  return uniqueStrings(ids);
}

function auditEvidenceChunks(evidence, draft, targetChars = EVIDENCE_CHUNK_TARGET_CHARS) {
  const map = new Map(evidenceRows(evidence).map(row => [row.id, row]));
  const cited = collectDraftEvidenceIds(draft).map(id => map.get(id)).filter(Boolean);
  const source = cited.length ? cited : evidenceRows(evidence);
  const pseudoEvidence = {
    sections: source.filter(row => row.kind === 'section').map(row => ({ sectionId: row.id, type: row.type, heading: row.heading, text: row.text })),
    captions: source.filter(row => row.kind === 'caption').map(row => ({ evidenceId: row.id, type: row.type, label: row.heading, text: row.text })),
    tables: source.filter(row => row.kind === 'table').map(row => ({ evidenceId: row.id, label: row.heading, title: '', text: row.text })),
  };
  return chunkEvidence(pseudoEvidence, targetChars);
}

function evidenceIndex(evidence) {
  return evidenceRows(evidence).map(row => ({
    evidenceId: row.id,
    kind: row.kind,
    type: row.type,
    heading: row.heading,
    characters: String(row.text || '').length,
  }));
}


function numberTokens(value) {
  const text = String(value || '');
  const matches = text.match(/-?\d+(?:\.\d+)?\s*(?:%|°\s*C|℃|h\b|hours?\b|min\b|minutes?\b|mol\s*%|equiv(?:alents?)?\b|eq\.?\b|mA\b|mV\b|V\b|nm\b|mM\b|μM\b|uM\b)/gi) || [];
  return [...new Set(matches.map(token => token.replace(/\s+/g, '').toLowerCase()))];
}

function citedText(map, ids) {
  return (Array.isArray(ids) ? ids : []).map(id => map.get(id) || '').join('\n');
}

function validateDraftAgainstEvidence(draft, evidence) {
  const issues = [];
  const map = evidenceMap(evidence);
  const validIds = new Set(map.keys());

  function checkIds(ids, label, allowEmpty = false) {
    const values = Array.isArray(ids) ? ids : [];
    if (!allowEmpty && values.length === 0) {
      issues.push({ type: 'evidence_mismatch', message: `${label} has no evidence IDs`, evidenceIds: [] });
      return;
    }
    const unknown = values.filter(id => !validIds.has(id));
    if (unknown.length) issues.push({ type: 'evidence_mismatch', message: `${label} cites unknown evidence IDs: ${unknown.join(', ')}`, evidenceIds: unknown });
  }

  function checkNumbers(text, ids, label) {
    const tokens = numberTokens(text);
    if (!tokens.length) return;
    const source = citedText(map, ids).replace(/\s+/g, '').toLowerCase();
    const missing = tokens.filter(token => !source.includes(token));
    if (missing.length) issues.push({
      type: 'numeric_mismatch',
      message: `${label} contains numeric values not found in cited evidence: ${missing.join(', ')}`,
      evidenceIds: Array.isArray(ids) ? ids : [],
    });
  }

  if (draft?.doi !== evidence?.doi) {
    issues.push({ type: 'evidence_mismatch', message: 'Draft DOI does not match evidence DOI', evidenceIds: [] });
  }
  if (draft?.evidenceLevel !== evidence?.evidenceLevel) {
    issues.push({ type: 'evidence_level_violation', message: 'Draft evidence level does not match stored evidence', evidenceIds: [] });
  }

  for (const [index, condition] of (draft?.conditions || []).entries()) {
    checkIds(condition?.evidenceIds, `conditions[${index}]`);
    checkNumbers([condition?.name, condition?.value, condition?.role].join(' '), condition?.evidenceIds, `conditions[${index}]`);
  }
  checkIds(draft?.substrateScope?.evidenceIds, 'substrateScope', evidence?.evidenceLevel === 'abstract_only');
  checkNumbers(draft?.substrateScope?.summary, draft?.substrateScope?.evidenceIds, 'substrateScope');

  for (const group of ['experimentalEvidence', 'authorProposal']) {
    for (const [index, row] of (draft?.mechanism?.[group] || []).entries()) {
      checkIds(row?.evidenceIds, `mechanism.${group}[${index}]`);
      checkNumbers(row?.statement, row?.evidenceIds, `mechanism.${group}[${index}]`);
    }
  }

  if ((draft?.mechanism?.modelInference || []).length) {
    issues.push({ type: 'mechanistic_overclaim', message: 'Draft contains model-only mechanistic inference', evidenceIds: [] });
  }

  for (const [index, claim] of (draft?.claims || []).entries()) {
    const allowEmpty = claim?.claimType === 'insufficient_evidence';
    checkIds(claim?.evidenceIds, `claims[${index}]`, allowEmpty);
    checkNumbers(claim?.claim, claim?.evidenceIds, `claims[${index}]`);
    if (claim?.claimType === 'model_inference') {
      issues.push({ type: 'unsupported_claim', message: `claims[${index}] is model inference`, evidenceIds: claim?.evidenceIds || [] });
    }
  }

  return issues;
}

function promptEvidence(evidence) {
  return JSON.stringify({
    doi: evidence.doi,
    title: evidence.title,
    journal: evidence.journal,
    publisher: evidence.publisher,
    evidenceLevel: evidence.evidenceLevel || evidence.fulltextStatus,
    sections: evidence.sections || [],
    captions: evidence.captions || [],
    tables: evidence.tables || [],
  });
}

async function reviewChunkKey(doi, evidencePacketHash, phase, index) {
  const id = await idForDoi(doi);
  return `${REVIEW_CHUNK_PREFIX}${id}/${evidencePacketHash}/${phase}-${String(index + 1).padStart(4, '0')}.json`;
}

async function readCachedChunk(env, key) {
  const value = await readJsonObject(env, key);
  return value?.parsed ? value : null;
}

async function storeChunk(env, key, parsed, response, meta = {}) {
  const value = {
    version: 1,
    parsed,
    modelSnapshot: response?.model || meta.model || '',
    responseId: response?.id || '',
    generatedAt: Date.now(),
    ...meta,
  };
  await env.MEDIA.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
  });
  return value;
}

function auditChunkPrompt(evidence, units, draft, deterministicIssues, index, total) {
  const ids = uniqueStrings(units.map(unit => unit.id));
  return JSON.stringify({
    doi: evidence.doi,
    title: evidence.title,
    journal: evidence.journal,
    evidenceLevel: evidence.evidenceLevel || evidence.fulltextStatus,
    chunkIndex: index,
    chunkCount: total,
    evidenceIdsInThisChunk: ids,
    evidence: units.map(unit => ({
      evidenceId: unit.id,
      kind: unit.kind,
      type: unit.type,
      heading: unit.heading,
      part: unit.parts > 1 ? unit.part : undefined,
      parts: unit.parts > 1 ? unit.parts : undefined,
      text: unit.text,
    })),
    mergedDraft: draft,
    deterministicIssues,
  });
}

function validateFinalSummaryAgainstEvidence(auditValue, evidence) {
  const issues = [];
  const source = [...evidenceMap(evidence).values()].join('\n').replace(/\s+/g, '').toLowerCase();
  const finalText = String(auditValue?.finalZh || '') + '\n' + String(auditValue?.finalEn || '');
  for (const token of numberTokens(finalText)) {
    if (!source.includes(token)) {
      issues.push({
        type: 'numeric_mismatch',
        severity: 'error',
        message: `Final bilingual summary contains numeric value not found anywhere in Evidence: ${token}`,
        evidenceIds: [],
      });
    }
  }
  const level = evidence?.evidenceLevel || evidence?.fulltextStatus;
  if (level === 'abstract_only') {
    if (!/(?:abstract|摘要|基于)/i.test(String(auditValue?.finalZh || ''))
      || !/abstract/i.test(String(auditValue?.finalEn || ''))) {
      issues.push({
        type: 'evidence_level_violation',
        severity: 'error',
        message: 'Abstract-only final summary must explicitly disclose Abstract-based coverage in both languages.',
        evidenceIds: [],
      });
    }
  }
  return issues;
}

const DRAFT_INSTRUCTIONS = `You are the first-pass evidence extractor for an organic-synthesis literature review.
You are receiving one chunk of a larger Article Evidence Packet. Use only this supplied chunk. Do not use outside knowledge and do not infer facts from chunks you have not seen.
Separate experimental facts, author conclusions, author-proposed mechanisms, and model inference.
The modelInference array must normally be empty. Never reconstruct missing standard conditions.
For abstract_only evidence, summarize only what the abstract explicitly supports; do not expand “broad scope” into detailed scope.
When information is missing from this chunk, leave it absent rather than declaring that the full article lacks it; questionsForManualVerification should be used only when the chunk itself exposes a material unresolved point.
Capture supported key transformation/strategy, conditions, scope/selectivity, mechanistic evidence vs author proposal, limitations, and concrete synthetic significance.
Every key factual statement represented in the structured fields must also be represented by a claim citing evidence IDs (s..., c..., t...).
Chinese and English drafts are intermediate only and must contain the same facts extracted from this chunk.`;

const AUDIT_CHUNK_INSTRUCTIONS = `You are an independent senior organic-chemistry evidence checker.
You are receiving one chunk containing the full source text for specific evidence IDs cited by a merged draft.
Audit only draft statements whose evidence IDs intersect evidenceIdsInThisChunk. Do not mark unrelated claims unsupported merely because their evidence is in another chunk.
Check semantic support, numeric/condition mismatches, scope exaggeration, mechanistic overclaim, and whether author proposals are mislabeled as experimental facts.
Do not rewrite the public summary in this step. Return pass only when the statements audited in this chunk are evidence-supported.
Model-only inference is never acceptable for automatic publication.`;

const FINAL_AUDIT_INSTRUCTIONS = `You are the final senior organic-chemistry reviewer and bilingual renderer.
The full raw Evidence Packet has already been processed by the draft extractor in chunks, and every cited evidence chunk has been independently checked by GPT plus deterministic validators.
Use only mergedDraft, deterministicIssues, auditChecks, and evidenceIndex. Do not invent or add any scientific fact not already present in mergedDraft.
If any audit check reports an error, unsupported claim, model inference, or needs_manual_review/reject outcome, do not pass.
Check the distinction between experimental observations and author-proposed mechanisms.
For abstract_only evidence, both Chinese and English final summaries must visibly state that they are Abstract-based and must not imply full-paper coverage.
If and only if the reviewed record is supported, choose pass and render concise, information-dense Chinese and English summaries containing the same scientific facts.
Preserve explicit numerical conditions exactly; never introduce a new number.`;

const AUDIT_INSTRUCTIONS = `You are an independent senior organic-chemistry reviewer.
Audit the draft strictly against the supplied evidence and deterministic validation issues.
Check unsupported claims, numeric/condition mismatches, scope exaggeration, mechanistic overclaim, missing limitations, evidence-ID mismatch, and evidence-level violations.
Experimental observations and an author-proposed mechanism are not the same thing.
Do not allow model-only inference in an auto-published summary.
For abstract_only evidence, the final summary must visibly remain abstract-based and must not imply the full article was read.
If a material problem cannot be corrected from the evidence, choose needs_manual_review or reject.
If and only if the reviewed record is evidence-supported, choose pass and provide final Chinese and English summaries with identical scientific content.`;

function outputText(response) {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) return response.output_text;
  for (const item of response?.output || []) {
    if (item?.type !== 'message') continue;
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return '';
}

async function callOpenAiStructured(env, {
  model,
  reasoningEffort,
  instructions,
  input,
  schema,
  name,
  timeoutMs,
  fetchImpl = fetch,
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${String(env.OPENAI_API_KEY || '').trim()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: reasoningEffort },
        instructions,
        input,
        text: {
          format: {
            type: 'json_schema',
            name,
            strict: true,
            schema,
          },
        },
      }),
    });
  } catch (error) {
    const wrapped = new Error(error?.name === 'AbortError' ? 'openai_timeout' : `openai_network_error:${safeText(error?.message || error, 240)}`);
    wrapped.retryable = true;
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) {
    const code = safeText(body?.error?.code || body?.error?.type || '', 120);
    const message = safeText(body?.error?.message || raw || `HTTP ${response.status}`, 500);
    const error = new Error(`openai_http_${response.status}:${code}:${message}`);
    error.httpStatus = response.status;
    error.openaiCode = code;
    error.retryable = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
    throw error;
  }
  const text = outputText(body);
  if (!text) throw new Error('openai_structured_output_missing');
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('openai_structured_output_invalid_json'); }
  return { parsed, response: body };
}

function retryDelay(attempts) {
  return Math.min(6 * 60 * 60 * 1000, 15 * 60 * 1000 * Math.pow(2, Math.max(0, attempts - 1)));
}

async function finalizeJob(env, job, patch) {
  const now = Date.now();
  const next = {
    ...job,
    ...patch,
    leaseOwner: '',
    leaseExpiresAt: 0,
    updatedAt: now,
  };
  await putJob(env, next);
  await releaseReviewLease(env, job);
  return next;
}

async function processClaimedJob(env, job, options = {}) {
  const evidence = await readJsonObject(env, job.evidenceKey);
  if (!evidence || evidence.evidencePacketHash !== job.evidencePacketHash || evidence.sourceHash !== job.sourceHash) {
    return finalizeJob(env, job, { state: 'retry_wait', nextRetryAt: Date.now() + 5 * 60 * 1000, lastError: 'evidence_changed_or_missing' });
  }

  const draftModel = String(env.SUMMARY_DRAFT_MODEL || DRAFT_MODEL_DEFAULT);
  const auditModel = String(env.SUMMARY_AUDIT_MODEL || AUDIT_MODEL_DEFAULT);
  const draft = await callOpenAiStructured(env, {
    model: draftModel,
    reasoningEffort: String(env.SUMMARY_DRAFT_REASONING || 'medium'),
    instructions: DRAFT_INSTRUCTIONS,
    input: `ARTICLE EVIDENCE PACKET:\n${promptEvidence(evidence)}`,
    schema: DRAFT_SCHEMA,
    name: 'organic_synthesis_summary_draft_v2',
    timeoutMs: Number(env.SUMMARY_DRAFT_TIMEOUT_MS || 75000),
    fetchImpl: options.fetchImpl,
  });

  const deterministicIssues = validateDraftAgainstEvidence(draft.parsed, evidence);
  if (deterministicIssues.some(issue => ['evidence_mismatch', 'mechanistic_overclaim', 'unsupported_claim'].includes(issue.type))) {
    const keys = await keysForDoi(job.doi);
    const review = {
      version: 1,
      doi: job.doi,
      status: 'needs_manual_review',
      sourceHash: job.sourceHash,
      evidencePacketHash: job.evidencePacketHash,
      evidenceLevel: job.evidenceLevel,
      draftModel,
      auditModel: '',
      promptVersion: DRAFT_PROMPT_VERSION,
      auditVersion: AUDIT_PROMPT_VERSION,
      deterministicIssues,
      draft: draft.parsed,
      createdAt: Date.now(),
    };
    await env.MEDIA.put(keys.review, JSON.stringify(review), {
      httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
      customMetadata: { doi: job.doi, status: review.status, evidencePacketHash: job.evidencePacketHash },
    });
    return finalizeJob(env, job, { state: 'needs_manual_review', nextRetryAt: 0, lastError: 'deterministic_validation_failed' });
  }

  const audit = await callOpenAiStructured(env, {
    model: auditModel,
    reasoningEffort: String(env.SUMMARY_AUDIT_REASONING || 'high'),
    instructions: AUDIT_INSTRUCTIONS,
    input: `ARTICLE EVIDENCE PACKET:\n${promptEvidence(evidence)}\n\nDRAFT JSON:\n${JSON.stringify(draft.parsed)}\n\nDETERMINISTIC VALIDATION ISSUES:\n${JSON.stringify(deterministicIssues)}`,
    schema: AUDIT_SCHEMA,
    name: 'organic_synthesis_summary_audit_v2',
    timeoutMs: Number(env.SUMMARY_AUDIT_TIMEOUT_MS || 90000),
    fetchImpl: options.fetchImpl,
  });

  const auditValue = audit.parsed;
  const blockingAudit = auditValue.outcome !== 'pass'
    || auditValue.modelInferencePresent === true
    || Number(auditValue.unsupportedClaimCount || 0) > 0
    || (auditValue.issues || []).some(issue => issue?.severity === 'error')
    || !String(auditValue.finalZh || '').trim()
    || !String(auditValue.finalEn || '').trim();

  const keys = await keysForDoi(job.doi);
  const reviewRecord = {
    version: 1,
    doi: job.doi,
    status: blockingAudit ? auditValue.outcome : 'approved',
    sourceHash: job.sourceHash,
    evidencePacketHash: job.evidencePacketHash,
    evidenceLevel: job.evidenceLevel,
    draftModel,
    draftModelSnapshot: draft.response?.model || draftModel,
    auditModel,
    auditModelSnapshot: audit.response?.model || auditModel,
    promptVersion: DRAFT_PROMPT_VERSION,
    auditVersion: AUDIT_PROMPT_VERSION,
    deterministicIssues,
    draft: draft.parsed,
    audit: auditValue,
    createdAt: Date.now(),
  };
  await env.MEDIA.put(keys.review, JSON.stringify(reviewRecord), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
    customMetadata: { doi: job.doi, status: reviewRecord.status, evidencePacketHash: job.evidencePacketHash },
  });

  if (blockingAudit) {
    return finalizeJob(env, job, {
      state: auditValue.outcome === 'reject' ? 'rejected' : 'needs_manual_review',
      nextRetryAt: 0,
      lastError: safeText(auditValue.auditNotes || 'audit_not_passed', 300),
    });
  }

  const generatedAt = Date.now();
  const summary = {
    schemaVersion: REVIEWED_SUMMARY_SCHEMA_VERSION,
    status: 'approved',
    doi: job.doi,
    sourceHash: job.sourceHash,
    evidencePacketHash: job.evidencePacketHash,
    evidenceLevel: job.evidenceLevel,
    source: 'reviewed_evidence_v2',
    model: auditModel,
    modelSnapshot: audit.response?.model || auditModel,
    draftModel,
    draftModelSnapshot: draft.response?.model || draftModel,
    promptVersion: DRAFT_PROMPT_VERSION,
    auditVersion: AUDIT_PROMPT_VERSION,
    zh: String(auditValue.finalZh || '').trim(),
    en: String(auditValue.finalEn || '').trim(),
    generatedAt,
    reviewedAt: generatedAt,
  };
  await env.MEDIA.put(keys.summary, JSON.stringify(summary), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
    customMetadata: {
      doi: job.doi,
      status: 'approved',
      sourceHash: job.sourceHash,
      evidencePacketHash: job.evidencePacketHash,
      evidenceLevel: job.evidenceLevel,
      model: auditModel,
      generatedAt: String(generatedAt),
    },
  });
  return finalizeJob(env, job, { state: 'published', nextRetryAt: 0, lastError: '', publishedAt: generatedAt });
}

async function handleJobFailure(env, job, error) {
  const attempts = Number(job.attempts || 1);
  const message = safeText(error?.message || error, 500);
  const contextFailure = /context|token|too large|maximum/i.test(message) && !error?.retryable;
  if (attempts >= MAX_ATTEMPTS || contextFailure || error?.retryable === false) {
    return finalizeJob(env, job, {
      state: 'needs_manual_review',
      nextRetryAt: 0,
      lastError: message,
    });
  }
  return finalizeJob(env, job, {
    state: 'retry_wait',
    nextRetryAt: Date.now() + retryDelay(attempts),
    lastError: message,
  });
}

export async function runSummaryReviewCycle(env, options = {}) {
  if (!env?.MEDIA) return { status: 'disabled', reason: 'media_binding_missing' };
  if (!reviewEnabled(env)) {
    return {
      status: 'disabled',
      reason: !String(env?.OPENAI_API_KEY || '').trim() ? 'openai_api_key_missing' : 'summary_review_disabled',
    };
  }

  const selection = await selectReviewCandidate(env);
  const dailyLimitRaw = Number(env.SUMMARY_REVIEW_DAILY_LIMIT || 96);
  const dailyLimit = Number.isFinite(dailyLimitRaw) ? Math.max(1, Math.floor(dailyLimitRaw)) : 96;
  if (selection.recentPublishedCount >= dailyLimit) {
    return {
      status: 'daily_limit',
      dailyLimit,
      recentPublishedCount: selection.recentPublishedCount,
      eligibleCount: selection.eligibleCount,
    };
  }
  if (!selection.candidate) {
    return {
      status: 'idle',
      evidenceCount: selection.evidenceCount,
      jobCount: selection.jobCount,
      eligibleCount: 0,
      blockedPolicies: selection.blockedPolicies,
    };
  }
  const job = await claimCandidate(env, selection.candidate);
  if (!job) return { status: 'idle', reason: 'candidate_already_claimed' };
  try {
    const finalJob = await processClaimedJob(env, job, options);
    return {
      status: finalJob.state,
      doi: finalJob.doi,
      attempts: finalJob.attempts,
      evidenceLevel: finalJob.evidenceLevel,
      lastError: finalJob.lastError || '',
    };
  } catch (error) {
    const finalJob = await handleJobFailure(env, job, error);
    return {
      status: finalJob.state,
      doi: finalJob.doi,
      attempts: finalJob.attempts,
      evidenceLevel: finalJob.evidenceLevel,
      lastError: finalJob.lastError || '',
    };
  }
}

export async function getSummaryReviewStatus(env) {
  if (!env?.MEDIA) return { status: 503, body: { error: 'summary_storage_unavailable' } };
  const [evidenceObjects, jobObjects] = await Promise.all([
    listObjects(env, EVIDENCE_PREFIX),
    listObjects(env, JOB_PREFIX),
  ]);
  const states = {};
  for (const object of jobObjects) {
    const state = String(object?.customMetadata?.state || 'unknown');
    states[state] = (states[state] || 0) + 1;
  }
  const policies = {};
  for (const object of evidenceObjects) {
    const policy = String(object?.customMetadata?.textProcessingPolicy || 'unknown');
    policies[policy] = (policies[policy] || 0) + 1;
  }
  return {
    status: 200,
    body: {
      enabled: reviewEnabled(env),
      apiKeyConfigured: Boolean(String(env?.OPENAI_API_KEY || '').trim()),
      allowUnknownPolicy: String(env?.SUMMARY_ALLOW_UNKNOWN_POLICY || '') === '1',
      draftModel: String(env?.SUMMARY_DRAFT_MODEL || DRAFT_MODEL_DEFAULT),
      auditModel: String(env?.SUMMARY_AUDIT_MODEL || AUDIT_MODEL_DEFAULT),
      dailyLimit: Math.max(1, Math.floor(Number(env?.SUMMARY_REVIEW_DAILY_LIMIT || 96) || 96)),
      promptVersion: DRAFT_PROMPT_VERSION,
      auditVersion: AUDIT_PROMPT_VERSION,
      evidenceCount: evidenceObjects.length,
      jobCount: jobObjects.length,
      states,
      policies,
    },
  };
}

export const SUMMARY_DRAFT_SCHEMA = DRAFT_SCHEMA;
export const SUMMARY_AUDIT_SCHEMA = AUDIT_SCHEMA;
export const SUMMARY_DRAFT_PROMPT_VERSION = DRAFT_PROMPT_VERSION;
export const SUMMARY_AUDIT_PROMPT_VERSION = AUDIT_PROMPT_VERSION;
export { validateDraftAgainstEvidence };
