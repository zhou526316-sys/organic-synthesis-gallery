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
  return Boolean(a?.ready&&b?.ready)
    &&safeInt(a.rawMaxEventId)===safeInt(b.rawMaxEventId)
    &&safeInt(a.materializedMaxEventId)===safeInt(b.materializedMaxEventId)
    &&safeInt(a.backfillLastEventId)===safeInt(b.backfillLastEventId)
    &&safeInt(a.globalPv)===safeInt(b.globalPv);
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

export async function refreshSiteAnalyticsPublicSnapshot(env,now=Date.now()){
  if(!siteAnalyticsPublicSnapshotShadowEnabled(env)){
    return {status:409,body:{error:'site_analytics_public_snapshot_shadow_disabled'}};
  }
  if(!env?.DB)return {status:503,body:{error:'analytics_public_snapshot_db_missing'}};

  const [before,readerBefore]=await Promise.all([
    getSiteAnalyticsMaterializedReadiness(env),
    readerWatermark(env),
  ]);
  if(!before.ready)return {status:409,body:{error:'analytics_public_snapshot_source_not_ready',reason:before.reason||'materialized_not_ready'}};

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

  const snapshotJson=JSON.stringify(stats.body);
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
  const valid=Boolean(row&&parseSnapshot(row.snapshot_json));
  return {status:200,body:{
    version:1,
    shadowEnabled:siteAnalyticsPublicSnapshotShadowEnabled(env),
    readConfigured:siteAnalyticsPublicSnapshotReadEnabled(env),
    exists:Boolean(row),
    valid,
    generatedAt:generatedAt||null,
    ageMs,
    maxAgeMs:configuredMaxAgeMs,
    fresh:Boolean(valid&&ageMs!==null&&ageMs<=configuredMaxAgeMs),
    sourceRawMaxEventId:safeInt(row?.source_raw_max_event_id),
    sourceMaterializedMaxEventId:safeInt(row?.source_materialized_max_event_id),
    sourceGlobalPv:safeInt(row?.source_global_pv),
    sourceReaderRows:safeInt(row?.source_reader_rows),
    sourceReaderMaxOpenedAt:safeInt(row?.source_reader_max_opened_at),
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
  return {status:200,body:{
    ...body,
    generation:'site-pageview-v3-snapshot',
    readPath:'snapshot',
    snapshotGeneratedAt:safeInt(row.generated_at),
    snapshotAgeMs:ageMs,
  }};
}

export async function compareSiteAnalyticsPublicSnapshot(env,now=Date.now()){
  if(!env?.DB)return {status:503,body:{error:'analytics_public_snapshot_db_missing'}};
  const row=await snapshotRow(env);
  if(!row)return {status:409,body:{error:'analytics_public_snapshot_missing'}};
  const snapshot=parseSnapshot(row.snapshot_json);
  if(!snapshot)return {status:409,body:{error:'analytics_public_snapshot_invalid'}};
  const materialized=await materializedSiteAnalyticsStats(env,safeInt(row.generated_at)||now);
  if(materialized.status!==200)return materialized;
  const comparison=compareSiteAnalyticsBodies(snapshot,materialized.body);
  const readiness=await getSiteAnalyticsMaterializedReadiness(env);
  const reader=await readerWatermark(env);
  const sourceStable=readiness.ready===true
    &&safeInt(readiness.rawMaxEventId)===safeInt(row.source_raw_max_event_id)
    &&safeInt(readiness.materializedMaxEventId)===safeInt(row.source_materialized_max_event_id)
    &&safeInt(readiness.globalPv)===safeInt(row.source_global_pv)
    &&safeInt(reader.rows)===safeInt(row.source_reader_rows)
    &&safeInt(reader.maxOpenedAt)===safeInt(row.source_reader_max_opened_at);
  return {status:200,body:{
    version:1,
    same:comparison.same,
    sourceStable,
    snapshotGeneratedAt:safeInt(row.generated_at),
    snapshot:comparison.legacy,
    materialized:comparison.materialized,
  }};
}
