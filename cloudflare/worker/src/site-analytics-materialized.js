const SHADOW_VERSION=2;
const BACKFILL_ID=1;

function safe(value,max=300){return typeof value==='string'?value.slice(0,max):'';}
function n(value){const v=Number(value||0);return Number.isFinite(v)&&v>0?v:0;}
function beijingDate(timestamp){return new Date(Number(timestamp)+8*60*60*1000).toISOString().slice(0,10);}
function dateDaysAgoBeijing(days,now=Date.now()){
  return new Date(Number(now)+8*60*60*1000-Number(days)*24*60*60*1000).toISOString().slice(0,10);
}
function fillDailyTrend(rows,days,now=Date.now()){
  const byDate=new Map((rows||[]).map(row=>[String(row.beijing_date||row.date||''),{
    date:String(row.beijing_date||row.date||''),pv:Math.max(0,Number(row.pv||0)),uv:Math.max(0,Number(row.uv||0)),
  }]));
  const out=[];
  for(let offset=days-1;offset>=0;offset-=1){
    const date=dateDaysAgoBeijing(offset,now);
    out.push(byDate.get(date)||{date,pv:0,uv:0});
  }
  return out;
}
export function siteAnalyticsMaterializedShadowEnabled(env){
  return String(env?.SITE_ANALYTICS_MATERIALIZED_SHADOW_ENABLED||'')==='1';
}
export function siteAnalyticsMaterializedReadEnabled(env){
  return String(env?.SITE_ANALYTICS_MATERIALIZED_READ_ENABLED||'')==='1';
}

function visitorStatement(env,{scopeType,scopeKey,eventId,ipHash,viewedAt,date,paperOpen}){
  return env.DB.prepare(`
    INSERT INTO site_analytics_visitors_v2
      (scope_type,scope_key,ip_hash,first_event_id,first_viewed_at,last_viewed_at,last_seen_date,pageviews,paper_open)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(scope_type,scope_key,ip_hash) DO UPDATE SET
      last_viewed_at=MAX(site_analytics_visitors_v2.last_viewed_at,excluded.last_viewed_at),
      last_seen_date=CASE
        WHEN excluded.last_viewed_at>=site_analytics_visitors_v2.last_viewed_at THEN excluded.last_seen_date
        ELSE site_analytics_visitors_v2.last_seen_date END,
      pageviews=site_analytics_visitors_v2.pageviews+1,
      paper_open=MAX(site_analytics_visitors_v2.paper_open,excluded.paper_open)
  `).bind(scopeType,scopeKey,ipHash,eventId,viewedAt,viewedAt,date,1,paperOpen?1:0);
}
function uniqueExpr(scopeType,scopeKey){
  return `CASE WHEN (
    SELECT first_event_id FROM site_analytics_visitors_v2
    WHERE scope_type='${scopeType}' AND scope_key=? AND ip_hash=?
  )=? THEN 1 ELSE 0 END`;
}

