const EVIDENCE_PREFIX = 'private/article-evidence-v2/';
const HANDOFF_PREFIX = 'private/article-summary-handoff-v1/';
export const EVIDENCE_INDEX_SCHEMA_VERSION = 'article-evidence-index-v1';
export const EVIDENCE_INDEX_BACKFILL_ID = 1;
export const EVIDENCE_HANDOFF_BACKFILL_ID = 1;

const schemaReadyBindings = new WeakSet();

function safe(value, max = 200) {
  return String(value ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);
}
function normalizeDoi(value) {
  const raw = String(value || '').trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '')
    .replace(/^doi:\s*/i, '');
  return /^10\.\d{4,9}\/\S+$/.test(raw) ? raw.replace(/[).,;]+$/, '') : '';
}
function hash64(value) {
  const text = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(text) ? text : '';
}
async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function idForDoi(doi) {
  return (await sha256Hex(doi)).slice(0, 32);
}
async function evidenceKeyForDoi(doi) {
  return EVIDENCE_PREFIX + await idForDoi(doi) + '.json';
}
async function handoffKeyForDoi(doi) {
  return HANDOFF_PREFIX + await idForDoi(doi) + '.json';
}
export function evidenceIndexShadowEnabled(env) {
  return String(env?.EVIDENCE_INDEX_SHADOW_ENABLED || '') === '1';
}
export function scheduledHandoffIndexReadEnabled(env) {
  return String(env?.SCHEDULED_HANDOFF_INDEX_READ_ENABLED || '') === '1';
}

export async function ensureEvidenceIndexSchema(env) {
  if (!env?.DB) throw new Error('evidence_index_db_missing');
  if (schemaReadyBindings.has(env.DB)) return;
  const statements = [
    `CREATE TABLE IF NOT EXISTS article_evidence_index (
      doi TEXT PRIMARY KEY,
      evidence_r2_key TEXT NOT NULL,
      evidence_packet_hash TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      schema_version TEXT NOT NULL DEFAULT '',
      publisher TEXT NOT NULL DEFAULT '',
      evidence_level TEXT NOT NULL DEFAULT 'unknown',
      text_processing_policy TEXT NOT NULL DEFAULT 'unknown',
      captured_at TEXT NOT NULL DEFAULT '',
      handoff_r2_key TEXT,
      handoff_ready INTEGER NOT NULL DEFAULT 0 CHECK (handoff_ready IN (0,1)),
      handoff_key_id TEXT NOT NULL DEFAULT '',
      handoff_algorithm TEXT NOT NULL DEFAULT '',
      handoff_compression TEXT NOT NULL DEFAULT '',
      indexed_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_article_evidence_index_captured
       ON article_evidence_index(captured_at DESC, doi ASC)`,
    `CREATE INDEX IF NOT EXISTS idx_article_evidence_index_policy
       ON article_evidence_index(text_processing_policy, captured_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_article_evidence_index_handoff
       ON article_evidence_index(handoff_ready, captured_at DESC)`,
    `CREATE TABLE IF NOT EXISTS article_evidence_index_backfill (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      cursor TEXT,
      complete INTEGER NOT NULL DEFAULT 0 CHECK (complete IN (0,1)),
      scanned_objects INTEGER NOT NULL DEFAULT 0,
      indexed_rows INTEGER NOT NULL DEFAULT 0,
      skipped_invalid INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_error TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS article_evidence_handoff_backfill (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      cursor TEXT,
      complete INTEGER NOT NULL DEFAULT 0 CHECK (complete IN (0,1)),
      scanned_objects INTEGER NOT NULL DEFAULT 0,
      matched_rows INTEGER NOT NULL DEFAULT 0,
      stale_or_missing_rows INTEGER NOT NULL DEFAULT 0,
      skipped_invalid INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_error TEXT NOT NULL DEFAULT ''
    )`,
  ];
  for (const sql of statements) await env.DB.prepare(sql).run();
  schemaReadyBindings.add(env.DB);
}

