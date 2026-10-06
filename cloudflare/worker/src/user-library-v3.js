import { normalizeDoi } from './media.js';

const MAX_MUTATION_OPS = 32;
const MAX_MUTATION_BYTES = 2 * 1024 * 1024;
const MAX_GLOBAL_BYTES = 1_500_000;
const CHANGE_RETENTION_REVISIONS = 512;
const COMPAT_ROW_SHADOW_VERSION = 2;
const MAX_ROW_BYTES = 256 * 1024;
const MAX_PAGE_LIMIT = 100;
const MAX_DELTA_LIMIT = 100;

const encoder = new TextEncoder();
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const plainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function safeText(value, max = 1000) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}
function requiredText(value, max, label) {
  const text = safeText(value, max);
  if (!text || text !== value) throw new Error(label);
  return text;
}
function encodeJson(value, maxBytes, label) {
  let json;
  try { json = JSON.stringify(value); }
  catch { throw new Error(label); }
  if (typeof json !== 'string' || encoder.encode(json).byteLength > maxBytes) throw new Error(label);
  return json;
}
function parseJson(value, label) {
  if (typeof value !== 'string') throw new Error(label);
  try { return JSON.parse(value); }
  catch { throw new Error(label); }
}
function integer(value, min, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min) throw new Error(label);
  return number;
}
function flag(value) {
  return String(value || '') === '1';
}

export function userLibraryV3ShadowEnabled(env) {
  return flag(env?.USER_LIBRARY_V3_SHADOW_ENABLED);
}
export function userLibraryV3ReadEnabled(env) {
  return flag(env?.USER_LIBRARY_V3_READ_ENABLED);
}
export function userLibraryV3WriteEnabled(env) {
  return flag(env?.USER_LIBRARY_V3_WRITE_ENABLED);
}

function normalizeOperation(raw) {
  if (!plainObject(raw)) throw new Error('user_library_v3_operation_invalid');
  const paperKey = requiredText(raw.paperKey, 2000, 'user_library_v3_paper_key_invalid');
  const deleting = raw.delete === true;
  const paperPresent = !deleting && hasOwn(raw, 'paperState');
  const metadataPresent = !deleting && hasOwn(raw, 'metadata');
  if (!deleting && !paperPresent && !metadataPresent) {
    throw new Error('user_library_v3_operation_empty');
  }
  const paperStateJson = paperPresent
    ? encodeJson(raw.paperState, MAX_ROW_BYTES, 'user_library_v3_paper_state_oversized')
    : null;
  const metadataJson = metadataPresent
    ? encodeJson(raw.metadata, MAX_ROW_BYTES, 'user_library_v3_metadata_oversized')
    : null;
  const metadataDoi = metadataPresent && plainObject(raw.metadata) ? raw.metadata.doi : '';
  const doi = deleting ? null : (normalizeDoi(raw.doi || metadataDoi || paperKey) || null);
  return {
    paperKey,
    doi,
    paperPresent,
    paperStateJson,
    metadataPresent,
    metadataJson,
    deleted: deleting,
  };
}

function normalizeMutation(input) {
  if (!plainObject(input)) throw new Error('user_library_v3_mutation_invalid');
  encodeJson(input, MAX_MUTATION_BYTES, 'user_library_v3_mutation_oversized');
  const expectedRevision = integer(input.expectedRevision, 0, 'user_library_v3_expected_revision_invalid');
  const operationsRaw = Array.isArray(input.operations) ? input.operations : [];
  if (operationsRaw.length > MAX_MUTATION_OPS) throw new Error('user_library_v3_too_many_operations');
  const operations = operationsRaw.map(normalizeOperation);
  if (new Set(operations.map(row => row.paperKey)).size !== operations.length) {
    throw new Error('user_library_v3_duplicate_paper_key');
  }
  const hasGlobal = hasOwn(input, 'globalState');
  let globalJson = null;
  if (hasGlobal) {
    if (!plainObject(input.globalState) || hasOwn(input.globalState, 'papers') || hasOwn(input.globalState, 'metadata')) {
      throw new Error('user_library_v3_global_state_invalid');
    }
    globalJson = encodeJson(input.globalState, MAX_GLOBAL_BYTES, 'user_library_v3_global_state_oversized');
  }
  if (!operations.length && !hasGlobal) throw new Error('user_library_v3_noop');
  return { expectedRevision, operations, hasGlobal, globalJson };
}