export async function materializeSitePageViewEvent(env,event){
  if(!siteAnalyticsMaterializedShadowEnabled(env)) return {enabled:false,materialized:false};
  if(!env?.DB) throw new Error('analytics_materialized_db_missing');
  const id=Number(event?.id||0);
  const ipHash=safe(event?.ip_hash,160);
  const date=safe(event?.beijing_date,20);
  const referrer=safe(event?.referrer_host,180);
  const device=safe(event?.device_type,20);
  const viewedAt=Number(event?.viewed_at||0);
  if(!Number.isInteger(id)||id<1||!ipHash||!/^\d{4}-\d{2}-\d{2}$/.test(date)
    ||!['desktop','mobile','tablet','other'].includes(device)||!Number.isFinite(viewedAt)||viewedAt<=0){
    throw new Error('analytics_materialized_event_invalid');
  }
  const exists=await env.DB.prepare(
    'SELECT event_id FROM site_analytics_materialized_events_v2 WHERE event_id=?'
  ).bind(id).first();
  if(exists) return {enabled:true,materialized:false,duplicate:true,eventId:id};

  const paperOpenRow=await env.DB.prepare(
    'SELECT 1 AS yes FROM paper_open_readers_v3 WHERE ip_hash=? LIMIT 1'
  ).bind(ipHash).first();
  const paperOpen=Boolean(paperOpenRow);
  const globalUnique=uniqueExpr('global','*');
  const dayUnique=uniqueExpr('day',date);
  const refDayKey=date+'\n'+referrer;
  const deviceDayKey=date+'\n'+device;
  const refUnique=uniqueExpr('referrer_day',refDayKey);
  const deviceUnique=uniqueExpr('device_day',deviceDayKey);
  const statements=[
    visitorStatement(env,{scopeType:'global',scopeKey:'*',eventId:id,ipHash,viewedAt,date,paperOpen}),
    visitorStatement(env,{scopeType:'day',scopeKey:date,eventId:id,ipHash,viewedAt,date,paperOpen}),
    visitorStatement(env,{scopeType:'referrer',scopeKey:referrer,eventId:id,ipHash,viewedAt,date,paperOpen}),
    visitorStatement(env,{scopeType:'device',scopeKey:device,eventId:id,ipHash,viewedAt,date,paperOpen}),
    visitorStatement(env,{scopeType:'referrer_day',scopeKey:refDayKey,eventId:id,ipHash,viewedAt,date,paperOpen}),
    visitorStatement(env,{scopeType:'device_day',scopeKey:deviceDayKey,eventId:id,ipHash,viewedAt,date,paperOpen}),
    env.DB.prepare(`
      INSERT INTO site_global_stats_v2(id,pv,uv,first_viewed_at,last_viewed_at,updated_at)
      VALUES(1,1,${globalUnique},?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        pv=site_global_stats_v2.pv+1,
        uv=site_global_stats_v2.uv+excluded.uv,
        first_viewed_at=MIN(site_global_stats_v2.first_viewed_at,excluded.first_viewed_at),
        last_viewed_at=MAX(site_global_stats_v2.last_viewed_at,excluded.last_viewed_at),
        updated_at=excluded.updated_at
    `).bind('*',ipHash,id,viewedAt,viewedAt,Date.now()),
    env.DB.prepare(`
      INSERT INTO site_daily_stats_v2(beijing_date,pv,uv,first_viewed_at,last_viewed_at,updated_at)
      VALUES(?,1,${dayUnique},?,?,?)
      ON CONFLICT(beijing_date) DO UPDATE SET
        pv=site_daily_stats_v2.pv+1,
        uv=site_daily_stats_v2.uv+excluded.uv,
        first_viewed_at=MIN(site_daily_stats_v2.first_viewed_at,excluded.first_viewed_at),
        last_viewed_at=MAX(site_daily_stats_v2.last_viewed_at,excluded.last_viewed_at),
        updated_at=excluded.updated_at
    `).bind(date,date,ipHash,id,viewedAt,viewedAt,Date.now()),
    env.DB.prepare(`
      INSERT INTO site_dimension_daily_stats_v2(dimension_type,beijing_date,dimension_value,pv,uv,updated_at)
      VALUES('referrer',?,?,1,${refUnique},?)
      ON CONFLICT(dimension_type,beijing_date,dimension_value) DO UPDATE SET
        pv=site_dimension_daily_stats_v2.pv+1,
        uv=site_dimension_daily_stats_v2.uv+excluded.uv,
        updated_at=excluded.updated_at
    `).bind(date,referrer,refDayKey,ipHash,id,Date.now()),
    env.DB.prepare(`
      INSERT INTO site_dimension_daily_stats_v2(dimension_type,beijing_date,dimension_value,pv,uv,updated_at)
      VALUES('device',?,?,1,${deviceUnique},?)
      ON CONFLICT(dimension_type,beijing_date,dimension_value) DO UPDATE SET
        pv=site_dimension_daily_stats_v2.pv+1,
        uv=site_dimension_daily_stats_v2.uv+excluded.uv,
        updated_at=excluded.updated_at
    `).bind(date,device,deviceDayKey,ipHash,id,Date.now()),
    env.DB.prepare(
      'INSERT INTO site_analytics_materialized_events_v2(event_id,materialized_at) VALUES(?,?)'
    ).bind(id,Date.now()),
  ];
  try{
    if(typeof env.DB.batch==='function') await env.DB.batch(statements);
    else for(const statement of statements) await statement.run();
  }catch(error){
    const concurrent=await env.DB.prepare(
      'SELECT event_id FROM site_analytics_materialized_events_v2 WHERE event_id=?'
    ).bind(id).first().catch(()=>null);
    if(concurrent) return {enabled:true,materialized:false,duplicate:true,eventId:id};
    throw error;
  }
  return {enabled:true,materialized:true,eventId:id,paperOpen};
}

