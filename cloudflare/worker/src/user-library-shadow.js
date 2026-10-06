import { normalizeDoi } from './media.js';

const SHADOW_VERSION = 1;
const BACKFILL_ID = 1;
const MAX_COMPARE_LIMIT = 50;
const MAX_BACKFILL_LIMIT = 50;

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function safeText(value, max = 1000) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!plainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}
export function stableStateJson(value) {
  return JSON.stringify(canonical(value));
}
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function parseJson(value) {
  if (typeof value !== 'string' || !value) return null;
  try { return JSON.parse(value); } catch { return null; }
}
function doiForPaperKey(paperKey, metadata) {
  const metaDoi = plainObject(metadata) ? normalizeDoi(metadata.doi) : '';
  return metaDoi || normalizeDoi(paperKey) || null;
}

export function userLibraryRowShadowEnabled(env) {
  return String(env?.USER_LIBRARY_ROW_SHADOW_ENABLED || '') === '1'
    && String(env?.USER_LIBRARY_V3_WRITE_ENABLED || '') !== '1';
}
export function userLibraryRowReadEnabled(env) {
  return String(env?.USER_LIBRARY_ROW_READ_ENABLED || '') === '1';
}

export async function splitUserLibraryState(state) {
  if (!plainObject(state)) throw new Error('user_library_state_invalid');
  const globalState = { ...state };
  const papersSplit = plainObject(state.papers);
  const metadataSplit = plainObject(state.metadata);
  const papers = papersSplit ? state.papers : {};
  const metadata = metadataSplit ? state.metadata : {};
  if (papersSplit) delete globalState.papers;
  if (metadataSplit) delete globalState.metadata;

  const keys = [...new Set([...Object.keys(papers), ...Object.keys(metadata)])].sort();
  const rows = keys.map(paperKey => {
    const paperPresent = Object.prototype.hasOwnProperty.call(papers, paperKey);
    const metadataPresent = Object.prototype.hasOwnProperty.call(metadata, paperKey);
    const paperState = paperPresent ? papers[paperKey] : undefined;
    const meta = metadataPresent ? metadata[paperKey] : undefined;
    return {
      paperKey,
      doi: doiForPaperKey(paperKey, meta),
      paperPresent,
      paperStateJson: paperPresent ? JSON.stringify(paperState) : null,
      metadataPresent,
      metadataJson: metadataPresent ? JSON.stringify(meta) : null,
    };
  });

  return {
    globalJson: JSON.stringify(globalState),
    papersSplit,
    metadataSplit,
    paperCount: Object.keys(papers).length,
    metadataCount: Object.keys(metadata).length,
    rows,
    sourceStateHash: await sha256Hex(stableStateJson(state)),
  };
}

export function rebuildUserLibraryState(head, rows = []) {
  const globalState = parseJson(head?.global_json);
  if (!plainObject(globalState)) throw new Error('user_library_shadow_global_invalid');
  const state = { ...globalState };
  if (Number(head?.papers_split || 0) === 1) state.papers = {};
  if (Number(head?.metadata_split || 0) === 1) state.metadata = {};

  for (const row of rows || []) {
    const paperKey = safeText(row?.paper_key, 2000);
    if (!paperKey) continue;
    if (Number(head?.papers_split || 0) === 1 && Number(row?.paper_present || 0) === 1) {
      state.papers[paperKey] = parseJson(row.paper_state_json);
    }
    if (Number(head?.metadata_split || 0) === 1 && Number(row?.metadata_present || 0) === 1) {
      state.metadata[paperKey] = parseJson(row.metadata_json);
    }
  }
  return state;
}

