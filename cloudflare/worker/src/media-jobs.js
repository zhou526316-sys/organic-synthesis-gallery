import { normalizeDoi } from './media.js';
import { publisherForDoi } from '../../../shared/publishers.js';

const COVERAGE_STATES = new Set(['pending','retry_wait','audited_unresolved']);
const UPGRADE_STATES = new Set(['upgrade_wait']);
const LEASE_MS_DEFAULT = 8 * 60 * 1000;

function cleanOwner(value) {
  return String(value || '').trim().replace(/[^A-Za-z0-9._:-]+/g, '-').slice(0, 160);
}

function queueStateForMode(mode) {
  return mode === 'upgrade' ? UPGRADE_STATES : COVERAGE_STATES;
}

export async function seedMediaJobs(env, rawDois, { priority = 0 } = {}) {
  if (!env?.DB) return { seeded: 0 };
  const now = Date.now();
  const rows = [...new Set((rawDois || []).map(normalizeDoi).filter(Boolean))];
  const statements = rows.map(doi => env.DB.prepare(
    `INSERT INTO media_jobs
      (doi, publisher, mode, state, priority, attempts, last_attempt_at, next_retry_at, lease_owner, lease_expires_at, last_failure_reason, visual_kind, visual_source, confidence, created_at, updated_at)
     VALUES (?, ?, 'coverage', 'pending', ?, 0, 0, 0, NULL, 0, NULL, NULL, NULL, 0, ?, ?)
     ON CONFLICT(doi) DO UPDATE SET
       priority = MAX(media_jobs.priority, excluded.priority),
       updated_at = CASE WHEN media_jobs.state = 'resolved' THEN media_jobs.updated_at ELSE excluded.updated_at END`
  ).bind(doi, publisherForDoi(doi), Number(priority) || 0, now, now));
  for (let offset = 0; offset < statements.length; offset += 80) {
    await env.DB.batch(statements.slice(offset, offset + 80));
  }
  return { seeded: rows.length };
}

async function releaseExpiredLeases(env, now = Date.now()) {
  await env.DB.prepare(
    `UPDATE media_jobs SET
       state = CASE WHEN mode = 'upgrade' THEN 'upgrade_wait' ELSE 'retry_wait' END,
       lease_owner = NULL,
       lease_expires_at = 0,
       last_failure_reason = COALESCE(last_failure_reason, 'lease_expired'),
       next_retry_at = MIN(next_retry_at, ?),
       updated_at = ?
     WHERE state IN ('leased','processing') AND lease_expires_at > 0 AND lease_expires_at <= ?`
  ).bind(now, now, now).run();
}

export async function claimMediaJobs(env, payload = {}) {
  if (!env?.DB) return { status: 503, body: { error: 'D1 binding DB is not configured.' } };
  const owner = cleanOwner(payload.owner);
  if (!owner) return { status: 400, body: { error: 'lease owner is required' } };
  const mode = payload.mode === 'upgrade' ? 'upgrade' : 'coverage';
  const limit = Math.max(1, Math.min(50, Number(payload.limit) || 4));
  const leaseMs = Math.max(60_000, Math.min(30 * 60_000, Number(payload.leaseMs) || LEASE_MS_DEFAULT));
  const now = Date.now();
  await releaseExpiredLeases(env, now);

  const allowed = [...queueStateForMode(mode)];
  const placeholders = allowed.map(() => '?').join(',');
  const due = await env.DB.prepare(
    `SELECT doi FROM media_jobs
     WHERE mode = ? AND state IN (${placeholders}) AND next_retry_at <= ?
     ORDER BY priority DESC, next_retry_at ASC, attempts ASC, created_at ASC
     LIMIT ?`
  ).bind(mode, ...allowed, now, limit).all();

  const expires = now + leaseMs;
  const statements = (due?.results || []).map(row => env.DB.prepare(
    `UPDATE media_jobs SET state = 'leased', lease_owner = ?, lease_expires_at = ?, updated_at = ?
     WHERE doi = ? AND mode = ? AND state IN (${placeholders}) AND next_retry_at <= ?`
  ).bind(owner, expires, now, row.doi, mode, ...allowed, now));
  if (statements.length) await env.DB.batch(statements);

  const claimed = await env.DB.prepare(
    `SELECT doi, publisher, mode, state, priority, attempts, last_attempt_at, next_retry_at,
            lease_owner, lease_expires_at, last_failure_reason, visual_kind, visual_source, confidence
     FROM media_jobs
     WHERE lease_owner = ? AND lease_expires_at = ? AND state = 'leased'
     ORDER BY priority DESC, attempts ASC, doi
     LIMIT ?`
  ).bind(owner, expires, limit).all();
  return { status: 200, body: { owner, mode, leaseExpiresAt: expires, items: claimed?.results || [] } };
}

export async function startMediaJob(env, payload = {}) {
  const doi = normalizeDoi(payload.doi);
  const owner = cleanOwner(payload.owner);
  if (!doi || !owner) return { status: 400, body: { error: 'doi and owner are required' } };
  const now = Date.now();
  const leaseMs = Math.max(60_000, Math.min(30 * 60_000, Number(payload.leaseMs) || LEASE_MS_DEFAULT));
  const result = await env.DB.prepare(
    `UPDATE media_jobs SET state = 'processing', lease_expires_at = ?, last_attempt_at = ?, attempts = attempts + 1, updated_at = ?
     WHERE doi = ? AND state = 'leased' AND lease_owner = ? AND lease_expires_at > ?`
  ).bind(now + leaseMs, now, now, doi, owner, now).run();
  return Number(result?.meta?.changes || 0)
    ? { status: 200, body: { doi, state: 'processing', leaseExpiresAt: now + leaseMs } }
    : { status: 409, body: { error: 'lease_not_owned_or_expired', doi } };
}