export async function markMaterializedVisitorPaperOpen(env,ipHash,date){
  if(!siteAnalyticsMaterializedShadowEnabled(env)||!env?.DB||!ipHash) return {enabled:false};
  const scopes=[['global','*'],['day',date]];
  let updated=0;
  for(const [scopeType,scopeKey] of scopes){
    const result=await env.DB.prepare(`
      UPDATE site_analytics_visitors_v2
      SET paper_open=1
      WHERE scope_type=? AND scope_key=? AND ip_hash=? AND paper_open=0
    `).bind(scopeType,scopeKey,ipHash).run();
    updated+=Number(result?.meta?.changes||0);
  }
  return {enabled:true,updated};
}

async function reconcileMaterializedPaperOpenFlags(env){
  const result=await env.DB.prepare(`
    UPDATE site_analytics_visitors_v2
    SET paper_open=CASE WHEN EXISTS (
      SELECT 1 FROM paper_open_readers_v3 r
      WHERE r.ip_hash=site_analytics_visitors_v2.ip_hash
    ) THEN 1 ELSE 0 END
    WHERE scope_type IN ('global','day')
  `).run();
  return Number(result?.meta?.changes||0);
}

export async function backfillSiteAnalyticsMaterializedPage(env,limitValue=50){
  if(!siteAnalyticsMaterializedShadowEnabled(env)) return {status:409,body:{error:'site_analytics_materialized_shadow_disabled'}};
  if(!env?.DB) return {status:503,body:{error:'analytics_materialized_db_missing'}};
  const limit=Math.max(1,Math.min(100,Number(limitValue||50)));
  const now=Date.now();
  const state=await env.DB.prepare(`
    SELECT last_event_id,complete,scanned_events,materialized_events,duplicate_events,failed_events,
      started_at,updated_at,last_error
    FROM site_analytics_v2_backfill WHERE id=1
  `).first();
  const lastId=Number(state?.last_event_id||0);
  const page=await env.DB.prepare(`
    SELECT id,ip_hash,referrer_host,device_type,beijing_date,viewed_at
    FROM site_pageviews_v1 WHERE id>? ORDER BY id ASC LIMIT ?
  `).bind(lastId,limit).all();
  const rows=page?.results||[];
  let cursor=lastId,scanned=0,materialized=0,duplicates=0,failed=0,lastError='';
  for(const row of rows){
    try{
      const result=await materializeSitePageViewEvent(env,row);
      scanned+=1;cursor=Number(row.id);
      if(result.materialized) materialized+=1;
      if(result.duplicate) duplicates+=1;
    }catch(error){
      failed+=1;lastError=safe(error?.message||String(error),180);
      break;
    }
  }
  const maxRow=await env.DB.prepare('SELECT COALESCE(MAX(id),0) AS max_id FROM site_pageviews_v1').first();
  const maxId=Number(maxRow?.max_id||0);
  const complete=failed===0&&cursor>=maxId;
  const startedAt=Number(state?.started_at||0)||now;
  const totals={
    scanned:Number(state?.scanned_events||0)+scanned,
    materialized:Number(state?.materialized_events||0)+materialized,
    duplicates:Number(state?.duplicate_events||0)+duplicates,
    failed:Number(state?.failed_events||0)+failed,
  };
  const reconciledPaperOpenRows=complete?await reconcileMaterializedPaperOpenFlags(env):0;
  await env.DB.prepare(`
    INSERT INTO site_analytics_v2_backfill
      (id,last_event_id,complete,scanned_events,materialized_events,duplicate_events,failed_events,started_at,updated_at,last_error)
    VALUES(1,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      last_event_id=excluded.last_event_id,complete=excluded.complete,scanned_events=excluded.scanned_events,
      materialized_events=excluded.materialized_events,duplicate_events=excluded.duplicate_events,
      failed_events=excluded.failed_events,started_at=site_analytics_v2_backfill.started_at,
      updated_at=excluded.updated_at,last_error=excluded.last_error
  `).bind(
    cursor,complete?1:0,totals.scanned,totals.materialized,totals.duplicates,totals.failed,
    startedAt,now,complete?'':lastError,
  ).run();
  if(failed) return {status:502,body:{error:'site_analytics_materialized_backfill_failed',lastEventId:cursor,lastError}};
  return {status:200,body:{
    ok:true,enabled:true,complete,lastEventId:cursor,rawMaxEventId:maxId,
    pageEvents:scanned,pageMaterialized:materialized,pageDuplicates:duplicates,
    reconciledPaperOpenRows,...totals,
  }};
}