async function writeRows(env, userId, split, revision, updatedAt) {
  await env.DB.prepare('DELETE FROM user_paper_state WHERE user_id = ?').bind(userId).run();
  const rows = split.rows || [];
  for (let offset = 0; offset < rows.length; offset += 40) {
    const chunk = rows.slice(offset, offset + 40);
    const statements = chunk.map(row => env.DB.prepare(`
      INSERT INTO user_paper_state
        (user_id,paper_key,doi,paper_present,paper_state_json,metadata_present,metadata_json,revision,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).bind(
      userId,row.paperKey,row.doi,row.paperPresent?1:0,row.paperStateJson,
      row.metadataPresent?1:0,row.metadataJson,revision,updatedAt,
    ));
    if (typeof env.DB.batch === 'function') await env.DB.batch(statements);
    else for (const statement of statements) await statement.run();
  }
}

export async function shadowWriteUserLibraryState(env, userId, state, revision, updatedAt) {
  if (!userLibraryRowShadowEnabled(env)) return { enabled:false, written:false };
  if (!env?.DB) throw new Error('user_library_shadow_db_missing');
  const normalizedUserId = safeText(userId, 300);
  const rev = Number(revision || 0);
  const updated = Number(updatedAt || 0);
  if (!normalizedUserId || !Number.isInteger(rev) || rev < 1 || !Number.isFinite(updated) || updated <= 0) {
    throw new Error('user_library_shadow_identity_invalid');
  }

  const current = await env.DB.prepare(
    'SELECT revision, updated_at, source_state_hash, paper_count, metadata_count FROM user_library_head WHERE user_id = ?'
  ).bind(normalizedUserId).first();
  if (Number(current?.revision || 0) > rev) {
    return { enabled:true, written:false, skippedStale:true, currentRevision:Number(current.revision) };
  }

  const split = await splitUserLibraryState(state);
  if (Number(current?.revision || 0) === rev
      && Number(current?.updated_at || 0) === updated
      && current?.source_state_hash === split.sourceStateHash) {
    const integrity = await env.DB.prepare(`
      SELECT COUNT(*) AS row_count,
        COALESCE(SUM(CASE WHEN paper_present=1 THEN 1 ELSE 0 END),0) AS paper_count,
        COALESCE(SUM(CASE WHEN metadata_present=1 THEN 1 ELSE 0 END),0) AS metadata_count
      FROM user_paper_state
      WHERE user_id=? AND revision=?
    `).bind(normalizedUserId,rev).first();
    if (Number(integrity?.row_count || 0) === split.rows.length
        && Number(integrity?.paper_count || 0) === split.paperCount
        && Number(integrity?.metadata_count || 0) === split.metadataCount) {
      return { enabled:true, written:false, unchanged:true, revision:rev };
    }
  }

  await writeRows(env, normalizedUserId, split, rev, updated);
  await env.DB.prepare(`
    INSERT INTO user_library_head
      (user_id,revision,updated_at,global_json,papers_split,metadata_split,paper_count,metadata_count,source_state_hash,shadow_version)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      revision=excluded.revision,updated_at=excluded.updated_at,global_json=excluded.global_json,
      papers_split=excluded.papers_split,metadata_split=excluded.metadata_split,
      paper_count=excluded.paper_count,metadata_count=excluded.metadata_count,
      source_state_hash=excluded.source_state_hash,shadow_version=excluded.shadow_version
    WHERE user_library_head.revision <= excluded.revision
  `).bind(
    normalizedUserId,rev,updated,split.globalJson,split.papersSplit?1:0,split.metadataSplit?1:0,
    split.paperCount,split.metadataCount,split.sourceStateHash,SHADOW_VERSION,
  ).run();

  return {
    enabled:true,written:true,revision:rev,rowCount:split.rows.length,
    paperCount:split.paperCount,metadataCount:split.metadataCount,sourceStateHash:split.sourceStateHash,
  };
}

export async function readUserLibraryStateFromRows(env, userId, authorityMeta = null) {
  if (!userLibraryRowReadEnabled(env)) return { ready:false, reason:'user_library_row_read_disabled' };
  if (!env?.DB) return { ready:false, reason:'user_library_shadow_db_missing' };
  const normalizedUserId = safeText(userId, 300);
  if (!normalizedUserId) return { ready:false, reason:'user_library_user_id_invalid' };

  const authority = authorityMeta || await env.DB.prepare(
    'SELECT revision, updated_at FROM user_library_state WHERE user_id = ?'
  ).bind(normalizedUserId).first();

  const head = await env.DB.prepare(`
    SELECT user_id,revision,updated_at,global_json,papers_split,metadata_split,
      paper_count,metadata_count,source_state_hash,shadow_version
    FROM user_library_head WHERE user_id=?
  `).bind(normalizedUserId).first();

  if (!authority && !head) {
    return { ready:true, readPath:'rows', revision:0, updatedAt:0, state:{} };
  }
  if (!authority) return { ready:false, reason:'row_authority_missing' };
  if (!head) return { ready:false, reason:'row_head_missing' };
  if (Number(head.revision || 0) !== Number(authority.revision || 0)
      || Number(head.updated_at || 0) !== Number(authority.updated_at || 0)) {
    return { ready:false, reason:'row_revision_stale' };
  }

  const rows = await env.DB.prepare(`
    SELECT paper_key,doi,paper_present,paper_state_json,metadata_present,metadata_json,revision,updated_at
    FROM user_paper_state
    WHERE user_id=?
    ORDER BY paper_key ASC
  `).bind(normalizedUserId).all();
  const items = rows?.results || [];
  const paperCount = items.reduce((sum,row)=>sum+(Number(row?.paper_present||0)===1?1:0),0);
  const metadataCount = items.reduce((sum,row)=>sum+(Number(row?.metadata_present||0)===1?1:0),0);
  if (paperCount !== Number(head.paper_count || 0) || metadataCount !== Number(head.metadata_count || 0)) {
    return { ready:false, reason:'row_count_mismatch' };
  }

  let state;
  try { state = rebuildUserLibraryState(head, items); }
  catch { return { ready:false, reason:'row_rebuild_failed' }; }
  if (Number(head.shadow_version || 0) < 2) {
    const rebuiltHash = await sha256Hex(stableStateJson(state));
    if (rebuiltHash !== String(head.source_state_hash || '')) {
      return { ready:false, reason:'row_source_hash_mismatch' };
    }
  }
  return {
    ready:true,
    readPath:'rows',
    revision:Number(head.revision || 0),
    updatedAt:Number(head.updated_at || 0),
    state,
    paperRows:items.length,
    compatibilityAuthority:Number(head.shadow_version || 0)>=2?'v3':'legacy',
  };
}

export async function getUserLibraryShadowStatus(env) {
  if (!env?.DB) return {status:503,body:{error:'user_library_shadow_db_missing'}};
  const [legacy,head,legacyHead,v3CompatHead,papers,mismatch,backfill] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS count FROM user_library_state').first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM user_library_head').first(),
    env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM user_library_head head
      INNER JOIN user_library_state legacy ON legacy.user_id=head.user_id
    `).first(),
    env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM user_library_head head
      INNER JOIN user_library_v3_authority authority ON authority.user_id=head.user_id
      WHERE authority.authority='v3'
    `).first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM user_paper_state').first(),
    env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM user_library_state legacy
      LEFT JOIN user_library_head shadow ON shadow.user_id=legacy.user_id
      WHERE shadow.user_id IS NULL OR shadow.revision<>legacy.revision OR shadow.updated_at<>legacy.updated_at
    `).first(),
    env.DB.prepare(`
      SELECT cursor_user_id,complete,scanned_users,synced_users,skipped_stale,invalid_states,
        failed_users,started_at,updated_at,last_error
      FROM user_library_shadow_backfill WHERE id=1
    `).first(),
  ]);
  const legacyUsers=Number(legacy?.count||0);
  const shadowHeads=Number(head?.count||0);
  const legacyShadowHeads=Number(legacyHead?.count||0);
  const v3CompatHeads=Number(v3CompatHead?.count||0);
  const revisionMismatches=Number(mismatch?.count||0);
  const backfillComplete=Number(backfill?.complete||0)===1;
  const backfillHealthy=backfillComplete
    &&Number(backfill?.invalid_states||0)===0
    &&Number(backfill?.failed_users||0)===0
    &&safeText(backfill?.last_error,180)==='';
  const readConfigured=userLibraryRowReadEnabled(env);
  const readPathActive=readConfigured&&userLibraryRowShadowEnabled(env)
    &&backfillHealthy&&legacyUsers===legacyShadowHeads&&revisionMismatches===0;
  return {status:200,body:{
    version:1,shadowVersion:SHADOW_VERSION,
    configured:String(env?.USER_LIBRARY_ROW_SHADOW_ENABLED || '') === '1',
    enabled:userLibraryRowShadowEnabled(env),
    readConfigured,readPathActive,
    legacyUsers,shadowHeads,legacyShadowHeads,v3CompatHeads,paperRows:Number(papers?.count||0),
    revisionMismatches,
    backfill:backfill?{
      complete:Number(backfill.complete||0)===1,
      scannedUsers:Number(backfill.scanned_users||0),syncedUsers:Number(backfill.synced_users||0),
      skippedStale:Number(backfill.skipped_stale||0),invalidStates:Number(backfill.invalid_states||0),
      failedUsers:Number(backfill.failed_users||0),startedAt:Number(backfill.started_at||0),
      updatedAt:Number(backfill.updated_at||0),lastError:safeText(backfill.last_error,180),
    }:{complete:false,scannedUsers:0,syncedUsers:0,skippedStale:0,invalidStates:0,failedUsers:0,startedAt:0,updatedAt:0,lastError:''},
  }};
}

