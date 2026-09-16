import { normalizeDoi } from './media.js';

const FEEDBACK_KINDS = new Set(['toc', 'image', 'title', 'date', 'duplicate', 'classification', 'other']);

function normalizeProfileId(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return /^[A-Za-z0-9._:-]{8,160}$/.test(trimmed) ? trimmed : '';
}

function normalizeStatusId(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return /^[A-Za-z0-9._:-]{1,160}$/.test(trimmed) ? trimmed : '';
}

export async function readerCounts(env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'D1 binding DB is not configured.' } };
  const dois = [...new Set((Array.isArray(payload?.dois) ? payload.dois : [])
    .map(normalizeDoi)
    .filter(Boolean))].slice(0, 150);
  if (!dois.length) return { status: 200, body: { counts: {} } };

  const counts = {};
  for (let offset = 0; offset < dois.length; offset += 80) {
    const chunk = dois.slice(offset, offset + 80);
    const placeholders = chunk.map(() => '?').join(',');
    const result = await env.DB.prepare(
      `SELECT doi, COUNT(*) AS count FROM paper_readers WHERE doi IN (${placeholders}) GROUP BY doi`
    ).bind(...chunk).all();
    for (const row of result?.results || []) {
      if (typeof row?.doi === 'string') counts[row.doi] = Number(row.count || 0);
    }
  }
  return { status: 200, body: { counts } };
}

export async function markReader(env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'D1 binding DB is not configured.' } };
  const doi = normalizeDoi(payload?.doi);
  const profileId = normalizeProfileId(payload?.profileId);
  const statusId = normalizeStatusId(payload?.statusId);
  if (!doi || !profileId || !statusId) return { status: 400, body: { error: 'invalid_reader_mark' } };

  const now = Date.now();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO paper_readers (doi, profile_id, first_read_at, first_status_id)
     VALUES (?, ?, ?, ?)`
  ).bind(doi, profileId, now, statusId).run();
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM paper_readers WHERE doi = ?').bind(doi).first();
  return { status: 200, body: { doi, count: Number(row?.count || 0) } };
}

export async function submitPaperFeedback(env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'D1 binding DB is not configured.' } };
  const doi = normalizeDoi(payload?.doi);
  const profileId = normalizeProfileId(payload?.profileId);
  const rawKind = typeof payload?.kind === 'string' ? payload.kind.trim().toLowerCase() : '';
  const kind = FEEDBACK_KINDS.has(rawKind) ? rawKind : 'other';
  const note = typeof payload?.note === 'string' ? payload.note.trim().slice(0, 1000) : '';
  if (!doi) return { status: 400, body: { error: 'invalid_doi' } };
  if (!profileId) return { status: 400, body: { error: 'invalid_profile_id' } };

  const result = await env.DB.prepare(
    `INSERT INTO paper_feedback (doi, profile_id, kind, note, status, created_at)
     VALUES (?, ?, ?, ?, 'open', ?)`
  ).bind(doi, profileId, kind, note || null, Date.now()).run();
  return { status: 200, body: { accepted: true, id: result?.meta?.last_row_id || null } };
}