function normalizeEvidenceRow(row) {
  const doi = normalizeDoi(row?.doi);
  const evidencePacketHash = hash64(row?.evidencePacketHash);
  const sourceHash = hash64(row?.sourceHash);
  const evidenceR2Key = safe(row?.evidenceR2Key, 500);
  if (!doi || !evidencePacketHash || !sourceHash || !evidenceR2Key.startsWith(EVIDENCE_PREFIX)) {
    throw new Error('evidence_index_row_invalid');
  }
  return {
    doi,
    evidenceR2Key,
    evidencePacketHash,
    sourceHash,
    schemaVersion: safe(row?.schemaVersion || 'article-evidence-v2', 80),
    publisher: safe(row?.publisher, 40),
    evidenceLevel: safe(row?.evidenceLevel || 'unknown', 40),
    textProcessingPolicy: safe(row?.textProcessingPolicy || 'unknown', 80),
    capturedAt: safe(row?.capturedAt, 80),
    now: Number.isFinite(Number(row?.now)) ? Number(row.now) : Date.now(),
  };
}

const UPSERT_EVIDENCE_SQL = `
  INSERT INTO article_evidence_index (
    doi,evidence_r2_key,evidence_packet_hash,source_hash,schema_version,publisher,
    evidence_level,text_processing_policy,captured_at,handoff_r2_key,handoff_ready,
    handoff_key_id,handoff_algorithm,handoff_compression,indexed_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,NULL,0,'','','',?,?)
  ON CONFLICT(doi) DO UPDATE SET
    evidence_r2_key=excluded.evidence_r2_key,
    schema_version=excluded.schema_version,
    publisher=excluded.publisher,
    evidence_level=excluded.evidence_level,
    text_processing_policy=excluded.text_processing_policy,
    captured_at=excluded.captured_at,
    indexed_at=excluded.indexed_at,
    updated_at=excluded.updated_at,
    handoff_r2_key=CASE
      WHEN article_evidence_index.evidence_packet_hash=excluded.evidence_packet_hash
       AND article_evidence_index.source_hash=excluded.source_hash
      THEN article_evidence_index.handoff_r2_key ELSE NULL END,
    handoff_ready=CASE
      WHEN article_evidence_index.evidence_packet_hash=excluded.evidence_packet_hash
       AND article_evidence_index.source_hash=excluded.source_hash
      THEN article_evidence_index.handoff_ready ELSE 0 END,
    handoff_key_id=CASE
      WHEN article_evidence_index.evidence_packet_hash=excluded.evidence_packet_hash
       AND article_evidence_index.source_hash=excluded.source_hash
      THEN article_evidence_index.handoff_key_id ELSE '' END,
    handoff_algorithm=CASE
      WHEN article_evidence_index.evidence_packet_hash=excluded.evidence_packet_hash
       AND article_evidence_index.source_hash=excluded.source_hash
      THEN article_evidence_index.handoff_algorithm ELSE '' END,
    handoff_compression=CASE
      WHEN article_evidence_index.evidence_packet_hash=excluded.evidence_packet_hash
       AND article_evidence_index.source_hash=excluded.source_hash
      THEN article_evidence_index.handoff_compression ELSE '' END,
    evidence_packet_hash=excluded.evidence_packet_hash,
    source_hash=excluded.source_hash
`;

function bindEvidenceStatement(env, row) {
  const n = normalizeEvidenceRow(row);
  return env.DB.prepare(UPSERT_EVIDENCE_SQL).bind(
    n.doi,n.evidenceR2Key,n.evidencePacketHash,n.sourceHash,n.schemaVersion,n.publisher,
    n.evidenceLevel,n.textProcessingPolicy,n.capturedAt,n.now,n.now,
  );
}