export async function backfillUserLibraryShadowPage(env, limitValue = 20) {
  if (!userLibraryRowShadowEnabled(env)) return {status:409,body:{error:'user_library_row_shadow_disabled'}};
  if (!env?.DB) return {status:503,body:{error:'user_library_shadow_db_missing'}};
  const limit=Math.max(1,Math.min(MAX_BACKFILL_LIMIT,Number(limitValue||20)));
  const now=Date.now();
  let state=await env.DB.prepare(`
    SELECT cursor_user_id,complete,scanned_users,synced_users,skipped_stale,invalid_states,
      failed_users,started_at,updated_at,last_error
    FROM user_library_shadow_backfill WHERE id=1
  `).first();
  if(Number(state?.complete||0)===1){
    return {status:200,body:{ok:true,enabled:true,complete:true,scannedUsers:Number(state.scanned_users||0),
      syncedUsers:Number(state.synced_users||0),skippedStale:Number(state.skipped_stale||0),
      invalidStates:Number(state.invalid_states||0),failedUsers:Number(state.failed_users||0)}};
  }

  const cursor=safeText(state?.cursor_user_id,300);
  const page=await env.DB.prepare(`
    SELECT user_id,state_json,revision,updated_at
    FROM user_library_state
    WHERE (?='' OR user_id>?)
    ORDER BY user_id ASC
    LIMIT ?
  `).bind(cursor,cursor,limit).all();
  const rows=page?.results||[];
  let synced=0,skippedStale=0,invalid=0,failed=0,lastError='';
  for(const row of rows){
    const parsed=parseJson(row?.state_json);
    if(!plainObject(parsed)){invalid+=1;continue;}
    try{
      const result=await shadowWriteUserLibraryState(env,row.user_id,parsed,Number(row.revision||0),Number(row.updated_at||0));
      if(result?.skippedStale) skippedStale+=1;
      else if(result?.written||result?.unchanged) synced+=1;
    }catch(error){
      failed+=1;
      lastError=safeText(error?.message||String(error),180);
    }
  }
  const nextCursor=rows.length?safeText(rows[rows.length-1]?.user_id,300):cursor;
  const complete=rows.length<limit;
  const scannedTotal=Number(state?.scanned_users||0)+rows.length;
  const syncedTotal=Number(state?.synced_users||0)+synced;
  const skippedTotal=Number(state?.skipped_stale||0)+skippedStale;
  const invalidTotal=Number(state?.invalid_states||0)+invalid;
  const failedTotal=Number(state?.failed_users||0)+failed;
  const startedAt=Number(state?.started_at||0)||now;

  await env.DB.prepare(`
    INSERT INTO user_library_shadow_backfill
      (id,cursor_user_id,complete,scanned_users,synced_users,skipped_stale,invalid_states,failed_users,started_at,updated_at,last_error)
    VALUES (1,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      cursor_user_id=excluded.cursor_user_id,complete=excluded.complete,scanned_users=excluded.scanned_users,
      synced_users=excluded.synced_users,skipped_stale=excluded.skipped_stale,invalid_states=excluded.invalid_states,
      failed_users=excluded.failed_users,started_at=user_library_shadow_backfill.started_at,
      updated_at=excluded.updated_at,last_error=excluded.last_error
  `).bind(nextCursor||null,complete?1:0,scannedTotal,syncedTotal,skippedTotal,invalidTotal,failedTotal,startedAt,now,lastError).run();

  return {status:200,body:{
    ok:true,enabled:true,complete,pageUsers:rows.length,pageSynced:synced,pageSkippedStale:skippedStale,
    pageInvalidStates:invalid,pageFailedUsers:failed,scannedUsers:scannedTotal,syncedUsers:syncedTotal,
    skippedStale:skippedTotal,invalidStates:invalidTotal,failedUsers:failedTotal,
  }};
}

