import { getScheduledSummaryForEvidence, persistScheduledEvidenceHandoff } from './scheduled-summary-handoff.js';

const EVIDENCE_PREFIX = 'private/article-evidence-v2/';
const LEGACY_FULLTEXT_PREFIX = 'private/article-fulltext/';
const SUMMARY_PREFIX = 'private/article-summary/';
const EVIDENCE_SCHEMA_VERSION = 'article-evidence-v2';
const REVIEWED_SUMMARY_SCHEMA_VERSION = 'reviewed-summary-v2';
const CAPTURE_VERSION = '6.2.20';
const MIN_CONTROLLER_REVISION = [2, 2, 32];
const SECTION_TYPES = new Set([
  'abstract',
  'introduction',
  'optimization',
  'results',
  'scope',
  'mechanism',
  'conclusion',
  'experimental',
  'other',
]);

const PROCESSING_POLICIES = new Set([
  'open_access',
  'private_cache_allowed',
  'transient_processing_only',
  'no_external_ai',
  'unknown',
]);

const EXCLUDED_HEADING = /^(?:references?|bibliography|acknowledg(?:e)?ments?|author information|associated content|supplementary information|supporting information|funding|conflicts? of interest|data availability)\b/i;
const CHALLENGE_TEXT = /(?:verify you are human|access denied|captcha|enable javascript and cookies|unusual traffic|checking your browser|sign in to access|institutional sign in required)/i;

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

function normalizeText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function safeSingleLine(value, max = 400) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function publisherForDoi(doi) {
  if (doi.startsWith('10.1021/')) return 'acs';
  if (doi.startsWith('10.1002/')) return 'wiley';
  if (doi.startsWith('10.1038/')) return 'nature';
  if (doi.startsWith('10.1126/')) return 'science';
  if (doi.startsWith('10.1039/')) return 'rsc';
  if (doi.startsWith('10.1016/')) return 'elsevier';
  if (doi.startsWith('10.31635/')) return 'ccs';
  return '';
}

function hostMatches(hostname, expected) {
  const host = String(hostname || '').toLowerCase();
  return host === expected || host.endsWith('.' + expected);
}

function publisherUrlAllowed(publisher, value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (publisher === 'acs') return hostMatches(host, 'pubs.acs.org');
    if (publisher === 'wiley') return hostMatches(host, 'onlinelibrary.wiley.com');
    if (publisher === 'nature') return hostMatches(host, 'nature.com');
    if (publisher === 'science') return hostMatches(host, 'science.org');
    if (publisher === 'rsc') return hostMatches(host, 'pubs.rsc.org');
    if (publisher === 'elsevier') return hostMatches(host, 'sciencedirect.com') || hostMatches(host, 'cell.com');
    if (publisher === 'ccs') return hostMatches(host, 'ccspublishing.org.cn');
    return false;
  } catch {
    return false;
  }
}
function publisherArticleUrlBindsDoi(publisher, value, doi) {
  try {
    const url = new URL(String(value || ''));
    let path = '';
    try { path = decodeURIComponent(url.pathname).toLowerCase(); } catch { path = url.pathname.toLowerCase(); }
    const normalized = doi.toLowerCase();
    const suffix = normalized.split('/').slice(1).join('/');
    if (publisher === 'acs' || publisher === 'wiley' || publisher === 'science') {
      return path.includes(normalized);
    }
    if (publisher === 'nature' || publisher === 'rsc' || publisher === 'ccs') {
      return Boolean(suffix && path.includes(suffix));
    }
    // Elsevier/Cell full-text routes can be PII-based. Exact DOM pageDoi plus
    // publisher-owned HTTPS origin remains the binding until its adapter adds
    // a stronger canonical DOI signal.
    if (publisher === 'elsevier') return true;
    return false;
  } catch {
    return false;
  }
}