export async function shadowIndexEvidence(env, row) {
  if (!evidenceIndexShadowEnabled(env)) return { enabled:false, indexed:false };
  if (!env?.DB) return { enabled:true, indexed:false, error:'evidence_index_db_missing' };
  try {
    await ensureEvidenceIndexSchema(env);
    await bindEvidenceStatement(env,row).run();
    return { enabled:true, indexed:true, doi:normalizeDoi(row?.doi) };
  } catch (error) {
    return { enabled:true, indexed:false, error:safe(error?.message || error,180) };
  }
}

export async function shadowIndexHandoff(env, envelope) {
  if (!evidenceIndexShadowEnabled(env)) return { enabled:false, indexed:false };
  if (!env?.DB) return { enabled:true, indexed:false, error:'evidence_index_db_missing' };
  try {
    await ensureEvidenceIndexSchema(env);
    const doi = normalizeDoi(envelope?.doi);
    const evidencePacketHash = hash64(envelope?.evidencePacketHash);
    const sourceHash = hash64(envelope?.sourceHash);
    if (!doi || !evidencePacketHash || !sourceHash) throw new Error('evidence_index_handoff_invalid');
    const evidenceKey = await evidenceKeyForDoi(doi);
    const handoffKey = await handoffKeyForDoi(doi);
    const now = Date.now();
    const result = await env.DB.prepare(`
      INSERT INTO article_evidence_index (
        doi,evidence_r2_key,evidence_packet_hash,source_hash,schema_version,publisher,
        evidence_level,text_processing_policy,captured_at,handoff_r2_key,handoff_ready,
        handoff_key_id,handoff_algorithm,handoff_compression,indexed_at,updated_at
      ) VALUES (?,?,?,?,?,'',?,'unknown',?,?,1,?,?,?, ?,?)
      ON CONFLICT(doi) DO UPDATE SET
        handoff_r2_key=excluded.handoff_r2_key,
        handoff_ready=1,
        handoff_key_id=excluded.handoff_key_id,
        handoff_algorithm=excluded.handoff_algorithm,
        handoff_compression=excluded.handoff_compression,
        updated_at=excluded.updated_at
      WHERE article_evidence_index.evidence_packet_hash=excluded.evidence_packet_hash
        AND article_evidence_index.source_hash=excluded.source_hash
    `).bind(
      doi,evidenceKey,evidencePacketHash,sourceHash,'article-evidence-v2',
      safe(envelope?.evidenceLevel || 'unknown',40),safe(envelope?.capturedAt,80),
      handoffKey,safe(envelope?.keyId,80),safe(envelope?.algorithm,120),
      safe(envelope?.compression,40),now,now,
    ).run();
    const changed = Number(result?.meta?.changes || 0) > 0;
    return { enabled:true, indexed:changed, stale:!changed, doi };
  } catch (error) {
    return { enabled:true, indexed:false, error:safe(error?.message || error,180) };
  }
}

function rowFromObject(object) {
  const meta = object?.customMetadata || {};
  const doi = normalizeDoi(meta.doi);
  const evidencePacketHash = hash64(meta.evidencePacketHash);
  const sourceHash = hash64(meta.sourceHash);
  if (!doi || !evidencePacketHash || !sourceHash || !String(object?.key || '').startsWith(EVIDENCE_PREFIX)) return null;
  return {
    doi,
    evidenceR2Key:String(object.key),
    evidencePacketHash,
    sourceHash,
    schemaVersion:safe(meta.schemaVersion || 'article-evidence-v2',80),
    publisher:safe(meta.publisher,40),
    capturedAt:safe(meta.capturedAt,80),
    textProcessingPolicy:safe(meta.textProcessingPolicy || 'unknown',80),
    evidenceLevel:safe(meta.evidenceLevel || 'unknown',40),
  };
}

