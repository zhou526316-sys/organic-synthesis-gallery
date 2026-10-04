import { ensureEvidenceIndexSchema, evidenceIndexShadowEnabled } from './evidence-index.js';

const JOB_PREFIX = 'private/article-summary-jobs/';
export const SUMMARY_JOB_INDEX_SCHEMA_VERSION = 'summary-review-job-index-v1';

const schemaReadyBindings = new WeakSet();

function safe(value,max=200){
  return String(value ?? '').replace(/[\u0000-\u001f]+/g,' ').trim().slice(0,max);
}
function normalizeDoi(value){
  const raw=String(value||'').trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'')
    .replace(/^doi:\s*/i,'');
  return /^10\.\d{4,9}\/\S+$/.test(raw)?raw.replace(/[).,;]+$/,''):'';
}
function hash64(value){
  const text=String(value||'').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(text)?text:'';
}
function numberValue(value){
  const n=Number(value||0);
  return Number.isFinite(n)?n:0;
}
function evidenceLevelRank(value){
  return value==='complete'?0:value==='partial'?1:2;
}
function policyAllowsExternalAi(allowUnknown,policy){
  if(policy==='no_external_ai')return false;
  if(policy==='unknown')return allowUnknown===true;
  return ['open_access','private_cache_allowed','transient_processing_only'].includes(policy);
}
export function summaryJobIndexShadowEnabled(env){
  return String(env?.SUMMARY_JOB_INDEX_SHADOW_ENABLED||'')==='1';
}

export async function ensureSummaryJobIndexSchema(env){
  if(!env?.DB)throw new Error('summary_job_index_db_missing');
  if(schemaReadyBindings.has(env.DB))return;
  const statements=[
    `CREATE TABLE IF NOT EXISTS summary_review_job_index (
      doi TEXT PRIMARY KEY,
      job_r2_key TEXT NOT NULL,
      evidence_packet_hash TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      state TEXT NOT NULL,
      evidence_level TEXT NOT NULL DEFAULT 'unknown',
      text_processing_policy TEXT NOT NULL DEFAULT 'unknown',
      captured_at TEXT NOT NULL DEFAULT '',
      next_retry_at INTEGER NOT NULL DEFAULT 0,
      lease_expires_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      published_at INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      indexed_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_summary_review_job_state
      ON summary_review_job_index(state,updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_summary_review_job_published
      ON summary_review_job_index(published_at DESC)`,
    `CREATE TABLE IF NOT EXISTS summary_review_job_index_backfill (
      id INTEGER PRIMARY KEY CHECK (id=1),
      cursor TEXT,
      complete INTEGER NOT NULL DEFAULT 0 CHECK (complete IN (0,1)),
      scanned_objects INTEGER NOT NULL DEFAULT 0,
      indexed_rows INTEGER NOT NULL DEFAULT 0,
      skipped_invalid INTEGER NOT NULL DEFAULT 0,
      skipped_stale INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_error TEXT NOT NULL DEFAULT ''
    )`,
  ];
  for(const sql of statements)await env.DB.prepare(sql).run();
  schemaReadyBindings.add(env.DB);
}

function normalizeJobRow(row){
  const doi=normalizeDoi(row?.doi);
  const jobR2Key=safe(row?.jobR2Key,500);
  const evidencePacketHash=hash64(row?.evidencePacketHash);
  const sourceHash=hash64(row?.sourceHash);
  const state=safe(row?.state,60);
  const updatedAt=numberValue(row?.updatedAt);
  if(!doi||!jobR2Key.startsWith(JOB_PREFIX)||!evidencePacketHash||!sourceHash||!state||updatedAt<=0){
    throw new Error('summary_job_index_row_invalid');
  }
  return {
    doi,jobR2Key,evidencePacketHash,sourceHash,state,
    evidenceLevel:safe(row?.evidenceLevel||'unknown',40),
    textProcessingPolicy:safe(row?.textProcessingPolicy||'unknown',80),
    capturedAt:safe(row?.capturedAt,80),
    nextRetryAt:numberValue(row?.nextRetryAt),
    leaseExpiresAt:numberValue(row?.leaseExpiresAt),
    updatedAt,
    publishedAt:numberValue(row?.publishedAt),
    attempts:Math.max(0,Math.floor(numberValue(row?.attempts))),
    indexedAt:Number.isFinite(Number(row?.indexedAt))?Number(row.indexedAt):Date.now(),
  };
}

