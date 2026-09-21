import { normalizeDoi } from './media.js';

const FEEDBACK_KINDS = new Set(['toc', 'image', 'title', 'date', 'duplicate', 'classification', 'other']);
const SITE_FEEDBACK_CATEGORIES = new Set(['general', 'search', 'ui', 'account', 'literature', 'other']);
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

function requestReaderIp(request) {
  const value = request?.headers?.get?.('CF-Connecting-IP')?.trim() || '';
  if (!value || value.length > 96 || /\s/.test(value)) return '';
  return value;
}

async function readerIpActor(env, request) {
  const ip = requestReaderIp(request);
  const secret = typeof env?.READER_HASH_SECRET === 'string' && env.READER_HASH_SECRET.trim()
    ? env.READER_HASH_SECRET.trim()
    : (typeof env?.BRIDGE_WRITE_TOKEN === 'string' ? env.BRIDGE_WRITE_TOKEN.trim() : '');
  if (!ip || !secret) return '';
  return `ip:${await sha256Hex(`${secret}\n${ip}`)}`;
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

async function writeMaterializedReaderStates(env, rows) {
  if (!rows.length) return;
  const now = Date.now();
  const statements = rows.map(({ doi, legacyFloor, ipCount }) =>
    env.DB.prepare(
      `INSERT OR IGNORE INTO paper_reader_counts_v2 (doi, legacy_floor, ip_count, updated_at)
       VALUES (?, ?, ?, ?)`
    ).bind(doi, legacyFloor, ipCount, now)
  );
  if (typeof env.DB.batch === 'function') {
    await env.DB.batch(statements);
    return;
  }
  await Promise.all(statements.map(statement => statement.run()));
}

function publicReaderCount(state) {
  return Math.max(0, Number(state?.legacyFloor || 0), Number(state?.ipCount || 0));
}

async function materializedReaderStates(env, dois) {
  const states = {};
  for (let offset = 0; offset < dois.length; offset += 80) {
    const chunk = dois.slice(offset, offset + 80);
    const placeholders = chunk.map(() => '?').join(',');
    const cached = await env.DB.prepare(
      `SELECT doi, legacy_floor, ip_count
       FROM paper_reader_counts_v2
       WHERE doi IN (${placeholders})`
    ).bind(...chunk).all();

    for (const row of cached?.results || []) {
      if (typeof row?.doi !== 'string') continue;
      states[row.doi] = {
        legacyFloor: Math.max(0, Number(row.legacy_floor || 0)),
        ipCount: Math.max(0, Number(row.ip_count || 0)),
      };
    }

    const missing = chunk.filter(doi => !Object.prototype.hasOwnProperty.call(states, doi));
    if (!missing.length) continue;

    const missingPlaceholders = missing.map(() => '?').join(',');
    const source = await env.DB.prepare(
      `SELECT
         doi,
         SUM(CASE WHEN profile_id NOT LIKE 'ip:%' THEN 1 ELSE 0 END) AS legacy_floor,
         SUM(CASE WHEN profile_id LIKE 'ip:%' THEN 1 ELSE 0 END) AS ip_count
       FROM paper_readers
       WHERE doi IN (${missingPlaceholders})
       GROUP BY doi`
    ).bind(...missing).all();

    const sourceStates = Object.fromEntries(
      (source?.results || [])
        .filter(row => typeof row?.doi === 'string')
        .map(row => [row.doi, {
          legacyFloor: Math.max(0, Number(row.legacy_floor || 0)),
          ipCount: Math.max(0, Number(row.ip_count || 0)),
        }])
    );

    const materialized = missing.map(doi => ({
      doi,
      legacyFloor: sourceStates[doi]?.legacyFloor || 0,
      ipCount: sourceStates[doi]?.ipCount || 0,
    }));
    await writeMaterializedReaderStates(env, materialized);
    for (const item of materialized) {
      states[item.doi] = { legacyFloor: item.legacyFloor, ipCount: item.ipCount };
    }
  }
  return states;
}

export async function readerCounts(env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'D1 binding DB is not configured.' } };
  const mode = typeof payload?.mode === 'string' ? payload.mode : '';
  if (ACCOUNT_MODES.has(mode)) return accountState(env, payload);

  const dois = [...new Set((Array.isArray(payload?.dois) ? payload.dois : [])
    .map(normalizeDoi)
    .filter(Boolean))].slice(0, 150);
  if (!dois.length) return { status: 200, body: { counts: {} } };

  const states = await materializedReaderStates(env, dois);
  const counts = Object.fromEntries(dois.map(doi => [doi, publicReaderCount(states[doi])]));
  return { status: 200, body: { counts } };
}