function handoffRowFromObject(object) {
  const meta = object?.customMetadata || {};
  const doi = normalizeDoi(meta.doi);
  const evidencePacketHash = hash64(meta.evidencePacketHash);
  const sourceHash = hash64(meta.sourceHash);
  const handoffR2Key = safe(object?.key,500);
  const keyId = safe(meta.keyId,80);
  const algorithm = safe(meta.algorithm,120);
  const compression = safe(meta.compression,40);
  if (!doi || !evidencePacketHash || !sourceHash || !handoffR2Key.startsWith(HANDOFF_PREFIX)
    || !keyId || !algorithm || !compression) return null;
  return {
    doi,evidencePacketHash,sourceHash,handoffR2Key,keyId,algorithm,compression,
  };
}

function bindHandoffBackfillStatement(env, row, now) {
  return env.DB.prepare(`
    UPDATE article_evidence_index
    SET handoff_r2_key=?,handoff_ready=1,handoff_key_id=?,handoff_algorithm=?,
      handoff_compression=?,updated_at=?
    WHERE doi=? AND evidence_packet_hash=? AND source_hash=?
  `).bind(
    row.handoffR2Key,row.keyId,row.algorithm,row.compression,now,
    row.doi,row.evidencePacketHash,row.sourceHash,
  );
}

export async function backfillEvidenceIndexPage(env, limitValue = 500) {
  if (!evidenceIndexShadowEnabled(env)) {
    return { status:409, body:{ error:'evidence_index_shadow_disabled', enabled:false } };
  }
  if (!env?.DB || !env?.MEDIA) {
    return { status:503, body:{ error:'evidence_index_storage_unavailable' } };
  }
  await ensureEvidenceIndexSchema(env);
  const limit = Math.max(1, Math.min(1000, Number(limitValue || 500)));
  const now = Date.now();
  let state = await env.DB.prepare(
    'SELECT cursor,complete,scanned_objects,indexed_rows,skipped_invalid,started_at,updated_at,last_error FROM article_evidence_index_backfill WHERE id=1'
  ).first();
  if (Number(state?.complete || 0) === 1) {
    return { status:200, body:{ ok:true, enabled:true, complete:true, cursor:null,
      scannedObjects:Number(state.scanned_objects||0), indexedRows:Number(state.indexed_rows||0),
      skippedInvalid:Number(state.skipped_invalid||0) } };
  }
  const cursor = safe(state?.cursor,1000);
  let page;
  try {
    page = await env.MEDIA.list({
      prefix:EVIDENCE_PREFIX, limit,
      ...(cursor ? { cursor } : {}),
      include:['customMetadata'],
    });
  } catch (error) {
    const message=safe(error?.message || error,180);
    if (state) await env.DB.prepare(
      'UPDATE article_evidence_index_backfill SET last_error=?,updated_at=? WHERE id=1'
    ).bind(message,now).run();
    return { status:502, body:{ error:'evidence_index_backfill_list_failed', detail:message } };
  }
  const objects=Array.isArray(page?.objects)?page.objects:[];
  const rows=[];let skipped=0;
  for (const object of objects) {
    const row=rowFromObject(object);
    if (row) rows.push(row); else skipped++;
  }
  if (rows.length) {
    const statements=rows.map(row=>bindEvidenceStatement(env,{...row,now}));
    if (typeof env.DB.batch === 'function') await env.DB.batch(statements);
    else for (const statement of statements) await statement.run();
  }
  const truncated=Boolean(page?.truncated);
  const nextCursor=truncated ? safe(page?.cursor,1000) : '';
  if (truncated && !nextCursor) throw new Error('evidence_index_backfill_cursor_missing');
  const scannedTotal=Number(state?.scanned_objects||0)+objects.length;
  const indexedTotal=Number(state?.indexed_rows||0)+rows.length;
  const skippedTotal=Number(state?.skipped_invalid||0)+skipped;
  const startedAt=Number(state?.started_at||0)||now;
  await env.DB.prepare(`
    INSERT INTO article_evidence_index_backfill
      (id,cursor,complete,scanned_objects,indexed_rows,skipped_invalid,started_at,updated_at,last_error)
    VALUES (1,?,?,?,?,?,?,?,'')
    ON CONFLICT(id) DO UPDATE SET
      cursor=excluded.cursor,complete=excluded.complete,scanned_objects=excluded.scanned_objects,
      indexed_rows=excluded.indexed_rows,skipped_invalid=excluded.skipped_invalid,
      started_at=article_evidence_index_backfill.started_at,updated_at=excluded.updated_at,last_error=''
  `).bind(nextCursor||null,truncated?0:1,scannedTotal,indexedTotal,skippedTotal,startedAt,now).run();
  return { status:200, body:{ ok:true,enabled:true,complete:!truncated,cursor:nextCursor||null,
    pageObjects:objects.length,pageIndexed:rows.length,pageSkippedInvalid:skipped,
    scannedObjects:scannedTotal,indexedRows:indexedTotal,skippedInvalid:skippedTotal } };
}