export async function getSiteAnalyticsMaterializedStatus(env){
  if(!env?.DB) return {status:503,body:{error:'analytics_materialized_db_missing'}};
  const [raw,events,global,backfill]=await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS count,COALESCE(MAX(id),0) AS max_id FROM site_pageviews_v1').first(),
    env.DB.prepare('SELECT COUNT(*) AS count,COALESCE(MAX(event_id),0) AS max_id FROM site_analytics_materialized_events_v2').first(),
    env.DB.prepare('SELECT pv,uv,first_viewed_at,last_viewed_at FROM site_global_stats_v2 WHERE id=1').first(),
    env.DB.prepare(`
      SELECT last_event_id,complete,scanned_events,materialized_events,duplicate_events,failed_events,started_at,updated_at,last_error
      FROM site_analytics_v2_backfill WHERE id=1
    `).first(),
  ]);
  const rawEvents=Number(raw?.count||0);
  const materializedEvents=Number(events?.count||0);
  const rawMaxEventId=Number(raw?.max_id||0);
  const materializedMaxEventId=Number(events?.max_id||0);
  const ready=siteAnalyticsMaterializedShadowEnabled(env)
    &&siteAnalyticsMaterializedReadEnabled(env)
    &&Number(backfill?.complete||0)===1
    &&safe(backfill?.last_error,180)===''
    &&rawEvents===materializedEvents
    &&rawMaxEventId===materializedMaxEventId
    &&Number(backfill?.last_event_id||0)===rawMaxEventId
    &&Number(global?.pv||0)===rawEvents;
  return {status:200,body:{
    version:SHADOW_VERSION,
    enabled:siteAnalyticsMaterializedShadowEnabled(env),
    readConfigured:siteAnalyticsMaterializedReadEnabled(env),
    readPathActive:ready,
    rawEvents,rawMaxEventId,materializedEvents,materializedMaxEventId,
    globalPv:Number(global?.pv||0),globalUv:Number(global?.uv||0),
    backfill:backfill?{
      complete:Number(backfill.complete||0)===1,lastEventId:Number(backfill.last_event_id||0),
      scannedEvents:Number(backfill.scanned_events||0),materializedEvents:Number(backfill.materialized_events||0),
      duplicateEvents:Number(backfill.duplicate_events||0),failedEvents:Number(backfill.failed_events||0),
      startedAt:Number(backfill.started_at||0),updatedAt:Number(backfill.updated_at||0),lastError:safe(backfill.last_error,180),
    }:{complete:false,lastEventId:0,scannedEvents:0,materializedEvents:0,duplicateEvents:0,failedEvents:0,startedAt:0,updatedAt:0,lastError:''},
  }};
}

export async function getSiteAnalyticsMaterializedReadiness(env){
  if(!env?.DB) return {ready:false,reason:'analytics_materialized_db_missing'};
  if(!siteAnalyticsMaterializedShadowEnabled(env)) return {ready:false,reason:'analytics_materialized_shadow_disabled'};
  if(!siteAnalyticsMaterializedReadEnabled(env)) return {ready:false,reason:'analytics_materialized_read_disabled'};
  const [rawLast,materializedLast,global,backfill]=await Promise.all([
    env.DB.prepare('SELECT id,viewed_at FROM site_pageviews_v1 ORDER BY id DESC LIMIT 1').first(),
    env.DB.prepare('SELECT event_id FROM site_analytics_materialized_events_v2 ORDER BY event_id DESC LIMIT 1').first(),
    env.DB.prepare('SELECT pv,last_viewed_at FROM site_global_stats_v2 WHERE id=1').first(),
    env.DB.prepare('SELECT last_event_id,complete,scanned_events,materialized_events,duplicate_events,failed_events,last_error FROM site_analytics_v2_backfill WHERE id=1').first(),
  ]);
  const rawMax=Number(rawLast?.id||0);
  const materializedMax=Number(materializedLast?.event_id||0);
  const rawLastViewedAt=Number(rawLast?.viewed_at||0);
  const globalLastViewedAt=Number(global?.last_viewed_at||0);
  const lastEventId=Number(backfill?.last_event_id||0);
  const scannedEvents=Number(backfill?.scanned_events||0);
  const materializedEvents=Number(backfill?.materialized_events||0);
  const duplicateEvents=Number(backfill?.duplicate_events||0);
  const failedEvents=Number(backfill?.failed_events||0);
  const lastError=safe(backfill?.last_error,180);
  const backfillComplete=Number(backfill?.complete||0)===1;
  const globalPv=Number(global?.pv||0);
  const snapshotSourceReady=lastError===''
    &&materializedMax===lastEventId
    &&materializedEvents+duplicateEvents===scannedEvents
    &&globalPv===scannedEvents
    &&materializedMax<=rawMax
    &&globalLastViewedAt<=rawLastViewedAt;
  const ready=snapshotSourceReady
    &&backfillComplete
    &&rawMax===materializedMax
    &&lastEventId===rawMax
    &&globalLastViewedAt===rawLastViewedAt;
  return {
    ready,
    snapshotSourceReady,
    reason:ready?'ready':snapshotSourceReady?'analytics_materialized_realtime_lag':'analytics_materialized_not_fresh',
    backfillComplete,
    rawMaxEventId:rawMax,
    materializedMaxEventId:materializedMax,
    backfillLastEventId:lastEventId,
    rawLastViewedAt,
    globalLastViewedAt,
    lagEvents:Math.max(0,rawMax-materializedMax),
    lagMs:Math.max(0,rawLastViewedAt-globalLastViewedAt),
    pendingRawEvents:Math.max(0,rawMax-lastEventId),
    globalPv,
    scannedEvents,materializedEvents,duplicateEvents,failedEvents,lastError,
  };
}

