import {
  compareSiteAnalyticsBodies,
  getSiteAnalyticsMaterializedReadiness,
  materializedSiteAnalyticsStats,
} from './site-analytics-materialized.js';

const DEFAULT_MAX_AGE_MS=20*60*1000;

function flag(value){return String(value||'')==='1';}
function safeInt(value){const n=Number(value||0);return Number.isSafeInteger(n)&&n>=0?n:0;}
function maxAgeMs(env){
  const n=Number(env?.SITE_ANALYTICS_PUBLIC_SNAPSHOT_MAX_AGE_MS||DEFAULT_MAX_AGE_MS);
  return Number.isFinite(n)&&n>=60_000&&n<=24*60*60*1000?Math.floor(n):DEFAULT_MAX_AGE_MS;
}
function parseSnapshot(value){
  if(typeof value!=='string'||!value)return null;
  try{
    const body=JSON.parse(value);
    return body&&typeof body==='object'&&!Array.isArray(body)?body:null;
  }catch{return null;}
}

export function siteAnalyticsPublicSnapshotShadowEnabled(env){
  return flag(env?.SITE_ANALYTICS_PUBLIC_SNAPSHOT_SHADOW_ENABLED);
}
export function siteAnalyticsPublicSnapshotReadEnabled(env){
  return flag(env?.SITE_ANALYTICS_PUBLIC_SNAPSHOT_READ_ENABLED);
}

async function readerWatermark(env){
  const row=await env.DB.prepare(
    'SELECT COUNT(*) AS rows,COALESCE(MAX(first_opened_at),0) AS max_opened_at FROM paper_open_readers_v3'
  ).first();
  return {rows:safeInt(row?.rows),maxOpenedAt:safeInt(row?.max_opened_at)};
}

function sameMaterializedWatermark(a,b){
  return Boolean(a?.snapshotSourceReady&&b?.snapshotSourceReady)
    &&safeInt(a.materializedMaxEventId)===safeInt(b.materializedMaxEventId)
    &&safeInt(a.backfillLastEventId)===safeInt(b.backfillLastEventId)
    &&safeInt(a.globalPv)===safeInt(b.globalPv)
    &&safeInt(a.globalLastViewedAt)===safeInt(b.globalLastViewedAt);
}
function sameReaderWatermark(a,b){
  return safeInt(a?.rows)===safeInt(b?.rows)&&safeInt(a?.maxOpenedAt)===safeInt(b?.maxOpenedAt);
}

async function snapshotRow(env){
  return env.DB.prepare(`
    SELECT id,snapshot_json,source_raw_max_event_id,source_materialized_max_event_id,
      source_global_pv,source_reader_rows,source_reader_max_opened_at,generated_at,updated_at
    FROM site_analytics_public_snapshot_v1 WHERE id=1
  `).first();
}