const UPSERT_JOB_SQL=`
  INSERT INTO summary_review_job_index (
    doi,job_r2_key,evidence_packet_hash,source_hash,state,evidence_level,text_processing_policy,
    captured_at,next_retry_at,lease_expires_at,updated_at,published_at,attempts,indexed_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
    updated_at=excluded.updated_at,
    published_at=excluded.published_at,
    attempts=excluded.attempts,
    indexed_at=excluded.indexed_at
  WHERE excluded.updated_at >= summary_review_job_index.updated_at
`;

function bindJobStatement(env,row){
  const n=normalizeJobRow(row);
  return env.DB.prepare(UPSERT_JOB_SQL).bind(
    n.doi,n.jobR2Key,n.evidencePacketHash,n.sourceHash,n.state,n.evidenceLevel,n.textProcessingPolicy,
    n.capturedAt,n.nextRetryAt,n.leaseExpiresAt,n.updatedAt,n.publishedAt,n.attempts,n.indexedAt
  );
}

export async function shadowIndexSummaryJob(env,job,jobR2Key){
  if(!summaryJobIndexShadowEnabled(env))return {enabled:false,indexed:false};
  if(!env?.DB)return {enabled:true,indexed:false,error:'summary_job_index_db_missing'};
  try{
    await ensureSummaryJobIndexSchema(env);
    const result=await bindJobStatement(env,{...job,jobR2Key,indexedAt:Date.now()}).run();
    const changed=Number(result?.meta?.changes||0)>0;
    return {enabled:true,indexed:changed,stale:!changed,doi:normalizeDoi(job?.doi)};
  }catch(error){
    return {enabled:true,indexed:false,error:safe(error?.message||error,180)};
  }
}

function rowFromObject(object){
  const meta=object?.customMetadata||{};
  const doi=normalizeDoi(meta.doi);
  const evidencePacketHash=hash64(meta.evidencePacketHash);
  const sourceHash=hash64(meta.sourceHash);
  const state=safe(meta.state,60);
  const updatedAt=numberValue(meta.updatedAt);
  const key=String(object?.key||'');
  if(!doi||!evidencePacketHash||!sourceHash||!state||updatedAt<=0||!key.startsWith(JOB_PREFIX))return null;
  return {
    doi,jobR2Key:key,evidencePacketHash,sourceHash,state,
    evidenceLevel:safe(meta.evidenceLevel||'unknown',40),
    textProcessingPolicy:safe(meta.textProcessingPolicy||'unknown',80),
    capturedAt:safe(meta.capturedAt,80),
    nextRetryAt:numberValue(meta.nextRetryAt),
    leaseExpiresAt:numberValue(meta.leaseExpiresAt),
    updatedAt,publishedAt:numberValue(meta.publishedAt),
    attempts:Math.max(0,Math.floor(numberValue(meta.attempts))),
  };
}

