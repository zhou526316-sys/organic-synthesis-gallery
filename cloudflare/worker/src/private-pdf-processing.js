const PROCESSOR_REVISION = 'private-pdf-readable-v2';
const MAX_FILE_BYTES = 60 * 1024 * 1024;
const MAX_QUEUE_LIMIT = 12;
const ALLOWED_FAILURES = new Set([
  'catalog_record_missing',
  'pdf_invalid',
  'pdf_password',
  'parser_error',
  'doi_missing',
  'title_mismatch',
  'supplement_detected',
  'object_mismatch',
]);

function enabled(env, key) { return String(env?.[key] || '').trim() === '1'; }
function normalizeDoi(value) {
  const raw = String(value || '').trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '')
    .replace(/[).,;]+$/, '');
  return /^10\.\d{4,9}\/\S+$/.test(raw) ? raw : '';
}
function safeId(value) {
  const out = String(value || '');
  return /^[A-Za-z0-9_-]{1,128}$/.test(out) ? out : '';
}
function safeHash(value) {
  const out = String(value || '').toLowerCase();
  return /^[a-f0-9]{64}$/.test(out) ? out : '';
}
function boundedInt(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}
function result(status, body) { return { status, body }; }

function sourceClassForPdf(publisher, value) {
  let url;
  try { url = new URL(String(value || '')); } catch { return 'unknown'; }
  const path = (url.pathname + url.search).toLowerCase();
  const supplement = /(?:supporting|supplement|suppl|(?:^|[\/_-])si(?:[\/_\.-]|$)|suppl_file|suppinfo|esm(?:[\/_\.-]|$)|mmc(?:[\/_\.-]|$))/.test(path);
  if (supplement) return 'supplement';
  const p = String(publisher || '').toLowerCase();
  if (p === 'acs' && /\/doi\/(?:pdf|epdf)\//.test(path)) return 'article';
  if (p === 'wiley' && /\/doi\/(?:pdf|epdf|pdfdirect)\//.test(path)) return 'article';
  if (p === 'science' && /\/doi\/(?:pdf|epdf)\//.test(path)) return 'article';
  if (p === 'nature' && /\/articles\/[^/?]+\.pdf(?:$|\?)/.test(path)) return 'article';
  if (p === 'rsc' && (path.includes('articlepdf') || /\.pdf(?:$|\?)/.test(path))) return 'article';
  if (['elsevier','ccs'].includes(p) && /\.pdf(?:$|\?)/.test(path)) return 'article';
  return 'unknown';
}

async function latestCatalog(env, dois) {
  if (!env?.LITERATURE_INDEX_DB || !dois.length) return new Map();
  const generation = await env.LITERATURE_INDEX_DB.prepare(
    'SELECT catalog_id FROM literature_catalog_generations WHERE ready = 1 ORDER BY updated_at DESC LIMIT 1'
  ).first();
  if (!generation?.catalog_id) return new Map();
  const placeholders = dois.map(() => '?').join(',');
  const rows = await env.LITERATURE_INDEX_DB.prepare(
    `SELECT doi, title, authors_json, journal FROM literature_catalog_index
      WHERE catalog_id = ? AND doi IN (${placeholders}) ORDER BY doi`
  ).bind(generation.catalog_id, ...dois).all();
  const map = new Map();
  for (const row of rows?.results || []) {
    let authors = [];
    try { authors = JSON.parse(row.authors_json || '[]'); } catch {}
    map.set(String(row.doi || '').toLowerCase(), {
      title: String(row.title || '').slice(0, 20000),
      authors: Array.isArray(authors) ? authors.slice(0, 100).map(value => String(value || '').slice(0, 500)) : [],
      journal: String(row.journal || '').slice(0, 1000),
    });
  }
  return map;
}

export function privatePdfProcessorRevision() { return PROCESSOR_REVISION; }

export async function privatePdfProcessingStatus(env) {
  if (!env?.DB) return result(503, { error: 'database_not_configured' });
  const rows = await env.DB.prepare(
    `SELECT processing_state, active, COUNT(*) AS count
       FROM private_pdf_documents
      GROUP BY processing_state, active
      ORDER BY processing_state, active`
  ).all();
  const counts = { raw: 0, queued: 0, processing: 0, ready: 0, failed: 0, active: 0, total: 0 };
  for (const row of rows?.results || []) {
    const count = Number(row.count || 0);
    if (Object.hasOwn(counts, row.processing_state)) counts[row.processing_state] += count;
    if (Number(row.active || 0) === 1) counts.active += count;
    counts.total += count;
  }
  let verification = { verified: 0, failed: 0 };
  try {
    const verified = await env.DB.prepare(
      `SELECT
       COALESCE(SUM(CASE WHEN status='verified' THEN 1 ELSE 0 END),0) AS verified,
       COALESCE(SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END),0) AS failed
       FROM private_pdf_verifications`
    ).first();
    verification = { verified: Number(verified?.verified || 0), failed: Number(verified?.failed || 0) };
  } catch {}
  return result(200, {
    ok: true,
    processingEnabled: enabled(env, 'PRIVATE_PDF_PROCESSING_ENABLED'),
    processorRevision: PROCESSOR_REVISION,
    counts,
    verification,
  });
}

export async function listPrivatePdfProcessingQueue(request, env) {
  if (!env?.DB || !env?.PDF_PRIVATE) return result(503, { error: 'private_pdf_storage_unavailable' });
  if (!enabled(env, 'PRIVATE_PDF_PROCESSING_ENABLED')) return result(503, { error: 'private_pdf_processing_disabled' });
  const url = new URL(request.url);
  const allowed = new Set(['limit', 'retryFailed']);
  if ([...url.searchParams.keys()].some(key => !allowed.has(key))) return result(400, { error: 'private_pdf_processing_invalid_query' });
  const rawLimit = url.searchParams.get('limit');
  const limit = rawLimit === null ? 8 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_QUEUE_LIMIT) return result(400, { error: 'private_pdf_processing_invalid_limit' });
  const retryFailed = url.searchParams.get('retryFailed') === '1';
  if (url.searchParams.has('retryFailed') && !['0', '1'].includes(url.searchParams.get('retryFailed'))) {
    return result(400, { error: 'private_pdf_processing_invalid_retry_flag' });
  }
  const states = retryFailed ? "('raw','failed')" : "('raw')";
  const rows = await env.DB.prepare(
    `SELECT id, doi, publisher, source_url, version_kind, content_hash, byte_length, captured_at, processing_state
       FROM private_pdf_documents
      WHERE active = 0 AND processing_state IN ${states}
      ORDER BY captured_at ASC, id ASC
      LIMIT ?`
  ).bind(limit).all();
  const docs = rows?.results || [];
  const catalog = await latestCatalog(env, [...new Set(docs.map(row => String(row.doi || '').toLowerCase()))]);
  const items = docs.map(row => {
    const doi = normalizeDoi(row.doi);
    const id = safeId(row.id), contentHash = safeHash(row.content_hash);
    if (!doi || !id || !contentHash) throw new Error('private_pdf_processing_corrupt_row');
    return {
      documentId: id,
      doi,
      publisher: String(row.publisher || '').slice(0, 64),
      sourceKind: sourceClassForPdf(row.publisher, row.source_url),
      versionKind: String(row.version_kind || 'unknown').slice(0, 64),
      contentHash,
      byteLength: Number(row.byte_length || 0),
      capturedAt: Number(row.captured_at || 0),
      processingState: String(row.processing_state || 'raw'),
      catalog: catalog.get(doi) || null,
    };
  });
  return result(200, { ok: true, processorRevision: PROCESSOR_REVISION, count: items.length, items });
}

export async function servePrivatePdfProcessingFile(request, env) {
  if (!env?.DB || !env?.PDF_PRIVATE) return new Response('Not available', { status: 503 });
  if (!enabled(env, 'PRIVATE_PDF_PROCESSING_ENABLED')) return new Response('Not available', { status: 503 });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some(key => !['id', 'hash'].includes(key))) return new Response('Bad request', { status: 400 });
  const id = safeId(url.searchParams.get('id')), contentHash = safeHash(url.searchParams.get('hash'));
  if (!id || !contentHash) return new Response('Bad request', { status: 400 });
  const row = await env.DB.prepare(
    `SELECT id, doi, content_hash, r2_key, byte_length, processing_state, active
       FROM private_pdf_documents
      WHERE id = ? AND content_hash = ? LIMIT 1`
  ).bind(id, contentHash).first();
  if (!row || Number(row.active || 0) === 1 || !['raw', 'failed', 'processing'].includes(String(row.processing_state || ''))) {
    return new Response('Not found', { status: 404 });
  }
  const expectedSize = Number(row.byte_length || 0);
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > MAX_FILE_BYTES) return new Response('Conflict', { status: 409 });
  const head = await env.PDF_PRIVATE.head(row.r2_key);
  if (!head || Number(head.size || 0) !== expectedSize) return new Response('Conflict', { status: 409 });
  const storedHash = safeHash(head.customMetadata?.contentHash || '');
  if (storedHash && storedHash !== contentHash) return new Response('Conflict', { status: 409 });
  const object = await env.PDF_PRIVATE.get(row.r2_key);
  if (!object) return new Response('Not found', { status: 404 });
  const headers = new Headers({
    'content-type': 'application/pdf',
    'content-length': String(expectedSize),
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'x-private-pdf-document-id': id,
    'x-private-pdf-content-hash': contentHash,
  });
  return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
}