export async function markReader(env, payload, request) {
  if (!env?.DB) return { status: 503, body: { error: 'D1 binding DB is not configured.' } };
  const doi = normalizeDoi(payload?.doi);
  if (!doi) return { status: 400, body: { error: 'invalid_reader_mark' } };

  const actorId = await readerIpActor(env, request);
  if (!actorId) return { status: 400, body: { error: 'reader_ip_unavailable' } };

  const initialStates = await materializedReaderStates(env, [doi]);
  const initial = initialStates[doi] || { legacyFloor: 0, ipCount: 0 };
  const now = Date.now();
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO paper_readers (doi, profile_id, first_read_at, first_status_id)
     VALUES (?, ?, ?, 'card-open')`
  ).bind(doi, actorId, now).run();
  const unique = Number(inserted?.meta?.changes || 0) > 0;

  let state = initial;
  if (unique) {
    await env.DB.prepare(
      `UPDATE paper_reader_counts_v2
       SET ip_count = ip_count + 1, updated_at = ?
       WHERE doi = ?`
    ).bind(now, doi).run();
    const row = await env.DB.prepare(
      `SELECT legacy_floor, ip_count
       FROM paper_reader_counts_v2
       WHERE doi = ?`
    ).bind(doi).first();
    state = row
      ? {
          legacyFloor: Math.max(0, Number(row.legacy_floor || 0)),
          ipCount: Math.max(0, Number(row.ip_count || 0)),
        }
      : { ...initial, ipCount: initial.ipCount + 1 };
  }

  return {
    status: 200,
    body: {
      doi,
      count: publicReaderCount(state),
      unique,
    },
  };
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

function cleanFeedbackText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function boundedDimension(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 10000 ? Math.round(number) : 0;
}

const SITE_FEEDBACK_R2_PREFIX = 'private/site-feedback/open/';
const SITE_FEEDBACK_STATUSES = new Set(['open', 'reviewed', 'dismissed']);

function siteFeedbackR2Prefix(status) {
  return `private/site-feedback/${status}/`;
}

function feedbackHourBucket(timestamp) {
  const date = new Date(timestamp);
  const pad = value => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}`;
}

async function feedbackProfileToken(profileId) {
  return (await sha256Hex(profileId)).slice(0, 24);
}

async function fallbackFeedbackObjectsForWindow(env, profileId, now) {
  if (!env?.MEDIA) return [];
  const token = await feedbackProfileToken(profileId);
  const buckets = [...new Set([feedbackHourBucket(now), feedbackHourBucket(now - 60 * 60 * 1000)])];
  const objects = [];
  for (const bucket of buckets) {
    const listed = await env.MEDIA.list({
      prefix: `${SITE_FEEDBACK_R2_PREFIX}${token}/${bucket}/`,
      limit: 12,
    });
    objects.push(...(listed?.objects || []));
  }
  return objects;
}

async function storeSiteFeedbackFallback(env, record) {
  if (!env?.MEDIA) {
    return { status: 503, body: { error: 'feedback_storage_unavailable' } };
  }

  const windowStart = record.createdAt - 60 * 60 * 1000;
  const recentObjects = await fallbackFeedbackObjectsForWindow(env, record.profileId, record.createdAt);
  let recentCount = 0;
  for (const item of recentObjects) {
    const object = await env.MEDIA.get(item.key);
    if (!object) continue;
    try {
      const parsed = JSON.parse(await object.text());
      if (Number(parsed?.createdAt || 0) >= windowStart) recentCount += 1;
    } catch {}
  }
  if (recentCount >= 5) {
    return { status: 429, body: { error: 'feedback_rate_limited', retryAfterSeconds: 3600 } };
  }

  const token = await feedbackProfileToken(record.profileId);
  const fallbackId = crypto.randomUUID();
  const key = `${SITE_FEEDBACK_R2_PREFIX}${token}/${feedbackHourBucket(record.createdAt)}/${record.createdAt}-${fallbackId}.json`;
  const stored = {
    fallbackId,
    category: record.category,
    message: record.message,
    pagePath: record.pagePath,
    language: record.language,
    context: record.context,
    status: 'open',
    createdAt: record.createdAt,
  };
  await env.MEDIA.put(key, JSON.stringify(stored), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: { kind: 'site-feedback', status: 'open' },
  });
  return {
    status: 200,
    body: {
      accepted: true,
      id: `r2:${fallbackId}`,
      storage: 'r2-fallback',
    },
  };
}