async function headRow(env, userId) {
  return env.DB.prepare(`
    SELECT user_id,revision,updated_at,global_json,global_revision,paper_count,metadata_count,
      change_floor_revision,schema_version
    FROM user_library_v3_head WHERE user_id=?
  `).bind(userId).first();
}
async function shapeRow(env, userId) {
  return env.DB.prepare(`
    SELECT papers_split,metadata_split,revision
    FROM user_library_v3_shape WHERE user_id=?
  `).bind(userId).first();
}

async function existingRows(env, userId, operations) {
  if (!operations.length) return new Map();
  const placeholders = operations.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT paper_key,paper_present,metadata_present,deleted,revision
    FROM user_library_v3_rows
    WHERE user_id=? AND paper_key IN (${placeholders})
  `).bind(userId, ...operations.map(row => row.paperKey)).all();
  return new Map((rows?.results || []).map(row => [String(row.paper_key), row]));
}

function activePresence(row, field) {
  return Boolean(row) && Number(row.deleted || 0) === 0 && Number(row[field] || 0) === 1;
}

function rowSnapshot(row) {
  return {
    paperKey: String(row.paper_key),
    doi: typeof row.doi === 'string' && row.doi ? row.doi : null,
    paperPresent: Number(row.paper_present || 0) === 1,
    paperState: Number(row.paper_present || 0) === 1
      ? parseJson(row.paper_state_json, 'user_library_v3_paper_state_corrupt')
      : undefined,
    metadataPresent: Number(row.metadata_present || 0) === 1,
    metadata: Number(row.metadata_present || 0) === 1
      ? parseJson(row.metadata_json, 'user_library_v3_metadata_corrupt')
      : undefined,
    deleted: Number(row.deleted || 0) === 1,
    revision: Number(row.revision || 0),
    updatedAt: Number(row.updated_at || 0),
  };
}

function changeSnapshot(row) {
  return {
    revision: Number(row.revision || 0),
    seq: Number(row.seq || 0),
    paperKey: String(row.paper_key),
    op: String(row.op),
    doi: typeof row.doi === 'string' && row.doi ? row.doi : null,
    paperPresent: Number(row.paper_present || 0) === 1,
    paperState: Number(row.paper_present || 0) === 1
      ? parseJson(row.paper_state_json, 'user_library_v3_change_paper_corrupt')
      : undefined,
    metadataPresent: Number(row.metadata_present || 0) === 1,
    metadata: Number(row.metadata_present || 0) === 1
      ? parseJson(row.metadata_json, 'user_library_v3_change_metadata_corrupt')
      : undefined,
    updatedAt: Number(row.updated_at || 0),
  };
}

function conflict(currentRevision) {
  return {
    ok: false,
    conflict: true,
    reason: 'user_library_v3_revision_conflict',
    currentRevision: Number(currentRevision || 0),
  };
}

export async function applyUserLibraryV3Mutation(env, userIdValue, input, nowValue = Date.now()) {
  if (!userLibraryV3WriteEnabled(env)) {
    return { ok:false, disabled:true, reason:'user_library_v3_write_disabled' };
  }
  if (!env?.DB || typeof env.DB.batch !== 'function') {
    throw new Error('user_library_v3_atomic_batch_required');
  }
  const userId = requiredText(userIdValue, 300, 'user_library_v3_user_id_invalid');
  const mutation = normalizeMutation(input);
  const now = integer(nowValue, 1, 'user_library_v3_updated_at_invalid');
  const current = await headRow(env, userId);
  const currentShape = await shapeRow(env,userId);
  const currentRevision = Number(current?.revision || 0);
  if (mutation.expectedRevision !== currentRevision) return conflict(currentRevision);

  const existing = await existingRows(env, userId, mutation.operations);
  let paperCount = Number(current?.paper_count || 0);
  let metadataCount = Number(current?.metadata_count || 0);
  for (const op of mutation.operations) {
    const old = existing.get(op.paperKey);
    const oldPaper = activePresence(old, 'paper_present');
    const oldMetadata = activePresence(old, 'metadata_present');
    const newPaper = !op.deleted && op.paperPresent;
    const newMetadata = !op.deleted && op.metadataPresent;
    paperCount += Number(newPaper) - Number(oldPaper);
    metadataCount += Number(newMetadata) - Number(oldMetadata);
  }
  if (paperCount < 0 || metadataCount < 0) throw new Error('user_library_v3_count_underflow');

  const nextRevision = currentRevision + 1;
  const currentGlobalJson = typeof current?.global_json === 'string' ? current.global_json : '{}';
  const globalJson = mutation.hasGlobal ? mutation.globalJson : currentGlobalJson;
  const globalRevision = mutation.hasGlobal ? nextRevision : Number(current?.global_revision || 0);
  const floor = Number(current?.change_floor_revision || 0);
  const nextFloor = Math.max(floor, Math.max(0,nextRevision-CHANGE_RETENTION_REVISIONS));
  const papersSplit = currentShape ? Number(currentShape.papers_split || 0)===1 : true;
  const metadataSplit = currentShape ? Number(currentShape.metadata_split || 0)===1 : true;
  const statements = [
    env.DB.prepare(`
      INSERT INTO user_library_v3_commits (user_id,revision,expected_revision,updated_at)
      VALUES (?,?,?,?)
    `).bind(userId,nextRevision,currentRevision,now),
  ];

  mutation.operations.forEach((op, seq) => {
    statements.push(env.DB.prepare(`
      INSERT INTO user_library_v3_rows
        (user_id,paper_key,doi,paper_present,paper_state_json,metadata_present,metadata_json,deleted,revision,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id,paper_key) DO UPDATE SET
        doi=excluded.doi,
        paper_present=excluded.paper_present,
        paper_state_json=excluded.paper_state_json,
        metadata_present=excluded.metadata_present,
        metadata_json=excluded.metadata_json,
        deleted=excluded.deleted,
        revision=excluded.revision,
        updated_at=excluded.updated_at
      WHERE user_library_v3_rows.revision < excluded.revision
    `).bind(
      userId,op.paperKey,op.doi,op.paperPresent?1:0,op.paperStateJson,
      op.metadataPresent?1:0,op.metadataJson,op.deleted?1:0,nextRevision,now,
    ));
    statements.push(env.DB.prepare(`
      INSERT INTO user_library_v3_changes
        (user_id,revision,seq,paper_key,op,doi,paper_present,paper_state_json,metadata_present,metadata_json,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      userId,nextRevision,seq,op.paperKey,op.deleted?'delete':'upsert',op.doi,
      op.paperPresent?1:0,op.paperStateJson,op.metadataPresent?1:0,op.metadataJson,now,
    ));
  });

  mutation.operations.forEach(op => {
    if (op.deleted) {
      statements.push(env.DB.prepare(
        'DELETE FROM user_paper_state WHERE user_id=? AND paper_key=?'
      ).bind(userId,op.paperKey));
      return;
    }
    statements.push(env.DB.prepare(`
      INSERT INTO user_paper_state
        (user_id,paper_key,doi,paper_present,paper_state_json,metadata_present,metadata_json,revision,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id,paper_key) DO UPDATE SET
        doi=excluded.doi,
        paper_present=excluded.paper_present,
        paper_state_json=excluded.paper_state_json,
        metadata_present=excluded.metadata_present,
        metadata_json=excluded.metadata_json,
        revision=excluded.revision,
        updated_at=excluded.updated_at
    `).bind(
      userId,op.paperKey,op.doi,op.paperPresent?1:0,op.paperStateJson,
      op.metadataPresent?1:0,op.metadataJson,nextRevision,now,
    ));
  });

  statements.push(env.DB.prepare(`
    INSERT INTO user_library_head
      (user_id,revision,updated_at,global_json,papers_split,metadata_split,paper_count,metadata_count,source_state_hash,shadow_version)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      revision=excluded.revision,
      updated_at=excluded.updated_at,
      global_json=excluded.global_json,
      papers_split=excluded.papers_split,
      metadata_split=excluded.metadata_split,
      paper_count=excluded.paper_count,
      metadata_count=excluded.metadata_count,
      source_state_hash=excluded.source_state_hash,
      shadow_version=excluded.shadow_version
    WHERE user_library_head.revision < excluded.revision
  `).bind(
    userId,nextRevision,now,globalJson,papersSplit?1:0,metadataSplit?1:0,paperCount,metadataCount,
    `v3-authority:${nextRevision}`,COMPAT_ROW_SHADOW_VERSION,
  ));

  if (nextFloor > floor) {
    statements.push(
      env.DB.prepare('DELETE FROM user_library_v3_changes WHERE user_id=? AND revision<?').bind(userId,nextFloor),
      env.DB.prepare('DELETE FROM user_library_v3_commits WHERE user_id=? AND revision<?').bind(userId,nextFloor),
      env.DB.prepare('DELETE FROM user_library_v3_rows WHERE user_id=? AND deleted=1 AND revision<?').bind(userId,nextFloor),
    );
  }

  statements.push(env.DB.prepare(`
    INSERT INTO user_library_v3_shape (user_id,papers_split,metadata_split,revision)
    VALUES (?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      papers_split=excluded.papers_split,
      metadata_split=excluded.metadata_split,
      revision=excluded.revision
    WHERE user_library_v3_shape.revision < excluded.revision
  `).bind(userId,papersSplit?1:0,metadataSplit?1:0,nextRevision));

  if (current) {
    statements.push(env.DB.prepare(`
      UPDATE user_library_v3_head
      SET revision=?,updated_at=?,global_json=?,global_revision=?,paper_count=?,metadata_count=?,
        change_floor_revision=?,schema_version=1
      WHERE user_id=? AND revision=?
    `).bind(
      nextRevision,now,globalJson,globalRevision,paperCount,metadataCount,nextFloor,userId,currentRevision,
    ));
  } else {
    statements.push(env.DB.prepare(`
      INSERT INTO user_library_v3_head
        (user_id,revision,updated_at,global_json,global_revision,paper_count,metadata_count,change_floor_revision,schema_version)
      VALUES (?,?,?,?,?,?,?,?,1)
    `).bind(userId,nextRevision,now,globalJson,globalRevision,paperCount,metadataCount,nextFloor));
  }

  try {
    const results = await env.DB.batch(statements);
    const last = Array.isArray(results) ? results[results.length - 1] : null;
    if (current && Number(last?.meta?.changes ?? 1) !== 1) {
      throw new Error('user_library_v3_head_compare_and_swap_failed');
    }
  } catch (error) {
    const after = await headRow(env, userId);
    if (Number(after?.revision || 0) !== currentRevision) return conflict(after?.revision || 0);
    throw error;
  }

  const after = await headRow(env, userId);
  if (Number(after?.revision || 0) !== nextRevision) {
    throw new Error('user_library_v3_head_commit_missing');
  }
  return {
    ok:true,
    revision:nextRevision,
    updatedAt:now,
    paperCount,
    metadataCount,
    globalRevision,
    operationCount:mutation.operations.length,
    changeFloorRevision:nextFloor,
    compatibilityReadPath:'rows-v2',
  };
}