async function compareOne(env, legacy) {
  const head=await env.DB.prepare(`
    SELECT user_id,revision,updated_at,global_json,papers_split,metadata_split,paper_count,metadata_count,source_state_hash,shadow_version
    FROM user_library_head WHERE user_id=?
  `).bind(legacy.user_id).first();
  if(!head) return {matched:false,reason:'missing_head'};
  if(Number(head.revision||0)!==Number(legacy.revision||0)||Number(head.updated_at||0)!==Number(legacy.updated_at||0)){
    return {matched:false,reason:'revision_mismatch'};
  }
  const rows=await env.DB.prepare(`
    SELECT paper_key,doi,paper_present,paper_state_json,metadata_present,metadata_json,revision,updated_at
    FROM user_paper_state WHERE user_id=? AND revision=? ORDER BY paper_key ASC
  `).bind(legacy.user_id,head.revision).all();
  const original=parseJson(legacy.state_json);
  if(!plainObject(original)) return {matched:false,reason:'invalid_legacy_state'};
  let rebuilt;
  try{rebuilt=rebuildUserLibraryState(head,rows?.results||[]);}catch{return {matched:false,reason:'rebuild_failed'};}
  const originalHash=await sha256Hex(stableStateJson(original));
  const rebuiltHash=await sha256Hex(stableStateJson(rebuilt));
  if(originalHash!==head.source_state_hash) return {matched:false,reason:'source_hash_mismatch'};
  if(rebuiltHash!==originalHash) return {matched:false,reason:'semantic_mismatch'};
  return {matched:true};
}

