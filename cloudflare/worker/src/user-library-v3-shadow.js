import { normalizeDoi } from './media.js';
import {
  compareUserLibraryShadowPage,
  getUserLibraryShadowStatus,
  rebuildUserLibraryState,
  splitUserLibraryState,
  stableStateJson,
} from './user-library-shadow.js';

const MAX_BACKFILL_LIMIT = 50;
const MAX_COMPARE_LIMIT = 50;

const plainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function safeText(value, max = 1000) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}
function parseJson(value) {
  if (typeof value !== 'string' || !value) return null;
  try { return JSON.parse(value); } catch { return null; }
}
function flag(value) {
  return String(value || '') === '1';
}
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function runStatements(env, statements) {
  if (typeof env.DB.batch === 'function') return env.DB.batch(statements);
  const results = [];
  for (const statement of statements) results.push(await statement.run());
  return results;
}

export function userLibraryV3ShadowEnabled(env) {
  return flag(env?.USER_LIBRARY_V3_SHADOW_ENABLED)
    && !flag(env?.USER_LIBRARY_V3_WRITE_ENABLED);
}

async function sourceMeta(env, userId) {
  return env.DB.prepare(
    'SELECT revision,updated_at FROM user_library_state WHERE user_id=?'
  ).bind(userId).first();
}

async function sourceRow(env, userId) {
  return env.DB.prepare(
    'SELECT user_id,state_json,revision,updated_at FROM user_library_state WHERE user_id=?'
  ).bind(userId).first();
}

async function v3Head(env, userId) {
  return env.DB.prepare(`
    SELECT user_id,revision,updated_at,global_json,global_revision,paper_count,metadata_count,
      change_floor_revision,schema_version
    FROM user_library_v3_head WHERE user_id=?
  `).bind(userId).first();
}

async function v3Shape(env, userId) {
  return env.DB.prepare(
    'SELECT papers_split,metadata_split,revision FROM user_library_v3_shape WHERE user_id=?'
  ).bind(userId).first();
}

async function v3Rows(env, userId, revision) {
  const rows = await env.DB.prepare(`
    SELECT paper_key,doi,paper_present,paper_state_json,metadata_present,metadata_json,deleted,revision,updated_at
    FROM user_library_v3_rows
    WHERE user_id=? AND revision<=? AND deleted=0
    ORDER BY paper_key ASC
  `).bind(userId, revision).all();
  return rows?.results || [];
}

async function v3Sync(env, userId) {
  return env.DB.prepare(`
    SELECT source_revision,source_updated_at,source_state_hash,synced_at,last_error
    FROM user_library_v3_shadow_sync WHERE user_id=?
  `).bind(userId).first();
}

function rebuildV3State(head, shape, rows) {
  if (!head || !shape) throw new Error('user_library_v3_shadow_missing_head');
  const globalState = parseJson(head.global_json);
  if (!plainObject(globalState)) throw new Error('user_library_v3_shadow_global_invalid');
  const state = { ...globalState };
  if (Number(shape.papers_split || 0) === 1) state.papers = {};
  if (Number(shape.metadata_split || 0) === 1) state.metadata = {};
  for (const row of rows) {
    const key = safeText(row?.paper_key, 2000);
    if (!key || Number(row?.deleted || 0) === 1) continue;
    if (Number(shape.papers_split || 0) === 1 && Number(row?.paper_present || 0) === 1) {
      state.papers[key] = parseJson(row.paper_state_json);
    }
    if (Number(shape.metadata_split || 0) === 1 && Number(row?.metadata_present || 0) === 1) {
      state.metadata[key] = parseJson(row.metadata_json);
    }
  }
  return state;
}

function comparableRow(row) {
  return {
    doi: typeof row?.doi === 'string' && row.doi ? row.doi : null,
    paperPresent: Boolean(row?.paperPresent ?? Number(row?.paper_present || 0) === 1),
    paperStateJson: row?.paperStateJson ?? row?.paper_state_json ?? null,
    metadataPresent: Boolean(row?.metadataPresent ?? Number(row?.metadata_present || 0) === 1),
    metadataJson: row?.metadataJson ?? row?.metadata_json ?? null,
  };
}