export async function readUserLibraryV3Head(env, userIdValue) {
  if (!userLibraryV3ReadEnabled(env)) {
    return { ready:false, reason:'user_library_v3_read_disabled' };
  }
  if (!env?.DB) return { ready:false, reason:'user_library_v3_db_missing' };
  const userId = requiredText(userIdValue, 300, 'user_library_v3_user_id_invalid');
  const head = await headRow(env, userId);
  if (!head) {
    return {
      ready:true, revision:0, updatedAt:0, globalState:{}, globalRevision:0,
      paperCount:0, metadataCount:0, changeFloorRevision:0,
      papersSplit:true, metadataSplit:true,
    };
  }
  const shape = await shapeRow(env,userId);
  if (!shape || Number(shape.revision || 0) !== Number(head.revision || 0)) {
    return { ready:false, reason:'user_library_v3_shape_revision_mismatch' };
  }
  return {
    ready:true,
    revision:Number(head.revision || 0),
    updatedAt:Number(head.updated_at || 0),
    globalState:parseJson(head.global_json, 'user_library_v3_global_corrupt'),
    globalRevision:Number(head.global_revision || 0),
    paperCount:Number(head.paper_count || 0),
    metadataCount:Number(head.metadata_count || 0),
    changeFloorRevision:Number(head.change_floor_revision || 0),
    papersSplit:Number(shape.papers_split || 0)===1,
    metadataSplit:Number(shape.metadata_split || 0)===1,
  };
}