async function readDecision(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > 8192) return { error: result(413, { error: 'private_pdf_processing_body_too_large' }) };
  let text = '';
  try { text = await request.text(); } catch { return { error: result(400, { error: 'private_pdf_processing_invalid_json' }) }; }
  if (new TextEncoder().encode(text).byteLength > 8192) return { error: result(413, { error: 'private_pdf_processing_body_too_large' }) };
  let payload;
  try { payload = JSON.parse(text); } catch { return { error: result(400, { error: 'private_pdf_processing_invalid_json' }) }; }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { error: result(400, { error: 'private_pdf_processing_invalid_decision' }) };
  const allowed = new Set(['documentId', 'doi', 'contentHash', 'decision', 'processorRevision', 'evidence']);
  if (Object.keys(payload).some(key => !allowed.has(key))) return { error: result(400, { error: 'private_pdf_processing_unknown_field' }) };
  const evidence = payload.evidence;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return { error: result(400, { error: 'private_pdf_processing_invalid_evidence' }) };
  const evidenceAllowed = new Set(['pageCount', 'textChars', 'doiMatch', 'titleScoreMilli', 'metadataTitleScoreMilli', 'authorMatches', 'supplementMarker', 'reason']);
  if (Object.keys(evidence).some(key => !evidenceAllowed.has(key))) return { error: result(400, { error: 'private_pdf_processing_unknown_evidence_field' }) };
  const documentId = safeId(payload.documentId), doi = normalizeDoi(payload.doi), contentHash = safeHash(payload.contentHash);
  const decision = String(payload.decision || ''), processorRevision = String(payload.processorRevision || '');
  const pageCount = boundedInt(evidence.pageCount, 0, 100000);
  const textChars = boundedInt(evidence.textChars, 0, 1000000);
  const titleScoreMilli = boundedInt(evidence.titleScoreMilli, 0, 1000);
  const metadataTitleScoreMilli = boundedInt(evidence.metadataTitleScoreMilli, 0, 1000);
  const authorMatches = boundedInt(evidence.authorMatches, 0, 100);
  const doiMatch = evidence.doiMatch === true;
  const supplementMarker = evidence.supplementMarker === true;
  const reason = String(evidence.reason || '');
  if (!documentId || !doi || !contentHash || !['verified', 'failed'].includes(decision)
    || processorRevision !== PROCESSOR_REVISION
    || [pageCount, textChars, titleScoreMilli, metadataTitleScoreMilli, authorMatches].some(value => value === null)
    || typeof evidence.doiMatch !== 'boolean' || typeof evidence.supplementMarker !== 'boolean'
    || reason.length < 1 || reason.length > 160) {
    return { error: result(400, { error: 'private_pdf_processing_invalid_decision' }) };
  }
  if (decision === 'verified') {
    if (supplementMarker || pageCount < 1 || textChars < 64
      || Math.max(titleScoreMilli, metadataTitleScoreMilli) < 450 || reason !== 'verified_identity') {
      return { error: result(400, { error: 'private_pdf_processing_insufficient_identity_evidence' }) };
    }
  } else if (!ALLOWED_FAILURES.has(reason)) {
    return { error: result(400, { error: 'private_pdf_processing_invalid_failure_reason' }) };
  }
  return { value: { documentId, doi, contentHash, decision, processorRevision, pageCount, textChars, doiMatch,
    titleScoreMilli, metadataTitleScoreMilli, authorMatches, supplementMarker, reason } };
}