function revisionAtLeast(value, minimum = MIN_CONTROLLER_REVISION) {
  const match = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(String(value || '').trim());
  if (!match) return false;
  const actual = match.slice(1).map(Number);
  for (let i = 0; i < minimum.length; i += 1) {
    if (actual[i] > minimum[i]) return true;
    if (actual[i] < minimum[i]) return false;
  }
  return true;
}

function normalizeSectionType(value) {
  const raw = safeSingleLine(value, 80).toLowerCase().replace(/[\s-]+/g, '_');
  const aliases = {
    results_and_discussion: 'results',
    result_and_discussion: 'results',
    discussion: 'results',
    substrate_scope: 'scope',
    mechanistic_studies: 'mechanism',
    mechanism_studies: 'mechanism',
    methods: 'experimental',
    general_procedure: 'experimental',
  };
  const normalized = aliases[raw] || raw;
  return SECTION_TYPES.has(normalized) ? normalized : 'other';
}

function normalizeSections(rows) {
  const source = Array.isArray(rows) ? rows : [];
  const normalized = [];
  for (const row of source) {
    const heading = safeSingleLine(row?.heading, 500);
    if (heading && EXCLUDED_HEADING.test(heading)) continue;
    const text = normalizeText(row?.text);
    if (text.length < 20) continue;
    normalized.push({
      type: normalizeSectionType(row?.type),
      heading,
      text,
      order: Number.isFinite(Number(row?.order)) ? Number(row.order) : normalized.length,
    });
  }
  normalized.sort((a, b) => a.order - b.order);
  return normalized.map((row, index) => ({
    sectionId: 's' + String(index + 1).padStart(3, '0'),
    type: row.type,
    heading: row.heading,
    text: row.text,
    order: index,
  }));
}

function normalizeCaptions(rows) {
  const source = Array.isArray(rows) ? rows : [];
  return source.map((row, index) => ({
    evidenceId: 'c' + String(index + 1).padStart(3, '0'),
    label: safeSingleLine(row?.label, 120),
    type: safeSingleLine(row?.type, 80).toLowerCase() || 'figure',
    text: normalizeText(row?.text),
  })).filter(row => row.text.length >= 10);
}

function normalizeTables(rows) {
  const source = Array.isArray(rows) ? rows : [];
  return source.map((row, index) => ({
    evidenceId: 't' + String(index + 1).padStart(3, '0'),
    label: safeSingleLine(row?.label, 120),
    title: safeSingleLine(row?.title, 500),
    text: normalizeText(row?.text),
  })).filter(row => row.text.length >= 10);
}

async function hashEvidenceRows(rows) {
  return Promise.all(rows.map(async row => ({ ...row, hash: await sha256Hex(row.text) })));
}

function canonicalSourceText(sections, captions, tables) {
  return [
    ...sections.map(row => [row.type, row.heading, row.text].filter(Boolean).join('\n')),
    ...captions.map(row => [row.label, row.text].filter(Boolean).join('\n')),
    ...tables.map(row => [row.label, row.title, row.text].filter(Boolean).join('\n')),
  ].join('\n\n');
}

function validateProvenance(payload, doi) {
  const publisher = publisherForDoi(doi);
  if (!publisher) return { error: 'unsupported_publisher' };
  const pageDoi = normalizeDoi(payload?.pageDoi);
  if (pageDoi !== doi) return { error: 'page_doi_mismatch' };
  if (payload?.publisher && safeSingleLine(payload.publisher, 40).toLowerCase() !== publisher) {
    return { error: 'publisher_mismatch' };
  }
  const articleUrl = String(payload?.articleUrl || '');
  const sourceUrl = String(payload?.sourceUrl || articleUrl);
  if (!publisherUrlAllowed(publisher, articleUrl) || !publisherUrlAllowed(publisher, sourceUrl)) {
    return { error: 'publisher_source_mismatch' };
  }
  if (!publisherArticleUrlBindsDoi(publisher, articleUrl, doi)) {
    return { error: 'article_url_doi_mismatch' };
  }
  if (String(payload?.captureVersion || '') !== CAPTURE_VERSION) return { error: 'capture_version_mismatch' };
  if (!revisionAtLeast(payload?.controllerRevision)) return { error: 'controller_revision_too_old' };
  const jobId = safeSingleLine(payload?.jobId, 120);
  if (!/^[a-z0-9-]{16,120}$/i.test(jobId)) return { error: 'invalid_job_id' };
  const fulltextStatus = String(payload?.fulltextStatus || '');
  if (!['complete','partial','abstract_only'].includes(fulltextStatus)) return { error: 'invalid_evidence_status' };
  return { publisher, pageDoi, articleUrl, sourceUrl, jobId, fulltextStatus };
}