export async function completeMediaJob(env, payload = {}) {
  const doi = normalizeDoi(payload.doi);
  const owner = cleanOwner(payload.owner);
  const visualKind = String(payload.visualKind || '').slice(0, 80);
  const visualSource = String(payload.visualSource || '').slice(0, 160);
  const confidence = Math.max(0, Math.min(100, Math.round(Number(payload.confidence) || 0)));
  if (!doi || !owner || !visualKind) return { status: 400, body: { error: 'doi, owner and visualKind are required' } };
  const now = Date.now();
  const official = visualKind === 'official_visual';
  const state = official ? 'resolved' : 'upgrade_wait';
  const mode = official ? 'coverage' : 'upgrade';
  const nextRetryAt = official ? 0 : now + 7 * 24 * 60 * 60 * 1000;
  const result = await env.DB.prepare(
    `UPDATE media_jobs SET
       mode = ?, state = ?, next_retry_at = ?, lease_owner = NULL, lease_expires_at = 0,
       last_failure_reason = NULL, visual_kind = ?, visual_source = ?, confidence = ?, updated_at = ?
     WHERE doi = ? AND state IN ('leased','processing') AND lease_owner = ? AND lease_expires_at > ?`
  ).bind(mode, state, nextRetryAt, visualKind, visualSource || null, confidence, now, doi, owner, now).run();
  return Number(result?.meta?.changes || 0)
    ? { status: 200, body: { doi, state, mode, nextRetryAt } }
    : { status: 409, body: { error: 'lease_not_owned_or_expired', doi } };
}

export async function failMediaJob(env, payload = {}) {
  const doi = normalizeDoi(payload.doi);
  const owner = cleanOwner(payload.owner);
  if (!doi || !owner) return { status: 400, body: { error: 'doi and owner are required' } };
  const reason = String(payload.reason || 'resolver_failed').slice(0, 500);
  const now = Date.now();
  const manual = payload.manualRequired === true || reason === 'manual_required';
  const audited = payload.auditedUnresolved === true;
  const current = await env.DB.prepare('SELECT mode, attempts FROM media_jobs WHERE doi = ?').bind(doi).first();
  const mode = current?.mode === 'upgrade' ? 'upgrade' : 'coverage';
  const attempts = Number(current?.attempts || 0);
  let state = manual ? 'manual_required' : audited ? 'audited_unresolved' : (mode === 'upgrade' ? 'upgrade_wait' : 'retry_wait');
  const defaultDelay = mode === 'upgrade'
    ? 7 * 24 * 60 * 60 * 1000
    : Math.min(24 * 60 * 60 * 1000, Math.max(10 * 60 * 1000, 5 * 60 * 1000 * 2 ** Math.min(6, attempts)));
  const retryMs = manual ? 0 : Math.max(60_000, Number(payload.retryMs) || defaultDelay);
  const result = await env.DB.prepare(
    `UPDATE media_jobs SET state = ?, next_retry_at = ?, lease_owner = NULL, lease_expires_at = 0,
       last_failure_reason = ?, updated_at = ?
     WHERE doi = ? AND state IN ('leased','processing') AND lease_owner = ?`
  ).bind(state, manual ? 0 : now + retryMs, reason, now, doi, owner).run();
  return Number(result?.meta?.changes || 0)
    ? { status: 200, body: { doi, state, nextRetryAt: manual ? 0 : now + retryMs } }
    : { status: 409, body: { error: 'lease_not_owned', doi } };
}

export async function resumeManualJob(env, payload = {}) {
  const doi = normalizeDoi(payload.doi);
  if (!doi) return { status: 400, body: { error: 'valid DOI required' } };
  const now = Date.now();
  const result = await env.DB.prepare(
    `UPDATE media_jobs SET state = CASE WHEN mode = 'upgrade' THEN 'upgrade_wait' ELSE 'pending' END,
       next_retry_at = 0, last_failure_reason = NULL, updated_at = ?
     WHERE doi = ? AND state = 'manual_required'`
  ).bind(now, doi).run();
  return { status: 200, body: { doi, resumed: Number(result?.meta?.changes || 0) > 0 } };
}

export async function mediaJobStatus(env) {
  if (!env?.DB) return { status: 503, body: { error: 'D1 binding DB is not configured.' } };
  const now = Date.now();
  await releaseExpiredLeases(env, now);
  const [summary, publishers, active, recent] = await Promise.all([
    env.DB.prepare('SELECT mode, state, COUNT(*) AS count FROM media_jobs GROUP BY mode, state').all(),
    env.DB.prepare(
      `SELECT publisher, state, COUNT(*) AS count, MAX(updated_at) AS last_updated
       FROM media_jobs GROUP BY publisher, state`
    ).all(),
    env.DB.prepare(
      `SELECT doi, publisher, mode, state, lease_owner, lease_expires_at
       FROM media_jobs WHERE state IN ('leased','processing') AND lease_expires_at > ?
       ORDER BY lease_expires_at ASC LIMIT 100`
    ).bind(now).all(),
    env.DB.prepare(
      `SELECT doi, publisher, mode, state, attempts, last_attempt_at, next_retry_at,
              last_failure_reason, visual_kind, visual_source, confidence, updated_at
       FROM media_jobs ORDER BY updated_at DESC LIMIT 200`
    ).all(),
  ]);
  return {
    status: 200,
    body: {
      updatedAt: now,
      summary: summary?.results || [],
      publishers: publishers?.results || [],
      activeLeases: active?.results || [],
      recent: recent?.results || [],
    },
  };
}
