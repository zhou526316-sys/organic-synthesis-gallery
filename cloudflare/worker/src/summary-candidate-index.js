const JOB_PREFIX = 'private/article-summary-jobs/';
export const SUMMARY_CANDIDATE_INDEX_SCHEMA_VERSION = 'summary-candidate-index-v1';
export const SUMMARY_JOB_BACKFILL_ID = 1;

const schemaReadyBindings = new WeakSet();

function safe(value, max = 240) {
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
function integer(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}
function evidenceLevelRank(value) {
  return value === 'complete' ? 0 : value === 'partial' ? 1 : 2;
}
function policyAllowsExternalAi(env, policy) {
  if (policy === 'no_external_ai') return false;
  if (policy === 'unknown') return String(env?.SUMMARY_ALLOW_UNKNOWN_POLICY || '') === '1';
  return ['open_access', 'private_cache_allowed', 'transient_processing_only'].includes(policy);
}
export function summaryCandidateIndexShadowEnabled(env) {
  return String(env?.SUMMARY_CANDIDATE_INDEX_SHADOW_ENABLED || '') === '1';
}

export async function ensureSummaryCandidateIndexSchema(env) {
  if (!env?.DB) throw new Error('summary_candidate_index_db_missing');
  if (schemaReadyBindings.has(env.DB)) return;
  const statements = [
    `CREATE TABLE IF NOT EXISTS summary_review_job_index (
      doi TEXT PRIMARY KEY,
      job_r2_key TEXT NOT NULL,
      evidence_packet_hash TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT '',
      evidence_level TEXT NOT NULL DEFAULT 'unknown',
      text_processing_policy TEXT NOT NULL DEFAULT 'unknown',
      captured_at TEXT NOT NULL DEFAULT '',
      next_retry_at INTEGER NOT NULL DEFAULT 0,
      lease_expires_at INTEGER NOT NULL DEFAULT 0,
      published_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      indexed_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_summary_review_job_state
      ON summary_review_job_index(state, updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_summary_review_job_published
      ON summary_review_job_index(published_at DESC, doi ASC)`,
    `CREATE INDEX IF NOT EXISTS idx_summary_review_job_retry
      ON summary_review_job_index(state, next_retry_at, lease_expires_at)`,
    `CREATE TABLE IF NOT EXISTS summary_review_job_index_backfill (
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
  ];
  for (const sql of statements) await env.DB.prepare(sql).run();
  schemaReadyBindings.add(env.DB);
}

function normalizeJobRow(row) {
  const doi = normalizeDoi(row?.doi);
  const evidencePacketHash = hash64(row?.evidencePacketHash);
  const sourceHash = hash64(row?.sourceHash);
  const jobR2Key = safe(row?.jobR2Key, 500);
  if (!doi || !evidencePacketHash || !sourceHash || !jobR2Key.startsWith(JOB_PREFIX)) {
    throw new Error('summary_candidate_job_row_invalid');
  }
  return {
    doi, jobR2Key, evidencePacketHash, sourceHash,
    state:safe(row?.state,40),
    evidenceLevel:safe(row?.evidenceLevel || 'unknown',40),
    textProcessingPolicy:safe(row?.textProcessingPolicy || 'unknown',80),
    capturedAt:safe(row?.capturedAt,80),
    nextRetryAt:integer(row?.nextRetryAt),
    leaseExpiresAt:integer(row?.leaseExpiresAt),
    publishedAt:integer(row?.publishedAt),
    updatedAt:integer(row?.updatedAt || Date.now()),
    indexedAt:integer(row?.indexedAt || Date.now()),
  };
}
const UPSERT_JOB_SQL = `
  INSERT INTO summary_review_job_index (
    doi,job_r2_key,evidence_packet_hash,source_hash,state,evidence_level,
    text_processing_policy,captured_at,next_retry_at,lease_expires_at,
    published_at,updated_at,indexed_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(doi) DO UPDATE SET
    job_r2_key=excluded.job_r2_key,
    evidence_packet_hash=excluded.evidence_packet_hash,
    source_hash=excluded.source_hash,
    state=excluded.state,
    evidence_level=excluded.evidence_level,
    text_processing_policy=excluded.text_processing_policy,
    captured_at=excluded.captured_at,
    next_retry_at=excluded.next_retry_at,
    lease_expires_at=excluded.lease_expires_at,
    published_at=excluded.published_at,
    updated_at=excluded.updated_at,
    indexed_at=excluded.indexed_at
  WHERE excluded.updated_at >= summary_review_job_index.updated_at
`;
function bindJobStatement(env,row) {
  const n=normalizeJobRow(row);
  return env.DB.prepare(UPSERT_JOB_SQL).bind(
    n.doi,n.jobR2Key,n.evidencePacketHash,n.sourceHash,n.state,n.evidenceLevel,
    n.textProcessingPolicy,n.capturedAt,n.nextRetryAt,n.leaseExpiresAt,
    n.publishedAt,n.updatedAt,n.indexedAt,
  );
}

export async function shadowIndexSummaryJob(env, job, jobR2Key) {
  if (!summaryCandidateIndexShadowEnabled(env)) return { enabled:false,indexed:false };
  if (!env?.DB) return { enabled:true,indexed:false,error:'summary_candidate_index_db_missing' };
  try {
    await ensureSummaryCandidateIndexSchema(env);
    const row={
      doi:job?.doi,jobR2Key,evidencePacketHash:job?.evidencePacketHash,sourceHash:job?.sourceHash,
      state:job?.state,evidenceLevel:job?.evidenceLevel,textProcessingPolicy:job?.textProcessingPolicy,
      capturedAt:job?.capturedAt,nextRetryAt:job?.nextRetryAt,leaseExpiresAt:job?.leaseExpiresAt,
      publishedAt:job?.publishedAt,updatedAt:job?.updatedAt,indexedAt:Date.now(),
    };
    const result=await bindJobStatement(env,row).run();
    return { enabled:true,indexed:Number(result?.meta?.changes||0)>0,doi:normalizeDoi(job?.doi) };
  } catch(error) {
    return { enabled:true,indexed:false,error:safe(error?.message||error,180) };
  }
}
function rowFromObject(object) {
  const meta=object?.customMetadata||{};
  const doi=normalizeDoi(meta.doi),evidencePacketHash=hash64(meta.evidencePacketHash),sourceHash=hash64(meta.sourceHash);
  if(!doi||!evidencePacketHash||!sourceHash||!String(object?.key||'').startsWith(JOB_PREFIX)) return null;
  return {
    doi,jobR2Key:String(object.key),evidencePacketHash,sourceHash,
    state:safe(meta.state,40),evidenceLevel:safe(meta.evidenceLevel||'unknown',40),
    textProcessingPolicy:safe(meta.textProcessingPolicy||'unknown',80),capturedAt:safe(meta.capturedAt,80),
    nextRetryAt:integer(meta.nextRetryAt),leaseExpiresAt:integer(meta.leaseExpiresAt),
    publishedAt:integer(meta.publishedAt),updatedAt:integer(meta.updatedAt),indexedAt:Date.now(),
  };
}
export async function backfillSummaryJobIndexPage(env, limitValue=500) {
  if(!summaryCandidateIndexShadowEnabled(env)) return {status:409,body:{error:'summary_candidate_index_shadow_disabled',enabled:false}};
  if(!env?.DB||!env?.MEDIA) return {status:503,body:{error:'summary_candidate_index_storage_unavailable'}};
  await ensureSummaryCandidateIndexSchema(env);
  const limit=Math.max(1,Math.min(1000,Number(limitValue||500)));
  const now=Date.now();
  let state=await env.DB.prepare(
    'SELECT cursor,complete,scanned_objects,indexed_rows,skipped_invalid,started_at,updated_at,last_error FROM summary_review_job_index_backfill WHERE id=1'
  ).first();
  if(Number(state?.complete||0)===1) return {status:200,body:{ok:true,enabled:true,complete:true,cursor:null,
    scannedObjects:Number(state.scanned_objects||0),indexedRows:Number(state.indexed_rows||0),skippedInvalid:Number(state.skipped_invalid||0)}};
  const cursor=safe(state?.cursor,1000);
  let page;
  try {
    page=await env.MEDIA.list({prefix:JOB_PREFIX,limit,...(cursor?{cursor}:{}),include:['customMetadata']});
  } catch(error) {
    const message=safe(error?.message||error,180);
    if(state) await env.DB.prepare('UPDATE summary_review_job_index_backfill SET last_error=?,updated_at=? WHERE id=1')
      .bind(message,now).run();
    return {status:502,body:{error:'summary_candidate_job_backfill_list_failed',detail:message}};
  }
  const objects=Array.isArray(page?.objects)?page.objects:[],rows=[];let skipped=0;
  for(const object of objects){const row=rowFromObject(object);if(row)rows.push(row);else skipped++;}
  if(rows.length){
    const statements=rows.map(row=>bindJobStatement(env,row));
    if(typeof env.DB.batch==='function') await env.DB.batch(statements);
    else for(const statement of statements) await statement.run();
  }
  const truncated=Boolean(page?.truncated),nextCursor=truncated?safe(page?.cursor,1000):'';
  if(truncated&&!nextCursor) throw new Error('summary_candidate_job_backfill_cursor_missing');
  const scannedTotal=Number(state?.scanned_objects||0)+objects.length;
  const indexedTotal=Number(state?.indexed_rows||0)+rows.length;
  const skippedTotal=Number(state?.skipped_invalid||0)+skipped;
  const startedAt=Number(state?.started_at||0)||now;
  await env.DB.prepare(`
    INSERT INTO summary_review_job_index_backfill
      (id,cursor,complete,scanned_objects,indexed_rows,skipped_invalid,started_at,updated_at,last_error)
    VALUES (1,?,?,?,?,?,?,?,'')
    ON CONFLICT(id) DO UPDATE SET
      cursor=excluded.cursor,complete=excluded.complete,scanned_objects=excluded.scanned_objects,
      indexed_rows=excluded.indexed_rows,skipped_invalid=excluded.skipped_invalid,
      started_at=summary_review_job_index_backfill.started_at,updated_at=excluded.updated_at,last_error=''
  `).bind(nextCursor||null,truncated?0:1,scannedTotal,indexedTotal,skippedTotal,startedAt,now).run();
  return {status:200,body:{ok:true,enabled:true,complete:!truncated,cursor:nextCursor||null,
    pageObjects:objects.length,pageIndexed:rows.length,pageSkippedInvalid:skipped,
    scannedObjects:scannedTotal,indexedRows:indexedTotal,skippedInvalid:skippedTotal}};
}

export async function selectCandidateFromIndexedRows({evidenceRows=[],jobRows=[],now=Date.now(),preferredDoi='',allowUnknownPolicy=false}={}) {
  const env={SUMMARY_ALLOW_UNKNOWN_POLICY:allowUnknownPolicy?'1':'0'};
  const jobsByDoi=new Map();
  for(const row of jobRows){
    const doi=normalizeDoi(row?.doi);
    if(doi) jobsByDoi.set(doi,row);
  }
  const blockedPolicies={},candidates=[];
  for(const row of evidenceRows){
    const doi=normalizeDoi(row?.doi),hash=hash64(row?.evidence_packet_hash),sourceHash=hash64(row?.source_hash);
    if(!doi||!hash||!sourceHash) continue;
    const policy=String(row?.text_processing_policy||'unknown');
    if(!policyAllowsExternalAi(env,policy)){blockedPolicies[policy]=(blockedPolicies[policy]||0)+1;continue;}
    const existing=jobsByDoi.get(doi);
    if(existing&&String(existing.evidence_packet_hash||'')===hash){
      const state=String(existing.state||'');
      if(['published','needs_manual_review','rejected'].includes(state)) continue;
      if(state==='processing'&&integer(existing.lease_expires_at)>now) continue;
      if(state==='retry_wait'&&integer(existing.next_retry_at)>now) continue;
    }
    candidates.push({
      doi,evidenceKey:String(row.evidence_r2_key||''),evidencePacketHash:hash,sourceHash,
      evidenceLevel:String(row.evidence_level||'unknown'),textProcessingPolicy:policy,
      capturedAt:String(row.captured_at||''),existingJobKey:existing?String(existing.job_r2_key||''):'',
    });
  }
  candidates.sort((a,b)=>{
    const dateDelta=String(b.capturedAt||'').localeCompare(String(a.capturedAt||''));if(dateDelta)return dateDelta;
    const levelDelta=evidenceLevelRank(a.evidenceLevel)-evidenceLevelRank(b.evidenceLevel);if(levelDelta)return levelDelta;
    return a.doi.localeCompare(b.doi);
  });
  const recentPublishedCount=jobRows.filter(row=>String(row?.state||'')==='published'&&integer(row?.published_at)>=now-86400000).length;
  const candidateSetHash=await sha256Hex(JSON.stringify(candidates));
  const preferred=normalizeDoi(preferredDoi)||'';
  const selectedCandidate=preferred?candidates.find(candidate=>candidate.doi===preferred)||null:candidates[0]||null;
  return {
    candidate:selectedCandidate,evidenceCount:evidenceRows.length,jobCount:jobRows.length,eligibleCount:candidates.length,
    preferredDoi:preferred,preferredEligible:preferred?Boolean(selectedCandidate):null,recentPublishedCount,candidateSetHash,blockedPolicies,
  };
}

export const SUMMARY_CANDIDATE_BOUNDED_PAGE_SIZE = 64;
export const SUMMARY_CANDIDATE_BOUNDED_MAX_PAGES = 4;
export const SUMMARY_CANDIDATE_BOUNDED_MAX_ROWS =
  SUMMARY_CANDIDATE_BOUNDED_PAGE_SIZE * SUMMARY_CANDIDATE_BOUNDED_MAX_PAGES;

function candidateFromJoinedRow(env,row,now){
  const doi=normalizeDoi(row?.doi);
  const evidencePacketHash=hash64(row?.evidence_packet_hash);
  const sourceHash=hash64(row?.source_hash);
  if(!doi||!evidencePacketHash||!sourceHash) return {candidate:null,invalid:true};
  const policy=String(row?.text_processing_policy||'unknown');
  if(!policyAllowsExternalAi(env,policy)) return {candidate:null,blockedPolicy:policy};
  const jobHash=hash64(row?.job_evidence_packet_hash);
  if(jobHash&&jobHash===evidencePacketHash){
    const state=String(row?.job_state||'');
    if(['published','needs_manual_review','rejected'].includes(state)) return {candidate:null,blockedState:state};
    if(state==='processing'&&integer(row?.job_lease_expires_at)>now) return {candidate:null,blockedState:'processing_lease'};
    if(state==='retry_wait'&&integer(row?.job_next_retry_at)>now) return {candidate:null,blockedState:'retry_wait'};
  }
  return {candidate:{
    doi,
    evidenceKey:String(row?.evidence_r2_key||''),
    evidencePacketHash,
    sourceHash,
    evidenceLevel:String(row?.evidence_level||'unknown'),
    textProcessingPolicy:policy,
    capturedAt:String(row?.captured_at||''),
    existingJobKey:String(row?.job_r2_key||''),
  }};
}

const BOUNDED_CANDIDATE_SELECT = `
  SELECT
    e.doi,e.evidence_r2_key,e.evidence_packet_hash,e.source_hash,e.evidence_level,
    e.text_processing_policy,e.captured_at,
    j.job_r2_key,
    j.evidence_packet_hash AS job_evidence_packet_hash,
    j.state AS job_state,
    j.next_retry_at AS job_next_retry_at,
    j.lease_expires_at AS job_lease_expires_at
  FROM article_evidence_index e
  LEFT JOIN summary_review_job_index j ON j.doi=e.doi
`;

async function recentPublishedCountFromIndex(env,now){
  const row=await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM summary_review_job_index WHERE state='published' AND published_at>=?"
  ).bind(now-86400000).first();
  return Number(row?.c||0);
}

export async function selectBoundedSummaryCandidateFromIndex(env, now=Date.now(), preferredDoi='') {
  if(!summaryCandidateIndexShadowEnabled(env)) return {status:409,body:{error:'summary_candidate_index_shadow_disabled'}};
  if(!env?.DB) return {status:503,body:{error:'summary_candidate_index_db_missing'}};
  await ensureSummaryCandidateIndexSchema(env);
  const evidenceBackfill=await env.DB.prepare('SELECT complete FROM article_evidence_index_backfill WHERE id=1').first();
  const jobBackfill=await env.DB.prepare('SELECT complete FROM summary_review_job_index_backfill WHERE id=1').first();
  if(Number(evidenceBackfill?.complete||0)!==1||Number(jobBackfill?.complete||0)!==1){
    return {status:409,body:{error:'summary_candidate_index_backfill_incomplete',
      evidenceBackfillComplete:Number(evidenceBackfill?.complete||0)===1,
      jobBackfillComplete:Number(jobBackfill?.complete||0)===1}};
  }

  const preferred=normalizeDoi(preferredDoi)||'';
  const policyEnv={SUMMARY_ALLOW_UNKNOWN_POLICY:String(env?.SUMMARY_ALLOW_UNKNOWN_POLICY||'')==='1'?'1':'0'};
  const recentPublishedCount=await recentPublishedCountFromIndex(env,now);

  if(preferred){
    const row=await env.DB.prepare(BOUNDED_CANDIDATE_SELECT+`
      WHERE e.doi=?
      LIMIT 1
    `).bind(preferred).first();
    const evaluated=row?candidateFromJoinedRow(policyEnv,row,now):{candidate:null};
    return {status:200,body:{
      version:2,schemaVersion:SUMMARY_CANDIDATE_INDEX_SCHEMA_VERSION,
      readPathActive:false,bounded:true,definitive:true,windowExhausted:false,
      scannedEvidence:row?1:0,maxScanRows:SUMMARY_CANDIDATE_BOUNDED_MAX_ROWS,
      preferredDoi:preferred,preferredEligible:Boolean(evaluated.candidate),
      recentPublishedCount,candidate:evaluated.candidate||null,
    }};
  }

  let scannedEvidence=0;
  for(let page=0;page<SUMMARY_CANDIDATE_BOUNDED_MAX_PAGES;page+=1){
    const rows=await env.DB.prepare(BOUNDED_CANDIDATE_SELECT+`
      ORDER BY e.captured_at DESC,
        CASE e.evidence_level WHEN 'complete' THEN 0 WHEN 'partial' THEN 1 ELSE 2 END ASC,
        e.doi ASC
      LIMIT ? OFFSET ?
    `).bind(SUMMARY_CANDIDATE_BOUNDED_PAGE_SIZE,page*SUMMARY_CANDIDATE_BOUNDED_PAGE_SIZE).all();
    const pageRows=rows?.results||[];
    scannedEvidence+=pageRows.length;
    for(const row of pageRows){
      const evaluated=candidateFromJoinedRow(policyEnv,row,now);
      if(evaluated.candidate){
        return {status:200,body:{
          version:2,schemaVersion:SUMMARY_CANDIDATE_INDEX_SCHEMA_VERSION,
          readPathActive:false,bounded:true,definitive:true,windowExhausted:false,
          scannedEvidence,maxScanRows:SUMMARY_CANDIDATE_BOUNDED_MAX_ROWS,
          preferredDoi:'',preferredEligible:null,
          recentPublishedCount,candidate:evaluated.candidate,
        }};
      }
    }
    if(pageRows.length<SUMMARY_CANDIDATE_BOUNDED_PAGE_SIZE){
      return {status:200,body:{
        version:2,schemaVersion:SUMMARY_CANDIDATE_INDEX_SCHEMA_VERSION,
        readPathActive:false,bounded:true,definitive:true,windowExhausted:false,
        scannedEvidence,maxScanRows:SUMMARY_CANDIDATE_BOUNDED_MAX_ROWS,
        preferredDoi:'',preferredEligible:null,
        recentPublishedCount,candidate:null,
      }};
    }
  }

  return {status:409,body:{
    error:'summary_candidate_bounded_window_exhausted',
    version:2,schemaVersion:SUMMARY_CANDIDATE_INDEX_SCHEMA_VERSION,
    readPathActive:false,bounded:true,definitive:false,windowExhausted:true,
    scannedEvidence,maxScanRows:SUMMARY_CANDIDATE_BOUNDED_MAX_ROWS,
    preferredDoi:'',preferredEligible:null,recentPublishedCount,candidate:null,
  }};
}

export async function selectSummaryCandidateFromIndex(env, now=Date.now(), preferredDoi='') {
  if(!summaryCandidateIndexShadowEnabled(env)) return {status:409,body:{error:'summary_candidate_index_shadow_disabled'}};
  if(!env?.DB) return {status:503,body:{error:'summary_candidate_index_db_missing'}};
  await ensureSummaryCandidateIndexSchema(env);
  const evidenceBackfill=await env.DB.prepare('SELECT complete FROM article_evidence_index_backfill WHERE id=1').first();
  const jobBackfill=await env.DB.prepare('SELECT complete FROM summary_review_job_index_backfill WHERE id=1').first();
  if(Number(evidenceBackfill?.complete||0)!==1||Number(jobBackfill?.complete||0)!==1){
    return {status:409,body:{error:'summary_candidate_index_backfill_incomplete',
      evidenceBackfillComplete:Number(evidenceBackfill?.complete||0)===1,
      jobBackfillComplete:Number(jobBackfill?.complete||0)===1}};
  }
  const [evidenceResult,jobResult]=await Promise.all([
    env.DB.prepare(`SELECT doi,evidence_r2_key,evidence_packet_hash,source_hash,evidence_level,
      text_processing_policy,captured_at FROM article_evidence_index`).all(),
    env.DB.prepare(`SELECT doi,job_r2_key,evidence_packet_hash,source_hash,state,evidence_level,
      text_processing_policy,captured_at,next_retry_at,lease_expires_at,published_at,updated_at
      FROM summary_review_job_index`).all(),
  ]);
  const selection=await selectCandidateFromIndexedRows({
    evidenceRows:evidenceResult?.results||[],jobRows:jobResult?.results||[],now,preferredDoi,
    allowUnknownPolicy:String(env?.SUMMARY_ALLOW_UNKNOWN_POLICY||'')==='1',
  });
  return {status:200,body:{version:1,schemaVersion:SUMMARY_CANDIDATE_INDEX_SCHEMA_VERSION,
    readPathActive:false,selection}};
}

function candidateIdentity(candidate) {
  return candidate ? {
    doi:String(candidate.doi||''),evidenceKey:String(candidate.evidenceKey||''),
    evidencePacketHash:String(candidate.evidencePacketHash||''),sourceHash:String(candidate.sourceHash||''),
    evidenceLevel:String(candidate.evidenceLevel||''),textProcessingPolicy:String(candidate.textProcessingPolicy||''),
    capturedAt:String(candidate.capturedAt||''),existingJobKey:String(candidate.existingJobKey||''),
  } : null;
}
export function compareCandidateSelections(legacy,indexed) {
  const left={
    candidate:candidateIdentity(legacy?.candidate),evidenceCount:Number(legacy?.evidenceCount||0),
    jobCount:Number(legacy?.jobCount||0),eligibleCount:Number(legacy?.eligibleCount||0),
    preferredDoi:String(legacy?.preferredDoi||''),preferredEligible:legacy?.preferredEligible??null,
    recentPublishedCount:Number(legacy?.recentPublishedCount||0),candidateSetHash:String(legacy?.candidateSetHash||''),blockedPolicies:legacy?.blockedPolicies||{},
  };
  const right={
    candidate:candidateIdentity(indexed?.candidate),evidenceCount:Number(indexed?.evidenceCount||0),
    jobCount:Number(indexed?.jobCount||0),eligibleCount:Number(indexed?.eligibleCount||0),
    preferredDoi:String(indexed?.preferredDoi||''),preferredEligible:indexed?.preferredEligible??null,
    recentPublishedCount:Number(indexed?.recentPublishedCount||0),candidateSetHash:String(indexed?.candidateSetHash||''),blockedPolicies:indexed?.blockedPolicies||{},
  };
  const same=JSON.stringify(left)===JSON.stringify(right);
  return {same,legacy:left,indexed:right};
}

export async function getSummaryCandidateIndexStatus(env) {
  if(!summaryCandidateIndexShadowEnabled(env)) return {status:200,body:{version:1,schemaVersion:SUMMARY_CANDIDATE_INDEX_SCHEMA_VERSION,enabled:false,readPathActive:false}};
  if(!env?.DB) return {status:503,body:{error:'summary_candidate_index_db_missing'}};
  await ensureSummaryCandidateIndexSchema(env);
  const counts=await env.DB.prepare(`SELECT COUNT(*) AS job_count,
    SUM(CASE WHEN state='published' THEN 1 ELSE 0 END) AS published_count,
    MAX(updated_at) AS latest_updated_at FROM summary_review_job_index`).first();
  const state=await env.DB.prepare('SELECT cursor,complete,scanned_objects,indexed_rows,skipped_invalid,started_at,updated_at,last_error FROM summary_review_job_index_backfill WHERE id=1').first();
  return {status:200,body:{version:1,schemaVersion:SUMMARY_CANDIDATE_INDEX_SCHEMA_VERSION,enabled:true,readPathActive:false,
    jobCount:Number(counts?.job_count||0),publishedCount:Number(counts?.published_count||0),latestUpdatedAt:Number(counts?.latest_updated_at||0),
    boundedSelector:{pageSize:SUMMARY_CANDIDATE_BOUNDED_PAGE_SIZE,maxPages:SUMMARY_CANDIDATE_BOUNDED_MAX_PAGES,maxRows:SUMMARY_CANDIDATE_BOUNDED_MAX_ROWS},
    backfill:state?{complete:Number(state.complete||0)===1,cursor:safe(state.cursor,1000)||null,
      scannedObjects:Number(state.scanned_objects||0),indexedRows:Number(state.indexed_rows||0),skippedInvalid:Number(state.skipped_invalid||0),
      startedAt:Number(state.started_at||0),updatedAt:Number(state.updated_at||0),lastError:safe(state.last_error,180)}
      :{complete:false,cursor:null,scannedObjects:0,indexedRows:0,skippedInvalid:0,startedAt:0,updatedAt:0,lastError:''}}};
}