export async function submitSiteFeedback(env, payload) {
  const profileId = normalizeProfileId(payload?.profileId);
  const rawCategory = cleanFeedbackText(payload?.category, 32).toLowerCase();
  const category = SITE_FEEDBACK_CATEGORIES.has(rawCategory) ? rawCategory : 'general';
  const message = cleanFeedbackText(payload?.message, 2000);
  const pagePath = cleanFeedbackText(payload?.pagePath, 400);
  const language = cleanFeedbackText(payload?.language, 16);
  const searchQuery = cleanFeedbackText(payload?.searchQuery, 300);

  if (!profileId) return { status: 400, body: { error: 'invalid_profile_id' } };
  if (message.length < 3) return { status: 400, body: { error: 'feedback_too_short' } };

  const now = Date.now();
  const context = {
    searchQuery,
    viewportWidth: boundedDimension(payload?.viewportWidth),
    viewportHeight: boundedDimension(payload?.viewportHeight),
  };
  const record = { profileId, category, message, pagePath, language, context, createdAt: now };

  if (env?.DB) {
    try {
      const windowStart = now - 60 * 60 * 1000;
      const recent = await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM site_feedback WHERE profile_id = ? AND created_at >= ?'
      ).bind(profileId, windowStart).first();
      if (Number(recent?.count || 0) >= 5) {
        return { status: 429, body: { error: 'feedback_rate_limited', retryAfterSeconds: 3600 } };
      }

      const result = await env.DB.prepare(
        `INSERT INTO site_feedback (profile_id, category, message, page_path, language, context_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`
      ).bind(profileId, category, message, pagePath || null, language || null, JSON.stringify(context), now).run();

      return {
        status: 200,
        body: {
          accepted: true,
          id: result?.meta?.last_row_id || null,
          storage: 'd1',
        },
      };
    } catch (error) {
      console.warn('SITE_FEEDBACK_D1_FALLBACK', JSON.stringify({
        message: String(error?.message || error).slice(0, 300),
      }));
    }
  }

  try {
    return await storeSiteFeedbackFallback(env, record);
  } catch (error) {
    console.error('SITE_FEEDBACK_R2_FALLBACK_FAILED', JSON.stringify({
      message: String(error?.message || error).slice(0, 300),
    }));
    return { status: 503, body: { error: 'feedback_storage_unavailable' } };
  }
}

async function r2OpenSiteFeedback(env, limit) {
  if (!env?.MEDIA) return [];
  const rows = [];
  let cursor;
  do {
    const listed = await env.MEDIA.list({
      prefix: SITE_FEEDBACK_R2_PREFIX,
      limit: Math.min(1000, Math.max(100, limit * 2)),
      ...(cursor ? { cursor } : {}),
    });
    const objects = listed?.objects || [];
    for (let offset = 0; offset < objects.length && rows.length < limit; offset += 25) {
      const batch = objects.slice(offset, offset + 25);
      const loaded = await Promise.all(batch.map(async item => {
        const object = await env.MEDIA.get(item.key);
        if (!object) return null;
        try {
          const parsed = JSON.parse(await object.text());
          if (parsed?.status !== 'open') return null;
          return {
            id: `r2:${parsed.fallbackId || item.key}`,
            source: 'r2-fallback',
            category: parsed.category || 'general',
            message: parsed.message || '',
            pagePath: parsed.pagePath || '',
            language: parsed.language || '',
            context: parsed.context && typeof parsed.context === 'object' ? parsed.context : {},
            createdAt: Number(parsed.createdAt || 0),
          };
        } catch {
          return null;
        }
      }));
      rows.push(...loaded.filter(Boolean));
    }
    cursor = listed?.truncated ? listed.cursor : undefined;
  } while (cursor && rows.length < limit);
  return rows;
}