export async function backfillSummaryJobIndexPage(env,limitValue=500){
  if(!summaryJobIndexShadowEnabled(env)){
    return {status:409,body:{error:'summary_job_index_shadow_disabled',enabled:false}};
  }
  if(!env?.DB||!env?.MEDIA)return {status:503,body:{error:'summary_job_index_storage_unavailable'}};
  await ensureSummaryJobIndexSchema(env);
  const limit=Math.max(1,Math.min(1000,Number(limitValue||500)));
  const now=Date.now();
  let state=await env.DB.prepare(
    'SELECT cursor,complete,scanned_objects,indexed_rows,skipped_invalid,skipped_stale,started_at,updated_at,last_error FROM summary_review_job_index_backfill WHERE id=1'
  ).first();
  if(Number(state?.complete||0)===1){
    return {status:200,body:{ok:true,enabled:true,complete:true,cursor:null,
      scannedObjects:Number(state.scanned_objects||0),indexedRows:Number(state.indexed_rows||0),
      skippedInvalid:Number(state.skipped_invalid||0),skippedStale:Number(state.skipped_stale||0)}};
  }
  const cursor=safe(state?.cursor,1000);
  let page;
  try{
    page=await env.MEDIA.list({
      prefix:JOB_PREFIX,limit,...(cursor?{cursor}:{}),include:['customMetadata'],
    });
  }catch(error){
    const message=safe(error?.message||error,180);
    if(state)await env.DB.prepare(
      'UPDATE summary_review_job_index_backfill SET last_error=?,updated_at=? WHERE id=1'
    ).bind(message,now).run();
    return {status:502,body:{error:'summary_job_index_backfill_list_failed',detail:message}};
  }
  const objects=Array.isArray(page?.objects)?page.objects:[];
  let indexed=0,invalid=0,stale=0;
  for(const object of objects){
    const row=rowFromObject(object);
    if(!row){invalid++;continue;}
    const result=await bindJobStatement(env,{...row,indexedAt:now}).run();
    if(Number(result?.meta?.changes||0)>0)indexed++;else stale++;
  }
  const truncated=Boolean(page?.truncated);
  const nextCursor=truncated?safe(page?.cursor,1000):'';
  if(truncated&&!nextCursor)throw new Error('summary_job_index_backfill_cursor_missing');
  const scannedTotal=Number(state?.scanned_objects||0)+objects.length;
  const indexedTotal=Number(state?.indexed_rows||0)+indexed;
  const invalidTotal=Number(state?.skipped_invalid||0)+invalid;
  const staleTotal=Number(state?.skipped_stale||0)+stale;
  const startedAt=Number(state?.started_at||0)||now;
  await env.DB.prepare(`
    INSERT INTO summary_review_job_index_backfill
      (id,cursor,complete,scanned_objects,indexed_rows,skipped_invalid,skipped_stale,started_at,updated_at,last_error)
    VALUES (1,?,?,?,?,?,?,?,?, '')
    ON CONFLICT(id) DO UPDATE SET
      cursor=excluded.cursor,complete=excluded.complete,scanned_objects=excluded.scanned_objects,
      indexed_rows=excluded.indexed_rows,skipped_invalid=excluded.skipped_invalid,
      skipped_stale=excluded.skipped_stale,started_at=summary_review_job_index_backfill.started_at,
      updated_at=excluded.updated_at,last_error=''
  `).bind(nextCursor||null,truncated?0:1,scannedTotal,indexedTotal,invalidTotal,staleTotal,startedAt,now).run();
  return {status:200,body:{ok:true,enabled:true,complete:!truncated,cursor:nextCursor||null,
    pageObjects:objects.length,pageIndexed:indexed,pageSkippedInvalid:invalid,pageSkippedStale:stale,
    scannedObjects:scannedTotal,indexedRows:indexedTotal,skippedInvalid:invalidTotal,skippedStale:staleTotal}};
}

async function readAllByDoi(env,table,columns,pageSize=500){
  const rows=[];let after='';
  for(;;){
    const result=await env.DB.prepare(
      `SELECT ${columns} FROM ${table} WHERE doi > ? ORDER BY doi ASC LIMIT ?`
    ).bind(after,pageSize).all();
    const page=Array.isArray(result?.results)?result.results:[];
    rows.push(...page);
    if(page.length<pageSize)break;
    const next=String(page[page.length-1]?.doi||'');
    if(!next||next<=after)throw new Error('summary_index_keyset_stalled:'+table);
    after=next;
  }
  return rows;
}