// Background-only proof of the materialized prefix. Maintenance counters and
// maximum IDs cannot prove ledger membership, especially with non-dense IDs.
async function materializedSourceIntegrity(env,source,now){
  const watermark=safeInt(source.materializedMaxEventId);
  const row=await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM site_pageviews_v1 WHERE id<=?) AS raw_prefix_events,
      (SELECT COUNT(*) FROM site_analytics_materialized_events_v2 WHERE event_id<=?) AS ledger_events,
      EXISTS(
        SELECT 1 FROM site_pageviews_v1 r
        LEFT JOIN site_analytics_materialized_events_v2 e ON e.event_id=r.id
        WHERE r.id<=? AND e.event_id IS NULL
      ) AS missing_ledger_event,
      (SELECT MIN(viewed_at) FROM site_pageviews_v1 WHERE id>?) AS oldest_pending_at
  `).bind(watermark,watermark,watermark,watermark).first();
  const rawPrefixEvents=safeInt(row?.raw_prefix_events),ledgerEvents=safeInt(row?.ledger_events);
  const globalPv=safeInt(source.globalPv);
  const oldestPendingAt=safeInt(row?.oldest_pending_at);
  const pendingAgeMs=oldestPendingAt?Math.max(0,Number(now)-oldestPendingAt):0;
  return {
    valid:rawPrefixEvents===ledgerEvents&&ledgerEvents===globalPv&&!Number(row?.missing_ledger_event||0),
    rawPrefixEvents,ledgerEvents,globalPv,
    missingLedgerEvent:Boolean(Number(row?.missing_ledger_event||0)),
    oldestPendingAt,pendingAgeMs,maxAgeMs:maxAgeMs(env),
  };
}

export async function refreshSiteAnalyticsPublicSnapshot(env,now=Date.now()){
  if(!siteAnalyticsPublicSnapshotShadowEnabled(env)){
    return {status:409,body:{error:'site_analytics_public_snapshot_shadow_disabled'}};
  }
  if(!env?.DB)return {status:503,body:{error:'analytics_public_snapshot_db_missing'}};

  const [before,readerBefore]=await Promise.all([
    getSiteAnalyticsMaterializedReadiness(env),
    readerWatermark(env),
  ]);
  if(!before.snapshotSourceReady)return {status:409,body:{
    error:'analytics_public_snapshot_source_not_ready',
    reason:before.reason||'materialized_not_ready',
    strictRealtimeReady:before.ready===true,
    snapshotSourceReady:before.snapshotSourceReady===true,
    backfillComplete:before.backfillComplete===true,
    rawMaxEventId:safeInt(before.rawMaxEventId),
    materializedMaxEventId:safeInt(before.materializedMaxEventId),
    backfillLastEventId:safeInt(before.backfillLastEventId),
    globalPv:safeInt(before.globalPv),
    scannedEvents:safeInt(before.scannedEvents),
    materializedEvents:safeInt(before.materializedEvents),
    duplicateEvents:safeInt(before.duplicateEvents),
    failedEvents:safeInt(before.failedEvents),
    pendingRawEvents:safeInt(before.pendingRawEvents),
    rawLastViewedAt:safeInt(before.rawLastViewedAt),
    globalLastViewedAt:safeInt(before.globalLastViewedAt),
    lastError:String(before.lastError||''),
    lagEvents:safeInt(before.lagEvents),
    lagMs:safeInt(before.lagMs),
  }};

  const integrity=await materializedSourceIntegrity(env,before,now);
  if(!integrity.valid)return {status:409,body:{
    error:'analytics_public_snapshot_source_inconsistent',sourceIntegrity:integrity,
  }};
  if(integrity.pendingAgeMs>integrity.maxAgeMs)return {status:409,body:{
    error:'analytics_public_snapshot_source_stale',sourceIntegrity:integrity,
  }};

  const stats=await materializedSiteAnalyticsStats(env,now);
  if(stats.status!==200)return stats;

  const [after,readerAfter]=await Promise.all([
    getSiteAnalyticsMaterializedReadiness(env),
    readerWatermark(env),
  ]);
  if(!sameMaterializedWatermark(before,after)||!sameReaderWatermark(readerBefore,readerAfter)){
    return {status:409,body:{
      error:'analytics_public_snapshot_source_changed',
      before:{rawMaxEventId:safeInt(before.rawMaxEventId),materializedMaxEventId:safeInt(before.materializedMaxEventId),
        globalPv:safeInt(before.globalPv),readerRows:safeInt(readerBefore.rows),readerMaxOpenedAt:safeInt(readerBefore.maxOpenedAt)},
      after:{rawMaxEventId:safeInt(after.rawMaxEventId),materializedMaxEventId:safeInt(after.materializedMaxEventId),
        globalPv:safeInt(after.globalPv),readerRows:safeInt(readerAfter.rows),readerMaxOpenedAt:safeInt(readerAfter.maxOpenedAt)},
    }};
  }

  const snapshotJson=JSON.stringify({
    ...stats.body,_snapshotSource:{oldestPendingAt:integrity.oldestPendingAt},
  });
  const generatedAt=Number(now);
  await env.DB.prepare(`
    INSERT INTO site_analytics_public_snapshot_v1
      (id,snapshot_json,source_raw_max_event_id,source_materialized_max_event_id,source_global_pv,
       source_reader_rows,source_reader_max_opened_at,generated_at,updated_at)
    VALUES(1,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      snapshot_json=excluded.snapshot_json,
      source_raw_max_event_id=excluded.source_raw_max_event_id,
      source_materialized_max_event_id=excluded.source_materialized_max_event_id,
      source_global_pv=excluded.source_global_pv,
      source_reader_rows=excluded.source_reader_rows,
      source_reader_max_opened_at=excluded.source_reader_max_opened_at,
      generated_at=excluded.generated_at,
      updated_at=excluded.updated_at
  `).bind(
    snapshotJson,safeInt(after.rawMaxEventId),safeInt(after.materializedMaxEventId),safeInt(after.globalPv),
    safeInt(readerAfter.rows),safeInt(readerAfter.maxOpenedAt),generatedAt,Date.now(),
  ).run();

  return {status:200,body:{
    ok:true,generatedAt,
    sourceRawMaxEventId:safeInt(after.rawMaxEventId),
    sourceMaterializedMaxEventId:safeInt(after.materializedMaxEventId),
    sourceGlobalPv:safeInt(after.globalPv),
    sourceReaderRows:safeInt(readerAfter.rows),
    sourceReaderMaxOpenedAt:safeInt(readerAfter.maxOpenedAt),
  }};
}

export async function getSiteAnalyticsPublicSnapshotStatus(env,now=Date.now()){
  if(!env?.DB)return {status:503,body:{error:'analytics_public_snapshot_db_missing'}};
  const row=await snapshotRow(env);
  const generatedAt=safeInt(row?.generated_at);
  const ageMs=generatedAt?Math.max(0,Number(now)-generatedAt):null;
  const configuredMaxAgeMs=maxAgeMs(env);
  const body=row?parseSnapshot(row.snapshot_json):null;
  const valid=Boolean(row&&body);
  const sourcePendingAt=safeInt(body?._snapshotSource?.oldestPendingAt);
  const sourcePendingAgeMs=sourcePendingAt?Math.max(0,Number(now)-sourcePendingAt):0;
  return {status:200,body:{
    version:1,
    shadowEnabled:siteAnalyticsPublicSnapshotShadowEnabled(env),
    readConfigured:siteAnalyticsPublicSnapshotReadEnabled(env),
    exists:Boolean(row),
    valid,
    generatedAt:generatedAt||null,
    ageMs,
    maxAgeMs:configuredMaxAgeMs,
    fresh:Boolean(valid&&ageMs!==null&&ageMs<=configuredMaxAgeMs&&sourcePendingAgeMs<=configuredMaxAgeMs),
    sourcePendingAgeMs,
    sourceRawMaxEventId:safeInt(row?.source_raw_max_event_id),
    sourceMaterializedMaxEventId:safeInt(row?.source_materialized_max_event_id),
    sourceGlobalPv:safeInt(row?.source_global_pv),
    sourceReaderRows:safeInt(row?.source_reader_rows),
    sourceReaderMaxOpenedAt:safeInt(row?.source_reader_max_opened_at),
    sourceLagEvents:Math.max(0,safeInt(row?.source_raw_max_event_id)-safeInt(row?.source_materialized_max_event_id)),
  }};
}

export async function readSiteAnalyticsPublicSnapshot(env,now=Date.now(),{requireEnabled=true}={}){
  if(!env?.DB)return {status:503,body:{error:'analytics_public_snapshot_db_missing'}};
  if(requireEnabled&&!siteAnalyticsPublicSnapshotReadEnabled(env)){
    return {status:503,body:{error:'analytics_public_snapshot_read_disabled'}};
  }
  const row=await snapshotRow(env);
  if(!row)return {status:503,body:{error:'analytics_public_snapshot_missing'}};
  const body=parseSnapshot(row.snapshot_json);
  if(!body)return {status:503,body:{error:'analytics_public_snapshot_invalid'}};
  const ageMs=Math.max(0,Number(now)-safeInt(row.generated_at));
  const configuredMaxAgeMs=maxAgeMs(env);
  if(ageMs>configuredMaxAgeMs){
    return {status:503,body:{error:'analytics_public_snapshot_stale',generatedAt:safeInt(row.generated_at),ageMs,maxAgeMs:configuredMaxAgeMs}};
  }
  const sourcePendingAt=safeInt(body._snapshotSource?.oldestPendingAt);
  const sourcePendingAgeMs=sourcePendingAt?Math.max(0,Number(now)-sourcePendingAt):0;
  if(sourcePendingAgeMs>configuredMaxAgeMs){
    return {status:503,body:{error:'analytics_public_snapshot_source_stale',generatedAt:safeInt(row.generated_at),
      ageMs,sourcePendingAgeMs,maxAgeMs:configuredMaxAgeMs}};
  }
  const {_snapshotSource,...publicBody}=body;
  return {status:200,body:{
    ...publicBody,
    generation:'site-pageview-v3-snapshot',
    readPath:'snapshot',
    snapshotGeneratedAt:safeInt(row.generated_at),
    snapshotAgeMs:ageMs,
  }};
}

// Both normal reads and rollback read exactly one snapshot row. Heavy source
// aggregation belongs only to refresh/compare, regardless of feature flags.
export async function publicSiteAnalyticsStats(env,now=Date.now()){
  const primary=siteAnalyticsPublicSnapshotReadEnabled(env);
  const result=await readSiteAnalyticsPublicSnapshot(env,now,{requireEnabled:primary})
    .catch(()=>({status:503,body:{error:'analytics_public_snapshot_read_error',readPath:'snapshot'}}));
  if(primary) return result;
  const materializedFallbackReason=flag(env?.SITE_ANALYTICS_MATERIALIZED_READ_ENABLED)
    ?'materialized_background_only':'materialized_read_disabled';
  if(result.status===200)return {status:200,body:{
    ...result.body,readPath:'snapshot_fallback',materializedFallbackReason,
  }};
  return {status:503,body:{
    error:'analytics_bounded_stats_unavailable',readPath:'bounded_unavailable',
    materializedFallbackReason,snapshotFallbackReason:result.body?.error||'snapshot_unavailable',
  }};
}

export async function compareSiteAnalyticsPublicSnapshot(env,now=Date.now()){
  if(!env?.DB)return {status:503,body:{error:'analytics_public_snapshot_db_missing'}};
  const row=await snapshotRow(env);
  if(!row)return {status:409,body:{error:'analytics_public_snapshot_missing'}};
  const snapshot=parseSnapshot(row.snapshot_json);
  if(!snapshot)return {status:409,body:{error:'analytics_public_snapshot_invalid'}};
  const readiness=await getSiteAnalyticsMaterializedReadiness(env);
  const reader=await readerWatermark(env);
  const sourceStable=readiness.snapshotSourceReady===true
    &&safeInt(readiness.materializedMaxEventId)===safeInt(row.source_materialized_max_event_id)
    &&safeInt(readiness.globalPv)===safeInt(row.source_global_pv)
    &&safeInt(reader.rows)===safeInt(row.source_reader_rows)
    &&safeInt(reader.maxOpenedAt)===safeInt(row.source_reader_max_opened_at);
  if(!sourceStable){
    return {status:200,body:{
      version:1,comparable:false,same:null,sourceStable:false,
      reason:'source_advanced_since_snapshot',
      snapshotGeneratedAt:safeInt(row.generated_at),
      sourceMaterializedMaxEventId:safeInt(row.source_materialized_max_event_id),
      currentMaterializedMaxEventId:safeInt(readiness.materializedMaxEventId),
    }};
  }
  const materialized=await materializedSiteAnalyticsStats(env,safeInt(row.generated_at)||now);
  if(materialized.status!==200)return materialized;
  const comparison=compareSiteAnalyticsBodies(snapshot,materialized.body);
  return {status:200,body:{
    version:1,comparable:true,
    same:comparison.same,
    sourceStable:true,
    snapshotGeneratedAt:safeInt(row.generated_at),
    snapshot:comparison.legacy,
    materialized:comparison.materialized,
  }};
}