export async function backfillEvidenceHandoffIndexPage(env, limitValue = 500) {
  if (!evidenceIndexShadowEnabled(env)) {
    return { status:409, body:{ error:'evidence_index_shadow_disabled', enabled:false } };
  }
  if (!env?.DB || !env?.MEDIA) {
    return { status:503, body:{ error:'evidence_handoff_index_storage_unavailable' } };
  }
  await ensureEvidenceIndexSchema(env);
  const limit=Math.max(1,Math.min(1000,Number(limitValue||500)));
  const now=Date.now();
  let state=await env.DB.prepare(
    'SELECT cursor,complete,scanned_objects,matched_rows,stale_or_missing_rows,skipped_invalid,started_at,updated_at,last_error FROM article_evidence_handoff_backfill WHERE id=1'
  ).first();
  if(Number(state?.complete||0)===1){
    return {status:200,body:{ok:true,enabled:true,complete:true,cursor:null,
      scannedObjects:Number(state.scanned_objects||0),matchedRows:Number(state.matched_rows||0),
      staleOrMissingRows:Number(state.stale_or_missing_rows||0),skippedInvalid:Number(state.skipped_invalid||0)}};
  }
  const cursor=safe(state?.cursor,1000);
  let page;
  try{
    page=await env.MEDIA.list({
      prefix:HANDOFF_PREFIX,limit,...(cursor?{cursor}:{}),include:['customMetadata'],
    });
  }catch(error){
    const message=safe(error?.message||error,180);
    if(state) await env.DB.prepare(
      'UPDATE article_evidence_handoff_backfill SET last_error=?,updated_at=? WHERE id=1'
    ).bind(message,now).run();
    return {status:502,body:{error:'evidence_handoff_backfill_list_failed',detail:message}};
  }
  const objects=Array.isArray(page?.objects)?page.objects:[];
  const rows=[];let skipped=0;
  for(const object of objects){
    const row=handoffRowFromObject(object);
    if(row) rows.push(row); else skipped+=1;
  }
  let matched=0,staleOrMissing=0;
  if(rows.length){
    if(typeof env.DB.batch==='function'){
      const results=await env.DB.batch(rows.map(row=>bindHandoffBackfillStatement(env,row,now)));
      for(const result of results){
        const changes=Number(result?.meta?.changes||0);
        if(changes>0) matched+=1; else staleOrMissing+=1;
      }
    }else{
      for(const row of rows){
        const result=await bindHandoffBackfillStatement(env,row,now).run();
        const changes=Number(result?.meta?.changes||0);
        if(changes>0) matched+=1; else staleOrMissing+=1;
      }
    }
  }
  const truncated=Boolean(page?.truncated);
  const nextCursor=truncated?safe(page?.cursor,1000):'';
  if(truncated&&!nextCursor) throw new Error('evidence_handoff_backfill_cursor_missing');
  const scannedTotal=Number(state?.scanned_objects||0)+objects.length;
  const matchedTotal=Number(state?.matched_rows||0)+matched;
  const staleTotal=Number(state?.stale_or_missing_rows||0)+staleOrMissing;
  const skippedTotal=Number(state?.skipped_invalid||0)+skipped;
  const startedAt=Number(state?.started_at||0)||now;
  await env.DB.prepare(`
    INSERT INTO article_evidence_handoff_backfill
      (id,cursor,complete,scanned_objects,matched_rows,stale_or_missing_rows,
       skipped_invalid,started_at,updated_at,last_error)
    VALUES (1,?,?,?,?,?,?,?,?,'')
    ON CONFLICT(id) DO UPDATE SET
      cursor=excluded.cursor,complete=excluded.complete,scanned_objects=excluded.scanned_objects,
      matched_rows=excluded.matched_rows,stale_or_missing_rows=excluded.stale_or_missing_rows,
      skipped_invalid=excluded.skipped_invalid,
      started_at=article_evidence_handoff_backfill.started_at,
      updated_at=excluded.updated_at,last_error=''
  `).bind(nextCursor||null,truncated?0:1,scannedTotal,matchedTotal,staleTotal,skippedTotal,startedAt,now).run();
  return {status:200,body:{ok:true,enabled:true,complete:!truncated,cursor:nextCursor||null,
    pageObjects:objects.length,pageMatched:matched,pageStaleOrMissing:staleOrMissing,pageSkippedInvalid:skipped,
    scannedObjects:scannedTotal,matchedRows:matchedTotal,staleOrMissingRows:staleTotal,skippedInvalid:skippedTotal}};
}