async function advanceRealtimeWatermark(env,eventId){
  await env.DB.prepare(`
    UPDATE site_analytics_v2_backfill
    SET last_event_id=MAX(last_event_id,?),
      scanned_events=scanned_events+1,
      materialized_events=materialized_events+1,
      updated_at=?,
      last_error=''
    WHERE id=1 AND complete=1
  `).bind(eventId,Date.now()).run();
}

export async function markSiteAnalyticsMaterializedUnhealthy(env,error,eventId=0){
  if(!env?.DB) return;
  const boundedEventId=Math.max(0,Number(eventId||0));
  const now=Date.now();
  await env.DB.prepare(`
    INSERT INTO site_analytics_v2_backfill
      (id,last_event_id,complete,scanned_events,materialized_events,duplicate_events,failed_events,started_at,updated_at,last_error)
    VALUES(1,0,0,0,0,0,1,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      complete=0,
      last_event_id=CASE
        WHEN ?>0 THEN MIN(site_analytics_v2_backfill.last_event_id,?-1)
        ELSE site_analytics_v2_backfill.last_event_id END,
      failed_events=site_analytics_v2_backfill.failed_events+1,
      updated_at=excluded.updated_at,
      last_error=excluded.last_error
  `).bind(now,now,safe(error?.message||String(error),180),boundedEventId,boundedEventId).run();
}


export async function materializeSitePageViewForActiveRead(env,event){
  try{
    const result=await materializeSitePageViewEvent(env,event);
    if(result?.materialized) await advanceRealtimeWatermark(env,Number(event?.id||0));
    return result;
  }catch(error){
    try{await markSiteAnalyticsMaterializedUnhealthy(env,error,Number(event?.id||0));}catch{}
    throw error;
  }
}