function shadowRowDiff(oldRows, newRows) {
  const oldByKey = new Map((oldRows || []).map(row => [String(row.paper_key), comparableRow(row)]));
  const newByKey = new Map((newRows || []).map(row => [String(row.paperKey), comparableRow(row)]));
  const keys = [...new Set([...oldByKey.keys(), ...newByKey.keys()])].sort();
  const changes = [];
  const tombstones = [];
  for (const paperKey of keys) {
    const oldRow = oldByKey.get(paperKey);
    const newRow = newByKey.get(paperKey);
    if (oldRow && !newRow) {
      changes.push({
        paperKey,op:'delete',doi:oldRow.doi,
        paperPresent:false,paperStateJson:null,metadataPresent:false,metadataJson:null,
      });
      tombstones.push({ paperKey, doi:oldRow.doi });
      continue;
    }
    if (!newRow) continue;
    const same = oldRow
      && oldRow.doi === newRow.doi
      && oldRow.paperPresent === newRow.paperPresent
      && oldRow.paperStateJson === newRow.paperStateJson
      && oldRow.metadataPresent === newRow.metadataPresent
      && oldRow.metadataJson === newRow.metadataJson;
    if (!same) changes.push({ paperKey,op:'upsert',...newRow });
  }
  return { changes, tombstones };
}

function rowStatements(env, userId, split, revision, updatedAt, tombstones = []) {
  const claim = `EXISTS (
    SELECT 1 FROM user_library_v3_shadow_sync
    WHERE user_id=? AND inflight_revision=? AND source_revision<?
  )`;
  const statements = [
    env.DB.prepare(`
      DELETE FROM user_library_v3_rows
      WHERE user_id=? AND deleted=0 AND ${claim}
    `).bind(userId,userId,revision,revision),
  ];
  for (const row of split.rows || []) {
    statements.push(env.DB.prepare(`
      INSERT INTO user_library_v3_rows
        (user_id,paper_key,doi,paper_present,paper_state_json,metadata_present,metadata_json,deleted,revision,updated_at)
      SELECT ?,?,?,?,?,?,?,?,?,?
      WHERE ${claim}
      ON CONFLICT(user_id,paper_key) DO UPDATE SET
        doi=excluded.doi,
        paper_present=excluded.paper_present,
        paper_state_json=excluded.paper_state_json,
        metadata_present=excluded.metadata_present,
        metadata_json=excluded.metadata_json,
        deleted=excluded.deleted,
        revision=excluded.revision,
        updated_at=excluded.updated_at
      WHERE user_library_v3_rows.revision<=excluded.revision
        AND ${claim}
    `).bind(
      userId,
      row.paperKey,
      row.doi || normalizeDoi(row.paperKey) || null,
      row.paperPresent ? 1 : 0,
      row.paperStateJson,
      row.metadataPresent ? 1 : 0,
      row.metadataJson,
      0,
      revision,
      updatedAt,
      userId,revision,revision,
      userId,revision,revision,
    ));
  }
  for (const row of tombstones) {
    statements.push(env.DB.prepare(`
      INSERT INTO user_library_v3_rows
        (user_id,paper_key,doi,paper_present,paper_state_json,metadata_present,metadata_json,deleted,revision,updated_at)
      SELECT ?,?,?,0,NULL,0,NULL,1,?,?
      WHERE ${claim}
      ON CONFLICT(user_id,paper_key) DO UPDATE SET
        doi=excluded.doi,
        paper_present=0,
        paper_state_json=NULL,
        metadata_present=0,
        metadata_json=NULL,
        deleted=1,
        revision=excluded.revision,
        updated_at=excluded.updated_at
      WHERE user_library_v3_rows.revision<=excluded.revision
        AND ${claim}
    `).bind(
      userId,row.paperKey,row.doi,revision,updatedAt,
      userId,revision,revision,
      userId,revision,revision,
    ));
  }
  return statements;
}