export async function listEvidenceHandoffIndexRows(env, { ready = true, limit = 1000, offset = 0 } = {}) {
  if (!evidenceIndexShadowEnabled(env)) return {status:409,body:{error:'evidence_index_shadow_disabled'}};
  if (!env?.DB) return {status:503,body:{error:'evidence_index_db_missing'}};
  await ensureEvidenceIndexSchema(env);
  const boundedLimit=Math.max(1,Math.min(1000,Number(limit||1000)));
  const boundedOffset=Math.max(0,Math.floor(Number(offset||0)));
  const result=await env.DB.prepare(`
    SELECT doi,evidence_r2_key,evidence_packet_hash,source_hash,evidence_level,
      text_processing_policy,captured_at,handoff_r2_key,handoff_ready,
      handoff_key_id,handoff_algorithm,handoff_compression
    FROM article_evidence_index
    WHERE handoff_ready=?
    ORDER BY captured_at DESC, doi ASC
    LIMIT ? OFFSET ?
  `).bind(ready?1:0,boundedLimit,boundedOffset).all();
  return {status:200,body:{version:1,schemaVersion:EVIDENCE_INDEX_SCHEMA_VERSION,
    readPathActive:false,handoffReadPathActive:scheduledHandoffIndexReadEnabled(env),
    ready:Boolean(ready),offset:boundedOffset,
    count:Array.isArray(result?.results)?result.results.length:0,items:result?.results||[]}};
}