export function selectSummaryCandidateFromIndexedMetadata({
  evidenceRows=[],jobRows=[],now=Date.now(),preferredDoi='',allowUnknownPolicy=false
}={}){
  const jobs=new Map(jobRows.map(row=>[String(row.doi||'').toLowerCase(),row]));
  const blockedPolicies={};const candidates=[];
  for(const row of evidenceRows){
    const doi=String(row.doi||'').toLowerCase();
    const hash=String(row.evidence_packet_hash||row.evidencePacketHash||'');
    const sourceHash=String(row.source_hash||row.sourceHash||'');
    if(!doi||!hash||!sourceHash)continue;
    const policy=String(row.text_processing_policy||row.textProcessingPolicy||'unknown');
    if(!policyAllowsExternalAi(allowUnknownPolicy,policy)){
      blockedPolicies[policy]=(blockedPolicies[policy]||0)+1;continue;
    }
    const existing=jobs.get(doi);
    const jobHash=String(existing?.evidence_packet_hash||existing?.evidencePacketHash||'');
    if(existing&&jobHash===hash){
      const state=String(existing.state||'');
      if(['published','needs_manual_review','rejected'].includes(state))continue;
      if(state==='processing'&&numberValue(existing.lease_expires_at??existing.leaseExpiresAt)>now)continue;
      if(state==='retry_wait'&&numberValue(existing.next_retry_at??existing.nextRetryAt)>now)continue;
    }
    candidates.push({
      doi,
      evidenceKey:String(row.evidence_r2_key||row.evidenceKey||''),
      evidencePacketHash:hash,sourceHash,
      evidenceLevel:String(row.evidence_level||row.evidenceLevel||'unknown'),
      textProcessingPolicy:policy,capturedAt:String(row.captured_at||row.capturedAt||''),
      existingJobKey:String(existing?.job_r2_key||existing?.existingJobKey||''),
    });
  }
  candidates.sort((a,b)=>{
    const dateDelta=String(b.capturedAt||'').localeCompare(String(a.capturedAt||''));
    if(dateDelta)return dateDelta;
    const levelDelta=evidenceLevelRank(a.evidenceLevel)-evidenceLevelRank(b.evidenceLevel);
    if(levelDelta)return levelDelta;
    return a.doi.localeCompare(b.doi);
  });
  const recentPublishedCount=jobRows.filter(row=>
    String(row.state||'')==='published'&&numberValue(row.published_at??row.publishedAt)>=now-24*60*60*1000
  ).length;
  const preferred=String(preferredDoi||'').trim().toLowerCase();
  const selected=preferred?candidates.find(row=>row.doi===preferred)||null:candidates[0]||null;
  return {
    candidate:selected,
    candidateDois:candidates.map(row=>row.doi),
    evidenceCount:evidenceRows.length,jobCount:jobRows.length,eligibleCount:candidates.length,
    preferredDoi:preferred,preferredEligible:preferred?Boolean(selected):null,
    recentPublishedCount,blockedPolicies,
  };
}

export async function getIndexedSummaryCandidateSnapshot(env,now=Date.now(),preferredDoi=''){
  if(!summaryJobIndexShadowEnabled(env))return {status:409,body:{error:'summary_job_index_shadow_disabled'}};
  if(!evidenceIndexShadowEnabled(env))return {status:409,body:{error:'evidence_index_shadow_disabled'}};
  if(!env?.DB)return {status:503,body:{error:'summary_job_index_db_missing'}};
  await ensureEvidenceIndexSchema(env);await ensureSummaryJobIndexSchema(env);
  const evidenceBackfill=await env.DB.prepare(
    'SELECT complete,scanned_objects,indexed_rows,skipped_invalid FROM article_evidence_index_backfill WHERE id=1'
  ).first();
  const jobBackfill=await env.DB.prepare(
    'SELECT complete,scanned_objects,indexed_rows,skipped_invalid,skipped_stale FROM summary_review_job_index_backfill WHERE id=1'
  ).first();
  const evidenceRows=await readAllByDoi(env,'article_evidence_index',
    'doi,evidence_r2_key,evidence_packet_hash,source_hash,evidence_level,text_processing_policy,captured_at');
  const jobRows=await readAllByDoi(env,'summary_review_job_index',
    'doi,job_r2_key,evidence_packet_hash,source_hash,state,evidence_level,text_processing_policy,captured_at,next_retry_at,lease_expires_at,updated_at,published_at,attempts');
  const selection=selectSummaryCandidateFromIndexedMetadata({
    evidenceRows,jobRows,now,preferredDoi,
    allowUnknownPolicy:String(env?.SUMMARY_ALLOW_UNKNOWN_POLICY||'')==='1',
  });
  return {status:200,body:{
    version:1,schemaVersion:SUMMARY_JOB_INDEX_SCHEMA_VERSION,readPathActive:false,
    complete:Number(evidenceBackfill?.complete||0)===1&&Number(jobBackfill?.complete||0)===1,
    evidenceBackfill:evidenceBackfill||null,jobBackfill:jobBackfill||null,...selection,
  }};
}