export async function applyPrivatePdfVerification(request, env) {
  if (!env?.DB) return result(503, { error: 'database_not_configured' });
  if (!enabled(env, 'PRIVATE_PDF_PROCESSING_ENABLED')) return result(503, { error: 'private_pdf_processing_disabled' });
  const parsed = await readDecision(request);
  if (parsed.error) return parsed.error;
  const value = parsed.value;
  const current = await env.DB.prepare(
    `SELECT id, doi, publisher, source_url, content_hash, processing_state, active
       FROM private_pdf_documents WHERE id = ? LIMIT 1`
  ).bind(value.documentId).first();
  if (!current || current.doi !== value.doi || current.content_hash !== value.contentHash) {
    return result(409, { error: 'private_pdf_processing_identity_conflict' });
  }
  const sourceKind = sourceClassForPdf(current.publisher, current.source_url);
  if (value.decision === 'verified') {
    const strongTitle = Math.max(value.titleScoreMilli, value.metadataTitleScoreMilli) >= 900;
    const sourceBackedTitle = sourceKind === 'article' && strongTitle;
    if (sourceKind === 'supplement' || value.supplementMarker || (!value.doiMatch && !sourceBackedTitle)) {
      return result(400, { error: 'private_pdf_processing_insufficient_identity_evidence' });
    }
  }
  if (Number(current.active || 0) === 1 || current.processing_state === 'ready') {
    if (value.decision === 'verified' && Number(current.active || 0) === 1 && current.processing_state === 'ready') {
      return result(200, { ok: true, idempotent: true, documentId: value.documentId, doi: value.doi, processingState: 'ready', active: true });
    }
    return result(409, { error: 'private_pdf_processing_already_verified' });
  }
  if (!['raw', 'failed', 'processing'].includes(String(current.processing_state || ''))) {
    return result(409, { error: 'private_pdf_processing_state_conflict' });
  }

  const desiredState = value.decision === 'verified' ? 'ready' : 'failed';
  const active = value.decision === 'verified' ? 1 : 0;
  const status = value.decision === 'verified' ? 'verified' : 'failed';
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE private_pdf_documents
          SET processing_state = ?, active = ?, updated_at = ?
        WHERE id = ? AND doi = ? AND content_hash = ? AND active = 0
          AND processing_state IN ('raw','failed','processing')`
    ).bind(desiredState, active, now, value.documentId, value.doi, value.contentHash),
    env.DB.prepare(
      `INSERT INTO private_pdf_verifications
       (document_id, content_hash, status, processor_revision, page_count, text_chars, doi_match,
        title_score_milli, metadata_title_score_milli, author_matches, supplement_marker, reason, checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(document_id) DO UPDATE SET
         content_hash=excluded.content_hash, status=excluded.status, processor_revision=excluded.processor_revision,
         page_count=excluded.page_count, text_chars=excluded.text_chars, doi_match=excluded.doi_match,
         title_score_milli=excluded.title_score_milli, metadata_title_score_milli=excluded.metadata_title_score_milli,
         author_matches=excluded.author_matches, supplement_marker=excluded.supplement_marker,
         reason=excluded.reason, checked_at=excluded.checked_at`
    ).bind(value.documentId, value.contentHash, status, value.processorRevision, value.pageCount, value.textChars,
      value.doiMatch ? 1 : 0, value.titleScoreMilli, value.metadataTitleScoreMilli, value.authorMatches,
      value.supplementMarker ? 1 : 0, value.reason, now),
  ]);
  const after = await env.DB.prepare(
    'SELECT processing_state, active FROM private_pdf_documents WHERE id = ? AND doi = ? AND content_hash = ? LIMIT 1'
  ).bind(value.documentId, value.doi, value.contentHash).first();
  if (!after || after.processing_state !== desiredState || Number(after.active || 0) !== active) {
    return result(409, { error: 'private_pdf_processing_commit_conflict' });
  }
  return result(200, { ok: true, idempotent: false, documentId: value.documentId, doi: value.doi,
    processingState: desiredState, active: active === 1, reason: value.reason, sourceKind });
}
