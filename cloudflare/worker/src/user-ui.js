import { normalizeDoi } from './media.js';

const FEEDBACK_KINDS = new Set(['toc', 'image', 'title', 'date', 'duplicate', 'classification', 'other']);
const ACCOUNT_MODES = new Set(['account-merge', 'account-save', 'account-pull']);
const MAX_LIBRARY_STATE_BYTES = 1_500_000;

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

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function authenticatedSession(env, rawToken) {
  const token = typeof rawToken === 'string' ? rawToken.trim() : '';
  if (!token || token.length > 512) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    'SELECT token_hash, user_id, expires_at FROM user_sessions WHERE token_hash = ?'
  ).bind(tokenHash).first();
  if (!row || Number(row.expires_at || 0) <= Date.now()) return null;
  return row;
}

function stateJson(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const json = JSON.stringify(value);
    if (new TextEncoder().encode(json).byteLength > MAX_LIBRARY_STATE_BYTES) return null;
    return json;
  } catch {
    return null;
  }
}

function parseState(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function byId(remote = [], local = [], localWins = false) {
  const map = new Map();
  const first = localWins ? remote : local;
  const second = localWins ? local : remote;
  for (const item of Array.isArray(first) ? first : []) if (item?.id) map.set(String(item.id), item);
  for (const item of Array.isArray(second) ? second : []) if (item?.id) map.set(String(item.id), item);
  return [...map.values()];
}

function union(remote = [], local = []) {
  return [...new Set([...(Array.isArray(remote) ? remote : []), ...(Array.isArray(local) ? local : [])].filter(value => typeof value === 'string' && value))];
}

function stringList(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter(item => typeof item === 'string' && item))];
}

function mergePaper(remote = {}, local = {}, localWins = false) {
  const remoteUpdatedAt = Number(remote?.updatedAt || 0);
  const localUpdatedAt = Number(local?.updatedAt || 0);
  const remoteNoteAt = Number(remote?.noteUpdatedAt || 0);
  const localNoteAt = Number(local?.noteUpdatedAt || 0);
  const lastOpenedAt = Math.max(Number(remote?.lastOpenedAt || 0), Number(local?.lastOpenedAt || 0)) || undefined;

  // Backward compatibility for records written before per-paper updatedAt existed.
  // Once either side has a timestamp, use last-write-wins for removable fields so
  // an explicit unsave/clear action cannot be resurrected by an older device.
  if (!remoteUpdatedAt && !localUpdatedAt) {
    const noteSource = localNoteAt > remoteNoteAt ? local : remote;
    const base = localWins ? { ...remote, ...local } : { ...local, ...remote };
    return {
      ...base,
      favorite: Boolean(remote?.favorite || local?.favorite),
      collections: union(remote?.collections, local?.collections),
      quickTerms: union(remote?.quickTerms, local?.quickTerms),
      tags: union(remote?.tags, local?.tags),
      note: typeof noteSource?.note === 'string' ? noteSource.note : '',
      noteUpdatedAt: Math.max(remoteNoteAt, localNoteAt) || undefined,
      lastOpenedAt,
    };
  }

  const generalSource = remoteUpdatedAt === localUpdatedAt
    ? (localWins ? local : remote)
    : (localUpdatedAt > remoteUpdatedAt ? local : remote);
  const otherSource = generalSource === local ? remote : local;
  const noteSource = remoteNoteAt === localNoteAt
    ? generalSource
    : (localNoteAt > remoteNoteAt ? local : remote);
  const merged = {
    ...otherSource,
    ...generalSource,
    favorite: Boolean(generalSource?.favorite),
    collections: stringList(generalSource?.collections),
    quickTerms: stringList(generalSource?.quickTerms),
    tags: stringList(generalSource?.tags),
    note: typeof noteSource?.note === 'string' ? noteSource.note : '',
    noteUpdatedAt: Math.max(remoteNoteAt, localNoteAt) || undefined,
    updatedAt: Math.max(remoteUpdatedAt, localUpdatedAt) || undefined,
    lastOpenedAt,
  };
  if (typeof generalSource?.statusId === 'string' && generalSource.statusId) merged.statusId = generalSource.statusId;
  else delete merged.statusId;
  return merged;
}

function mergeStates(remote = {}, local = {}, localWins = false) {
  const papers = {};
  const ids = new Set([...Object.keys(remote?.papers || {}), ...Object.keys(local?.papers || {})]);
  for (const id of ids) papers[id] = mergePaper(remote?.papers?.[id], local?.papers?.[id], localWins);
  return {
    statuses: byId(remote?.statuses, local?.statuses, localWins),
    quickTerms: byId(remote?.quickTerms, local?.quickTerms, localWins),
    collections: byId(remote?.collections, local?.collections, localWins),
    aliases: byId(remote?.aliases, local?.aliases, localWins),
    actionStyles: localWins ? { ...(remote?.actionStyles || {}), ...(local?.actionStyles || {}) } : { ...(local?.actionStyles || {}), ...(remote?.actionStyles || {}) },
    papers,
    metadata: localWins ? { ...(remote?.metadata || {}), ...(local?.metadata || {}) } : { ...(local?.metadata || {}), ...(remote?.metadata || {}) },
    followedSearches: union(remote?.followedSearches, local?.followedSearches).slice(0, 100),
    searchHistory: union(remote?.searchHistory, local?.searchHistory).slice(0, 50),
    hideRead: localWins ? Boolean(local?.hideRead) : Boolean(remote?.hideRead),
  };
}