export async function readUserLibraryV3Page(env, userIdValue, { afterKey = '', limit = 100 } = {}) {
  const head = await readUserLibraryV3Head(env, userIdValue);
  if (!head.ready) return head;
  const userId = requiredText(userIdValue, 300, 'user_library_v3_user_id_invalid');
  const cursor = safeText(afterKey, 2000);
  const pageLimit = Math.max(1, Math.min(MAX_PAGE_LIMIT, integer(limit, 1, 'user_library_v3_page_limit_invalid')));
  const result = await env.DB.prepare(`
    SELECT paper_key,doi,paper_present,paper_state_json,metadata_present,metadata_json,deleted,revision,updated_at
    FROM user_library_v3_rows
    WHERE user_id=? AND deleted=0 AND (?='' OR paper_key>?)
    ORDER BY paper_key ASC
    LIMIT ?
  `).bind(userId,cursor,cursor,pageLimit+1).all();
  const all = result?.results || [];
  const hasMore = all.length > pageLimit;
  const page = all.slice(0,pageLimit);
  return {
    ready:true,
    scanStartRevision:head.revision,
    head,
    count:page.length,
    hasMore,
    nextKey:hasMore && page.length ? String(page[page.length-1].paper_key) : null,
    rows:page.map(rowSnapshot),
  };
}