export async function shadowWriteUserLibraryV3FromState(env, userIdValue, state, revisionValue, updatedAtValue, nowValue = Date.now()) {
  if (!userLibraryV3ShadowEnabled(env)) return { enabled:false, written:false };
  if (!env?.DB || typeof env.DB.batch !== 'function') throw new Error('user_library_v3_shadow_atomic_batch_required');
  const userId = safeText(userIdValue, 300);
  const revision = Number(revisionValue || 0);
  const updatedAt = Number(updatedAtValue || 0);
  const now = Number(nowValue || 0);
  if (!userId || !plainObject(state) || !Number.isSafeInteger(revision) || revision < 1
      || !Number.isFinite(updatedAt) || updatedAt <= 0 || !Number.isFinite(now) || now <= 0) {
    throw new Error('user_library_v3_shadow_input_invalid');
  }

  const split = await splitUserLibraryState(state);
  const current = await v3Sync(env, userId);
  const currentHead = await v3Head(env, userId);
  const currentRevision = Math.max(Number(current?.source_revision || 0), Number(currentHead?.revision || 0));
  if (currentRevision > revision) {
    return { enabled:true, written:false, skippedStale:true, currentRevision };
  }
  if (currentRevision === revision) {
    if (Number(current?.source_updated_at || 0) === updatedAt
        && String(current?.source_state_hash || '') === split.sourceStateHash) {
      return { enabled:true, written:false, unchanged:true, revision };
    }
    throw new Error('user_library_v3_shadow_revision_conflict');
  }

  const oldRows = currentRevision > 0 ? await v3Rows(env,userId,currentRevision) : [];
  const { changes, tombstones } = shadowRowDiff(oldRows,split.rows || []);
  const previousFloor = Number(currentHead?.change_floor_revision || 0);
  const changeFloorRevision = previousFloor > 0 ? previousFloor : revision;
  const globalChanged = String(currentHead?.global_json || '') !== split.globalJson;
  const globalRevision = globalChanged ? revision : Number(currentHead?.global_revision || revision);

  const claimCheck = `EXISTS (
    SELECT 1 FROM user_library_v3_shadow_sync
    WHERE user_id=? AND inflight_revision=? AND source_revision<?
  )`;
  const statements = [
    env.DB.prepare(`
      INSERT INTO user_library_v3_shadow_sync
        (user_id,source_revision,source_updated_at,source_state_hash,inflight_revision,inflight_started_at,synced_at,last_error)
      VALUES (?,0,0,'',?,?,0,'')
      ON CONFLICT(user_id) DO UPDATE SET
        inflight_revision=excluded.inflight_revision,
        inflight_started_at=excluded.inflight_started_at,
        last_error=''
      WHERE user_library_v3_shadow_sync.source_revision<excluded.inflight_revision
        AND user_library_v3_shadow_sync.inflight_revision<excluded.inflight_revision
    `).bind(userId,revision,now),
    env.DB.prepare(`
      INSERT INTO user_library_v3_commits (user_id,revision,expected_revision,updated_at)
      SELECT ?,?,?,?
      WHERE ${claimCheck}
      ON CONFLICT(user_id,revision) DO NOTHING
    `).bind(userId,revision,currentRevision,updatedAt,userId,revision,revision),
    ...changes.map((change,seq)=>env.DB.prepare(`
      INSERT INTO user_library_v3_changes
        (user_id,revision,seq,paper_key,op,doi,paper_present,paper_state_json,metadata_present,metadata_json,updated_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,?
      WHERE ${claimCheck}
      ON CONFLICT(user_id,revision,seq) DO NOTHING
    `).bind(
      userId,revision,seq,change.paperKey,change.op,change.doi,
      change.paperPresent?1:0,change.paperStateJson,
      change.metadataPresent?1:0,change.metadataJson,updatedAt,
      userId,revision,revision,
    )),
    ...rowStatements(env,userId,split,revision,updatedAt,tombstones),
    env.DB.prepare(`
      INSERT INTO user_library_v3_head
        (user_id,revision,updated_at,global_json,global_revision,paper_count,metadata_count,change_floor_revision,schema_version)
      SELECT ?,?,?,?,?,?,?,?,1
      WHERE ${claimCheck}
      ON CONFLICT(user_id) DO UPDATE SET
        revision=excluded.revision,
        updated_at=excluded.updated_at,
        global_json=excluded.global_json,
        global_revision=excluded.global_revision,
        paper_count=excluded.paper_count,
        metadata_count=excluded.metadata_count,
        change_floor_revision=excluded.change_floor_revision,
        schema_version=excluded.schema_version
      WHERE user_library_v3_head.revision<=excluded.revision
        AND ${claimCheck}
    `).bind(
      userId,revision,updatedAt,split.globalJson,globalRevision,
      split.paperCount,split.metadataCount,changeFloorRevision,
      userId,revision,revision,
      userId,revision,revision,
    ),
    env.DB.prepare(`
      INSERT INTO user_library_v3_shape (user_id,papers_split,metadata_split,revision)
      SELECT ?,?,?,?
      WHERE ${claimCheck}
      ON CONFLICT(user_id) DO UPDATE SET
        papers_split=excluded.papers_split,
        metadata_split=excluded.metadata_split,
        revision=excluded.revision
      WHERE user_library_v3_shape.revision<=excluded.revision
        AND ${claimCheck}
    `).bind(
      userId,split.papersSplit?1:0,split.metadataSplit?1:0,revision,
      userId,revision,revision,
      userId,revision,revision,
    ),
    env.DB.prepare(`
      UPDATE user_library_v3_shadow_sync
      SET source_revision=?,
        source_updated_at=?,
        source_state_hash=?,
        inflight_revision=0,
        inflight_started_at=0,
        synced_at=?,
        last_error=''
      WHERE user_id=? AND inflight_revision=? AND source_revision<?
    `).bind(revision,updatedAt,split.sourceStateHash,now,userId,revision,revision),
  ];
  await env.DB.batch(statements);

  const sync = await v3Sync(env,userId);
  const committedRevision = Number(sync?.source_revision || 0);
  if (committedRevision > revision) {
    return { enabled:true,written:false,skippedStale:true,currentRevision:committedRevision };
  }
  if (committedRevision !== revision || String(sync?.source_state_hash || '') !== split.sourceStateHash) {
    throw new Error('user_library_v3_shadow_claim_lost');
  }

  const after = await sourceMeta(env,userId);
  if (Number(after?.revision || 0) !== revision || Number(after?.updated_at || 0) !== updatedAt) {
    return {
      enabled:true,
      written:true,
      sourceChanged:true,
      revision,
      currentRevision:Number(after?.revision || 0),
    };
  }
  return {
    enabled:true,
    written:true,
    revision,
    rowCount:split.rows.length,
    paperCount:split.paperCount,
    metadataCount:split.metadataCount,
    sourceStateHash:split.sourceStateHash,
    changeCount:changes.length,
    changeFloorRevision,
  };
}