export async function getEvidenceIndexStatus(env) {
  if (!evidenceIndexShadowEnabled(env)) {
    return { status:200, body:{ version:1,schemaVersion:EVIDENCE_INDEX_SCHEMA_VERSION,enabled:false,readPathActive:false } };
  }
  if (!env?.DB) return { status:503, body:{ error:'evidence_index_db_missing' } };
  await ensureEvidenceIndexSchema(env);
  const counts = await env.DB.prepare(`
    SELECT COUNT(*) AS evidence_count,
      SUM(CASE WHEN handoff_ready=1 THEN 1 ELSE 0 END) AS handoff_ready_count,
      SUM(CASE WHEN text_processing_policy='no_external_ai' THEN 1 ELSE 0 END) AS policy_blocked_count,
      MAX(updated_at) AS latest_updated_at
    FROM article_evidence_index
  `).first();
  const state = await env.DB.prepare(
    'SELECT cursor,complete,scanned_objects,indexed_rows,skipped_invalid,started_at,updated_at,last_error FROM article_evidence_index_backfill WHERE id=1'
  ).first();
  const handoffState = await env.DB.prepare(
    'SELECT cursor,complete,scanned_objects,matched_rows,stale_or_missing_rows,skipped_invalid,started_at,updated_at,last_error FROM article_evidence_handoff_backfill WHERE id=1'
  ).first();
  const evidenceBackfillComplete=Number(state?.complete||0)===1;
  const handoffBackfillComplete=Number(handoffState?.complete||0)===1;
  const handoffReadPathReady=evidenceBackfillComplete&&handoffBackfillComplete;
  return { status:200, body:{
    version:1,schemaVersion:EVIDENCE_INDEX_SCHEMA_VERSION,enabled:true,readPathActive:false,
    handoffReadPathReady,
    handoffReadPathActive:scheduledHandoffIndexReadEnabled(env)&&handoffReadPathReady,
    evidenceCount:Number(counts?.evidence_count||0),
    handoffReadyCount:Number(counts?.handoff_ready_count||0),
    policyBlockedCount:Number(counts?.policy_blocked_count||0),
    latestUpdatedAt:Number(counts?.latest_updated_at||0),
    backfill: state ? {
      complete:Number(state.complete||0)===1,cursor:safe(state.cursor,1000)||null,
      scannedObjects:Number(state.scanned_objects||0),indexedRows:Number(state.indexed_rows||0),
      skippedInvalid:Number(state.skipped_invalid||0),startedAt:Number(state.started_at||0),
      updatedAt:Number(state.updated_at||0),lastError:safe(state.last_error,180),
    } : { complete:false,cursor:null,scannedObjects:0,indexedRows:0,skippedInvalid:0,startedAt:0,updatedAt:0,lastError:'' },
    handoffBackfill: handoffState ? {
      complete:Number(handoffState.complete||0)===1,cursor:safe(handoffState.cursor,1000)||null,
      scannedObjects:Number(handoffState.scanned_objects||0),matchedRows:Number(handoffState.matched_rows||0),
      staleOrMissingRows:Number(handoffState.stale_or_missing_rows||0),
      skippedInvalid:Number(handoffState.skipped_invalid||0),startedAt:Number(handoffState.started_at||0),
      updatedAt:Number(handoffState.updated_at||0),lastError:safe(handoffState.last_error,180),
    } : {complete:false,cursor:null,scannedObjects:0,matchedRows:0,staleOrMissingRows:0,
      skippedInvalid:0,startedAt:0,updatedAt:0,lastError:''},
  } };
}

export async function listEvidenceIndexRows(env, limitValue = 100) {
  if (!evidenceIndexShadowEnabled(env)) return { status:409, body:{ error:'evidence_index_shadow_disabled' } };
  if (!env?.DB) return { status:503, body:{ error:'evidence_index_db_missing' } };
  await ensureEvidenceIndexSchema(env);
  const limit=Math.max(1,Math.min(1000,Number(limitValue||100)));
  const result=await env.DB.prepare(`
    SELECT doi,evidence_r2_key,evidence_packet_hash,source_hash,schema_version,publisher,
      evidence_level,text_processing_policy,captured_at,handoff_r2_key,handoff_ready,
      handoff_key_id,handoff_algorithm,handoff_compression,indexed_at,updated_at
    FROM article_evidence_index
    ORDER BY captured_at DESC, doi ASC
    LIMIT ?
  `).bind(limit).all();
  return { status:200, body:{ version:1,schemaVersion:EVIDENCE_INDEX_SCHEMA_VERSION,readPathActive:false,
    count:Array.isArray(result?.results)?result.results.length:0,items:result?.results||[] } };
}