export async function readUserLibraryV3Delta(
  env,
  userIdValue,
  { sinceRevision = 0, afterRevision = null, afterSeq = -1, limit = 100 } = {},
) {
  const head = await readUserLibraryV3Head(env, userIdValue);
  if (!head.ready) return head;
  const userId = requiredText(userIdValue, 300, 'user_library_v3_user_id_invalid');
  const since = integer(sinceRevision, 0, 'user_library_v3_since_revision_invalid');
  if (since > head.revision) {
    return { ready:true, resetRequired:true, reason:'user_library_v3_future_revision', head };
  }
  if (since < head.changeFloorRevision) {
    return { ready:true, resetRequired:true, reason:'user_library_v3_change_log_pruned', head };
  }
  const cursorRevision = afterRevision === null
    ? since
    : integer(afterRevision, 0, 'user_library_v3_delta_cursor_revision_invalid');
  const cursorSeq = Number(afterSeq);
  if (!Number.isSafeInteger(cursorSeq) || cursorSeq < -1) {
    throw new Error('user_library_v3_delta_cursor_seq_invalid');
  }
  const pageLimit = Math.max(1, Math.min(MAX_DELTA_LIMIT, integer(limit, 1, 'user_library_v3_delta_limit_invalid')));
  const targetRevision = head.revision;
  const result = await env.DB.prepare(`
    SELECT revision,seq,paper_key,op,doi,paper_present,paper_state_json,metadata_present,metadata_json,updated_at
    FROM user_library_v3_changes
    WHERE user_id=? AND revision>? AND revision<=?
      AND (revision>? OR (revision=? AND seq>?))
    ORDER BY revision ASC, seq ASC
    LIMIT ?
  `).bind(
    userId,since,targetRevision,cursorRevision,cursorRevision,cursorSeq,pageLimit+1,
  ).all();
  const all = result?.results || [];
  const hasMore = all.length > pageLimit;
  const page = all.slice(0,pageLimit);
  const last = page[page.length-1];
  return {
    ready:true,
    resetRequired:false,
    sinceRevision:since,
    targetRevision,
    head,
    globalState:head.globalRevision > since ? head.globalState : undefined,
    globalRevision:head.globalRevision,
    count:page.length,
    hasMore,
    nextCursor:hasMore && last ? { revision:Number(last.revision), seq:Number(last.seq) } : null,
    changes:page.map(changeSnapshot),
  };
}

export const USER_LIBRARY_V3_LIMITS = Object.freeze({
  maxMutationOps:MAX_MUTATION_OPS,
  maxMutationBytes:MAX_MUTATION_BYTES,
  maxGlobalBytes:MAX_GLOBAL_BYTES,
  maxRowBytes:MAX_ROW_BYTES,
  maxPageLimit:MAX_PAGE_LIMIT,
  maxDeltaLimit:MAX_DELTA_LIMIT,
  changeRetentionRevisions:CHANGE_RETENTION_REVISIONS,
});