export async function getUserLibraryV3ShadowStatus(env) {
  if (!env?.DB) return { status:503, body:{ error:'user_library_v3_shadow_db_missing' } };
  const writeEnabled=flag(env.USER_LIBRARY_V3_WRITE_ENABLED);
  const [legacy,heads,sync,backfill] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS count FROM user_library_state').first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM user_library_v3_head').first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM user_library_v3_shadow_sync').first(),
    env.DB.prepare('SELECT * FROM user_library_v3_backfill WHERE id=1').first(),
  ]);
  if(writeEnabled){
    const compat=await getUserLibraryShadowStatus(env);
    return { status:200, body:{
      ok:true,
      authority:'v3',
      configured:flag(env.USER_LIBRARY_V3_SHADOW_ENABLED),
      enabled:userLibraryV3ShadowEnabled(env),
      readEnabled:flag(env.USER_LIBRARY_V3_READ_ENABLED),
      writeEnabled:true,
      legacyUsers:Number(legacy?.count || 0),
      v3Heads:Number(heads?.count || 0),
      syncedUsers:Number(sync?.count || 0),
      compatibilityHeads:Number(compat.body?.shadowHeads || 0),
      compatibilityMismatches:Number(compat.body?.revisionMismatches || 0),
      revisionMismatches:Number(compat.body?.revisionMismatches || 0),
      backfill:backfill ? {
        complete:Number(backfill.complete || 0)===1,
        historicalOnly:true,
        cursorUserId:String(backfill.cursor_user_id || ''),
        scannedUsers:Number(backfill.scanned_users || 0),
        syncedUsers:Number(backfill.synced_users || 0),
        skippedFresh:Number(backfill.skipped_fresh || 0),
        skippedStale:Number(backfill.skipped_stale || 0),
        failedUsers:Number(backfill.failed_users || 0),
        startedAt:Number(backfill.started_at || 0),
        updatedAt:Number(backfill.updated_at || 0),
        lastError:String(backfill.last_error || ''),
      } : null,
    }};
  }

  const revisionMismatch=await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM user_library_state legacy
    LEFT JOIN user_library_v3_shadow_sync sync ON sync.user_id=legacy.user_id
    WHERE sync.user_id IS NULL
       OR sync.source_revision<>legacy.revision
       OR sync.source_updated_at<>legacy.updated_at
  `).first();
  return { status:200, body:{
    ok:true,
    authority:'legacy',
    configured:flag(env.USER_LIBRARY_V3_SHADOW_ENABLED),
    enabled:userLibraryV3ShadowEnabled(env),
    readEnabled:flag(env.USER_LIBRARY_V3_READ_ENABLED),
    writeEnabled:false,
    legacyUsers:Number(legacy?.count || 0),
    v3Heads:Number(heads?.count || 0),
    syncedUsers:Number(sync?.count || 0),
    compatibilityHeads:null,
    compatibilityMismatches:null,
    revisionMismatches:Number(revisionMismatch?.count || 0),
    backfill:backfill ? {
      complete:Number(backfill.complete || 0)===1,
      historicalOnly:false,
      cursorUserId:String(backfill.cursor_user_id || ''),
      scannedUsers:Number(backfill.scanned_users || 0),
      syncedUsers:Number(backfill.synced_users || 0),
      skippedFresh:Number(backfill.skipped_fresh || 0),
      skippedStale:Number(backfill.skipped_stale || 0),
      failedUsers:Number(backfill.failed_users || 0),
      startedAt:Number(backfill.started_at || 0),
      updatedAt:Number(backfill.updated_at || 0),
      lastError:String(backfill.last_error || ''),
    } : null,
  }};
}
export async function backfillUserLibraryV3ShadowPage(env, limitValue = 20) {
  if (flag(env.USER_LIBRARY_V3_WRITE_ENABLED)) {
    return { status:409, body:{ error:'user_library_v3_write_authority_active' } };
  }
  if (!userLibraryV3ShadowEnabled(env)) {
    return { status:409, body:{ error:'user_library_v3_shadow_disabled' } };
  }
  if (!env?.DB) return { status:503, body:{ error:'user_library_v3_shadow_db_missing' } };
  const limit = Math.max(1,Math.min(MAX_BACKFILL_LIMIT,Number(limitValue || 20)));
  const now = Date.now();
  let progress = await env.DB.prepare('SELECT * FROM user_library_v3_backfill WHERE id=1').first();
  if (!progress) {
    await env.DB.prepare(`
      INSERT INTO user_library_v3_backfill
        (id,cursor_user_id,complete,scanned_users,synced_users,skipped_fresh,skipped_stale,failed_users,started_at,updated_at,last_error)
      VALUES (1,NULL,0,0,0,0,0,0,?,?,'')
    `).bind(now,now).run();
    progress = await env.DB.prepare('SELECT * FROM user_library_v3_backfill WHERE id=1').first();
  }
  if (Number(progress?.complete || 0) === 1) {
    return { status:200, body:{ ok:true,enabled:true,complete:true,pageUsers:0 } };
  }

  const cursor = safeText(progress?.cursor_user_id,300);
  const page = await env.DB.prepare(`
    SELECT user_id,state_json,revision,updated_at
    FROM user_library_state
    WHERE (?='' OR user_id>?)
    ORDER BY user_id ASC
    LIMIT ?
  `).bind(cursor,cursor,limit).all();
  const rows = page?.results || [];
  let synced=0,skippedFresh=0,skippedStale=0,failed=0,lastError='';

  for (const row of rows) {
    const state = parseJson(row.state_json);
    if (!plainObject(state)) {
      failed += 1;
      lastError = 'invalid_legacy_state';
      continue;
    }
    try {
      const result = await shadowWriteUserLibraryV3FromState(
        env,row.user_id,state,Number(row.revision || 0),Number(row.updated_at || 0),Date.now(),
      );
      if (result.unchanged) skippedFresh += 1;
      else if (result.sourceChanged || result.skippedStale) skippedStale += 1;
      else if (result.written) synced += 1;
    } catch (error) {
      failed += 1;
      lastError = safeText(error?.message || String(error),180);
    }
  }

  const nextCursor = rows.length ? safeText(rows[rows.length-1]?.user_id,300) : cursor;
  const complete = rows.length < limit;
  const scannedTotal = Number(progress?.scanned_users || 0) + rows.length;
  const syncedTotal = Number(progress?.synced_users || 0) + synced;
  const freshTotal = Number(progress?.skipped_fresh || 0) + skippedFresh;
  const staleTotal = Number(progress?.skipped_stale || 0) + skippedStale;
  const failedTotal = Number(progress?.failed_users || 0) + failed;
  await env.DB.prepare(`
    UPDATE user_library_v3_backfill
    SET cursor_user_id=?,complete=?,scanned_users=?,synced_users=?,skipped_fresh=?,
      skipped_stale=?,failed_users=?,updated_at=?,last_error=?
    WHERE id=1
  `).bind(
    nextCursor || null,complete?1:0,scannedTotal,syncedTotal,freshTotal,
    staleTotal,failedTotal,Date.now(),lastError,
  ).run();

  return { status:200, body:{
    ok:true,enabled:true,complete,pageUsers:rows.length,pageSynced:synced,
    pageSkippedFresh:skippedFresh,pageSkippedStale:skippedStale,pageFailedUsers:failed,
    scannedUsers:scannedTotal,syncedUsers:syncedTotal,skippedFresh:freshTotal,
    skippedStale:staleTotal,failedUsers:failedTotal,nextCursor,
  }};
}

export async function reconcileUserLibraryV3ShadowPage(env, limitValue = 20) {
  if (flag(env.USER_LIBRARY_V3_WRITE_ENABLED)) {
    return { status:409, body:{ error:'user_library_v3_write_authority_active' } };
  }
  if (!userLibraryV3ShadowEnabled(env)) {
    return { status:409, body:{ error:'user_library_v3_shadow_disabled' } };
  }
  if (!env?.DB) return { status:503, body:{ error:'user_library_v3_shadow_db_missing' } };
  const limit = Math.max(1,Math.min(MAX_BACKFILL_LIMIT,Number(limitValue || 20)));
  const page = await env.DB.prepare(`
    SELECT legacy.user_id,legacy.state_json,legacy.revision,legacy.updated_at
    FROM user_library_state legacy
    LEFT JOIN user_library_v3_shadow_sync sync ON sync.user_id=legacy.user_id
    WHERE sync.user_id IS NULL
       OR sync.source_revision<>legacy.revision
       OR sync.source_updated_at<>legacy.updated_at
    ORDER BY legacy.user_id ASC
    LIMIT ?
  `).bind(limit).all();
  const rows = page?.results || [];
  let synced=0,skippedStale=0,failed=0;
  const reasons={};
  for (const row of rows) {
    const state=parseJson(row.state_json);
    if(!plainObject(state)){
      failed+=1;
      reasons.invalid_legacy_state=Number(reasons.invalid_legacy_state||0)+1;
      continue;
    }
    try{
      const result=await shadowWriteUserLibraryV3FromState(
        env,row.user_id,state,Number(row.revision||0),Number(row.updated_at||0),Date.now(),
      );
      if(result.sourceChanged||result.skippedStale) skippedStale+=1;
      else if(result.written||result.unchanged) synced+=1;
    }catch(error){
      failed+=1;
      const reason=safeText(error?.message||String(error),180)||'unknown_error';
      reasons[reason]=Number(reasons[reason]||0)+1;
    }
  }
  const remaining=await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM user_library_state legacy
    LEFT JOIN user_library_v3_shadow_sync sync ON sync.user_id=legacy.user_id
    WHERE sync.user_id IS NULL
       OR sync.source_revision<>legacy.revision
       OR sync.source_updated_at<>legacy.updated_at
  `).first();
  return {status:200,body:{
    ok:true,
    checked:rows.length,
    synced,
    skippedStale,
    failed,
    reasons,
    remaining:Number(remaining?.count||0),
    complete:Number(remaining?.count||0)===0,
  }};
}