export async function exportOpenSiteFeedback(env, limit = 300) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 300));
  const rows = [];
  let d1Available = false;
  let d1Error = '';

  if (env?.DB) {
    try {
      const result = await env.DB.prepare(
        `SELECT id, category, message, page_path, language, context_json, created_at
         FROM site_feedback WHERE status = 'open' ORDER BY created_at DESC LIMIT ?`
      ).bind(safeLimit).all();
      d1Available = true;
      for (const row of result?.results || []) {
        let context = {};
        try { context = row.context_json ? JSON.parse(row.context_json) : {}; } catch {}
        rows.push({
          id: Number(row.id),
          source: 'd1',
          category: row.category,
          message: row.message,
          pagePath: row.page_path || '',
          language: row.language || '',
          context,
          createdAt: Number(row.created_at || 0),
        });
      }
    } catch (error) {
      d1Error = String(error?.message || error).slice(0, 300);
      console.warn('SITE_FEEDBACK_EXPORT_D1_UNAVAILABLE', JSON.stringify({ message: d1Error }));
    }
  }

  const fallback = await r2OpenSiteFeedback(env, safeLimit);
  const feedback = [...rows, ...fallback]
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, safeLimit);

  return {
    status: 200,
    body: {
      generatedAt: new Date().toISOString(),
      scope: 'open-site-feedback',
      count: feedback.length,
      sources: {
        d1: { available: d1Available, count: rows.length, error: d1Error || undefined },
        r2Fallback: { available: Boolean(env?.MEDIA), count: fallback.length },
      },
      feedback,
    },
  };
}


async function findR2SiteFeedback(env, fallbackId) {
  if (!env?.MEDIA || !fallbackId) return null;
  let cursor;
  do {
    const listed = await env.MEDIA.list({
      prefix: SITE_FEEDBACK_R2_PREFIX,
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    for (const item of listed?.objects || []) {
      const object = await env.MEDIA.get(item.key);
      if (!object) continue;
      try {
        const parsed = JSON.parse(await object.text());
        if (String(parsed?.fallbackId || '') === fallbackId) {
          return { key: item.key, parsed };
        }
      } catch {}
    }
    cursor = listed?.truncated ? listed.cursor : undefined;
  } while (cursor);
  return null;
}

async function updateR2SiteFeedbackStatus(env, fallbackId, status) {
  const found = await findR2SiteFeedback(env, fallbackId);
  if (!found) return false;
  if (status === 'open') return true;

  const targetKey = found.key.replace(SITE_FEEDBACK_R2_PREFIX, siteFeedbackR2Prefix(status));
  const stored = {
    ...found.parsed,
    status,
    updatedAt: Date.now(),
  };
  await env.MEDIA.put(targetKey, JSON.stringify(stored), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: { kind: 'site-feedback', status },
  });
  await env.MEDIA.delete(found.key);
  return true;
}

export async function updateSiteFeedbackStatuses(env, payload) {
  const updates = Array.isArray(payload?.updates) ? payload.updates.slice(0, 100) : [];
  if (!updates.length) return { status: 400, body: { error: 'feedback_updates_required' } };

  const results = [];
  for (const entry of updates) {
    const status = typeof entry?.status === 'string' ? entry.status.trim().toLowerCase() : '';
    if (!SITE_FEEDBACK_STATUSES.has(status)) {
      results.push({ id: entry?.id ?? null, ok: false, error: 'invalid_status' });
      continue;
    }

    const id = entry?.id;
    if (typeof id === 'string' && id.startsWith('r2:')) {
      try {
        const fallbackId = id.slice(3).trim();
        const ok = await updateR2SiteFeedbackStatus(env, fallbackId, status);
        results.push({ id, ok, status, error: ok ? undefined : 'feedback_not_found' });
      } catch (error) {
        results.push({
          id,
          ok: false,
          status,
          error: String(error?.message || error).slice(0, 240),
        });
      }
      continue;
    }

    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      results.push({ id: id ?? null, ok: false, error: 'invalid_feedback_id' });
      continue;
    }
    if (!env?.DB) {
      results.push({ id: numericId, ok: false, status, error: 'd1_unavailable' });
      continue;
    }

    try {
      const result = await env.DB.prepare(
        'UPDATE site_feedback SET status = ? WHERE id = ?'
      ).bind(status, numericId).run();
      const changed = Number(result?.meta?.changes || 0);
      results.push({
        id: numericId,
        ok: changed > 0,
        status,
        error: changed > 0 ? undefined : 'feedback_not_found',
      });
    } catch (error) {
      results.push({
        id: numericId,
        ok: false,
        status,
        error: String(error?.message || error).slice(0, 240),
      });
    }
  }

  const updated = results.filter(item => item.ok).length;
  return {
    status: 200,
    body: {
      updated,
      failed: results.length - updated,
      results,
    },
  };
}