export async function compareUserLibraryShadowPage(env, offsetValue = 0, limitValue = 20) {
  if (!userLibraryRowShadowEnabled(env)) return {status:409,body:{error:'user_library_row_shadow_disabled'}};
  if (!env?.DB) return {status:503,body:{error:'user_library_shadow_db_missing'}};
  const offset=Math.max(0,Math.floor(Number(offsetValue||0)));
  const limit=Math.max(1,Math.min(MAX_COMPARE_LIMIT,Number(limitValue||20)));
  const totals=await getUserLibraryShadowStatus(env);
  const page=await env.DB.prepare(`
    SELECT user_id,state_json,revision,updated_at
    FROM user_library_state
    ORDER BY user_id ASC
    LIMIT ? OFFSET ?
  `).bind(limit,offset).all();
  const rows=page?.results||[];
  const reasons={};
  let matched=0;
  for(const legacy of rows){
    const result=await compareOne(env,legacy);
    if(result.matched) matched+=1;
    else reasons[result.reason]=(reasons[result.reason]||0)+1;
  }
  const nextOffset=offset+rows.length;
  const complete=nextOffset>=Number(totals.body.legacyUsers||0);
  return {status:200,body:{
    version:1,readPathActive:totals.body.readPathActive===true,offset,limit,checked:rows.length,matched,
    mismatched:rows.length-matched,reasons,complete,nextOffset:complete?null:nextOffset,
    legacyUsers:totals.body.legacyUsers,shadowHeads:totals.body.shadowHeads,
    revisionMismatches:totals.body.revisionMismatches,
  }};
}