async function compareOne(env, legacy) {
  const sync = await v3Sync(env, legacy.user_id);
  if (!sync) return { matched:false, reason:'missing_sync' };
  if (Number(sync.source_revision || 0) !== Number(legacy.revision || 0)
      || Number(sync.source_updated_at || 0) !== Number(legacy.updated_at || 0)) {
    return { matched:false, reason:'revision_mismatch' };
  }
  const head = await v3Head(env, legacy.user_id);
  const shape = await v3Shape(env, legacy.user_id);
  if (!head || !shape) return { matched:false, reason:'missing_head_or_shape' };
  if (Number(head.revision || 0) !== Number(legacy.revision || 0)
      || Number(shape.revision || 0) !== Number(legacy.revision || 0)) {
    return { matched:false, reason:'v3_revision_mismatch' };
  }
  const rows = await v3Rows(env, legacy.user_id, Number(head.revision || 0));
  let rebuilt;
  try { rebuilt = rebuildV3State(head,shape,rows); }
  catch { return { matched:false, reason:'rebuild_failed' }; }
  const original = parseJson(legacy.state_json);
  if (!plainObject(original)) return { matched:false, reason:'invalid_legacy_state' };
  const originalHash = await sha256Hex(stableStateJson(original));
  const rebuiltHash = await sha256Hex(stableStateJson(rebuilt));
  if (String(sync.source_state_hash || '') !== originalHash) {
    return { matched:false, reason:'source_hash_mismatch' };
  }
  if (rebuiltHash !== originalHash) return { matched:false, reason:'semantic_mismatch' };
  return { matched:true };
}