async function keysForDoi(doi) {
  const hash = await sha256Hex(doi);
  const id = hash.slice(0, 32);
  return {
    evidence: `${EVIDENCE_PREFIX}${id}.json`,
    legacyFulltext: `${LEGACY_FULLTEXT_PREFIX}${id}.txt`,
    summary: `${SUMMARY_PREFIX}${id}.json`,
  };
}

async function readEvidence(env, doi) {
  if (!env?.MEDIA) return null;
  const keys = await keysForDoi(doi);
  const object = await env.MEDIA.get(keys.evidence);
  if (!object) return null;
  try {
    const parsed = JSON.parse(await object.text());
    if (parsed?.schemaVersion !== EVIDENCE_SCHEMA_VERSION || parsed?.doi !== doi) return null;
    if (!parsed?.sourceHash || !parsed?.evidencePacketHash || !Array.isArray(parsed?.sections)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function legacyFulltextAvailable(env, doi) {
  if (!env?.MEDIA) return false;
  const keys = await keysForDoi(doi);
  return Boolean(await env.MEDIA.get(keys.legacyFulltext));
}

async function readApprovedSummary(env, doi, evidence) {
  if (!env?.MEDIA) return { state: 'missing', summary: null };
  const keys = await keysForDoi(doi);
  const object = await env.MEDIA.get(keys.summary);
  if (!object) return { state: 'missing', summary: null };
  try {
    const parsed = JSON.parse(await object.text());
    if (
      parsed?.schemaVersion !== REVIEWED_SUMMARY_SCHEMA_VERSION ||
      parsed?.status !== 'approved' ||
      typeof parsed?.zh !== 'string' ||
      typeof parsed?.en !== 'string'
    ) return { state: 'legacy_or_unapproved', summary: null };
    if (parsed.sourceHash !== evidence.sourceHash || parsed.evidencePacketHash !== evidence.evidencePacketHash) {
      return { state: 'stale', summary: parsed };
    }
    return { state: 'approved', summary: parsed };
  } catch {
    return { state: 'invalid', summary: null };
  }
}

export async function importArticleFulltext(env, payload) {
  if (!env?.MEDIA) return { status: 503, body: { error: 'R2 binding MEDIA is not configured.' } };
  const doi = normalizeDoi(payload?.doi);
  if (!doi) return { status: 400, body: { error: 'invalid_doi' } };
  if (payload?.schemaVersion !== EVIDENCE_SCHEMA_VERSION) {
    return { status: 400, body: { error: 'evidence_schema_required', required: EVIDENCE_SCHEMA_VERSION } };
  }

  const provenance = validateProvenance(payload, doi);
  if (provenance.error) return { status: 400, body: { error: provenance.error } };

  const sections = await hashEvidenceRows(normalizeSections(payload?.sections));
  const captions = await hashEvidenceRows(normalizeCaptions(payload?.captions));
  const tables = await hashEvidenceRows(normalizeTables(payload?.tables));
  const sourceText = canonicalSourceText(sections, captions, tables);
  if (!sections.length && !captions.length && !tables.length) {
    return { status: 400, body: { error: 'evidence_empty' } };
  }
  if (CHALLENGE_TEXT.test(sourceText.slice(0, 12_000))) {
    return { status: 400, body: { error: 'challenge_or_auth_page_detected' } };
  }

  const sourceHash = await sha256Hex(sourceText);
  const capturedAt = safeSingleLine(payload?.capturedAt || new Date().toISOString(), 80);
  const textProcessingPolicy = PROCESSING_POLICIES.has(String(payload?.textProcessingPolicy || ''))
    ? String(payload.textProcessingPolicy)
    : 'unknown';
  const packetCore = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    doi,
    title: safeSingleLine(payload?.title, 1000),
    journal: safeSingleLine(payload?.journal, 200),
    publisher: provenance.publisher,
    articleUrl: provenance.articleUrl,
    sourceUrl: provenance.sourceUrl,
    pageDoi: provenance.pageDoi,
    captureVersion: CAPTURE_VERSION,
    controllerRevision: safeSingleLine(payload?.controllerRevision, 40),
    jobId: provenance.jobId,
    queueGeneratedAt: safeSingleLine(payload?.queueGeneratedAt, 80),
    capturedAt,
    fulltextStatus: provenance.fulltextStatus,
    evidenceLevel: provenance.fulltextStatus,
    textProcessingPolicy,
    sourceHash,
    sections,
    captions,
    tables,
  };
  const evidencePacketHash = await sha256Hex(JSON.stringify(packetCore));
  const evidence = {
    ...packetCore,
    evidencePacketHash,
    chars: sourceText.length,
    sectionCount: sections.length,
    captionCount: captions.length,
    tableCount: tables.length,
    importedAt: Date.now(),
  };

  const keys = await keysForDoi(doi);
  await env.MEDIA.put(keys.evidence, JSON.stringify(evidence), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
    customMetadata: {
      doi,
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      sourceHash,
      evidencePacketHash,
      publisher: provenance.publisher,
      capturedAt,
      textProcessingPolicy,
      evidenceLevel: provenance.fulltextStatus,
    },
  });
  const scheduledHandoff = await persistScheduledEvidenceHandoff(env, evidence);

  return {
    status: 200,
    body: {
      stored: true,
      state: 'evidence_ready',
      doi,
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      chars: evidence.chars,
      sections: evidence.sectionCount,
      captions: evidence.captionCount,
      tables: evidence.tableCount,
      sourceHash,
      evidencePacketHash,
      capturedAt,
      textProcessingPolicy,
      evidenceLevel: provenance.fulltextStatus,
      scheduledHandoffReady: Boolean(scheduledHandoff),
      scheduledPublicationMode: 'daily_1200_asia_shanghai',
    },
  };
}

export async function getArticleSummary(env, doiValue) {
  const doi = normalizeDoi(doiValue);
  if (!doi) return { status: 400, body: { error: 'invalid_doi' } };
  if (!env?.MEDIA) return { status: 503, body: { error: 'summary_storage_unavailable' } };

  const evidence = await readEvidence(env, doi);
  if (!evidence) {
    const legacy = await legacyFulltextAvailable(env, doi);
    return {
      status: 200,
      body: {
        doi,
        available: false,
        fulltextAvailable: legacy,
        evidenceAvailable: false,
        state: legacy ? 'legacy_fulltext' : 'missing',
        reason: legacy ? 'evidence_v2_required' : 'fulltext_missing',
      },
    };
  }

  const scheduled = await getScheduledSummaryForEvidence(env, doi, evidence);
  if (scheduled) {
    return {
      status: 200,
      body: {
        doi,
        available: true,
        fulltextAvailable: (evidence.evidenceLevel || evidence.fulltextStatus) === 'complete',
        evidenceAvailable: true,
        cached: true,
        state: 'published',
        source: 'scheduled_reviewed_evidence_v2',
        zh: scheduled.zh.trim(),
        en: scheduled.en.trim(),
        generatedAt: Number(scheduled.generatedAt || 0),
        reviewedAt: Number(scheduled.reviewedAt || scheduled.generatedAt || 0),
        sourceHash: evidence.sourceHash,
        evidencePacketHash: evidence.evidencePacketHash,
        evidenceLevel: evidence.evidenceLevel || evidence.fulltextStatus || 'unknown',
        model: '',
        modelSnapshot: '',
        promptVersion: String(scheduled.promptVersion || 'gallery-daily-summary-v1'),
        auditVersion: String(scheduled.auditVersion || 'gallery-daily-summary-audit-v1'),
      },
    };
  }

  const reviewed = await readApprovedSummary(env, doi, evidence);
  if (reviewed.state === 'approved') {
    const summary = reviewed.summary;
    return {
      status: 200,
      body: {
        doi,
        available: true,
        fulltextAvailable: (evidence.evidenceLevel || evidence.fulltextStatus) === 'complete',
        evidenceAvailable: true,
        cached: true,
        state: 'published',
        source: 'reviewed_evidence_v2',
        zh: summary.zh.trim(),
        en: summary.en.trim(),
        generatedAt: summary.generatedAt,
        reviewedAt: summary.reviewedAt || summary.generatedAt,
        sourceHash: evidence.sourceHash,
        evidencePacketHash: evidence.evidencePacketHash,
        evidenceLevel: evidence.evidenceLevel || evidence.fulltextStatus || 'unknown',
        model: summary.model || '',
        modelSnapshot: summary.modelSnapshot || '',
        promptVersion: summary.promptVersion || '',
        auditVersion: summary.auditVersion || '',
      },
    };
  }

  const reason = reviewed.state === 'stale'
    ? 'summary_stale'
    : reviewed.state === 'legacy_or_unapproved'
      ? 'summary_not_reviewed'
      : reviewed.state === 'invalid'
        ? 'summary_invalid'
        : 'scheduled_summary_pending';

  return {
    status: 200,
    body: {
      doi,
      available: false,
      fulltextAvailable: (evidence.evidenceLevel || evidence.fulltextStatus) === 'complete',
      evidenceAvailable: true,
      state: reviewed.state === 'stale' ? 'superseded' : 'evidence_ready',
      reason,
      sourceHash: evidence.sourceHash,
      evidencePacketHash: evidence.evidencePacketHash,
      capturedAt: evidence.capturedAt,
      evidenceLevel: evidence.evidenceLevel || evidence.fulltextStatus || 'unknown',
    },
  };
}

export async function getArticleEvidenceInventory(env) {
  if (!env?.MEDIA) return { status: 503, body: { error: 'summary_storage_unavailable' } };
  const items = [];
  let cursor;
  for (let pageNo = 0; pageNo < 10; pageNo += 1) {
    const page = await env.MEDIA.list({
      prefix: EVIDENCE_PREFIX,
      limit: 1000,
      ...(cursor ? { cursor } : {}),
      include: ['customMetadata'],
    });
    for (const object of page?.objects || []) {
      const meta = object?.customMetadata || {};
      const doi = normalizeDoi(meta.doi);
      if (!doi) continue;
      items.push({
        doi,
        available: true,
        schemaVersion: safeSingleLine(meta.schemaVersion || '', 80),
        sourceHash: safeSingleLine(meta.sourceHash || '', 80),
        evidencePacketHash: safeSingleLine(meta.evidencePacketHash || '', 80),
        publisher: safeSingleLine(meta.publisher || '', 40),
        capturedAt: safeSingleLine(meta.capturedAt || '', 80),
        textProcessingPolicy: safeSingleLine(meta.textProcessingPolicy || 'unknown', 80),
        evidenceLevel: safeSingleLine(meta.evidenceLevel || 'unknown', 40),
      });
    }
    if (!page?.truncated || !page?.cursor) break;
    cursor = page.cursor;
  }
  items.sort((a, b) => a.doi.localeCompare(b.doi));
  return {
    status: 200,
    body: {
      version: 1,
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      count: items.length,
      items,
    },
  };
}

export const ARTICLE_EVIDENCE_SCHEMA_VERSION = EVIDENCE_SCHEMA_VERSION;
export const ARTICLE_REVIEWED_SUMMARY_SCHEMA_VERSION = REVIEWED_SUMMARY_SCHEMA_VERSION;