async function linkProfileToSession(env, profileId, session) {
  if (!profileId) return;
  await env.DB.prepare(
    `INSERT INTO user_profile_sessions (profile_id, user_id, session_token_hash, linked_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(profile_id) DO UPDATE SET
       user_id = excluded.user_id,
       session_token_hash = excluded.session_token_hash,
       linked_at = excluded.linked_at`
  ).bind(profileId, session.user_id, session.token_hash, Date.now()).run();

  const accountActor = `user:${session.user_id}`;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO paper_readers (doi, profile_id, first_read_at, first_status_id)
     SELECT doi, ?, first_read_at, first_status_id FROM paper_readers WHERE profile_id = ?`
  ).bind(accountActor, profileId).run();
  await env.DB.prepare('DELETE FROM paper_readers WHERE profile_id = ?').bind(profileId).run();
}

async function accountState(env, payload) {
  const session = await authenticatedSession(env, payload?.sessionToken);
  if (!session) return { status: 401, body: { error: 'not_authenticated' } };
  const profileId = normalizeProfileId(payload?.profileId);
  if (profileId) await linkProfileToSession(env, profileId, session);

  const mode = String(payload?.mode || '');
  const current = await env.DB.prepare(
    'SELECT state_json, revision, updated_at FROM user_library_state WHERE user_id = ?'
  ).bind(session.user_id).first();

  if (mode === 'account-pull') {
    const parsed = parseState(current?.state_json);
    return {
      status: 200,
      body: {
        account: {
          userId: session.user_id,
          revision: Number(current?.revision || 0),
          updatedAt: Number(current?.updated_at || 0),
          state: parsed || {},
        },
      },
    };
  }

  const incomingJson = stateJson(payload?.state);
  if (!incomingJson) return { status: 400, body: { error: 'invalid_or_oversized_library_state' } };
  const incoming = JSON.parse(incomingJson);
  const now = Date.now();

  if (mode === 'account-merge') {
    const existing = parseState(current?.state_json);
    const merged = existing ? mergeStates(existing, incoming, false) : incoming;
    const mergedJson = stateJson(merged);
    if (!mergedJson) return { status: 400, body: { error: 'merged_library_state_too_large' } };
    const nextRevision = Number(current?.revision || 0) + 1;
    await env.DB.prepare(
      `INSERT INTO user_library_state (user_id, state_json, revision, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         state_json = excluded.state_json,
         revision = excluded.revision,
         updated_at = excluded.updated_at`
    ).bind(session.user_id, mergedJson, nextRevision, now).run();
    return { status: 200, body: { account: { userId: session.user_id, revision: nextRevision, updatedAt: now, state: merged } } };
  }

  const expectedRevision = Number(payload?.revision || 0);
  const currentRevision = Number(current?.revision || 0);
  if (current && expectedRevision !== currentRevision) {
    return {
      status: 409,
      body: {
        error: 'library_state_conflict',
        account: {
          userId: session.user_id,
          revision: currentRevision,
          updatedAt: Number(current.updated_at || 0),
          state: parseState(current.state_json) || {},
        },
      },
    };
  }

  const nextRevision = currentRevision + 1;
  await env.DB.prepare(
    `INSERT INTO user_library_state (user_id, state_json, revision, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       state_json = excluded.state_json,
       revision = excluded.revision,
       updated_at = excluded.updated_at`
  ).bind(session.user_id, incomingJson, nextRevision, now).run();
  return { status: 200, body: { account: { userId: session.user_id, revision: nextRevision, updatedAt: now, state: incoming } } };
}

export async function readerCounts(env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'D1 binding DB is not configured.' } };
  const mode = typeof payload?.mode === 'string' ? payload.mode : '';
  if (ACCOUNT_MODES.has(mode)) return accountState(env, payload);

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
  const linked = await env.DB.prepare(
    `SELECT p.user_id
     FROM user_profile_sessions p
     JOIN user_sessions s ON s.token_hash = p.session_token_hash AND s.user_id = p.user_id
     WHERE p.profile_id = ? AND s.expires_at > ?`
  ).bind(profileId, now).first();
  const actorId = linked?.user_id ? `user:${linked.user_id}` : profileId;

  if (actorId !== profileId) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO paper_readers (doi, profile_id, first_read_at, first_status_id)
       SELECT doi, ?, first_read_at, first_status_id FROM paper_readers WHERE doi = ? AND profile_id = ?`
    ).bind(actorId, doi, profileId).run();
    await env.DB.prepare('DELETE FROM paper_readers WHERE doi = ? AND profile_id = ?').bind(doi, profileId).run();
  }

  await env.DB.prepare(
    `INSERT OR IGNORE INTO paper_readers (doi, profile_id, first_read_at, first_status_id)
     VALUES (?, ?, ?, ?)`
  ).bind(doi, actorId, now, statusId).run();
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