export async function compareUserLibraryV3ShadowPage(env, offsetValue = 0, limitValue = 20) {
  if (flag(env.USER_LIBRARY_V3_WRITE_ENABLED)) {
    const compat=await compareUserLibraryShadowPage(env,offsetValue,limitValue);
    if(compat.status!==200) return compat;
    return {status:200,body:{
      ...compat.body,
      authority:'v3',
      writeAuthority:true,
      comparison:'v3-to-d3b-compatibility',
    }};
  }

  if (!userLibraryV3ShadowEnabled(env)) {
    return { status:409, body:{ error:'user_library_v3_shadow_disabled' } };
  }
  if (!env?.DB) return { status:503, body:{ error:'user_library_v3_shadow_db_missing' } };
  const offset = Math.max(0,Math.floor(Number(offsetValue || 0)));
  const limit = Math.max(1,Math.min(MAX_COMPARE_LIMIT,Number(limitValue || 20)));
  const page = await env.DB.prepare(`
    SELECT user_id,state_json,revision,updated_at
    FROM user_library_state
    ORDER BY user_id ASC
    LIMIT ? OFFSET ?
  `).bind(limit,offset).all();
  const rows = page?.results || [];
  let matched=0,mismatched=0;
  const reasons = {};
  for (const row of rows) {
    const result = await compareOne(env,row);
    if (result.matched) matched += 1;
    else {
      mismatched += 1;
      reasons[result.reason] = Number(reasons[result.reason] || 0) + 1;
    }
  }
  const totalRow = await env.DB.prepare('SELECT COUNT(*) AS count FROM user_library_state').first();
  const total = Number(totalRow?.count || 0);
  const nextOffset = offset + rows.length;
  return { status:200, body:{
    ok:true,
    offset,
    checked:rows.length,
    matched,
    mismatched,
    reasons,
    nextOffset,
    total,
    complete:nextOffset>=total,
  }};

}