export async function materializedSiteAnalyticsStats(env,now=Date.now()){
  if(!env?.DB) return {status:503,body:{error:'analytics_materialized_db_missing'}};
  const today=beijingDate(now),start30=dateDaysAgoBeijing(29,now);
  const [global,todayRow,dailyRows,globalOpen,todayOpen,refPv,refUv,devicePv,deviceUv]=await Promise.all([
    env.DB.prepare('SELECT pv,uv,first_viewed_at,last_viewed_at FROM site_global_stats_v2 WHERE id=1').first(),
    env.DB.prepare('SELECT pv,uv,first_viewed_at,last_viewed_at FROM site_daily_stats_v2 WHERE beijing_date=?').bind(today).first(),
    env.DB.prepare(`
      SELECT beijing_date,pv,uv FROM site_daily_stats_v2 WHERE beijing_date>=? ORDER BY beijing_date ASC
    `).bind(start30).all(),
    env.DB.prepare(`
      SELECT COUNT(*) AS count FROM site_analytics_visitors_v2
      WHERE scope_type='global' AND scope_key='*' AND paper_open=1
    `).first(),
    env.DB.prepare(`
      SELECT COUNT(*) AS count FROM site_analytics_visitors_v2
      WHERE scope_type='day' AND scope_key=? AND paper_open=1
    `).bind(today).first(),
    env.DB.prepare(`
      SELECT dimension_value,SUM(pv) AS pv
      FROM site_dimension_daily_stats_v2
      WHERE dimension_type='referrer' AND beijing_date>=?
      GROUP BY dimension_value
    `).bind(start30).all(),
    env.DB.prepare(`
      SELECT scope_key,COUNT(*) AS uv FROM site_analytics_visitors_v2
      WHERE scope_type='referrer' AND last_seen_date>=?
      GROUP BY scope_key
    `).bind(start30).all(),
    env.DB.prepare(`
      SELECT dimension_value,SUM(pv) AS pv
      FROM site_dimension_daily_stats_v2
      WHERE dimension_type='device' AND beijing_date>=?
      GROUP BY dimension_value
    `).bind(start30).all(),
    env.DB.prepare(`
      SELECT scope_key,COUNT(*) AS uv FROM site_analytics_visitors_v2
      WHERE scope_type='device' AND last_seen_date>=?
      GROUP BY scope_key
    `).bind(start30).all(),
  ]);
  const trend30=fillDailyTrend(dailyRows?.results||[],30,now);
  const combine=(pvRows,uvRows,labelKey,presentKey)=>{
    const map=new Map();
    for(const row of pvRows?.results||[]) map.set(String(row.dimension_value||''),{pv:Number(row.pv||0),uv:0});
    for(const row of uvRows?.results||[]){
      const key=String(row.scope_key||'');const value=map.get(key)||{pv:0,uv:0};value.uv=Number(row.uv||0);map.set(key,value);
    }
    return [...map.entries()].map(([key,value])=>({[labelKey]:presentKey(key),pv:Math.max(0,value.pv),uv:Math.max(0,value.uv)}))
      .sort((a,b)=>b.pv-a.pv||b.uv-a.uv||String(a[labelKey]).localeCompare(String(b[labelKey]))).slice(0,20);
  };
  const allUv=Math.max(0,Number(global?.uv||0)),todayUv=Math.max(0,Number(todayRow?.uv||0));
  const allOpen=Math.max(0,Number(globalOpen?.count||0)),todayOpenN=Math.max(0,Number(todayOpen?.count||0));
  return {status:200,body:{
    generation:'site-pageview-v2',timeZone:'Asia/Shanghai',
    trackingStartedAt:Number(global?.first_viewed_at||0)||null,lastPageViewAt:Number(global?.last_viewed_at||0)||null,
    allTime:{pv:Math.max(0,Number(global?.pv||0)),uv:allUv,visitorsWithPaperOpen:allOpen,visitorsWithoutPaperOpen:Math.max(0,allUv-allOpen)},
    today:{date:today,pv:Math.max(0,Number(todayRow?.pv||0)),uv:todayUv,visitorsWithPaperOpen:todayOpenN,visitorsWithoutPaperOpen:Math.max(0,todayUv-todayOpenN)},
    last7Days:trend30.slice(-7),last30Days:trend30,
    topReferrers30Days:combine(refPv,refUv,'source',key=>key||'(direct)'),
    devices30Days:combine(devicePv,deviceUv,'device',key=>key||'other'),
    definitions:{
      pv:'One successfully recorded real browser page load.',
      uv:'Distinct salted CF-Connecting-IP hashes.',
      visitorsWithoutPaperOpen:'Site UVs whose IP hash has no paper_open_readers_v3 record.',
      privacy:'Raw IP addresses are never stored; referrers are reduced to hostname only and query strings are not stored.',
    },
  }};
}

function comparableBody(body){
  return {
    timeZone:body?.timeZone,trackingStartedAt:body?.trackingStartedAt??null,lastPageViewAt:body?.lastPageViewAt??null,
    allTime:body?.allTime||{},today:body?.today||{},last7Days:body?.last7Days||[],last30Days:body?.last30Days||[],
    topReferrers30Days:body?.topReferrers30Days||[],devices30Days:body?.devices30Days||[],
  };
}
export function compareSiteAnalyticsBodies(legacy,materialized){
  const left=JSON.stringify(comparableBody(legacy));
  const right=JSON.stringify(comparableBody(materialized));
  return {same:left===right,legacy:comparableBody(legacy),materialized:comparableBody(materialized)};
}