export function compareSummaryCandidateSnapshots(legacy,indexed){
  const keys=['evidenceCount','jobCount','eligibleCount','preferredDoi','preferredEligible','recentPublishedCount'];
  const scalarDiff={};
  for(const key of keys)if(JSON.stringify(legacy?.[key])!==JSON.stringify(indexed?.[key])){
    scalarDiff[key]={legacy:legacy?.[key],indexed:indexed?.[key]};
  }
  const legacyDois=Array.isArray(legacy?.candidateDois)?legacy.candidateDois:[];
  const indexedDois=Array.isArray(indexed?.candidateDois)?indexed.candidateDois:[];
  const firstOrderMismatch=(()=>{
    const n=Math.max(legacyDois.length,indexedDois.length);
    for(let i=0;i<n;i++)if(legacyDois[i]!==indexedDois[i])return {index:i,legacy:legacyDois[i]||null,indexed:indexedDois[i]||null};
    return null;
  })();
  const legacyBlocked=legacy?.blockedPolicies||{},indexedBlocked=indexed?.blockedPolicies||{};
  const blockedEqual=JSON.stringify(Object.fromEntries(Object.entries(legacyBlocked).sort()))
    ===JSON.stringify(Object.fromEntries(Object.entries(indexedBlocked).sort()));
  const selectedLegacy=legacy?.candidate?.doi||null,selectedIndexed=indexed?.candidate?.doi||null;
  const equivalent=Object.keys(scalarDiff).length===0&&!firstOrderMismatch&&blockedEqual
    &&selectedLegacy===selectedIndexed&&indexed?.complete===true;
  return {
    equivalent,readPathActive:false,selectedLegacy,selectedIndexed,
    scalarDiff,firstOrderMismatch,blockedPoliciesEqual:blockedEqual,
    legacyCandidateCount:legacyDois.length,indexedCandidateCount:indexedDois.length,
  };
}

export async function getSummaryJobIndexStatus(env){
  if(!summaryJobIndexShadowEnabled(env)){
    return {status:200,body:{version:1,schemaVersion:SUMMARY_JOB_INDEX_SCHEMA_VERSION,enabled:false,readPathActive:false}};
  }
  if(!env?.DB)return {status:503,body:{error:'summary_job_index_db_missing'}};
  await ensureSummaryJobIndexSchema(env);
  const counts=await env.DB.prepare(`
    SELECT COUNT(*) AS job_count,
      SUM(CASE WHEN state='published' THEN 1 ELSE 0 END) AS published_count,
      MAX(updated_at) AS latest_updated_at
    FROM summary_review_job_index
  `).first();
  const backfill=await env.DB.prepare(
    'SELECT cursor,complete,scanned_objects,indexed_rows,skipped_invalid,skipped_stale,started_at,updated_at,last_error FROM summary_review_job_index_backfill WHERE id=1'
  ).first();
  return {status:200,body:{
    version:1,schemaVersion:SUMMARY_JOB_INDEX_SCHEMA_VERSION,enabled:true,readPathActive:false,
    jobCount:Number(counts?.job_count||0),publishedCount:Number(counts?.published_count||0),
    latestUpdatedAt:Number(counts?.latest_updated_at||0),
    backfill:backfill?{
      complete:Number(backfill.complete||0)===1,cursor:safe(backfill.cursor,1000)||null,
      scannedObjects:Number(backfill.scanned_objects||0),indexedRows:Number(backfill.indexed_rows||0),
      skippedInvalid:Number(backfill.skipped_invalid||0),skippedStale:Number(backfill.skipped_stale||0),
      startedAt:Number(backfill.started_at||0),updatedAt:Number(backfill.updated_at||0),
      lastError:safe(backfill.last_error,180),
    }:{complete:false,cursor:null,scannedObjects:0,indexedRows:0,skippedInvalid:0,skippedStale:0,startedAt:0,updatedAt:0,lastError:''},
  }};
}
